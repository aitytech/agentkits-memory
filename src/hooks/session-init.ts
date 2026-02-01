/**
 * Session Init Hook Handler (UserPromptSubmit)
 *
 * Initializes a session record when the user submits their first prompt.
 * Captures the initial prompt for context.
 *
 * @module @agentkits/memory/hooks/session-init
 */

import {
  NormalizedHookInput,
  HookResult,
  EventHandler,
} from './types.js';
import { MemoryHookService } from './service.js';

/**
 * Session Init Hook - UserPromptSubmit Event
 *
 * Called when the user submits a prompt.
 * Creates or updates the session record with the prompt.
 */
export class SessionInitHook implements EventHandler {
  private service: MemoryHookService;

  constructor(service: MemoryHookService) {
    this.service = service;
  }

  /**
   * Execute the session init hook
   */
  async execute(input: NormalizedHookInput): Promise<HookResult> {
    try {
      // Initialize service
      await this.service.initialize();

      // Initialize or get existing session
      await this.service.initSession(
        input.sessionId,
        input.project,
        input.prompt
      );

      return {
        continue: true,
        suppressOutput: true,
      };
    } catch (error) {
      // Log error but don't block prompt
      console.error('[AgentKits Memory] Session init hook error:', error);

      return {
        continue: true,
        suppressOutput: true,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Create session init hook handler
 */
export function createSessionInitHook(cwd: string): SessionInitHook {
  const service = new MemoryHookService(cwd);
  return new SessionInitHook(service);
}

export default SessionInitHook;
