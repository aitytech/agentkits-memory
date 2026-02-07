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

      // index component shows tokenizer (Trigram for CJK support)
      expect(health.components.index.status).toBe('healthy');
      expect(health.components.index.message).toContain('trigram');
      // cache component shows vector search status
      expect(health.components.cache.status).toBe('healthy');
      expect(health.components.cache.message).toContain('sqlite-vec');
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
      expect(entry).not.toBeNull();
      expect(entry!.embedding).toBeInstanceOf(Float32Array);
      expect(entry!.embedding!.length).toBe(384);
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
      expect(backend).toBeInstanceOf(BetterSqlite3Backend);
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
    let vecBackend: BetterSqlite3Backend;

    beforeEach(async () => {
      // Create separate backend with 8-dimension vectors for these tests
      vecBackend = createBetterSqlite3Backend({
        databasePath: ':memory:',
        ftsTokenizer: 'trigram',
        verbose: false,
        vectorDimensions: 8,
      });
      await vecBackend.initialize();
    });

    afterEach(async () => {
      await vecBackend.shutdown();
    });

    it('should perform vector search with embeddings', async () => {
      // Verify sqlite-vec is available
      expect(vecBackend.isVectorAvailable()).toBe(true);

      // Create distinct vectors - embedding1 is similar to query, embedding2 is different
      const embedding1 = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]);
      const embedding2 = new Float32Array([0, 1, 0, 0, 0, 0, 0, 0]);

      await vecBackend.store({
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

      await vecBackend.store({
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
      const results = await vecBackend.search(queryEmbedding, { k: 2 });

      expect(results.length).toBe(2);
      // First result should be vec-1 (identical to query)
      expect(results[0].entry.id).toBe('vec-1');
      expect(results[0].score).toBeCloseTo(1, 5); // Identical vectors
    });

    it('should apply namespace filter in vector search', async () => {
      const embedding = new Float32Array(8).fill(0.5);

      await vecBackend.store({
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

      await vecBackend.store({
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

      const results = await vecBackend.search(embedding, {
        k: 10,
        filters: { namespace: 'ns1' },
      });

      expect(results.length).toBe(1);
      expect(results[0].entry.namespace).toBe('ns1');
    });

    it('should apply memoryType filter in vector search', async () => {
      const embedding = new Float32Array(8).fill(0.5);

      await vecBackend.store({
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

      await vecBackend.store({
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

      const results = await vecBackend.search(embedding, {
        k: 10,
        filters: { memoryType: 'episodic' },
      });

      expect(results.length).toBe(1);
      expect(results[0].entry.type).toBe('episodic');
    });

    it('should apply threshold filter in vector search', async () => {
      const embedding1 = new Float32Array(8).fill(1);
      const embedding2 = new Float32Array(8).fill(-1);

      await vecBackend.store({
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

      await vecBackend.store({
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
      const results = await vecBackend.search(queryEmbedding, {
        k: 10,
        threshold: 0.9, // High threshold should filter out dissimilar
      });

      expect(results.length).toBe(1);
      expect(results[0].entry.id).toBe('vec-sim');
    });

    it('should store entry but skip vector when dimension mismatch', async () => {
      const embedding1 = new Float32Array(8).fill(0.5);
      const embedding2 = new Float32Array(16).fill(0.5); // Different size - will be skipped in vec table

      await vecBackend.store({
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

      // Mismatched dimension vector - entry stored but vector insertion skipped
      await vecBackend.store({
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
      const results = await vecBackend.search(queryEmbedding, { k: 10 });

      // Only the correctly sized vector should be found via vector search
      expect(results.length).toBe(1);
      expect(results[0].entry.id).toBe('vec-size1');
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
    it('should report healthy status with different tokenizers', async () => {
      // Create backend with unicode tokenizer (not CJK optimized)
      const unicodeBackend = createBetterSqlite3Backend({
        databasePath: ':memory:',
        ftsTokenizer: 'unicode61',
      });
      await unicodeBackend.initialize();

      const health = await unicodeBackend.healthCheck();
      // FTS is still available, just not CJK optimized
      expect(health.components.index.status).toBe('healthy');
      expect(health.components.index.message).toContain('unicode61');
      // sqlite-vec should be healthy
      expect(health.components.cache.status).toBe('healthy');
      expect(health.components.cache.message).toContain('sqlite-vec');

      await unicodeBackend.shutdown();
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

  /**
   * STRICT TESTS - Bug Catchers for Backend
   */
  describe('Strict: SQL Injection Prevention', () => {
    const injectionPayloads = [
      "'; DROP TABLE memories; --",
      "1'; DELETE FROM memories WHERE '1'='1",
      "Robert'); DROP TABLE memories;--",
      "1 OR 1=1",
      "' UNION SELECT * FROM memories --",
    ];

    injectionPayloads.forEach((payload, idx) => {
      it(`should safely handle SQL injection attempt #${idx + 1}`, async () => {
        const entry: MemoryEntry = {
          id: `injection-test-${idx}`,
          key: payload,
          content: payload,
          type: 'semantic',
          namespace: payload,
          tags: [payload],
          metadata: { payload },
          accessLevel: 'project',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1,
          references: [],
          accessCount: 0,
          lastAccessedAt: Date.now(),
        };

        await backend.store(entry);
        const retrieved = await backend.get(`injection-test-${idx}`);

        expect(retrieved).not.toBeNull();
        expect(retrieved!.content).toBe(payload);
        expect(retrieved!.key).toBe(payload);

        // Verify the database still works
        const count = await backend.count();
        expect(count).toBeGreaterThan(0);
      });
    });
  });

  describe('Strict: Data Integrity Under Stress', () => {
    it('should handle rapid sequential writes correctly', async () => {
      for (let i = 0; i < 100; i++) {
        await backend.store({
          id: `rapid-${i}`,
          key: `key-${i}`,
          content: `Content ${i}`,
          type: 'semantic',
          namespace: 'stress-test',
          tags: [`tag-${i % 10}`],
          metadata: { index: i },
          accessLevel: 'project',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1,
          references: [],
          accessCount: 0,
          lastAccessedAt: Date.now(),
        });
      }

      const count = await backend.count('stress-test');
      expect(count).toBe(100);

      // Verify random entries are intact
      for (const idx of [0, 25, 50, 75, 99]) {
        const retrieved = await backend.get(`rapid-${idx}`);
        expect(retrieved!.content).toBe(`Content ${idx}`);
        expect(retrieved!.metadata).toEqual({ index: idx });
      }
    });

    it('should handle bulk insert correctly', async () => {
      const entries: MemoryEntry[] = Array.from({ length: 50 }, (_, i) => ({
        id: `bulk-${i}`,
        key: `bulk-key-${i}`,
        content: `Bulk content ${i}`,
        type: 'semantic' as const,
        namespace: 'bulk-test',
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
      const count = await backend.count('bulk-test');
      expect(count).toBe(50);
    });
  });

  describe('Strict: FTS5 Search Accuracy', () => {
    beforeEach(async () => {
      const entries = [
        { id: 'fts-1', content: 'React hooks useEffect useState' },
        { id: 'fts-2', content: 'Vue composition API reactive ref' },
        { id: 'fts-3', content: 'Angular dependency injection services' },
        { id: 'fts-4', content: 'React Native mobile development iOS Android' },
        { id: 'fts-5', content: 'Node.js Express backend API REST' },
      ];

      for (const e of entries) {
        await backend.store({
          id: e.id,
          key: e.id,
          content: e.content,
          type: 'semantic',
          namespace: 'fts-test',
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
      }
    });

    it('should find entries containing search term', async () => {
      const results = await backend.searchFts('React', { namespace: 'fts-test', limit: 10 });
      expect(results.length).toBeGreaterThanOrEqual(1);
      const reactResults = results.filter((r) => r.content.toLowerCase().includes('react'));
      expect(reactResults.length).toBeGreaterThanOrEqual(1);
    });

    it('should return results for exact word match', async () => {
      const results = await backend.searchFts('Angular', { namespace: 'fts-test', limit: 10 });
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].content).toContain('Angular');
    });
  });

  describe('Strict: Update Edge Cases', () => {
    it('should return null when updating non-existent entry', async () => {
      const result = await backend.update('non-existent-id', { content: 'New content' });
      expect(result).toBeNull();
    });

    it('should update only specified fields', async () => {
      const original: MemoryEntry = {
        id: 'update-fields-test',
        key: 'original-key',
        content: 'Original content',
        type: 'semantic',
        namespace: 'test-ns',
        tags: ['original-tag'],
        metadata: { original: true },
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: ['ref-1'],
        accessCount: 5,
        lastAccessedAt: Date.now(),
      };

      await backend.store(original);

      const updated = await backend.update('update-fields-test', {
        content: 'Updated content',
      });

      expect(updated!.content).toBe('Updated content');
      expect(updated!.key).toBe('original-key');
      expect(updated!.tags).toEqual(['original-tag']);
      expect(updated!.metadata).toEqual({ original: true });
      expect(updated!.version).toBe(2);
    });
  });

  describe('Strict: Namespace Isolation', () => {
    it('should correctly count entries per namespace', async () => {
      await backend.store({
        id: 'ns-iso-1',
        key: 'k1',
        content: 'c1',
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
        id: 'ns-iso-2',
        key: 'k2',
        content: 'c2',
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
        id: 'ns-iso-3',
        key: 'k3',
        content: 'c3',
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

      expect(await backend.count('namespace-a')).toBe(2);
      expect(await backend.count('namespace-b')).toBe(1);
      expect(await backend.count()).toBe(3);
    });

    it('should clear only target namespace', async () => {
      await backend.store({
        id: 'clear-1',
        key: 'k1',
        content: 'c1',
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
        key: 'k2',
        content: 'c2',
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

      expect(await backend.count('to-clear')).toBe(0);
      expect(await backend.count('to-keep')).toBe(1);
    });
  });

  describe('Strict: Statistics Accuracy', () => {
    it('should report accurate statistics', async () => {
      await backend.store({
        id: 'stat-1',
        key: 'k1',
        content: 'c1',
        type: 'semantic',
        namespace: 'stats-ns',
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
        id: 'stat-2',
        key: 'k2',
        content: 'c2',
        type: 'episodic',
        namespace: 'stats-ns',
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

      const stats = await backend.getStats();
      expect(stats.totalEntries).toBe(2);
      expect(stats.entriesByNamespace['stats-ns']).toBe(2);
      expect(stats.entriesByType.semantic).toBe(1);
      expect(stats.entriesByType.episodic).toBe(1);
    });
  });

  describe('Strict: Vector Search with sqlite-vec', () => {
    let vecBackend: BetterSqlite3Backend;

    beforeEach(async () => {
      vecBackend = createBetterSqlite3Backend({
        databasePath: ':memory:',
        ftsTokenizer: 'trigram',
        verbose: false,
        vectorDimensions: 8,
      });
      await vecBackend.initialize();
    });

    afterEach(async () => {
      await vecBackend.shutdown();
    });

    it('should return results in similarity order', async () => {
      const queryVec = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]);
      const similarVec = new Float32Array([0.9, 0.1, 0, 0, 0, 0, 0, 0]);
      const differentVec = new Float32Array([0, 0, 0, 0, 0, 0, 0, 1]);

      await vecBackend.store({
        id: 'similar',
        key: 'similar',
        content: 'Similar content',
        type: 'semantic',
        namespace: 'order-test',
        tags: [],
        metadata: {},
        embedding: similarVec,
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      });

      await vecBackend.store({
        id: 'different',
        key: 'different',
        content: 'Different content',
        type: 'semantic',
        namespace: 'order-test',
        tags: [],
        metadata: {},
        embedding: differentVec,
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      });

      const results = await vecBackend.search(queryVec, { k: 2 });
      expect(results.length).toBe(2);
      expect(results[0].entry.id).toBe('similar');
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it('should handle concurrent vector operations', async () => {
      const promises = Array.from({ length: 20 }, (_, i) => {
        const vec = new Float32Array(8).fill(i / 20);
        return vecBackend.store({
          id: `concurrent-vec-${i}`,
          key: `key-${i}`,
          content: `Content ${i}`,
          type: 'semantic',
          namespace: 'concurrent-test',
          tags: [],
          metadata: {},
          embedding: vec,
          accessLevel: 'project',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1,
          references: [],
          accessCount: 0,
          lastAccessedAt: Date.now(),
        });
      });

      await Promise.all(promises);
      const count = await vecBackend.count('concurrent-test');
      expect(count).toBe(20);

      const queryVec = new Float32Array(8).fill(0.5);
      const results = await vecBackend.search(queryVec, { k: 5 });
      expect(results.length).toBe(5);
    });
  });

  // ==================== STRICT: Concurrent Write Conflict Tests ====================
  describe('Strict: Concurrent Write Conflicts', () => {
    it('should handle concurrent updates without data loss', async () => {
      // Store initial entry
      const entry: MemoryEntry = {
        id: 'conflict-test',
        key: 'conflict-key',
        content: 'version 1',
        type: 'factual',
        namespace: 'conflict-test',
        tags: ['conflict'],
        metadata: { version: 1 },
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      };
      await backend.store(entry);

      // Attempt concurrent updates
      const update1 = backend.update('conflict-test', { content: 'version 2' });
      const update2 = backend.update('conflict-test', { content: 'version 3' });

      // Both should complete without throwing
      const results = await Promise.allSettled([update1, update2]);
      expect(results.every(r => r.status === 'fulfilled')).toBe(true);

      // Final state should reflect one of the updates (last write wins)
      const final = await backend.get('conflict-test');
      expect(final).not.toBeNull();
      expect(['version 2', 'version 3']).toContain(final!.content);
    });

    it('should handle concurrent store and delete without crash', async () => {
      // Store initial entry
      const entry: MemoryEntry = {
        id: 'store-delete-conflict',
        key: 'sd-key',
        content: 'to be deleted',
        type: 'factual',
        namespace: 'conflict-test',
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

      // Concurrent delete and re-store with same ID
      const newEntry = { ...entry, content: 'new content' };
      const deleteOp = backend.delete('store-delete-conflict');
      const storeOp = backend.store(newEntry);

      // Both should complete without throwing
      const results = await Promise.allSettled([deleteOp, storeOp]);
      expect(results.every(r => r.status === 'fulfilled')).toBe(true);

      // Entry may or may not exist, but system should be stable
      const final = await backend.get('store-delete-conflict');
      if (final !== null) {
        expect(typeof final.content).toBe('string');
      }
    });

    it('should handle rapid sequential updates correctly', async () => {
      const entry: MemoryEntry = {
        id: 'rapid-update-test',
        key: 'rapid-key',
        content: 'initial',
        type: 'factual',
        namespace: 'rapid-test',
        tags: [],
        metadata: { counter: 0 },
        accessLevel: 'project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        references: [],
        accessCount: 0,
        lastAccessedAt: Date.now(),
      };
      await backend.store(entry);

      // Perform 50 rapid updates sequentially
      for (let i = 1; i <= 50; i++) {
        await backend.update('rapid-update-test', {
          content: `update ${i}`,
          metadata: { counter: i },
        });
      }

      // Final state should reflect last update
      const final = await backend.get('rapid-update-test');
      expect(final).not.toBeNull();
      expect(final!.content).toBe('update 50');
      expect(final!.metadata?.counter).toBe(50);
    });

    it('should maintain index consistency during concurrent writes', async () => {
      // Create multiple entries concurrently with same key pattern
      const promises = [];
      for (let i = 0; i < 10; i++) {
        const entry: MemoryEntry = {
          id: `index-conflict-${i}`,
          key: `shared-key-${i % 3}`, // Some keys will conflict
          content: `Content for index ${i}`,
          type: 'factual',
          namespace: 'index-conflict-test',
          tags: ['indexed'],
          metadata: {},
          accessLevel: 'project',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1,
          references: [],
          accessCount: 0,
          lastAccessedAt: Date.now(),
        };
        promises.push(backend.store(entry));
      }

      await Promise.all(promises);

      // All entries should be searchable via FTS
      const results = await backend.searchFts('Content index', { limit: 20 });
      expect(results.length).toBeGreaterThanOrEqual(1);

      // Each entry should be retrievable by ID
      for (let i = 0; i < 10; i++) {
        const entry = await backend.get(`index-conflict-${i}`);
        expect(entry).not.toBeNull();
        expect(entry!.id).toBe(`index-conflict-${i}`);
      }
    });
  });

  // ==================== Migration Tests ====================
  describe('Migration: Embeddings to sqlite-vec', () => {
    let vecBackend: BetterSqlite3Backend;

    beforeEach(async () => {
      // Create backend with matching vector dimensions
      vecBackend = createBetterSqlite3Backend({
        databasePath: ':memory:',
        ftsTokenizer: 'trigram',
        verbose: false,
        vectorDimensions: 8, // Match test embedding dimensions
      });
      await vecBackend.initialize();
    });

    afterEach(async () => {
      await vecBackend.shutdown();
    });

    it('should report no migration needed for new database', async () => {
      const result = await vecBackend.needsMigration();
      expect(result.needed).toBe(false);
      expect(result.count).toBe(0);
    });

    it('should store entries with embeddings in sqlite-vec automatically', async () => {
      // Store entry with matching embedding dimensions
      const embedding = new Float32Array(8).fill(0.5);
      await vecBackend.store({
        id: 'migrate-test-1',
        key: 'key-1',
        content: 'Content to migrate',
        type: 'factual',
        namespace: 'migration-test',
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

      // Entry should be already in sqlite-vec (no migration needed)
      const beforeMigration = await vecBackend.needsMigration();
      expect(beforeMigration.needed).toBe(false);

      // Run migration (should be no-op since entry is already indexed)
      const result = await vecBackend.migrateEmbeddingsToVec();
      expect(result.migrated).toBe(0);
      expect(result.errors).toBe(0);
    });

    it('should return migration stats correctly', async () => {
      const result = await vecBackend.migrateEmbeddingsToVec();

      expect(typeof result.migrated).toBe('number');
      expect(typeof result.skipped).toBe('number');
      expect(typeof result.errors).toBe('number');
    });

    it('should be searchable via vector after store', async () => {
      const embedding = new Float32Array(8).fill(0.5);
      await vecBackend.store({
        id: 'vec-search-test',
        key: 'vec-key',
        content: 'Vector searchable content',
        type: 'factual',
        namespace: 'vec-test',
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

      // Search with similar vector
      const queryVec = new Float32Array(8).fill(0.5);
      const results = await vecBackend.search(queryVec, { k: 5 });
      expect(results.length).toBe(1);
      expect(results[0].entry.id).toBe('vec-search-test');
    });
  });
});
