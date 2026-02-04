/**
 * Platform definitions for AI coding assistants.
 *
 * Centralized registry of supported platforms with their
 * config paths, MCP locations, rules files, and capabilities.
 *
 * @module @agentkits/memory/cli/platforms
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ===== Types =====

export type PlatformId = 'claude-code' | 'cursor' | 'windsurf' | 'cline' | 'opencode';

export interface PlatformDefinition {
  /** Unique platform identifier */
  id: PlatformId;
  /** Human-readable name */
  name: string;
  /** Config directory relative to project root */
  configDir: string;
  /** MCP config file path relative to project root */
  mcpConfigPath: string;
  /**
   * How MCP server is stored in the config file:
   * - 'embedded': mcpServers key inside an existing settings file (Claude Code)
   * - 'standalone': dedicated mcp.json file with { mcpServers: { ... } }
   */
  mcpConfigFormat: 'embedded' | 'standalone';
  /** Rules file name relative to project root (null if not supported) */
  rulesFile: string | null;
  /** Skills directory relative to project root (null if not supported) */
  skillsDir: string | null;
  /** Whether hooks are supported natively */
  supportsHooks: boolean;
}

// ===== Platform Registry =====

export const PLATFORMS: Record<PlatformId, PlatformDefinition> = {
  'claude-code': {
    id: 'claude-code',
    name: 'Claude Code',
    configDir: '.claude',
    mcpConfigPath: '.claude/settings.json',
    mcpConfigFormat: 'embedded',
    rulesFile: null, // Claude Code uses CLAUDE.md (managed separately)
    skillsDir: '.claude/skills',
    supportsHooks: true,
  },
  cursor: {
    id: 'cursor',
    name: 'Cursor',
    configDir: '.cursor',
    mcpConfigPath: '.cursor/mcp.json',
    mcpConfigFormat: 'standalone',
    rulesFile: '.cursorrules',
    skillsDir: null,
    supportsHooks: false,
  },
  windsurf: {
    id: 'windsurf',
    name: 'Windsurf',
    configDir: '.windsurf',
    mcpConfigPath: '.windsurf/mcp.json',
    mcpConfigFormat: 'standalone',
    rulesFile: '.windsurfrules',
    skillsDir: null,
    supportsHooks: false,
  },
  cline: {
    id: 'cline',
    name: 'Cline',
    configDir: '.cline',
    mcpConfigPath: '.mcp.json',
    mcpConfigFormat: 'standalone',
    rulesFile: '.clinerules',
    skillsDir: null,
    supportsHooks: false,
  },
  opencode: {
    id: 'opencode',
    name: 'OpenCode',
    configDir: '.opencode',
    mcpConfigPath: '.mcp.json',
    mcpConfigFormat: 'standalone',
    rulesFile: null,
    skillsDir: null,
    supportsHooks: true,
  },
};

/** All platform IDs */
export const ALL_PLATFORM_IDS: PlatformId[] = Object.keys(PLATFORMS) as PlatformId[];

// ===== Detection & Resolution =====

/**
 * Detect which platforms are present in a project directory.
 * Checks for existence of platform-specific config directories.
 */
export function detectPlatforms(projectDir: string): PlatformId[] {
  const detected: PlatformId[] = [];

  for (const platform of Object.values(PLATFORMS)) {
    const configPath = path.join(projectDir, platform.configDir);
    if (fs.existsSync(configPath)) {
      detected.push(platform.id);
    }
  }

  return detected;
}

/**
 * Resolve platforms from CLI --platform flag.
 *
 * Supports:
 * - 'all' → all platforms
 * - 'cursor,windsurf' → specific platforms
 * - 'cursor' → single platform
 * - undefined → auto-detect, fallback to ['claude-code']
 */
export function resolvePlatforms(
  platformArg: string | undefined,
  projectDir: string
): PlatformId[] {
  // Explicit 'all'
  if (platformArg === 'all') {
    return ALL_PLATFORM_IDS;
  }

  // Explicit platform(s)
  if (platformArg) {
    const ids = platformArg.split(',').map(s => s.trim()) as PlatformId[];
    const valid = ids.filter(id => id in PLATFORMS);
    if (valid.length > 0) return valid;
    // Invalid platform names → fall through to auto-detect
  }

  // Auto-detect
  const detected = detectPlatforms(projectDir);
  if (detected.length > 0) return detected;

  // Default: Claude Code
  return ['claude-code'];
}
