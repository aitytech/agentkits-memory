/**
 * Observation Hook Handler (PostToolUse)
 *
 * Captures tool usage observations after Claude executes a tool.
 * Stores file reads, writes, commands, and searches for context.
 *
 * @module @agentkits/memory/hooks/observation
 */

import {
  NormalizedHookInput,
  HookResult,
  EventHandler,
} from './types.js';
import { MemoryHookService } from './service.js';

/**
 * Tools to skip capturing (internal/noisy tools)
 */
const SKIP_TOOLS = new Set([
  'TodoWrite',
  'TodoRead',
  'AskFollowupQuestion',
  'AttemptCompletion',
]);

/**
 * Observation Hook - PostToolUse Event
 *
 * Called after Claude executes a tool.
 * Captures the tool usage for future context.
 */
export class ObservationHook implements EventHandler {
  private service: MemoryHookService;

  constructor(service: MemoryHookService) {
    this.service = service;
  }

  /**
   * Execute the observation hook
   */
  async execute(input: NormalizedHookInput): Promise<HookResult> {
    try {
      // Skip if no tool name
      if (!input.toolName) {
        return {
          continue: true,
          suppressOutput: true,
        };
      }

      // Skip internal tools
      if (SKIP_TOOLS.has(input.toolName)) {
        return {
          continue: true,
          suppressOutput: true,
        };
      }

      // Initialize service
      await this.service.initialize();

      // Ensure session exists (create if not)
      await this.service.initSession(input.sessionId, input.project);

      // Store the observation
      await this.service.storeObservation(
        input.sessionId,
        input.project,
        input.toolName,
        input.toolInput,
        input.toolResponse,
        input.cwd
      );

      return {
        continue: true,
        suppressOutput: true,
      };
    } catch (error) {
      // Log error but don't block tool execution
      console.error('[AgentKits Memory] Observation hook error:', error);

      return {
        continue: true,
        suppressOutput: true,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Create observation hook handler
 */
export function createObservationHook(cwd: string): ObservationHook {
  const service = new MemoryHookService(cwd);
  return new ObservationHook(service);
}

export default ObservationHook;
