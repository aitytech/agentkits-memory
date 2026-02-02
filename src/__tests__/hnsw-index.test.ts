/**
 * Tests for HNSWIndex
 *
 * Tests HNSW vector index functionality including:
 * - Vector insertion and search
 * - Distance metrics (cosine, euclidean, dot product, manhattan)
 * - Quantization (binary, scalar, product)
 * - Index operations (remove, rebuild, clear)
 * - Statistics and events
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HNSWIndex } from '../hnsw-index.js';

/**
 * Helper to create a random vector
 */
function randomVector(dimensions: number): Float32Array {
  const vector = new Float32Array(dimensions);
  for (let i = 0; i < dimensions; i++) {
    vector[i] = Math.random() * 2 - 1; // Values between -1 and 1
  }
  return vector;
}

/**
 * Helper to create a normalized vector (unit length)
 */
function normalizedVector(dimensions: number): Float32Array {
  const vector = randomVector(dimensions);
  let norm = 0;
  for (let i = 0; i < dimensions; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);
  for (let i = 0; i < dimensions; i++) {
    vector[i] /= norm;
  }
  return vector;
}

/**
 * Helper to create a specific vector
 */
function createVector(values: number[]): Float32Array {
  return new Float32Array(values);
}

describe('HNSWIndex', () => {
  let index: HNSWIndex;
  const dimensions = 8;

  beforeEach(() => {
    index = new HNSWIndex({
      dimensions,
      M: 8,
      efConstruction: 50,
      maxElements: 1000,
      metric: 'cosine',
    });
  });

  describe('basic operations', () => {
    it('should create an empty index', () => {
      expect(index.size).toBe(0);
      expect(index.has('nonexistent')).toBe(false);
    });

    it('should add a single point', async () => {
      const vector = randomVector(dimensions);
      await index.addPoint('id1', vector);

      expect(index.size).toBe(1);
      expect(index.has('id1')).toBe(true);
    });

    it('should add multiple points', async () => {
      for (let i = 0; i < 10; i++) {
        await index.addPoint(`id${i}`, randomVector(dimensions));
      }

      expect(index.size).toBe(10);
      for (let i = 0; i < 10; i++) {
        expect(index.has(`id${i}`)).toBe(true);
      }
    });

    it('should reject vectors with wrong dimensions', async () => {
      const wrongVector = randomVector(dimensions + 5);

      await expect(index.addPoint('id1', wrongVector)).rejects.toThrow(
        /dimension mismatch/
      );
    });

    it('should reject when index is full', async () => {
      const smallIndex = new HNSWIndex({
        dimensions,
        maxElements: 2,
      });

      await smallIndex.addPoint('id1', randomVector(dimensions));
      await smallIndex.addPoint('id2', randomVector(dimensions));

      await expect(
        smallIndex.addPoint('id3', randomVector(dimensions))
      ).rejects.toThrow(/full/);
    });
  });

  describe('search', () => {
    it('should return empty results for empty index', async () => {
      const query = randomVector(dimensions);
      const results = await index.search(query, 5);

      expect(results).toHaveLength(0);
    });

    it('should find the exact vector', async () => {
      const vector = normalizedVector(dimensions);
      await index.addPoint('id1', vector);

      const results = await index.search(vector, 1);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('id1');
      expect(results[0].distance).toBeCloseTo(0, 5);
    });

    it('should return k nearest neighbors', async () => {
      // Add 20 points
      for (let i = 0; i < 20; i++) {
        await index.addPoint(`id${i}`, randomVector(dimensions));
      }

      const query = randomVector(dimensions);
      const results = await index.search(query, 5);

      expect(results).toHaveLength(5);
      // Results should be sorted by distance
      for (let i = 1; i < results.length; i++) {
        expect(results[i].distance).toBeGreaterThanOrEqual(results[i - 1].distance);
      }
    });

    it('should respect k limit when index has fewer points', async () => {
      await index.addPoint('id1', randomVector(dimensions));
      await index.addPoint('id2', randomVector(dimensions));

      const query = randomVector(dimensions);
      const results = await index.search(query, 10);

      expect(results).toHaveLength(2);
    });

    it('should reject query with wrong dimensions', async () => {
      await index.addPoint('id1', randomVector(dimensions));
      const wrongQuery = randomVector(dimensions + 3);

      await expect(index.search(wrongQuery, 5)).rejects.toThrow(
        /dimension mismatch/
      );
    });

    it('should find similar vectors closer', async () => {
      // Create a base vector
      const base = createVector([1, 0, 0, 0, 0, 0, 0, 0]);
      const similar = createVector([0.9, 0.1, 0, 0, 0, 0, 0, 0]);
      const different = createVector([0, 0, 0, 0, 0, 0, 0, 1]);

      await index.addPoint('similar', similar);
      await index.addPoint('different', different);

      const results = await index.search(base, 2);

      expect(results[0].id).toBe('similar');
      expect(results[1].id).toBe('different');
      expect(results[0].distance).toBeLessThan(results[1].distance);
    });
  });

  describe('searchWithFilters', () => {
    it('should apply filters to results', async () => {
      for (let i = 0; i < 20; i++) {
        await index.addPoint(`id${i}`, randomVector(dimensions));
      }

      const query = randomVector(dimensions);
      // Only accept IDs that end with even numbers
      const filter = (id: string) => {
        const num = parseInt(id.replace('id', ''));
        return num % 2 === 0;
      };

      const results = await index.searchWithFilters(query, 5, filter);

      expect(results.length).toBeLessThanOrEqual(5);
      for (const result of results) {
        const num = parseInt(result.id.replace('id', ''));
        expect(num % 2).toBe(0);
      }
    });

    it('should return fewer results if filter eliminates many', async () => {
      for (let i = 0; i < 10; i++) {
        await index.addPoint(`id${i}`, randomVector(dimensions));
      }

      const query = randomVector(dimensions);
      // Only accept id0
      const filter = (id: string) => id === 'id0';

      const results = await index.searchWithFilters(query, 5, filter);

      expect(results.length).toBe(1);
      expect(results[0].id).toBe('id0');
    });
  });

  describe('removePoint', () => {
    it('should remove an existing point', async () => {
      await index.addPoint('id1', randomVector(dimensions));
      await index.addPoint('id2', randomVector(dimensions));

      expect(index.size).toBe(2);
      const removed = await index.removePoint('id1');

      expect(removed).toBe(true);
      expect(index.size).toBe(1);
      expect(index.has('id1')).toBe(false);
      expect(index.has('id2')).toBe(true);
    });

    it('should return false for non-existent point', async () => {
      const removed = await index.removePoint('nonexistent');
      expect(removed).toBe(false);
    });

    it('should handle removing entry point', async () => {
      await index.addPoint('id1', randomVector(dimensions));
      await index.addPoint('id2', randomVector(dimensions));

      // Remove both points
      await index.removePoint('id1');
      await index.removePoint('id2');

      expect(index.size).toBe(0);
    });

    it('should still allow search after removal', async () => {
      await index.addPoint('id1', randomVector(dimensions));
      await index.addPoint('id2', randomVector(dimensions));
      await index.addPoint('id3', randomVector(dimensions));

      await index.removePoint('id2');

      const query = randomVector(dimensions);
      const results = await index.search(query, 10);

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.id)).not.toContain('id2');
    });
  });

  describe('rebuild', () => {
    it('should rebuild index from entries', async () => {
      const entries = [];
      for (let i = 0; i < 10; i++) {
        entries.push({ id: `id${i}`, vector: randomVector(dimensions) });
      }

      await index.rebuild(entries);

      expect(index.size).toBe(10);
      for (const entry of entries) {
        expect(index.has(entry.id)).toBe(true);
      }
    });

    it('should clear existing entries during rebuild', async () => {
      await index.addPoint('old1', randomVector(dimensions));
      await index.addPoint('old2', randomVector(dimensions));

      await index.rebuild([{ id: 'new1', vector: randomVector(dimensions) }]);

      expect(index.size).toBe(1);
      expect(index.has('old1')).toBe(false);
      expect(index.has('new1')).toBe(true);
    });
  });

  describe('clear', () => {
    it('should remove all entries', async () => {
      for (let i = 0; i < 5; i++) {
        await index.addPoint(`id${i}`, randomVector(dimensions));
      }

      expect(index.size).toBe(5);
      index.clear();
      expect(index.size).toBe(0);
    });

    it('should reset statistics', async () => {
      await index.addPoint('id1', randomVector(dimensions));
      await index.search(randomVector(dimensions), 5);

      index.clear();
      const stats = index.getStats();

      expect(stats.vectorCount).toBe(0);
    });
  });

  describe('statistics', () => {
    it('should track vector count', async () => {
      await index.addPoint('id1', randomVector(dimensions));
      await index.addPoint('id2', randomVector(dimensions));

      const stats = index.getStats();
      expect(stats.vectorCount).toBe(2);
    });

    it('should estimate memory usage', async () => {
      await index.addPoint('id1', randomVector(dimensions));

      const stats = index.getStats();
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });

    it('should track search time', async () => {
      await index.addPoint('id1', randomVector(dimensions));
      await index.search(randomVector(dimensions), 5);
      await index.search(randomVector(dimensions), 5);

      const stats = index.getStats();
      expect(stats.avgSearchTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('events', () => {
    it('should emit point:added event', async () => {
      const handler = vi.fn();
      index.on('point:added', handler);

      await index.addPoint('id1', randomVector(dimensions));

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'id1',
          duration: expect.any(Number),
        })
      );
    });

    it('should emit point:removed event', async () => {
      const handler = vi.fn();
      index.on('point:removed', handler);

      await index.addPoint('id1', randomVector(dimensions));
      await index.removePoint('id1');

      expect(handler).toHaveBeenCalledWith({ id: 'id1' });
    });

    it('should emit index:rebuilt event', async () => {
      const handler = vi.fn();
      index.on('index:rebuilt', handler);

      await index.rebuild([{ id: 'id1', vector: randomVector(dimensions) }]);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          vectorCount: 1,
          buildTime: expect.any(Number),
        })
      );
    });
  });

  describe('distance metrics', () => {
    describe('cosine', () => {
      it('should find identical vectors as distance 0', async () => {
        const cosineIndex = new HNSWIndex({
          dimensions: 4,
          metric: 'cosine',
        });

        const vector = normalizedVector(4);
        await cosineIndex.addPoint('id1', vector);

        const results = await cosineIndex.search(vector, 1);
        expect(results[0].distance).toBeCloseTo(0, 5);
      });

      it('should find opposite vectors as distance close to 2', async () => {
        const cosineIndex = new HNSWIndex({
          dimensions: 4,
          metric: 'cosine',
        });

        const vector = createVector([1, 0, 0, 0]);
        const opposite = createVector([-1, 0, 0, 0]);

        await cosineIndex.addPoint('id1', opposite);

        const results = await cosineIndex.search(vector, 1);
        expect(results[0].distance).toBeCloseTo(2, 1);
      });
    });

    describe('euclidean', () => {
      it('should compute euclidean distance correctly', async () => {
        const euclideanIndex = new HNSWIndex({
          dimensions: 3,
          metric: 'euclidean',
        });

        const vector1 = createVector([0, 0, 0]);
        const vector2 = createVector([3, 4, 0]); // Distance should be 5

        await euclideanIndex.addPoint('id1', vector2);

        const results = await euclideanIndex.search(vector1, 1);
        expect(results[0].distance).toBeCloseTo(5, 5);
      });
    });

    describe('dot product', () => {
      it('should compute dot product distance', async () => {
        const dotIndex = new HNSWIndex({
          dimensions: 4,
          metric: 'dot',
        });

        const vector1 = createVector([1, 2, 3, 4]);
        const vector2 = createVector([1, 1, 1, 1]); // Dot product = 10

        await dotIndex.addPoint('id1', vector2);

        const results = await dotIndex.search(vector1, 1);
        // Dot distance is negative (higher dot product = more similar = lower distance)
        expect(results[0].distance).toBeCloseTo(-10, 5);
      });
    });

    describe('manhattan', () => {
      it('should compute manhattan distance correctly', async () => {
        const manhattanIndex = new HNSWIndex({
          dimensions: 3,
          metric: 'manhattan',
        });

        const vector1 = createVector([0, 0, 0]);
        const vector2 = createVector([1, 2, 3]); // Manhattan distance = 6

        await manhattanIndex.addPoint('id1', vector2);

        const results = await manhattanIndex.search(vector1, 1);
        expect(results[0].distance).toBeCloseTo(6, 5);
      });
    });
  });

  describe('quantization', () => {
    describe('binary quantization', () => {
      it('should work with binary quantization', async () => {
        const quantizedIndex = new HNSWIndex({
          dimensions: 32,
          quantization: {
            enabled: true,
            type: 'binary',
            bits: 1,
            method: 'scalar',
          },
        });

        await quantizedIndex.addPoint('id1', randomVector(32));
        await quantizedIndex.addPoint('id2', randomVector(32));

        const results = await quantizedIndex.search(randomVector(32), 2);
        expect(results.length).toBe(2);

        const stats = quantizedIndex.getStats();
        expect(stats.compressionRatio).toBe(32);
      });
    });

    describe('scalar quantization', () => {
      it('should work with scalar quantization', async () => {
        const quantizedIndex = new HNSWIndex({
          dimensions: 16,
          quantization: {
            enabled: true,
            type: 'scalar',
            bits: 8,
            method: 'scalar',
          },
        });

        await quantizedIndex.addPoint('id1', randomVector(16));
        await quantizedIndex.addPoint('id2', randomVector(16));

        const results = await quantizedIndex.search(randomVector(16), 2);
        expect(results.length).toBe(2);

        const stats = quantizedIndex.getStats();
        expect(stats.compressionRatio).toBe(4); // 32/8
      });
    });

    describe('product quantization', () => {
      it('should work with product quantization', async () => {
        const quantizedIndex = new HNSWIndex({
          dimensions: 32,
          quantization: {
            enabled: true,
            type: 'product',
            bits: 8,
            method: 'product',
            subquantizers: 8,
          },
        });

        await quantizedIndex.addPoint('id1', randomVector(32));
        await quantizedIndex.addPoint('id2', randomVector(32));

        const results = await quantizedIndex.search(randomVector(32), 2);
        expect(results.length).toBe(2);

        const stats = quantizedIndex.getStats();
        expect(stats.compressionRatio).toBe(8);
      });
    });
  });

  describe('default configuration', () => {
    it('should use default values when not specified', async () => {
      const defaultIndex = new HNSWIndex({});

      // Should use default dimensions (1536 for OpenAI)
      const vector = randomVector(1536);
      await defaultIndex.addPoint('id1', vector);

      expect(defaultIndex.size).toBe(1);
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent insertions', async () => {
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(index.addPoint(`id${i}`, randomVector(dimensions)));
      }

      await Promise.all(promises);
      expect(index.size).toBe(20);
    });

    it('should handle concurrent searches', async () => {
      // Add some points first
      for (let i = 0; i < 10; i++) {
        await index.addPoint(`id${i}`, randomVector(dimensions));
      }

      // Concurrent searches
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(index.search(randomVector(dimensions), 5));
      }

      const results = await Promise.all(promises);
      for (const result of results) {
        expect(result.length).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle single element index', async () => {
      await index.addPoint('only', randomVector(dimensions));

      const results = await index.search(randomVector(dimensions), 10);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('only');
    });

    it('should handle searching for more results than exist', async () => {
      await index.addPoint('id1', randomVector(dimensions));
      await index.addPoint('id2', randomVector(dimensions));

      const results = await index.search(randomVector(dimensions), 100);
      expect(results).toHaveLength(2);
    });

    it('should handle zero vector', async () => {
      const zeroVector = createVector([0, 0, 0, 0, 0, 0, 0, 0]);
      await index.addPoint('zero', zeroVector);

      expect(index.has('zero')).toBe(true);
    });

    it('should handle very similar vectors', async () => {
      const base = createVector([1, 0, 0, 0, 0, 0, 0, 0]);
      const almostSame = createVector([0.99, 0.01, 0, 0, 0, 0, 0, 0]);

      await index.addPoint('base', base);
      await index.addPoint('almost', almostSame);

      const results = await index.search(base, 2);
      // Both should be found, with base being closer (distance closer to 0)
      expect(results.length).toBe(2);
      // The base vector should have distance very close to 0
      const baseResult = results.find((r) => r.id === 'base');
      expect(baseResult).toBeDefined();
      expect(baseResult!.distance).toBeCloseTo(0, 3);
    });
  });

  describe('large scale', () => {
    it('should handle 100 vectors efficiently', async () => {
      const largeIndex = new HNSWIndex({
        dimensions: 64,
        M: 16,
        efConstruction: 100,
        maxElements: 10000,
      });

      const startInsert = performance.now();
      for (let i = 0; i < 100; i++) {
        await largeIndex.addPoint(`id${i}`, randomVector(64));
      }
      const insertTime = performance.now() - startInsert;

      expect(largeIndex.size).toBe(100);
      expect(insertTime).toBeLessThan(5000); // Should complete in 5 seconds

      const startSearch = performance.now();
      const results = await largeIndex.search(randomVector(64), 10);
      const searchTime = performance.now() - startSearch;

      expect(results).toHaveLength(10);
      expect(searchTime).toBeLessThan(100); // Search should be fast
    });
  });

  describe('quantization edge cases', () => {
    it('should handle no quantization type', async () => {
      const noQuantIndex = new HNSWIndex({
        dimensions: 8,
        quantization: {
          enabled: true,
          type: 'none',
          bits: 8,
          method: 'scalar',
        },
      });

      await noQuantIndex.addPoint('id1', randomVector(8));
      const results = await noQuantIndex.search(randomVector(8), 1);
      expect(results.length).toBe(1);

      const stats = noQuantIndex.getStats();
      expect(stats.compressionRatio).toBe(1); // No compression with 'none' type
    });
  });

  describe('multiple layers', () => {
    it('should build multi-level graph with many insertions', async () => {
      const multiLevelIndex = new HNSWIndex({
        dimensions: 8,
        M: 4,
        efConstruction: 20,
        maxElements: 200,
      });

      // Insert enough points to likely have multiple levels
      for (let i = 0; i < 50; i++) {
        await multiLevelIndex.addPoint(`id${i}`, randomVector(8));
      }

      expect(multiLevelIndex.size).toBe(50);

      // Search should still work
      const results = await multiLevelIndex.search(randomVector(8), 5);
      expect(results.length).toBe(5);
    });
  });

  describe('connection pruning', () => {
    it('should prune connections when graph is dense', async () => {
      // Use small M to force pruning
      const denseIndex = new HNSWIndex({
        dimensions: 4,
        M: 2,
        efConstruction: 10,
        maxElements: 100,
      });

      // Insert points that will require pruning
      for (let i = 0; i < 20; i++) {
        await denseIndex.addPoint(`id${i}`, randomVector(4));
      }

      expect(denseIndex.size).toBe(20);

      // Should still be searchable after pruning
      const results = await denseIndex.search(randomVector(4), 5);
      expect(results.length).toBe(5);
    });
  });

  describe('ef parameter', () => {
    it('should use custom ef for search', async () => {
      for (let i = 0; i < 30; i++) {
        await index.addPoint(`id${i}`, randomVector(dimensions));
      }

      // Search with different ef values
      const lowEf = await index.search(randomVector(dimensions), 5, 10);
      const highEf = await index.search(randomVector(dimensions), 5, 100);

      // Both should return 5 results
      expect(lowEf.length).toBe(5);
      expect(highEf.length).toBe(5);
    });
  });
});
