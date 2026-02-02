/**
 * ProjectMemoryService Tests
 *
 * Tests for the high-level memory service.
 *
 * @module @agentkits/memory/__tests__/index.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import {
  ProjectMemoryService,
  createProjectMemory,
  DEFAULT_NAMESPACES,
  MemoryEntry,
  createDefaultEntry,
} from '../index.js';

describe('ProjectMemoryService', () => {
  let service: ProjectMemoryService;
  let testDir: string;

  beforeEach(async () => {
    // Create temp directory for tests
    testDir = path.join(tmpdir(), `memory-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    service = new ProjectMemoryService({
      baseDir: testDir,
      dbFilename: 'test.db',
      cacheEnabled: false,
      enableVectorIndex: false,
      autoPersistInterval: 0,
    });
    await service.initialize();
  });

  afterEach(async () => {
    await service.shutdown();
    // Cleanup temp directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const newService = new ProjectMemoryService({
        baseDir: path.join(testDir, 'init-test'),
        dbFilename: 'init.db',
      });

      await newService.initialize();
      const health = await newService.healthCheck();

      expect(health.status).toBe('healthy');
      await newService.shutdown();
    });

    it('should create directory if not exists', async () => {
      const newDir = path.join(testDir, 'new-dir');

      const newService = new ProjectMemoryService({
        baseDir: newDir,
        dbFilename: 'new.db',
      });

      await newService.initialize();
      expect(fs.existsSync(newDir)).toBe(true);

      await newService.shutdown();
    });

    it('should accept string as baseDir', async () => {
      const dir = path.join(testDir, 'string-dir');
      const newService = new ProjectMemoryService(dir);

      await newService.initialize();
      expect(fs.existsSync(dir)).toBe(true);

      await newService.shutdown();
    });
  });

  describe('Store and Retrieve', () => {
    it('should store entry via storeEntry convenience method', async () => {
      const entry = await service.storeEntry({
        key: 'test-key',
        content: 'Test content',
        namespace: 'test',
        tags: ['tag1'],
      });

      expect(entry.id).toBeDefined();
      expect(entry.key).toBe('test-key');
      expect(entry.content).toBe('Test content');
    });

    it('should get entry by id', async () => {
      const stored = await service.storeEntry({
        key: 'get-test',
        content: 'Content',
        namespace: 'test',
      });

      const retrieved = await service.get(stored.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(stored.id);
    });

    it('should get entry by namespace and key', async () => {
      await service.storeEntry({
        key: 'ns-key-test',
        content: 'Content',
        namespace: 'my-namespace',
      });

      const retrieved = await service.getByKey('my-namespace', 'ns-key-test');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.key).toBe('ns-key-test');
      expect(retrieved!.namespace).toBe('my-namespace');
    });

    it('should update entry', async () => {
      const stored = await service.storeEntry({
        key: 'update-test',
        content: 'Original',
        namespace: 'test',
      });

      const updated = await service.update(stored.id, { content: 'Updated' });

      expect(updated!.content).toBe('Updated');
    });

    it('should delete entry', async () => {
      const stored = await service.storeEntry({
        key: 'delete-test',
        content: 'To delete',
        namespace: 'test',
      });

      expect(await service.count()).toBe(1);

      const deleted = await service.delete(stored.id);
      expect(deleted).toBe(true);
      expect(await service.count()).toBe(0);
    });
  });

  describe('Query Operations', () => {
    beforeEach(async () => {
      await service.storeEntry({ key: 'p1', content: 'Pattern 1', namespace: 'patterns', tags: ['auth'] });
      await service.storeEntry({ key: 'p2', content: 'Pattern 2', namespace: 'patterns', tags: ['api'] });
      await service.storeEntry({ key: 'd1', content: 'Decision 1', namespace: 'decisions', tags: ['db'] });
    });

    it('should query all entries', async () => {
      const results = await service.query({ type: 'hybrid', limit: 10 });
      expect(results.length).toBe(3);
    });

    it('should query by namespace', async () => {
      const results = await service.query({ type: 'hybrid', namespace: 'patterns', limit: 10 });
      expect(results.length).toBe(2);
    });

    it('should use getByNamespace convenience method', async () => {
      const results = await service.getByNamespace('patterns');
      expect(results.length).toBe(2);
    });
  });

  describe('Get or Create', () => {
    it('should create entry if not exists', async () => {
      const entry = await service.getOrCreate('test-ns', 'new-key', () => ({
        key: 'new-key',
        content: 'New content',
        namespace: 'test-ns',
      }));

      expect(entry.content).toBe('New content');
    });

    it('should return existing entry if exists', async () => {
      await service.storeEntry({
        key: 'existing-key',
        content: 'Existing content',
        namespace: 'test-ns',
      });

      const entry = await service.getOrCreate('test-ns', 'existing-key', () => ({
        key: 'existing-key',
        content: 'New content',
        namespace: 'test-ns',
      }));

      expect(entry.content).toBe('Existing content');
    });
  });

  describe('Session Management', () => {
    it('should start session', async () => {
      const session = await service.startSession();

      expect(session.id).toBeDefined();
      expect(session.status).toBe('active');
      expect(session.startedAt).toBeDefined();
    });

    it('should get current session', async () => {
      expect(service.getCurrentSession()).toBeNull();

      await service.startSession();
      const current = service.getCurrentSession();

      expect(current).not.toBeNull();
      expect(current!.status).toBe('active');
    });

    it('should create checkpoint', async () => {
      await service.startSession();
      await service.checkpoint('Test checkpoint');

      const session = service.getCurrentSession();
      expect(session!.lastCheckpoint).toBe('Test checkpoint');
    });

    it('should throw error when checkpoint without session', async () => {
      await expect(service.checkpoint('Test')).rejects.toThrow('No active session');
    });

    it('should end session', async () => {
      await service.startSession();
      const ended = await service.endSession('Session summary');

      expect(ended).not.toBeNull();
      expect(ended!.status).toBe('completed');
      expect(ended!.summary).toBe('Session summary');
      expect(ended!.endedAt).toBeDefined();
    });

    it('should add session id to entries', async () => {
      const session = await service.startSession();

      const entry = await service.storeEntry({
        key: 'session-entry',
        content: 'Content',
        namespace: 'test',
      });

      expect(entry.sessionId).toBe(session.id);
    });

    it('should get recent sessions', async () => {
      await service.startSession();
      await service.endSession('Session 1');

      await service.startSession();
      await service.endSession('Session 2');

      const sessions = await service.getRecentSessions();
      expect(sessions.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Namespace Operations', () => {
    beforeEach(async () => {
      await service.storeEntry({ key: 'ns1-1', content: 'C1', namespace: 'ns1' });
      await service.storeEntry({ key: 'ns1-2', content: 'C2', namespace: 'ns1' });
      await service.storeEntry({ key: 'ns2-1', content: 'C3', namespace: 'ns2' });
    });

    it('should list namespaces', async () => {
      const namespaces = await service.listNamespaces();
      expect(namespaces).toContain('ns1');
      expect(namespaces).toContain('ns2');
    });

    it('should count by namespace', async () => {
      const count = await service.count('ns1');
      expect(count).toBe(2);
    });

    it('should clear namespace', async () => {
      const cleared = await service.clearNamespace('ns1');
      expect(cleared).toBe(2);
      expect(await service.count('ns1')).toBe(0);
      expect(await service.count('ns2')).toBe(1);
    });
  });

  describe('Bulk Operations', () => {
    it('should bulk insert entries', async () => {
      const entries = [
        createDefaultEntry({ key: 'b1', content: 'C1', namespace: 'bulk' }),
        createDefaultEntry({ key: 'b2', content: 'C2', namespace: 'bulk' }),
      ];

      await service.bulkInsert(entries);
      expect(await service.count('bulk')).toBe(2);
    });

    it('should bulk delete entries', async () => {
      const e1 = await service.storeEntry({ key: 'bd1', content: 'C1', namespace: 'bd' });
      const e2 = await service.storeEntry({ key: 'bd2', content: 'C2', namespace: 'bd' });

      const deleted = await service.bulkDelete([e1.id, e2.id]);
      expect(deleted).toBe(2);
      expect(await service.count('bd')).toBe(0);
    });
  });

  describe('Statistics and Health', () => {
    it('should get stats', async () => {
      await service.storeEntry({ key: 's1', content: 'C1', namespace: 'ns1' });
      await service.storeEntry({ key: 's2', content: 'C2', namespace: 'ns2' });

      const stats = await service.getStats();

      expect(stats.totalEntries).toBe(2);
      expect(stats.entriesByNamespace).toBeDefined();
    });

    it('should health check', async () => {
      const health = await service.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.components).toBeDefined();
    });
  });

  describe('Events', () => {
    it('should emit entry:stored event', async () => {
      const listener = vi.fn();
      service.on('entry:stored', listener);

      await service.storeEntry({ key: 'event-test', content: 'Content', namespace: 'test' });

      expect(listener).toHaveBeenCalled();
    });

    it('should emit session:started event', async () => {
      const listener = vi.fn();
      service.on('session:started', listener);

      await service.startSession();

      expect(listener).toHaveBeenCalled();
    });

    it('should emit session:ended event', async () => {
      const listener = vi.fn();
      service.on('session:ended', listener);

      await service.startSession();
      await service.endSession();

      expect(listener).toHaveBeenCalled();
    });
  });
});

describe('createProjectMemory factory', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(tmpdir(), `factory-test-${Date.now()}`);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should create memory service with defaults', async () => {
    const service = createProjectMemory(testDir);
    await service.initialize();

    expect(fs.existsSync(testDir)).toBe(true);

    await service.shutdown();
  });

  it('should accept options', async () => {
    const service = createProjectMemory(testDir, {
      cacheEnabled: false,
      verbose: true,
    });

    await service.initialize();
    await service.shutdown();
  });
});

describe('DEFAULT_NAMESPACES', () => {
  it('should have all required namespaces', () => {
    expect(DEFAULT_NAMESPACES.CONTEXT).toBe('context');
    expect(DEFAULT_NAMESPACES.ACTIVE).toBe('active-context');
    expect(DEFAULT_NAMESPACES.SESSION).toBe('session-state');
    expect(DEFAULT_NAMESPACES.PROGRESS).toBe('progress');
    expect(DEFAULT_NAMESPACES.PATTERNS).toBe('patterns');
    expect(DEFAULT_NAMESPACES.DECISIONS).toBe('decisions');
    expect(DEFAULT_NAMESPACES.ERRORS).toBe('errors');
  });
});

describe('ProjectMemoryService with embeddings', () => {
  let service: ProjectMemoryService;
  let testDir: string;
  const mockEmbeddingGenerator = vi.fn().mockImplementation(async (content: string) => {
    // Simple mock embedding based on content length
    const embedding = new Float32Array(8);
    for (let i = 0; i < 8; i++) {
      embedding[i] = (content.charCodeAt(i % content.length) / 255) - 0.5;
    }
    return embedding;
  });

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `embedding-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    service = new ProjectMemoryService({
      baseDir: testDir,
      dbFilename: 'test.db',
      cacheEnabled: true,
      enableVectorIndex: true,
      dimensions: 8,
      embeddingGenerator: mockEmbeddingGenerator,
    });
    await service.initialize();
  });

  afterEach(async () => {
    await service.shutdown();
    fs.rmSync(testDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('should generate embeddings when storing entries', async () => {
    await service.storeEntry({
      key: 'embed-test',
      content: 'Test content for embedding',
      namespace: 'test',
    });

    expect(mockEmbeddingGenerator).toHaveBeenCalledWith('Test content for embedding');
  });

  it('should perform semantic search', async () => {
    await service.storeEntry({
      key: 'auth-pattern',
      content: 'Use JWT for authentication',
      namespace: 'patterns',
    });

    await service.storeEntry({
      key: 'db-pattern',
      content: 'Use PostgreSQL for database',
      namespace: 'patterns',
    });

    const results = await service.semanticSearch('authentication', 5);
    expect(results.length).toBeGreaterThan(0);
  });

  it('should throw error for semantic search without embedding generator', async () => {
    const noEmbedService = new ProjectMemoryService({
      baseDir: path.join(testDir, 'no-embed'),
      dbFilename: 'test.db',
    });
    await noEmbedService.initialize();

    await expect(noEmbedService.semanticSearch('test', 5)).rejects.toThrow(
      'Embedding generator not configured'
    );

    await noEmbedService.shutdown();
  });

  it('should use HNSW index for search with vector index enabled', async () => {
    await service.storeEntry({
      key: 'v1',
      content: 'First vector content',
      namespace: 'vectors',
    });

    await service.storeEntry({
      key: 'v2',
      content: 'Second vector content',
      namespace: 'vectors',
    });

    const embedding = await mockEmbeddingGenerator('First');
    const results = await service.search(embedding, { k: 2 });

    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('should update embedding when content changes', async () => {
    const entry = await service.storeEntry({
      key: 'update-embed',
      content: 'Original content',
      namespace: 'test',
    });

    const callsBefore = mockEmbeddingGenerator.mock.calls.length;

    await service.update(entry.id, { content: 'Updated content' });

    // Should have generated new embedding for updated content
    expect(mockEmbeddingGenerator.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('should handle embedding generator failure gracefully', async () => {
    const failingGenerator = vi.fn().mockRejectedValue(new Error('Embedding failed'));
    const failService = new ProjectMemoryService({
      baseDir: path.join(testDir, 'fail-embed'),
      dbFilename: 'test.db',
      embeddingGenerator: failingGenerator,
      verbose: true,
    });
    await failService.initialize();

    // Should not throw, just log warning
    const entry = await failService.storeEntry({
      key: 'fail-test',
      content: 'Content that will fail embedding',
      namespace: 'test',
    });

    expect(entry.id).toBeDefined();
    await failService.shutdown();
  });

  it('should remove from vector index when deleting', async () => {
    const entry = await service.storeEntry({
      key: 'delete-vector',
      content: 'Content to delete',
      namespace: 'test',
    });

    // Verify entry exists in vector search
    const embedding = await mockEmbeddingGenerator('Content to delete');
    const beforeDelete = await service.search(embedding, { k: 5 });
    const foundBefore = beforeDelete.some(r => r.entry.id === entry.id);
    expect(foundBefore).toBe(true);

    await service.delete(entry.id);

    // Entry should no longer be found
    const afterDelete = await service.search(embedding, { k: 5 });
    const foundAfter = afterDelete.some(r => r.entry.id === entry.id);
    expect(foundAfter).toBe(false);
  });

  it('should apply threshold in search results', async () => {
    await service.storeEntry({
      key: 'similar',
      content: 'Very similar content',
      namespace: 'test',
    });

    await service.storeEntry({
      key: 'different',
      content: 'Completely different words here',
      namespace: 'test',
    });

    const embedding = await mockEmbeddingGenerator('Very similar');
    const results = await service.search(embedding, { k: 10, threshold: 0.9 });

    // High threshold should filter out dissimilar results
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('should include HNSW stats in getStats', async () => {
    await service.storeEntry({
      key: 'stats-test',
      content: 'Content for stats',
      namespace: 'test',
    });

    const stats = await service.getStats();
    expect(stats.hnswStats).toBeDefined();
    expect(stats.hnswStats!.vectorCount).toBe(1);
  });

  it('should include cache stats in getStats', async () => {
    await service.storeEntry({
      key: 'cache-test',
      content: 'Content for cache',
      namespace: 'test',
    });

    // Trigger a cache hit
    await service.get((await service.query({ type: 'hybrid', limit: 1 }))[0].id);

    const stats = await service.getStats();
    expect(stats.cacheStats).toBeDefined();
  });
});

describe('ProjectMemoryService with cache', () => {
  let service: ProjectMemoryService;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `cache-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    service = new ProjectMemoryService({
      baseDir: testDir,
      dbFilename: 'test.db',
      cacheEnabled: true,
      cacheSize: 100,
      cacheTtl: 60000,
    });
    await service.initialize();
  });

  afterEach(async () => {
    await service.shutdown();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should cache entries on get', async () => {
    const entry = await service.storeEntry({
      key: 'cache-hit',
      content: 'Cached content',
      namespace: 'test',
    });

    // First get populates cache
    const first = await service.get(entry.id);
    expect(first).not.toBeNull();

    // Second get should hit cache
    const second = await service.get(entry.id);
    expect(second).not.toBeNull();
    expect(second!.id).toBe(first!.id);
  });

  it('should cache entries on getByKey', async () => {
    await service.storeEntry({
      key: 'cache-key',
      content: 'Cached by key',
      namespace: 'ns',
    });

    // First get populates cache
    const first = await service.getByKey('ns', 'cache-key');
    expect(first).not.toBeNull();

    // Second get should hit cache
    const second = await service.getByKey('ns', 'cache-key');
    expect(second).not.toBeNull();
  });

  it('should update cache on update', async () => {
    const entry = await service.storeEntry({
      key: 'update-cache',
      content: 'Original',
      namespace: 'test',
    });

    await service.update(entry.id, { content: 'Updated' });

    const retrieved = await service.get(entry.id);
    expect(retrieved!.content).toBe('Updated');
  });

  it('should invalidate cache on delete', async () => {
    const entry = await service.storeEntry({
      key: 'delete-cache',
      content: 'To delete',
      namespace: 'test',
    });

    // Populate cache
    await service.get(entry.id);

    // Delete
    await service.delete(entry.id);

    // Should not find in cache or backend
    const retrieved = await service.get(entry.id);
    expect(retrieved).toBeNull();
  });

  it('should invalidate cache pattern on clearNamespace', async () => {
    await service.storeEntry({ key: 'c1', content: 'C1', namespace: 'clear-ns' });
    await service.storeEntry({ key: 'c2', content: 'C2', namespace: 'clear-ns' });
    await service.storeEntry({ key: 'k1', content: 'K1', namespace: 'keep-ns' });

    await service.clearNamespace('clear-ns');

    expect(await service.count('clear-ns')).toBe(0);
    expect(await service.count('keep-ns')).toBe(1);
  });
});

describe('ProjectMemoryService error handling', () => {
  it('should throw error when not initialized', async () => {
    const service = new ProjectMemoryService({
      baseDir: path.join(tmpdir(), 'not-init-test'),
    });

    await expect(service.get('some-id')).rejects.toThrow('not initialized');
    await expect(service.query({ type: 'hybrid', limit: 10 })).rejects.toThrow('not initialized');
  });

  it('should handle shutdown with active session', async () => {
    const testDir = path.join(tmpdir(), `session-shutdown-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    const service = new ProjectMemoryService({ baseDir: testDir });
    await service.initialize();

    await service.startSession();

    // Shutdown should end the session automatically
    await service.shutdown();

    // Verify session was ended
    expect(service.getCurrentSession()).toBeNull();

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should handle double initialization', async () => {
    const testDir = path.join(tmpdir(), `double-init-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    const service = new ProjectMemoryService({ baseDir: testDir });
    await service.initialize();
    await service.initialize(); // Should not throw

    await service.shutdown();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should handle double shutdown', async () => {
    const testDir = path.join(tmpdir(), `double-shutdown-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    const service = new ProjectMemoryService({ baseDir: testDir });
    await service.initialize();
    await service.shutdown();
    await service.shutdown(); // Should not throw

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should return null when ending non-existent session', async () => {
    const testDir = path.join(tmpdir(), `no-session-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    const service = new ProjectMemoryService({ baseDir: testDir });
    await service.initialize();

    const result = await service.endSession('summary');
    expect(result).toBeNull();

    await service.shutdown();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should handle delete of non-existent entry', async () => {
    const testDir = path.join(tmpdir(), `delete-none-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    const service = new ProjectMemoryService({ baseDir: testDir });
    await service.initialize();

    const result = await service.delete('non-existent-id');
    expect(result).toBe(false);

    await service.shutdown();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should handle getRecentSessions with invalid JSON', async () => {
    const testDir = path.join(tmpdir(), `invalid-session-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    const service = new ProjectMemoryService({ baseDir: testDir });
    await service.initialize();

    // Store invalid session data
    await service.storeEntry({
      key: 'session:invalid',
      content: 'not valid json {{{',
      namespace: DEFAULT_NAMESPACES.SESSION,
      tags: ['session'],
    });

    // Should filter out invalid entries
    const sessions = await service.getRecentSessions();
    expect(sessions.every(s => s.id !== undefined)).toBe(true);

    await service.shutdown();
    fs.rmSync(testDir, { recursive: true, force: true });
  });
});

describe('createEmbeddingMemory factory', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(tmpdir(), `embed-factory-${Date.now()}`);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should create memory service with embedding support', async () => {
    const { createEmbeddingMemory } = await import('../index.js');

    const mockGenerator = vi.fn().mockResolvedValue(new Float32Array(128));

    const service = createEmbeddingMemory(testDir, mockGenerator, 128);
    await service.initialize();

    // Store an entry to trigger embedding generation
    await service.storeEntry({
      key: 'embed-test',
      content: 'Test content',
      namespace: 'test',
    });

    expect(mockGenerator).toHaveBeenCalled();

    await service.shutdown();
  });
});
