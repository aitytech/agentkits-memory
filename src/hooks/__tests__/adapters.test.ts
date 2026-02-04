/**
 * Tests for Hook Platform Adapters
 *
 * @module @agentkits/memory/hooks/__tests__/adapters.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ClaudeCodeAdapter } from '../adapters/claude-code-adapter.js';
import { OpenCodeAdapter } from '../adapters/opencode-adapter.js';
import { GenericAdapter } from '../adapters/generic-adapter.js';
import { resolveAdapter } from '../adapters/platform-adapter.js';
import type { HookResult } from '../types.js';

describe('Platform Adapters', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  // ===== resolveAdapter =====

  describe('resolveAdapter', () => {
    beforeEach(() => {
      delete process.env.AGENTKITS_PLATFORM;
    });

    it('should default to claude-code when no env var', () => {
      const adapter = resolveAdapter();
      expect(adapter.name).toBe('claude-code');
    });

    it('should resolve opencode from env var', () => {
      process.env.AGENTKITS_PLATFORM = 'opencode';
      const adapter = resolveAdapter();
      expect(adapter.name).toBe('opencode');
    });

    it('should resolve generic from env var', () => {
      process.env.AGENTKITS_PLATFORM = 'generic';
      const adapter = resolveAdapter();
      expect(adapter.name).toBe('generic');
    });

    it('should resolve claude-code from env var', () => {
      process.env.AGENTKITS_PLATFORM = 'claude-code';
      const adapter = resolveAdapter();
      expect(adapter.name).toBe('claude-code');
    });

    it('should fall back to claude-code for unknown platform', () => {
      process.env.AGENTKITS_PLATFORM = 'unknown-platform';
      const adapter = resolveAdapter();
      expect(adapter.name).toBe('claude-code');
    });
  });

  // ===== ClaudeCodeAdapter =====

  describe('ClaudeCodeAdapter', () => {
    const adapter = new ClaudeCodeAdapter();

    it('should have name claude-code', () => {
      expect(adapter.name).toBe('claude-code');
    });

    it('should support all 5 events', () => {
      expect(adapter.supportedEvents).toContain('context');
      expect(adapter.supportedEvents).toContain('session-init');
      expect(adapter.supportedEvents).toContain('observation');
      expect(adapter.supportedEvents).toContain('summarize');
      expect(adapter.supportedEvents).toContain('user-message');
    });

    describe('parseInput', () => {
      it('should parse valid Claude Code JSON', () => {
        const input = JSON.stringify({
          session_id: 'test-session',
          cwd: '/test/project',
          prompt: 'Hello world',
          tool_name: 'Edit',
          tool_input: { file_path: '/test/file.ts' },
          tool_result: 'success',
          transcript_path: '/test/transcript.jsonl',
          stop_reason: 'user',
        });

        const result = adapter.parseInput(input);
        expect(result.sessionId).toBe('test-session');
        expect(result.cwd).toBe('/test/project');
        expect(result.project).toBe('project');
        expect(result.prompt).toBe('Hello world');
        expect(result.toolName).toBe('Edit');
        expect(result.toolInput).toEqual({ file_path: '/test/file.ts' });
        expect(result.toolResponse).toBe('success');
        expect(result.transcriptPath).toBe('/test/transcript.jsonl');
        expect(result.stopReason).toBe('user');
        expect(result.timestamp).toBeGreaterThan(0);
      });

      it('should generate session ID when missing', () => {
        const result = adapter.parseInput(JSON.stringify({ cwd: '/test' }));
        expect(result.sessionId).toMatch(/^session_/);
      });

      it('should use process.cwd() when cwd missing', () => {
        const result = adapter.parseInput(JSON.stringify({ session_id: 'x' }));
        expect(result.cwd).toBe(process.cwd());
      });

      it('should handle invalid JSON gracefully', () => {
        const result = adapter.parseInput('not json');
        expect(result.sessionId).toMatch(/^session_/);
        expect(result.cwd).toBe(process.cwd());
      });

      it('should handle empty string', () => {
        const result = adapter.parseInput('');
        expect(result.sessionId).toMatch(/^session_/);
      });
    });

    describe('formatOutput', () => {
      it('should format result with additionalContext as SessionStart', () => {
        const result: HookResult = {
          continue: true,
          suppressOutput: false,
          additionalContext: 'Memory context here',
        };

        const output = JSON.parse(adapter.formatOutput(result));
        expect(output.hookSpecificOutput).toBeDefined();
        expect(output.hookSpecificOutput.hookEventName).toBe('SessionStart');
        expect(output.hookSpecificOutput.additionalContext).toBe('Memory context here');
      });

      it('should format standard response without context', () => {
        const result: HookResult = {
          continue: true,
          suppressOutput: true,
        };

        const output = JSON.parse(adapter.formatOutput(result));
        expect(output.continue).toBe(true);
        expect(output.suppressOutput).toBe(true);
        expect(output.hookSpecificOutput).toBeUndefined();
      });
    });
  });

  // ===== OpenCodeAdapter =====

  describe('OpenCodeAdapter', () => {
    const adapter = new OpenCodeAdapter();

    it('should have name opencode', () => {
      expect(adapter.name).toBe('opencode');
    });

    it('should support 4 events (no user-message)', () => {
      expect(adapter.supportedEvents).toContain('context');
      expect(adapter.supportedEvents).toContain('session-init');
      expect(adapter.supportedEvents).toContain('observation');
      expect(adapter.supportedEvents).toContain('summarize');
      expect(adapter.supportedEvents).not.toContain('user-message');
    });

    describe('parseInput', () => {
      it('should parse same format as Claude Code', () => {
        const input = JSON.stringify({
          session_id: 'oc-session',
          cwd: '/test/oc',
          prompt: 'Test prompt',
          tool_name: 'Bash',
        });

        const result = adapter.parseInput(input);
        expect(result.sessionId).toBe('oc-session');
        expect(result.cwd).toBe('/test/oc');
        expect(result.prompt).toBe('Test prompt');
        expect(result.toolName).toBe('Bash');
      });

      it('should handle invalid JSON', () => {
        const result = adapter.parseInput('broken');
        expect(result.sessionId).toMatch(/^session_/);
      });
    });

    describe('formatOutput', () => {
      it('should include additionalContext at top level', () => {
        const result: HookResult = {
          continue: true,
          suppressOutput: false,
          additionalContext: 'context text',
        };

        const output = JSON.parse(adapter.formatOutput(result));
        expect(output.continue).toBe(true);
        expect(output.additionalContext).toBe('context text');
        // OpenCode doesn't use hookSpecificOutput
        expect(output.hookSpecificOutput).toBeUndefined();
      });

      it('should include error when present', () => {
        const result: HookResult = {
          continue: true,
          suppressOutput: true,
          error: 'Something went wrong',
        };

        const output = JSON.parse(adapter.formatOutput(result));
        expect(output.error).toBe('Something went wrong');
      });

      it('should output minimal JSON without context or error', () => {
        const result: HookResult = {
          continue: true,
          suppressOutput: true,
        };

        const output = JSON.parse(adapter.formatOutput(result));
        expect(output.continue).toBe(true);
        expect(output.additionalContext).toBeUndefined();
        expect(output.error).toBeUndefined();
      });
    });
  });

  // ===== GenericAdapter =====

  describe('GenericAdapter', () => {
    const adapter = new GenericAdapter();

    it('should have name generic', () => {
      expect(adapter.name).toBe('generic');
    });

    describe('parseInput', () => {
      it('should parse camelCase fields', () => {
        const input = JSON.stringify({
          sessionId: 'gen-session',
          cwd: '/test/gen',
          prompt: 'Test',
          toolName: 'Read',
          toolInput: { file_path: '/x' },
          toolResponse: 'content',
          transcriptPath: '/test/t.jsonl',
          stopReason: 'done',
        });

        const result = adapter.parseInput(input);
        expect(result.sessionId).toBe('gen-session');
        expect(result.cwd).toBe('/test/gen');
        expect(result.prompt).toBe('Test');
        expect(result.toolName).toBe('Read');
        expect(result.toolInput).toEqual({ file_path: '/x' });
        expect(result.toolResponse).toBe('content');
        expect(result.transcriptPath).toBe('/test/t.jsonl');
        expect(result.stopReason).toBe('done');
      });

      it('should also accept snake_case fields as fallback', () => {
        const input = JSON.stringify({
          session_id: 'snake-session',
          cwd: '/test',
          tool_name: 'Bash',
          tool_input: { command: 'ls' },
          tool_result: 'files',
          transcript_path: '/t.jsonl',
          stop_reason: 'end',
        });

        const result = adapter.parseInput(input);
        expect(result.sessionId).toBe('snake-session');
        expect(result.toolName).toBe('Bash');
        expect(result.toolInput).toEqual({ command: 'ls' });
        expect(result.toolResponse).toBe('files');
        expect(result.transcriptPath).toBe('/t.jsonl');
        expect(result.stopReason).toBe('end');
      });

      it('should prefer camelCase over snake_case', () => {
        const input = JSON.stringify({
          sessionId: 'camel',
          session_id: 'snake',
          cwd: '/test',
        });

        const result = adapter.parseInput(input);
        expect(result.sessionId).toBe('camel');
      });

      it('should accept project field', () => {
        const input = JSON.stringify({
          cwd: '/test/dir',
          project: 'my-custom-project',
        });

        const result = adapter.parseInput(input);
        expect(result.project).toBe('my-custom-project');
      });

      it('should derive project from cwd when not provided', () => {
        const input = JSON.stringify({ cwd: '/test/my-project' });
        const result = adapter.parseInput(input);
        expect(result.project).toBe('my-project');
      });

      it('should handle invalid JSON', () => {
        const result = adapter.parseInput('{}{}');
        expect(result.sessionId).toMatch(/^session_/);
      });
    });

    describe('formatOutput', () => {
      it('should format with additionalContext', () => {
        const result: HookResult = {
          continue: true,
          suppressOutput: false,
          additionalContext: 'some context',
        };

        const output = JSON.parse(adapter.formatOutput(result));
        expect(output.continue).toBe(true);
        expect(output.additionalContext).toBe('some context');
      });

      it('should format with error', () => {
        const result: HookResult = {
          continue: true,
          suppressOutput: true,
          error: 'fail',
        };

        const output = JSON.parse(adapter.formatOutput(result));
        expect(output.error).toBe('fail');
      });

      it('should format minimal response', () => {
        const result: HookResult = {
          continue: true,
          suppressOutput: true,
        };

        const output = JSON.parse(adapter.formatOutput(result));
        expect(Object.keys(output)).toEqual(['continue']);
      });
    });
  });

  // ===== Cross-adapter consistency =====

  describe('Cross-adapter consistency', () => {
    const adapters = [
      new ClaudeCodeAdapter(),
      new OpenCodeAdapter(),
      new GenericAdapter(),
    ];

    it('all adapters should handle empty JSON', () => {
      for (const adapter of adapters) {
        const result = adapter.parseInput('{}');
        expect(result.sessionId).toBeTruthy();
        expect(result.cwd).toBeTruthy();
        expect(result.project).toBeTruthy();
        expect(result.timestamp).toBeGreaterThan(0);
      }
    });

    it('all adapters should produce valid JSON output', () => {
      const hookResult: HookResult = {
        continue: true,
        suppressOutput: false,
        additionalContext: 'test',
      };

      for (const adapter of adapters) {
        const output = adapter.formatOutput(hookResult);
        expect(() => JSON.parse(output)).not.toThrow();
      }
    });

    it('all adapters should have a name', () => {
      for (const adapter of adapters) {
        expect(adapter.name).toBeTruthy();
        expect(typeof adapter.name).toBe('string');
      }
    });

    it('all adapters should list supported events', () => {
      for (const adapter of adapters) {
        expect(adapter.supportedEvents.length).toBeGreaterThan(0);
        expect(adapter.supportedEvents).toContain('context');
      }
    });
  });
});
