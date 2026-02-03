/**
 * Unit Tests for AI Enrichment Module
 *
 * Tests the enrichment logic, env toggle, fallback behavior,
 * parseAIResponse, buildExtractionPrompt, and mock CLI flow.
 *
 * @module @agentkits/memory/hooks/__tests__/ai-enrichment
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  enrichWithAI,
  isAIEnrichmentAvailable,
  isAIEnrichmentEnabled,
  resetAIEnrichmentCache,
  parseAIResponse,
  buildExtractionPrompt,
  parseSummaryResponse,
  buildSummaryPrompt,
  enrichSummaryWithAI,
  buildCompressionPrompt,
  parseCompressionResponse,
  compressObservationWithAI,
  buildSessionDigestPrompt,
  parseSessionDigestResponse,
  generateSessionDigestWithAI,
  _setRunClaudePrintMockForTesting,
  _setCliAvailableForTesting,
} from '../ai-enrichment.js';

describe('AI Enrichment Module', () => {
  const originalEnv = process.env.AGENTKITS_AI_ENRICHMENT;

  beforeEach(() => {
    resetAIEnrichmentCache();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
    } else {
      process.env.AGENTKITS_AI_ENRICHMENT = originalEnv;
    }
    resetAIEnrichmentCache();
  });

  describe('environment variable control', () => {
    it('should return null when AGENTKITS_AI_ENRICHMENT=false', async () => {
      process.env.AGENTKITS_AI_ENRICHMENT = 'false';
      const result = await enrichWithAI('Read', '{"file_path":"test.ts"}', '{}');
      expect(result).toBeNull();
    });

    it('should return null when AGENTKITS_AI_ENRICHMENT=0', async () => {
      process.env.AGENTKITS_AI_ENRICHMENT = '0';
      const result = await enrichWithAI('Read', '{"file_path":"test.ts"}', '{}');
      expect(result).toBeNull();
    });

    it('should attempt enrichment when AGENTKITS_AI_ENRICHMENT=true', async () => {
      process.env.AGENTKITS_AI_ENRICHMENT = 'true';
      const result = await enrichWithAI('Read', '{"file_path":"test.ts"}', '{}');
      // Returns enriched data if CLI available, null otherwise
      if (result !== null) {
        expect(typeof result.subtitle).toBe('string');
        expect(typeof result.narrative).toBe('string');
        expect(Array.isArray(result.facts)).toBe(true);
        expect(Array.isArray(result.concepts)).toBe(true);
      }
    });

    it('should auto-detect when env not set', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      const result = await enrichWithAI('Read', '{"file_path":"test.ts"}', '{}');
      // Returns enriched data if CLI available, null otherwise
      if (result !== null) {
        expect(typeof result.subtitle).toBe('string');
        expect(typeof result.narrative).toBe('string');
      }
    });

    it('should handle AGENTKITS_AI_ENRICHMENT=1', async () => {
      process.env.AGENTKITS_AI_ENRICHMENT = '1';
      resetAIEnrichmentCache();
      const result = await enrichWithAI('Read', '{}', '{}');
      // Returns enriched data if CLI available, null otherwise
      if (result !== null) {
        expect(typeof result.subtitle).toBe('string');
      }
    });
  });

  describe('isAIEnrichmentEnabled (sync)', () => {
    it('should return false when env=false', () => {
      process.env.AGENTKITS_AI_ENRICHMENT = 'false';
      expect(isAIEnrichmentEnabled()).toBe(false);
    });

    it('should return false when env=0', () => {
      process.env.AGENTKITS_AI_ENRICHMENT = '0';
      expect(isAIEnrichmentEnabled()).toBe(false);
    });

    it('should return true when env=true', () => {
      process.env.AGENTKITS_AI_ENRICHMENT = 'true';
      expect(isAIEnrichmentEnabled()).toBe(true);
    });

    it('should return true when env=1', () => {
      process.env.AGENTKITS_AI_ENRICHMENT = '1';
      expect(isAIEnrichmentEnabled()).toBe(true);
    });

    it('should return true when env not set (auto-detect optimistic)', () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      expect(isAIEnrichmentEnabled()).toBe(true);
    });
  });

  describe('isAIEnrichmentAvailable', () => {
    it('should return false when env disabled', async () => {
      process.env.AGENTKITS_AI_ENRICHMENT = 'false';
      const available = await isAIEnrichmentAvailable();
      expect(available).toBe(false);
    });

    it('should return boolean when auto-detecting', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      const available = await isAIEnrichmentAvailable();
      expect(typeof available).toBe('boolean');
    });

    it('should return true when CLI available mock is set', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      _setCliAvailableForTesting(true);
      const available = await isAIEnrichmentAvailable();
      expect(available).toBe(true);
    });
  });

  describe('resetAIEnrichmentCache', () => {
    it('should reset cached state', async () => {
      // First call with env=false should return null
      process.env.AGENTKITS_AI_ENRICHMENT = 'false';
      const disabledResult = await enrichWithAI('Read', '{}', '{}');
      expect(disabledResult).toBeNull();

      // Reset cache
      resetAIEnrichmentCache();

      // Now with auto-detect, result depends on CLI availability
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      const result = await enrichWithAI('Read', '{}', '{}');
      // If CLI is available, returns enriched data; otherwise null
      if (result !== null) {
        expect(typeof result.subtitle).toBe('string');
      }
    });
  });

  describe('buildExtractionPrompt', () => {
    it('should include tool name, input, and response', () => {
      const prompt = buildExtractionPrompt('Read', '{"file_path":"src/index.ts"}', 'file content here');
      expect(prompt).toContain('Tool: Read');
      expect(prompt).toContain('Input: {"file_path":"src/index.ts"}');
      expect(prompt).toContain('Response: file content here');
    });

    it('should truncate long input to 2000 chars', () => {
      const longInput = 'x'.repeat(5000);
      const prompt = buildExtractionPrompt('Read', longInput, 'short');
      expect(prompt).toContain('Input: ' + 'x'.repeat(2000));
      expect(prompt).not.toContain('x'.repeat(2001));
    });

    it('should truncate long response to 2000 chars', () => {
      const longResponse = 'y'.repeat(5000);
      const prompt = buildExtractionPrompt('Read', 'short', longResponse);
      expect(prompt).toContain('Response: ' + 'y'.repeat(2000));
      expect(prompt).not.toContain('y'.repeat(2001));
    });

    it('should include JSON structure instructions', () => {
      const prompt = buildExtractionPrompt('Bash', 'ls', 'output');
      expect(prompt).toContain('"subtitle"');
      expect(prompt).toContain('"narrative"');
      expect(prompt).toContain('"facts"');
      expect(prompt).toContain('"concepts"');
    });
  });

  describe('parseAIResponse', () => {
    it('should parse valid JSON', () => {
      const json = JSON.stringify({
        subtitle: 'Test subtitle',
        narrative: 'Test narrative sentence.',
        facts: ['Fact 1', 'Fact 2'],
        concepts: ['concept1', 'concept2'],
      });
      const result = parseAIResponse(json);
      expect(result).not.toBeNull();
      expect(result!.subtitle).toBe('Test subtitle');
      expect(result!.narrative).toBe('Test narrative sentence.');
      expect(result!.facts).toEqual(['Fact 1', 'Fact 2']);
      expect(result!.concepts).toEqual(['concept1', 'concept2']);
    });

    it('should strip ```json code fences', () => {
      const json = '```json\n{"subtitle":"Test","narrative":"Test.","facts":["f"],"concepts":["c"]}\n```';
      const result = parseAIResponse(json);
      expect(result).not.toBeNull();
      expect(result!.subtitle).toBe('Test');
    });

    it('should strip ``` code fences without json tag', () => {
      const json = '```\n{"subtitle":"Test","narrative":"Test.","facts":["f"],"concepts":["c"]}\n```';
      const result = parseAIResponse(json);
      expect(result).not.toBeNull();
      expect(result!.subtitle).toBe('Test');
    });

    it('should handle whitespace around JSON', () => {
      const json = '  \n  {"subtitle":"Test","narrative":"Test.","facts":[],"concepts":[]}  \n  ';
      const result = parseAIResponse(json);
      expect(result).not.toBeNull();
      expect(result!.subtitle).toBe('Test');
    });

    it('should return null for invalid JSON', () => {
      const result = parseAIResponse('not json at all');
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = parseAIResponse('');
      expect(result).toBeNull();
    });

    it('should return null when subtitle is not a string', () => {
      const json = JSON.stringify({
        subtitle: 123,
        narrative: 'Test.',
        facts: [],
        concepts: [],
      });
      const result = parseAIResponse(json);
      expect(result).toBeNull();
    });

    it('should return null when narrative is not a string', () => {
      const json = JSON.stringify({
        subtitle: 'Test',
        narrative: null,
        facts: [],
        concepts: [],
      });
      const result = parseAIResponse(json);
      expect(result).toBeNull();
    });

    it('should return null when facts is not an array', () => {
      const json = JSON.stringify({
        subtitle: 'Test',
        narrative: 'Test.',
        facts: 'not array',
        concepts: [],
      });
      const result = parseAIResponse(json);
      expect(result).toBeNull();
    });

    it('should return null when concepts is not an array', () => {
      const json = JSON.stringify({
        subtitle: 'Test',
        narrative: 'Test.',
        facts: [],
        concepts: 'not array',
      });
      const result = parseAIResponse(json);
      expect(result).toBeNull();
    });

    it('should truncate subtitle to 200 chars', () => {
      const json = JSON.stringify({
        subtitle: 'A'.repeat(300),
        narrative: 'Test.',
        facts: [],
        concepts: [],
      });
      const result = parseAIResponse(json);
      expect(result).not.toBeNull();
      expect(result!.subtitle.length).toBe(200);
    });

    it('should truncate narrative to 500 chars', () => {
      const json = JSON.stringify({
        subtitle: 'Test',
        narrative: 'B'.repeat(600),
        facts: [],
        concepts: [],
      });
      const result = parseAIResponse(json);
      expect(result).not.toBeNull();
      expect(result!.narrative.length).toBe(500);
    });

    it('should limit facts to 5 items', () => {
      const json = JSON.stringify({
        subtitle: 'Test',
        narrative: 'Test.',
        facts: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7'],
        concepts: [],
      });
      const result = parseAIResponse(json);
      expect(result).not.toBeNull();
      expect(result!.facts.length).toBe(5);
    });

    it('should limit concepts to 5 items', () => {
      const json = JSON.stringify({
        subtitle: 'Test',
        narrative: 'Test.',
        facts: [],
        concepts: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'],
      });
      const result = parseAIResponse(json);
      expect(result).not.toBeNull();
      expect(result!.concepts.length).toBe(5);
    });

    it('should truncate individual fact strings to 200 chars', () => {
      const json = JSON.stringify({
        subtitle: 'Test',
        narrative: 'Test.',
        facts: ['C'.repeat(300)],
        concepts: [],
      });
      const result = parseAIResponse(json);
      expect(result).not.toBeNull();
      expect(result!.facts[0].length).toBe(200);
    });

    it('should truncate individual concept strings to 50 chars', () => {
      const json = JSON.stringify({
        subtitle: 'Test',
        narrative: 'Test.',
        facts: [],
        concepts: ['D'.repeat(100)],
      });
      const result = parseAIResponse(json);
      expect(result).not.toBeNull();
      expect(result!.concepts[0].length).toBe(50);
    });

    it('should convert non-string fact values to strings', () => {
      const json = JSON.stringify({
        subtitle: 'Test',
        narrative: 'Test.',
        facts: [42, true, null],
        concepts: [],
      });
      const result = parseAIResponse(json);
      expect(result).not.toBeNull();
      expect(result!.facts).toEqual(['42', 'true', 'null']);
    });

    it('should convert non-string concept values to strings', () => {
      const json = JSON.stringify({
        subtitle: 'Test',
        narrative: 'Test.',
        facts: [],
        concepts: [42, false],
      });
      const result = parseAIResponse(json);
      expect(result).not.toBeNull();
      expect(result!.concepts).toEqual(['42', 'false']);
    });
  });

  describe('enrichWithAI with mock CLI', () => {
    afterEach(() => {
      _setRunClaudePrintMockForTesting(null);
    });

    it('should return enriched observation on success', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      const validResponse = JSON.stringify({
        subtitle: 'Examining auth module',
        narrative: 'Read the auth module to understand login flow.',
        facts: ['File has 200 lines', 'Uses JWT tokens'],
        concepts: ['authentication', 'jwt', 'typescript'],
      });
      _setRunClaudePrintMockForTesting(() => validResponse);

      const result = await enrichWithAI('Read', '{"file_path":"auth.ts"}', 'export class Auth {}');
      expect(result).not.toBeNull();
      expect(result!.subtitle).toBe('Examining auth module');
      expect(result!.facts).toHaveLength(2);
      expect(result!.concepts).toContain('jwt');
    });

    it('should return null when CLI returns empty result', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      _setRunClaudePrintMockForTesting(() => null);

      const result = await enrichWithAI('Read', '{}', '{}');
      expect(result).toBeNull();
    });

    it('should return null when CLI returns invalid JSON', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      _setRunClaudePrintMockForTesting(() => 'not valid json');

      const result = await enrichWithAI('Read', '{}', '{}');
      expect(result).toBeNull();
    });

    it('should return null when CLI returns incomplete structure', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      _setRunClaudePrintMockForTesting(() => '{"subtitle":"test"}');

      const result = await enrichWithAI('Read', '{}', '{}');
      expect(result).toBeNull();
    });

    it('should return null when mock returns empty string', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      _setRunClaudePrintMockForTesting(() => '');

      const result = await enrichWithAI('Read', '{}', '{}');
      expect(result).toBeNull();
    });

    it('should return null when mock throws', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      _setRunClaudePrintMockForTesting(() => { throw new Error('CLI error'); });

      const result = await enrichWithAI('Read', '{}', '{}');
      expect(result).toBeNull();
    });

    it('should work with AGENTKITS_AI_ENRICHMENT=true and mock', async () => {
      process.env.AGENTKITS_AI_ENRICHMENT = 'true';
      const validResponse = JSON.stringify({
        subtitle: 'Running tests',
        narrative: 'Executed test suite.',
        facts: ['5 tests passed'],
        concepts: ['testing'],
      });
      _setRunClaudePrintMockForTesting(() => validResponse);

      const result = await enrichWithAI('Bash', 'npm test', '5 passed');
      expect(result).not.toBeNull();
      expect(result!.subtitle).toBe('Running tests');
    });

    it('should still return null when env=false even with mock set', async () => {
      process.env.AGENTKITS_AI_ENRICHMENT = 'false';
      _setRunClaudePrintMockForTesting(() => '{"subtitle":"Test","narrative":"Test.","facts":[],"concepts":[]}');

      const result = await enrichWithAI('Read', '{}', '{}');
      expect(result).toBeNull();
    });

    it('should parse markdown-fenced response from mock CLI', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      const fencedResponse =
        '```json\n{"subtitle":"Fenced","narrative":"Fenced response.","facts":["f1"],"concepts":["c1"]}\n```';
      _setRunClaudePrintMockForTesting(() => fencedResponse);

      const result = await enrichWithAI('Read', '{}', '{}');
      expect(result).not.toBeNull();
      expect(result!.subtitle).toBe('Fenced');
    });

    it('should pass prompt to mock', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      let capturedPrompt = '';
      _setRunClaudePrintMockForTesting((prompt) => {
        capturedPrompt = prompt;
        return JSON.stringify({
          subtitle: 'Test',
          narrative: 'Test.',
          facts: [],
          concepts: [],
        });
      });

      await enrichWithAI('Read', '{"file_path":"test.ts"}', 'content');
      expect(capturedPrompt).toContain('Tool: Read');
      expect(capturedPrompt).toContain('test.ts');
    });
  });

  describe('parseSummaryResponse', () => {
    it('should parse valid summary JSON', () => {
      const json = JSON.stringify({
        completed: 'Fixed a bug in the parser.',
        nextSteps: 'Run integration tests.',
      });
      const result = parseSummaryResponse(json);
      expect(result).not.toBeNull();
      expect(result!.completed).toBe('Fixed a bug in the parser.');
      expect(result!.nextSteps).toBe('Run integration tests.');
    });

    it('should accept nextSteps as array', () => {
      const json = JSON.stringify({
        completed: 'Fixed a bug.',
        nextSteps: ['Run tests', 'Deploy to staging'],
      });
      const result = parseSummaryResponse(json);
      expect(result).not.toBeNull();
      expect(result!.nextSteps).toBe('Run tests; Deploy to staging');
    });

    it('should default nextSteps to None when missing', () => {
      const json = JSON.stringify({
        completed: 'All done.',
      });
      const result = parseSummaryResponse(json);
      expect(result).not.toBeNull();
      expect(result!.nextSteps).toBe('None');
    });

    it('should return null when completed is not a string', () => {
      const json = JSON.stringify({
        completed: 123,
        nextSteps: 'Test',
      });
      const result = parseSummaryResponse(json);
      expect(result).toBeNull();
    });

    it('should truncate completed to 1000 chars', () => {
      const json = JSON.stringify({
        completed: 'A'.repeat(1500),
        nextSteps: 'Test',
      });
      const result = parseSummaryResponse(json);
      expect(result).not.toBeNull();
      expect(result!.completed.length).toBe(1000);
    });

    it('should truncate nextSteps to 500 chars', () => {
      const json = JSON.stringify({
        completed: 'Done.',
        nextSteps: 'B'.repeat(600),
      });
      const result = parseSummaryResponse(json);
      expect(result).not.toBeNull();
      expect(result!.nextSteps.length).toBe(500);
    });

    it('should strip markdown fences', () => {
      const json = '```json\n{"completed":"Done.","nextSteps":"None"}\n```';
      const result = parseSummaryResponse(json);
      expect(result).not.toBeNull();
      expect(result!.completed).toBe('Done.');
    });

    it('should strip plain ``` markdown fences (without json suffix)', () => {
      const json = '```\n{"completed":"Done.","nextSteps":"None"}\n```';
      const result = parseSummaryResponse(json);
      expect(result).not.toBeNull();
      expect(result!.completed).toBe('Done.');
    });

    it('should return null for invalid JSON', () => {
      expect(parseSummaryResponse('not json')).toBeNull();
    });
  });

  describe('buildSummaryPrompt', () => {
    it('should include template summary and assistant message', () => {
      const prompt = buildSummaryPrompt('Request: Fix bug', 'I fixed the bug.');
      expect(prompt).toContain('Template Summary');
      expect(prompt).toContain('Request: Fix bug');
      expect(prompt).toContain('Last Assistant Message');
      expect(prompt).toContain('I fixed the bug.');
    });

    it('should truncate long inputs', () => {
      const longTemplate = 'T'.repeat(5000);
      const longMessage = 'M'.repeat(5000);
      const prompt = buildSummaryPrompt(longTemplate, longMessage);
      // Should contain truncated versions (3000 chars each)
      expect(prompt.length).toBeLessThan(10000);
    });
  });

  describe('enrichSummaryWithAI with mock CLI', () => {
    afterEach(() => {
      _setRunClaudePrintMockForTesting(null);
    });

    it('should return enriched summary on success', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      const validResponse = JSON.stringify({
        completed: 'Fixed the parser bug and verified with tests.',
        nextSteps: 'None',
      });
      _setRunClaudePrintMockForTesting(() => validResponse);

      const result = await enrichSummaryWithAI('Request: Fix bug', 'I fixed the parser.');
      expect(result).not.toBeNull();
      expect(result!.completed).toBe('Fixed the parser bug and verified with tests.');
      expect(result!.nextSteps).toBe('None');
    });

    it('should return null when CLI unavailable', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      _setCliAvailableForTesting(false);

      const result = await enrichSummaryWithAI('Request: Fix bug', 'I fixed it.');
      expect(result).toBeNull();
    });

    it('should return null when CLI returns invalid response', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      _setRunClaudePrintMockForTesting(() => 'not json');

      const result = await enrichSummaryWithAI('Request: Fix bug', 'I fixed it.');
      expect(result).toBeNull();
    });

    it('should return null when runClaudePrint throws (catch block)', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      _setRunClaudePrintMockForTesting(() => { throw new Error('Unexpected CLI error'); });

      const result = await enrichSummaryWithAI('Request: Fix bug', 'I fixed it.');
      expect(result).toBeNull();
    });

    it('should return null when runClaudePrint returns null', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      _setRunClaudePrintMockForTesting(() => null as unknown as string);

      const result = await enrichSummaryWithAI('Request: Fix bug', 'I fixed it.');
      expect(result).toBeNull();
    });
  });

  describe('buildCompressionPrompt', () => {
    it('should include tool name and input/response', () => {
      const prompt = buildCompressionPrompt('Read', '{"file_path":"test.ts"}', 'file content');
      expect(prompt).toContain('Tool: Read');
      expect(prompt).toContain('Input: {"file_path":"test.ts"}');
      expect(prompt).toContain('Response: file content');
      expect(prompt).toContain('compressed_summary');
    });

    it('should include context hints when provided', () => {
      const prompt = buildCompressionPrompt('Read', '{}', '{}', 'Examining config', 'Read config file.');
      expect(prompt).toContain('Context: Examining config | Read config file.');
    });

    it('should omit context line when no hints', () => {
      const prompt = buildCompressionPrompt('Read', '{}', '{}');
      expect(prompt).not.toContain('Context:');
    });

    it('should truncate long input to 1000 chars', () => {
      const longInput = 'x'.repeat(3000);
      const prompt = buildCompressionPrompt('Read', longInput, 'short');
      expect(prompt).toContain('x'.repeat(1000));
      expect(prompt).not.toContain('x'.repeat(1001));
    });

    it('should truncate long response to 1000 chars', () => {
      const longResponse = 'y'.repeat(3000);
      const prompt = buildCompressionPrompt('Read', 'short', longResponse);
      expect(prompt).toContain('y'.repeat(1000));
      expect(prompt).not.toContain('y'.repeat(1001));
    });
  });

  describe('parseCompressionResponse', () => {
    it('should parse valid compression JSON', () => {
      const json = JSON.stringify({ compressed_summary: 'Read auth.ts to check login flow' });
      const result = parseCompressionResponse(json);
      expect(result).not.toBeNull();
      expect(result!.compressed_summary).toBe('Read auth.ts to check login flow');
    });

    it('should strip markdown fences', () => {
      const json = '```json\n{"compressed_summary":"Test summary"}\n```';
      const result = parseCompressionResponse(json);
      expect(result).not.toBeNull();
      expect(result!.compressed_summary).toBe('Test summary');
    });

    it('should strip plain ``` fences', () => {
      const json = '```\n{"compressed_summary":"Test summary"}\n```';
      const result = parseCompressionResponse(json);
      expect(result).not.toBeNull();
      expect(result!.compressed_summary).toBe('Test summary');
    });

    it('should return null for invalid JSON', () => {
      expect(parseCompressionResponse('not json')).toBeNull();
    });

    it('should return null when compressed_summary is missing', () => {
      const json = JSON.stringify({ other: 'field' });
      expect(parseCompressionResponse(json)).toBeNull();
    });

    it('should return null when compressed_summary is empty', () => {
      const json = JSON.stringify({ compressed_summary: '' });
      expect(parseCompressionResponse(json)).toBeNull();
    });

    it('should return null when compressed_summary is not a string', () => {
      const json = JSON.stringify({ compressed_summary: 123 });
      expect(parseCompressionResponse(json)).toBeNull();
    });

    it('should truncate to 200 chars', () => {
      const json = JSON.stringify({ compressed_summary: 'A'.repeat(300) });
      const result = parseCompressionResponse(json);
      expect(result).not.toBeNull();
      expect(result!.compressed_summary.length).toBe(200);
    });
  });

  describe('compressObservationWithAI with mock CLI', () => {
    afterEach(() => {
      _setRunClaudePrintMockForTesting(null);
    });

    it('should return compressed observation on success', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      _setRunClaudePrintMockForTesting(() =>
        JSON.stringify({ compressed_summary: 'Read auth module for login flow' })
      );

      const result = await compressObservationWithAI('Read', '{"file_path":"auth.ts"}', 'export class Auth {}', 'Examining auth', 'Read auth module.');
      expect(result).not.toBeNull();
      expect(result!.compressed_summary).toBe('Read auth module for login flow');
    });

    it('should return null when CLI unavailable', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      _setCliAvailableForTesting(false);

      const result = await compressObservationWithAI('Read', '{}', '{}');
      expect(result).toBeNull();
    });

    it('should return null when CLI returns invalid response', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      _setRunClaudePrintMockForTesting(() => 'not json');

      const result = await compressObservationWithAI('Read', '{}', '{}');
      expect(result).toBeNull();
    });

    it('should return null when CLI throws', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      _setRunClaudePrintMockForTesting(() => { throw new Error('Error'); });

      const result = await compressObservationWithAI('Read', '{}', '{}');
      expect(result).toBeNull();
    });

    it('should return null when env=false', async () => {
      process.env.AGENTKITS_AI_ENRICHMENT = 'false';
      _setRunClaudePrintMockForTesting(() =>
        JSON.stringify({ compressed_summary: 'Should not reach here' })
      );

      const result = await compressObservationWithAI('Read', '{}', '{}');
      expect(result).toBeNull();
    });
  });

  describe('buildSessionDigestPrompt', () => {
    it('should include request, observations, and completion', () => {
      const prompt = buildSessionDigestPrompt(
        'Fix auth bug',
        ['Read auth.ts', 'Edited login handler', 'Ran tests'],
        'Fixed authentication',
        ['src/auth.ts']
      );
      expect(prompt).toContain('Request: Fix auth bug');
      expect(prompt).toContain('Read auth.ts');
      expect(prompt).toContain('Edited login handler');
      expect(prompt).toContain('Completed: Fixed authentication');
      expect(prompt).toContain('Files modified: src/auth.ts');
      expect(prompt).toContain('"digest"');
    });

    it('should omit files line when no files modified', () => {
      const prompt = buildSessionDigestPrompt('Test', ['obs1'], 'Done', []);
      expect(prompt).not.toContain('Files modified:');
    });

    it('should limit observation summaries to 30', () => {
      const obs = Array.from({ length: 50 }, (_, i) => `Obs ${i}`);
      const prompt = buildSessionDigestPrompt('Test', obs, 'Done', []);
      // Should contain obs 0-29 but not 30+
      expect(prompt).toContain('Obs 29');
      expect(prompt).not.toContain('Obs 30');
    });
  });

  describe('parseSessionDigestResponse', () => {
    it('should parse valid digest JSON', () => {
      const json = JSON.stringify({ digest: 'Session fixed auth bug in 3 files.' });
      const result = parseSessionDigestResponse(json);
      expect(result).not.toBeNull();
      expect(result!.digest).toBe('Session fixed auth bug in 3 files.');
    });

    it('should strip markdown fences', () => {
      const json = '```json\n{"digest":"Test digest"}\n```';
      const result = parseSessionDigestResponse(json);
      expect(result).not.toBeNull();
      expect(result!.digest).toBe('Test digest');
    });

    it('should return null for invalid JSON', () => {
      expect(parseSessionDigestResponse('not json')).toBeNull();
    });

    it('should return null when digest is missing', () => {
      expect(parseSessionDigestResponse(JSON.stringify({ other: 'x' }))).toBeNull();
    });

    it('should return null when digest is empty', () => {
      expect(parseSessionDigestResponse(JSON.stringify({ digest: '' }))).toBeNull();
    });

    it('should return null when digest is not a string', () => {
      expect(parseSessionDigestResponse(JSON.stringify({ digest: 42 }))).toBeNull();
    });

    it('should truncate to 600 chars', () => {
      const json = JSON.stringify({ digest: 'D'.repeat(800) });
      const result = parseSessionDigestResponse(json);
      expect(result).not.toBeNull();
      expect(result!.digest.length).toBe(600);
    });
  });

  describe('generateSessionDigestWithAI with mock CLI', () => {
    afterEach(() => {
      _setRunClaudePrintMockForTesting(null);
    });

    it('should return digest on success', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      _setRunClaudePrintMockForTesting(() =>
        JSON.stringify({ digest: 'Fixed auth bug by patching JWT validation.' })
      );

      const result = await generateSessionDigestWithAI(
        'Fix auth', ['Read auth.ts', 'Edit auth.ts'], 'Fixed JWT', ['auth.ts']
      );
      expect(result).not.toBeNull();
      expect(result!.digest).toBe('Fixed auth bug by patching JWT validation.');
    });

    it('should return null when CLI unavailable', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      _setCliAvailableForTesting(false);

      const result = await generateSessionDigestWithAI('Test', [], 'Done', []);
      expect(result).toBeNull();
    });

    it('should return null when CLI returns null', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      _setRunClaudePrintMockForTesting(() => null as unknown as string);

      const result = await generateSessionDigestWithAI('Test', [], 'Done', []);
      expect(result).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should not throw on enrichment failure', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      // Should gracefully handle any input without throwing
      const result = await enrichWithAI('InvalidTool', 'not json', 'not json');
      // May return enriched data if CLI is available, or null if not
      if (result !== null) {
        expect(typeof result.subtitle).toBe('string');
        expect(typeof result.narrative).toBe('string');
      }
    });

    it('should respect timeout (returns null on slow response)', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      const start = Date.now();
      const result = await enrichWithAI('Read', '{}', '{}', 100);
      const elapsed = Date.now() - start;
      expect(result).toBeNull();
      expect(elapsed).toBeLessThan(5000);
    });
  });
});
