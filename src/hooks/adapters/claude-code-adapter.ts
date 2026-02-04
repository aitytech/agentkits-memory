/**
 * Claude Code Platform Adapter
 *
 * Handles the stdin JSON format from Claude Code hooks.
 * This is the default adapter and matches the existing behavior
 * of parseHookInput() and formatResponse() in types.ts.
 *
 * @module @agentkits/memory/hooks/adapters/claude-code-adapter
 */

import type { PlatformAdapter } from './platform-adapter.js';
import type { NormalizedHookInput, HookResult, ClaudeCodeHookInput, ClaudeCodeHookResponse } from '../types.js';
import { getProjectName, STANDARD_RESPONSE } from '../types.js';

/**
 * Claude Code platform adapter.
 *
 * Input format:
 *   { session_id, cwd, prompt, tool_name, tool_input, tool_result,
 *     transcript_path, stop_reason }
 *
 * Output format:
 *   { continue, suppressOutput, hookSpecificOutput: {
 *       hookEventName, additionalContext } }
 */
export class ClaudeCodeAdapter implements PlatformAdapter {
  readonly name = 'claude-code';

  readonly supportedEvents = [
    'context', 'session-init', 'observation', 'summarize', 'user-message',
  ] as const;

  parseInput(stdin: string): NormalizedHookInput {
    try {
      const raw: ClaudeCodeHookInput = JSON.parse(stdin);
      const cwd = raw.cwd || process.cwd();

      return {
        sessionId: raw.session_id || `session_${Date.now()}`,
        cwd,
        project: getProjectName(cwd),
        prompt: raw.prompt,
        toolName: raw.tool_name,
        toolInput: raw.tool_input,
        toolResponse: raw.tool_result,
        transcriptPath: raw.transcript_path,
        stopReason: raw.stop_reason,
        timestamp: Date.now(),
      };
    } catch {
      const cwd = process.cwd();
      return {
        sessionId: `session_${Date.now()}`,
        cwd,
        project: getProjectName(cwd),
        timestamp: Date.now(),
      };
    }
  }

  formatOutput(result: HookResult): string {
    if (result.additionalContext) {
      const response: ClaudeCodeHookResponse = {
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: result.additionalContext,
        },
      };
      return JSON.stringify(response);
    }

    return JSON.stringify(STANDARD_RESPONSE);
  }
}
