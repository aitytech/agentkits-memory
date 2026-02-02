/**
 * Unit Tests for Hook Handlers
 *
 * @module @agentkits/memory/hooks/__tests__/handlers
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { NormalizedHookInput } from '../types.js';
import { MemoryHookService } from '../service.js';
import { ContextHook, createContextHook } from '../context.js';
import { SessionInitHook, createSessionInitHook } from '../session-init.js';
import { ObservationHook, createObservationHook } from '../observation.js';
import { SummarizeHook, createSummarizeHook } from '../summarize.js';

const TEST_DIR = path.join(process.cwd(), '.test-hook-handlers');

// Track hooks for cleanup
let activeHooks: Array<{ shutdown: () => Promise<void> }> = [];

function createTestInput(overrides: Partial<NormalizedHookInput> = {}): NormalizedHookInput {
  return {
    sessionId: 'test-session-123',
    cwd: TEST_DIR,
    project: 'test-project',
    timestamp: Date.now(),
    ...overrides,
  };
}

// Helper to track hooks for cleanup
function trackHook<T extends { shutdown: () => Promise<void> }>(hook: T): T {
  activeHooks.push(hook);
  return hook;
}

describe('Hook Handlers', () => {
  beforeEach(() => {
    activeHooks = [];
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      try {
        rmSync(TEST_DIR, { recursive: true });
      } catch {
        // Ignore errors on Windows
      }
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Shutdown all hooks first (releases database locks)
    for (const hook of activeHooks) {
      try {
        await hook.shutdown();
      } catch {
        // Ignore shutdown errors
      }
    }
    activeHooks = [];

    // Small delay for Windows file system
    await new Promise((r) => setTimeout(r, 100));

    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      try {
        rmSync(TEST_DIR, { recursive: true });
      } catch {
        // Ignore errors on Windows - files may still be locked
      }
    }
  });

  describe('ContextHook', () => {
    it('should return no context for new project', async () => {
      const hook = trackHook(createContextHook(TEST_DIR));
      const input = createTestInput();

      const result = await hook.execute(input);

      expect(result.continue).toBe(true);
      expect(result.suppressOutput).toBe(true);
      expect(result.additionalContext).toBeUndefined();
    });

    it('should return context for existing project', async () => {
      // Set up existing data
      const service = new MemoryHookService(TEST_DIR);
      await service.initSession('old-session', 'test-project', 'Previous task');
      await service.storeObservation('old-session', 'test-project', 'Read', { file_path: 'file.ts' }, {}, TEST_DIR);
      await service.completeSession('old-session', 'Done');
      await service.shutdown();

      // Run context hook
      const hook = trackHook(createContextHook(TEST_DIR));
      const input = createTestInput({ sessionId: 'new-session' });

      const result = await hook.execute(input);

      expect(result.continue).toBe(true);
      expect(result.suppressOutput).toBe(false);
      expect(result.additionalContext).toBeDefined();
      expect(result.additionalContext).toContain('# Memory Context');
      expect(result.additionalContext).toContain('test-project');
    });

    it('should handle errors gracefully', async () => {
      // Create hook with invalid directory
      const hook = new ContextHook({
        initialize: async () => { throw new Error('Test error'); },
      } as unknown as MemoryHookService);

      const input = createTestInput();
      const result = await hook.execute(input);

      expect(result.continue).toBe(true);
      expect(result.suppressOutput).toBe(true);
      expect(result.error).toBeDefined();
    });
  });

  describe('SessionInitHook', () => {
    it('should initialize a new session', async () => {
      const hook = trackHook(createSessionInitHook(TEST_DIR));
      const input = createTestInput({ prompt: 'Hello Claude' });

      const result = await hook.execute(input);

      expect(result.continue).toBe(true);
      expect(result.suppressOutput).toBe(true);

      // Shutdown hook before verifying
      await hook.shutdown();

      // Verify session was created
      const service = new MemoryHookService(TEST_DIR);
      await service.initialize();
      const session = service.getSession('test-session-123');
      await service.shutdown();

      expect(session).not.toBeNull();
      expect(session?.prompt).toBe('Hello Claude');
    });

    it('should not overwrite existing session', async () => {
      // Create initial session
      const hook1 = trackHook(createSessionInitHook(TEST_DIR));
      await hook1.execute(createTestInput({ prompt: 'First prompt' }));
      await hook1.shutdown();

      // Try to re-init with different prompt
      const hook2 = trackHook(createSessionInitHook(TEST_DIR));
      await hook2.execute(createTestInput({ prompt: 'Second prompt' }));
      await hook2.shutdown();

      // Verify original prompt preserved
      const service = new MemoryHookService(TEST_DIR);
      await service.initialize();
      const session = service.getSession('test-session-123');
      await service.shutdown();

      expect(session?.prompt).toBe('First prompt');
    });

    it('should handle errors gracefully', async () => {
      const hook = new SessionInitHook({
        initialize: async () => { throw new Error('Test error'); },
      } as unknown as MemoryHookService);

      const input = createTestInput();
      const result = await hook.execute(input);

      expect(result.continue).toBe(true);
      expect(result.suppressOutput).toBe(true);
      expect(result.error).toBeDefined();
    });
  });

  describe('ObservationHook', () => {
    it('should store observation', async () => {
      // Initialize session first
      const initHook = trackHook(createSessionInitHook(TEST_DIR));
      await initHook.execute(createTestInput());
      await initHook.shutdown();

      // Store observation
      const hook = trackHook(createObservationHook(TEST_DIR));
      const input = createTestInput({
        toolName: 'Read',
        toolInput: { file_path: '/path/to/file.ts' },
        toolResponse: { content: 'file contents' },
      });

      const result = await hook.execute(input);
      await hook.shutdown();

      expect(result.continue).toBe(true);
      expect(result.suppressOutput).toBe(true);

      // Verify observation was stored
      const service = new MemoryHookService(TEST_DIR);
      await service.initialize();
      const observations = await service.getSessionObservations('test-session-123');
      await service.shutdown();

      expect(observations.length).toBe(1);
      expect(observations[0].toolName).toBe('Read');
    });

    it('should skip if no tool name', async () => {
      const hook = trackHook(createObservationHook(TEST_DIR));
      const input = createTestInput({ toolName: undefined });

      const result = await hook.execute(input);

      expect(result.continue).toBe(true);
      expect(result.suppressOutput).toBe(true);
    });

    it('should skip internal tools', async () => {
      // Initialize session first
      const initHook = trackHook(createSessionInitHook(TEST_DIR));
      await initHook.execute(createTestInput());
      await initHook.shutdown();

      const hook = trackHook(createObservationHook(TEST_DIR));

      // Test skipped tools
      for (const tool of ['TodoWrite', 'TodoRead', 'AskFollowupQuestion', 'AttemptCompletion']) {
        const input = createTestInput({ toolName: tool });
        const result = await hook.execute(input);

        expect(result.continue).toBe(true);
        expect(result.suppressOutput).toBe(true);
      }
      await hook.shutdown();

      // Verify no observations stored
      const service = new MemoryHookService(TEST_DIR);
      await service.initialize();
      const observations = await service.getSessionObservations('test-session-123');
      await service.shutdown();

      expect(observations.length).toBe(0);
    });

    it('should create session if not exists', async () => {
      const hook = trackHook(createObservationHook(TEST_DIR));
      const input = createTestInput({
        sessionId: 'new-session',
        toolName: 'Read',
        toolInput: {},
        toolResponse: {},
      });

      const result = await hook.execute(input);
      await hook.shutdown();

      expect(result.continue).toBe(true);

      // Verify session was created
      const service = new MemoryHookService(TEST_DIR);
      await service.initialize();
      const session = service.getSession('new-session');
      await service.shutdown();

      expect(session).not.toBeNull();
    });

    it('should handle errors gracefully', async () => {
      const hook = new ObservationHook({
        initialize: async () => { throw new Error('Test error'); },
      } as unknown as MemoryHookService);

      const input = createTestInput({ toolName: 'Read' });
      const result = await hook.execute(input);

      expect(result.continue).toBe(true);
      expect(result.suppressOutput).toBe(true);
      expect(result.error).toBeDefined();
    });
  });

  describe('SummarizeHook', () => {
    it('should complete session with summary', async () => {
      // Set up session with observations
      const service = new MemoryHookService(TEST_DIR);
      await service.initSession('test-session-123', 'test-project');
      await service.storeObservation('test-session-123', 'test-project', 'Read', { file_path: 'a.ts' }, {}, TEST_DIR);
      await service.storeObservation('test-session-123', 'test-project', 'Write', { file_path: 'b.ts' }, {}, TEST_DIR);
      await service.shutdown();

      // Run summarize hook (it already calls shutdown internally)
      const hook = trackHook(createSummarizeHook(TEST_DIR));
      const input = createTestInput();

      const result = await hook.execute(input);

      expect(result.continue).toBe(true);
      expect(result.suppressOutput).toBe(true);

      // Verify session was completed
      const service2 = new MemoryHookService(TEST_DIR);
      await service2.initialize();
      const session = service2.getSession('test-session-123');
      await service2.shutdown();

      expect(session?.status).toBe('completed');
      expect(session?.summary).toBeDefined();
      expect(session?.summary).toContain('file');
    });

    it('should handle non-existent session', async () => {
      const hook = trackHook(createSummarizeHook(TEST_DIR));
      const input = createTestInput({ sessionId: 'non-existent' });

      const result = await hook.execute(input);

      expect(result.continue).toBe(true);
      expect(result.suppressOutput).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      const hook = new SummarizeHook({
        initialize: async () => { throw new Error('Test error'); },
        shutdown: async () => {},
      } as unknown as MemoryHookService);

      const input = createTestInput();
      const result = await hook.execute(input);

      expect(result.continue).toBe(true);
      expect(result.suppressOutput).toBe(true);
      expect(result.error).toBeDefined();
    });
  });
});
