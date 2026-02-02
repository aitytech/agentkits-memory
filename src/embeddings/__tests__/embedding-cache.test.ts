import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as BetterDatabase } from 'better-sqlite3';
import {
  PersistentEmbeddingCache,
  createPersistentEmbeddingCache,
} from '../embedding-cache.js';

describe('PersistentEmbeddingCache', () => {
  let db: BetterDatabase;
  let cache: PersistentEmbeddingCache;

  beforeEach(() => {
    db = new Database(':memory:');
    cache = new PersistentEmbeddingCache(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('basic operations', () => {
    it('should store and retrieve embeddings', () => {
      const embedding = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
      cache.set('Test content', embedding);

      const retrieved = cache.get('Test content');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.length).toBe(5);
      for (let i = 0; i < embedding.length; i++) {
        expect(retrieved![i]).toBeCloseTo(embedding[i], 5);
      }
    });

    it('should return null for missing content', () => {
      const retrieved = cache.get('Non-existent content');
      expect(retrieved).toBeNull();
    });

    it('should check if content exists', () => {
      const embedding = new Float32Array([0.1, 0.2, 0.3]);
      cache.set('Existing content', embedding);

      expect(cache.has('Existing content')).toBe(true);
      expect(cache.has('Missing content')).toBe(false);
    });

    it('should overwrite existing embeddings', () => {
      const embedding1 = new Float32Array([0.1, 0.2, 0.3]);
      const embedding2 = new Float32Array([0.4, 0.5, 0.6]);

      cache.set('Content', embedding1);
      cache.set('Content', embedding2);

      const retrieved = cache.get('Content');
      for (let i = 0; i < embedding2.length; i++) {
        expect(retrieved![i]).toBeCloseTo(embedding2[i], 5);
      }
    });

    it('should clear all entries', () => {
      cache.set('Content 1', new Float32Array([0.1]));
      cache.set('Content 2', new Float32Array([0.2]));

      cache.clear();

      expect(cache.get('Content 1')).toBeNull();
      expect(cache.get('Content 2')).toBeNull();
    });
  });

  describe('expiration', () => {
    it('should expire entries after TTL', async () => {
      const shortTtlCache = new PersistentEmbeddingCache(db, { ttlMs: 100 });
      shortTtlCache.set('Expiring content', new Float32Array([0.1, 0.2]));

      // Should exist immediately
      expect(shortTtlCache.get('Expiring content')).not.toBeNull();

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be expired
      expect(shortTtlCache.get('Expiring content')).toBeNull();
    });

    it('should evict expired entries', async () => {
      const shortTtlCache = new PersistentEmbeddingCache(db, { ttlMs: 50 });
      shortTtlCache.set('Expiring', new Float32Array([0.1]));

      await new Promise((resolve) => setTimeout(resolve, 100));

      const evicted = shortTtlCache.evictExpired();
      expect(evicted).toBe(1);
    });
  });

  describe('capacity management', () => {
    it('should evict entries when over capacity', () => {
      const smallCache = new PersistentEmbeddingCache(db, { maxSize: 5 });

      // Add 5 entries (at capacity)
      for (let i = 1; i <= 5; i++) {
        smallCache.set(`Entry ${i}`, new Float32Array([i * 0.1]));
      }

      // Verify all 5 exist
      const stats1 = smallCache.getStats();
      expect(stats1.size).toBe(5);

      // Add 2 more entries, should trigger eviction
      smallCache.set('Entry 6', new Float32Array([0.6]));
      smallCache.set('Entry 7', new Float32Array([0.7]));

      // New entries should exist
      expect(smallCache.get('Entry 6')).not.toBeNull();
      expect(smallCache.get('Entry 7')).not.toBeNull();

      // Size should not exceed maxSize
      const stats2 = smallCache.getStats();
      expect(stats2.size).toBeLessThanOrEqual(5);
    });
  });

  describe('statistics', () => {
    it('should track hits and misses', () => {
      cache.set('Content', new Float32Array([0.1, 0.2, 0.3]));

      cache.get('Content'); // Hit
      cache.get('Content'); // Hit
      cache.get('Missing'); // Miss

      const stats = cache.getStats();

      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3);
    });

    it('should track size and bytes', () => {
      cache.set('Content 1', new Float32Array([0.1, 0.2, 0.3])); // 12 bytes
      cache.set('Content 2', new Float32Array([0.4, 0.5])); // 8 bytes

      const stats = cache.getStats();

      expect(stats.size).toBe(2);
      expect(stats.bytesUsed).toBeGreaterThan(0);
    });

    it('should reset stats on clear', () => {
      cache.set('Content', new Float32Array([0.1]));
      cache.get('Content');

      cache.clear();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('getAllEmbeddings', () => {
    it('should return all non-expired embeddings', () => {
      cache.set('Content 1', new Float32Array([0.1, 0.2]));
      cache.set('Content 2', new Float32Array([0.3, 0.4]));
      cache.set('Content 3', new Float32Array([0.5, 0.6]));

      const all = cache.getAllEmbeddings();

      expect(all.length).toBe(3);
      all.forEach((item) => {
        expect(item.hash).toBeDefined();
        expect(item.embedding).toBeInstanceOf(Float32Array);
        expect(item.embedding.length).toBe(2);
      });
    });

    it('should not include expired embeddings', async () => {
      const shortTtlCache = new PersistentEmbeddingCache(db, { ttlMs: 50 });
      shortTtlCache.set('Expiring', new Float32Array([0.1]));
      shortTtlCache.set('Not expiring', new Float32Array([0.2]));

      // Set longer TTL for second entry
      const longTtlCache = new PersistentEmbeddingCache(db, { ttlMs: 10000 });
      longTtlCache.set('Long TTL', new Float32Array([0.3]));

      await new Promise((resolve) => setTimeout(resolve, 100));

      const all = longTtlCache.getAllEmbeddings();

      // Only non-expired entries should be returned
      expect(all.length).toBe(1);
    });
  });

  describe('createPersistentEmbeddingCache factory', () => {
    it('should create cache with default config', () => {
      const cache = createPersistentEmbeddingCache(db);
      expect(cache).toBeInstanceOf(PersistentEmbeddingCache);
    });

    it('should accept custom config', () => {
      const cache = createPersistentEmbeddingCache(db, {
        maxSize: 500,
        ttlMs: 1000,
        dimensions: 768,
      });

      expect(cache).toBeInstanceOf(PersistentEmbeddingCache);
    });
  });

  describe('content hashing', () => {
    it('should use consistent hashing', () => {
      const embedding = new Float32Array([0.1, 0.2, 0.3]);

      cache.set('Same content', embedding);

      // Different cache instance, same DB
      const cache2 = new PersistentEmbeddingCache(db);
      const retrieved = cache2.get('Same content');

      expect(retrieved).not.toBeNull();
      for (let i = 0; i < embedding.length; i++) {
        expect(retrieved![i]).toBeCloseTo(embedding[i], 5);
      }
    });

    it('should differentiate similar content', () => {
      const embeddingA = new Float32Array([0.1]);
      const embeddingB = new Float32Array([0.2]);
      cache.set('Content A', embeddingA);
      cache.set('Content B', embeddingB);

      expect(cache.get('Content A')![0]).toBeCloseTo(0.1, 5);
      expect(cache.get('Content B')![0]).toBeCloseTo(0.2, 5);
    });
  });

  describe('large embeddings', () => {
    it('should handle 384-dimension embeddings', () => {
      const embedding = new Float32Array(384);
      for (let i = 0; i < 384; i++) {
        embedding[i] = Math.random();
      }

      cache.set('Large embedding', embedding);
      const retrieved = cache.get('Large embedding');

      expect(retrieved?.length).toBe(384);
      for (let i = 0; i < 384; i++) {
        expect(retrieved![i]).toBeCloseTo(embedding[i], 5);
      }
    });

    it('should handle 768-dimension embeddings', () => {
      const embedding = new Float32Array(768);
      for (let i = 0; i < 768; i++) {
        embedding[i] = Math.random();
      }

      cache.set('Larger embedding', embedding);
      const retrieved = cache.get('Larger embedding');

      expect(retrieved?.length).toBe(768);
    });
  });
});
