/**
 * Tests for CacheManager
 *
 * Tests LRU cache functionality, TTL expiration, memory pressure handling,
 * and cache statistics.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheManager, TieredCacheManager } from '../cache-manager.js';

describe('CacheManager', () => {
  let cache: CacheManager<string>;

  beforeEach(() => {
    cache = new CacheManager<string>({
      maxSize: 100,
      ttl: 60000, // 1 minute
    });
  });

  afterEach(() => {
    cache.shutdown();
  });

  describe('basic operations', () => {
    it('should set and get values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for missing keys', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should delete values', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeNull();
    });

    it('should return false when deleting nonexistent key', () => {
      expect(cache.delete('nonexistent')).toBe(false);
    });

    it('should check if key exists', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.get('key1')).toBeNull();
    });

    it('should return all keys', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      const keys = cache.keys();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
    });

    it('should update existing entries', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');
      expect(cache.get('key1')).toBe('value2');
      expect(cache.size).toBe(1);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used when at capacity', () => {
      const smallCache = new CacheManager<string>({ maxSize: 3, ttl: 60000 });

      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');

      // Access key1 to make it recently used
      smallCache.get('key1');

      // Add new entry, should evict key2 (LRU)
      smallCache.set('key4', 'value4');

      expect(smallCache.get('key1')).toBe('value1');
      expect(smallCache.get('key2')).toBeNull(); // Evicted
      expect(smallCache.get('key3')).toBe('value3');
      expect(smallCache.get('key4')).toBe('value4');

      smallCache.shutdown();
    });

    it('should move accessed items to front of LRU', () => {
      const smallCache = new CacheManager<string>({ maxSize: 3, ttl: 60000 });

      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');

      // Access key1 multiple times
      smallCache.get('key1');
      smallCache.get('key1');

      // Add two new entries
      smallCache.set('key4', 'value4');
      smallCache.set('key5', 'value5');

      // key1 should still exist, key2 and key3 should be evicted
      expect(smallCache.get('key1')).toBe('value1');
      expect(smallCache.has('key2')).toBe(false);
      expect(smallCache.has('key3')).toBe(false);

      smallCache.shutdown();
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      const shortTtlCache = new CacheManager<string>({
        maxSize: 100,
        ttl: 50, // 50ms TTL
      });

      shortTtlCache.set('key1', 'value1');
      expect(shortTtlCache.get('key1')).toBe('value1');

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(shortTtlCache.get('key1')).toBeNull();

      shortTtlCache.shutdown();
    });

    it('should respect custom TTL per entry', async () => {
      cache.set('short', 'value1', 50); // 50ms TTL
      cache.set('long', 'value2', 5000); // 5s TTL

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(cache.get('short')).toBeNull(); // Expired
      expect(cache.get('long')).toBe('value2'); // Still valid
    });

    it('should not return expired entries via has()', async () => {
      const shortTtlCache = new CacheManager<string>({
        maxSize: 100,
        ttl: 50,
      });

      shortTtlCache.set('key1', 'value1');
      expect(shortTtlCache.has('key1')).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(shortTtlCache.has('key1')).toBe(false);

      shortTtlCache.shutdown();
    });
  });

  describe('memory pressure', () => {
    it('should evict when memory limit exceeded', () => {
      const memoryCache = new CacheManager<string>({
        maxSize: 1000,
        maxMemory: 100, // Very small memory limit
        ttl: 60000,
      });

      // Add entries until memory is exceeded
      for (let i = 0; i < 10; i++) {
        memoryCache.set(`key${i}`, 'a'.repeat(20)); // Each ~40 bytes
      }

      // Should have evicted some entries
      expect(memoryCache.size).toBeLessThan(10);

      memoryCache.shutdown();
    });
  });

  describe('statistics', () => {
    it('should track hits and misses', () => {
      cache.set('key1', 'value1');

      cache.get('key1'); // Hit
      cache.get('key1'); // Hit
      cache.get('nonexistent'); // Miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3);
    });

    it('should track evictions', () => {
      const smallCache = new CacheManager<string>({ maxSize: 2, ttl: 60000 });

      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3'); // Evicts key1

      const stats = smallCache.getStats();
      expect(stats.evictions).toBe(1);

      smallCache.shutdown();
    });

    it('should track size and memory usage', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });
  });

  describe('getOrSet', () => {
    it('should return cached value if exists', async () => {
      cache.set('key1', 'cached');

      const loader = vi.fn().mockResolvedValue('loaded');
      const result = await cache.getOrSet('key1', loader);

      expect(result).toBe('cached');
      expect(loader).not.toHaveBeenCalled();
    });

    it('should load and cache value if not exists', async () => {
      const loader = vi.fn().mockResolvedValue('loaded');
      const result = await cache.getOrSet('key1', loader);

      expect(result).toBe('loaded');
      expect(loader).toHaveBeenCalledTimes(1);
      expect(cache.get('key1')).toBe('loaded');
    });
  });

  describe('prefetch', () => {
    it('should load missing keys in batch', async () => {
      cache.set('key1', 'existing');

      const loader = vi.fn().mockResolvedValue(
        new Map([
          ['key2', 'loaded2'],
          ['key3', 'loaded3'],
        ])
      );

      await cache.prefetch(['key1', 'key2', 'key3'], loader);

      // Loader should only be called for missing keys
      expect(loader).toHaveBeenCalledWith(['key2', 'key3']);
      expect(cache.get('key1')).toBe('existing');
      expect(cache.get('key2')).toBe('loaded2');
      expect(cache.get('key3')).toBe('loaded3');
    });

    it('should not call loader if all keys exist', async () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const loader = vi.fn();
      await cache.prefetch(['key1', 'key2'], loader);

      expect(loader).not.toHaveBeenCalled();
    });
  });

  describe('warmUp', () => {
    it('should populate cache with initial data', () => {
      cache.warmUp([
        { key: 'key1', data: 'value1' },
        { key: 'key2', data: 'value2' },
        { key: 'key3', data: 'value3', ttl: 1000 },
      ]);

      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
      expect(cache.size).toBe(3);
    });
  });

  describe('invalidatePattern', () => {
    it('should invalidate keys matching string pattern', () => {
      cache.set('user:1', 'value1');
      cache.set('user:2', 'value2');
      cache.set('post:1', 'value3');

      const count = cache.invalidatePattern('user:');

      expect(count).toBe(2);
      expect(cache.has('user:1')).toBe(false);
      expect(cache.has('user:2')).toBe(false);
      expect(cache.has('post:1')).toBe(true);
    });

    it('should invalidate keys matching regex pattern', () => {
      cache.set('cache:session:abc', 'value1');
      cache.set('cache:session:def', 'value2');
      cache.set('cache:data:xyz', 'value3');

      const count = cache.invalidatePattern(/cache:session:/);

      expect(count).toBe(2);
      expect(cache.has('cache:session:abc')).toBe(false);
      expect(cache.has('cache:data:xyz')).toBe(true);
    });
  });

  describe('events', () => {
    it('should emit cache:hit event', () => {
      const handler = vi.fn();
      cache.on('cache:hit', handler);

      cache.set('key1', 'value1');
      cache.get('key1');

      expect(handler).toHaveBeenCalledWith({ key: 'key1' });
    });

    it('should emit cache:miss event', () => {
      const handler = vi.fn();
      cache.on('cache:miss', handler);

      cache.get('nonexistent');

      expect(handler).toHaveBeenCalledWith({ key: 'nonexistent' });
    });

    it('should emit cache:set event', () => {
      const handler = vi.fn();
      cache.on('cache:set', handler);

      cache.set('key1', 'value1');

      expect(handler).toHaveBeenCalledWith({ key: 'key1', ttl: 60000 });
    });

    it('should emit cache:delete event', () => {
      const handler = vi.fn();
      cache.on('cache:delete', handler);

      cache.set('key1', 'value1');
      cache.delete('key1');

      expect(handler).toHaveBeenCalledWith({ key: 'key1' });
    });
  });

  describe('shutdown', () => {
    it('should clear cache and stop cleanup timer', () => {
      cache.set('key1', 'value1');
      cache.shutdown();

      expect(cache.size).toBe(0);
    });
  });
});

describe('TieredCacheManager', () => {
  let tieredCache: TieredCacheManager<string>;
  let l2Store: Map<string, string>;

  beforeEach(() => {
    l2Store = new Map();

    tieredCache = new TieredCacheManager<string>(
      { maxSize: 10, ttl: 60000 },
      {
        loader: async (key) => l2Store.get(key) ?? null,
        writer: async (key, value) => {
          l2Store.set(key, value);
        },
      }
    );
  });

  afterEach(() => {
    tieredCache.shutdown();
  });

  describe('tiered caching', () => {
    it('should store in L1 cache and write through to L2', async () => {
      await tieredCache.set('key1', 'value1');
      const result = await tieredCache.get('key1');
      expect(result).toBe('value1');
      expect(l2Store.get('key1')).toBe('value1');
    });

    it('should fall back to L2 when L1 misses', async () => {
      // Directly set in L2 (simulating data loaded from storage)
      l2Store.set('key1', 'value1');

      // Should find in L2
      const result = await tieredCache.get('key1');
      expect(result).toBe('value1');
    });

    it('should promote L2 hits to L1', async () => {
      // Set in L2 only
      l2Store.set('key1', 'value1');

      // First access loads from L2
      await tieredCache.get('key1');

      // Now should be in L1 (faster subsequent access)
      const stats = tieredCache.getStats();
      expect(stats.size).toBe(1);
    });

    it('should delete from L1', async () => {
      await tieredCache.set('key1', 'value1');
      expect(tieredCache.delete('key1')).toBe(true);

      // Should miss in L1, but L2 still has it
      expect(l2Store.has('key1')).toBe(true);
    });

    it('should clear L1 cache', async () => {
      await tieredCache.set('key1', 'value1');
      await tieredCache.set('key2', 'value2');

      tieredCache.clear();

      const stats = tieredCache.getStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('without L2', () => {
    it('should work with L1 only', async () => {
      const l1Only = new TieredCacheManager<string>({ maxSize: 10, ttl: 60000 });

      await l1Only.set('key1', 'value1');
      const result = await l1Only.get('key1');
      expect(result).toBe('value1');

      l1Only.shutdown();
    });

    it('should return null for missing keys without L2', async () => {
      const l1Only = new TieredCacheManager<string>({ maxSize: 10, ttl: 60000 });

      const result = await l1Only.get('nonexistent');
      expect(result).toBeNull();

      l1Only.shutdown();
    });
  });

  describe('statistics', () => {
    it('should return L1 statistics', async () => {
      await tieredCache.set('key1', 'value1');
      await tieredCache.get('key1');

      const stats = tieredCache.getStats();
      expect(stats.hits).toBeGreaterThanOrEqual(1);
      expect(stats.size).toBe(1);
    });
  });

  describe('events', () => {
    it('should emit l1:hit event', async () => {
      const handler = vi.fn();
      tieredCache.on('l1:hit', handler);

      await tieredCache.set('key1', 'value1');
      await tieredCache.get('key1');

      expect(handler).toHaveBeenCalled();
    });

    it('should emit l2:hit event', async () => {
      const handler = vi.fn();
      tieredCache.on('l2:hit', handler);

      l2Store.set('key1', 'value1');
      await tieredCache.get('key1');

      expect(handler).toHaveBeenCalledWith({ key: 'key1' });
    });

    it('should emit l2:write event', async () => {
      const handler = vi.fn();
      tieredCache.on('l2:write', handler);

      await tieredCache.set('key1', 'value1');

      expect(handler).toHaveBeenCalledWith({ key: 'key1' });
    });
  });
});
