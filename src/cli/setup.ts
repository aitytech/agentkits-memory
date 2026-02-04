#!/usr/bin/env node
/**
 * AgentKits Memory Setup CLI
 *
 * Sets up memory hooks, MCP server, and downloads embedding model.
 * Supports multiple AI tools: Claude Code, Cursor, Windsurf, Cline, OpenCode.
 *
 * Usage:
 *   npx agentkits-memory-setup [options]
 *
 * Options:
 *   --project-dir=X   Project directory (default: cwd)
 *   --platform=X      Target platform(s): claude-code, cursor, windsurf, cline, opencode, all
 *                     Default: auto-detect, fallback to claude-code
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
import { type PlatformDefinition, type PlatformId, PLATFORMS, resolvePlatforms } from './platforms.js';
import { installRulesFile } from './rules-generator.js';

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
 * Configure MCP server for a specific platform.
 * Handles two formats:
 * - 'embedded': mcpServers key inside an existing settings file (Claude Code)
 * - 'standalone': dedicated mcp.json file with { mcpServers: { ... } }
 */
function configureMcpForPlatform(
  projectDir: string,
  platform: PlatformDefinition,
  force: boolean,
  asJson: boolean,
  claudeSettings?: ClaudeSettings,
): { configured: boolean; path: string } {
  const mcpPath = path.join(projectDir, platform.mcpConfigPath);

  if (platform.mcpConfigFormat === 'embedded' && claudeSettings) {
    // Claude Code: mcpServers key inside settings.json
    if (!claudeSettings.mcpServers) {
      claudeSettings.mcpServers = {};
    }
    if (!claudeSettings.mcpServers.memory || force) {
      claudeSettings.mcpServers.memory = MEMORY_MCP_SERVER;
      return { configured: true, path: mcpPath };
    }
    return { configured: false, path: mcpPath };
  }

  // Standalone mcp.json
  try {
    let existing: McpConfig = { mcpServers: {} };

    if (fs.existsSync(mcpPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(mcpPath, 'utf-8')) as McpConfig;
        existing.mcpServers = existing.mcpServers || {};
      } catch {
        if (!asJson) {
          console.warn(`   ⚠ ${platform.mcpConfigPath} parse error, creating new config`);
        }
        existing = { mcpServers: {} };
      }
    }

    if (!existing.mcpServers.memory || force) {
      // Ensure parent directory exists
      const mcpDir = path.dirname(mcpPath);
      if (!fs.existsSync(mcpDir)) {
        fs.mkdirSync(mcpDir, { recursive: true });
      }
      existing.mcpServers.memory = MEMORY_MCP_SERVER;
      fs.writeFileSync(mcpPath, JSON.stringify(existing, null, 2));
      return { configured: true, path: mcpPath };
    }
    return { configured: false, path: mcpPath };
  } catch {
    return { configured: false, path: mcpPath };
  }
}

/**
 * Install memory skills to a platform's skills directory.
 * Copies SKILL.md files from package to project's skills directory.
 */
