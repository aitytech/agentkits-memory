/**
 * User Message Hook Handler (SessionStart - parallel)
 *
 * Displays memory status info to user via stderr.
 * Runs alongside context hook but only writes to stderr
 * (visible to user in Claude Code UI) without injecting
 * into Claude's conversation context.
 *
 * @module @agentkits/memory/hooks/user-message
 */

import {
  NormalizedHookInput,
  HookResult,
  EventHandler,
} from './types.js';
import { MemoryHookService } from './service.js';

/**
 * User Message Hook - SessionStart Event
 *
 * Shows memory system status to user in terminal.
 * Does NOT inject anything into Claude's context.
 */
export class UserMessageHook implements EventHandler {
  private service: MemoryHookService;
  private ownsService: boolean;

  constructor(service: MemoryHookService, ownsService = false) {
    this.service = service;
    this.ownsService = ownsService;
  }

  /**
   * Shutdown the hook (closes database if owned)
   */
  async shutdown(): Promise<void> {
    if (this.ownsService) {
      await this.service.shutdown();
    }
  }

  /**
   * Execute the user message hook
   */
  async execute(input: NormalizedHookInput): Promise<HookResult> {
    try {
      // Initialize service
      await this.service.initialize();

      // Get context to count observations
      const context = await this.service.getContext(input.project);
      const obsCount = context.recentObservations.length;
      const sessionCount = context.sessionSummaries.length || context.previousSessions.length;
      const promptCount = context.userPrompts.length;

      // Build status display
      const parts: string[] = [];
      parts.push('');
      parts.push('  AgentKits Memory Loaded');

      if (obsCount > 0 || sessionCount > 0 || promptCount > 0) {
        const stats: string[] = [];
        if (sessionCount > 0) stats.push(`${sessionCount} session${sessionCount > 1 ? 's' : ''}`);
        if (obsCount > 0) stats.push(`${obsCount} observation${obsCount > 1 ? 's' : ''}`);
        if (promptCount > 0) stats.push(`${promptCount} prompt${promptCount > 1 ? 's' : ''}`);
        parts.push(`  Context: ${stats.join(', ')}`);
        parts.push('  Use: memory_search → memory_timeline → memory_details');
      } else {
        parts.push('  Fresh memory — use memory_save to start building context');
      }

      parts.push('');

      // Write to stderr for user visibility
      console.error(parts.join('\n'));

      return {
        continue: true,
        suppressOutput: true,
      };
    } catch (error) {
      // Log error but don't block session
      console.error('[AgentKits Memory] User message hook error:', error);

      return {
        continue: true,
        suppressOutput: true,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Create user message hook handler
 */
export function createUserMessageHook(cwd: string): UserMessageHook {
  const service = new MemoryHookService(cwd);
  return new UserMessageHook(service, true);
}

export default UserMessageHook;
