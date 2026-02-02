#!/usr/bin/env node
/**
 * AgentKits Memory Setup CLI
 *
 * Sets up memory hooks, MCP server, and downloads embedding model.
 * Supports multiple AI tools: Claude Code, Cursor, Windsurf, etc.
 *
 * Usage:
 *   npx agentkits-memory-setup [options]
 *
 * Options:
 *   --project-dir=X   Project directory (default: cwd)
 *   --force           Overwrite existing configuration
 *   --skip-model      Skip embedding model download
 *   --skip-mcp        Skip MCP server configuration
 *   --show-hooks      Show full hooks JSON for manual configuration
 *   --json            Output result as JSON
 *
 * @module @agentkits/memory/cli/setup
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { LocalEmbeddingsService } from '../embeddings/local-embeddings.js';

const args = process.argv.slice(2);

interface HookEntry {
  matcher: string;
  hooks: Array<{ type: string; command: string; timeout?: number }>;
}

interface HooksConfig {
  SessionStart?: HookEntry[];
  UserPromptSubmit?: HookEntry[];
  PostToolUse?: HookEntry[];
  Stop?: HookEntry[];
  PreCompact?: HookEntry[];
  [key: string]: HookEntry[] | undefined;
}

interface ClaudeSettings {
  hooks?: HooksConfig;
  mcpServers?: Record<string, McpServerConfig>;
  [key: string]: unknown;
}

interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

const MEMORY_MCP_SERVER: McpServerConfig = {
  command: 'npx',
  args: ['-y', 'agentkits-memory-server'],
};

/**
 * Memory hooks for Claude Code lifecycle events
 *
 * Hook Events:
 * - SessionStart: Load memory context at session start
 * - UserPromptSubmit: Capture user intent when prompt submitted
 * - PostToolUse: Capture observations after tool execution (Edit, Write, Bash, Task)
 * - Stop: Generate summary when session ends
 */
const MEMORY_HOOKS: HooksConfig = {
  // Load memory context at session start
  SessionStart: [
    {
      matcher: '',
      hooks: [
        {
          type: 'command',
          command: 'npx --yes agentkits-memory-hook context',
          timeout: 15,
        },
      ],
    },
  ],

  // Capture user intent when prompt submitted
  UserPromptSubmit: [
    {
      matcher: '',
      hooks: [
        {
          type: 'command',
          command: 'npx --yes agentkits-memory-hook session-init',
          timeout: 10,
        },
      ],
    },
  ],

  // Capture observations after tool execution
  // Only track meaningful tools: Edit, Write, Bash, Task
  PostToolUse: [
    {
      matcher: 'Edit|Write|Bash|Task',
      hooks: [
        {
          type: 'command',
          command: 'npx --yes agentkits-memory-hook observation',
          timeout: 15,
        },
      ],
    },
  ],

  // Generate summary when session ends
  Stop: [
    {
      matcher: '',
      hooks: [
        {
          type: 'command',
          command: 'npx --yes agentkits-memory-hook summarize',
          timeout: 15,
        },
      ],
    },
  ],
};

function parseArgs(): Record<string, string | boolean> {
  const parsed: Record<string, string | boolean> = {};
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=');
      if (eqIndex > 0) {
        const key = arg.slice(2, eqIndex);
        const value = arg.slice(eqIndex + 1);
        parsed[key] = value;
      } else {
        parsed[arg.slice(2)] = true;
      }
    }
  }
  return parsed;
}

interface MergeResult {
  merged: HooksConfig;
  added: string[];
  skipped: string[];
  manualRequired: string[];
}

/**
 * Merge memory hooks with existing hooks configuration
 * Always preserves existing hooks, never overwrites
 */
function mergeHooks(
  existing: HooksConfig | undefined,
  newHooks: HooksConfig,
  force: boolean
): MergeResult {
  const result: MergeResult = {
    merged: { ...existing },
    added: [],
    skipped: [],
    manualRequired: [],
  };

  // If no existing hooks, add all memory hooks
  if (!existing) {
    result.merged = { ...newHooks };
    result.added = Object.keys(newHooks);
    return result;
  }

  for (const [event, memoryHooks] of Object.entries(newHooks)) {
    if (!memoryHooks) continue;

    const existingHooks = result.merged[event];

    // Case 1: No existing hooks for this event → add ours
    if (!existingHooks) {
      result.merged[event] = memoryHooks;
      result.added.push(event);
      continue;
    }

    // Case 2: Check if our memory hook already exists
    const hasMemoryHook = existingHooks.some((h: HookEntry) =>
      h.hooks.some((hook) => hook.command.includes('agentkits-memory'))
    );

    if (hasMemoryHook) {
      if (force) {
        // Remove old memory hooks, add new ones
        const filtered = existingHooks.filter(
          (h: HookEntry) => !h.hooks.some((hook) => hook.command.includes('agentkits-memory'))
        );
        result.merged[event] = [...filtered, ...memoryHooks];
        result.added.push(`${event} (updated)`);
      } else {
        result.skipped.push(`${event} (already configured)`);
      }
      continue;
    }

    // Case 3: PostToolUse with different matcher - needs attention
    if (event === 'PostToolUse') {
      const ourMatcher = memoryHooks[0]?.matcher || '';
      const existingMatchers = existingHooks.map((h: HookEntry) => h.matcher || '');

      // Check for potential conflicts (different matchers that might overlap)
      const hasConflict = existingMatchers.some(
        (m) => m && m !== ourMatcher && (m === '*' || ourMatcher.split('|').some((t) => m.includes(t)))
      );

      if (hasConflict) {
        // Add anyway but warn user
        result.merged[event] = [...existingHooks, ...memoryHooks];
        result.added.push(event);
        result.manualRequired.push(
          `PostToolUse: Added with matcher "${ourMatcher}", existing has different matchers - verify no conflicts`
        );
        continue;
      }
    }

    // Case 4: Append our hooks to existing
    result.merged[event] = [...existingHooks, ...memoryHooks];
    result.added.push(event);
  }

  return result;
}

