#!/usr/bin/env node
/**
 * AgentKits Memory Setup CLI
 *
 * Sets up memory hooks in a project's .claude/settings.json
 *
 * Usage:
 *   npx agentkits-memory-setup [options]
 *
 * Options:
 *   --project-dir=X   Project directory (default: cwd)
 *   --force           Overwrite existing hooks
 *   --json            Output result as JSON
 *
 * @module @agentkits/memory/cli/setup
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const args = process.argv.slice(2);

interface HookEntry {
  matcher: string;
  hooks: Array<{ type: string; command: string; timeout?: number }>;
}

interface HooksConfig {
  SessionStart?: HookEntry[];
  Stop?: HookEntry[];
  PreCompact?: HookEntry[];
  [key: string]: HookEntry[] | undefined;
}

interface ClaudeSettings {
  hooks?: HooksConfig;
  [key: string]: unknown;
}

const MEMORY_HOOKS: HooksConfig = {
  SessionStart: [
    {
      matcher: '',
      hooks: [
        {
          type: 'command',
          command: 'npx --yes agentkits-memory-hook context',
          timeout: 10,
        },
      ],
    },
  ],
  Stop: [
    {
      matcher: '',
      hooks: [
        {
          type: 'command',
          command: 'npx --yes agentkits-memory-hook summarize',
          timeout: 10,
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

function mergeHooks(
  existing: HooksConfig | undefined,
  newHooks: HooksConfig,
  force: boolean
): HooksConfig {
  if (!existing || force) {
    return { ...existing, ...newHooks };
  }

  const merged: HooksConfig = { ...existing };

  for (const [event, hooks] of Object.entries(newHooks)) {
    if (!hooks) continue;

    const existingHooks = merged[event];
    if (!existingHooks) {
      merged[event] = hooks;
    } else {
      // Check if memory hook already exists
      const hasMemoryHook = existingHooks.some((h: HookEntry) =>
        h.hooks.some((hook) => hook.command.includes('agentkits-memory'))
      );

      if (!hasMemoryHook) {
        // Append memory hooks
        merged[event] = [...existingHooks, ...hooks];
      }
    }
  }

  return merged;
}

async function main() {
  const options = parseArgs();
  const projectDir = (options['project-dir'] as string) || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const force = !!options.force;
  const asJson = !!options.json;

  const claudeDir = path.join(projectDir, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');
  const memoryDir = path.join(claudeDir, 'memory');

  try {
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
    settings.hooks = mergeHooks(settings.hooks, MEMORY_HOOKS, force);

    // Write settings
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    // Create initial memory files if they don't exist
    const activeContextPath = path.join(memoryDir, 'active-context.md');
    if (!fs.existsSync(activeContextPath)) {
      fs.writeFileSync(
        activeContextPath,
        `# Active Context

**Task**: None
**Status**: Ready
**Updated**: ${new Date().toISOString()}

## Current Focus

No active task.

## Notes

Memory system initialized.
`
      );
    }

    const result = {
      success: true,
      settingsPath,
      memoryDir,
      hooksAdded: Object.keys(MEMORY_HOOKS),
      message: 'Memory hooks configured successfully',
    };

    if (asJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('\n✅ AgentKits Memory Setup Complete\n');
      console.log(`Settings: ${settingsPath}`);
      console.log(`Memory:   ${memoryDir}`);
      console.log(`\nHooks added: ${result.hooksAdded.join(', ')}`);
      console.log('\nRestart Claude Code to activate memory hooks.\n');
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
