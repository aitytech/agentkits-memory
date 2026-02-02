/**
 * Context Hook Handler (SessionStart)
 *
 * Injects memory context at the start of a Claude Code session.
 * Provides previous session history and relevant observations.
 *
 * @module @agentkits/memory/hooks/context
 */

import {
  NormalizedHookInput,
  HookResult,
  EventHandler,
} from './types.js';
import { MemoryHookService } from './service.js';

/**
 * Context Hook - SessionStart Event
 *
 * Called when a new Claude Code session starts.
 * Retrieves and injects previous context to help Claude
 * understand the project history.
 */
export class ContextHook implements EventHandler {
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
   * Execute the context hook
   */
  async execute(input: NormalizedHookInput): Promise<HookResult> {
    try {
      // Initialize service
      await this.service.initialize();

      // Get context for this project
      const context = await this.service.getContext(input.project);

      // No context to inject
      if (!context.markdown || context.markdown.includes('No previous session context')) {
        return {
          continue: true,
          suppressOutput: true,
        };
      }

      // Inject context as additional context
      return {
        continue: true,
        suppressOutput: false,
        additionalContext: context.markdown,
      };
    } catch (error) {
      // Log error but don't block session
      console.error('[AgentKits Memory] Context hook error:', error);

      return {
        continue: true,
        suppressOutput: true,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Create context hook handler
 */
export function createContextHook(cwd: string): ContextHook {
  const service = new MemoryHookService(cwd);
  return new ContextHook(service, true); // owns service
}

export default ContextHook;
