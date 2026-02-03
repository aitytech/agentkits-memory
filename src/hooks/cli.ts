#!/usr/bin/env node
/**
 * AgentKits Memory Hook CLI
 *
 * Unified CLI handler for all Claude Code hooks.
 * Reads stdin, executes appropriate hook, outputs response.
 *
 * Usage:
 *   echo '{"session_id":"..."}' | npx agentkits-memory-hook <event>
 *
 * Events:
 *   context       - SessionStart: inject memory context
 *   session-init  - UserPromptSubmit: initialize session
 *   observation   - PostToolUse: capture tool usage
 *   summarize     - Stop: generate session summary
 *   user-message  - SessionStart: display status to user (stderr)
 *   enrich <id> [cwd] - Background: AI-enrich a stored observation
 *   enrich-summary <sessionId> <cwd> <transcriptPath> - Background: AI-enrich session summary
 *   embed-session <cwd> - Background worker: process embedding queue
 *   enrich-session <cwd> - Background worker: process enrichment queue
 *
 * @module @agentkits/memory/hooks/cli
 */

import { parseHookInput, formatResponse, STANDARD_RESPONSE, HookResult } from './types.js';
import { createContextHook } from './context.js';
import { createSessionInitHook } from './session-init.js';
import { createObservationHook } from './observation.js';
import { createSummarizeHook } from './summarize.js';
import { createUserMessageHook } from './user-message.js';
import { MemoryHookService } from './service.js';

/**
 * Read stdin until EOF
 */
async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';

    // Set encoding
    process.stdin.setEncoding('utf8');

    // Handle data
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });

    // Handle end
    process.stdin.on('end', () => {
      resolve(data);
    });

    // Handle error
    process.stdin.on('error', () => {
      resolve('');
    });

    // If stdin is already closed
    if (process.stdin.isTTY) {
      resolve('');
    }
  });
}

/**
 * Main CLI handler
 */
async function main(): Promise<void> {
  try {
    // Get event type from args
    const event = process.argv[2];

    if (!event) {
      console.error('Usage: agentkits-memory-hook <event>');
      console.error('Events: context, session-init, observation, summarize, user-message, enrich, enrich-summary, embed-session, enrich-session, compress-session');
      process.exit(1);
    }

    // Handle 'enrich' command directly (no stdin, runs as background process)
    if (event === 'enrich') {
      const obsId = process.argv[3];
      const cwdArg = process.argv[4] || process.cwd();
      if (obsId) {
        const svc = new MemoryHookService(cwdArg);
        await svc.initialize();
        await svc.enrichObservation(obsId);
        await svc.shutdown();
      }
      process.exit(0);
    }

    // Handle 'enrich-summary' command (no stdin, runs as background process)
    if (event === 'enrich-summary') {
      const sessionId = process.argv[3];
      const cwdArg = process.argv[4] || process.cwd();
      const transcriptPath = process.argv[5];
      if (sessionId && transcriptPath) {
        const svc = new MemoryHookService(cwdArg);
        await svc.initialize();
        await svc.enrichSessionSummary(sessionId, transcriptPath);
        await svc.shutdown();
      }
      process.exit(0);
    }

    // Handle 'embed-session' command (no stdin, runs as background process)
    // Processes the SQLite embedding queue + any records missing embeddings.
    // Loads model once, processes sequentially with batch limit. Usage: embed-session <cwd>
    if (event === 'embed-session') {
      const cwdArg = process.argv[3] || process.cwd();
      const svc = new MemoryHookService(cwdArg);
      await svc.initialize();
      // Graceful shutdown on signals (cleanup lock file + DB)
      const cleanup = async () => { try { await svc.shutdown(); } catch {} process.exit(0); };
      process.on('SIGTERM', cleanup);
      process.on('SIGINT', cleanup);
      try {
        await svc.processEmbeddingQueue();
      } finally {
        await svc.shutdown();
      }
      process.exit(0);
    }

    // Handle 'enrich-session' command (no stdin, runs as background process)
    // Processes the SQLite enrichment queue — calls claude --print for each observation.
    // Usage: enrich-session <cwd>
    if (event === 'enrich-session') {
      const cwdArg = process.argv[3] || process.cwd();
      const svc = new MemoryHookService(cwdArg);
      await svc.initialize();
      // Graceful shutdown on signals (cleanup lock file + DB)
      const cleanup = async () => { try { await svc.shutdown(); } catch {} process.exit(0); };
      process.on('SIGTERM', cleanup);
      process.on('SIGINT', cleanup);
      try {
        await svc.processEnrichmentQueue();
      } finally {
        await svc.shutdown();
      }
      process.exit(0);
    }

    // Handle 'compress-session' command (no stdin, runs as background process)
    // Processes the SQLite compression queue — compresses observations + generates session digests.
    // Usage: compress-session <cwd>
    if (event === 'compress-session') {
      const cwdArg = process.argv[3] || process.cwd();
      const svc = new MemoryHookService(cwdArg);
      await svc.initialize();
      const cleanup = async () => { try { await svc.shutdown(); } catch {} process.exit(0); };
      process.on('SIGTERM', cleanup);
      process.on('SIGINT', cleanup);
      try {
        await svc.processCompressionQueue();
      } finally {
        await svc.shutdown();
      }
      process.exit(0);
    }

    // Read stdin
    const stdin = await readStdin();

    // Parse input
    const input = parseHookInput(stdin);

    // Select and execute handler
    let result: HookResult | undefined;
    let hook: { execute(input: ReturnType<typeof parseHookInput>): Promise<HookResult>; shutdown(): Promise<void> } | null = null;

    switch (event) {
      case 'context':
        hook = createContextHook(input.cwd);
        break;

      case 'session-init':
        hook = createSessionInitHook(input.cwd);
        break;

      case 'observation':
        hook = createObservationHook(input.cwd);
        break;

      case 'summarize':
        hook = createSummarizeHook(input.cwd);
        break;

      case 'user-message':
        hook = createUserMessageHook(input.cwd);
        break;

      default:
        console.error(`Unknown event: ${event}`);
        console.log(JSON.stringify(STANDARD_RESPONSE));
        process.exit(0);
    }

    // Execute hook with guaranteed shutdown (closes DB connection)
    try {
      result = await hook!.execute(input);
    } finally {
      try { await hook!.shutdown(); } catch { /* ignore shutdown errors */ }
    }

    // Output response
    console.log(formatResponse(result));

  } catch (error) {
    // Log error to stderr (visible in verbose mode with exit 0)
    console.error('[AgentKits Memory] CLI error:', error);

    // Output standard response so Claude can continue
    console.log(JSON.stringify(STANDARD_RESPONSE));

    // MUST exit 0: exit code 2 would block UserPromptSubmit (erases prompt)
    // and Stop (prevents Claude from stopping). Memory errors should never
    // disrupt Claude's operation.
    process.exit(0);
  }
}

// Run
main().catch((error) => {
  console.error('[AgentKits Memory] Fatal error:', error);
  console.log(JSON.stringify(STANDARD_RESPONSE));
  process.exit(0);
});
