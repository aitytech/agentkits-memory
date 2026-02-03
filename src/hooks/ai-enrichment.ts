/**
 * AI Enrichment for Observations
 *
 * Uses Claude Agent SDK (when available) to generate richer
 * subtitle, narrative, facts, and concepts from tool observations.
 * Falls back to template-based extraction when SDK is not available.
 *
 * @module @agentkits/memory/hooks/ai-enrichment
 */

/**
 * Enriched observation data from AI extraction
 */
export interface EnrichedObservation {
  subtitle: string;
  narrative: string;
  facts: string[];
  concepts: string[];
}

/**
 * Environment variable to enable/disable AI enrichment.
 * Set AGENTKITS_AI_ENRICHMENT=true to enable, false to disable.
 * When not set, defaults to auto-detect (uses AI if SDK available).
 */
const AI_ENRICHMENT_ENV_KEY = 'AGENTKITS_AI_ENRICHMENT';

/** Cached SDK availability */
let _sdkAvailable: boolean | null = null;
let _queryFn: QueryFunction | null = null;

/** Type for the SDK query function */
export type QueryFunction = (params: {
  prompt: string;
  options: Record<string, unknown>;
}) => AsyncIterable<{
  type: string;
  subtype?: string;
  result?: string;
  total_cost_usd?: number;
  [key: string]: unknown;
}>;

/**
 * Check if AI enrichment is enabled via environment variable
 * - 'true' / '1' → force enable
 * - 'false' / '0' → force disable
 * - not set → auto-detect (try SDK, fallback to template)
 */
function isEnvEnabled(): boolean | null {
  const value = process.env[AI_ENRICHMENT_ENV_KEY];
  if (!value) return null; // auto-detect
  return value === 'true' || value === '1';
}

/**
 * Check if Claude Agent SDK is available and cache the result
 */
async function getQueryFunction(): Promise<QueryFunction | null> {
  // Check env override first
  const envEnabled = isEnvEnabled();
  if (envEnabled === false) return null;

  if (_sdkAvailable === false) return null;
  if (_queryFn) return _queryFn;

  try {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    _queryFn = query as unknown as QueryFunction;
    _sdkAvailable = true;
    return _queryFn;
  } catch {
    _sdkAvailable = false;
    return null;
  }
}

/**
 * Build the extraction prompt for a tool observation
 */
export function buildExtractionPrompt(
  toolName: string,
  toolInput: string,
  toolResponse: string
): string {
  return `Analyze this Claude Code tool observation and extract structured insights.

Tool: ${toolName}
Input: ${toolInput.substring(0, 2000)}
Response: ${toolResponse.substring(0, 2000)}

Return ONLY a JSON object (no markdown, no code fences) with these fields:
{
  "subtitle": "Brief context description (5-10 words, e.g. 'Examining authentication module')",
  "narrative": "One sentence explaining what happened and why (e.g. 'Read the authentication module to understand the login flow before making changes.')",
  "facts": ["Array of factual observations", "e.g. 'File auth.ts contains 150 lines'", "Max 5 facts"],
  "concepts": ["Array of technical concepts/topics involved", "e.g. 'authentication', 'typescript'", "Max 5 concepts"]
}`;
}

/**
 * Parse JSON from AI response, handling common formatting issues
 */
export function parseAIResponse(text: string): EnrichedObservation | null {
  try {
    // Strip markdown code fences if present
    let cleaned = text.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    const parsed = JSON.parse(cleaned);

    // Validate structure
    if (
      typeof parsed.subtitle !== 'string' ||
      typeof parsed.narrative !== 'string' ||
      !Array.isArray(parsed.facts) ||
      !Array.isArray(parsed.concepts)
    ) {
      return null;
    }

    return {
      subtitle: parsed.subtitle.substring(0, 200),
      narrative: parsed.narrative.substring(0, 500),
      facts: parsed.facts.slice(0, 5).map((f: unknown) => String(f).substring(0, 200)),
      concepts: parsed.concepts.slice(0, 5).map((c: unknown) => String(c).substring(0, 50)),
    };
  } catch {
    return null;
  }
}

/**
 * Enrich an observation using Claude Agent SDK
 *
 * Returns enriched data if SDK is available and succeeds,
 * or null to signal fallback to template-based extraction.
 */
export async function enrichWithAI(
  toolName: string,
  toolInput: string,
  toolResponse: string,
  timeoutMs: number = 15000
): Promise<EnrichedObservation | null> {
  const queryFn = await getQueryFunction();
  if (!queryFn) return null;

  try {
    const prompt = buildExtractionPrompt(toolName, toolInput, toolResponse);

    // Race between AI query and timeout
    const result = await Promise.race([
      executeQuery(queryFn, prompt),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);

    return result;
  } catch {
    // AI enrichment failed, caller should use template fallback
    return null;
  }
}

/**
 * Execute the SDK query and extract the result
 */
async function executeQuery(
  queryFn: QueryFunction,
  prompt: string
): Promise<EnrichedObservation | null> {
  let resultText = '';

  const stream = queryFn({
    prompt,
    options: {
      model: 'haiku',
      systemPrompt: 'You are a code observation analyzer. Extract structured insights from tool usage observations. Return only valid JSON.',
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      maxTurns: 1,
      allowedTools: [], // No tools needed, just text output
    },
  });

  for await (const message of stream) {
    if (message.type === 'result' && message.subtype === 'success') {
      resultText = message.result || '';
    }
  }

  if (!resultText) return null;
  return parseAIResponse(resultText);
}

/**
 * Check if AI enrichment is available (SDK installed)
 */
export async function isAIEnrichmentAvailable(): Promise<boolean> {
  const queryFn = await getQueryFunction();
  return queryFn !== null;
}

/**
 * Reset cached SDK availability (for testing)
 */
export function resetAIEnrichmentCache(): void {
  _sdkAvailable = null;
  _queryFn = null;
}

/**
 * Inject a mock query function (for testing only)
 */
export function _setQueryFunctionForTesting(fn: QueryFunction | null): void {
  _queryFn = fn;
  _sdkAvailable = fn !== null;
}
