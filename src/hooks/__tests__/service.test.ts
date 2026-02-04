/**
 * Unit Tests for MemoryHookService
 *
 * @module @agentkits/memory/hooks/__tests__/service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
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

  describe('task queue retry limits', () => {
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

    it('should skip tasks that have reached max retries', async () => {
      await service.initSession('session-1', 'test-project');
      const obs = await service.storeObservation(
        'session-1', 'test-project', 'Read', { file_path: 'test.ts' }, {}, TEST_DIR
      );

      // Queue a compress task and set retry_count to 3 (max)
      service.queueTask('compress', 'observations', obs.id);
      service.db.prepare("UPDATE task_queue SET retry_count = 3 WHERE task_type = 'compress'").run();

      _setRunClaudePrintMockForTesting(() =>
        JSON.stringify({ compressed_summary: 'Should not run' })
      );

      const count = await service.processCompressionQueue();
      expect(count).toBe(0); // Skipped — retry limit reached

      // Task should still be in queue as pending with retry_count=3
      const task = service.db.prepare("SELECT * FROM task_queue WHERE task_type = 'compress'").get() as Record<string, unknown>;
      expect(task.status).toBe('pending');
      expect(task.retry_count).toBe(3);
    });

    it('should increment retry_count on failure and mark failed at max', async () => {
      await service.initSession('session-1', 'test-project');

      // Queue a compress task for observations table
      service.db.prepare(
        "INSERT INTO task_queue (task_type, target_table, target_id, created_at) VALUES ('compress', 'observations', 'bad-id', ?)"
      ).run(Date.now());

      // Monkey-patch compressObservation to throw (simulating unhandled error)
      const origCompress = service.compressObservation.bind(service);
      service.compressObservation = async () => { throw new Error('unexpected failure'); };

      // Worker loop retries within a single call — all 3 attempts exhaust in one run
      const count = await service.processCompressionQueue();
      expect(count).toBe(3); // 3 failed attempts processed

      // Task should now be marked 'failed' with retry_count=3
      const task = service.db.prepare("SELECT * FROM task_queue WHERE task_type = 'compress'").get() as Record<string, unknown>;
      expect(task.status).toBe('failed');
      expect(task.retry_count).toBe(3);

      // Next call skips entirely — no pending tasks under retry limit
      const count2 = await service.processCompressionQueue();
      expect(count2).toBe(0);

      // Restore
      service.compressObservation = origCompress;
    });

    it('should include retry_count column in task_queue schema', async () => {
      await service.initialize();
      const cols = service.db.prepare("PRAGMA table_info(task_queue)").all() as Array<{ name: string }>;
      expect(cols.some(c => c.name === 'retry_count')).toBe(true);
    });

    it('should default retry_count to 0 for new tasks', async () => {
      await service.initSession('session-1', 'test-project');
      service.queueTask('embed', 'observations', 'test-id');
      const task = service.db.prepare("SELECT retry_count FROM task_queue WHERE task_type = 'embed'").get() as Record<string, unknown>;
      expect(task.retry_count).toBe(0);
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

  // ===== Embedding Reliability =====

  describe('hasPendingEmbeddings', () => {
    it('should return false when no pending tasks or missing embeddings', async () => {
      await service.initialize();
      expect(service.hasPendingEmbeddings()).toBe(false);
    });

    it('should return true when pending embed tasks exist', async () => {
      await service.initSession('session-1', 'test-project');
      const obs = await service.storeObservation(
        'session-1', 'test-project', 'Read', { file_path: 'test.ts' }, {}, TEST_DIR
      );
      // storeObservation auto-queues embed task
      expect(service.hasPendingEmbeddings()).toBe(true);
    });

    it('should return true when observations have null embeddings', async () => {
      await service.initSession('session-1', 'test-project');
      await service.storeObservation(
        'session-1', 'test-project', 'Read', { file_path: 'test.ts' }, {}, TEST_DIR
      );
      // Clear task queue but leave embedding null
      service.db.prepare("DELETE FROM task_queue").run();
      expect(service.hasPendingEmbeddings()).toBe(true);
    });

    it('should return false when db not initialized', async () => {
      // service.db is null before initialize
      expect(service.hasPendingEmbeddings()).toBe(false);
    });

    it('should ignore failed tasks at max retries', async () => {
      await service.initSession('session-1', 'test-project');
      await service.storeObservation(
        'session-1', 'test-project', 'Read', { file_path: 'test.ts' }, {}, TEST_DIR
      );
      // Set all tasks to failed with max retries
      service.db.prepare("UPDATE task_queue SET status = 'failed', retry_count = 3").run();
      // But observations still have null embeddings — should detect via DB scan
      expect(service.hasPendingEmbeddings()).toBe(true);
    });
  });

  describe('hasPendingEnrichments', () => {
    it('should return false when no pending enrich tasks', async () => {
      await service.initialize();
      expect(service.hasPendingEnrichments()).toBe(false);
    });

    it('should return true when pending enrich tasks exist', async () => {
      await service.initSession('session-1', 'test-project');
      const obs = await service.storeObservation(
        'session-1', 'test-project', 'Read', { file_path: 'test.ts' }, {}, TEST_DIR
      );
      // Manually queue an enrich task
      service.db.prepare(
        "INSERT INTO task_queue (task_type, target_id, target_table, status, created_at) VALUES ('enrich', ?, 'observations', 'pending', datetime('now'))"
      ).run(obs.id);
      expect(service.hasPendingEnrichments()).toBe(true);
    });

    it('should ignore failed tasks at max retries', async () => {
      await service.initialize();
      service.db.prepare(
        "INSERT INTO task_queue (task_type, target_id, target_table, status, retry_count, created_at) VALUES ('enrich', 'obs-1', 'observations', 'failed', 3, datetime('now'))"
      ).run();
      expect(service.hasPendingEnrichments()).toBe(false);
    });

    it('should return false when db not initialized', () => {
      expect(service.hasPendingEnrichments()).toBe(false);
    });
  });

  describe('hasPendingCompressions', () => {
    it('should return false when no pending compress tasks', async () => {
      await service.initialize();
      expect(service.hasPendingCompressions()).toBe(false);
    });

    it('should return true when pending compress tasks exist', async () => {
      await service.initSession('session-1', 'test-project');
      const obs = await service.storeObservation(
        'session-1', 'test-project', 'Read', { file_path: 'test.ts' }, {}, TEST_DIR
      );
      service.db.prepare(
        "INSERT INTO task_queue (task_type, target_id, target_table, status, created_at) VALUES ('compress', ?, 'observations', 'pending', datetime('now'))"
      ).run(obs.id);
      expect(service.hasPendingCompressions()).toBe(true);
    });

    it('should return true when pending digest tasks exist', async () => {
      await service.initSession('session-1', 'test-project');
      service.db.prepare(
        "INSERT INTO task_queue (task_type, target_id, target_table, status, created_at) VALUES ('digest', 'session-1', 'sessions', 'pending', datetime('now'))"
      ).run();
      expect(service.hasPendingCompressions()).toBe(true);
    });

    it('should ignore failed tasks at max retries', async () => {
      await service.initialize();
      service.db.prepare(
        "INSERT INTO task_queue (task_type, target_id, target_table, status, retry_count, created_at) VALUES ('compress', 'obs-1', 'observations', 'failed', 3, datetime('now'))"
      ).run();
      expect(service.hasPendingCompressions()).toBe(false);
    });

    it('should return false when db not initialized', () => {
      expect(service.hasPendingCompressions()).toBe(false);
    });
  });

  // ===== Persistent Settings =====

  describe('loadSettings / saveSettings', () => {
    it('should return defaults when no settings file exists', async () => {
      await service.initialize();
      const settings = service.loadSettings();
      expect(settings.context.showSummaries).toBe(true);
      expect(settings.context.showPrompts).toBe(true);
      expect(settings.context.showObservations).toBe(true);
      expect(settings.context.showToolGuidance).toBe(true);
      expect(settings.context.maxSummaries).toBe(3);
      expect(settings.context.maxPrompts).toBe(10);
      expect(settings.context.maxObservations).toBe(10);
    });

    it('should read settings from .claude/memory/settings.json', async () => {
      await service.initialize();
      // Write a custom settings file
      const settingsPath = path.join(TEST_DIR, '.claude', 'memory', 'settings.json');
      mkdirSync(path.dirname(settingsPath), { recursive: true });
      writeFileSync(settingsPath, JSON.stringify({
        context: { showSummaries: false, maxObservations: 25 },
      }));

      const settings = service.loadSettings();
      expect(settings.context.showSummaries).toBe(false);
      expect(settings.context.maxObservations).toBe(25);
      // Missing keys get defaults
      expect(settings.context.showPrompts).toBe(true);
      expect(settings.context.maxSummaries).toBe(3);
    });

    it('should return defaults on corrupted settings file', async () => {
      await service.initialize();
      const settingsPath = path.join(TEST_DIR, '.claude', 'memory', 'settings.json');
      mkdirSync(path.dirname(settingsPath), { recursive: true });
      writeFileSync(settingsPath, '{ invalid json');

      const settings = service.loadSettings();
      expect(settings.context.showSummaries).toBe(true);
      expect(settings.context.maxObservations).toBe(10);
    });

    it('should save settings to disk', async () => {
      await service.initialize();
      const customSettings = {
        context: {
          showSummaries: false,
          showPrompts: true,
          showObservations: true,
          showToolGuidance: false,
          maxSummaries: 5,
          maxPrompts: 20,
          maxObservations: 30,
        },
      };
      service.saveSettings(customSettings);

      // Verify file contents
      const settingsPath = path.join(TEST_DIR, '.claude', 'memory', 'settings.json');
      const saved = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      expect(saved.context.showSummaries).toBe(false);
      expect(saved.context.maxObservations).toBe(30);
    });

    it('should round-trip save and load', async () => {
      await service.initialize();
      const original = {
        context: {
          showSummaries: false,
          showPrompts: false,
          showObservations: true,
          showToolGuidance: true,
          maxSummaries: 1,
          maxPrompts: 5,
          maxObservations: 15,
        },
      };
      service.saveSettings(original);
      const loaded = service.loadSettings();
      expect(loaded).toEqual(original);
    });

    it('should save and load aiProvider settings', async () => {
      await service.initialize();
      const settings = {
        context: {
          showSummaries: true,
          showPrompts: true,
          showObservations: true,
          showToolGuidance: true,
          maxSummaries: 3,
          maxPrompts: 10,
          maxObservations: 10,
        },
        aiProvider: {
          provider: 'openai' as const,
          apiKey: 'sk-test-key',
          baseUrl: 'https://openrouter.ai/api/v1',
          model: 'anthropic/claude-3.5-haiku',
        },
      };
      service.saveSettings(settings);
      const loaded = service.loadSettings();
      expect(loaded.aiProvider).toBeDefined();
      expect(loaded.aiProvider!.provider).toBe('openai');
      expect(loaded.aiProvider!.apiKey).toBe('sk-test-key');
      expect(loaded.aiProvider!.baseUrl).toBe('https://openrouter.ai/api/v1');
      expect(loaded.aiProvider!.model).toBe('anthropic/claude-3.5-haiku');
    });

    it('should return undefined aiProvider when not set in settings', async () => {
      await service.initialize();
      const loaded = service.loadSettings();
      expect(loaded.aiProvider).toBeUndefined();
    });
  });

  describe('getContext with settings', () => {
    it('should use settings from disk', async () => {
      await service.initSession('session-1', 'test-project');
      await service.storeObservation(
        'session-1', 'test-project', 'Read', { file_path: 'a.ts' }, {}, TEST_DIR
      );

      // Save settings to disable summaries
      service.saveSettings({
        context: {
          showSummaries: false,
          showPrompts: true,
          showObservations: true,
          showToolGuidance: false,
          maxSummaries: 3,
          maxPrompts: 10,
          maxObservations: 10,
        },
      });

      const context = await service.getContext('test-project');
      // Tool guidance should be absent when showToolGuidance=false
      expect(context.markdown).not.toContain('Memory tools available');
    });

    it('should respect configOverride over disk settings', async () => {
      await service.initSession('session-1', 'test-project');
      await service.storeObservation(
        'session-1', 'test-project', 'Read', { file_path: 'a.ts' }, {}, TEST_DIR
      );

      // Disk settings: guidance enabled
      service.saveSettings({
        context: {
          showSummaries: true,
          showPrompts: true,
          showObservations: true,
          showToolGuidance: true,
          maxSummaries: 3,
          maxPrompts: 10,
          maxObservations: 10,
        },
      });

      // Override: disable guidance
      const context = await service.getContext('test-project', {
        showSummaries: true,
        showPrompts: true,
        showObservations: true,
        showToolGuidance: false,
        maxSummaries: 3,
        maxPrompts: 10,
        maxObservations: 10,
      });
      expect(context.markdown).not.toContain('Memory tools available');
    });

    it('should limit observations by maxObservations setting', async () => {
      await service.initSession('session-1', 'test-project');
      // Store 5 observations
      for (let i = 0; i < 5; i++) {
        await service.storeObservation(
          'session-1', 'test-project', 'Read', { file_path: `file${i}.ts` }, {}, TEST_DIR
        );
      }

      // Set maxObservations=2
      service.saveSettings({
        context: {
          showSummaries: true,
          showPrompts: true,
          showObservations: true,
          showToolGuidance: true,
          maxSummaries: 3,
          maxPrompts: 10,
          maxObservations: 2,
        },
      });

      const context = await service.getContext('test-project');
      expect(context.recentObservations.length).toBe(2);
    });
  });

  describe('createHookService factory', () => {
    it('should create service with default config', () => {
      const svc = createHookService(TEST_DIR);

      expect(svc).toBeInstanceOf(MemoryHookService);
    });
  });

  // ===== Feature #5: Intent Tags =====

  describe('intent detection in storeObservation', () => {
    it('should add intent tags to concepts when prompt exists', async () => {
      await service.initialize();
      await service.initSession('intent-session', 'test-project', 'Fix the login bug');
      await service.saveUserPrompt('intent-session', 'test-project', 'Fix the login bug');

      const obs = await service.storeObservation(
        'intent-session', 'test-project', 'Edit',
        { file_path: 'src/auth.ts', old_string: 'foo', new_string: 'bar' },
        { success: true }, TEST_DIR
      );

      expect(obs.concepts).toBeDefined();
      const intentConcepts = obs.concepts!.filter(c => c.startsWith('intent:'));
      expect(intentConcepts.length).toBeGreaterThan(0);
      expect(intentConcepts).toContain('intent:bugfix');
    });

    it('should default to investigation for read without prompt', async () => {
      await service.initialize();
      await service.initSession('intent-session-2', 'test-project');

      const obs = await service.storeObservation(
        'intent-session-2', 'test-project', 'Read',
        { file_path: 'src/app.ts' },
        { content: 'file contents' }, TEST_DIR
      );

      const intentConcepts = obs.concepts!.filter(c => c.startsWith('intent:'));
      expect(intentConcepts).toContain('intent:investigation');
    });
  });

  describe('getLatestPromptText', () => {
    it('should return latest prompt text', async () => {
      await service.initialize();
      await service.initSession('prompt-text-session', 'test-project', 'Hello');
      await service.saveUserPrompt('prompt-text-session', 'test-project', 'First prompt');
      await service.saveUserPrompt('prompt-text-session', 'test-project', 'Second prompt');

      const text = service.getLatestPromptText('prompt-text-session');
      expect(text).toBe('Second prompt');
    });

    it('should return null when no prompts exist', async () => {
      await service.initialize();
      const text = service.getLatestPromptText('nonexistent-session');
      expect(text).toBeNull();
    });
  });

  // ===== Feature #8: Lifecycle Management =====

  describe('lifecycle management', () => {
    it('should archive old completed sessions', async () => {
      await service.initialize();

      // Create an old completed session
      await service.initSession('old-session', 'test-project', 'old task');
      await service.completeSession('old-session', 'Done');

      // Manually backdate the session
      // @ts-expect-error accessing private db for testing
      service.db.prepare("UPDATE sessions SET ended_at = ? WHERE session_id = ?").run(
        Date.now() - 40 * 86400000, // 40 days ago
        'old-session'
      );

      const result = await service.runLifecycleTasks({ archiveAfterDays: 30 });
      expect(result.archived).toBe(1);

      // Verify session is archived
      const session = service.getSession('old-session');
      expect(session?.status).toBe('archived');
    });

    it('should not archive recent sessions', async () => {
      await service.initialize();

      await service.initSession('recent-session', 'test-project', 'recent task');
      await service.completeSession('recent-session', 'Done');

      const result = await service.runLifecycleTasks({ archiveAfterDays: 30 });
      expect(result.archived).toBe(0);

      const session = service.getSession('recent-session');
      expect(session?.status).toBe('completed');
    });

    it('should delete archived sessions when autoDelete enabled', async () => {
      await service.initialize();

      await service.initSession('delete-session', 'test-project', 'delete task');
      await service.completeSession('delete-session', 'Done');

      // @ts-expect-error accessing private db for testing
      service.db.prepare("UPDATE sessions SET status = 'archived', ended_at = ? WHERE session_id = ?").run(
        Date.now() - 100 * 86400000, // 100 days ago
        'delete-session'
      );

      const result = await service.runLifecycleTasks({
        autoDelete: true,
        deleteAfterDays: 90,
      });
      expect(result.deleted).toBe(1);
      expect(result.vacuumed).toBe(true);

      const session = service.getSession('delete-session');
      expect(session).toBeNull();
    });

    it('should not delete when autoDelete is false (default)', async () => {
      await service.initialize();

      await service.initSession('keep-session', 'test-project', 'keep task');
      await service.completeSession('keep-session', 'Done');

      // @ts-expect-error accessing private db for testing
      service.db.prepare("UPDATE sessions SET status = 'archived', ended_at = ? WHERE session_id = ?").run(
        Date.now() - 100 * 86400000,
        'keep-session'
      );

      const result = await service.runLifecycleTasks({ autoDelete: false });
      expect(result.deleted).toBe(0);

      const session = service.getSession('keep-session');
      expect(session).not.toBeNull();
    });

    it('should queue compression for old uncompressed observations', async () => {
      await service.initialize();
      await service.initSession('compress-lc-session', 'test-project', 'task');

      await service.storeObservation(
        'compress-lc-session', 'test-project', 'Read',
        { file_path: 'file.ts' }, { content: 'data' }, TEST_DIR
      );

      // Backdate the observation
      // @ts-expect-error accessing private db for testing
      service.db.prepare("UPDATE observations SET timestamp = ? WHERE session_id = ?").run(
        Date.now() - 10 * 86400000, // 10 days ago
        'compress-lc-session'
      );

      const result = await service.runLifecycleTasks({ compressAfterDays: 7 });
      expect(result.compressed).toBe(1);
    });
  });

  describe('lifecycle stats', () => {
    it('should return database statistics', async () => {
      await service.initialize();

      await service.initSession('stats-session', 'test-project', 'stats');
      await service.storeObservation(
        'stats-session', 'test-project', 'Read',
        { file_path: 'file.ts' }, { content: 'data' }, TEST_DIR
      );
      await service.saveUserPrompt('stats-session', 'test-project', 'test prompt');

      const stats = await service.getLifecycleStats();
      expect(stats.totalSessions).toBeGreaterThanOrEqual(1);
      expect(stats.activeSessions).toBeGreaterThanOrEqual(1);
      expect(stats.totalObservations).toBeGreaterThanOrEqual(1);
      expect(stats.totalPrompts).toBeGreaterThanOrEqual(1);
      expect(stats.dbSizeBytes).toBeGreaterThan(0);
    });
  });

  // ===== Feature #9: Export/Import =====

  describe('structured diff capture', () => {
    it('should include diff facts for Edit observations', async () => {
      await service.initialize();
      await service.initSession('diff-session', 'test-project');
      const obs = await service.storeObservation(
        'diff-session', 'test-project', 'Edit',
        { file_path: 'src/auth.ts', old_string: 'function login(user) {', new_string: 'function login(user, opts) {' },
        {}, TEST_DIR
      );

      expect(obs.facts).toBeDefined();
      expect(obs.facts!.some(f => f.includes('DIFF'))).toBe(true);
      expect(obs.facts!.some(f => f.includes('function login(user) {'))).toBe(true);
      expect(obs.facts!.some(f => f.includes('function login(user, opts) {'))).toBe(true);
    });

    it('should include diff info in narrative for Edit', async () => {
      await service.initialize();
      await service.initSession('diff-session-2', 'test-project');
      const obs = await service.storeObservation(
        'diff-session-2', 'test-project', 'Edit',
        { file_path: 'src/app.ts', old_string: 'const x = 1;', new_string: 'const x = 2;' },
        {}, TEST_DIR
      );

      expect(obs.narrative).toBeDefined();
      expect(obs.narrative).toContain('const x = 1;');
      expect(obs.narrative).toContain('const x = 2;');
    });

    it('should handle MultiEdit with multiple diffs', async () => {
      await service.initialize();
      await service.initSession('multi-diff', 'test-project');
      const obs = await service.storeObservation(
        'multi-diff', 'test-project', 'MultiEdit',
        {
          file_path: 'src/index.ts',
          edits: [
            { old_string: 'import { a } from "./a"', new_string: 'import { a, b } from "./a"' },
            { old_string: 'export default a;', new_string: 'export default { a, b };' },
          ],
        },
        {}, TEST_DIR
      );

      expect(obs.facts!.filter(f => f.includes('DIFF')).length).toBe(2);
    });
  });

  describe('decision rationale in summaries', () => {
    it('should extract decisions from Edit observations', async () => {
      await service.initialize();
      await service.initSession('decision-session', 'test-project');
      await service.saveUserPrompt('decision-session', 'test-project', 'Fix the auth bug');

      await service.storeObservation(
        'decision-session', 'test-project', 'Edit',
        { file_path: 'src/auth.ts', old_string: 'function login(user) {', new_string: 'function login(user, opts) {' },
        {}, TEST_DIR
      );

      const summary = await service.generateStructuredSummary('decision-session');

      expect(summary.decisions).toBeDefined();
      expect(summary.decisions.length).toBeGreaterThan(0);
      expect(summary.decisions[0]).toContain('auth.ts');
      expect(summary.decisions[0]).toContain('function login');
    });

    it('should include intent tags in decisions', async () => {
      await service.initialize();
      await service.initSession('intent-decision', 'test-project');
      await service.saveUserPrompt('intent-decision', 'test-project', 'Refactor the handler');

      await service.storeObservation(
        'intent-decision', 'test-project', 'Edit',
        { file_path: 'src/handler.ts', old_string: 'async handle(req)', new_string: 'async handleRequest(req, res)' },
        {}, TEST_DIR
      );

      const summary = await service.generateStructuredSummary('intent-decision');

      expect(summary.decisions.length).toBeGreaterThan(0);
      expect(summary.decisions[0]).toContain('refactor');
    });

    it('should include decisions in saved session summaries', async () => {
      await service.initialize();
      await service.initSession('saved-decision', 'test-project');
      await service.saveUserPrompt('saved-decision', 'test-project', 'Add feature');

      await service.storeObservation(
        'saved-decision', 'test-project', 'Edit',
        { file_path: 'src/feature.ts', old_string: 'const x = 1;', new_string: 'const x = getValue();' },
        {}, TEST_DIR
      );

      const structured = await service.generateStructuredSummary('saved-decision');
      const saved = await service.saveSessionSummary(structured);

      expect(saved.decisions).toBeDefined();
      expect(saved.decisions.length).toBeGreaterThan(0);

      // Verify it roundtrips through DB
      const summaries = await service.getRecentSummaries('test-project');
      const found = summaries.find(s => s.sessionId === 'saved-decision');
      expect(found).toBeDefined();
      expect(found!.decisions.length).toBeGreaterThan(0);
    });

    it('should return empty decisions when no Edit observations', async () => {
      await service.initialize();
      await service.initSession('no-decision', 'test-project');
      await service.storeObservation(
        'no-decision', 'test-project', 'Read',
        { file_path: 'src/app.ts' }, {}, TEST_DIR
      );

      const summary = await service.generateStructuredSummary('no-decision');

      expect(summary.decisions).toEqual([]);
    });

    it('should show decisions in context markdown', async () => {
      await service.initialize();
      await service.initSession('ctx-decision', 'test-project');
      await service.saveUserPrompt('ctx-decision', 'test-project', 'Fix bug');

      await service.storeObservation(
        'ctx-decision', 'test-project', 'Edit',
        { file_path: 'src/fix.ts', old_string: 'return null;', new_string: 'return defaultValue;' },
        {}, TEST_DIR
      );

      const structured = await service.generateStructuredSummary('ctx-decision');
      await service.saveSessionSummary(structured);
      await service.completeSession('ctx-decision', 'Done');

      const ctx = await service.getContext('test-project');
      expect(ctx.markdown).toContain('Decisions');
    });
  });

  describe('errors in structured summaries', () => {
    it('should extract errors from Bash stderr/stdout', async () => {
      await service.initialize();
      await service.initSession('error-session', 'test-project');

      await service.storeObservation(
        'error-session', 'test-project', 'Bash',
        { command: 'npm run build' },
        { stderr: 'Error: TS2304 Cannot find name "foo"', stdout: '' },
        TEST_DIR
      );

      const summary = await service.generateStructuredSummary('error-session');
      expect(summary.errors).toBeDefined();
      expect(summary.errors.length).toBeGreaterThan(0);
      expect(summary.errors[0]).toContain('TS2304');
    });

    it('should not include false positive errors like "0 errors"', async () => {
      await service.initialize();
      await service.initSession('no-error-session', 'test-project');

      await service.storeObservation(
        'no-error-session', 'test-project', 'Bash',
        { command: 'tsc' },
        { stdout: 'Build completed with 0 errors', stderr: '' },
        TEST_DIR
      );

      const summary = await service.generateStructuredSummary('no-error-session');
      expect(summary.errors.length).toBe(0);
    });

    it('should return empty errors when no Bash observations', async () => {
      await service.initialize();
      await service.initSession('read-only-session', 'test-project');

      await service.storeObservation(
        'read-only-session', 'test-project', 'Read',
        { file_path: 'file.ts' }, {}, TEST_DIR
      );

      const summary = await service.generateStructuredSummary('read-only-session');
      expect(summary.errors).toEqual([]);
    });

    it('should cap errors at 10', async () => {
      await service.initialize();
      await service.initSession('many-error-session', 'test-project');

      // Create output with many error lines
      const errorLines = Array.from({ length: 20 }, (_, i) => `Error: issue ${i}`).join('\n');
      await service.storeObservation(
        'many-error-session', 'test-project', 'Bash',
        { command: 'build' },
        { stdout: errorLines, stderr: '' },
        TEST_DIR
      );

      const summary = await service.generateStructuredSummary('many-error-session');
      expect(summary.errors.length).toBeLessThanOrEqual(10);
    });

    it('should include errors in saved session summary', async () => {
      await service.initialize();
      await service.initSession('saved-error', 'test-project');

      await service.storeObservation(
        'saved-error', 'test-project', 'Bash',
        { command: 'tsc' },
        { stderr: 'fatal error: out of memory' },
        TEST_DIR
      );

      const structured = await service.generateStructuredSummary('saved-error');
      const saved = await service.saveSessionSummary(structured);
      expect(saved.errors.length).toBeGreaterThan(0);

      // Verify roundtrip through DB
      const summaries = await service.getRecentSummaries('test-project');
      const found = summaries.find(s => s.sessionId === 'saved-error');
      expect(found).toBeDefined();
      expect(found!.errors.length).toBeGreaterThan(0);
    });

    it('should show errors in context markdown', async () => {
      await service.initialize();
      await service.initSession('ctx-error', 'test-project');

      await service.storeObservation(
        'ctx-error', 'test-project', 'Bash',
        { command: 'npm test' },
        { stderr: 'Error: Test failed unexpectedly' },
        TEST_DIR
      );

      const structured = await service.generateStructuredSummary('ctx-error');
      await service.saveSessionSummary(structured);
      await service.completeSession('ctx-error', 'Done');

      const ctx = await service.getContext('test-project');
      expect(ctx.markdown).toContain('Errors');
    });
  });

  describe('cross-session pattern detection', () => {
    it('should detect recurring concepts across observations', async () => {
      await service.initialize();

      // Create multiple sessions with overlapping concepts
      await service.initSession('pattern-s1', 'test-project');
      await service.storeObservation(
        'pattern-s1', 'test-project', 'Edit',
        { file_path: 'src/auth.ts', old_string: 'function login(user) {', new_string: 'function login(user, opts) {' },
        {}, TEST_DIR
      );

      await service.initSession('pattern-s2', 'test-project');
      await service.storeObservation(
        'pattern-s2', 'test-project', 'Edit',
        { file_path: 'src/auth.ts', old_string: 'function logout() {', new_string: 'function logout(session) {' },
        {}, TEST_DIR
      );

      const patterns = await service.detectCrossSessionPatterns('test-project');

      // Both edits touched 'authentication' concept from auth.ts path
      expect(patterns.length).toBeGreaterThan(0);
      // At least some patterns should appear with count >= 2
      expect(patterns.every(p => p.count >= 2)).toBe(true);
      expect(patterns.every(p => p.category)).toBe(true);
    });

    it('should categorize patterns by prefix', async () => {
      await service.initialize();

      // Create observations with fn: and intent: concepts
      await service.initSession('cat-s1', 'test-project');
      await service.saveUserPrompt('cat-s1', 'test-project', 'Fix the login bug');
      await service.storeObservation(
        'cat-s1', 'test-project', 'Edit',
        { file_path: 'src/app.ts', old_string: 'function handleAuth() {', new_string: 'function handleAuth(opts) {' },
        {}, TEST_DIR
      );

      await service.initSession('cat-s2', 'test-project');
      await service.saveUserPrompt('cat-s2', 'test-project', 'Fix the signup bug');
      await service.storeObservation(
        'cat-s2', 'test-project', 'Edit',
        { file_path: 'src/signup.ts', old_string: 'function handleAuth() {', new_string: 'function handleAuth(token) {' },
        {}, TEST_DIR
      );

      const patterns = await service.detectCrossSessionPatterns('test-project');

      // Check category values
      const categories = new Set(patterns.map(p => p.category));
      // Should have valid categories
      for (const cat of categories) {
        expect(['topic', 'intent', 'function', 'class', 'code-pattern']).toContain(cat);
      }
    });

    it('should return empty for project with no observations', async () => {
      await service.initialize();
      const patterns = await service.detectCrossSessionPatterns('empty-project');
      expect(patterns).toEqual([]);
    });

    it('should respect limit parameter', async () => {
      await service.initialize();
      await service.initSession('limit-s1', 'test-project');

      // Create many observations to generate many concepts
      for (let i = 0; i < 5; i++) {
        await service.storeObservation(
          'limit-s1', 'test-project', 'Edit',
          { file_path: `src/file${i}.ts`, old_string: 'const a = 1;', new_string: 'const a = 2;' },
          {}, TEST_DIR
        );
      }

      const patterns = await service.detectCrossSessionPatterns('test-project', 3);
      expect(patterns.length).toBeLessThanOrEqual(3);
    });
  });

  describe('export/import', () => {
    it('should export sessions with observations and prompts', async () => {
      await service.initialize();
      await service.initSession('export-session', 'test-project', 'export task');
      await service.saveUserPrompt('export-session', 'test-project', 'export prompt');
      await service.storeObservation(
        'export-session', 'test-project', 'Read',
        { file_path: 'file.ts' }, { content: 'data' }, TEST_DIR
      );
      await service.completeSession('export-session', 'Done');

      const data = await service.exportToJSON('test-project');
      expect(data.version).toBe('1.0');
      expect(data.project).toBe('test-project');
      expect(data.sessions.length).toBeGreaterThanOrEqual(1);

      const session = data.sessions.find(s => s.sessionId === 'export-session');
      expect(session).toBeDefined();
      expect(session!.observations.length).toBeGreaterThanOrEqual(1);
      expect(session!.prompts.length).toBeGreaterThanOrEqual(1);
    });

    it('should export specific sessions by ID', async () => {
      await service.initialize();
      await service.initSession('export-a', 'test-project', 'task A');
      await service.initSession('export-b', 'test-project', 'task B');

      const data = await service.exportToJSON('test-project', ['export-a']);
      expect(data.sessions.length).toBe(1);
      expect(data.sessions[0].sessionId).toBe('export-a');
    });

    it('should import exported data with new session IDs', async () => {
      await service.initialize();
      await service.initSession('import-src', 'test-project', 'import task');
      await service.saveUserPrompt('import-src', 'test-project', 'import prompt');
      await service.storeObservation(
        'import-src', 'test-project', 'Read',
        { file_path: 'file.ts' }, { content: 'data' }, TEST_DIR
      );

      const exported = await service.exportToJSON('test-project', ['import-src']);

      // Importing into same DB: content_hash dedup will skip existing obs/prompts
      // but session is always created new
      const result = await service.importFromJSON(exported);

      expect(result.imported.sessions).toBe(1);
      // Observations and prompts are deduplicated by content_hash since they already exist
      expect(result.imported.observations + result.skipped.observations).toBeGreaterThanOrEqual(1);
      expect(result.imported.prompts + result.skipped.prompts).toBeGreaterThanOrEqual(1);
    });

    it('should dedup observations by content_hash on reimport', async () => {
      await service.initialize();
      await service.initSession('dedup-session', 'test-project', 'dedup task');
      await service.storeObservation(
        'dedup-session', 'test-project', 'Read',
        { file_path: 'file.ts' }, { content: 'data' }, TEST_DIR
      );

      const exported = await service.exportToJSON('test-project', ['dedup-session']);

      // First import: content_hash already exists in same DB → skipped
      const result1 = await service.importFromJSON(exported);
      // Second import: still skipped (same hash)
      const result2 = await service.importFromJSON(exported);

      // Both imports should have the session created but obs deduplicated
      expect(result1.imported.sessions).toBe(1);
      expect(result2.imported.sessions).toBe(1);
      // Both skip observations since content_hash already in DB
      expect(result1.skipped.observations + result2.skipped.observations).toBeGreaterThanOrEqual(1);
    });

    it('should preserve errors in export/import roundtrip', async () => {
      await service.initialize();
      await service.initSession('err-export', 'test-project');

      await service.storeObservation(
        'err-export', 'test-project', 'Bash',
        { command: 'build' },
        { stderr: 'Error: compilation failed' },
        TEST_DIR
      );

      const structured = await service.generateStructuredSummary('err-export');
      await service.saveSessionSummary(structured);
      await service.completeSession('err-export', 'Done');

      const exported = await service.exportToJSON('test-project', ['err-export']);
      const session = exported.sessions.find(s => s.sessionId === 'err-export');
      expect(session).toBeDefined();
      expect(session!.summary).toBeDefined();
      expect(session!.summary!.errors.length).toBeGreaterThan(0);
    });
  });
});
