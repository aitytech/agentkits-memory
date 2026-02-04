/**
 * AI Provider Abstraction
 *
 * Pluggable providers for AI enrichment/compression operations.
 * Supports Claude CLI (default), OpenAI-compatible APIs, and Google Gemini.
 *
 * @module @agentkits/memory/hooks/ai-provider
 */

import { execFileSync } from 'node:child_process';

// ===== Types =====

/**
 * AI provider configuration.
 * Stored in `.claude/memory/settings.json` under the `aiProvider` key.
 */
export interface AIProviderConfig {
  /** Provider type */
  provider: 'claude-cli' | 'openai' | 'gemini';
  /** API key (for HTTP providers; omit for claude-cli) */
  apiKey?: string;
  /** Base URL for OpenAI-compatible API (default: https://api.openai.com/v1) */
  baseUrl?: string;
  /** Model name (default varies by provider) */
  model?: string;
}

/** Default provider configuration */
export const DEFAULT_AI_PROVIDER_CONFIG: AIProviderConfig = {
  provider: 'claude-cli',
};

/**
 * Provider function contract — takes prompt + system prompt + timeout,
 * returns raw text response or null on failure.
 */
export type AIProviderFn = (
  prompt: string,
  systemPrompt: string,
  timeoutMs: number
) => Promise<string | null>;

/** Synchronous availability check (best-effort). */
export type AIProviderAvailableCheck = () => boolean;

/** Resolved provider with run function and availability check. */
export interface ResolvedProvider {
  run: AIProviderFn;
  isAvailable: AIProviderAvailableCheck;
  name: string;
}

// ===== Provider: Claude CLI =====

/**
 * Create a provider that uses `claude --print` CLI.
 * Wraps the existing execFileSync-based approach.
 */
export function createClaudeCliProvider(model: string): ResolvedProvider {
  let cliAvailable: boolean | null = null;

  const isAvailable: AIProviderAvailableCheck = () => {
    if (cliAvailable !== null) return cliAvailable;
    try {
      execFileSync('claude', ['--version'], {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      cliAvailable = true;
    } catch {
      cliAvailable = false;
    }
    return cliAvailable;
  };

  const run: AIProviderFn = async (prompt, systemPrompt, timeoutMs) => {
    try {
      const result = execFileSync('claude', [
        '--print',
        '--model', model,
        '--system-prompt', systemPrompt,
        '--max-turns', '1',
        '--no-input',
        '-p', prompt,
      ], {
        encoding: 'utf-8',
        timeout: timeoutMs,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      return result.trim() || null;
    } catch {
      return null;
    }
  };

  return { run, isAvailable, name: 'claude-cli' };
}

// ===== Provider: OpenAI-Compatible =====

/**
 * Create a provider that calls any OpenAI-compatible chat completions API.
 * Covers: OpenRouter, GLM/ZhipuAI, Ollama, LM Studio, vLLM, Together.ai, etc.
 */
export function createOpenAIProvider(
  apiKey: string,
  baseUrl: string,
  model: string
): ResolvedProvider {
  const isAvailable: AIProviderAvailableCheck = () => !!apiKey;

  const run: AIProviderFn = async (prompt, systemPrompt, timeoutMs) => {
    try {
      const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 1024,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) return null;

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch {
      return null;
    }
  };

  return { run, isAvailable, name: 'openai' };
}

// ===== Provider: Google Gemini =====

/**
 * Create a provider that calls Google's Gemini API.
 * Uses the generateContent endpoint with system_instruction support.
 */
export function createGeminiProvider(
  apiKey: string,
  model: string
): ResolvedProvider {
  const isAvailable: AIProviderAvailableCheck = () => !!apiKey;

  const run: AIProviderFn = async (prompt, systemPrompt, timeoutMs) => {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024,
          },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) return null;

      const data = await response.json() as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch {
      return null;
    }
  };

  return { run, isAvailable, name: 'gemini' };
}

// ===== Provider Resolver =====

/**
 * Resolve which AI provider to use.
 *
 * Resolution order:
 * 1. Environment variables (AGENTKITS_AI_PROVIDER, etc.) — override everything
 * 2. Settings config (from settings.json) — persistent user preference
 * 3. Default: claude-cli
 */
export function resolveAIProvider(settingsConfig?: AIProviderConfig): ResolvedProvider {
  // Env vars override settings
  const envProvider = process.env.AGENTKITS_AI_PROVIDER;
  const envApiKey = process.env.AGENTKITS_AI_API_KEY;
  const envBaseUrl = process.env.AGENTKITS_AI_BASE_URL;
  const envModel = process.env.AGENTKITS_AI_MODEL;

  // Merge: env > settings > defaults
  const provider = envProvider || settingsConfig?.provider || 'claude-cli';
  const apiKey = envApiKey || settingsConfig?.apiKey || '';
  const baseUrl = envBaseUrl || settingsConfig?.baseUrl || 'https://api.openai.com/v1';

  switch (provider) {
    case 'openai':
      return createOpenAIProvider(
        apiKey,
        baseUrl,
        envModel || settingsConfig?.model || 'gpt-4o-mini'
      );

    case 'gemini':
      return createGeminiProvider(
        apiKey,
        envModel || settingsConfig?.model || 'gemini-2.0-flash'
      );

    case 'claude-cli':
    default:
      return createClaudeCliProvider(
        envModel || settingsConfig?.model || 'haiku'
      );
  }
}
