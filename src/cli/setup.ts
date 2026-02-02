#!/usr/bin/env node
/**
 * AgentKits Memory Setup CLI
 *
 * Sets up memory hooks and downloads embedding model.
 *
 * Usage:
 *   npx agentkits-memory-setup [options]
 *
 * Options:
 *   --project-dir=X   Project directory (default: cwd)
 *   --force           Overwrite existing hooks
 *   --skip-model      Skip embedding model download
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

async function main() {
  const options = parseArgs();
  const projectDir = (options['project-dir'] as string) || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const force = !!options.force;
  const asJson = !!options.json;
  const skipModel = !!options['skip-model'];

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

    // Download embedding model
    let modelDownloaded = false;
    if (!skipModel) {
      modelDownloaded = await downloadModel(memoryDir, asJson);
    }

    const result = {
      success: true,
      settingsPath,
      memoryDir,
      hooksAdded: Object.keys(MEMORY_HOOKS),
      modelDownloaded,
      message: 'Memory setup complete',
    };

    if (asJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('✅ AgentKits Memory Setup Complete\n');
      console.log(`Settings: ${settingsPath}`);
      console.log(`Memory:   ${memoryDir}`);
      console.log(`\nHooks added: ${result.hooksAdded.join(', ')}`);
      if (modelDownloaded) {
        console.log('Model: Downloaded and ready');
      } else if (skipModel) {
        console.log('Model: Skipped (will download on first use)');
      }
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
