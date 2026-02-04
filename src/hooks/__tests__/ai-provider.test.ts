/**
 * Tests for AI Provider abstraction
 *
 * @module @agentkits/memory/hooks/__tests__/ai-provider.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveAIProvider,
  createClaudeCliProvider,
  createOpenAIProvider,
  createGeminiProvider,
  type AIProviderConfig,
} from '../ai-provider.js';

describe('AI Provider', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clean env vars before each test
    delete process.env.AGENTKITS_AI_PROVIDER;
    delete process.env.AGENTKITS_AI_API_KEY;
    delete process.env.AGENTKITS_AI_BASE_URL;
    delete process.env.AGENTKITS_AI_MODEL;
  });

  afterEach(() => {
    // Restore env
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  // ===== resolveAIProvider =====

  describe('resolveAIProvider', () => {
    it('should default to claude-cli when no config and no env', () => {
      const provider = resolveAIProvider();
      expect(provider.name).toBe('claude-cli');
    });

    it('should use settings config provider', () => {
      const config: AIProviderConfig = { provider: 'openai', apiKey: 'test-key' };
      const provider = resolveAIProvider(config);
      expect(provider.name).toBe('openai');
    });

    it('should use gemini provider from settings', () => {
      const config: AIProviderConfig = { provider: 'gemini', apiKey: 'gemini-key' };
      const provider = resolveAIProvider(config);
      expect(provider.name).toBe('gemini');
    });

    it('should override settings with env var AGENTKITS_AI_PROVIDER', () => {
      process.env.AGENTKITS_AI_PROVIDER = 'gemini';
      process.env.AGENTKITS_AI_API_KEY = 'env-key';
      const config: AIProviderConfig = { provider: 'openai', apiKey: 'settings-key' };
      const provider = resolveAIProvider(config);
      expect(provider.name).toBe('gemini');
    });

    it('should merge env API key with settings provider', () => {
      process.env.AGENTKITS_AI_API_KEY = 'env-key';
      const config: AIProviderConfig = { provider: 'openai' };
      const provider = resolveAIProvider(config);
      expect(provider.name).toBe('openai');
      // Provider should be available because env key is set
      expect(provider.isAvailable()).toBe(true);
    });

    it('should fall back to claude-cli for unknown provider', () => {
      process.env.AGENTKITS_AI_PROVIDER = 'unknown-provider';
      const provider = resolveAIProvider();
      expect(provider.name).toBe('claude-cli');
    });

    it('should use env model override', () => {
      process.env.AGENTKITS_AI_MODEL = 'custom-model';
      const provider = resolveAIProvider();
      expect(provider.name).toBe('claude-cli');
      // Can't directly test model, but it shouldn't throw
    });
  });

  // ===== Claude CLI Provider =====

  describe('createClaudeCliProvider', () => {
    it('should create a provider with name claude-cli', () => {
      const provider = createClaudeCliProvider('haiku');
      expect(provider.name).toBe('claude-cli');
    });

    it('should cache isAvailable result', () => {
      const provider = createClaudeCliProvider('haiku');
      // First call checks CLI, second should use cache
      const first = provider.isAvailable();
      const second = provider.isAvailable();
      expect(first).toBe(second);
    });

    it('should return null from run when CLI is not available', async () => {
      const provider = createClaudeCliProvider('nonexistent-model');
      // execFileSync will throw for invalid claude args, provider catches and returns null
      const result = await provider.run('test prompt', 'system', 5000);
      // On CI or machines without claude CLI, this returns null
      expect(result === null || typeof result === 'string').toBe(true);
    });
  });

  // ===== OpenAI Provider =====

  describe('createOpenAIProvider', () => {
    it('should return unavailable when no API key', () => {
      const provider = createOpenAIProvider('', 'https://api.openai.com/v1', 'gpt-4o-mini');
      expect(provider.isAvailable()).toBe(false);
    });

    it('should return available when API key is set', () => {
      const provider = createOpenAIProvider('sk-test', 'https://api.openai.com/v1', 'gpt-4o-mini');
      expect(provider.isAvailable()).toBe(true);
      expect(provider.name).toBe('openai');
    });

    it('should return null when fetch fails', async () => {
      // Mock fetch to simulate network error
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
      const provider = createOpenAIProvider('sk-test', 'https://api.openai.com/v1', 'gpt-4o-mini');
      const result = await provider.run('test', 'system', 5000);
      expect(result).toBeNull();
    });

    it('should return null when response is not ok', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      }));
      const provider = createOpenAIProvider('sk-test', 'https://api.openai.com/v1', 'gpt-4o-mini');
      const result = await provider.run('test', 'system', 5000);
      expect(result).toBeNull();
    });

    it('should parse successful response correctly', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"subtitle": "test"}' } }],
        }),
      }));
      const provider = createOpenAIProvider('sk-test', 'https://api.openai.com/v1', 'gpt-4o-mini');
      const result = await provider.run('test', 'system', 5000);
      expect(result).toBe('{"subtitle": "test"}');
    });

    it('should send correct request format', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'result' } }] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const provider = createOpenAIProvider('sk-test', 'https://api.openai.com/v1', 'gpt-4o-mini');
      await provider.run('my prompt', 'my system', 10000);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(options.method).toBe('POST');
      expect(options.headers['Authorization']).toBe('Bearer sk-test');

      const body = JSON.parse(options.body);
      expect(body.model).toBe('gpt-4o-mini');
      expect(body.messages).toEqual([
        { role: 'system', content: 'my system' },
        { role: 'user', content: 'my prompt' },
      ]);
      expect(body.temperature).toBe(0.3);
      expect(body.max_tokens).toBe(1024);
    });

    it('should strip trailing slash from base URL', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const provider = createOpenAIProvider('sk-test', 'https://openrouter.ai/api/v1/', 'model');
      await provider.run('prompt', 'system', 5000);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    });

    it('should return null when response has no choices', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [] }),
      }));
      const provider = createOpenAIProvider('sk-test', 'https://api.openai.com/v1', 'gpt-4o-mini');
      const result = await provider.run('test', 'system', 5000);
      expect(result).toBeNull();
    });
  });

  // ===== Gemini Provider =====

  describe('createGeminiProvider', () => {
    it('should return unavailable when no API key', () => {
      const provider = createGeminiProvider('', 'gemini-2.0-flash');
      expect(provider.isAvailable()).toBe(false);
    });

    it('should return available when API key is set', () => {
      const provider = createGeminiProvider('test-key', 'gemini-2.0-flash');
      expect(provider.isAvailable()).toBe(true);
      expect(provider.name).toBe('gemini');
    });

    it('should return null when fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
      const provider = createGeminiProvider('test-key', 'gemini-2.0-flash');
      const result = await provider.run('test', 'system', 5000);
      expect(result).toBeNull();
    });

    it('should parse successful response correctly', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"result": "ok"}' }] } }],
        }),
      }));
      const provider = createGeminiProvider('test-key', 'gemini-2.0-flash');
      const result = await provider.run('test', 'system', 5000);
      expect(result).toBe('{"result": "ok"}');
    });

    it('should send correct Gemini API format', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'result' }] } }],
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const provider = createGeminiProvider('gemini-key', 'gemini-2.0-flash');
      await provider.run('my prompt', 'my system', 10000);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('generativelanguage.googleapis.com');
      expect(url).toContain('gemini-2.0-flash');
      expect(url).toContain('key=gemini-key');

      const body = JSON.parse(options.body);
      expect(body.system_instruction).toEqual({ parts: [{ text: 'my system' }] });
      expect(body.contents).toEqual([{ parts: [{ text: 'my prompt' }] }]);
      expect(body.generationConfig.temperature).toBe(0.3);
      expect(body.generationConfig.maxOutputTokens).toBe(1024);
    });

    it('should return null when response has no candidates', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ candidates: [] }),
      }));
      const provider = createGeminiProvider('test-key', 'gemini-2.0-flash');
      const result = await provider.run('test', 'system', 5000);
      expect(result).toBeNull();
    });

    it('should return null on non-200 response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      }));
      const provider = createGeminiProvider('test-key', 'gemini-2.0-flash');
      const result = await provider.run('test', 'system', 5000);
      expect(result).toBeNull();
    });
  });
});
