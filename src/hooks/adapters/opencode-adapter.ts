/**
 * OpenCode Platform Adapter
 *
 * Handles the hook format for OpenCode.
 * OpenCode uses a similar hook system to Claude Code.
 * Initially mirrors Claude Code format; separate class allows
 * future divergence as OpenCode evolves its hook API.
 *
 * @module @agentkits/memory/hooks/adapters/opencode-adapter
 */

import type { PlatformAdapter } from './platform-adapter.js';
import type { NormalizedHookInput, HookResult } from '../types.js';
import { getProjectName } from '../types.js';

/**
 * OpenCode platform adapter.
 *
 * OpenCode hook format is currently compatible with Claude Code.
 * Field mapping may diverge in future versions.
 *
 * Input format (same as Claude Code for now):
 *   { session_id, cwd, prompt, tool_name, tool_input, tool_result,
 *     transcript_path, stop_reason }
 *
 * Output format (simplified — no hookSpecificOutput):
 *   { continue, additionalContext? }
 */
export class OpenCodeAdapter implements PlatformAdapter {
  readonly name = 'opencode';

  readonly supportedEvents = [
    'context', 'session-init', 'observation', 'summarize',
  ] as const;

  parseInput(stdin: string): NormalizedHookInput {
    try {
      const raw = JSON.parse(stdin);
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
    // OpenCode uses a simpler output format
    const response: Record<string, unknown> = {
      continue: true,
    };

    if (result.additionalContext) {
      response.additionalContext = result.additionalContext;
    }

    if (result.error) {
      response.error = result.error;
    }

    return JSON.stringify(response);
  }
}
