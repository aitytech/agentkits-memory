/**
 * Unit Tests for Hook Types and Utilities
 *
 * @module @agentkits/memory/hooks/__tests__/types
 */

import { describe, it, expect } from 'vitest';
import {
  generateObservationId,
  getProjectName,
  getObservationType,
  generateObservationTitle,
  generateObservationSubtitle,
  generateObservationNarrative,
  extractFilePaths,
  extractFacts,
  extractConcepts,
  truncate,
  parseHookInput,
  formatResponse,
  STANDARD_RESPONSE,
} from '../types.js';

describe('Hook Types Utilities', () => {
  describe('generateObservationId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateObservationId();
      const id2 = generateObservationId();

      expect(id1).not.toBe(id2);
    });

    it('should start with obs_ prefix', () => {
      const id = generateObservationId();

      expect(id).toMatch(/^obs_/);
    });

    it('should contain timestamp and random parts', () => {
      const id = generateObservationId();
      const parts = id.split('_');

      expect(parts.length).toBe(3);
      expect(parts[0]).toBe('obs');
      expect(parts[1].length).toBeGreaterThan(0); // timestamp
      expect(parts[2].length).toBe(4); // random
    });
  });

  describe('getProjectName', () => {
    it('should extract project name from Unix path', () => {
      expect(getProjectName('/home/user/projects/my-app')).toBe('my-app');
    });

    it('should extract project name from Windows path', () => {
      expect(getProjectName('C:\\Users\\user\\projects\\my-app')).toBe('my-app');
    });

    it('should handle trailing slash', () => {
      // Trailing slash results in empty string which gets mapped to 'unknown'
      expect(getProjectName('/home/user/projects/my-app/')).toBe('unknown');
    });

    it('should return unknown for empty path', () => {
      expect(getProjectName('')).toBe('unknown');
    });

    it('should handle single directory', () => {
      expect(getProjectName('my-app')).toBe('my-app');
    });
  });

  describe('getObservationType', () => {
    it('should classify read tools', () => {
      expect(getObservationType('Read')).toBe('read');
      expect(getObservationType('Glob')).toBe('read');
      expect(getObservationType('Grep')).toBe('read');
      expect(getObservationType('LS')).toBe('read');
    });

    it('should classify write tools', () => {
      expect(getObservationType('Write')).toBe('write');
      expect(getObservationType('Edit')).toBe('write');
      expect(getObservationType('NotebookEdit')).toBe('write');
    });

    it('should classify execute tools', () => {
      expect(getObservationType('Bash')).toBe('execute');
      expect(getObservationType('Task')).toBe('execute');
      expect(getObservationType('Skill')).toBe('execute');
    });

    it('should classify search tools', () => {
      expect(getObservationType('WebSearch')).toBe('search');
      expect(getObservationType('WebFetch')).toBe('search');
    });

    it('should return other for unknown tools', () => {
      expect(getObservationType('UnknownTool')).toBe('other');
      expect(getObservationType('CustomTool')).toBe('other');
    });
  });

  describe('generateObservationTitle', () => {
    it('should generate title for Read tool', () => {
      const title = generateObservationTitle('Read', { file_path: '/path/to/file.ts' });
      expect(title).toBe('Read /path/to/file.ts');
    });

    it('should generate title for Write tool', () => {
      const title = generateObservationTitle('Write', { file_path: '/path/to/file.ts' });
      expect(title).toBe('Write /path/to/file.ts');
    });

    it('should generate title for Edit tool', () => {
      const title = generateObservationTitle('Edit', { file_path: '/path/to/file.ts' });
      expect(title).toBe('Edit /path/to/file.ts');
    });

    it('should generate title for Bash tool', () => {
      const title = generateObservationTitle('Bash', { command: 'npm install' });
      expect(title).toBe('Run: npm install');
    });

    it('should truncate long Bash commands', () => {
      const longCommand = 'npm install some-very-long-package-name-that-exceeds-fifty-characters';
      const title = generateObservationTitle('Bash', { command: longCommand });
      expect(title).toBe(`Run: ${longCommand.substring(0, 50)}...`);
    });

    it('should generate title for Glob tool', () => {
      const title = generateObservationTitle('Glob', { pattern: '**/*.ts' });
      expect(title).toBe('Find **/*.ts');
    });

    it('should generate title for Grep tool', () => {
      const title = generateObservationTitle('Grep', { pattern: 'function\\s+\\w+' });
      expect(title).toBe('Search "function\\s+\\w+"');
    });

    it('should generate title for Task tool', () => {
      const title = generateObservationTitle('Task', { description: 'explore codebase' });
      expect(title).toBe('Task: explore codebase');
    });

    it('should generate title for WebSearch tool', () => {
      const title = generateObservationTitle('WebSearch', { query: 'typescript best practices' });
      expect(title).toBe('Search: typescript best practices');
    });

    it('should generate title for WebFetch tool', () => {
      const title = generateObservationTitle('WebFetch', { url: 'https://example.com' });
      expect(title).toBe('Fetch: https://example.com');
    });

    it('should handle unknown tools', () => {
      const title = generateObservationTitle('CustomTool', { foo: 'bar' });
      expect(title).toBe('CustomTool');
    });

    it('should handle Edit with path fallback', () => {
      const title = generateObservationTitle('Edit', { path: '/path/file.ts' });
      expect(title).toBe('Edit /path/file.ts');
    });

    it('should handle Edit with no path', () => {
      const title = generateObservationTitle('Edit', {});
      expect(title).toBe('Edit file');
    });

    it('should handle Bash with empty command', () => {
      const title = generateObservationTitle('Bash', {});
      expect(title).toBe('Run: ');
    });

    it('should handle Glob with no pattern', () => {
      const title = generateObservationTitle('Glob', {});
      expect(title).toBe('Find files');
    });

    it('should handle Grep with no pattern', () => {
      const title = generateObservationTitle('Grep', {});
      expect(title).toBe('Search ""');
    });

    it('should handle Task with no description', () => {
      const title = generateObservationTitle('Task', {});
      expect(title).toBe('Task: agent');
    });

    it('should handle WebSearch with no query', () => {
      const title = generateObservationTitle('WebSearch', {});
      expect(title).toBe('Search: ');
    });

    it('should handle WebFetch with no url', () => {
      const title = generateObservationTitle('WebFetch', {});
      expect(title).toBe('Fetch: ');
    });

    it('should handle string input', () => {
      const title = generateObservationTitle('Read', JSON.stringify({ file_path: '/path/file.ts' }));
      expect(title).toBe('Read /path/file.ts');
    });

    it('should handle null input', () => {
      const title = generateObservationTitle('Read', null);
      expect(title).toBe('Read file');
    });

    it('should handle parse errors gracefully', () => {
      const title = generateObservationTitle('Read', 'invalid json {');
      expect(title).toBe('Read');
    });
  });

  describe('truncate', () => {
    it('should not truncate short strings', () => {
      const str = 'Hello World';
      expect(truncate(str, 100)).toBe(str);
    });

    it('should truncate long strings', () => {
      const str = 'A'.repeat(200);
      const result = truncate(str, 100);

      expect(result.length).toBe(100 + '...[truncated]'.length);
      expect(result).toContain('...[truncated]');
    });

    it('should use default max length of 1000', () => {
      const str = 'A'.repeat(1500);
      const result = truncate(str);

      expect(result.length).toBe(1000 + '...[truncated]'.length);
    });

    it('should handle exact length', () => {
      const str = 'A'.repeat(100);
      expect(truncate(str, 100)).toBe(str);
    });
  });

  describe('parseHookInput', () => {
    it('should parse valid JSON input', () => {
      const input = JSON.stringify({
        session_id: 'test-session-123',
        cwd: '/path/to/project',
        prompt: 'Hello Claude',
        tool_name: 'Read',
        tool_input: { file_path: '/path/to/file.ts' },
        tool_result: { content: 'file contents' },
      });

      const parsed = parseHookInput(input);

      expect(parsed.sessionId).toBe('test-session-123');
      expect(parsed.cwd).toBe('/path/to/project');
      expect(parsed.project).toBe('project');
      expect(parsed.prompt).toBe('Hello Claude');
      expect(parsed.toolName).toBe('Read');
      expect(parsed.toolInput).toEqual({ file_path: '/path/to/file.ts' });
      expect(parsed.toolResponse).toEqual({ content: 'file contents' });
      expect(parsed.timestamp).toBeGreaterThan(0);
    });

    it('should handle missing session_id', () => {
      const input = JSON.stringify({ cwd: '/path/to/project' });
      const parsed = parseHookInput(input);

      expect(parsed.sessionId).toMatch(/^session_\d+$/);
    });

    it('should handle missing cwd', () => {
      const input = JSON.stringify({ session_id: 'test' });
      const parsed = parseHookInput(input);

      expect(parsed.cwd).toBe(process.cwd());
    });

    it('should handle empty input', () => {
      const parsed = parseHookInput('');

      expect(parsed.sessionId).toMatch(/^session_\d+$/);
      expect(parsed.cwd).toBe(process.cwd());
      expect(parsed.timestamp).toBeGreaterThan(0);
    });

    it('should handle invalid JSON', () => {
      const parsed = parseHookInput('not valid json');

      expect(parsed.sessionId).toMatch(/^session_\d+$/);
      expect(parsed.cwd).toBe(process.cwd());
    });

    it('should parse transcript_path and stop_reason', () => {
      const input = JSON.stringify({
        session_id: 'test',
        cwd: '/path',
        transcript_path: '/path/to/transcript.json',
        stop_reason: 'user_exit',
      });

      const parsed = parseHookInput(input);

      expect(parsed.transcriptPath).toBe('/path/to/transcript.json');
      expect(parsed.stopReason).toBe('user_exit');
    });
  });

  describe('formatResponse', () => {
    it('should format standard response', () => {
      const result = {
        continue: true,
        suppressOutput: true,
      };

      const response = formatResponse(result);
      const parsed = JSON.parse(response);

      expect(parsed).toEqual(STANDARD_RESPONSE);
    });

    it('should format response with additionalContext', () => {
      const result = {
        continue: true,
        suppressOutput: false,
        additionalContext: '# Memory Context\n\nSome context here',
      };

      const response = formatResponse(result);
      const parsed = JSON.parse(response);

      expect(parsed.hookSpecificOutput).toBeDefined();
      expect(parsed.hookSpecificOutput.hookEventName).toBe('SessionStart');
      expect(parsed.hookSpecificOutput.additionalContext).toBe('# Memory Context\n\nSome context here');
    });
  });

  describe('STANDARD_RESPONSE', () => {
    it('should have correct structure', () => {
      expect(STANDARD_RESPONSE.continue).toBe(true);
      expect(STANDARD_RESPONSE.suppressOutput).toBe(true);
    });
  });

  describe('extractFilePaths', () => {
    it('should extract read file paths', () => {
      const result = extractFilePaths('Read', { file_path: '/path/to/file.ts' });
      expect(result.filesRead).toEqual(['/path/to/file.ts']);
      expect(result.filesModified).toEqual([]);
    });

    it('should extract write file paths', () => {
      const result = extractFilePaths('Write', { file_path: '/path/to/file.ts' });
      expect(result.filesRead).toEqual([]);
      expect(result.filesModified).toEqual(['/path/to/file.ts']);
    });

    it('should extract edit file paths', () => {
      const result = extractFilePaths('Edit', { file_path: '/path/to/file.ts' });
      expect(result.filesRead).toEqual([]);
      expect(result.filesModified).toEqual(['/path/to/file.ts']);
    });

    it('should use path fallback', () => {
      const result = extractFilePaths('Read', { path: '/path/to/dir' });
      expect(result.filesRead).toEqual(['/path/to/dir']);
    });

    it('should return empty for Bash', () => {
      const result = extractFilePaths('Bash', { command: 'npm test' });
      expect(result.filesRead).toEqual([]);
      expect(result.filesModified).toEqual([]);
    });

    it('should handle null input', () => {
      const result = extractFilePaths('Read', null);
      expect(result.filesRead).toEqual([]);
      expect(result.filesModified).toEqual([]);
    });

    it('should handle string input', () => {
      const result = extractFilePaths('Read', JSON.stringify({ file_path: '/path/file.ts' }));
      expect(result.filesRead).toEqual(['/path/file.ts']);
    });
  });

  describe('generateObservationSubtitle', () => {
    it('should generate subtitle for Read', () => {
      const subtitle = generateObservationSubtitle('Read', { file_path: '/src/index.ts' });
      expect(subtitle).toBe('Examining index.ts');
    });

    it('should generate subtitle for Write', () => {
      const subtitle = generateObservationSubtitle('Write', { file_path: '/src/auth.ts' });
      expect(subtitle).toBe('Creating/updating auth.ts');
    });

    it('should generate subtitle for Edit', () => {
      const subtitle = generateObservationSubtitle('Edit', { file_path: '/src/utils.ts' });
      expect(subtitle).toBe('Modifying utils.ts');
    });

    it('should generate subtitle for Bash with known commands', () => {
      expect(generateObservationSubtitle('Bash', { command: 'npm test' })).toBe('Running npm command');
      expect(generateObservationSubtitle('Bash', { command: 'git status' })).toBe('Git operation');
      expect(generateObservationSubtitle('Bash', { command: 'docker build .' })).toBe('Docker operation');
    });

    it('should generate subtitle for Glob', () => {
      const subtitle = generateObservationSubtitle('Glob', { pattern: '**/*.ts' });
      expect(subtitle).toBe('Searching for **/*.ts pattern');
    });

    it('should generate subtitle for Grep', () => {
      const subtitle = generateObservationSubtitle('Grep', { pattern: 'function' });
      expect(subtitle).toBe('Searching code for "function"');
    });

    it('should generate subtitle for Task', () => {
      const subtitle = generateObservationSubtitle('Task', { subagent_type: 'Explore' });
      expect(subtitle).toBe('Delegating to Explore');
    });

    it('should generate subtitle for WebSearch', () => {
      const subtitle = generateObservationSubtitle('WebSearch', { query: 'typescript best practices' });
      expect(subtitle).toContain('typescript best practices');
    });

    it('should handle unknown tools', () => {
      const subtitle = generateObservationSubtitle('CustomTool', {});
      expect(subtitle).toBe('Using CustomTool tool');
    });
  });

  describe('generateObservationNarrative', () => {
    it('should generate narrative for Read', () => {
      const narrative = generateObservationNarrative('Read', { file_path: '/src/index.ts' });
      expect(narrative).toContain('/src/index.ts');
      expect(narrative).toContain('Read');
    });

    it('should generate narrative for Write', () => {
      const narrative = generateObservationNarrative('Write', { file_path: '/src/new.ts' });
      expect(narrative).toContain('/src/new.ts');
      expect(narrative).toContain('Wrote');
    });

    it('should generate narrative for Bash test commands', () => {
      const narrative = generateObservationNarrative('Bash', { command: 'npm test' });
      expect(narrative).toContain('test');
    });

    it('should generate narrative for Bash build commands', () => {
      const narrative = generateObservationNarrative('Bash', { command: 'tsc' });
      expect(narrative).toContain('Built');
    });

    it('should generate narrative for Grep', () => {
      const narrative = generateObservationNarrative('Grep', { pattern: 'TODO', path: 'src' });
      expect(narrative).toContain('TODO');
      expect(narrative).toContain('src');
    });

    it('should handle unknown tools', () => {
      const narrative = generateObservationNarrative('CustomTool', {});
      expect(narrative).toBe('Used CustomTool tool.');
    });
  });

  describe('extractFacts', () => {
    it('should extract facts from Read', () => {
      const facts = extractFacts('Read', { file_path: '/src/index.ts' }, {});
      expect(facts).toContain('File read: /src/index.ts');
    });

    it('should extract facts from Write', () => {
      const facts = extractFacts('Write', { file_path: '/src/new.ts' }, {});
      expect(facts).toContain('File created/updated: /src/new.ts');
    });

    it('should extract facts from Edit', () => {
      const facts = extractFacts('Edit', { file_path: '/src/index.ts', old_string: 'old code' }, {});
      expect(facts.length).toBe(2);
      expect(facts[0]).toContain('/src/index.ts');
      expect(facts[1]).toContain('replaced');
    });

    it('should extract facts from Bash with test results', () => {
      const facts = extractFacts('Bash', { command: 'npm test' }, { stdout: '5 tests passed' });
      expect(facts.some(f => f.includes('npm test'))).toBe(true);
      expect(facts.some(f => f === 'Tests passed')).toBe(true);
    });

    it('should extract facts from Bash with errors', () => {
      const facts = extractFacts('Bash', { command: 'tsc' }, { stdout: 'Error: TS2304' });
      expect(facts.some(f => f === 'Errors encountered')).toBe(true);
    });

    it('should extract facts from WebSearch', () => {
      const facts = extractFacts('WebSearch', { query: 'typescript tutorial' }, {});
      expect(facts).toContain('Web search: typescript tutorial');
    });

    it('should handle null inputs', () => {
      const facts = extractFacts('Read', null, null);
      expect(facts).toEqual([]);
    });
  });

  describe('extractConcepts', () => {
    it('should extract concepts from TypeScript files', () => {
      const concepts = extractConcepts('Read', { file_path: 'src/hooks/types.ts' });
      expect(concepts).toContain('typescript');
      expect(concepts).toContain('hooks');
    });

    it('should extract concepts from test files', () => {
      const concepts = extractConcepts('Read', { file_path: 'src/__tests__/index.test.ts' });
      expect(concepts).toContain('testing');
      expect(concepts).toContain('typescript');
    });

    it('should extract concepts from Bash commands', () => {
      const concepts = extractConcepts('Bash', { command: 'npm test' });
      expect(concepts).toContain('testing');
      expect(concepts).toContain('package-management');
    });

    it('should extract concepts from git commands', () => {
      const concepts = extractConcepts('Bash', { command: 'git status' });
      expect(concepts).toContain('version-control');
    });

    it('should extract concepts from WebSearch', () => {
      const concepts = extractConcepts('WebSearch', {});
      expect(concepts).toContain('research');
    });

    it('should extract concepts from Task', () => {
      const concepts = extractConcepts('Task', { subagent_type: 'Explore' });
      expect(concepts).toContain('delegation');
      expect(concepts).toContain('Explore');
    });

    it('should deduplicate concepts', () => {
      const concepts = extractConcepts('Bash', { command: 'npm test && npm test' });
      const unique = new Set(concepts);
      expect(concepts.length).toBe(unique.size);
    });

    it('should handle null inputs', () => {
      const concepts = extractConcepts('Read', null);
      expect(concepts).toEqual([]);
    });
  });
});
