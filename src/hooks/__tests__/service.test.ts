/**
 * Unit Tests for MemoryHookService
 *
 * @module @agentkits/memory/hooks/__tests__/service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { MemoryHookService, createHookService } from '../service.js';
import { _setRunClaudePrintMockForTesting, resetAIEnrichmentCache } from '../ai-enrichment.js';
import { computeContentHash } from '../types.js';

const TEST_DIR = path.join(process.cwd(), '.test-memory-hooks');

describe('MemoryHookService', () => {
  let service: MemoryHookService;

  beforeEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });

    service = new MemoryHookService(TEST_DIR);
  });

  afterEach(async () => {
    // Shutdown service
    try {
      await service.shutdown();
    } catch {
      // Ignore shutdown errors
    }

    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await service.initialize();

      // Database file is created after persist() call
      // Initialize just creates the in-memory database
      // Let's verify by adding some data and persisting
      await service.initSession('test', 'test-project');

      const dbPath = path.join(TEST_DIR, '.claude/memory', 'memory.db');
      expect(existsSync(dbPath)).toBe(true);
    });

    it('should be idempotent', async () => {
      await service.initialize();
      await service.initialize(); // Should not throw
    });

    it('should create memory directory if not exists', async () => {
      const memDir = path.join(TEST_DIR, '.claude/memory');
      expect(existsSync(memDir)).toBe(false);

      await service.initialize();

      expect(existsSync(memDir)).toBe(true);
    });
  });

  describe('session management', () => {
    it('should initialize a new session', async () => {
      const session = await service.initSession('session-1', 'test-project', 'Hello Claude');

      expect(session.sessionId).toBe('session-1');
      expect(session.project).toBe('test-project');
      expect(session.prompt).toBe('Hello Claude');
      expect(session.status).toBe('active');
      expect(session.observationCount).toBe(0);
    });

    it('should return existing session on re-init', async () => {
      const session1 = await service.initSession('session-1', 'test-project', 'First prompt');
      const session2 = await service.initSession('session-1', 'test-project', 'Second prompt');

      expect(session1.sessionId).toBe(session2.sessionId);
      expect(session1.prompt).toBe('First prompt'); // Original prompt preserved
    });

    it('should get session by ID', async () => {
      await service.initSession('session-1', 'test-project', 'Test prompt');

      const session = service.getSession('session-1');

      expect(session).not.toBeNull();
      expect(session?.sessionId).toBe('session-1');
      expect(session?.project).toBe('test-project');
    });

    it('should return null for non-existent session', async () => {
      await service.initialize();

      const session = service.getSession('non-existent');

      expect(session).toBeNull();
    });

    it('should complete a session with summary', async () => {
      await service.initSession('session-1', 'test-project');
      await service.completeSession('session-1', 'Task completed successfully');

      const session = service.getSession('session-1');

      expect(session?.status).toBe('completed');
      expect(session?.summary).toBe('Task completed successfully');
      expect(session?.endedAt).toBeGreaterThan(0);
    });

    it('should get recent sessions', async () => {
      await service.initSession('session-1', 'test-project', 'First');
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      await service.initSession('session-2', 'test-project', 'Second');
      await service.initSession('session-3', 'other-project', 'Third');

      const sessions = await service.getRecentSessions('test-project', 10);

      expect(sessions.length).toBe(2);
      expect(sessions[0].sessionId).toBe('session-2'); // Most recent first
      expect(sessions[1].sessionId).toBe('session-1');
    });

    it('should limit recent sessions', async () => {
      await service.initSession('session-1', 'test-project');
      await service.initSession('session-2', 'test-project');
      await service.initSession('session-3', 'test-project');

      const sessions = await service.getRecentSessions('test-project', 2);

      expect(sessions.length).toBe(2);
    });
  });

  describe('observation management', () => {
    it('should store an observation', async () => {
      await service.initSession('session-1', 'test-project');

      const observation = await service.storeObservation(
        'session-1',
        'test-project',
        'Read',
        { file_path: '/path/to/file.ts' },
        { content: 'file contents' },
        TEST_DIR
      );

      expect(observation.id).toMatch(/^obs_/);
      expect(observation.sessionId).toBe('session-1');
      expect(observation.project).toBe('test-project');
      expect(observation.toolName).toBe('Read');
      expect(observation.type).toBe('read');
      expect(observation.title).toBe('Read /path/to/file.ts');
    });

    it('should increment session observation count', async () => {
      await service.initSession('session-1', 'test-project');

      await service.storeObservation('session-1', 'test-project', 'Read', {}, {}, TEST_DIR);
      await service.storeObservation('session-1', 'test-project', 'Write', {}, {}, TEST_DIR);

      const session = service.getSession('session-1');

      expect(session?.observationCount).toBe(2);
    });

    it('should get session observations', async () => {
      await service.initSession('session-1', 'test-project');
      await service.storeObservation('session-1', 'test-project', 'Read', { file_path: 'a.ts' }, {}, TEST_DIR);
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      await service.storeObservation('session-1', 'test-project', 'Write', { file_path: 'b.ts' }, {}, TEST_DIR);

      const observations = await service.getSessionObservations('session-1');

      expect(observations.length).toBe(2);
      // Most recent first
      expect(observations[0].toolName).toBe('Write');
      expect(observations[1].toolName).toBe('Read');
    });

    it('should get recent observations for project', async () => {
      await service.initSession('session-1', 'test-project');
      await service.initSession('session-2', 'test-project');

      await service.storeObservation('session-1', 'test-project', 'Read', {}, {}, TEST_DIR);
      await service.storeObservation('session-2', 'test-project', 'Write', {}, {}, TEST_DIR);

      const observations = await service.getRecentObservations('test-project', 10);

      expect(observations.length).toBe(2);
    });

    it('should truncate large responses', async () => {
      await service.initSession('session-1', 'test-project');

      const largeResponse = { content: 'A'.repeat(10000) };
      const observation = await service.storeObservation(
        'session-1',
        'test-project',
        'Read',
        {},
        largeResponse,
        TEST_DIR
      );

      expect(observation.toolResponse.length).toBeLessThan(10000);
      expect(observation.toolResponse).toContain('[truncated]');
    });

    it('should handle null/undefined tool input and response', async () => {
      await service.initSession('session-1', 'test-project');

      // Pass null values - should use empty object fallback
      const observation = await service.storeObservation(
        'session-1',
        'test-project',
        'Read',
        null,
        undefined,
        TEST_DIR
      );

      expect(observation.toolInput).toBe('{}');
      expect(observation.toolResponse).toBe('{}');
    });
  });

  describe('context generation', () => {
    it('should get context for project', async () => {
      await service.initSession('session-1', 'test-project', 'First task');
      await service.storeObservation('session-1', 'test-project', 'Read', { file_path: 'file.ts' }, {}, TEST_DIR);
      await service.completeSession('session-1', 'Completed first task');

      const context = await service.getContext('test-project');

      expect(context.recentObservations.length).toBe(1);
      expect(context.previousSessions.length).toBe(1);
      expect(context.markdown).toContain('# Memory Context');
      expect(context.markdown).toContain('test-project');
    });

    it('should include tool-usage instructions in context header', async () => {
      await service.initSession('session-1', 'test-project', 'Test');
      await service.storeObservation('session-1', 'test-project', 'Read', {}, {}, TEST_DIR);

      const context = await service.getContext('test-project');

      expect(context.markdown).toContain('Memory tools available');
      expect(context.markdown).toContain('memory_search');
      expect(context.markdown).toContain('memory_timeline');
      expect(context.markdown).toContain('memory_details');
      expect(context.markdown).toContain('memory_save');
      expect(context.markdown).toContain('memory_recall');
      expect(context.markdown).toContain('memory_delete');
      expect(context.markdown).toContain('memory_update');
    });

    it('should include observation IDs in context', async () => {
      await service.initSession('session-1', 'test-project');
      await service.storeObservation('session-1', 'test-project', 'Read', { file_path: 'file.ts' }, {}, TEST_DIR);

      const context = await service.getContext('test-project');
      const obs = context.recentObservations[0];

      // Observation ID should appear in markdown (format: [obs_xxxx_yyyy])
      expect(context.markdown).toContain(`[${obs.id}]`);
    });

    it('should include token economics footer when context exists', async () => {
      await service.initSession('session-1', 'test-project', 'Test');
      await service.storeObservation('session-1', 'test-project', 'Read', {}, {}, TEST_DIR);
      await service.completeSession('session-1', 'Done');

      const context = await service.getContext('test-project');

      expect(context.markdown).toContain('tokens shown');
      expect(context.markdown).toContain('tokens available');
      expect(context.markdown).toContain('memory_search');
      expect(context.markdown).toContain('memory_details');
    });

    it('should include all observation type icons in context', async () => {
      await service.initSession('session-1', 'test-project');

      // Store observations of different types to test icon coverage
      await service.storeObservation('session-1', 'test-project', 'Read', {}, {}, TEST_DIR);   // read icon
      await service.storeObservation('session-1', 'test-project', 'Write', {}, {}, TEST_DIR);  // write icon
      await service.storeObservation('session-1', 'test-project', 'Bash', {}, {}, TEST_DIR);   // execute icon
      await service.storeObservation('session-1', 'test-project', 'WebSearch', {}, {}, TEST_DIR); // search icon
      await service.storeObservation('session-1', 'test-project', 'Unknown', {}, {}, TEST_DIR);   // default icon

      const context = await service.getContext('test-project');

      // Verify icons are in the markdown
      expect(context.markdown).toContain('📖'); // read
      expect(context.markdown).toContain('✏️'); // write
      expect(context.markdown).toContain('⚡'); // execute
      expect(context.markdown).toContain('🔍'); // search
      expect(context.markdown).toContain('•');  // default/other
    });

    it('should return empty context for new project', async () => {
      await service.initialize();

      const context = await service.getContext('new-project');

      expect(context.recentObservations.length).toBe(0);
      expect(context.previousSessions.length).toBe(0);
      expect(context.markdown).toContain('No previous session context');
    });

    it('should format relative times correctly in context', async () => {
      const baseTime = Date.now();

      // Create session with observations at different times
      await service.initSession('session-time', 'test-project');

      // Store an observation
      await service.storeObservation('session-time', 'test-project', 'Read', {}, {}, TEST_DIR);

      // Mock Date.now to simulate time passing
      const originalDateNow = Date.now;

      // Test "just now" (less than 1 minute)
      vi.spyOn(Date, 'now').mockReturnValue(baseTime + 30000); // 30 seconds later
      let context = await service.getContext('test-project');
      expect(context.markdown).toContain('just now');

      // Test "Xm ago" (minutes)
      vi.spyOn(Date, 'now').mockReturnValue(baseTime + 5 * 60000); // 5 minutes later
      context = await service.getContext('test-project');
      expect(context.markdown).toMatch(/\dm ago/);

      // Test "Xh ago" (hours)
      vi.spyOn(Date, 'now').mockReturnValue(baseTime + 3 * 3600000); // 3 hours later
      context = await service.getContext('test-project');
      expect(context.markdown).toMatch(/\dh ago/);

      // Test "Xd ago" (days)
      vi.spyOn(Date, 'now').mockReturnValue(baseTime + 3 * 86400000); // 3 days later
      context = await service.getContext('test-project');
      expect(context.markdown).toMatch(/\dd ago/);

      // Test date format (more than 7 days)
      vi.spyOn(Date, 'now').mockReturnValue(baseTime + 10 * 86400000); // 10 days later
      context = await service.getContext('test-project');
      // Should contain a date format like "1/20/2026" or similar
      expect(context.markdown).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);

      // Restore
      vi.restoreAllMocks();
    });

    it('should format context as markdown', async () => {
      await service.initSession('session-1', 'test-project', 'Test prompt');
      await service.storeObservation('session-1', 'test-project', 'Read', { file_path: 'file.ts' }, {}, TEST_DIR);
      await service.completeSession('session-1', 'Done');

      const context = await service.getContext('test-project');

      expect(context.markdown).toContain('## Recent Activity');
      expect(context.markdown).toContain('## Previous Sessions');
      expect(context.markdown).toContain('Read');
    });

    it('should truncate long prompts in session context', async () => {
      const longPrompt = 'A'.repeat(150); // More than 100 characters
      await service.initSession('session-1', 'test-project', longPrompt);
      await service.completeSession('session-1', 'Done');

      const context = await service.getContext('test-project');

      // Should contain truncated prompt with ellipsis
      expect(context.markdown).toContain('A'.repeat(100));
      expect(context.markdown).toContain('...');
    });

    it('should show active session status', async () => {
      // Create an active session (not completed)
      await service.initSession('session-active', 'test-project', 'Active task');

      const context = await service.getContext('test-project');

      // Active sessions should show → instead of ✓
      expect(context.markdown).toContain('→');
    });

    it('should handle observations without title', async () => {
      await service.initSession('session-1', 'test-project');

      // Store an observation - the service will generate a title
      await service.storeObservation('session-1', 'test-project', 'CustomTool', {}, {}, TEST_DIR);

      const context = await service.getContext('test-project');

      // Should not error and should include the tool name
      expect(context.markdown).toContain('CustomTool');
    });
  });

  describe('summary generation', () => {
    it('should generate summary from observations', async () => {
      await service.initSession('session-1', 'test-project');
      await service.storeObservation('session-1', 'test-project', 'Read', { file_path: 'a.ts' }, {}, TEST_DIR);
      await service.storeObservation('session-1', 'test-project', 'Read', { file_path: 'b.ts' }, {}, TEST_DIR);
      await service.storeObservation('session-1', 'test-project', 'Write', { file_path: 'c.ts' }, {}, TEST_DIR);
      await service.storeObservation('session-1', 'test-project', 'Bash', { command: 'npm test' }, {}, TEST_DIR);

      const summary = await service.generateSummary('session-1');

      expect(summary).toContain('file(s) modified');
      expect(summary).toContain('file(s) read');
      expect(summary).toContain('command(s) executed');
    });

    it('should return default summary for empty session', async () => {
      await service.initSession('session-1', 'test-project');

      const summary = await service.generateSummary('session-1');

      expect(summary).toContain('No activity recorded');
    });

    it('should list files in summary', async () => {
      await service.initSession('session-1', 'test-project');
      await service.storeObservation('session-1', 'test-project', 'Write', { file_path: 'src/index.ts' }, {}, TEST_DIR);
      await service.storeObservation('session-1', 'test-project', 'Write', { file_path: 'src/utils.ts' }, {}, TEST_DIR);

      const summary = await service.generateSummary('session-1');

      expect(summary).toContain('src/index.ts');
      expect(summary).toContain('src/utils.ts');
    });

    it('should include search count in summary', async () => {
      await service.initSession('session-1', 'test-project');
      await service.storeObservation('session-1', 'test-project', 'WebSearch', { query: 'test' }, {}, TEST_DIR);
      await service.storeObservation('session-1', 'test-project', 'WebFetch', { url: 'http://test.com' }, {}, TEST_DIR);

      const summary = await service.generateSummary('session-1');

      expect(summary).toContain('search(es)');
    });

    it('should show file count when more than 5 files touched', async () => {
      await service.initSession('session-1', 'test-project');

      // Touch more than 5 files
      for (let i = 0; i < 7; i++) {
        await service.storeObservation('session-1', 'test-project', 'Write', { file_path: `file${i}.ts` }, {}, TEST_DIR);
      }

      const summary = await service.generateSummary('session-1');

      expect(summary).toContain('7 file(s) modified');
    });
  });

  describe('enrichObservation', () => {
    const originalEnv = process.env.AGENTKITS_AI_ENRICHMENT;

    beforeEach(() => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      resetAIEnrichmentCache();
    });

    afterEach(() => {
      _setRunClaudePrintMockForTesting(null);
      resetAIEnrichmentCache();
      if (originalEnv === undefined) {
        delete process.env.AGENTKITS_AI_ENRICHMENT;
      } else {
        process.env.AGENTKITS_AI_ENRICHMENT = originalEnv;
      }
    });

    it('should enrich an existing observation with AI data', async () => {
      await service.initSession('session-1', 'test-project');
      const obs = await service.storeObservation(
        'session-1', 'test-project', 'Read',
        { file_path: 'auth.ts' }, { content: 'export class Auth {}' }, TEST_DIR
      );

      // Reset cache and set up mock AI enrichment
      resetAIEnrichmentCache();
      const validResponse = JSON.stringify({
        subtitle: 'Examining auth module',
        narrative: 'Read the auth module to understand login flow.',
        facts: ['File has 200 lines', 'Uses JWT tokens'],
        concepts: ['authentication', 'jwt'],
      });
      _setRunClaudePrintMockForTesting(() => validResponse);

      const result = await service.enrichObservation(obs.id);
      expect(result).toBe(true);

      // Verify the observation was updated in DB
      const observations = await service.getSessionObservations('session-1');
      expect(observations[0].subtitle).toBe('Examining auth module');
      expect(observations[0].narrative).toBe('Read the auth module to understand login flow.');
      expect(observations[0].facts).toContain('File has 200 lines');
      expect(observations[0].concepts).toContain('jwt');
    });

    it('should return false for non-existent observation', async () => {
      await service.initialize();
      const result = await service.enrichObservation('obs_nonexistent_0000');
      expect(result).toBe(false);
    });

    it('should return false when AI enrichment returns null', async () => {
      await service.initSession('session-1', 'test-project');
      const obs = await service.storeObservation(
        'session-1', 'test-project', 'Read', {}, {}, TEST_DIR
      );

      // Mock CLI that returns invalid response
      _setRunClaudePrintMockForTesting(() => 'not valid json');

      const result = await service.enrichObservation(obs.id);
      expect(result).toBe(false);

      // Original template data should still be intact
      const observations = await service.getSessionObservations('session-1');
      expect(observations[0].subtitle).toBeDefined();
      expect(observations[0].subtitle.length).toBeGreaterThan(0);
    });

    it('should return false when AI enrichment throws', async () => {
      await service.initSession('session-1', 'test-project');
      const obs = await service.storeObservation(
        'session-1', 'test-project', 'Read', {}, {}, TEST_DIR
      );

      // Mock CLI that throws
      _setRunClaudePrintMockForTesting(() => { throw new Error('CLI error'); });

      const result = await service.enrichObservation(obs.id);
      expect(result).toBe(false);
    });

    it('should preserve template data when enrichment is disabled', async () => {
      await service.initSession('session-1', 'test-project');
      const obs = await service.storeObservation(
        'session-1', 'test-project', 'Read',
        { file_path: 'src/index.ts' }, { content: 'hello' }, TEST_DIR
      );

      // Template data should be present immediately
      expect(obs.subtitle).toBeDefined();
      expect(obs.subtitle.length).toBeGreaterThan(0);
      expect(obs.narrative).toBeDefined();
      expect(obs.narrative.length).toBeGreaterThan(0);
    });
  });

  describe('persistence', () => {
    it('should auto-recreate database if deleted', async () => {
      // Create and populate first instance
      await service.initSession('session-1', 'test-project', 'Test prompt');
      await service.storeObservation('session-1', 'test-project', 'Read', { file_path: 'file.ts' }, {}, TEST_DIR);
      await service.shutdown();

      // Delete the database file
      const dbPath = path.join(TEST_DIR, '.claude/memory', 'memory.db');
      expect(existsSync(dbPath)).toBe(true);
      rmSync(dbPath);
      expect(existsSync(dbPath)).toBe(false);

      // Create new instance - should auto-create new database
      const service2 = new MemoryHookService(TEST_DIR);
      await service2.initialize();

      // Old data should be gone
      const session = service2.getSession('session-1');
      expect(session).toBeNull();

      // But we can create new data
      await service2.initSession('session-2', 'test-project', 'New prompt');
      const newSession = service2.getSession('session-2');
      expect(newSession).not.toBeNull();
      expect(newSession?.prompt).toBe('New prompt');

      // Database file should exist again
      await service2.shutdown();
      expect(existsSync(dbPath)).toBe(true);
    });

    it('should persist data across service restarts', async () => {
      // Create and populate first instance
      await service.initSession('session-1', 'test-project', 'Test prompt');
      await service.storeObservation('session-1', 'test-project', 'Read', { file_path: 'file.ts' }, {}, TEST_DIR);
      await service.shutdown();

      // Create second instance
      const service2 = new MemoryHookService(TEST_DIR);
      await service2.initialize();

      const session = service2.getSession('session-1');
      const observations = await service2.getSessionObservations('session-1');

      expect(session).not.toBeNull();
      expect(session?.prompt).toBe('Test prompt');
      expect(observations.length).toBe(1);

      await service2.shutdown();
    });
  });

  describe('content hash deduplication', () => {
    it('should deduplicate identical prompts within 5-minute window', async () => {
      await service.initSession('session-1', 'test-project');

      const prompt1 = await service.saveUserPrompt('session-1', 'test-project', 'Hello Claude');
      const prompt2 = await service.saveUserPrompt('session-1', 'test-project', 'Hello Claude');

      // Should return the same prompt (dedup)
      expect(prompt1.id).toBe(prompt2.id);
      expect(prompt1.contentHash).toBeDefined();
      expect(prompt2.contentHash).toBe(prompt1.contentHash);
    });

    it('should allow different prompts in same session', async () => {
      await service.initSession('session-1', 'test-project');

      const prompt1 = await service.saveUserPrompt('session-1', 'test-project', 'First prompt');
      const prompt2 = await service.saveUserPrompt('session-1', 'test-project', 'Second prompt');

      expect(prompt1.id).not.toBe(prompt2.id);
      expect(prompt1.promptNumber).toBe(1);
      expect(prompt2.promptNumber).toBe(2);
    });

    it('should deduplicate identical observations within 60-second window', async () => {
      await service.initSession('session-1', 'test-project');

      const obs1 = await service.storeObservation(
        'session-1', 'test-project', 'Read', { file_path: 'test.ts' }, {}, TEST_DIR
      );
      const obs2 = await service.storeObservation(
        'session-1', 'test-project', 'Read', { file_path: 'test.ts' }, {}, TEST_DIR
      );

      // Should return the same observation (dedup)
      expect(obs1.id).toBe(obs2.id);

      // Session count should only increment once
      const session = service.getSession('session-1');
      expect(session?.observationCount).toBe(1);
    });

    it('should allow same tool on different files', async () => {
      await service.initSession('session-1', 'test-project');

      const obs1 = await service.storeObservation(
        'session-1', 'test-project', 'Read', { file_path: 'a.ts' }, {}, TEST_DIR
      );
      const obs2 = await service.storeObservation(
        'session-1', 'test-project', 'Read', { file_path: 'b.ts' }, {}, TEST_DIR
      );

      expect(obs1.id).not.toBe(obs2.id);
    });
  });

  describe('session resume detection', () => {
    it('should link new session to recent parent in same project', async () => {
      // Create first session
      await service.initSession('session-old', 'test-project');

      // Create second session shortly after
      const session2 = await service.initSession('session-new', 'test-project');

      expect(session2.parentSessionId).toBe('session-old');
    });

    it('should not link sessions from different projects', async () => {
      await service.initSession('session-1', 'project-a');
      const session2 = await service.initSession('session-2', 'project-b');

      expect(session2.parentSessionId).toBeUndefined();
    });

    it('should return existing session on re-init (no duplicate parent)', async () => {
      await service.initSession('session-1', 'test-project');
      const first = await service.initSession('session-2', 'test-project');
      const second = await service.initSession('session-2', 'test-project');

      // Re-init returns the same session
      expect(first.sessionId).toBe(second.sessionId);
      expect(first.parentSessionId).toBe(second.parentSessionId);
    });
  });

  describe('context XML wrapper', () => {
    it('should wrap context in agentkits-memory-context tags', async () => {
      await service.initSession('session-1', 'test-project', 'Test');
      await service.storeObservation('session-1', 'test-project', 'Read', {}, {}, TEST_DIR);

      const context = await service.getContext('test-project');

      expect(context.markdown).toContain('<agentkits-memory-context>');
      expect(context.markdown).toContain('</agentkits-memory-context>');
      expect(context.markdown).toContain("Use these naturally when relevant. Don't force them into every response.");
    });
  });

  describe('context grouping by prompt', () => {
    it('should group observations by prompt number when prompts exist', async () => {
      await service.initSession('session-1', 'test-project');

      // Save prompt first
      await service.saveUserPrompt('session-1', 'test-project', 'Fix the bug');

      // Store observation linked to prompt 1
      await service.storeObservation(
        'session-1', 'test-project', 'Read', { file_path: 'bug.ts' }, {}, TEST_DIR
      );

      const context = await service.getContext('test-project');

      // Should have prompt-based grouping
      expect(context.markdown).toContain('Prompt #1');
      expect(context.markdown).toContain('Fix the bug');
    });
  });

  describe('compressObservation', () => {
    const originalEnv = process.env.AGENTKITS_AI_ENRICHMENT;

    beforeEach(() => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      resetAIEnrichmentCache();
    });

    afterEach(() => {
      _setRunClaudePrintMockForTesting(null);
      resetAIEnrichmentCache();
      if (originalEnv === undefined) {
        delete process.env.AGENTKITS_AI_ENRICHMENT;
      } else {
        process.env.AGENTKITS_AI_ENRICHMENT = originalEnv;
      }
    });

    it('should compress an observation and clear raw data', async () => {
      await service.initSession('session-1', 'test-project');
      const obs = await service.storeObservation(
        'session-1', 'test-project', 'Read',
        { file_path: 'auth.ts' }, { content: 'big file content' }, TEST_DIR
      );

      _setRunClaudePrintMockForTesting(() =>
        JSON.stringify({ compressed_summary: 'Read auth.ts for login flow analysis' })
      );

      const result = await service.compressObservation(obs.id);
      expect(result).toBe(true);

      // Verify compressed data in DB
      const observations = await service.getSessionObservations('session-1');
      expect(observations[0].compressedSummary).toBe('Read auth.ts for login flow analysis');
      expect(observations[0].isCompressed).toBe(true);
      expect(observations[0].toolInput).toBe('{}'); // raw data cleared
      expect(observations[0].toolResponse).toBe('{}'); // raw data cleared
    });

    it('should skip already-compressed observations', async () => {
      await service.initSession('session-1', 'test-project');
      const obs = await service.storeObservation(
        'session-1', 'test-project', 'Read', {}, {}, TEST_DIR
      );

      _setRunClaudePrintMockForTesting(() =>
        JSON.stringify({ compressed_summary: 'First compression' })
      );

      // First compress
      await service.compressObservation(obs.id);

      // Second compress should skip (already compressed)
      const result = await service.compressObservation(obs.id);
      expect(result).toBe(false);
    });

    it('should return false for non-existent observation', async () => {
      await service.initialize();
      const result = await service.compressObservation('obs_nonexistent_0000');
      expect(result).toBe(false);
    });

    it('should return false when AI returns null', async () => {
      await service.initSession('session-1', 'test-project');
      const obs = await service.storeObservation(
        'session-1', 'test-project', 'Read', {}, {}, TEST_DIR
      );

      _setRunClaudePrintMockForTesting(() => 'not json');

      const result = await service.compressObservation(obs.id);
      expect(result).toBe(false);
    });
  });

  describe('compressSessionObservations', () => {
    const originalEnv = process.env.AGENTKITS_AI_ENRICHMENT;

    beforeEach(() => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      resetAIEnrichmentCache();
    });

    afterEach(() => {
      _setRunClaudePrintMockForTesting(null);
      resetAIEnrichmentCache();
      if (originalEnv === undefined) {
        delete process.env.AGENTKITS_AI_ENRICHMENT;
      } else {
        process.env.AGENTKITS_AI_ENRICHMENT = originalEnv;
      }
    });

    it('should compress all session observations and create digest', async () => {
      await service.initSession('session-1', 'test-project');
      await service.storeObservation('session-1', 'test-project', 'Read', { file_path: 'a.ts' }, {}, TEST_DIR);
      await service.storeObservation('session-1', 'test-project', 'Write', { file_path: 'b.ts' }, {}, TEST_DIR);

      // Save structured summary (needed for digest generation)
      const structured = await service.generateStructuredSummary('session-1');
      await service.saveSessionSummary(structured);

      let callCount = 0;
      _setRunClaudePrintMockForTesting(() => {
        callCount++;
        // First two calls: observation compression, third: session digest
        if (callCount <= 2) {
          return JSON.stringify({ compressed_summary: `Compressed obs ${callCount}` });
        }
        return JSON.stringify({ digest: 'Session compressed all observations successfully.' });
      });

      const result = await service.compressSessionObservations('session-1');
      expect(result.compressed).toBe(2);
      expect(result.digestCreated).toBe(true);
    });

    it('should handle session with no summary gracefully', async () => {
      await service.initSession('session-1', 'test-project');
      await service.storeObservation('session-1', 'test-project', 'Read', {}, {}, TEST_DIR);

      _setRunClaudePrintMockForTesting(() =>
        JSON.stringify({ compressed_summary: 'Compressed' })
      );

      const result = await service.compressSessionObservations('session-1');
      expect(result.compressed).toBe(1);
      expect(result.digestCreated).toBe(false); // No summary = no digest
    });
  });

  describe('processCompressionQueue', () => {
    const originalEnv = process.env.AGENTKITS_AI_ENRICHMENT;

    beforeEach(() => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      resetAIEnrichmentCache();
    });

    afterEach(() => {
      _setRunClaudePrintMockForTesting(null);
      resetAIEnrichmentCache();
      if (originalEnv === undefined) {
        delete process.env.AGENTKITS_AI_ENRICHMENT;
      } else {
        process.env.AGENTKITS_AI_ENRICHMENT = originalEnv;
      }
    });

    it('should process compress tasks from queue', async () => {
      await service.initSession('session-1', 'test-project');
      const obs = await service.storeObservation(
        'session-1', 'test-project', 'Read', { file_path: 'test.ts' }, {}, TEST_DIR
      );

      // Queue a compress task manually
      service.queueTask('compress', 'observations', obs.id);

      _setRunClaudePrintMockForTesting(() =>
        JSON.stringify({ compressed_summary: 'Read test.ts' })
      );

      const count = await service.processCompressionQueue();
      expect(count).toBe(1);

      // Verify observation is compressed
      const observations = await service.getSessionObservations('session-1');
      expect(observations[0].compressedSummary).toBe('Read test.ts');
      expect(observations[0].isCompressed).toBe(true);
    });

    it('should return 0 when queue is empty', async () => {
      await service.initialize();
      const count = await service.processCompressionQueue();
      expect(count).toBe(0);
    });
  });

  describe('computeContentHash', () => {
    it('should produce consistent hashes', () => {
      const hash1 = computeContentHash('a', 'b', 'c');
      const hash2 = computeContentHash('a', 'b', 'c');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = computeContentHash('a', 'b');
      const hash2 = computeContentHash('a', 'c');
      expect(hash1).not.toBe(hash2);
    });

    it('should produce 16-char hex string', () => {
      const hash = computeContentHash('test');
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe('createHookService factory', () => {
    it('should create service with default config', () => {
      const svc = createHookService(TEST_DIR);

      expect(svc).toBeInstanceOf(MemoryHookService);
    });
  });
});
