/**
 * AI Enrichment for Observations and Session Summaries
 *
 * Uses pluggable AI providers (Claude CLI, OpenAI-compatible, Gemini) to
 * generate richer subtitle, narrative, facts, and concepts from tool
 * observations, and to enhance session summaries using transcript data.
 * Falls back to template-based extraction when the provider is not available.
 *
 * @module @agentkits/memory/hooks/ai-enrichment
 */

import { resolveAIProvider, type AIProviderConfig, type ResolvedProvider } from './ai-provider.js';

/**
 * Enriched observation data from AI extraction
 */
export interface EnrichedObservation {
  subtitle: string;
  narrative: string;
  facts: string[];
  concepts: string[];
  /** Confidence score 0.0-1.0 indicating extraction quality */
  confidence: number;
}

/**
 * Environment variable to enable/disable AI enrichment.
 * Set AGENTKITS_AI_ENRICHMENT=true to enable, false to disable.
 * When not set, defaults to auto-detect (uses AI if provider available).
 */
const AI_ENRICHMENT_ENV_KEY = 'AGENTKITS_AI_ENRICHMENT';

/** Resolved provider (cached at module level, lazy-initialized) */
let _resolvedProvider: ResolvedProvider | null = null;

/** Provider config from settings.json (set by service.ts) */
let _providerConfig: AIProviderConfig | undefined;

/** Mock function for testing (replaces provider.run when set) */
let _mockRunClaudePrint: ((prompt: string, systemPrompt: string, timeoutMs: number) => string | null) | null = null;

/**
 * Set AI provider config from settings.json.
 * Called by service.ts after loading settings. Forces re-resolution on next use.
 */
export function setAIProviderConfig(config?: AIProviderConfig): void {
  _providerConfig = config;
  _resolvedProvider = null; // force re-resolution
}

/**
 * Get the resolved AI provider (lazy-initialized, cached).
 */
function getProvider(): ResolvedProvider {
  if (!_resolvedProvider) {
    _resolvedProvider = resolveAIProvider(_providerConfig);
  }
  return _resolvedProvider;
}

/**
 * Check if AI enrichment is enabled via environment variable
 * - 'true' / '1' → force enable
 * - 'false' / '0' → force disable
 * - not set → auto-detect (try provider, fallback to template)
 */
function isEnvEnabled(): boolean | null {
  const value = process.env[AI_ENRICHMENT_ENV_KEY];
  if (!value) return null; // auto-detect
  return value === 'true' || value === '1';
}

/**
 * Check if the current AI provider is available.
 * Respects AGENTKITS_AI_ENRICHMENT env var override.
 */
function isProviderAvailable(): boolean {
  const envEnabled = isEnvEnabled();
  if (envEnabled === false) return false;

  // When mock is set, provider is "available"
  if (_mockRunClaudePrint) return true;

  return getProvider().isAvailable();
}

/**
 * Run a prompt through the current AI provider.
 * Uses mock if set (testing), otherwise delegates to the resolved provider.
 */
async function runProvider(prompt: string, systemPrompt: string, timeoutMs: number): Promise<string | null> {
  if (_mockRunClaudePrint) {
    return _mockRunClaudePrint(prompt, systemPrompt, timeoutMs);
  }
  return getProvider().run(prompt, systemPrompt, timeoutMs);
}

/**
 * Synchronous check: is AI enrichment potentially enabled?
 * Used by observation hook to decide whether to spawn background process.
 * Does NOT check provider availability (that may be slow). Just checks env var.
 */
export function isAIEnrichmentEnabled(): boolean {
  const envEnabled = isEnvEnabled();
  if (envEnabled === false) return false;
  // If explicitly enabled or auto-detect, optimistically return true.
  // The background process will handle provider availability check.
  return true;
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
  "concepts": ["Array of technical concepts/topics involved", "e.g. 'authentication', 'typescript'", "Include 'intent:<type>' tags for: bugfix, feature, refactor, testing, investigation, documentation, configuration, optimization", "Include 'fn:<name>' for functions changed, 'class:<name>' for classes, 'pattern:<type>' for patterns used", "Max 8 concepts"],
  "confidence": 0.85
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

    // Compute confidence: AI-reported value weighted with heuristic checks
    let confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5;
    // Penalize empty or very short fields
    if (parsed.subtitle.length < 5) confidence *= 0.7;
    if (parsed.narrative.length < 10) confidence *= 0.7;
    if (parsed.facts.length === 0) confidence *= 0.8;
    confidence = Math.round(confidence * 100) / 100;

    return {
      subtitle: parsed.subtitle.substring(0, 200),
      narrative: parsed.narrative.substring(0, 500),
      facts: parsed.facts.slice(0, 5).map((f: unknown) => String(f).substring(0, 200)),
      concepts: parsed.concepts.slice(0, 8).map((c: unknown) => String(c).substring(0, 50)),
      confidence,
    };
  } catch {
    return null;
  }
}

