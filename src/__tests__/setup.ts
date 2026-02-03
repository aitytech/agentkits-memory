/**
 * Global test setup
 *
 * Disables AI enrichment by default to prevent slow SDK calls
 * during tests. The ai-enrichment.test.ts file manages this
 * env var independently for its own test cases.
 */
process.env.AGENTKITS_AI_ENRICHMENT = 'false';
