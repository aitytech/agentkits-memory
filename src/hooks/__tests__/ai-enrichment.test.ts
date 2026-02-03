/**
 * Unit Tests for AI Enrichment Module
 *
 * Tests the enrichment logic, env toggle, fallback behavior,
 * parseAIResponse, buildExtractionPrompt, and mock SDK flow.
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
  _setQueryFunctionForTesting,
  type QueryFunction,
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
    _setQueryFunctionForTesting(null);
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
      // Returns enriched data if SDK available, null otherwise
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
      // Returns enriched data if SDK available, null otherwise
      if (result !== null) {
        expect(typeof result.subtitle).toBe('string');
        expect(typeof result.narrative).toBe('string');
      }
    });

    it('should handle AGENTKITS_AI_ENRICHMENT=1', async () => {
      process.env.AGENTKITS_AI_ENRICHMENT = '1';
      resetAIEnrichmentCache();
      const result = await enrichWithAI('Read', '{}', '{}');
      // Returns enriched data if SDK available, null otherwise
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

    it('should return true when mock query function is set', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      const mockFn = createMockQueryFn('{}');
      _setQueryFunctionForTesting(mockFn);
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

      // Now with auto-detect, result depends on SDK availability
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      const result = await enrichWithAI('Read', '{}', '{}');
      // If SDK is available, returns enriched data; otherwise null
      if (result !== null) {
        expect(typeof result.subtitle).toBe('string');
      }
    });
  });

  describe('_setQueryFunctionForTesting', () => {
    it('should inject a mock query function', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      const validResponse = JSON.stringify({
        subtitle: 'Reading test file',
        narrative: 'Read the test file to understand its contents.',
        facts: ['File has 10 lines'],
        concepts: ['testing'],
      });
      const mockFn = createMockQueryFn(validResponse);
      _setQueryFunctionForTesting(mockFn);

      const result = await enrichWithAI('Read', '{"file_path":"test.ts"}', 'file contents');
      expect(result).not.toBeNull();
      expect(result!.subtitle).toBe('Reading test file');
      expect(result!.narrative).toBe('Read the test file to understand its contents.');
      expect(result!.facts).toEqual(['File has 10 lines']);
      expect(result!.concepts).toEqual(['testing']);
    });

    it('should clear mock when set to null', async () => {
      const mockFn = createMockQueryFn('{}');
      _setQueryFunctionForTesting(mockFn);
      _setQueryFunctionForTesting(null);

      // After clearing, should fall back to SDK detection
      const available = await isAIEnrichmentAvailable();
      // SDK not installed in test env
      expect(typeof available).toBe('boolean');
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

  describe('enrichWithAI with mock SDK', () => {
    it('should return enriched observation on success', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      const validResponse = JSON.stringify({
        subtitle: 'Examining auth module',
        narrative: 'Read the auth module to understand login flow.',
        facts: ['File has 200 lines', 'Uses JWT tokens'],
        concepts: ['authentication', 'jwt', 'typescript'],
      });
      _setQueryFunctionForTesting(createMockQueryFn(validResponse));

      const result = await enrichWithAI('Read', '{"file_path":"auth.ts"}', 'export class Auth {}');
      expect(result).not.toBeNull();
      expect(result!.subtitle).toBe('Examining auth module');
      expect(result!.facts).toHaveLength(2);
      expect(result!.concepts).toContain('jwt');
    });

    it('should return null when SDK returns empty result', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      _setQueryFunctionForTesting(createMockQueryFn(''));

      const result = await enrichWithAI('Read', '{}', '{}');
      expect(result).toBeNull();
    });

    it('should return null when SDK returns invalid JSON', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      _setQueryFunctionForTesting(createMockQueryFn('not valid json'));

      const result = await enrichWithAI('Read', '{}', '{}');
      expect(result).toBeNull();
    });

    it('should return null when SDK returns incomplete structure', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      _setQueryFunctionForTesting(createMockQueryFn('{"subtitle":"test"}'));

      const result = await enrichWithAI('Read', '{}', '{}');
      expect(result).toBeNull();
    });

    it('should handle SDK stream with no result message', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      // Mock that emits messages but none with type=result/subtype=success
      const mockFn: QueryFunction = () => {
        return (async function* () {
          yield { type: 'progress', subtype: 'update' };
          yield { type: 'done', subtype: 'complete' };
        })();
      };
      _setQueryFunctionForTesting(mockFn);

      const result = await enrichWithAI('Read', '{}', '{}');
      expect(result).toBeNull();
    });

    it('should handle SDK stream with result but no text', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      const mockFn: QueryFunction = () => {
        return (async function* () {
          yield { type: 'result', subtype: 'success', result: '' };
        })();
      };
      _setQueryFunctionForTesting(mockFn);

      const result = await enrichWithAI('Read', '{}', '{}');
      expect(result).toBeNull();
    });

    it('should handle SDK stream with result=undefined', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      const mockFn: QueryFunction = () => {
        return (async function* () {
          yield { type: 'result', subtype: 'success' };
        })();
      };
      _setQueryFunctionForTesting(mockFn);

      const result = await enrichWithAI('Read', '{}', '{}');
      expect(result).toBeNull();
    });

    it('should return null when mock query function throws', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      const mockFn: QueryFunction = () => {
        throw new Error('SDK error');
      };
      _setQueryFunctionForTesting(mockFn);

      const result = await enrichWithAI('Read', '{}', '{}');
      expect(result).toBeNull();
    });

    it('should return null when mock query async iterator throws', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      const mockFn: QueryFunction = () => {
        return (async function* () {
          throw new Error('Stream error');
        })();
      };
      _setQueryFunctionForTesting(mockFn);

      const result = await enrichWithAI('Read', '{}', '{}');
      expect(result).toBeNull();
    });

    it('should respect timeout with slow mock', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      const mockFn: QueryFunction = () => {
        return (async function* () {
          // Simulate slow response
          await new Promise((resolve) => setTimeout(resolve, 5000));
          yield {
            type: 'result',
            subtype: 'success',
            result: '{"subtitle":"slow","narrative":"slow.","facts":[],"concepts":[]}',
          };
        })();
      };
      _setQueryFunctionForTesting(mockFn);

      const start = Date.now();
      const result = await enrichWithAI('Read', '{}', '{}', 100);
      const elapsed = Date.now() - start;

      expect(result).toBeNull();
      // Should resolve in ~100ms, not 5000ms
      expect(elapsed).toBeLessThan(1000);
    });

    it('should work with AGENTKITS_AI_ENRICHMENT=true and mock', async () => {
      process.env.AGENTKITS_AI_ENRICHMENT = 'true';
      const validResponse = JSON.stringify({
        subtitle: 'Running tests',
        narrative: 'Executed test suite.',
        facts: ['5 tests passed'],
        concepts: ['testing'],
      });
      _setQueryFunctionForTesting(createMockQueryFn(validResponse));

      const result = await enrichWithAI('Bash', 'npm test', '5 passed');
      expect(result).not.toBeNull();
      expect(result!.subtitle).toBe('Running tests');
    });

    it('should still return null when env=false even with mock set', async () => {
      process.env.AGENTKITS_AI_ENRICHMENT = 'false';
      const validResponse = JSON.stringify({
        subtitle: 'Test',
        narrative: 'Test.',
        facts: [],
        concepts: [],
      });
      _setQueryFunctionForTesting(createMockQueryFn(validResponse));

      const result = await enrichWithAI('Read', '{}', '{}');
      expect(result).toBeNull();
    });

    it('should parse markdown-fenced response from mock SDK', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      const fencedResponse =
        '```json\n{"subtitle":"Fenced","narrative":"Fenced response.","facts":["f1"],"concepts":["c1"]}\n```';
      _setQueryFunctionForTesting(createMockQueryFn(fencedResponse));

      const result = await enrichWithAI('Read', '{}', '{}');
      expect(result).not.toBeNull();
      expect(result!.subtitle).toBe('Fenced');
    });
  });

  describe('error handling', () => {
    it('should not throw on enrichment failure', async () => {
      delete process.env.AGENTKITS_AI_ENRICHMENT;
      // Should gracefully handle any input without throwing
      const result = await enrichWithAI('InvalidTool', 'not json', 'not json');
      // May return enriched data if SDK is available, or null if not
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

/**
 * Helper: Create a mock QueryFunction that yields a single result message
 */
function createMockQueryFn(resultText: string): QueryFunction {
  return () => {
    return (async function* () {
      yield {
        type: 'result',
        subtype: 'success',
        result: resultText,
        total_cost_usd: 0.001,
      };
    })();
  };
}
