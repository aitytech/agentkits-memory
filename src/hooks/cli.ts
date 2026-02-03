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
 *
 * @module @agentkits/memory/hooks/cli
 */

import { parseHookInput, formatResponse, STANDARD_RESPONSE } from './types.js';
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
      console.error('Events: context, session-init, observation, summarize, user-message, enrich');
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

    // Read stdin
    const stdin = await readStdin();

    // Parse input
    const input = parseHookInput(stdin);

    // Select and execute handler
    let result;

    switch (event) {
      case 'context':
        result = await createContextHook(input.cwd).execute(input);
        break;

      case 'session-init':
        result = await createSessionInitHook(input.cwd).execute(input);
        break;

      case 'observation':
        result = await createObservationHook(input.cwd).execute(input);
        break;

      case 'summarize':
        result = await createSummarizeHook(input.cwd).execute(input);
        break;

      case 'user-message':
        result = await createUserMessageHook(input.cwd).execute(input);
        break;

      default:
        console.error(`Unknown event: ${event}`);
        console.log(JSON.stringify(STANDARD_RESPONSE));
        process.exit(0);
    }

    // Output response
    console.log(formatResponse(result));

  } catch (error) {
    // Log error to stderr
    console.error('[AgentKits Memory] CLI error:', error);

    // Output standard response (don't block Claude)
    console.log(JSON.stringify(STANDARD_RESPONSE));
  }
}

// Run
main().catch((error) => {
  console.error('[AgentKits Memory] Fatal error:', error);
  console.log(JSON.stringify(STANDARD_RESPONSE));
  process.exit(0);
});
