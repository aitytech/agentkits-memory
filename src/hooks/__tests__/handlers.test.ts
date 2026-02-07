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
import { UserMessageHook, createUserMessageHook } from '../user-message.js';

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
    it('should return empty-state guidance for new project', async () => {
      const hook = trackHook(createContextHook(TEST_DIR));
      const input = createTestInput();

      const result = await hook.execute(input);

      expect(result.continue).toBe(true);
      expect(result.suppressOutput).toBe(false);
      // Should inject guidance even on empty state
      expect(result.additionalContext).toBeDefined();
      expect(result.additionalContext).toContain('Memory tools available');
      expect(result.additionalContext).toContain('memory_save');
      expect(result.additionalContext).toContain('Do NOT call');
    });

    it('should return context with prompts and summaries', async () => {
      // Set up session with prompts, observations, and structured summary
      const service = new MemoryHookService(TEST_DIR);
      await service.initSession('old-session', 'test-project', 'Implement auth');
      await service.saveUserPrompt('old-session', 'test-project', 'Implement auth');
      await service.saveUserPrompt('old-session', 'test-project', 'Add tests');
      await service.storeObservation('old-session', 'test-project', 'Read', { file_path: 'file.ts' }, {}, TEST_DIR);
      await service.storeObservation('old-session', 'test-project', 'Write', { file_path: 'auth.ts' }, {}, TEST_DIR);

      // Save structured summary
      await service.saveSessionSummary({
        sessionId: 'old-session',
        project: 'test-project',
        request: '[#1] Implement auth → [#2] Add tests',
        completed: '2 file(s) modified',
        filesRead: ['file.ts'],
        filesModified: ['auth.ts'],
        nextSteps: 'Deploy to staging',
        notes: '',
        promptNumber: 2,
      });

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
      expect(result.additionalContext).toContain('Previous Session Summaries');
      expect(result.additionalContext).toContain('Implement auth');
      expect(result.additionalContext).toContain('Recent User Prompts');
      expect(result.additionalContext).toContain('Add tests');
      expect(result.additionalContext).toContain('auth.ts');
      // Should include tool-usage instructions
      expect(result.additionalContext).toContain('Memory tools available');
      expect(result.additionalContext).toContain('memory_search');
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
      expect(typeof result.error).toBe('string');
      expect(result.error!.length).toBeGreaterThan(0);
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

    it('should save all user prompts (not just first)', async () => {
      // First prompt
      const hook1 = trackHook(createSessionInitHook(TEST_DIR));
      await hook1.execute(createTestInput({ prompt: 'First prompt' }));
      await hook1.shutdown();

      // Second prompt (same session)
      const hook2 = trackHook(createSessionInitHook(TEST_DIR));
      await hook2.execute(createTestInput({ prompt: 'Second prompt' }));
      await hook2.shutdown();

      // Third prompt
      const hook3 = trackHook(createSessionInitHook(TEST_DIR));
      await hook3.execute(createTestInput({ prompt: 'Third prompt' }));
      await hook3.shutdown();

      // Verify session prompt still has first prompt
      const service = new MemoryHookService(TEST_DIR);
      await service.initialize();
      const session = service.getSession('test-session-123');

      expect(session?.prompt).toBe('First prompt');

      // Verify ALL prompts are saved in user_prompts table
      const prompts = await service.getSessionPrompts('test-session-123');
      await service.shutdown();

      expect(prompts.length).toBe(3);
      expect(prompts[0].promptNumber).toBe(1);
      expect(prompts[0].promptText).toBe('First prompt');
      expect(prompts[1].promptNumber).toBe(2);
      expect(prompts[1].promptText).toBe('Second prompt');
      expect(prompts[2].promptNumber).toBe(3);
      expect(prompts[2].promptText).toBe('Third prompt');
    });

    it('should not save prompt when prompt is empty', async () => {
      const hook = trackHook(createSessionInitHook(TEST_DIR));
      await hook.execute(createTestInput({ prompt: undefined }));
      await hook.shutdown();

      const service = new MemoryHookService(TEST_DIR);
      await service.initialize();
      const prompts = await service.getSessionPrompts('test-session-123');
      await service.shutdown();

      expect(prompts.length).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      const hook = new SessionInitHook({
        initialize: async () => { throw new Error('Test error'); },
      } as unknown as MemoryHookService);

      const input = createTestInput();
      const result = await hook.execute(input);

      expect(result.continue).toBe(true);
      expect(result.suppressOutput).toBe(true);
      expect(typeof result.error).toBe('string');
      expect(result.error!.length).toBeGreaterThan(0);
    });
  });

  describe('ObservationHook', () => {
    it('should store observation with prompt number', async () => {
      // Initialize session and save a prompt
      const initHook = trackHook(createSessionInitHook(TEST_DIR));
      await initHook.execute(createTestInput({ prompt: 'Fix the bug' }));
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

      // Verify observation was stored with prompt number
      const service = new MemoryHookService(TEST_DIR);
      await service.initialize();
      const observations = await service.getSessionObservations('test-session-123');
      await service.shutdown();

      expect(observations.length).toBe(1);
      expect(observations[0].toolName).toBe('Read');
      expect(observations[0].promptNumber).toBe(1);
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
        toolInput: { file_path: '/test/file.ts' },
        toolResponse: { content: 'test' },
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

    it('should return fast with template data (no AI blocking)', async () => {
      // Initialize session
      const initHook = trackHook(createSessionInitHook(TEST_DIR));
      await initHook.execute(createTestInput({ prompt: 'Test task' }));
      await initHook.shutdown();

      const hook = trackHook(createObservationHook(TEST_DIR));
      const input = createTestInput({
        toolName: 'Read',
        toolInput: { file_path: '/path/to/auth.ts' },
        toolResponse: { content: 'export class Auth {}' },
      });

      // Measure execution time — should be fast (<500ms) since AI is fire-and-forget
      const start = Date.now();
      const result = await hook.execute(input);
      const elapsed = Date.now() - start;
      await hook.shutdown();

      expect(result.continue).toBe(true);
      expect(result.suppressOutput).toBe(true);
      // Should complete quickly (template-only, no AI blocking)
      expect(elapsed).toBeLessThan(2000);

      // Verify template data was stored immediately
      const service = new MemoryHookService(TEST_DIR);
      await service.initialize();
      const observations = await service.getSessionObservations('test-session-123');
      await service.shutdown();

      expect(observations.length).toBe(1);
      expect(typeof observations[0].subtitle).toBe('string');
      expect(observations[0].subtitle.length).toBeGreaterThan(0);
      expect(typeof observations[0].narrative).toBe('string');
      expect(observations[0].narrative.length).toBeGreaterThan(0);
    });

    it('should not spawn enrichment when AGENTKITS_AI_ENRICHMENT=false', async () => {
      const originalEnv = process.env.AGENTKITS_AI_ENRICHMENT;
      process.env.AGENTKITS_AI_ENRICHMENT = 'false';

      try {
        const initHook = trackHook(createSessionInitHook(TEST_DIR));
        await initHook.execute(createTestInput({ prompt: 'Test' }));
        await initHook.shutdown();

        const hook = trackHook(createObservationHook(TEST_DIR));
        const input = createTestInput({
          toolName: 'Write',
          toolInput: { file_path: 'test.ts' },
          toolResponse: {},
        });

        const result = await hook.execute(input);
        await hook.shutdown();

        // Should still store observation successfully
        expect(result.continue).toBe(true);

        const service = new MemoryHookService(TEST_DIR);
        await service.initialize();
        const observations = await service.getSessionObservations('test-session-123');
        await service.shutdown();

        expect(observations.length).toBe(1);
        expect(observations[0].toolName).toBe('Write');
      } finally {
        if (originalEnv === undefined) {
          delete process.env.AGENTKITS_AI_ENRICHMENT;
        } else {
          process.env.AGENTKITS_AI_ENRICHMENT = originalEnv;
        }
      }
    });

    it('should skip empty/no-op tool calls (both input and response are {})', async () => {
      const hook = trackHook(createObservationHook(TEST_DIR));
      const input = createTestInput({
        toolName: 'Read',
        toolInput: {},
        toolResponse: {},
      });

      const result = await hook.execute(input);

      expect(result.continue).toBe(true);
      expect(result.suppressOutput).toBe(true);

      // Should NOT initialize service or store anything
      // Verify by checking no observations exist
      const service = new MemoryHookService(TEST_DIR);
      await service.initialize();
      const observations = await service.getSessionObservations('test-session-123');
      await service.shutdown();

      expect(observations.length).toBe(0);
    });

    it('should skip when toolInput is undefined and toolResponse is undefined', async () => {
      const hook = trackHook(createObservationHook(TEST_DIR));
      const input = createTestInput({
        toolName: 'Bash',
        toolInput: undefined,
        toolResponse: undefined,
      });

      const result = await hook.execute(input);

      expect(result.continue).toBe(true);
      expect(result.suppressOutput).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      const hook = new ObservationHook({
        initialize: async () => { throw new Error('Test error'); },
      } as unknown as MemoryHookService);

      const input = createTestInput({
        toolName: 'Read',
        toolInput: { file_path: '/test/file.ts' },
        toolResponse: { content: 'test' },
      });
      const result = await hook.execute(input);

      expect(result.continue).toBe(true);
      expect(result.suppressOutput).toBe(true);
      expect(typeof result.error).toBe('string');
      expect(result.error!.length).toBeGreaterThan(0);
    });
  });

  describe('SummarizeHook', () => {
    it('should complete session with structured summary', async () => {
      // Set up session with prompts and observations
      const service = new MemoryHookService(TEST_DIR);
      await service.initSession('test-session-123', 'test-project', 'Fix authentication bug');
      await service.saveUserPrompt('test-session-123', 'test-project', 'Fix authentication bug');
      await service.storeObservation('test-session-123', 'test-project', 'Read', { file_path: 'auth.ts' }, {}, TEST_DIR);
      await service.storeObservation('test-session-123', 'test-project', 'Write', { file_path: 'auth.ts' }, {}, TEST_DIR);
      await service.storeObservation('test-session-123', 'test-project', 'Bash', { command: 'npm test' }, {}, TEST_DIR);
      await service.shutdown();

      // Run summarize hook
      const hook = trackHook(createSummarizeHook(TEST_DIR));
      const input = createTestInput();

      const result = await hook.execute(input);

      expect(result.continue).toBe(true);
      expect(result.suppressOutput).toBe(true);

      // Verify session was completed with text summary
      const service2 = new MemoryHookService(TEST_DIR);
      await service2.initialize();
      const session = service2.getSession('test-session-123');

      expect(session?.status).toBe('completed');
      expect(typeof session?.summary).toBe('string');
      expect(session?.summary).toContain('Request:');
      expect(session?.summary).toContain('Fix authentication bug');

      // Verify structured summary was saved
      const summaries = await service2.getRecentSummaries('test-project');
      await service2.shutdown();

      expect(summaries.length).toBe(1);
      expect(summaries[0].request).toContain('Fix authentication bug');
      expect(summaries[0].filesRead).toContain('auth.ts');
      expect(summaries[0].filesModified).toContain('auth.ts');
      expect(summaries[0].completed).toContain('file(s) modified');
      expect(summaries[0].notes).toContain('npm test');
    });

    it('should handle non-existent session', async () => {
      const hook = trackHook(createSummarizeHook(TEST_DIR));
      const input = createTestInput({ sessionId: 'non-existent' });

      const result = await hook.execute(input);

      expect(result.continue).toBe(true);
      expect(result.suppressOutput).toBe(true);
    });

    it('should spawn enrich worker when AI enrichment is enabled', async () => {
      const originalEnv = process.env.AGENTKITS_AI_ENRICHMENT;
      process.env.AGENTKITS_AI_ENRICHMENT = 'true';

      try {
        // Set up session with observations
        const service = new MemoryHookService(TEST_DIR);
        await service.initSession('test-session-123', 'test-project', 'Test task');
        await service.storeObservation('test-session-123', 'test-project', 'Read', { file_path: 'a.ts' }, {}, TEST_DIR);
        await service.shutdown();

        // Run summarize hook
        const hook = trackHook(createSummarizeHook(TEST_DIR));
        const input = createTestInput();

        const result = await hook.execute(input);

        // Hook should still succeed (worker spawn is fire-and-forget)
        expect(result.continue).toBe(true);
        expect(result.suppressOutput).toBe(true);
      } finally {
        if (originalEnv === undefined) {
          delete process.env.AGENTKITS_AI_ENRICHMENT;
        } else {
          process.env.AGENTKITS_AI_ENRICHMENT = originalEnv;
        }
      }
    });

    it('should spawn enrich-summary process when AI enrichment enabled and transcriptPath provided', async () => {
      const originalEnv = process.env.AGENTKITS_AI_ENRICHMENT;
      process.env.AGENTKITS_AI_ENRICHMENT = 'true';

      try {
        // Set up session
        const service = new MemoryHookService(TEST_DIR);
        await service.initSession('test-session-123', 'test-project', 'Test task');
        await service.storeObservation('test-session-123', 'test-project', 'Read', { file_path: 'a.ts' }, {}, TEST_DIR);
        await service.shutdown();

        // Run summarize hook with transcriptPath
        const hook = trackHook(createSummarizeHook(TEST_DIR));
        const input = createTestInput({
          transcriptPath: '/tmp/test-transcript.jsonl',
        });

        const result = await hook.execute(input);

        // Hook should still succeed (spawn is fire-and-forget, spawn failure is caught)
        expect(result.continue).toBe(true);
        expect(result.suppressOutput).toBe(true);
      } finally {
        if (originalEnv === undefined) {
          delete process.env.AGENTKITS_AI_ENRICHMENT;
        } else {
          process.env.AGENTKITS_AI_ENRICHMENT = originalEnv;
        }
      }
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
      expect(typeof result.error).toBe('string');
      expect(result.error!.length).toBeGreaterThan(0);
    });
  });

  describe('UserMessageHook', () => {
    it('should display status for new project (no context)', async () => {
      const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const hook = trackHook(createUserMessageHook(TEST_DIR));
      const input = createTestInput();

      const result = await hook.execute(input);

      expect(result.continue).toBe(true);
      expect(result.suppressOutput).toBe(true);
      // Should write to stderr
      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('AgentKits Memory Loaded');
      expect(output).toContain('Fresh memory');
      expect(output).toContain('memory_save');
      stderrSpy.mockRestore();
    });

    it('should display stats when context exists', async () => {
      // Set up session with observations and prompts
      const service = new MemoryHookService(TEST_DIR);
      await service.initSession('old-session', 'test-project', 'Test task');
      await service.saveUserPrompt('old-session', 'test-project', 'Test task');
      await service.storeObservation('old-session', 'test-project', 'Read', { file_path: 'file.ts' }, {}, TEST_DIR);
      await service.completeSession('old-session', 'Done');
      await service.shutdown();

      const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const hook = trackHook(createUserMessageHook(TEST_DIR));
      const input = createTestInput({ sessionId: 'new-session' });

      const result = await hook.execute(input);

      expect(result.continue).toBe(true);
      expect(result.suppressOutput).toBe(true);
      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('AgentKits Memory Loaded');
      expect(output).toContain('observation');
      expect(output).toContain('memory_search');
      stderrSpy.mockRestore();
    });

    it('should handle errors gracefully', async () => {
      const hook = new UserMessageHook({
        initialize: async () => { throw new Error('Test error'); },
      } as unknown as MemoryHookService);

      const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const input = createTestInput();
      const result = await hook.execute(input);

      expect(result.continue).toBe(true);
      expect(result.suppressOutput).toBe(true);
      expect(typeof result.error).toBe('string');
      expect(result.error!.length).toBeGreaterThan(0);
      stderrSpy.mockRestore();
    });
  });
});
