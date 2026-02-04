/**
 * Tests for Platform Registry
 *
 * @module @agentkits/memory/cli/__tests__/platforms.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  PLATFORMS,
  ALL_PLATFORM_IDS,
  detectPlatforms,
  resolvePlatforms,
  type PlatformId,
} from '../platforms.js';

describe('Platform Registry', () => {
  // ===== PLATFORMS constant =====

  describe('PLATFORMS', () => {
    it('should define all 5 platforms', () => {
      expect(ALL_PLATFORM_IDS).toHaveLength(5);
      expect(ALL_PLATFORM_IDS).toContain('claude-code');
      expect(ALL_PLATFORM_IDS).toContain('cursor');
      expect(ALL_PLATFORM_IDS).toContain('windsurf');
      expect(ALL_PLATFORM_IDS).toContain('cline');
      expect(ALL_PLATFORM_IDS).toContain('opencode');
    });

    it('should have valid configDir for each platform', () => {
      for (const platform of Object.values(PLATFORMS)) {
        expect(platform.configDir).toBeTruthy();
        expect(platform.configDir.startsWith('.')).toBe(true);
      }
    });

    it('should have valid mcpConfigPath for each platform', () => {
      for (const platform of Object.values(PLATFORMS)) {
        expect(platform.mcpConfigPath).toBeTruthy();
        expect(platform.mcpConfigPath).toMatch(/\.(json)$/);
      }
    });

    it('should mark claude-code and opencode as supporting hooks', () => {
      expect(PLATFORMS['claude-code'].supportsHooks).toBe(true);
      expect(PLATFORMS.opencode.supportsHooks).toBe(true);
    });

    it('should mark cursor, windsurf, cline as not supporting hooks', () => {
      expect(PLATFORMS.cursor.supportsHooks).toBe(false);
      expect(PLATFORMS.windsurf.supportsHooks).toBe(false);
      expect(PLATFORMS.cline.supportsHooks).toBe(false);
    });

    it('should have rules files for cursor, windsurf, cline', () => {
      expect(PLATFORMS.cursor.rulesFile).toBe('.cursorrules');
      expect(PLATFORMS.windsurf.rulesFile).toBe('.windsurfrules');
      expect(PLATFORMS.cline.rulesFile).toBe('.clinerules');
    });

    it('should not have rules files for claude-code and opencode', () => {
      expect(PLATFORMS['claude-code'].rulesFile).toBeNull();
      expect(PLATFORMS.opencode.rulesFile).toBeNull();
    });

    it('should only have skillsDir for claude-code', () => {
      expect(PLATFORMS['claude-code'].skillsDir).toBe('.claude/skills');
      expect(PLATFORMS.cursor.skillsDir).toBeNull();
      expect(PLATFORMS.windsurf.skillsDir).toBeNull();
      expect(PLATFORMS.cline.skillsDir).toBeNull();
      expect(PLATFORMS.opencode.skillsDir).toBeNull();
    });

    it('should use embedded mcpConfigFormat only for claude-code', () => {
      expect(PLATFORMS['claude-code'].mcpConfigFormat).toBe('embedded');
      expect(PLATFORMS.cursor.mcpConfigFormat).toBe('standalone');
      expect(PLATFORMS.windsurf.mcpConfigFormat).toBe('standalone');
      expect(PLATFORMS.cline.mcpConfigFormat).toBe('standalone');
      expect(PLATFORMS.opencode.mcpConfigFormat).toBe('standalone');
    });
  });

  // ===== detectPlatforms =====

  describe('detectPlatforms', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'platforms-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should return empty array for empty directory', () => {
      expect(detectPlatforms(tmpDir)).toEqual([]);
    });

    it('should detect claude-code from .claude directory', () => {
      fs.mkdirSync(path.join(tmpDir, '.claude'));
      const detected = detectPlatforms(tmpDir);
      expect(detected).toContain('claude-code');
    });

    it('should detect cursor from .cursor directory', () => {
      fs.mkdirSync(path.join(tmpDir, '.cursor'));
      const detected = detectPlatforms(tmpDir);
      expect(detected).toContain('cursor');
    });

    it('should detect multiple platforms', () => {
      fs.mkdirSync(path.join(tmpDir, '.claude'));
      fs.mkdirSync(path.join(tmpDir, '.cursor'));
      fs.mkdirSync(path.join(tmpDir, '.windsurf'));
      const detected = detectPlatforms(tmpDir);
      expect(detected).toContain('claude-code');
      expect(detected).toContain('cursor');
      expect(detected).toContain('windsurf');
      expect(detected).toHaveLength(3);
    });

    it('should detect all 5 platforms when all present', () => {
      for (const platform of Object.values(PLATFORMS)) {
        fs.mkdirSync(path.join(tmpDir, platform.configDir));
      }
      const detected = detectPlatforms(tmpDir);
      expect(detected).toHaveLength(5);
    });
  });

  // ===== resolvePlatforms =====

  describe('resolvePlatforms', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'platforms-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should return all platforms for "all"', () => {
      const result = resolvePlatforms('all', tmpDir);
      expect(result).toEqual(ALL_PLATFORM_IDS);
    });

    it('should return single platform for "cursor"', () => {
      const result = resolvePlatforms('cursor', tmpDir);
      expect(result).toEqual(['cursor']);
    });

    it('should return multiple platforms for comma-separated list', () => {
      const result = resolvePlatforms('cursor,windsurf', tmpDir);
      expect(result).toEqual(['cursor', 'windsurf']);
    });

    it('should filter invalid platform names', () => {
      const result = resolvePlatforms('cursor,invalid,windsurf', tmpDir);
      expect(result).toEqual(['cursor', 'windsurf']);
    });

    it('should fall back to auto-detect when all names are invalid', () => {
      fs.mkdirSync(path.join(tmpDir, '.cursor'));
      const result = resolvePlatforms('invalid', tmpDir);
      expect(result).toContain('cursor');
    });

    it('should auto-detect when no platformArg is given', () => {
      fs.mkdirSync(path.join(tmpDir, '.cursor'));
      fs.mkdirSync(path.join(tmpDir, '.claude'));
      const result = resolvePlatforms(undefined, tmpDir);
      expect(result).toContain('claude-code');
      expect(result).toContain('cursor');
    });

    it('should default to claude-code when nothing detected', () => {
      const result = resolvePlatforms(undefined, tmpDir);
      expect(result).toEqual(['claude-code']);
    });

    it('should handle empty string by auto-detecting', () => {
      const result = resolvePlatforms('', tmpDir);
      // Empty string is falsy so falls through to auto-detect
      expect(result).toEqual(['claude-code']);
    });
  });
});