/**
 * Enrich an observation using the configured AI provider.
 *
 * Returns enriched data if provider is available and succeeds,
 * or null to signal fallback to template-based extraction.
 */
export async function enrichWithAI(
  toolName: string,
  toolInput: string,
  toolResponse: string,
  timeoutMs: number = 15000
): Promise<EnrichedObservation | null> {
  if (!isProviderAvailable()) return null;

  try {
    const prompt = buildExtractionPrompt(toolName, toolInput, toolResponse);
    const systemPrompt = 'You are a code observation analyzer. Extract structured insights from tool usage observations. Return only valid JSON.';

    const resultText = await runProvider(prompt, systemPrompt, timeoutMs);
    if (!resultText) return null;
    return parseAIResponse(resultText);
  } catch {
    return null;
  }
}

/**
 * Check if AI enrichment is available (provider configured and reachable)
 */
export async function isAIEnrichmentAvailable(): Promise<boolean> {
  return isProviderAvailable();
}

/**
 * Reset cached provider and mock state (for testing)
 */
export function resetAIEnrichmentCache(): void {
  _resolvedProvider = null;
  _providerConfig = undefined;
  _mockRunClaudePrint = null;
}

/**
 * Override provider availability for testing (inject mock).
 * Sets the mock which makes isProviderAvailable() return true.
 */
export function _setCliAvailableForTesting(available: boolean): void {
  if (available) {
    // Set a pass-through mock that marks provider as available
    if (!_mockRunClaudePrint) {
      _mockRunClaudePrint = () => null;
    }
  } else {
    _mockRunClaudePrint = null;
    // Force provider to be unavailable by clearing cache
    _resolvedProvider = null;
  }
}

/**
 * Inject a mock for the AI provider run function (for testing).
 * The mock receives (prompt, systemPrompt, timeoutMs) and returns string | null.
 * Pass null to clear the mock.
 */
export function _setRunClaudePrintMockForTesting(
  fn: ((prompt: string, systemPrompt: string, timeoutMs: number) => string | null) | null
): void {
  _mockRunClaudePrint = fn;
}

// ===== Session Summary Enrichment =====

/**
 * Enriched session summary data from AI extraction
 */
export interface EnrichedSummary {
  completed: string;
  nextSteps: string;
  decisions: string[];
}

/**
 * Build prompt for enriching a session summary using transcript context
 */
export function buildSummaryPrompt(
  templateSummary: string,
  lastAssistantMessage: string
): string {
  return `Analyze this Claude Code session and produce an enriched summary.

## Template Summary (from observations)
${templateSummary.substring(0, 3000)}

## Last Assistant Message (from transcript)
${lastAssistantMessage.substring(0, 3000)}

Return ONLY a JSON object (no markdown, no code fences) with these fields:
{
  "completed": "Concise paragraph describing what was actually completed (2-4 sentences). Merge info from both the template summary and the assistant's final message.",
  "nextSteps": "Concise list of remaining work or follow-up items, if any. Use 'None' if everything was completed.",
  "decisions": ["Array of key decision rationales — WHY specific changes were made, not just WHAT changed. E.g. 'Used mutex for token refresh to prevent race condition'. Max 5 decisions. Empty array if no clear decisions."]
}`;
}

/**
 * Parse enriched summary from AI response
 */
export function parseSummaryResponse(text: string): EnrichedSummary | null {
  try {
    let cleaned = text.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    const parsed = JSON.parse(cleaned);

    // Handle completed: must be string
    const completed = typeof parsed.completed === 'string' ? parsed.completed : null;
    if (!completed) return null;

    // Handle nextSteps: accept string or array (AI often returns arrays for "list")
    let nextSteps: string;
    if (typeof parsed.nextSteps === 'string') {
      nextSteps = parsed.nextSteps;
    } else if (Array.isArray(parsed.nextSteps)) {
      nextSteps = parsed.nextSteps.map((s: unknown) => String(s)).join('; ');
    } else {
      nextSteps = 'None';
    }

    // Handle decisions: accept array or empty
    let decisions: string[] = [];
    if (Array.isArray(parsed.decisions)) {
      decisions = parsed.decisions
        .filter((d: unknown) => typeof d === 'string' && d.length > 0)
        .slice(0, 5)
        .map((d: unknown) => String(d).substring(0, 200));
    }

    return {
      completed: completed.substring(0, 1000),
      nextSteps: nextSteps.substring(0, 500),
      decisions,
    };
  } catch {
    return null;
  }
}

/**
 * Enrich a session summary using the configured AI provider.
 *
 * Takes template-based summary + last assistant message from transcript,
 * returns AI-enhanced completed/nextSteps fields.
 */