/**
 * Configure MCP server for different AI tools
 * Creates/updates config files for: Claude Code, Cursor, Windsurf, etc.
 */
function configureMcp(
  projectDir: string,
  claudeSettings: ClaudeSettings,
  force: boolean,
  asJson: boolean
): { configured: string[]; skipped: string[] } {
  const configured: string[] = [];
  const skipped: string[] = [];

  // 1. Add to Claude Code settings.json (mcpServers key)
  // Always merge with existing servers, never overwrite
  if (!claudeSettings.mcpServers) {
    claudeSettings.mcpServers = {};
  }

  if (!claudeSettings.mcpServers.memory || force) {
    claudeSettings.mcpServers.memory = MEMORY_MCP_SERVER;
    configured.push('Claude Code (.claude/settings.json)');
  } else {
    skipped.push('Claude Code (already configured)');
  }

  // 2. Create/update root .mcp.json for other tools (Cursor, Windsurf, Claude Code, etc.)
  // Always merge with existing servers, never overwrite
  const mcpJsonPath = path.join(projectDir, '.mcp.json');
  try {
    let existing: McpConfig = { mcpServers: {} };

    // Load existing config if present
    if (fs.existsSync(mcpJsonPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8')) as McpConfig;
        existing.mcpServers = existing.mcpServers || {};
      } catch {
        // If parse fails, start fresh but warn
        if (!asJson) {
          console.warn('   ⚠ .mcp.json parse error, creating new config');
        }
        existing = { mcpServers: {} };
      }
    }

    // Add or update memory server
    if (!existing.mcpServers.memory || force) {
      existing.mcpServers.memory = MEMORY_MCP_SERVER;
      fs.writeFileSync(mcpJsonPath, JSON.stringify(existing, null, 2));
      configured.push('Universal (.mcp.json)');
    } else {
      skipped.push('.mcp.json (already configured)');
    }
  } catch (error) {
    skipped.push(`.mcp.json (error: ${error instanceof Error ? error.message : 'unknown'})`);
  }

  if (!asJson && configured.length > 0) {
    console.log('\n🔌 MCP Server configured for:');
    for (const tool of configured) {
      console.log(`   ✓ ${tool}`);
    }
  }

  return { configured, skipped };
}

async function downloadModel(cacheDir: string, asJson: boolean): Promise<boolean> {
  if (!asJson) {
    console.log('\n📥 Downloading embedding model...');
    console.log('   Model: multilingual-e5-small (~470MB)');
    console.log('   This enables semantic search in 100+ languages.\n');
  }

  try {
    const embeddingsService = new LocalEmbeddingsService({
      showProgress: !asJson,
      cacheDir: path.join(cacheDir, 'embeddings-cache'),
    });

    await embeddingsService.initialize();

    // Verify model works with a test embedding
    const testResult = await embeddingsService.embed('Test embedding');

    if (testResult.embedding.length !== 384) {
      throw new Error(`Unexpected embedding dimension: ${testResult.embedding.length}`);
    }

    if (!asJson) {
      console.log('   ✓ Model downloaded and verified\n');
    }

    return true;
  } catch (error) {
    if (!asJson) {
      console.error('   ⚠ Model download failed:', error instanceof Error ? error.message : error);
      console.log('   Model will be downloaded on first use.\n');
    }
    return false;
  }
}

/**
 * Print full hooks configuration for manual setup
 */
