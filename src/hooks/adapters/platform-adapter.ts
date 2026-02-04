/**
 * Platform Adapter Interface
 *
 * Abstracts platform-specific stdin/stdout formats for hook handlers.
 * Each AI coding assistant (Claude Code, OpenCode, etc.) sends different
 * JSON formats; adapters normalize them to NormalizedHookInput.
 *
 * @module @agentkits/memory/hooks/adapters/platform-adapter
 */

import type { NormalizedHookInput, HookResult } from '../types.js';
import { ClaudeCodeAdapter } from './claude-code-adapter.js';
import { OpenCodeAdapter } from './opencode-adapter.js';
import { GenericAdapter } from './generic-adapter.js';

/**
 * Platform adapter interface.
 * Translates between platform-specific stdin/stdout formats
 * and the normalized internal types used by hook handlers.
 */
export interface PlatformAdapter {
  /** Platform identifier */
  readonly name: string;

  /**
   * Parse platform-specific stdin JSON into normalized input.
   */
  parseInput(stdin: string): NormalizedHookInput;

  /**
   * Format hook result into platform-specific stdout JSON.
   */
  formatOutput(result: HookResult): string;

  /**
   * Supported hook event types for this platform.
   */
  readonly supportedEvents: readonly string[];
}

/**
 * Resolve the appropriate adapter based on environment.
 *
 * Resolution order:
 * 1. AGENTKITS_PLATFORM env var (explicit override)
 * 2. Auto-detect from Claude-specific env vars
 * 3. Default: claude-code (backward compatible)
 */
export function resolveAdapter(): PlatformAdapter {
  const envPlatform = process.env.AGENTKITS_PLATFORM;

  if (envPlatform) {
    switch (envPlatform) {
      case 'opencode':
        return new OpenCodeAdapter();
      case 'generic':
        return new GenericAdapter();
      case 'claude-code':
        return new ClaudeCodeAdapter();
      default:
        // Unknown platform → fallback to Claude Code
        return new ClaudeCodeAdapter();
    }
  }

  // Default: Claude Code (backward compatible)
  return new ClaudeCodeAdapter();
}
