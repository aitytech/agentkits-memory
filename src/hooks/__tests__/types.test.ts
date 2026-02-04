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
  extractCodeDiffs,
  formatDiffFact,
  classifyChangeType,
  detectIntent,
  extractIntents,
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

    it('should handle generateObservationSubtitle catch (unparseable string input)', () => {
      const subtitle = generateObservationSubtitle('Read', 'invalid json {{{');
      expect(subtitle).toContain('Read');
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

    it('should generate narrative for Edit tool', () => {
      const narrative = generateObservationNarrative('Edit', { file_path: '/src/utils.ts', old_string: 'const x = 1' });
      expect(narrative).toContain('/src/utils.ts');
      expect(narrative).toContain('Edited');
      expect(narrative).toContain('const x = 1');
    });

    it('should generate narrative for MultiEdit tool', () => {
      const narrative = generateObservationNarrative('MultiEdit', { file_path: '/src/app.ts' });
      expect(narrative).toContain('/src/app.ts');
      expect(narrative).toContain('Edited');
      // No old_string provided — should show 'code' as fallback
      expect(narrative).toContain('code');
    });

    it('should generate narrative for Glob tool', () => {
      const narrative = generateObservationNarrative('Glob', { pattern: '**/*.tsx' });
      expect(narrative).toContain('**/*.tsx');
      expect(narrative).toContain('Searched');
    });

    it('should generate narrative for Task tool', () => {
      const narrative = generateObservationNarrative('Task', { description: 'explore code', subagent_type: 'Explore' });
      expect(narrative).toContain('Explore');
      expect(narrative).toContain('explore code');
      expect(narrative).toContain('Delegated');
    });

    it('should generate narrative for WebSearch tool', () => {
      const narrative = generateObservationNarrative('WebSearch', { query: 'react hooks' });
      expect(narrative).toContain('react hooks');
    });

    it('should generate narrative for WebFetch tool', () => {
      const narrative = generateObservationNarrative('WebFetch', { url: 'https://docs.example.com' });
      expect(narrative).toContain('https://docs.example.com');
    });

    it('should handle generateObservationNarrative catch (unparseable string input)', () => {
      const narrative = generateObservationNarrative('Read', 'invalid json {{{');
      expect(narrative).toBe('Used Read tool.');
    });

    it('should generate narrative for Bash git commands', () => {
      const narrative = generateObservationNarrative('Bash', { command: 'git status' });
      expect(narrative).toContain('git');
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

    it('should extract facts from Edit with structured diff', () => {
      const facts = extractFacts('Edit', { file_path: '/src/index.ts', old_string: 'old code', new_string: 'new code' }, {});
      expect(facts.length).toBe(2);
      expect(facts[0]).toContain('/src/index.ts');
      expect(facts[1]).toContain('DIFF');
      expect(facts[1]).toContain('old code');
      expect(facts[1]).toContain('new code');
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

    it('should extract facts from Glob', () => {
      const facts = extractFacts('Glob', { pattern: '**/*.ts' }, {});
      expect(facts).toContain('Pattern searched: **/*.ts');
    });

    it('should extract facts from Grep', () => {
      const facts = extractFacts('Grep', { pattern: 'TODO', path: 'src/' }, {});
      expect(facts).toContain('Code pattern searched: TODO');
      expect(facts).toContain('Search scope: src/');
    });

    it('should extract facts from WebFetch', () => {
      const facts = extractFacts('WebFetch', { url: 'https://example.com' }, {});
      expect(facts).toContain('URL fetched: https://example.com');
    });

    it('should extract facts from Task', () => {
      const facts = extractFacts('Task', { description: 'Find files', subagent_type: 'Explore' }, {});
      expect(facts).toContain('Sub-task: Find files');
      expect(facts).toContain('Agent type: Explore');
    });

    it('should extract test failed facts from Bash', () => {
      const facts = extractFacts('Bash', { command: 'npm test' }, { stdout: '2 tests failed ✗' });
      expect(facts).toContain('Tests failed');
    });

    it('should extract error facts from Bash', () => {
      const facts = extractFacts('Bash', { command: 'tsc' }, { stdout: 'Error: something went wrong' });
      expect(facts).toContain('Errors encountered');
    });

    it('should handle MultiEdit with edits array', () => {
      const facts = extractFacts('MultiEdit', {
        file_path: 'app.ts',
        edits: [
          { old_string: 'const x = 1', new_string: 'const x = 2' },
          { old_string: 'let y = 3', new_string: 'let y = 4' },
        ],
      }, {});
      expect(facts).toContain('File modified: app.ts');
      expect(facts.some(f => f.includes('DIFF'))).toBe(true);
      expect(facts.some(f => f.includes('const x = 1'))).toBe(true);
    });

    it('should fallback to Code replaced for MultiEdit without edits array', () => {
      const facts = extractFacts('MultiEdit', { file_path: 'app.ts', old_string: 'old' }, {});
      expect(facts).toContain('File modified: app.ts');
      expect(facts.some(f => f.includes('Code replaced'))).toBe(true);
    });

    it('should handle string toolInput (JSON string)', () => {
      const facts = extractFacts('Read', JSON.stringify({ file_path: 'test.ts' }), '{}');
      expect(facts).toContain('File read: test.ts');
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

    it('should extract fn: concepts from Edit tool', () => {
      const concepts = extractConcepts('Edit', {
        file_path: 'src/auth.ts',
        old_string: 'function login(user) {',
        new_string: 'function login(user, opts) {',
      });
      expect(concepts.some(c => c.startsWith('fn:'))).toBe(true);
      expect(concepts).toContain('fn:login');
    });

    it('should extract class: concepts from Edit tool', () => {
      const concepts = extractConcepts('Edit', {
        file_path: 'src/service.ts',
        old_string: 'class AuthService {',
        new_string: 'class AuthService extends BaseService {',
      });
      expect(concepts).toContain('class:AuthService');
    });

    it('should extract pattern: concepts from Edit tool', () => {
      const concepts = extractConcepts('Edit', {
        file_path: 'src/types.ts',
        old_string: 'export interface Foo {',
        new_string: 'export interface Foo { bar: string; }',
      });
      expect(concepts).toContain('pattern:export');
      expect(concepts).toContain('pattern:interface');
    });

    it('should extract async pattern concept', () => {
      const concepts = extractConcepts('Edit', {
        file_path: 'src/api.ts',
        old_string: 'async function fetchData() {',
        new_string: 'async function fetchData(id: string) {',
      });
      expect(concepts).toContain('pattern:async');
      expect(concepts).toContain('fn:fetchData');
    });

    it('should extract error-handling pattern concept', () => {
      const concepts = extractConcepts('Edit', {
        file_path: 'src/handler.ts',
        old_string: 'return result;',
        new_string: 'try { return result; } catch (e) { throw e; }',
      });
      expect(concepts).toContain('pattern:error-handling');
    });

    it('should not extract fn/class/pattern from non-Edit tools', () => {
      const concepts = extractConcepts('Read', {
        file_path: 'src/auth.ts',
      });
      expect(concepts.some(c => c.startsWith('fn:'))).toBe(false);
      expect(concepts.some(c => c.startsWith('class:'))).toBe(false);
      expect(concepts.some(c => c.startsWith('pattern:'))).toBe(false);
    });
  });

  describe('detectIntent', () => {
    it('should detect bugfix intent from prompt', () => {
      const intents = detectIntent('Edit', { file_path: 'src/app.ts' }, {}, 'Fix the login bug');
      expect(intents).toContain('bugfix');
    });

    it('should detect feature intent from prompt', () => {
      const intents = detectIntent('Write', { file_path: 'src/new.ts' }, {}, 'Add a new payment feature');
      expect(intents).toContain('feature');
    });

    it('should detect refactor intent from prompt', () => {
      const intents = detectIntent('Edit', { file_path: 'src/app.ts' }, {}, 'Refactor the auth module');
      expect(intents).toContain('refactor');
    });

    it('should detect testing intent from prompt', () => {
      const intents = detectIntent('Bash', { command: 'vitest' }, {}, 'Run the tests');
      expect(intents).toContain('testing');
    });

    it('should detect documentation intent from prompt', () => {
      const intents = detectIntent('Write', { file_path: 'README.md' }, {}, 'Update the docs');
      expect(intents).toContain('documentation');
    });

    it('should detect configuration intent from prompt', () => {
      const intents = detectIntent('Edit', { file_path: 'config.json' }, {}, 'Update config settings');
      expect(intents).toContain('configuration');
    });

    it('should detect optimization intent from prompt', () => {
      const intents = detectIntent('Edit', { file_path: 'src/app.ts' }, {}, 'Optimize performance');
      expect(intents).toContain('optimization');
    });

    it('should detect multiple intents', () => {
      const intents = detectIntent('Edit', { file_path: 'src/app.test.ts' }, {}, 'Fix failing test');
      expect(intents).toContain('bugfix');
      expect(intents).toContain('testing');
    });

    it('should default to investigation for read tools without prompt', () => {
      const intents = detectIntent('Read', { file_path: 'src/app.ts' }, {});
      expect(intents).toContain('investigation');
    });

    it('should detect testing from Bash test commands', () => {
      const intents = detectIntent('Bash', { command: 'npx vitest run' }, {});
      expect(intents).toContain('testing');
    });

    it('should detect testing from test file paths', () => {
      const intents = detectIntent('Edit', { file_path: 'src/__tests__/app.test.ts' }, {});
      expect(intents).toContain('testing');
    });

    it('should detect documentation from .md write', () => {
      const intents = detectIntent('Write', { file_path: 'docs/guide.md' }, {});
      expect(intents).toContain('documentation');
    });

    it('should detect configuration from config file writes', () => {
      const intents = detectIntent('Edit', { file_path: 'tsconfig.json' }, {});
      expect(intents).toContain('configuration');
    });

    it('should fallback to investigation when no signals found', () => {
      const intents = detectIntent('Task', {}, {});
      expect(intents).toContain('investigation');
    });
  });

  describe('extractIntents', () => {
    it('should extract intent tags from concepts', () => {
      const intents = extractIntents(['typescript', 'intent:bugfix', 'hooks', 'intent:testing']);
      expect(intents).toEqual(['bugfix', 'testing']);
    });

    it('should return empty array when no intent tags', () => {
      const intents = extractIntents(['typescript', 'hooks', 'api']);
      expect(intents).toEqual([]);
    });

    it('should handle empty array', () => {
      const intents = extractIntents([]);
      expect(intents).toEqual([]);
    });
  });

  describe('extractCodeDiffs', () => {
    it('should extract diff from Edit tool', () => {
      const diffs = extractCodeDiffs('Edit', {
        file_path: 'src/auth.ts',
        old_string: 'function login(user) {',
        new_string: 'function login(user, opts) {',
      });
      expect(diffs).toHaveLength(1);
      expect(diffs[0].file).toBe('src/auth.ts');
      expect(diffs[0].before).toBe('function login(user) {');
      expect(diffs[0].after).toBe('function login(user, opts) {');
    });

    it('should extract multiple diffs from MultiEdit', () => {
      const diffs = extractCodeDiffs('MultiEdit', {
        file_path: 'src/app.ts',
        edits: [
          { old_string: 'const a = 1;', new_string: 'const a = 2;' },
          { old_string: 'let b = true;', new_string: 'let b = false;' },
        ],
      });
      expect(diffs).toHaveLength(2);
      expect(diffs[0].before).toBe('const a = 1;');
      expect(diffs[1].before).toBe('let b = true;');
    });

    it('should return empty array for non-Edit tools', () => {
      expect(extractCodeDiffs('Read', { file_path: 'a.ts' })).toEqual([]);
      expect(extractCodeDiffs('Bash', { command: 'test' })).toEqual([]);
      expect(extractCodeDiffs('Write', { file_path: 'a.ts' })).toEqual([]);
    });

    it('should truncate long strings to 200 chars', () => {
      const longStr = 'x'.repeat(300);
      const diffs = extractCodeDiffs('Edit', {
        file_path: 'a.ts',
        old_string: longStr,
        new_string: 'short',
      });
      expect(diffs[0].before.length).toBe(200);
      expect(diffs[0].after).toBe('short');
    });

    it('should calculate changeLines correctly', () => {
      const diffs = extractCodeDiffs('Edit', {
        file_path: 'a.ts',
        old_string: 'line1',
        new_string: 'line1\nline2\nline3',
      });
      expect(diffs[0].changeLines).toBe(2); // 3 lines - 1 line = +2
    });

    it('should cap MultiEdit at 5 edits', () => {
      const edits = Array.from({ length: 10 }, (_, i) => ({
        old_string: `old${i}`,
        new_string: `new${i}`,
      }));
      const diffs = extractCodeDiffs('MultiEdit', { file_path: 'a.ts', edits });
      expect(diffs).toHaveLength(5);
    });

    it('should handle JSON string input', () => {
      const diffs = extractCodeDiffs('Edit', JSON.stringify({
        file_path: 'src/app.ts',
        old_string: 'before',
        new_string: 'after',
      }));
      expect(diffs).toHaveLength(1);
      expect(diffs[0].before).toBe('before');
    });

    it('should handle missing old_string or new_string', () => {
      const diffs = extractCodeDiffs('Edit', { file_path: 'a.ts' });
      expect(diffs).toEqual([]);
    });

    it('should include changeType in extracted diffs', () => {
      const diffs = extractCodeDiffs('Edit', {
        file_path: 'a.ts',
        old_string: 'function foo() {',
        new_string: 'function foo(arg) {',
      });
      expect(diffs[0].changeType).toBe('modification');
    });

    it('should classify addition when old_string is empty', () => {
      const diffs = extractCodeDiffs('Edit', {
        file_path: 'a.ts',
        old_string: '',
        new_string: 'const newVar = 1;',
      });
      expect(diffs[0].changeType).toBe('addition');
    });

    it('should classify replacement for different first tokens', () => {
      const diffs = extractCodeDiffs('Edit', {
        file_path: 'a.ts',
        old_string: 'import { a } from "./a"',
        new_string: 'export { b } from "./b"',
      });
      expect(diffs[0].changeType).toBe('replacement');
    });

    it('should include changeType in MultiEdit diffs', () => {
      const diffs = extractCodeDiffs('MultiEdit', {
        file_path: 'a.ts',
        edits: [
          { old_string: '', new_string: 'new line' },
          { old_string: 'const a = 1;', new_string: 'const a = 2;' },
        ],
      });
      expect(diffs[0].changeType).toBe('addition');
      expect(diffs[1].changeType).toBe('modification');
    });
  });

  describe('classifyChangeType', () => {
    it('should classify addition (empty before, non-empty after)', () => {
      expect(classifyChangeType('', 'const x = 1;')).toBe('addition');
      expect(classifyChangeType('   ', 'new code')).toBe('addition');
    });

    it('should classify deletion (non-empty before, empty after)', () => {
      expect(classifyChangeType('const x = 1;', '')).toBe('deletion');
      expect(classifyChangeType('old code', '   ')).toBe('deletion');
    });

    it('should classify modification (same first token)', () => {
      expect(classifyChangeType('function login(user) {', 'function login(user, opts) {')).toBe('modification');
      expect(classifyChangeType('const x = 1;', 'const x = 2;')).toBe('modification');
    });

    it('should classify replacement (different first token)', () => {
      expect(classifyChangeType('const x = 1;', 'let y = 2;')).toBe('replacement');
      expect(classifyChangeType('import { a }', 'export { b }')).toBe('replacement');
    });
  });

  describe('formatDiffFact', () => {
    it('should format diff as compact fact string', () => {
      const fact = formatDiffFact({
        file: 'src/auth.ts',
        before: 'function login(user) {',
        after: 'function login(user, opts) {',
        changeLines: 0,
        changeType: 'modification',
      });
      expect(fact).toContain('DIFF');
      expect(fact).toContain('auth.ts');
      expect(fact).toContain('function login(user) {');
      expect(fact).toContain('function login(user, opts) {');
    });

    it('should use filename only (not full path)', () => {
      const fact = formatDiffFact({
        file: '/very/long/path/to/file.ts',
        before: 'old',
        after: 'new',
        changeLines: 0,
        changeType: 'modification',
      });
      expect(fact).toContain('file.ts');
      expect(fact).not.toContain('/very/long');
    });

    it('should truncate long first lines to 60 chars', () => {
      const longLine = 'x'.repeat(100);
      const fact = formatDiffFact({
        file: 'a.ts',
        before: longLine,
        after: 'short',
        changeLines: 0,
        changeType: 'modification',
      });
      // First line is truncated to 60 chars
      expect(fact.length).toBeLessThan(200);
    });

    it('should show [addition] tag for addition changeType', () => {
      const fact = formatDiffFact({
        file: 'a.ts',
        before: '',
        after: 'new code',
        changeLines: 1,
        changeType: 'addition',
      });
      expect(fact).toContain('[addition]');
    });

    it('should show [deletion] tag for deletion changeType', () => {
      const fact = formatDiffFact({
        file: 'a.ts',
        before: 'old code',
        after: '',
        changeLines: -1,
        changeType: 'deletion',
      });
      expect(fact).toContain('[deletion]');
    });

    it('should show [replacement] tag for replacement changeType', () => {
      const fact = formatDiffFact({
        file: 'a.ts',
        before: 'const x = 1;',
        after: 'let y = 2;',
        changeLines: 0,
        changeType: 'replacement',
      });
      expect(fact).toContain('[replacement]');
    });

    it('should not show tag for modification changeType', () => {
      const fact = formatDiffFact({
        file: 'a.ts',
        before: 'const x = 1;',
        after: 'const x = 2;',
        changeLines: 0,
        changeType: 'modification',
      });
      expect(fact).not.toContain('[modification]');
      expect(fact).not.toContain('[');
    });
  });
});