function printHooksConfig(): void {
  console.log('\n' + '━'.repeat(60));
  console.log('📋 MEMORY HOOKS CONFIGURATION\n');
  console.log('Copy and paste this JSON into your settings file.\n');

  console.log('For Claude Code: .claude/settings.json');
  console.log('─'.repeat(40));
  console.log(JSON.stringify({ hooks: MEMORY_HOOKS }, null, 2));

  console.log('\nFor Cursor/Windsurf: .cursor/mcp.json or settings');
  console.log('─'.repeat(40));
  console.log('Add hooks section with the same configuration above.\n');

  console.log('Hook Events:');
  console.log('  • SessionStart    - Load memory context when session begins');
  console.log('  • UserPromptSubmit - Capture user intent on each prompt');
  console.log('  • PostToolUse     - Record actions (Edit, Write, Bash, Task)');
  console.log('  • Stop            - Generate summary when session ends');
  console.log('━'.repeat(60) + '\n');
}

async function main() {
  const options = parseArgs();
  const projectDir = (options['project-dir'] as string) || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const force = !!options.force;
  const asJson = !!options.json;
  const skipModel = !!options['skip-model'];
  const skipMcp = !!options['skip-mcp'];
  const showHooks = !!options['show-hooks'];

  // Just show hooks config and exit
  if (showHooks) {
    printHooksConfig();
    return;
  }

  const claudeDir = path.join(projectDir, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');
  const memoryDir = path.join(claudeDir, 'memory');

  try {
    if (!asJson) {
      console.log('\n🧠 AgentKits Memory Setup\n');
    }

    // Create directories
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }

    // Load or create settings
    let settings: ClaudeSettings = {};
    if (fs.existsSync(settingsPath)) {
      const content = fs.readFileSync(settingsPath, 'utf-8');
      settings = JSON.parse(content);
    }

    // Merge hooks
    const hooksResult = mergeHooks(settings.hooks, MEMORY_HOOKS, force);
    settings.hooks = hooksResult.merged;

    // Configure MCP server
    let mcpResult = { configured: [] as string[], skipped: [] as string[] };
    if (!skipMcp) {
      mcpResult = configureMcp(projectDir, settings, force, asJson);
    }

    // Write settings
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    // Download embedding model
    let modelDownloaded = false;
    if (!skipModel) {
      modelDownloaded = await downloadModel(memoryDir, asJson);
    }

    const result = {
      success: true,
      settingsPath,
      memoryDir,
      hooksAdded: hooksResult.added,
      hooksSkipped: hooksResult.skipped,
      hooksManualRequired: hooksResult.manualRequired,
      mcpConfigured: mcpResult.configured,
      modelDownloaded,
      message: 'Memory setup complete',
    };

    if (asJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('✅ Setup Complete\n');
      console.log(`📁 Settings: ${settingsPath}`);
      console.log(`📁 Memory:   ${memoryDir}`);

      // Show hooks status
      if (hooksResult.added.length > 0) {
        console.log(`\n📋 Hooks added: ${hooksResult.added.join(', ')}`);
      }
      if (hooksResult.skipped.length > 0) {
        console.log(`   Skipped: ${hooksResult.skipped.join(', ')}`);
      }

      // Show manual action required
      if (hooksResult.manualRequired.length > 0) {
        console.log('\n⚠️  Manual review recommended:');
        for (const msg of hooksResult.manualRequired) {
          console.log(`   • ${msg}`);
        }
      }

      // Model status
      if (modelDownloaded) {
        console.log('\n📦 Model: Downloaded and ready');
      } else if (skipModel) {
        console.log('\n📦 Model: Skipped (will download on first use)');
      }

      console.log('\n👉 Restart your AI tool to activate.');
      console.log('💡 Open web viewer: npx agentkits-memory-web');
      console.log('📋 Show hooks config: npx agentkits-memory-setup --show-hooks\n');

      // Show manual hook instructions if some hooks couldn't be added
      const allHookEvents = Object.keys(MEMORY_HOOKS);
      const addedEvents = hooksResult.added.map((h) => h.replace(/ \(.*\)$/, ''));
      const missingEvents = allHookEvents.filter(
        (e) => !addedEvents.includes(e) && !hooksResult.skipped.some((s) => s.startsWith(e))
      );

      if (missingEvents.length > 0) {
        console.log('━'.repeat(60));
        console.log('📝 MANUAL SETUP REQUIRED\n');
        console.log(`Some hooks could not be auto-configured.`);
        console.log(`Missing: ${missingEvents.join(', ')}\n`);
        console.log(`To add manually:`);
        console.log(`1. Open: ${settingsPath}`);
        console.log(`2. Add/merge the following into the "hooks" section:\n`);

        // Generate copy-paste JSON for missing hooks only
        const missingHooksJson: Record<string, HookEntry[]> = {};
        for (const event of missingEvents) {
          const hookConfig = MEMORY_HOOKS[event];
          if (hookConfig) {
            missingHooksJson[event] = hookConfig;
          }
        }

        console.log(JSON.stringify(missingHooksJson, null, 2));
        console.log('\n━'.repeat(60));
      }
    }
  } catch (error) {
    const result = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };

    if (asJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error('❌ Setup failed:', result.error);
    }
    process.exit(1);
  }
}

main();
