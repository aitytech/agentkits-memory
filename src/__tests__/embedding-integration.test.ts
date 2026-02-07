/**
 * Embedding Integration Tests
 *
 * Tests for embedding support across ProjectMemoryService,
 * HybridSearchEngine, and MCP Server integration.
 *
 * @module @aitytech/agentkits-memory/__tests__/embedding-integration.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import Database from 'better-sqlite3';
import {
  ProjectMemoryService,
  LocalEmbeddingsService,
  HybridSearchEngine,
  type MemoryEntry,
} from '../index.js';

describe('Embedding Integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-integration-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('ProjectMemoryService with LocalEmbeddingsService', () => {
    it('should generate embeddings when storing entries', async () => {
      const embeddingsService = new LocalEmbeddingsService({
        cacheDir: path.join(tempDir, 'cache'),
      });
      await embeddingsService.initialize();

      const embeddingGenerator = async (text: string): Promise<Float32Array> => {
        const result = await embeddingsService.embed(text);
        return result.embedding;
      };

      const service = new ProjectMemoryService({
        baseDir: tempDir,
        dbFilename: 'test.db',
        embeddingGenerator,
      });
      await service.initialize();

      const entry = await service.storeEntry({
        key: 'test-entry',
        content: 'This is a test content for embedding generation',
        namespace: 'test',
      });

      expect(entry.embedding).toBeDefined();
      expect(entry.embedding).toBeInstanceOf(Float32Array);
      expect(entry.embedding!.length).toBe(384); // Default dimension

      await service.shutdown();
    });

    it('should perform semantic search with embeddings', async () => {
      const embeddingsService = new LocalEmbeddingsService({
        cacheDir: path.join(tempDir, 'cache'),
      });
      await embeddingsService.initialize();

      const embeddingGenerator = async (text: string): Promise<Float32Array> => {
        const result = await embeddingsService.embed(text);
        return result.embedding;
      };

      const service = new ProjectMemoryService({
        baseDir: tempDir,
        dbFilename: 'test.db',
        embeddingGenerator,
      });
      await service.initialize();

      // Store entries with different content
      await service.storeEntry({
        key: 'auth-pattern',
        content: 'Authentication using JWT tokens with refresh mechanism',
        namespace: 'patterns',
      });

      await service.storeEntry({
        key: 'db-pattern',
        content: 'Database connection pooling for PostgreSQL',
        namespace: 'patterns',
      });

      await service.storeEntry({
        key: 'error-handling',
        content: 'Global error handler for API exceptions',
        namespace: 'errors',
      });

      // Semantic search should find related content
      const results = await service.semanticSearch('JWT authentication', 5);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entry.key).toBe('auth-pattern');
      expect(results[0].score).toBeGreaterThan(0);

      await service.shutdown();
    });

    it('should update embeddings when content changes', async () => {
      const embeddingsService = new LocalEmbeddingsService({
        cacheDir: path.join(tempDir, 'cache'),
      });
      await embeddingsService.initialize();

      const embeddingGenerator = async (text: string): Promise<Float32Array> => {
        const result = await embeddingsService.embed(text);
        return result.embedding;
      };

      const service = new ProjectMemoryService({
        baseDir: tempDir,
        dbFilename: 'test.db',
        embeddingGenerator,
      });
      await service.initialize();

      const entry = await service.storeEntry({
        key: 'updateable',
        content: 'Original content about cats',
        namespace: 'test',
      });

      const originalEmbedding = entry.embedding!.slice();

      // Update content
      const updated = await service.update(entry.id, {
        content: 'Updated content about dogs',
      });

      expect(updated).not.toBeNull();
      expect(updated!.embedding).toBeInstanceOf(Float32Array);
      expect(updated!.embedding!.length).toBe(384);

      // Embedding should be different after content change
      const isDifferent = !originalEmbedding.every(
        (val, i) => val === updated!.embedding![i]
      );
      expect(isDifferent).toBe(true);

      await service.shutdown();
    });
  });

  describe('HybridSearchEngine with embeddings', () => {
    it('should perform semantic search and return scored results', async () => {
      const dbPath = path.join(tempDir, 'hybrid.db');
      const db = new Database(dbPath);
      db.pragma('journal_mode = WAL');

      // Create table with rowid for FTS sync
      db.exec(`
        CREATE TABLE memory_entries (
          id TEXT PRIMARY KEY,
          key TEXT NOT NULL,
          content TEXT NOT NULL,
          type TEXT DEFAULT 'semantic',
          namespace TEXT DEFAULT 'general',
          tags TEXT DEFAULT '[]',
          embedding BLOB,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);

      const embeddingsService = new LocalEmbeddingsService({
        cacheDir: path.join(tempDir, 'cache'),
      });
      await embeddingsService.initialize();

      const embeddingGenerator = async (text: string): Promise<Float32Array> => {
        const result = await embeddingsService.embed(text);
        return result.embedding;
      };

      const engine = new HybridSearchEngine(db, {}, embeddingGenerator);
      await engine.initialize();

      // Insert test data with embeddings
      const now = Date.now();
      const entries = [
        { id: '1', key: 'react-hooks', content: 'React hooks for state management with useState and useEffect' },
        { id: '2', key: 'vue-composition', content: 'Vue 3 composition API for reactive state' },
        { id: '3', key: 'angular-services', content: 'Angular dependency injection and services' },
      ];

      for (const entry of entries) {
        const embedding = await embeddingGenerator(entry.content);
        const embeddingBuffer = Buffer.from(embedding.buffer);

        db.prepare(`
          INSERT INTO memory_entries (id, key, content, embedding, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(entry.id, entry.key, entry.content, embeddingBuffer, now, now);
      }

      await engine.rebuildFtsIndex();

      // Search using semantic only (more reliable in tests)
      const results = await engine.searchCompact('React state hooks', {
        limit: 10,
        includeKeyword: false,
        includeSemantic: true,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('1'); // React entry should be first

      // Semantic score should be present
      expect(results[0].semanticScore).toBeGreaterThan(0);
      expect(results[0].score).toBeGreaterThan(0);

      db.close();
    });

    it('should work with text-only search when no embeddings', async () => {
      const dbPath = path.join(tempDir, 'text-only.db');
      const db = new Database(dbPath);
      db.pragma('journal_mode = WAL');

      db.exec(`
        CREATE TABLE memory_entries (
          id TEXT PRIMARY KEY,
          key TEXT NOT NULL,
          content TEXT NOT NULL,
          type TEXT DEFAULT 'semantic',
          namespace TEXT DEFAULT 'general',
          tags TEXT DEFAULT '[]',
          embedding BLOB,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);

      // Engine without embedding generator
      const engine = new HybridSearchEngine(db);
      await engine.initialize();

      const now = Date.now();
      db.prepare(`
        INSERT INTO memory_entries (id, key, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('1', 'test', 'Test content with keywords', now, now);

      await engine.rebuildFtsIndex();

      const results = await engine.searchCompact('keywords', {
        limit: 10,
        includeKeyword: true,
        includeSemantic: true, // Should not fail even without embedding generator
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].keywordScore).toBeGreaterThan(0);
      expect(results[0].semanticScore).toBe(0); // No semantic without embeddings

      db.close();
    });

    it('should support vector-only search mode', async () => {
      const dbPath = path.join(tempDir, 'vector-only.db');
      const db = new Database(dbPath);
      db.pragma('journal_mode = WAL');

      db.exec(`
        CREATE TABLE memory_entries (
          id TEXT PRIMARY KEY,
          key TEXT NOT NULL,
          content TEXT NOT NULL,
          type TEXT DEFAULT 'semantic',
          namespace TEXT DEFAULT 'general',
          tags TEXT DEFAULT '[]',
          embedding BLOB,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);

      const embeddingsService = new LocalEmbeddingsService({
        cacheDir: path.join(tempDir, 'cache'),
      });
      await embeddingsService.initialize();

      const embeddingGenerator = async (text: string): Promise<Float32Array> => {
        const result = await embeddingsService.embed(text);
        return result.embedding;
      };

      const engine = new HybridSearchEngine(db, {}, embeddingGenerator);
      await engine.initialize();

      const now = Date.now();
      const embedding = await embeddingGenerator('Machine learning algorithms');
      const embeddingBuffer = Buffer.from(embedding.buffer);

      db.prepare(`
        INSERT INTO memory_entries (id, key, content, embedding, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('1', 'ml', 'Machine learning algorithms', embeddingBuffer, now, now);

      // Vector-only search (no keyword)
      const results = await engine.searchCompact('AI neural networks', {
        limit: 10,
        includeKeyword: false,
        includeSemantic: true,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].keywordScore).toBe(0); // Keyword disabled
      expect(results[0].semanticScore).toBeGreaterThan(0);

      db.close();
    });
  });

  describe('CJK language support with embeddings', () => {
    it('should generate embeddings for Japanese text', async () => {
      const embeddingsService = new LocalEmbeddingsService({
        cacheDir: path.join(tempDir, 'cache'),
      });
      await embeddingsService.initialize();

      const result = await embeddingsService.embed('これは日本語のテストです');

      expect(result.embedding).toBeInstanceOf(Float32Array);
      expect(result.embedding.length).toBe(384);
    });

    it('should generate embeddings for Chinese text', async () => {
      const embeddingsService = new LocalEmbeddingsService({
        cacheDir: path.join(tempDir, 'cache'),
      });
      await embeddingsService.initialize();

      const result = await embeddingsService.embed('这是中文测试');

      expect(result.embedding).toBeInstanceOf(Float32Array);
      expect(result.embedding.length).toBe(384);
    });

    it('should find semantically similar CJK content', async () => {
      const embeddingsService = new LocalEmbeddingsService({
        cacheDir: path.join(tempDir, 'cache'),
      });
      await embeddingsService.initialize();

      const embeddingGenerator = async (text: string): Promise<Float32Array> => {
        const result = await embeddingsService.embed(text);
        return result.embedding;
      };

      const service = new ProjectMemoryService({
        baseDir: tempDir,
        dbFilename: 'cjk.db',
        embeddingGenerator,
      });
      await service.initialize();

      await service.storeEntry({
        key: 'japanese-greeting',
        content: 'おはようございます。今日はいい天気ですね。',
        namespace: 'test',
      });

      await service.storeEntry({
        key: 'japanese-farewell',
        content: 'さようなら。また会いましょう。',
        namespace: 'test',
      });

      // Search for morning greeting
      const results = await service.semanticSearch('朝の挨拶', 5);

      expect(results.length).toBeGreaterThan(0);

      await service.shutdown();
    });
  });

  describe('Embedding caching', () => {
    it('should cache embeddings and return faster on second call', async () => {
      const embeddingsService = new LocalEmbeddingsService({
        cacheDir: path.join(tempDir, 'cache'),
      });
      await embeddingsService.initialize();

      const text = 'This is a test sentence for caching';

      // First call - should compute
      const result1 = await embeddingsService.embed(text);
      expect(result1.cached).toBe(false);

      // Second call - should be cached
      const result2 = await embeddingsService.embed(text);
      expect(result2.cached).toBe(true);

      // Embeddings should be identical
      expect(result1.embedding.length).toBe(result2.embedding.length);
      const areSame = result1.embedding.every(
        (val, i) => val === result2.embedding[i]
      );
      expect(areSame).toBe(true);
    });

    it('should use in-memory cache within same service instance', async () => {
      const embeddingsService = new LocalEmbeddingsService({
        cacheDir: path.join(tempDir, 'cache'),
        maxCacheSize: 100,
      });
      await embeddingsService.initialize();

      const text = 'Cache consistency test';

      // First call
      const result1 = await embeddingsService.embed(text);
      expect(result1.cached).toBe(false);

      // Second call with same text - should hit cache
      const result2 = await embeddingsService.embed(text);
      expect(result2.cached).toBe(true);

      // Third call with different text - cache miss
      const result3 = await embeddingsService.embed('Different text');
      expect(result3.cached).toBe(false);

      // Same different text again - cache hit
      const result4 = await embeddingsService.embed('Different text');
      expect(result4.cached).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should handle embedding generation failure gracefully', async () => {
      const failingGenerator = async (): Promise<Float32Array> => {
        throw new Error('Embedding service unavailable');
      };

      const service = new ProjectMemoryService({
        baseDir: tempDir,
        dbFilename: 'fail.db',
        embeddingGenerator: failingGenerator,
      });
      await service.initialize();

      // Should still store entry even if embedding fails
      const entry = await service.storeEntry({
        key: 'no-embedding',
        content: 'Content without embedding due to failure',
        namespace: 'test',
      });

      expect(typeof entry.id).toBe('string');
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.embedding).toBeUndefined();

      await service.shutdown();
    });

    it('should handle empty content gracefully', async () => {
      const embeddingsService = new LocalEmbeddingsService({
        cacheDir: path.join(tempDir, 'cache'),
      });
      await embeddingsService.initialize();

      // Empty string should still work
      const result = await embeddingsService.embed('');
      expect(result.embedding).toBeInstanceOf(Float32Array);
      expect(result.embedding.length).toBe(384);
    });
  });
});