export async function enrichSummaryWithAI(
  templateSummary: string,
  lastAssistantMessage: string,
  timeoutMs: number = 20000
): Promise<EnrichedSummary | null> {
  if (!isProviderAvailable()) return null;

  try {
    const prompt = buildSummaryPrompt(templateSummary, lastAssistantMessage);
    const systemPrompt = 'You are a session summary analyzer. Produce concise, accurate session summaries. Return only valid JSON.';

    const resultText = await runProvider(prompt, systemPrompt, timeoutMs);
    if (!resultText) return null;
    return parseSummaryResponse(resultText);
  } catch {
    return null;
  }
}

// ===== Per-Observation Compression =====

/**
 * Compressed observation data
 */
export interface CompressedObservation {
  compressed_summary: string;
}

/**
 * Build prompt for compressing a single observation into a dense summary.
 * Uses existing subtitle/narrative as hints for faster, more accurate compression.
 */
export function buildCompressionPrompt(
  toolName: string,
  toolInput: string,
  toolResponse: string,
  subtitle?: string,
  narrative?: string
): string {
  const hints = [subtitle, narrative].filter(Boolean).join(' | ');
  return `Compress this tool observation into a single dense summary (50-150 chars).

Tool: ${toolName}
${hints ? `Context: ${hints}\n` : ''}Input: ${toolInput.substring(0, 1000)}
Response: ${toolResponse.substring(0, 1000)}

Return ONLY a JSON object (no markdown, no code fences):
{"compressed_summary": "dense summary here"}`;
}

/**
 * Parse compression response from AI
 */
export function parseCompressionResponse(text: string): CompressedObservation | null {
  try {
    let cleaned = text.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    const parsed = JSON.parse(cleaned);
    if (typeof parsed.compressed_summary !== 'string' || !parsed.compressed_summary) return null;

    return {
      compressed_summary: parsed.compressed_summary.substring(0, 200),
    };
  } catch {
    return null;
  }
}

/**
 * Compress a single observation using the configured AI provider.
 * Returns a dense 50-150 char summary suitable for context injection.
 */
export async function compressObservationWithAI(
  toolName: string,
  toolInput: string,
  toolResponse: string,
  subtitle?: string,
  narrative?: string,
  timeoutMs: number = 10000
): Promise<CompressedObservation | null> {
  if (!isProviderAvailable()) return null;

  try {
    const prompt = buildCompressionPrompt(toolName, toolInput, toolResponse, subtitle, narrative);
    const systemPrompt = 'You are a data compressor. Produce the shortest possible accurate summary. Return only valid JSON.';

    const resultText = await runProvider(prompt, systemPrompt, timeoutMs);
    if (!resultText) return null;
    return parseCompressionResponse(resultText);
  } catch {
    return null;
  }
}

// ===== Session-Level Digest =====

/**
 * Session digest data from AI compression
 */
export interface SessionDigest {
  digest: string;
}

/**
 * Build prompt for generating a compressed session digest.
 * Takes the session's request, observation summaries, and completion info.
 */
export function buildSessionDigestPrompt(
  request: string,
  observationSummaries: string[],
  completed: string,
  filesModified: string[]
): string {
  const obsText = observationSummaries.slice(0, 30).join('\n- ');
  const filesText = filesModified.slice(0, 10).join(', ');
  return `Compress this session into a single dense digest (200-500 chars).

Request: ${request.substring(0, 500)}
Observations:
- ${obsText}
Completed: ${completed.substring(0, 300)}
${filesText ? `Files modified: ${filesText}\n` : ''}
Return ONLY a JSON object (no markdown, no code fences):
{"digest": "dense session digest here"}`;
}

/**
 * Parse session digest response from AI
 */
export function parseSessionDigestResponse(text: string): SessionDigest | null {
  try {
    let cleaned = text.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    const parsed = JSON.parse(cleaned);
    if (typeof parsed.digest !== 'string' || !parsed.digest) return null;

    return {
      digest: parsed.digest.substring(0, 600),
    };
  } catch {
    return null;
  }
}

/**
 * Generate a session-level digest using the configured AI provider.
 * Compresses an entire session into a 200-500 char digest.
 */
export async function generateSessionDigestWithAI(
  request: string,
  observationSummaries: string[],
  completed: string,
  filesModified: string[],
  timeoutMs: number = 15000
): Promise<SessionDigest | null> {
  if (!isProviderAvailable()) return null;

  try {
    const prompt = buildSessionDigestPrompt(request, observationSummaries, completed, filesModified);
    const systemPrompt = 'You are a session compressor. Produce the shortest possible accurate digest of a coding session. Return only valid JSON.';

    const resultText = await runProvider(prompt, systemPrompt, timeoutMs);
    if (!resultText) return null;
    return parseSessionDigestResponse(resultText);
  } catch {
    return null;
  }
}
