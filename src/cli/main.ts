#!/usr/bin/env node
/**
 * AgentKits Memory — Unified CLI Router
 *
 * Routes subcommands to the appropriate handler module.
 * Enables clean `npx @aitytech/agentkits-memory <subcommand>` usage.
 *
 * Subcommands:
 *   setup     Setup memory for your project (default)
 *   server    Start the MCP server
 *   web       Start the web viewer
 *   viewer    Terminal viewer
 *   save      Save a memory entry
 *   hook      Run a hook event (context, session-init, observation, summarize, etc.)
 *
 * Examples:
 *   npx @aitytech/agentkits-memory                     # setup (default)
 *   npx @aitytech/agentkits-memory setup --force       # setup with options
 *   npx @aitytech/agentkits-memory server              # start MCP server
 *   npx @aitytech/agentkits-memory web                 # start web viewer
 *   npx @aitytech/agentkits-memory hook context        # run hook
 *   npx @aitytech/agentkits-memory save "..." --tags x # save entry
 *
 * @module @aitytech/agentkits-memory/cli/main
 */

const subcommand = process.argv[2];
const restArgs = process.argv.slice(3);

// Rewrite process.argv so submodules see correct args via process.argv.slice(2)
function rewriteArgv(args: string[]): void {
  process.argv = [process.argv[0], process.argv[1], ...args];
}

// If no subcommand or subcommand starts with '--', treat as setup
const isSetupDefault = !subcommand || subcommand.startsWith('--');

switch (isSetupDefault ? 'setup' : subcommand) {
  case 'setup':
    rewriteArgv(isSetupDefault && subcommand ? [subcommand, ...restArgs] : restArgs);
    await import('./setup.js');
    break;

  case 'server':
    rewriteArgv(restArgs);
    await import('../mcp/server.js');
    break;

  case 'web':
    rewriteArgv(restArgs);
    await import('./web-viewer.js');
    break;

  case 'viewer':
    rewriteArgv(restArgs);
    await import('./viewer.js');
    break;

  case 'save':
    rewriteArgv(restArgs);
    await import('./save.js');
    break;

  case 'hook':
    rewriteArgv(restArgs);
    await import('../hooks/cli.js');
    break;

  case 'help':
  case '--help':
  case '-h':
    console.log(`
AgentKits Memory — Persistent memory for AI coding assistants

Usage: npx @aitytech/agentkits-memory <command> [options]

Commands:
  setup     Configure memory for your project (default)
  server    Start the MCP server
  web       Start the web viewer (port 1905)
  viewer    Terminal viewer for memory database
  save      Save a memory entry from CLI
  hook      Run a hook event

Examples:
  npx @aitytech/agentkits-memory                       # setup
  npx @aitytech/agentkits-memory setup --platform=all  # setup all platforms
  npx @aitytech/agentkits-memory server                # start MCP server
  npx @aitytech/agentkits-memory web                   # web viewer
  npx @aitytech/agentkits-memory hook context           # run context hook
  npx @aitytech/agentkits-memory save "Use JWT" --tags auth

Docs: https://agentkits.net/memory
`);
    break;

  default:
    console.error(`Unknown command: ${subcommand}`);
    console.error('Run "npx @aitytech/agentkits-memory help" for usage.');
    process.exit(1);
}
