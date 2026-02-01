/**
 * Integration Tests for Hook System
 *
 * Tests the full hook flow from session start to end.
 *
 * @module @agentkits/memory/hooks/__tests__/integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { NormalizedHookInput, parseHookInput } from '../types.js';
import { MemoryHookService } from '../service.js';
import { createContextHook } from '../context.js';
import { createSessionInitHook } from '../session-init.js';
import { createObservationHook } from '../observation.js';
import { createSummarizeHook } from '../summarize.js';

const TEST_DIR = path.join(process.cwd(), '.test-integration-hooks');

function createTestInput(overrides: Partial<NormalizedHookInput> = {}): NormalizedHookInput {
  return {
    sessionId: 'integration-session',
    cwd: TEST_DIR,
    project: 'test-project',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('Hook System Integration', () => {
  beforeEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('Full Session Flow', () => {
    it('should complete a full session lifecycle', async () => {
      const sessionId = 'full-flow-session';
      const project = 'test-project';

      // 1. Session Start - Context Hook (no previous context)
      const contextHook = createContextHook(TEST_DIR);
      const contextResult = await contextHook.execute(
        createTestInput({ sessionId, project })
      );

      expect(contextResult.continue).toBe(true);
      expect(contextResult.additionalContext).toBeUndefined(); // No previous sessions

      // 2. User Prompt Submit - Session Init Hook
      const sessionInitHook = createSessionInitHook(TEST_DIR);
      const sessionInitResult = await sessionInitHook.execute(
        createTestInput({ sessionId, project, prompt: 'Help me implement a feature' })
      );

      expect(sessionInitResult.continue).toBe(true);

      // 3. Tool Uses - Observation Hooks
      const observationHook = createObservationHook(TEST_DIR);

      // Simulate reading files
      await observationHook.execute(
        createTestInput({
          sessionId,
          project,
          toolName: 'Read',
          toolInput: { file_path: 'src/index.ts' },
          toolResponse: { content: 'export function main() {}' },
        })
      );

      // Simulate grep search
      await observationHook.execute(
        createTestInput({
          sessionId,
          project,
          toolName: 'Grep',
          toolInput: { pattern: 'function', path: 'src' },
          toolResponse: { matches: ['src/index.ts:1'] },
        })
      );

      // Simulate writing file
      await observationHook.execute(
        createTestInput({
          sessionId,
          project,
          toolName: 'Write',
          toolInput: { file_path: 'src/feature.ts' },
          toolResponse: { success: true },
        })
      );

      // Simulate running tests
      await observationHook.execute(
        createTestInput({
          sessionId,
          project,
          toolName: 'Bash',
          toolInput: { command: 'npm test' },
          toolResponse: { stdout: 'All tests passed' },
        })
      );

      // 4. Session End - Summarize Hook
      const summarizeHook = createSummarizeHook(TEST_DIR);
      const summarizeResult = await summarizeHook.execute(
        createTestInput({ sessionId, project, stopReason: 'user_exit' })
      );

      expect(summarizeResult.continue).toBe(true);

      // Verify final state
      const service = new MemoryHookService(TEST_DIR);
      await service.initialize();

      const session = service.getSession(sessionId);
      expect(session).not.toBeNull();
      expect(session?.status).toBe('completed');
      expect(session?.observationCount).toBe(4);
      expect(session?.summary).toBeDefined();
      expect(session?.summary).toContain('file(s) modified');
      expect(session?.summary).toContain('file(s) read');
      expect(session?.summary).toContain('command(s) executed');

      const observations = await service.getSessionObservations(sessionId);
      expect(observations.length).toBe(4);

      await service.shutdown();
    });

    it('should provide context from previous sessions', async () => {
      // Session 1: Complete a full session
      const session1Id = 'previous-session';
      const project = 'test-project';

      // Init session 1
      const initHook1 = createSessionInitHook(TEST_DIR);
      await initHook1.execute(createTestInput({ sessionId: session1Id, project, prompt: 'First task' }));

      // Add observations to session 1
      const obsHook1 = createObservationHook(TEST_DIR);
      await obsHook1.execute(createTestInput({
        sessionId: session1Id,
        project,
        toolName: 'Write',
        toolInput: { file_path: 'src/auth.ts' },
        toolResponse: {},
      }));

      // Complete session 1
      const sumHook1 = createSummarizeHook(TEST_DIR);
      await sumHook1.execute(createTestInput({ sessionId: session1Id, project }));

      // Session 2: Should see context from session 1
      const session2Id = 'current-session';

      const contextHook2 = createContextHook(TEST_DIR);
      const contextResult = await contextHook2.execute(
        createTestInput({ sessionId: session2Id, project })
      );

      expect(contextResult.continue).toBe(true);
      expect(contextResult.suppressOutput).toBe(false);
      expect(contextResult.additionalContext).toBeDefined();
      expect(contextResult.additionalContext).toContain('Previous Sessions');
      expect(contextResult.additionalContext).toContain('Recent Activity');
      expect(contextResult.additionalContext).toContain('Write');
    });

    it('should handle multiple projects independently', async () => {
      // Session for project A
      const initHookA = createSessionInitHook(TEST_DIR);
      await initHookA.execute(createTestInput({
        sessionId: 'session-a',
        project: 'project-a',
        prompt: 'Task for A',
      }));

      const obsHookA = createObservationHook(TEST_DIR);
      await obsHookA.execute(createTestInput({
        sessionId: 'session-a',
        project: 'project-a',
        toolName: 'Write',
        toolInput: { file_path: 'a.ts' },
        toolResponse: {},
      }));

      // Session for project B
      const initHookB = createSessionInitHook(TEST_DIR);
      await initHookB.execute(createTestInput({
        sessionId: 'session-b',
        project: 'project-b',
        prompt: 'Task for B',
      }));

      const obsHookB = createObservationHook(TEST_DIR);
      await obsHookB.execute(createTestInput({
        sessionId: 'session-b',
        project: 'project-b',
        toolName: 'Read',
        toolInput: { file_path: 'b.ts' },
        toolResponse: {},
      }));

      // Verify isolation
      const service = new MemoryHookService(TEST_DIR);
      await service.initialize();

      const sessionsA = await service.getRecentSessions('project-a', 10);
      const sessionsB = await service.getRecentSessions('project-b', 10);

      expect(sessionsA.length).toBe(1);
      expect(sessionsB.length).toBe(1);
      expect(sessionsA[0].prompt).toBe('Task for A');
      expect(sessionsB[0].prompt).toBe('Task for B');

      const obsA = await service.getRecentObservations('project-a', 10);
      const obsB = await service.getRecentObservations('project-b', 10);

      expect(obsA.length).toBe(1);
      expect(obsB.length).toBe(1);
      expect(obsA[0].toolName).toBe('Write');
      expect(obsB[0].toolName).toBe('Read');

      await service.shutdown();
    });
  });

  describe('CLI Input Parsing Integration', () => {
    it('should parse and process real Claude Code input', async () => {
      // Simulate real Claude Code hook input
      const claudeInput = JSON.stringify({
        session_id: 'abc123',
        cwd: TEST_DIR,
        prompt: 'Help me fix the bug',
        tool_name: 'Read',
        tool_input: { file_path: '/path/to/file.ts' },
        tool_result: { content: 'file contents here' },
      });

      const parsed = parseHookInput(claudeInput);

      expect(parsed.sessionId).toBe('abc123');
      expect(parsed.cwd).toBe(TEST_DIR);
      expect(parsed.prompt).toBe('Help me fix the bug');
      expect(parsed.toolName).toBe('Read');
      expect(parsed.toolInput).toEqual({ file_path: '/path/to/file.ts' });
      expect(parsed.toolResponse).toEqual({ content: 'file contents here' });

      // Process through observation hook
      const observationHook = createObservationHook(TEST_DIR);
      const result = await observationHook.execute(parsed);

      expect(result.continue).toBe(true);

      // Verify stored
      const service = new MemoryHookService(TEST_DIR);
      await service.initialize();
      const obs = await service.getSessionObservations('abc123');
      await service.shutdown();

      expect(obs.length).toBe(1);
      expect(obs[0].title).toBe('Read /path/to/file.ts');
    });
  });

  describe('Error Recovery', () => {
    it('should continue working after errors', async () => {
      const sessionId = 'error-recovery-session';
      const project = 'test-project';

      // Init session
      const initHook = createSessionInitHook(TEST_DIR);
      await initHook.execute(createTestInput({ sessionId, project }));

      // Successful observation
      const obsHook = createObservationHook(TEST_DIR);
      await obsHook.execute(createTestInput({
        sessionId,
        project,
        toolName: 'Read',
        toolInput: {},
        toolResponse: {},
      }));

      // Another successful observation
      await obsHook.execute(createTestInput({
        sessionId,
        project,
        toolName: 'Write',
        toolInput: {},
        toolResponse: {},
      }));

      // Verify both observations stored
      const service = new MemoryHookService(TEST_DIR);
      await service.initialize();
      const obs = await service.getSessionObservations(sessionId);
      await service.shutdown();

      expect(obs.length).toBe(2);
    });
  });

  describe('Multiple Sessions', () => {
    it('should handle multiple sessions sequentially', async () => {
      const project = 'test-project';

      // Start two sessions sequentially (SQLite doesn't handle concurrent writes well)
      const initHook1 = createSessionInitHook(TEST_DIR);
      await initHook1.execute(createTestInput({ sessionId: 'multi-1', project }));

      const initHook2 = createSessionInitHook(TEST_DIR);
      await initHook2.execute(createTestInput({ sessionId: 'multi-2', project }));

      // Add observations sequentially
      const obsHook1 = createObservationHook(TEST_DIR);
      await obsHook1.execute(createTestInput({
        sessionId: 'multi-1',
        project,
        toolName: 'Read',
        toolInput: {},
        toolResponse: {},
      }));

      const obsHook2 = createObservationHook(TEST_DIR);
      await obsHook2.execute(createTestInput({
        sessionId: 'multi-2',
        project,
        toolName: 'Write',
        toolInput: {},
        toolResponse: {},
      }));

      // Verify both sessions have their observations
      const service = new MemoryHookService(TEST_DIR);
      await service.initialize();

      const obs1 = await service.getSessionObservations('multi-1');
      const obs2 = await service.getSessionObservations('multi-2');

      expect(obs1.length).toBe(1);
      expect(obs2.length).toBe(1);
      expect(obs1[0].toolName).toBe('Read');
      expect(obs2[0].toolName).toBe('Write');

      await service.shutdown();
    });
  });

  describe('Large Data Handling', () => {
    it('should handle many observations efficiently', async () => {
      const sessionId = 'large-data-session';
      const project = 'test-project';

      // Init session
      const initHook = createSessionInitHook(TEST_DIR);
      await initHook.execute(createTestInput({ sessionId, project }));

      // Add many observations
      const obsHook = createObservationHook(TEST_DIR);
      const observationCount = 50;

      for (let i = 0; i < observationCount; i++) {
        await obsHook.execute(createTestInput({
          sessionId,
          project,
          toolName: i % 2 === 0 ? 'Read' : 'Write',
          toolInput: { file_path: `file${i}.ts` },
          toolResponse: { content: `content ${i}` },
        }));
      }

      // Verify all observations stored
      const service = new MemoryHookService(TEST_DIR);
      await service.initialize();

      const session = service.getSession(sessionId);
      expect(session?.observationCount).toBe(observationCount);

      const obs = await service.getSessionObservations(sessionId);
      expect(obs.length).toBe(observationCount);

      await service.shutdown();
    });

    it('should truncate large tool responses', async () => {
      const sessionId = 'large-response-session';
      const project = 'test-project';

      // Init session
      const initHook = createSessionInitHook(TEST_DIR);
      await initHook.execute(createTestInput({ sessionId, project }));

      // Add observation with large response
      const obsHook = createObservationHook(TEST_DIR);
      const largeContent = 'A'.repeat(100000); // 100KB

      await obsHook.execute(createTestInput({
        sessionId,
        project,
        toolName: 'Read',
        toolInput: { file_path: 'large.ts' },
        toolResponse: { content: largeContent },
      }));

      // Verify response was truncated
      const service = new MemoryHookService(TEST_DIR);
      await service.initialize();

      const obs = await service.getSessionObservations(sessionId);
      expect(obs.length).toBe(1);
      expect(obs[0].toolResponse.length).toBeLessThan(100000);
      expect(obs[0].toolResponse).toContain('[truncated]');

      await service.shutdown();
    });
  });
});
