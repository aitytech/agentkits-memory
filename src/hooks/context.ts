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
      const hasHistory = context.markdown && !context.markdown.includes('No previous session context');

      // Display status to user via stderr (merged from user-message hook)
      const obsCount = context.recentObservations.length;
      const sessionCount = context.sessionSummaries.length || context.previousSessions.length;
      const promptCount = context.userPrompts.length;
      if (obsCount > 0 || sessionCount > 0 || promptCount > 0) {
        const stats: string[] = [];
        if (sessionCount > 0) stats.push(`${sessionCount} session${sessionCount > 1 ? 's' : ''}`);
        if (obsCount > 0) stats.push(`${obsCount} observation${obsCount > 1 ? 's' : ''}`);
        if (promptCount > 0) stats.push(`${promptCount} prompt${promptCount > 1 ? 's' : ''}`);
        console.error(`\n  AgentKits Memory: ${stats.join(', ')}\n`);
      } else {
        console.error('\n  AgentKits Memory: Fresh — use memory_save to start\n');
      }

      if (hasHistory) {
        // Inject full context with history
        return {
          continue: true,
          suppressOutput: false,
          additionalContext: context.markdown,
        };
      }

      // Empty state: still inject tool guidance so Claude knows memory tools exist
      return {
        continue: true,
        suppressOutput: false,
        additionalContext: this.buildEmptyStateGuidance(input.project),
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

  /**
   * Build guidance for empty state (no previous sessions/memories).
   * Teaches Claude about available memory tools and proper usage order.
   */
  private buildEmptyStateGuidance(project: string): string {
    return `# Memory Context - ${project}

> **Memory tools available** — Use MCP tools to search and manage project memory:
> \`memory_save\`, \`memory_recall\`, \`memory_list\`, \`memory_search\`, \`memory_timeline\`, \`memory_details\`, \`memory_update\`, \`memory_delete\`, \`memory_status\`

## Getting Started

No previous session context found. This is a fresh memory.

**To build memory**, use \`memory_save(content, category, tags, importance)\` to store:
- **decisions** — architectural choices, tech stack picks, trade-offs
- **patterns** — coding conventions, project patterns, recurring approaches
- **errors** — bug fixes, error solutions, debugging insights
- **context** — project background, team conventions, environment setup

**Important:** Do NOT call \`memory_search\`, \`memory_timeline\`, or \`memory_details\` until memories exist.
Use \`memory_status()\` to check if memories are available before searching.

**After saving**, use the 3-layer search workflow:
1. \`memory_search(query)\` → Get index with IDs (~50 tokens/result)
2. \`memory_timeline(anchor="ID")\` → Get context around interesting results
3. \`memory_details(ids=["ID1","ID2"])\` → Fetch full content ONLY for filtered IDs
`;
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
