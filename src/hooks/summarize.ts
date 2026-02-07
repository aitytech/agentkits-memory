/**
 * Summarize Hook Handler (Stop)
 *
 * Generates a session summary when Claude Code session ends.
 * Uses template-based summarization (no LLM required).
 *
 * @module @agentkits/memory/hooks/summarize
 */

import { spawn } from 'node:child_process';
import * as path from 'node:path';
import {
  NormalizedHookInput,
  HookResult,
  EventHandler,
} from './types.js';
import { MemoryHookService } from './service.js';
import { isAIEnrichmentEnabled } from './ai-enrichment.js';

/**
 * Summarize Hook - Stop Event
 *
 * Called when a Claude Code session ends.
 * Generates a summary and marks the session as completed.
 */
export class SummarizeHook implements EventHandler {
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

      // Generate structured summary from observations + prompts
      const structured = await this.service.generateStructuredSummary(input.sessionId);

      // Save structured summary to session_summaries table (same DB as memories)
      await this.service.saveSessionSummary(structured);

      // Complete the session with text summary (legacy field)
      const textSummary = await this.service.generateSummary(input.sessionId);
      await this.service.completeSession(input.sessionId, textSummary);

      // Spawn background workers to process queued tasks (one per type, gated by lock file)
      this.service.ensureWorkerRunning(input.cwd, 'embed-session', 'embed-worker.lock');
      if (isAIEnrichmentEnabled()) {
        this.service.ensureWorkerRunning(input.cwd, 'enrich-session', 'enrich-worker.lock');

        // Queue compression for this session's observations (runs after enrichment)
        this.service.queueTask('compress', 'sessions', input.sessionId);
        this.service.ensureWorkerRunning(input.cwd, 'compress-session', 'compress-worker.lock');
      }

      // Summary enrichment needs transcript path — handled separately (not via queue)
      if (isAIEnrichmentEnabled() && input.transcriptPath) {
        try {
          const cliPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'cli.js');
          const child = spawn('node', [
            cliPath, 'enrich-summary', input.sessionId, input.cwd, input.transcriptPath,
          ], {
            detached: true,
            stdio: 'ignore',
            env: { ...process.env },
          });
          child.on('error', () => { /* spawn failure — silently ignore */ });
          child.unref();
        } catch {
          // Silently ignore
        }
      }

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
  return new SummarizeHook(service, true);
}

export default SummarizeHook;
