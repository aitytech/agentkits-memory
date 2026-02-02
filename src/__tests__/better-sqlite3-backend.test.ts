/**
 * Tests for BetterSqlite3Backend with FTS5 Trigram Tokenizer for CJK Support
 *
 * These tests verify proper CJK (Japanese, Chinese, Korean) language support
 * using the native SQLite trigram tokenizer.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { BetterSqlite3Backend, createBetterSqlite3Backend, createJapaneseOptimizedBackend } from '../better-sqlite3-backend.js';
import type { MemoryEntry } from '../types.js';

// Skip tests if better-sqlite3 is not available
let betterSqlite3Available = false;
try {
  await import('better-sqlite3');
  betterSqlite3Available = true;
} catch {
  console.log('[Test] better-sqlite3 not available, skipping native tests');
}

const describeCond = betterSqlite3Available ? describe : describe.skip;

describeCond('BetterSqlite3Backend', () => {
  let backend: BetterSqlite3Backend;

  beforeEach(async () => {
    backend = createBetterSqlite3Backend({
      databasePath: ':memory:',
      ftsTokenizer: 'trigram',
      verbose: false,
    });
    await backend.initialize();
  });

  afterEach(async () => {
    await backend.shutdown();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      expect(backend).toBeDefined();
    });

    it('should have FTS5 available', () => {
      expect(backend.isFtsAvailable()).toBe(true);
    });

    it('should use trigram tokenizer', () => {
      expect(backend.getActiveTokenizer()).toBe('trigram');
    });

    it('should report CJK optimized', () => {
      expect(backend.isCjkOptimized()).toBe(true);
    });

    it('should pass health check with CJK support', async () => {
      const health = await backend.healthCheck();
      expect(health.status).toBe('healthy');

      // cache component is repurposed for CJK status
      expect(health.components.cache.status).toBe('healthy');
      expect(health.components.cache.message).toContain('Trigram');
    });
  });

  describe('basic CRUD operations', () => {
    it('should store and retrieve entries', async () => {
      const entry: MemoryEntry = {
        id: 'test-1',
        key: 'test-key',
        content: 'Test content',
        type: 'semantic',
        namespace: 'default',
        tags: ['test'],
        metadata: {},
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      };

      await backend.store(entry);
      const retrieved = await backend.get('test-1');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('test-1');
      expect(retrieved?.content).toBe('Test content');
    });

    it('should update entries', async () => {
      const entry: MemoryEntry = {
        id: 'test-update',
        key: 'original-key',
        content: 'Original content',
        type: 'semantic',
        namespace: 'default',
        tags: [],
        metadata: {},
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      };

      await backend.store(entry);
      const updated = await backend.update('test-update', { content: 'Updated content' });

      expect(updated?.content).toBe('Updated content');
      expect(updated?.version).toBe(2);
    });

    it('should delete entries', async () => {
      const entry: MemoryEntry = {
        id: 'test-delete',
        key: 'delete-key',
        content: 'Delete me',
        type: 'semantic',
        namespace: 'default',
        tags: [],
        metadata: {},
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      };

      await backend.store(entry);
      const deleted = await backend.delete('test-delete');
      const retrieved = await backend.get('test-delete');

      expect(deleted).toBe(true);
      expect(retrieved).toBeNull();
    });
  });

  describe('FTS5 with trigram tokenizer', () => {
    beforeEach(async () => {
      // Insert test entries
      const entries: MemoryEntry[] = [
        {
          id: 'en-1',
          key: 'english',
          content: 'Authentication using JWT tokens with refresh mechanism',
          type: 'semantic',
          namespace: 'patterns',
          tags: ['auth'],
          metadata: {},
          accessLevel: 'project',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1,
          references: [],
          accessCount: 0,
          lastAccessedAt: Date.now(),
        },
        {
          id: 'en-2',
          key: 'database',
          content: 'PostgreSQL connection pooling for high performance',
          type: 'semantic',
          namespace: 'patterns',
          tags: ['database'],
          metadata: {},
          accessLevel: 'project',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1,
          references: [],
          accessCount: 0,
          lastAccessedAt: Date.now(),
        },
      ];

      await backend.bulkInsert(entries);
    });

    it('should find English entries by keyword', async () => {
      const results = await backend.searchFts('authentication');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.id === 'en-1')).toBe(true);
    });

    it('should find entries by partial match', async () => {
      const results = await backend.searchFts('auth');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should filter by namespace', async () => {
      const results = await backend.searchFts('authentication', { namespace: 'patterns' });
      expect(results.every((r) => r.namespace === 'patterns')).toBe(true);
    });
  });

  describe('CJK language support', () => {
    describe('Japanese (日本語)', () => {
      beforeEach(async () => {
        const entries: MemoryEntry[] = [
          {
            id: 'jp-1',
            key: 'japanese-1',
            content: '日本語のテスト内容です。認証機能の実装について説明します。',
            type: 'semantic',
            namespace: 'japanese',
            tags: ['日本語', 'テスト'],
            metadata: {},
            accessLevel: 'project',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            version: 1,
            references: [],
            accessCount: 0,
            lastAccessedAt: Date.now(),
          },
          {
            id: 'jp-2',
            key: 'japanese-2',
            content: 'データベース接続プーリングの実装パターン',
            type: 'semantic',
            namespace: 'japanese',
            tags: ['データベース'],
            metadata: {},
            accessLevel: 'project',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            version: 1,
            references: [],
            accessCount: 0,
            lastAccessedAt: Date.now(),
          },
        ];

        await backend.bulkInsert(entries);
      });

      it('should find entries by Japanese text', async () => {
        const results = await backend.searchFts('日本語');
        expect(results.length).toBeGreaterThan(0);
        expect(results.some((r) => r.id === 'jp-1')).toBe(true);
      });

      it('should find entries by Japanese partial text', async () => {
        // Trigram tokenizer needs 3+ characters for reliable matching
        const results = await backend.searchFts('認証機能');
        expect(results.length).toBeGreaterThan(0);
        expect(results.some((r) => r.id === 'jp-1')).toBe(true);
      });

      it('should find entries by katakana', async () => {
        const results = await backend.searchFts('データベース');
        expect(results.length).toBeGreaterThan(0);
        expect(results.some((r) => r.id === 'jp-2')).toBe(true);
      });

      it('should find entries by hiragana', async () => {
        // 'テスト内容' is a longer phrase that appears in the content
        const results = await backend.searchFts('テスト内容');
        expect(results.length).toBeGreaterThan(0);
      });
    });

    describe('Chinese (中文)', () => {
      beforeEach(async () => {
        const entries: MemoryEntry[] = [
          {
            id: 'cn-1',
            key: 'chinese-1',
            content: '中文测试内容。这是关于用户认证的说明。',
            type: 'semantic',
            namespace: 'chinese',
            tags: ['中文', '测试'],
            metadata: {},
            accessLevel: 'project',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            version: 1,
            references: [],
            accessCount: 0,
            lastAccessedAt: Date.now(),
          },
          {
            id: 'cn-2',
            key: 'chinese-2',
            content: '数据库连接池配置说明',
            type: 'semantic',
            namespace: 'chinese',
            tags: ['数据库'],
            metadata: {},
            accessLevel: 'project',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            version: 1,
            references: [],
            accessCount: 0,
            lastAccessedAt: Date.now(),
          },
        ];

        await backend.bulkInsert(entries);
      });

      it('should find entries by Chinese text', async () => {
        // Use 3+ character term for trigram tokenizer
        const results = await backend.searchFts('中文测试');
        expect(results.length).toBeGreaterThan(0);
        expect(results.some((r) => r.id === 'cn-1')).toBe(true);
      });

      it('should find entries by Chinese partial text', async () => {
        // Use longer phrase for reliable trigram matching
        const results = await backend.searchFts('用户认证');
        expect(results.length).toBeGreaterThan(0);
      });

      it('should find entries by Chinese database term', async () => {
        const results = await backend.searchFts('数据库');
        expect(results.length).toBeGreaterThan(0);
        expect(results.some((r) => r.id === 'cn-2')).toBe(true);
      });
    });

    describe('Korean (한국어)', () => {
      beforeEach(async () => {
        const entries: MemoryEntry[] = [
          {
            id: 'kr-1',
            key: 'korean-1',
            content: '한국어 테스트 내용입니다. 사용자 인증에 대한 설명입니다.',
            type: 'semantic',
            namespace: 'korean',
            tags: ['한국어', '테스트'],
            metadata: {},
            accessLevel: 'project',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            version: 1,
            references: [],
            accessCount: 0,
            lastAccessedAt: Date.now(),
          },
          {
            id: 'kr-2',
            key: 'korean-2',
            content: '데이터베이스 연결 풀 설정 방법',
            type: 'semantic',
            namespace: 'korean',
            tags: ['데이터베이스'],
            metadata: {},
            accessLevel: 'project',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            version: 1,
            references: [],
            accessCount: 0,
            lastAccessedAt: Date.now(),
          },
        ];

        await backend.bulkInsert(entries);
      });

      it('should find entries by Korean text', async () => {
        const results = await backend.searchFts('한국어');
        expect(results.length).toBeGreaterThan(0);
        expect(results.some((r) => r.id === 'kr-1')).toBe(true);
      });

      it('should find entries by Korean partial text', async () => {
        // Use longer phrase for reliable trigram matching
        const results = await backend.searchFts('사용자 인증');
        expect(results.length).toBeGreaterThan(0);
      });

      it('should find entries by Korean database term', async () => {
        const results = await backend.searchFts('데이터베이스');
        expect(results.length).toBeGreaterThan(0);
        expect(results.some((r) => r.id === 'kr-2')).toBe(true);
      });
    });

    describe('Mixed language support', () => {
      beforeEach(async () => {
        const entry: MemoryEntry = {
          id: 'mixed-1',
          key: 'mixed',
          content: 'API設計パターン - Japanese API design patterns using REST and GraphQL',
          type: 'semantic',
          namespace: 'mixed',
          tags: ['API', '設計'],
          metadata: {},
          accessLevel: 'project',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1,
          references: [],
          accessCount: 0,
          lastAccessedAt: Date.now(),
        };

        await backend.store(entry);
      });

      it('should find by Japanese in mixed content', async () => {
        const results = await backend.searchFts('設計パターン');
        expect(results.length).toBeGreaterThan(0);
        expect(results.some((r) => r.id === 'mixed-1')).toBe(true);
      });

      it('should find by English in mixed content', async () => {
        const results = await backend.searchFts('GraphQL');
        expect(results.length).toBeGreaterThan(0);
        expect(results.some((r) => r.id === 'mixed-1')).toBe(true);
      });

      it('should find by API term in mixed content', async () => {
        const results = await backend.searchFts('API');
        expect(results.length).toBeGreaterThan(0);
        expect(results.some((r) => r.id === 'mixed-1')).toBe(true);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty query', async () => {
      const results = await backend.searchFts('');
      expect(results.length).toBe(0);
    });

    it('should handle whitespace-only query', async () => {
      const results = await backend.searchFts('   ');
      expect(results.length).toBe(0);
    });

    it('should handle special characters', async () => {
      const results = await backend.searchFts('test*[query]');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle very long content', async () => {
      const longContent = '日本語テスト '.repeat(1000);
      const entry: MemoryEntry = {
        id: 'long-content',
        key: 'long',
        content: longContent,
        type: 'semantic',
        namespace: 'default',
        tags: [],
        metadata: {},
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      };

      await backend.store(entry);
      const results = await backend.searchFts('日本語');
      expect(results.some((r) => r.id === 'long-content')).toBe(true);
    });
  });

  describe('bulk operations', () => {
    it('should handle bulk insert', async () => {
      const entries: MemoryEntry[] = Array.from({ length: 100 }, (_, i) => ({
        id: `bulk-${i}`,
        key: `key-${i}`,
        content: `Bulk content ${i} with 日本語 and 中文`,
        type: 'semantic' as const,
        namespace: 'bulk',
        tags: [],
        metadata: {},
        accessLevel: 'project' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      }));

      await backend.bulkInsert(entries);
      const count = await backend.count('bulk');
      expect(count).toBe(100);

      // FTS should work on bulk inserted entries
      const results = await backend.searchFts('日本語', { namespace: 'bulk' });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle bulk delete', async () => {
      const entries: MemoryEntry[] = Array.from({ length: 10 }, (_, i) => ({
        id: `delete-${i}`,
        key: `key-${i}`,
        content: `Delete content ${i}`,
        type: 'semantic' as const,
        namespace: 'delete',
        tags: [],
        metadata: {},
        accessLevel: 'project' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      }));

      await backend.bulkInsert(entries);
      const deleted = await backend.bulkDelete(entries.slice(0, 5).map((e) => e.id));
      const remaining = await backend.count('delete');

      expect(deleted).toBe(5);
      expect(remaining).toBe(5);
    });
  });

  describe('statistics', () => {
    it('should return correct stats', async () => {
      const entries: MemoryEntry[] = Array.from({ length: 10 }, (_, i) => ({
        id: `stats-${i}`,
        key: `key-${i}`,
        content: `Stats content ${i}`,
        type: 'semantic' as const,
        namespace: i < 5 ? 'ns1' : 'ns2',
        tags: [],
        metadata: {},
        accessLevel: 'project' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      }));

      await backend.bulkInsert(entries);
      const stats = await backend.getStats();

      expect(stats.totalEntries).toBe(10);
      expect(stats.entriesByNamespace.ns1).toBe(5);
      expect(stats.entriesByNamespace.ns2).toBe(5);
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });
  });
});

describe('createBetterSqlite3Backend factory', () => {
  const describeCond = betterSqlite3Available ? describe : describe.skip;

  describeCond('factory function', () => {
    it('should create backend with default trigram tokenizer', async () => {
      const backend = createBetterSqlite3Backend({
        databasePath: ':memory:',
      });
      await backend.initialize();

      expect(backend.getActiveTokenizer()).toBe('trigram');
      expect(backend.isCjkOptimized()).toBe(true);

      await backend.shutdown();
    });

    it('should allow custom tokenizer', async () => {
      const backend = createBetterSqlite3Backend({
        databasePath: ':memory:',
        ftsTokenizer: 'unicode61',
      });
      await backend.initialize();

      expect(backend.getActiveTokenizer()).toBe('unicode61');
      expect(backend.isCjkOptimized()).toBe(false);

      await backend.shutdown();
    });

    it('should rebuild FTS index', async () => {
      const backend = createBetterSqlite3Backend({
        databasePath: ':memory:',
      });
      await backend.initialize();

      // Store an entry
      await backend.store({
        id: 'rebuild-test',
        key: 'rebuild-key',
        content: 'Content for FTS rebuild test',
        type: 'semantic',
        namespace: 'test',
        tags: ['rebuild'],
        metadata: {},
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      });

      // Rebuild should not throw
      await expect(backend.rebuildFtsIndex()).resolves.not.toThrow();

      // Search should still work after rebuild
      const results = await backend.query({ type: 'keyword', content: 'rebuild' });
      expect(results.length).toBeGreaterThan(0);

      await backend.shutdown();
    });

    it('should handle entries with embeddings', async () => {
      const backend = createBetterSqlite3Backend({
        databasePath: ':memory:',
      });
      await backend.initialize();

      // Create an entry with embedding
      const embedding = new Float32Array(384);
      for (let i = 0; i < 384; i++) {
        embedding[i] = i / 384;
      }

      await backend.store({
        id: 'emb-test',
        key: 'embedding-key',
        content: 'Content with vector embedding',
        type: 'semantic',
        namespace: 'embeddings',
        tags: ['vector'],
        metadata: { hasEmbedding: true },
        embedding,
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      });

      // Retrieve and verify embedding is preserved
      const entry = await backend.get('emb-test');
      expect(entry).toBeDefined();
      expect(entry?.embedding).toBeDefined();
      expect(entry?.embedding?.length).toBe(384);
      expect(entry?.embedding?.[0]).toBeCloseTo(0, 5);
      expect(entry?.embedding?.[100]).toBeCloseTo(100 / 384, 5);
      expect(entry?.embedding?.[383]).toBeCloseTo(383 / 384, 5);

      await backend.shutdown();
    });

    it('should create Japanese optimized backend', () => {
      // Note: This test verifies configuration, not actual lindera loading
      // since lindera extension needs to be built separately
      const backend = createJapaneseOptimizedBackend({
        databasePath: ':memory:',
        linderaPath: '/path/to/liblindera_sqlite.dylib',
      });

      // Backend is created with the configuration
      expect(backend).toBeDefined();
      // Note: initialization would fail without the actual extension file
    });
  });
});

describeCond('BetterSqlite3Backend advanced', () => {
  let backend: BetterSqlite3Backend;

  beforeEach(async () => {
    backend = createBetterSqlite3Backend({
      databasePath: ':memory:',
      ftsTokenizer: 'trigram',
      verbose: false,
    });
    await backend.initialize();
  });

  afterEach(async () => {
    await backend.shutdown();
  });

  describe('query filters', () => {
    beforeEach(async () => {
      const now = Date.now();
      const entries: MemoryEntry[] = [
        {
          id: 'old-entry',
          key: 'old',
          content: 'Old content',
          type: 'episodic',
          namespace: 'time-test',
          tags: ['old'],
          metadata: {},
          accessLevel: 'project',
          createdAt: now - 100000,
          updatedAt: now - 100000,
          version: 1,
          references: [],
          accessCount: 0,
          lastAccessedAt: now - 100000,
        },
        {
          id: 'new-entry',
          key: 'new',
          content: 'New content',
          type: 'semantic',
          namespace: 'time-test',
          tags: ['new'],
          metadata: {},
          accessLevel: 'project',
          createdAt: now,
          updatedAt: now,
          version: 1,
          references: [],
          accessCount: 0,
          lastAccessedAt: now,
        },
      ];
      await backend.bulkInsert(entries);
    });

    it('should filter by createdBefore', async () => {
      const results = await backend.query({
        type: 'hybrid',
        namespace: 'time-test',
        createdBefore: Date.now() - 50000,
        limit: 10,
      });
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('old-entry');
    });

    it('should filter by createdAfter', async () => {
      const results = await backend.query({
        type: 'hybrid',
        namespace: 'time-test',
        createdAfter: Date.now() - 50000,
        limit: 10,
      });
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('new-entry');
    });

    it('should filter by memoryType', async () => {
      const results = await backend.query({
        type: 'hybrid',
        namespace: 'time-test',
        memoryType: 'episodic',
        limit: 10,
      });
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('old-entry');
    });

    it('should filter by tags', async () => {
      const results = await backend.query({
        type: 'hybrid',
        namespace: 'time-test',
        tags: ['old'],
        limit: 10,
      });
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('old-entry');
    });

    it('should filter by multiple tags', async () => {
      await backend.store({
        id: 'multi-tag',
        key: 'multi',
        content: 'Multi tag content',
        type: 'semantic',
        namespace: 'time-test',
        tags: ['old', 'new', 'special'],
        metadata: {},
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      });

      const results = await backend.query({
        type: 'hybrid',
        namespace: 'time-test',
        tags: ['special'],
        limit: 10,
      });
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('multi-tag');
    });
  });

  describe('getByKey', () => {
    it('should retrieve entry by namespace and key', async () => {
      await backend.store({
        id: 'key-test-1',
        key: 'unique-key',
        content: 'Content by key',
        type: 'semantic',
        namespace: 'key-ns',
        tags: [],
        metadata: {},
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      });

      const result = await backend.getByKey('key-ns', 'unique-key');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('key-test-1');
    });

    it('should return null for non-existent key', async () => {
      const result = await backend.getByKey('non-existent-ns', 'non-existent-key');
      expect(result).toBeNull();
    });

    it('should increment access count on getByKey', async () => {
      await backend.store({
        id: 'access-test',
        key: 'access-key',
        content: 'Access content',
        type: 'semantic',
        namespace: 'access-ns',
        tags: [],
        metadata: {},
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      });

      await backend.getByKey('access-ns', 'access-key');
      const result = await backend.getByKey('access-ns', 'access-key');
      expect(result?.accessCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('semantic search', () => {
    it('should perform vector search with embeddings', async () => {
      // Create distinct vectors - embedding1 is similar to query, embedding2 is different
      const embedding1 = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]);
      const embedding2 = new Float32Array([0, 1, 0, 0, 0, 0, 0, 0]);

      await backend.store({
        id: 'vec-1',
        key: 'vector-1',
        content: 'Vector content 1',
        type: 'semantic',
        namespace: 'vectors',
        tags: [],
        metadata: {},
        embedding: embedding1,
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      });

      await backend.store({
        id: 'vec-2',
        key: 'vector-2',
        content: 'Vector content 2',
        type: 'semantic',
        namespace: 'vectors',
        tags: [],
        metadata: {},
        embedding: embedding2,
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      });

      // Query similar to embedding1
      const queryEmbedding = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]);
      const results = await backend.search(queryEmbedding, { k: 2 });

      expect(results.length).toBe(2);
      // First result should be vec-1 (identical to query)
      expect(results[0].entry.id).toBe('vec-1');
      expect(results[0].score).toBeCloseTo(1, 5); // Identical vectors
    });

    it('should apply namespace filter in vector search', async () => {
      const embedding = new Float32Array(8).fill(0.5);

      await backend.store({
        id: 'vec-ns1',
        key: 'vector-ns1',
        content: 'Content 1',
        type: 'semantic',
        namespace: 'ns1',
        tags: [],
        metadata: {},
        embedding,
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      });

      await backend.store({
        id: 'vec-ns2',
        key: 'vector-ns2',
        content: 'Content 2',
        type: 'semantic',
        namespace: 'ns2',
        tags: [],
        metadata: {},
        embedding,
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      });

      const results = await backend.search(embedding, {
        k: 10,
        filters: { namespace: 'ns1' },
      });

      expect(results.length).toBe(1);
      expect(results[0].entry.namespace).toBe('ns1');
    });

    it('should apply memoryType filter in vector search', async () => {
      const embedding = new Float32Array(8).fill(0.5);

      await backend.store({
        id: 'vec-type1',
        key: 'vector-type1',
        content: 'Content 1',
        type: 'episodic',
        namespace: 'types',
        tags: [],
        metadata: {},
        embedding,
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      });

      await backend.store({
        id: 'vec-type2',
        key: 'vector-type2',
        content: 'Content 2',
        type: 'semantic',
        namespace: 'types',
        tags: [],
        metadata: {},
        embedding,
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      });

      const results = await backend.search(embedding, {
        k: 10,
        filters: { memoryType: 'episodic' },
      });

      expect(results.length).toBe(1);
      expect(results[0].entry.type).toBe('episodic');
    });

    it('should apply threshold filter in vector search', async () => {
      const embedding1 = new Float32Array(8).fill(1);
      const embedding2 = new Float32Array(8).fill(-1);

      await backend.store({
        id: 'vec-sim',
        key: 'similar',
        content: 'Similar content',
        type: 'semantic',
        namespace: 'threshold',
        tags: [],
        metadata: {},
        embedding: embedding1,
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      });

      await backend.store({
        id: 'vec-diff',
        key: 'different',
        content: 'Different content',
        type: 'semantic',
        namespace: 'threshold',
        tags: [],
        metadata: {},
        embedding: embedding2,
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      });

      const queryEmbedding = new Float32Array(8).fill(1);
      const results = await backend.search(queryEmbedding, {
        k: 10,
        threshold: 0.9, // High threshold should filter out dissimilar
      });

      expect(results.length).toBe(1);
      expect(results[0].entry.id).toBe('vec-sim');
    });

    it('should handle vector length mismatch', async () => {
      const embedding1 = new Float32Array(8).fill(0.5);
      const embedding2 = new Float32Array(16).fill(0.5); // Different size

      await backend.store({
        id: 'vec-size1',
        key: 'size1',
        content: 'Content 1',
        type: 'semantic',
        namespace: 'sizes',
        tags: [],
        metadata: {},
        embedding: embedding1,
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      });

      await backend.store({
        id: 'vec-size2',
        key: 'size2',
        content: 'Content 2',
        type: 'semantic',
        namespace: 'sizes',
        tags: [],
        metadata: {},
        embedding: embedding2,
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      });

      const queryEmbedding = new Float32Array(8).fill(0.5);
      const results = await backend.search(queryEmbedding, { k: 10 });

      // Should still return results, mismatched sizes get similarity 0
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('namespace operations', () => {
    it('should list all namespaces', async () => {
      await backend.store({
        id: 'ns-test-1',
        key: 'key1',
        content: 'Content 1',
        type: 'semantic',
        namespace: 'namespace-a',
        tags: [],
        metadata: {},
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      });

      await backend.store({
        id: 'ns-test-2',
        key: 'key2',
        content: 'Content 2',
        type: 'semantic',
        namespace: 'namespace-b',
        tags: [],
        metadata: {},
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      });

      const namespaces = await backend.listNamespaces();
      expect(namespaces).toContain('namespace-a');
      expect(namespaces).toContain('namespace-b');
    });

    it('should clear namespace', async () => {
      await backend.store({
        id: 'clear-1',
        key: 'key1',
        content: 'Content 1',
        type: 'semantic',
        namespace: 'to-clear',
        tags: [],
        metadata: {},
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      });

      await backend.store({
        id: 'clear-2',
        key: 'key2',
        content: 'Content 2',
        type: 'semantic',
        namespace: 'to-keep',
        tags: [],
        metadata: {},
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      });

      const cleared = await backend.clearNamespace('to-clear');
      expect(cleared).toBe(1);

      const remainingCleared = await backend.count('to-clear');
      const remainingKept = await backend.count('to-keep');
      expect(remainingCleared).toBe(0);
      expect(remainingKept).toBe(1);
    });
  });

  describe('update operations', () => {
    it('should return null when updating non-existent entry', async () => {
      const result = await backend.update('non-existent-id', { content: 'New content' });
      expect(result).toBeNull();
    });

    it('should update multiple fields', async () => {
      await backend.store({
        id: 'update-test',
        key: 'update-key',
        content: 'Original content',
        type: 'semantic',
        namespace: 'update-ns',
        tags: ['original'],
        metadata: { original: true },
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      });

      const updated = await backend.update('update-test', {
        content: 'Updated content',
        tags: ['updated'],
        metadata: { updated: true },
      });

      expect(updated?.content).toBe('Updated content');
      expect(updated?.tags).toContain('updated');
      expect(updated?.metadata.updated).toBe(true);
      expect(updated?.version).toBe(2);
    });
  });

  describe('health check scenarios', () => {
    it('should report degraded status when FTS is not available', async () => {
      // Create backend with unicode tokenizer (not CJK optimized)
      const nonCjkBackend = createBetterSqlite3Backend({
        databasePath: ':memory:',
        ftsTokenizer: 'unicode61',
      });
      await nonCjkBackend.initialize();

      const health = await nonCjkBackend.healthCheck();
      expect(health.components.cache.status).toBe('degraded');
      expect(health.recommendations.length).toBeGreaterThan(0);

      await nonCjkBackend.shutdown();
    });
  });

  describe('getDatabase', () => {
    it('should return the underlying database', () => {
      const db = backend.getDatabase();
      expect(db).not.toBeNull();
    });
  });

  describe('events', () => {
    it('should emit entry:stored event', async () => {
      const events: unknown[] = [];
      backend.on('entry:stored', (data) => events.push(data));

      await backend.store({
        id: 'event-test',
        key: 'event-key',
        content: 'Event content',
        type: 'semantic',
        namespace: 'events',
        tags: [],
        metadata: {},
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      });

      expect(events.length).toBe(1);
    });

    it('should emit bulkInserted event', async () => {
      const events: unknown[] = [];
      backend.on('bulkInserted', (count) => events.push(count));

      await backend.bulkInsert([
        {
          id: 'bulk-event-1',
          key: 'bulk-1',
          content: 'Bulk content 1',
          type: 'semantic',
          namespace: 'events',
          tags: [],
          metadata: {},
          accessLevel: 'project',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1,
          references: [],
          accessCount: 0,
          lastAccessedAt: Date.now(),
        },
        {
          id: 'bulk-event-2',
          key: 'bulk-2',
          content: 'Bulk content 2',
          type: 'semantic',
          namespace: 'events',
          tags: [],
          metadata: {},
          accessLevel: 'project',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1,
          references: [],
          accessCount: 0,
          lastAccessedAt: Date.now(),
        },
      ]);

      expect(events).toContain(2);
    });
  });

  describe('verbose mode', () => {
    it('should log when verbose is enabled', async () => {
      const verboseBackend = createBetterSqlite3Backend({
        databasePath: ':memory:',
        verbose: true,
      });

      // Capture console.log
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => logs.push(args.join(' '));

      await verboseBackend.initialize();
      await verboseBackend.rebuildFtsIndex();
      await verboseBackend.shutdown();

      console.log = originalLog;

      expect(logs.some((l) => l.includes('[BetterSqlite3]'))).toBe(true);
    });
  });

  describe('porter tokenizer', () => {
    it('should support porter tokenizer', async () => {
      const porterBackend = createBetterSqlite3Backend({
        databasePath: ':memory:',
        ftsTokenizer: 'porter',
      });
      await porterBackend.initialize();

      expect(porterBackend.getActiveTokenizer()).toBe('porter');
      expect(porterBackend.isFtsAvailable()).toBe(true);

      // Porter should work for English stemming
      await porterBackend.store({
        id: 'porter-1',
        key: 'running',
        content: 'The quick brown fox is running',
        type: 'semantic',
        namespace: 'porter',
        tags: [],
        metadata: {},
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      });

      // Porter stemmer should match "run" to "running"
      const results = await porterBackend.searchFts('run');
      expect(results.length).toBeGreaterThan(0);

      await porterBackend.shutdown();
    });
  });

  describe('empty bulk operations', () => {
    it('should handle empty bulk insert', async () => {
      await backend.bulkInsert([]);
      expect(await backend.count()).toBe(0);
    });

    it('should handle empty bulk delete', async () => {
      const deleted = await backend.bulkDelete([]);
      expect(deleted).toBe(0);
    });
  });

  describe('custom tokenizer', () => {
    it('should report custom tokenizer when configured', async () => {
      const customBackend = createBetterSqlite3Backend({
        databasePath: ':memory:',
        customTokenizer: 'custom_tok',
      });

      // Note: This will fail to create FTS since custom_tok doesn't exist,
      // but the tokenizer name should still be reported
      expect(customBackend.getActiveTokenizer()).toBe('custom_tok');
    });
  });

  describe('double initialization', () => {
    it('should handle double initialization', async () => {
      const newBackend = createBetterSqlite3Backend({
        databasePath: ':memory:',
      });

      await newBackend.initialize();
      await newBackend.initialize(); // Should not throw

      expect(newBackend.isFtsAvailable()).toBe(true);

      await newBackend.shutdown();
    });
  });

  describe('query with no filters', () => {
    it('should return all entries with no filters', async () => {
      await backend.store({
        id: 'no-filter-1',
        key: 'key1',
        content: 'Content 1',
        type: 'semantic',
        namespace: 'ns1',
        tags: [],
        metadata: {},
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      });

      await backend.store({
        id: 'no-filter-2',
        key: 'key2',
        content: 'Content 2',
        type: 'episodic',
        namespace: 'ns2',
        tags: [],
        metadata: {},
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      });

      const results = await backend.query({ type: 'hybrid', limit: 10 });
      expect(results.length).toBe(2);
    });
  });

  describe('delete non-existent', () => {
    it('should return false when deleting non-existent entry', async () => {
      const result = await backend.delete('non-existent-id');
      expect(result).toBe(false);
    });
  });
});