function installSkills(
  projectDir: string,
  platform: PlatformDefinition,
  force: boolean,
  asJson: boolean
): { installed: string[]; skipped: string[] } {
  const installed: string[] = [];
  const skipped: string[] = [];

  if (!platform.skillsDir) return { installed, skipped };

  // Resolve package root: setup.ts is at dist/cli/setup.js → package root is ../../
  const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  const sourceSkillsDir = path.join(packageRoot, 'skills');

  if (!fs.existsSync(sourceSkillsDir)) {
    return { installed, skipped };
  }

  let skillDirs: fs.Dirent[];
  try {
    skillDirs = fs.readdirSync(sourceSkillsDir, { withFileTypes: true })
      .filter(d => d.isDirectory());
  } catch {
    return { installed, skipped };
  }

  for (const skillDir of skillDirs) {
    const sourcePath = path.join(sourceSkillsDir, skillDir.name, 'SKILL.md');
    const targetDir = path.join(projectDir, platform.skillsDir, skillDir.name);
    const targetPath = path.join(targetDir, 'SKILL.md');

    if (!fs.existsSync(sourcePath)) continue;

    if (fs.existsSync(targetPath) && !force) {
      skipped.push(skillDir.name);
      continue;
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.copyFileSync(sourcePath, targetPath);
    installed.push(skillDir.name);
  }

  if (!asJson && installed.length > 0) {
    console.log('\n🎯 Skills installed:');
    for (const skill of installed) {
      console.log(`   ✓ ${skill} (${platform.skillsDir}/${skill}/SKILL.md)`);
    }
  }

  return { installed, skipped };
}

/**
 * Create default memory settings file if not exists
 */
function createDefaultSettings(memoryDir: string, force: boolean): boolean {
  const settingsPath = path.join(memoryDir, 'settings.json');
  if (fs.existsSync(settingsPath) && !force) return false;

  const defaultSettings = {
    context: {
      showSummaries: true,
      showPrompts: true,
      showObservations: true,
      showToolGuidance: true,
      maxSummaries: 3,
      maxPrompts: 10,
      maxObservations: 10,
    },
  };
  fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
  return true;
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
  const platformArg = options.platform as string | undefined;

  // Just show hooks config and exit
  if (showHooks) {
    printHooksConfig();
    return;
  }

  // Resolve target platforms
  const targetPlatforms = resolvePlatforms(platformArg, projectDir);

  // Memory data always stored under .claude/memory (single source of truth)
  const claudeDir = path.join(projectDir, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');
  const memoryDir = path.join(claudeDir, 'memory');

  try {
    if (!asJson) {
      const platformNames = targetPlatforms.map(id => PLATFORMS[id].name).join(', ');
      console.log('\n🧠 AgentKits Memory Setup\n');
      console.log(`   Platforms: ${platformNames}`);
    }

    // Always create memory directory (single source of truth)
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }

    // Track results across all platforms
    const mcpConfigured: string[] = [];
    const mcpSkipped: string[] = [];
    const rulesInstalled: string[] = [];
    const rulesSkipped: string[] = [];
    let hooksResult: MergeResult = { merged: {}, added: [], skipped: [], manualRequired: [] };
    let skillsResult = { installed: [] as string[], skipped: [] as string[] };

    // Load Claude settings (needed for embedded MCP + hooks)
    let claudeSettings: ClaudeSettings = {};
    if (fs.existsSync(settingsPath)) {
      const content = fs.readFileSync(settingsPath, 'utf-8');
      claudeSettings = JSON.parse(content);
    }

    // Process each platform
    for (const platformId of targetPlatforms) {
      const platform = PLATFORMS[platformId];

      // 1. Configure MCP
      if (!skipMcp) {
        const mcpResult = configureMcpForPlatform(
          projectDir, platform, force, asJson,
          platformId === 'claude-code' ? claudeSettings : undefined,
        );
        if (mcpResult.configured) {
          mcpConfigured.push(`${platform.name} (${platform.mcpConfigPath})`);
        } else {
          mcpSkipped.push(`${platform.name} (already configured)`);
        }
      }

      // 2. Install hooks (Claude Code only for now; OpenCode in Phase B)
      if (platformId === 'claude-code') {
        hooksResult = mergeHooks(claudeSettings.hooks, MEMORY_HOOKS, force);
        claudeSettings.hooks = hooksResult.merged;
      }

      // 3. Install skills (platforms that support them)
      if (platform.skillsDir) {
        const result = installSkills(projectDir, platform, force, asJson);
        skillsResult.installed.push(...result.installed);
        skillsResult.skipped.push(...result.skipped);
      }

      // 4. Install rules file (platforms that support them)
      if (platform.rulesFile) {
        const result = installRulesFile(projectDir, platform.rulesFile, force, asJson);
        if (result.installed) {
          rulesInstalled.push(`${platform.rulesFile} (${result.action})`);
        } else {
          rulesSkipped.push(`${platform.rulesFile} (already configured)`);
        }
      }
    }

    // Write Claude settings (hooks + embedded MCP)
    if (targetPlatforms.includes('claude-code')) {
      fs.writeFileSync(settingsPath, JSON.stringify(claudeSettings, null, 2));
    }

    // Create default memory settings
    const settingsCreated = createDefaultSettings(memoryDir, force);
    if (!asJson && settingsCreated) {
      console.log('\n⚙️  Default memory settings created');
    }

    // Download embedding model
    let modelDownloaded = false;
    if (!skipModel) {
      modelDownloaded = await downloadModel(memoryDir, asJson);
    }

    const result = {
      success: true,
      platforms: targetPlatforms,
      settingsPath,
      memoryDir,
      hooksAdded: hooksResult.added,
      hooksSkipped: hooksResult.skipped,
      hooksManualRequired: hooksResult.manualRequired,
      skillsInstalled: skillsResult.installed,
      mcpConfigured,
      rulesInstalled,
      modelDownloaded,
      message: 'Memory setup complete',
    };

    if (asJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('\n✅ Setup Complete\n');
      console.log(`📁 Memory:   ${memoryDir}`);

      // Show MCP status
      if (mcpConfigured.length > 0) {
        console.log('\n🔌 MCP Server configured for:');
        for (const entry of mcpConfigured) {
          console.log(`   ✓ ${entry}`);
        }
      }

      // Show hooks status (Claude Code only)
      if (hooksResult.added.length > 0) {
        console.log(`\n📋 Hooks added: ${hooksResult.added.join(', ')}`);
      }
      if (hooksResult.skipped.length > 0) {
        console.log(`   Skipped: ${hooksResult.skipped.join(', ')}`);
      }

      // Show skills status
      if (skillsResult.installed.length > 0) {
        console.log(`\n🎯 Skills: ${skillsResult.installed.join(', ')}`);
      }

      // Show rules files status
      if (rulesInstalled.length > 0) {
        console.log('\n📝 Rules files:');
        for (const entry of rulesInstalled) {
          console.log(`   ✓ ${entry}`);
        }
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
      if (targetPlatforms.includes('claude-code')) {
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
