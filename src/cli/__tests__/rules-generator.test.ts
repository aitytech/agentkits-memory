/**
 * Tests for Rules File Generator
 *
 * @module @agentkits/memory/cli/__tests__/rules-generator.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { generateRulesContent, installRulesFile } from '../rules-generator.js';

describe('Rules Generator', () => {
  // ===== generateRulesContent =====

  describe('generateRulesContent', () => {
    it('should include platform name', () => {
      const content = generateRulesContent('Cursor');
      expect(content).toContain('Cursor');
    });

    it('should include all MCP tool names', () => {
      const content = generateRulesContent('Test');
      expect(content).toContain('memory_status');
      expect(content).toContain('memory_save');
      expect(content).toContain('memory_search');
      expect(content).toContain('memory_timeline');
      expect(content).toContain('memory_details');
      expect(content).toContain('memory_recall');
      expect(content).toContain('memory_list');
      expect(content).toContain('memory_update');
      expect(content).toContain('memory_delete');
    });

    it('should include workflow steps', () => {
      const content = generateRulesContent('Test');
      // Workflow step numbers 0-4
      expect(content).toContain('memory_status()');
      expect(content).toContain('memory_save(');
      expect(content).toContain('memory_search(');
      expect(content).toContain('memory_timeline(');
      expect(content).toContain('memory_details(');
    });

    it('should include category table', () => {
      const content = generateRulesContent('Test');
      expect(content).toContain('decision');
      expect(content).toContain('pattern');
      expect(content).toContain('error');
      expect(content).toContain('context');
      expect(content).toContain('observation');
    });

    it('should include start/end markers', () => {
      const content = generateRulesContent('Test');
      expect(content).toContain('<!-- AgentKits Memory Rules START -->');
      expect(content).toContain('<!-- AgentKits Memory Rules END -->');
    });

    it('should include token efficiency rules', () => {
      const content = generateRulesContent('Test');
      expect(content).toContain('87%');
    });
  });

  // ===== installRulesFile =====

  describe('installRulesFile', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should create new rules file when not exists', () => {
      const result = installRulesFile(tmpDir, '.cursorrules', false);
      expect(result.installed).toBe(true);
      expect(result.action).toBe('created');
      expect(fs.existsSync(result.path)).toBe(true);

      const content = fs.readFileSync(result.path, 'utf-8');
      expect(content).toContain('AgentKits Memory');
      expect(content).toContain('Cursor');
    });

    it('should append to existing rules file without marker', () => {
      const filePath = path.join(tmpDir, '.cursorrules');
      fs.writeFileSync(filePath, '# Existing rules\nSome content\n');

      const result = installRulesFile(tmpDir, '.cursorrules', false);
      expect(result.installed).toBe(true);
      expect(result.action).toBe('updated');

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('# Existing rules');
      expect(content).toContain('AgentKits Memory');
    });

    it('should skip existing file with marker when not forced', () => {
      const filePath = path.join(tmpDir, '.cursorrules');
      fs.writeFileSync(filePath, '<!-- AgentKits Memory Rules START -->\nold content\n<!-- AgentKits Memory Rules END -->\n');

      const result = installRulesFile(tmpDir, '.cursorrules', false);
      expect(result.installed).toBe(false);
      expect(result.action).toBe('skipped');
    });

    it('should replace existing marker section when forced', () => {
      const filePath = path.join(tmpDir, '.cursorrules');
      fs.writeFileSync(filePath, '# Header\n<!-- AgentKits Memory Rules START -->\nold content\n<!-- AgentKits Memory Rules END -->\n# Footer\n');

      const result = installRulesFile(tmpDir, '.cursorrules', true);
      expect(result.installed).toBe(true);
      expect(result.action).toBe('updated');

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('# Header');
      expect(content).toContain('# Footer');
      expect(content).not.toContain('old content');
      expect(content).toContain('memory_save');
    });

    it('should generate correct platform name from filename', () => {
      const result = installRulesFile(tmpDir, '.windsurfrules', false);
      const content = fs.readFileSync(result.path, 'utf-8');
      expect(content).toContain('Windsurf');
    });

    it('should generate correct platform name for clinerules', () => {
      const result = installRulesFile(tmpDir, '.clinerules', false);
      const content = fs.readFileSync(result.path, 'utf-8');
      expect(content).toContain('Cline');
    });
  });
});
