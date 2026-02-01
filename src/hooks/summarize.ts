/**
 * Summarize Hook Handler (Stop)
 *
 * Generates a session summary when Claude Code session ends.
 * Uses template-based summarization (no LLM required).
 *
 * @module @agentkits/memory/hooks/summarize
 */

import {
  NormalizedHookInput,
  HookResult,
  EventHandler,
} from './types.js';
import { MemoryHookService } from './service.js';

/**
 * Summarize Hook - Stop Event
 *
 * Called when a Claude Code session ends.
 * Generates a summary and marks the session as completed.
 */
export class SummarizeHook implements EventHandler {
  private service: MemoryHookService;

  constructor(service: MemoryHookService) {
    this.service = service;
  }

  /**
   * Execute the summarize hook
   */
  async execute(input: NormalizedHookInput): Promise<HookResult> {
    try {
      // Initialize service
      await this.service.initialize();

      // Check if session exists
      const session = this.service.getSession(input.sessionId);
      if (!session) {
        // No session to summarize
        return {
          continue: true,
          suppressOutput: true,
        };
      }

      // Generate summary from observations
      const summary = await this.service.generateSummary(input.sessionId);

      // Complete the session with summary
      await this.service.completeSession(input.sessionId, summary);

      // Shutdown service
      await this.service.shutdown();

      return {
        continue: true,
        suppressOutput: true,
      };
    } catch (error) {
      // Log error but don't block session end
      console.error('[AgentKits Memory] Summarize hook error:', error);

      // Try to shutdown anyway
      try {
        await this.service.shutdown();
      } catch {
        // Ignore shutdown errors
      }

      return {
        continue: true,
        suppressOutput: true,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Create summarize hook handler
 */
export function createSummarizeHook(cwd: string): SummarizeHook {
  const service = new MemoryHookService(cwd);
  return new SummarizeHook(service);
}

export default SummarizeHook;
