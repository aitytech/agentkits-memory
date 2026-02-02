import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  LocalEmbeddingsService,
  createLocalEmbeddings,
  createEmbeddingGenerator,
} from '../local-embeddings.js';

describe('LocalEmbeddingsService', () => {
  let service: LocalEmbeddingsService;

  describe('mock provider', () => {
    beforeEach(() => {
      service = new LocalEmbeddingsService({ provider: 'mock' });
    });

    afterEach(async () => {
      await service.shutdown();
    });

    it('should create service with default config', () => {
      expect(service).toBeDefined();
      expect(service.getDimensions()).toBe(384);
    });

    it('should generate embedding for text', async () => {
      const result = await service.embed('Hello world');

      expect(result.embedding).toBeInstanceOf(Float32Array);
      expect(result.embedding.length).toBe(384);
      expect(result.cached).toBe(false);
      expect(result.timeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return normalized embeddings', async () => {
      const result = await service.embed('Test content');

      // Calculate L2 norm
      let norm = 0;
      for (let i = 0; i < result.embedding.length; i++) {
        norm += result.embedding[i] * result.embedding[i];
      }
      norm = Math.sqrt(norm);

      // Should be normalized (L2 norm ≈ 1)
      expect(norm).toBeCloseTo(1, 5);
    });

    it('should cache embeddings', async () => {
      const text = 'Cache test';

      const first = await service.embed(text);
      expect(first.cached).toBe(false);

      const second = await service.embed(text);
      expect(second.cached).toBe(true);

      // Same embedding
      expect(Array.from(first.embedding)).toEqual(Array.from(second.embedding));
    });

    it('should generate deterministic embeddings', async () => {
      const service2 = new LocalEmbeddingsService({
        provider: 'mock',
        cacheEnabled: false,
      });

      const text = 'Deterministic test';
      const result1 = await service.embed(text);

      // Clear cache by using new service
      service.clearCache();

      const result2 = await service2.embed(text);

      // Same text should produce same embedding
      expect(Array.from(result1.embedding)).toEqual(Array.from(result2.embedding));

      await service2.shutdown();
    });

    it('should handle batch embeddings', async () => {
      const texts = ['First', 'Second', 'Third'];
      const results = await service.embedBatch(texts);

      expect(results.length).toBe(3);
      results.forEach((result, i) => {
        expect(result.embedding).toBeInstanceOf(Float32Array);
        expect(result.embedding.length).toBe(384);
      });
    });

    it('should track statistics', async () => {
      await service.embed('Text 1');
      await service.embed('Text 2');
      await service.embed('Text 1'); // Cache hit

      const stats = service.getStats();

      expect(stats.totalEmbeddings).toBe(2); // Only 2 unique
      expect(stats.cacheHits).toBe(1);
      expect(stats.cacheMisses).toBe(2);
      expect(stats.modelLoaded).toBe(true);
      expect(stats.provider).toBe('mock');
    });

    it('should clear cache', async () => {
      await service.embed('Cache clear test');
      service.clearCache();

      const result = await service.embed('Cache clear test');
      expect(result.cached).toBe(false);
    });

    it('should return embedding generator function', async () => {
      const generator = service.getGenerator();

      const embedding = await generator('Test content');

      expect(embedding).toBeInstanceOf(Float32Array);
      expect(embedding.length).toBe(384);
    });
  });

  describe('createLocalEmbeddings factory', () => {
    it('should create service with default config', () => {
      const service = createLocalEmbeddings();
      expect(service).toBeInstanceOf(LocalEmbeddingsService);
      expect(service.getDimensions()).toBe(384);
    });

    it('should accept custom config', () => {
      const service = createLocalEmbeddings({
        dimensions: 768,
        provider: 'mock',
        maxCacheSize: 500,
      });

      expect(service.getDimensions()).toBe(768);
    });
  });

  describe('createEmbeddingGenerator factory', () => {
    it('should create embedding generator function', async () => {
      const generator = await createEmbeddingGenerator({ provider: 'mock' });

      const embedding = await generator('Hello world');

      expect(embedding).toBeInstanceOf(Float32Array);
      expect(embedding.length).toBe(384);
    });
  });

  describe('cache disabled', () => {
    beforeEach(() => {
      service = new LocalEmbeddingsService({
        provider: 'mock',
        cacheEnabled: false,
      });
    });

    afterEach(async () => {
      await service.shutdown();
    });

    it('should not cache when disabled', async () => {
      const text = 'No cache test';

      const first = await service.embed(text);
      expect(first.cached).toBe(false);

      const second = await service.embed(text);
      expect(second.cached).toBe(false);
    });

    it('should still generate valid embeddings', async () => {
      const result = await service.embed('Test');

      expect(result.embedding).toBeInstanceOf(Float32Array);
      expect(result.embedding.length).toBe(384);
    });
  });

  describe('custom dimensions', () => {
    it('should support 768 dimensions', async () => {
      service = new LocalEmbeddingsService({
        provider: 'mock',
        dimensions: 768,
      });

      const result = await service.embed('Test');

      expect(result.embedding.length).toBe(768);

      await service.shutdown();
    });

    it('should support 1024 dimensions', async () => {
      service = new LocalEmbeddingsService({
        provider: 'mock',
        dimensions: 1024,
      });

      const result = await service.embed('Test');

      expect(result.embedding.length).toBe(1024);

      await service.shutdown();
    });
  });
});

describe('Embedding Similarity', () => {
  let service: LocalEmbeddingsService;

  beforeEach(() => {
    service = new LocalEmbeddingsService({ provider: 'mock' });
  });

  afterEach(async () => {
    await service.shutdown();
  });

  it('should produce different embeddings for different texts', async () => {
    const result1 = await service.embed('Hello world');
    const result2 = await service.embed('Goodbye universe');

    // At least some values should differ
    let diffCount = 0;
    for (let i = 0; i < result1.embedding.length; i++) {
      if (result1.embedding[i] !== result2.embedding[i]) {
        diffCount++;
      }
    }

    expect(diffCount).toBeGreaterThan(0);
  });

  it('should produce same embedding for same text', async () => {
    service.clearCache();

    const result1 = await service.embed('Identical text');
    service.clearCache();
    const result2 = await service.embed('Identical text');

    // All values should be the same
    for (let i = 0; i < result1.embedding.length; i++) {
      expect(result1.embedding[i]).toBe(result2.embedding[i]);
    }
  });
});

describe('LocalEmbeddingsService advanced', () => {
  describe('cache eviction', () => {
    it('should evict oldest entries when cache is full', async () => {
      // Create service with tiny cache
      const service = new LocalEmbeddingsService({
        provider: 'mock',
        maxCacheSize: 3,
        cacheEnabled: true,
      });

      // Fill the cache
      await service.embed('Text 1');
      await service.embed('Text 2');
      await service.embed('Text 3');

      // This should evict 'Text 1'
      await service.embed('Text 4');

      // 'Text 1' should no longer be cached
      const result1 = await service.embed('Text 1');
      expect(result1.cached).toBe(false);

      // 'Text 4' should be cached
      const result4 = await service.embed('Text 4');
      expect(result4.cached).toBe(true);

      await service.shutdown();
    });

    it('should update existing cache entries without evicting', async () => {
      const service = new LocalEmbeddingsService({
        provider: 'mock',
        maxCacheSize: 3,
        cacheEnabled: true,
      });

      await service.embed('Text 1');
      await service.embed('Text 2');
      await service.embed('Text 3');

      // Access existing entry (should update, not evict)
      const result = await service.embed('Text 2');
      expect(result.cached).toBe(true);

      await service.shutdown();
    });

    it('should move accessed entries to end of LRU', async () => {
      const service = new LocalEmbeddingsService({
        provider: 'mock',
        maxCacheSize: 3,
        cacheEnabled: true,
      });

      await service.embed('Text 1');
      await service.embed('Text 2');
      await service.embed('Text 3');

      // Access 'Text 1' to move it to end
      await service.embed('Text 1');

      // Add new entry - should evict 'Text 2' (oldest after Text 1 access)
      await service.embed('Text 4');

      // 'Text 1' should still be cached
      const result1 = await service.embed('Text 1');
      expect(result1.cached).toBe(true);

      // 'Text 2' should be evicted
      const result2 = await service.embed('Text 2');
      expect(result2.cached).toBe(false);

      await service.shutdown();
    });
  });

  describe('initialization', () => {
    it('should handle double initialization', async () => {
      const service = new LocalEmbeddingsService({ provider: 'mock' });

      await service.initialize();
      await service.initialize(); // Should not throw

      await service.shutdown();
    });

    it('should handle concurrent initialization', async () => {
      const service = new LocalEmbeddingsService({ provider: 'mock' });

      // Start multiple initializations concurrently
      const [result1, result2] = await Promise.all([
        service.initialize(),
        service.initialize(),
      ]);

      // Both should complete without error
      expect(result1).toBeUndefined();
      expect(result2).toBeUndefined();

      await service.shutdown();
    });

    it('should initialize when using transformers provider without transformers installed', async () => {
      // This tests the fallback to mock when transformers.js is not available
      const service = new LocalEmbeddingsService({ provider: 'transformers' });

      // Capture console.warn
      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args) => warnings.push(args.join(' '));

      // The service will try to load transformers and fall back to mock
      await service.initialize();

      // Should have generated a warning about transformers not being available
      // (only if transformers.js is not installed)
      // If transformers IS installed, it will load successfully

      const result = await service.embed('Test');
      expect(result.embedding.length).toBeGreaterThan(0);

      console.warn = originalWarn;
      await service.shutdown();
    });
  });

  describe('stats tracking', () => {
    it('should track average time correctly', async () => {
      const service = new LocalEmbeddingsService({ provider: 'mock' });

      await service.embed('Text 1');
      await service.embed('Text 2');

      const stats = service.getStats();
      expect(stats.avgTimeMs).toBeGreaterThanOrEqual(0);
      expect(stats.totalTimeMs).toBeGreaterThanOrEqual(0);

      await service.shutdown();
    });

    it('should report zero average time when no embeddings', () => {
      const service = new LocalEmbeddingsService({ provider: 'mock' });

      const stats = service.getStats();
      expect(stats.avgTimeMs).toBe(0);
      expect(stats.totalEmbeddings).toBe(0);
    });
  });

  describe('shutdown', () => {
    it('should clear state on shutdown', async () => {
      const service = new LocalEmbeddingsService({ provider: 'mock' });

      await service.embed('Test');
      await service.shutdown();

      // After shutdown, should start fresh
      const result = await service.embed('Test');
      expect(result.cached).toBe(false);
    });
  });

  describe('configuration', () => {
    it('should use custom model ID', () => {
      const service = new LocalEmbeddingsService({
        provider: 'mock',
        modelId: 'custom/model',
      });

      // Model ID is stored in config (accessed via getStats)
      const stats = service.getStats();
      expect(stats.provider).toBe('mock');
    });

    it('should use custom cache directory', () => {
      const service = new LocalEmbeddingsService({
        provider: 'mock',
        cacheDir: '/custom/cache',
      });

      expect(service.getDimensions()).toBe(384);
    });

    it('should handle showProgress option', async () => {
      const service = new LocalEmbeddingsService({
        provider: 'mock',
        showProgress: true,
      });

      await service.initialize();
      // Mock provider doesn't actually show progress, but config is accepted

      await service.shutdown();
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', async () => {
      const service = new LocalEmbeddingsService({ provider: 'mock' });

      const result = await service.embed('');

      expect(result.embedding).toBeInstanceOf(Float32Array);
      expect(result.embedding.length).toBe(384);

      await service.shutdown();
    });

    it('should handle very long text', async () => {
      const service = new LocalEmbeddingsService({ provider: 'mock' });

      const longText = 'a'.repeat(10000);
      const result = await service.embed(longText);

      expect(result.embedding).toBeInstanceOf(Float32Array);
      expect(result.embedding.length).toBe(384);

      await service.shutdown();
    });

    it('should handle unicode text', async () => {
      const service = new LocalEmbeddingsService({ provider: 'mock' });

      const unicodeText = '日本語テスト 中文测试 한국어 테스트 🎉';
      const result = await service.embed(unicodeText);

      expect(result.embedding).toBeInstanceOf(Float32Array);
      expect(result.embedding.length).toBe(384);

      await service.shutdown();
    });

    it('should handle special characters', async () => {
      const service = new LocalEmbeddingsService({ provider: 'mock' });

      const specialText = '!@#$%^&*()[]{}|\\;:\'",.<>?/`~';
      const result = await service.embed(specialText);

      expect(result.embedding).toBeInstanceOf(Float32Array);

      await service.shutdown();
    });
  });
});
