/**
 * Generic Platform Adapter (Fallback)
 *
 * Accepts an already-normalized JSON format on stdin (camelCase fields).
 * Useful for testing, scripting, and future platforms that adopt
 * a standardized hook format.
 *
 * @module @agentkits/memory/hooks/adapters/generic-adapter
 */

import type { PlatformAdapter } from './platform-adapter.js';
import type { NormalizedHookInput, HookResult } from '../types.js';
import { getProjectName } from '../types.js';

/**
 * Generic platform adapter.
 *
 * Input format (camelCase, already normalized):
 *   { sessionId, cwd, prompt?, toolName?, toolInput?,
 *     toolResponse?, transcriptPath?, stopReason? }
 *
 * Output format:
 *   { continue, additionalContext?, error? }
 */
export class GenericAdapter implements PlatformAdapter {
  readonly name = 'generic';

  readonly supportedEvents = [
    'context', 'session-init', 'observation', 'summarize',
  ] as const;

  parseInput(stdin: string): NormalizedHookInput {
    try {
      const raw = JSON.parse(stdin);
      const cwd = raw.cwd || process.cwd();

      return {
        sessionId: raw.sessionId || raw.session_id || `session_${Date.now()}`,
        cwd,
        project: raw.project || getProjectName(cwd),
        prompt: raw.prompt,
        toolName: raw.toolName || raw.tool_name,
        toolInput: raw.toolInput || raw.tool_input,
        toolResponse: raw.toolResponse || raw.tool_result,
        transcriptPath: raw.transcriptPath || raw.transcript_path,
        stopReason: raw.stopReason || raw.stop_reason,
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
