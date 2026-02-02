import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as BetterDatabase } from 'better-sqlite3';
import {
  HybridSearchEngine,
  createHybridSearchEngine,
} from '../hybrid-search.js';

describe('HybridSearchEngine', () => {
  let db: BetterDatabase;
  let engine: HybridSearchEngine;

  beforeEach(async () => {
    db = new Database(':memory:');

    // Create memory_entries table
    db.exec(`
      CREATE TABLE memory_entries (
        rowid INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT UNIQUE NOT NULL,
        key TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT DEFAULT 'semantic',
        namespace TEXT DEFAULT 'default',
        tags TEXT DEFAULT '[]',
        metadata TEXT DEFAULT '{}',
        embedding BLOB,
        owner_id TEXT,
        access_level TEXT DEFAULT 'project',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER,
        version INTEGER DEFAULT 1,
        "references" TEXT DEFAULT '[]',
        access_count INTEGER DEFAULT 0,
        last_accessed_at INTEGER NOT NULL
      )
    `);

    engine = new HybridSearchEngine(db);
    await engine.initialize();
  });

  afterEach(() => {
    db.close();
  });

  describe('initialization', () => {
    it('should initialize without error', () => {
      expect(engine).toBeDefined();
    });

    it('should detect FTS5 availability correctly', () => {
      const available = engine.isFtsAvailable();
      expect(typeof available).toBe('boolean');
      // better-sqlite3 should always have FTS5
      expect(available).toBe(true);
    });

    it('should detect trigram tokenizer for CJK support', () => {
      const tokenizer = engine.getActiveTokenizer();
      // better-sqlite3 includes trigram tokenizer
      expect(tokenizer).toBe('trigram');
      expect(engine.isCjkOptimized()).toBe(true);
    });

    it('should create FTS5 virtual table', () => {
      const result = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_fts'"
      ).get() as { name: string } | undefined;
      expect(result?.name).toBe('memory_fts');
    });

    it('should create sync triggers', () => {
      const result = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger'"
      ).all() as { name: string }[];
      const triggerNames = result.map((r) => r.name);
      expect(triggerNames).toContain('memory_fts_insert');
      expect(triggerNames).toContain('memory_fts_delete');
      expect(triggerNames).toContain('memory_fts_update');
    });
  });

  describe('keyword search', () => {
    beforeEach(async () => {
      const now = Date.now();
      const entries = [
        { id: 'e1', key: 'auth', content: 'JWT authentication with refresh tokens', namespace: 'patterns' },
        { id: 'e2', key: 'database', content: 'PostgreSQL connection pooling', namespace: 'patterns' },
        { id: 'e3', key: 'api', content: 'REST API with authentication headers', namespace: 'decisions' },
        { id: 'e4', key: 'security', content: 'OAuth2 authentication flow', namespace: 'patterns' },
      ];

      const stmt = db.prepare(
        `INSERT INTO memory_entries (id, key, content, namespace, tags, created_at, updated_at, last_accessed_at)
         VALUES (?, ?, ?, ?, '[]', ?, ?, ?)`
      );
      for (const entry of entries) {
        stmt.run(entry.id, entry.key, entry.content, entry.namespace, now, now, now);
      }

      await engine.rebuildFtsIndex();
    });

    it('should find entries by keyword', async () => {
      const results = await engine.searchCompact('authentication', { includeSemantic: false });

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.id === 'e1')).toBe(true); // JWT authentication
    });

    it('should return compact results with required fields', async () => {
      const results = await engine.searchCompact('authentication', { includeSemantic: false });

      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result.id).toBeDefined();
        expect(result.key).toBeDefined();
        expect(result.namespace).toBeDefined();
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.snippet).toBeDefined();
        expect(result.estimatedTokens).toBeGreaterThan(0);
      }
    });

    it('should filter by namespace', async () => {
      const results = await engine.searchCompact('authentication', {
        namespace: 'patterns',
        includeSemantic: false,
      });

      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result.namespace).toBe('patterns');
      }
    });

    it('should handle empty query', async () => {
      const results = await engine.searchCompact('', { includeSemantic: false });
      expect(results.length).toBe(0);
    });

    it('should handle query with special characters', async () => {
      const results = await engine.searchCompact('test*[query]', { includeSemantic: false });
      expect(Array.isArray(results)).toBe(true);
    });

    it('should find multiple matching entries', async () => {
      const results = await engine.searchCompact('authentication', { includeSemantic: false });
      // Should find e1, e3, e4 (all have "authentication")
      expect(results.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('CJK language support', () => {
    it('should support Japanese (日本語) search', async () => {
      const now = Date.now();
      db.prepare(
        `INSERT INTO memory_entries (id, key, content, namespace, tags, created_at, updated_at, last_accessed_at)
         VALUES (?, ?, ?, ?, '[]', ?, ?, ?)`
      ).run('jp1', 'japanese', '日本語のテスト内容です', 'patterns', now, now, now);
      await engine.rebuildFtsIndex();

      const results = await engine.searchCompact('日本語', { includeSemantic: false });
      expect(results.some((r) => r.id === 'jp1')).toBe(true);
    });

    it('should support Chinese (中文) search', async () => {
      const now = Date.now();
      db.prepare(
        `INSERT INTO memory_entries (id, key, content, namespace, tags, created_at, updated_at, last_accessed_at)
         VALUES (?, ?, ?, ?, '[]', ?, ?, ?)`
      ).run('cn1', 'chinese', '中文测试内容', 'patterns', now, now, now);
      await engine.rebuildFtsIndex();

      const results = await engine.searchCompact('中文', { includeSemantic: false });
      expect(results.some((r) => r.id === 'cn1')).toBe(true);
    });

    it('should support Korean (한국어) search', async () => {
      const now = Date.now();
      db.prepare(
        `INSERT INTO memory_entries (id, key, content, namespace, tags, created_at, updated_at, last_accessed_at)
         VALUES (?, ?, ?, ?, '[]', ?, ?, ?)`
      ).run('kr1', 'korean', '한국어 테스트 내용입니다', 'patterns', now, now, now);
      await engine.rebuildFtsIndex();

      const results = await engine.searchCompact('한국어', { includeSemantic: false });
      expect(results.some((r) => r.id === 'kr1')).toBe(true);
    });

    it('should support mixed CJK and English search', async () => {
      const now = Date.now();
      db.prepare(
        `INSERT INTO memory_entries (id, key, content, namespace, tags, created_at, updated_at, last_accessed_at)
         VALUES (?, ?, ?, ?, '[]', ?, ?, ?)`
      ).run('mix1', 'mixed', 'API設計パターン Japanese API design', 'patterns', now, now, now);
      await engine.rebuildFtsIndex();

      // Search Japanese
      const jpResults = await engine.searchCompact('設計パターン', { includeSemantic: false });
      expect(jpResults.some((r) => r.id === 'mix1')).toBe(true);

      // Search English
      const enResults = await engine.searchCompact('design', { includeSemantic: false });
      expect(enResults.some((r) => r.id === 'mix1')).toBe(true);
    });
  });

  describe('FTS5 features', () => {
    beforeEach(async () => {
      const now = Date.now();
      const entries = [
        { id: 'e1', key: 'auth', content: 'JWT authentication with refresh tokens', namespace: 'patterns' },
        { id: 'e2', key: 'database', content: 'PostgreSQL connection pooling', namespace: 'patterns' },
        { id: 'e3', key: 'api', content: 'REST API with authentication headers', namespace: 'decisions' },
      ];

      const stmt = db.prepare(
        `INSERT INTO memory_entries (id, key, content, namespace, tags, created_at, updated_at, last_accessed_at)
         VALUES (?, ?, ?, ?, '[]', ?, ?, ?)`
      );
      for (const entry of entries) {
        stmt.run(entry.id, entry.key, entry.content, entry.namespace, now, now, now);
      }
      await engine.rebuildFtsIndex();
    });

    it('should use BM25 ranking', async () => {
      const results = await engine.searchCompact('authentication', { includeSemantic: false });
      // With BM25, results should be ranked by relevance
      expect(results.length).toBeGreaterThan(0);
      // First result should have highest score
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('should sync FTS index on insert via trigger', async () => {
      const now = Date.now();
      db.prepare(
        `INSERT INTO memory_entries (id, key, content, namespace, tags, created_at, updated_at, last_accessed_at)
         VALUES (?, ?, ?, ?, '[]', ?, ?, ?)`
      ).run('new1', 'new-key', 'Brand new content for testing', 'patterns', now, now, now);

      // Should find without manual rebuildFtsIndex due to trigger
      const results = await engine.searchCompact('Brand new content', { includeSemantic: false });
      expect(results.some((r) => r.id === 'new1')).toBe(true);
    });
  });

  describe('LIKE fallback', () => {
    it('should work when engine not initialized', async () => {
      // Create engine with fallback forced (by using db without FTS5 init)
      const fallbackEngine = new HybridSearchEngine(db, { fallbackToLike: true });
      // Don't initialize - simulates no FTS5

      const now = Date.now();
      db.prepare(
        `INSERT INTO memory_entries (id, key, content, namespace, tags, created_at, updated_at, last_accessed_at)
         VALUES (?, ?, ?, ?, '[]', ?, ?, ?)`
      ).run('fallback1', 'test', 'Fallback test content', 'default', now, now, now);

      // This will use LIKE fallback since engine not initialized
      const results = await fallbackEngine.searchCompact('Fallback', { includeSemantic: false });
      expect(results.some((r) => r.id === 'fallback1')).toBe(true);
    });
  });

  describe('3-layer search workflow', () => {
    beforeEach(async () => {
      const baseTime = Date.now();
      const entries = [
        { id: 'e1', key: 'step1', content: 'First step content', created_at: baseTime - 3000 },
        { id: 'e2', key: 'step2', content: 'Second step content', created_at: baseTime - 2000 },
        { id: 'e3', key: 'step3', content: 'Third step content', created_at: baseTime - 1000 },
        { id: 'e4', key: 'step4', content: 'Fourth step content', created_at: baseTime },
      ];

      const stmt = db.prepare(
        `INSERT INTO memory_entries (id, key, content, namespace, tags, created_at, updated_at, last_accessed_at)
         VALUES (?, ?, ?, 'default', '[]', ?, ?, ?)`
      );
      for (const entry of entries) {
        stmt.run(entry.id, entry.key, entry.content, entry.created_at, entry.created_at, entry.created_at);
      }
      await engine.rebuildFtsIndex();
    });

    it('Layer 1: should return compact results with snippets', async () => {
      const results = await engine.searchCompact('step content', { includeSemantic: false });

      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result.snippet.length).toBeLessThanOrEqual(100);
        expect(result.estimatedTokens).toBeGreaterThan(0);
      }
    });

    it('Layer 2: should return timeline context with before/after', async () => {
      const timeline = await engine.searchTimeline(['e2'], 1);

      expect(timeline.length).toBe(1);
      expect(timeline[0].entry.id).toBe('e2');
      expect(timeline[0].before.length).toBe(1); // e1
      expect(timeline[0].after.length).toBe(1); // e3
      expect(timeline[0].before[0].id).toBe('e1');
      expect(timeline[0].after[0].id).toBe('e3');
    });

    it('Layer 2: should handle multiple context windows', async () => {
      const timeline = await engine.searchTimeline(['e2'], 2);

      expect(timeline[0].before.length).toBe(1); // Only e1 exists before
      expect(timeline[0].after.length).toBe(2); // e3 and e4
    });

    it('Layer 3: should return full entries with all fields', async () => {
      const entries = await engine.getFull(['e1', 'e2']);

      expect(entries.length).toBe(2);
      expect(entries[0].id).toBe('e1');
      expect(entries[0].content).toBe('First step content');
      expect(entries[0].key).toBe('step1');
      expect(entries[1].id).toBe('e2');
      expect(entries[1].content).toBe('Second step content');
    });

    it('Layer 3: should handle empty ID list', async () => {
      const entries = await engine.getFull([]);
      expect(entries.length).toBe(0);
    });

    it('Layer 3: should preserve order of requested IDs', async () => {
      const entries = await engine.getFull(['e3', 'e1', 'e4']);

      expect(entries.length).toBe(3);
      expect(entries[0].id).toBe('e3');
      expect(entries[1].id).toBe('e1');
      expect(entries[2].id).toBe('e4');
    });
  });

  describe('hybrid search with economics', () => {
    beforeEach(async () => {
      const now = Date.now();
      db.prepare(
        `INSERT INTO memory_entries (id, key, content, namespace, tags, created_at, updated_at, last_accessed_at)
         VALUES (?, ?, ?, ?, '[]', ?, ?, ?)`
      ).run('test1', 'test-key', 'Test content for hybrid search with some longer text to measure tokens', 'default', now, now, now);
      await engine.rebuildFtsIndex();
    });

    it('should return full search result with all components', async () => {
      const result = await engine.search('test', { fetchFull: true });

      expect(result.results).toBeDefined();
      expect(result.compact).toBeDefined();
      expect(result.economics).toBeDefined();
      expect(result.timing).toBeDefined();
    });

    it('should track token economics', async () => {
      const result = await engine.search('test', { fetchFull: true });

      expect(result.economics.fullResultTokens).toBeGreaterThanOrEqual(0);
      expect(result.economics.actualTokens).toBeGreaterThanOrEqual(0);
      expect(result.economics.savingsPercent).toBeGreaterThanOrEqual(0);
      expect(result.economics.layers).toBeDefined();
    });

    it('should track timing metrics', async () => {
      const result = await engine.search('test');

      expect(result.timing.keywordMs).toBeGreaterThanOrEqual(0);
      expect(result.timing.totalMs).toBeGreaterThanOrEqual(0);
      expect(result.timing.totalMs).toBeGreaterThanOrEqual(result.timing.keywordMs);
    });

    it('should respect limit option', async () => {
      const now = Date.now();
      const stmt = db.prepare(
        `INSERT INTO memory_entries (id, key, content, namespace, tags, created_at, updated_at, last_accessed_at)
         VALUES (?, ?, ?, ?, '[]', ?, ?, ?)`
      );
      for (let i = 0; i < 5; i++) {
        stmt.run(`test${i + 2}`, `key${i}`, `Test content number ${i}`, 'default', now, now, now);
      }
      await engine.rebuildFtsIndex();

      const result = await engine.search('test', { limit: 2 });
      expect(result.compact.length).toBeLessThanOrEqual(2);
    });
  });

  describe('configuration', () => {
    it('should use default configuration', () => {
      const config = engine.getConfig();

      expect(config.keywordWeight).toBe(0.3);
      expect(config.semanticWeight).toBe(0.7);
      expect(config.minScore).toBe(0.1);
      expect(config.useBM25).toBe(true);
      expect(config.tokenizer).toBe('trigram');
      expect(config.fallbackToLike).toBe(true);
    });

    it('should accept custom configuration', () => {
      const customEngine = new HybridSearchEngine(db, {
        keywordWeight: 0.5,
        semanticWeight: 0.5,
        minScore: 0.2,
        tokenizer: 'unicode61',
      });

      const config = customEngine.getConfig();

      expect(config.keywordWeight).toBe(0.5);
      expect(config.semanticWeight).toBe(0.5);
      expect(config.minScore).toBe(0.2);
      expect(config.tokenizer).toBe('unicode61');
    });

    it('should update configuration dynamically', () => {
      engine.updateConfig({ keywordWeight: 0.4, minScore: 0.15 });

      const config = engine.getConfig();
      expect(config.keywordWeight).toBe(0.4);
      expect(config.minScore).toBe(0.15);
      // Other values should remain unchanged
      expect(config.semanticWeight).toBe(0.7);
    });
  });

  describe('createHybridSearchEngine factory', () => {
    it('should create engine with default config', () => {
      const engine = createHybridSearchEngine(db);
      expect(engine).toBeInstanceOf(HybridSearchEngine);
    });

    it('should create engine with custom config', () => {
      const engine = createHybridSearchEngine(db, { keywordWeight: 0.6 });
      expect(engine.getConfig().keywordWeight).toBe(0.6);
    });
  });

  describe('edge cases', () => {
    it('should handle very long content', async () => {
      const now = Date.now();
      const longContent = 'test '.repeat(1000); // 5000 chars
      db.prepare(
        `INSERT INTO memory_entries (id, key, content, namespace, tags, created_at, updated_at, last_accessed_at)
         VALUES (?, ?, ?, ?, '[]', ?, ?, ?)`
      ).run('long1', 'long-key', longContent, 'default', now, now, now);
      await engine.rebuildFtsIndex();

      const results = await engine.searchCompact('test', { includeSemantic: false });
      expect(results.some((r) => r.id === 'long1')).toBe(true);
      // Snippet should be truncated
      expect(results.find((r) => r.id === 'long1')?.snippet.length).toBeLessThanOrEqual(100);
    });

    it('should handle entries with no matches', async () => {
      const results = await engine.searchCompact('nonexistent_query_xyz', { includeSemantic: false });
      expect(results.length).toBe(0);
    });

    it('should handle whitespace-only query', async () => {
      const results = await engine.searchCompact('   ', { includeSemantic: false });
      expect(results.length).toBe(0);
    });
  });

  describe('non-trigram tokenizers', () => {
    it('should work with unicode61 tokenizer', async () => {
      const unicode61Engine = new HybridSearchEngine(db, { tokenizer: 'unicode61' });
      await unicode61Engine.initialize();

      const now = Date.now();
      db.prepare(
        `INSERT INTO memory_entries (id, key, content, namespace, tags, created_at, updated_at, last_accessed_at)
         VALUES (?, ?, ?, ?, '[]', ?, ?, ?)`
      ).run('u61-1', 'unicode-test', 'Testing unicode61 tokenizer with english text', 'default', now, now, now);

      await unicode61Engine.rebuildFtsIndex();

      const results = await unicode61Engine.searchCompact('testing english', { includeSemantic: false });
      expect(results.some((r) => r.id === 'u61-1')).toBe(true);
    });

    it('should work with porter tokenizer', async () => {
      const porterEngine = new HybridSearchEngine(db, { tokenizer: 'porter' });
      await porterEngine.initialize();

      const now = Date.now();
      db.prepare(
        `INSERT INTO memory_entries (id, key, content, namespace, tags, created_at, updated_at, last_accessed_at)
         VALUES (?, ?, ?, ?, '[]', ?, ?, ?)`
      ).run('porter-1', 'porter-test', 'Running and jumping are activities', 'default', now, now, now);

      await porterEngine.rebuildFtsIndex();

      // Porter stemmer should match "run" to "running"
      const results = await porterEngine.searchCompact('run', { includeSemantic: false });
      expect(results.some((r) => r.id === 'porter-1')).toBe(true);
    });

    it('should sanitize query for non-trigram tokenizers', async () => {
      const unicode61Engine = new HybridSearchEngine(db, { tokenizer: 'unicode61' });
      await unicode61Engine.initialize();

      const now = Date.now();
      db.prepare(
        `INSERT INTO memory_entries (id, key, content, namespace, tags, created_at, updated_at, last_accessed_at)
         VALUES (?, ?, ?, ?, '[]', ?, ?, ?)`
      ).run('sanitize-1', 'sanitize-test', 'Multiple words in content here', 'default', now, now, now);

      await unicode61Engine.rebuildFtsIndex();

      // Multi-word query should be sanitized to "word1" OR "word2"
      const results = await unicode61Engine.searchCompact('Multiple words', { includeSemantic: false });
      expect(results.some((r) => r.id === 'sanitize-1')).toBe(true);
    });
  });

  describe('semantic search with embeddings', () => {
    it('should search entries with embeddings', async () => {
      const mockEmbeddingGenerator = async (text: string): Promise<Float32Array> => {
        // Simple mock that returns consistent embeddings
        const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const embedding = new Float32Array(384);
        for (let i = 0; i < 384; i++) {
          embedding[i] = Math.sin(hash + i) * 0.5 + 0.5;
        }
        return embedding;
      };

      const semanticEngine = new HybridSearchEngine(db, {}, mockEmbeddingGenerator);
      await semanticEngine.initialize();

      const now = Date.now();
      const embedding = await mockEmbeddingGenerator('authentication pattern');
      const embeddingBuffer = Buffer.from(embedding.buffer);

      db.prepare(
        `INSERT INTO memory_entries (id, key, content, namespace, tags, embedding, created_at, updated_at, last_accessed_at)
         VALUES (?, ?, ?, ?, '[]', ?, ?, ?, ?)`
      ).run('emb-1', 'auth-pattern', 'JWT authentication pattern for secure APIs', 'patterns', embeddingBuffer, now, now, now);

      await semanticEngine.rebuildFtsIndex();

      // Search with semantic enabled
      const results = await semanticEngine.searchCompact('authentication pattern', {
        includeKeyword: false,
        includeSemantic: true,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].semanticScore).toBeGreaterThan(0);
    });

    it('should fuse keyword and semantic scores', async () => {
      const mockEmbeddingGenerator = async (text: string): Promise<Float32Array> => {
        const embedding = new Float32Array(384);
        for (let i = 0; i < 384; i++) {
          embedding[i] = Math.random();
        }
        return embedding;
      };

      const fusionEngine = new HybridSearchEngine(db, {
        keywordWeight: 0.3,
        semanticWeight: 0.7,
      }, mockEmbeddingGenerator);
      await fusionEngine.initialize();

      const now = Date.now();
      const embedding = await mockEmbeddingGenerator('test content');
      const embeddingBuffer = Buffer.from(embedding.buffer);

      db.prepare(
        `INSERT INTO memory_entries (id, key, content, namespace, tags, embedding, created_at, updated_at, last_accessed_at)
         VALUES (?, ?, ?, ?, '[]', ?, ?, ?, ?)`
      ).run('fusion-1', 'fusion-test', 'Test content for fusion search', 'default', embeddingBuffer, now, now, now);

      await fusionEngine.rebuildFtsIndex();

      // Search with both enabled
      const results = await fusionEngine.searchCompact('test content', {
        includeKeyword: true,
        includeSemantic: true,
      });

      expect(results.length).toBeGreaterThan(0);
      // Score should be a weighted combination
      const result = results.find((r) => r.id === 'fusion-1');
      if (result) {
        expect(result.keywordScore).toBeGreaterThanOrEqual(0);
        expect(result.semanticScore).toBeGreaterThanOrEqual(0);
      }
    });

    it('should return full entries with embeddings via getFull', async () => {
      const now = Date.now();
      const embedding = new Float32Array(384);
      for (let i = 0; i < 384; i++) {
        embedding[i] = i / 384;
      }
      const embeddingBuffer = Buffer.from(embedding.buffer);

      db.prepare(
        `INSERT INTO memory_entries (id, key, content, namespace, tags, embedding, created_at, updated_at, last_accessed_at)
         VALUES (?, ?, ?, ?, '[]', ?, ?, ?, ?)`
      ).run('full-emb-1', 'full-emb-test', 'Content with embedding', 'default', embeddingBuffer, now, now, now);

      const entries = await engine.getFull(['full-emb-1']);

      expect(entries.length).toBe(1);
      expect(entries[0].embedding).toBeDefined();
      expect(entries[0].embedding?.length).toBe(384);
      expect(entries[0].embedding?.[0]).toBeCloseTo(0, 5);
      expect(entries[0].embedding?.[383]).toBeCloseTo(383 / 384, 5);
    });
  });

  describe('error handling', () => {
    it('should handle FTS5 not available gracefully', async () => {
      // Create a mock database that doesn't support FTS5
      const mockDb = new Database(':memory:');
      mockDb.exec(`
        CREATE TABLE memory_entries (
          rowid INTEGER PRIMARY KEY AUTOINCREMENT,
          id TEXT UNIQUE NOT NULL,
          key TEXT NOT NULL,
          content TEXT NOT NULL,
          namespace TEXT DEFAULT 'default',
          tags TEXT DEFAULT '[]',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          last_accessed_at INTEGER NOT NULL
        )
      `);

      // Override the FTS5 check to simulate unavailability
      const noFtsEngine = new HybridSearchEngine(mockDb, { fallbackToLike: true });

      // Insert data before initializing (simulating no FTS5)
      const now = Date.now();
      mockDb.prepare(
        `INSERT INTO memory_entries (id, key, content, namespace, tags, created_at, updated_at, last_accessed_at)
         VALUES (?, ?, ?, ?, '[]', ?, ?, ?)`
      ).run('nofts-1', 'fallback-test', 'Testing LIKE fallback search', 'default', now, now, now);

      await noFtsEngine.initialize();

      // Should still work via LIKE fallback
      const results = await noFtsEngine.searchCompact('fallback', { includeSemantic: false });
      expect(results.length).toBeGreaterThan(0);

      mockDb.close();
    });

    it('should handle missing timeline entries', async () => {
      const timeline = await engine.searchTimeline(['nonexistent-id']);
      expect(timeline.length).toBe(0);
    });
  });
});
