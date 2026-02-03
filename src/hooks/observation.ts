/**
 * Observation Hook Handler (PostToolUse)
 *
 * Captures tool usage observations after Claude executes a tool.
 * Stores file reads, writes, commands, and searches for context.
 *
 * @module @agentkits/memory/hooks/observation
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
 * Tools to skip capturing (internal/noisy tools).
 * Includes our own memory MCP tools to avoid self-referential loops.
 */
const SKIP_TOOLS = new Set([
  'TodoWrite',
  'TodoRead',
  'AskFollowupQuestion',
  'AskUserQuestion',
  'AttemptCompletion',
  // Skip our own memory tools (avoid capturing memory ops as observations)
  'mcp__memory__memory_save',
  'mcp__memory__memory_search',
  'mcp__memory__memory_timeline',
  'mcp__memory__memory_details',
  'mcp__memory__memory_delete',
  'mcp__memory__memory_update',
  'mcp__memory__memory_recall',
  'mcp__memory__memory_list',
  'mcp__memory__memory_status',
  'mcp__memory____IMPORTANT',
]);

/**
 * Observation Hook - PostToolUse Event
 *
 * Called after Claude executes a tool.
 * Captures the tool usage for future context.
 */
export class ObservationHook implements EventHandler {
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

      // Skip empty/no-op tool calls (e.g. Read with no file_path)
      const inputStr = JSON.stringify(input.toolInput || {});
      const responseStr = JSON.stringify(input.toolResponse || {});
      if (inputStr === '{}' && responseStr === '{}') {
        return {
          continue: true,
          suppressOutput: true,
        };
      }

      // Initialize service
      await this.service.initialize();

      // Ensure session exists (create if not)
      await this.service.initSession(input.sessionId, input.project);

      // Store the observation (template-based, fast <50ms)
      const obs = await this.service.storeObservation(
        input.sessionId,
        input.project,
        input.toolName,
        input.toolInput,
        input.toolResponse,
        input.cwd
      );

      // Fire-and-forget: spawn detached process for AI enrichment
      if (isAIEnrichmentEnabled()) {
        try {
          const cliPath = path.resolve(input.cwd, 'dist/hooks/cli.js');
          const child = spawn('node', [cliPath, 'enrich', obs.id, input.cwd], {
            detached: true,
            stdio: 'ignore',
            env: { ...process.env },
          });
          child.unref();
        } catch {
          // Silently ignore — template data already saved
        }
      }

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
  return new ObservationHook(service, true);
}

export default ObservationHook;
