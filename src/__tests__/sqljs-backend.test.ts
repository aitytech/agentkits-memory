/**
 * SqlJsBackend Tests
 *
 * Tests for the SQLite backend using sql.js.
 *
 * @module @agentkits/memory/__tests__/sqljs-backend.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqlJsBackend } from '../sqljs-backend.js';
import { MemoryEntry, createDefaultEntry } from '../types.js';

describe('SqlJsBackend', () => {
  let backend: SqlJsBackend;

  beforeEach(async () => {
    backend = new SqlJsBackend({
      databasePath: ':memory:',
      verbose: false,
      autoPersistInterval: 0, // Disable auto-persist for tests
    });
    await backend.initialize();
  });

  afterEach(async () => {
    await backend.shutdown();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const newBackend = new SqlJsBackend({ databasePath: ':memory:' });
      await newBackend.initialize();

      const health = await newBackend.healthCheck();
      expect(health.status).toBe('healthy');

      await newBackend.shutdown();
    });

    it('should create schema on initialization', async () => {
      const count = await backend.count();
      expect(count).toBe(0);
    });

    it('should handle multiple initializations gracefully', async () => {
      await backend.initialize();
      await backend.initialize();

      const health = await backend.healthCheck();
      expect(health.status).toBe('healthy');
    });
  });

  describe('Store Operations', () => {
    it('should store a memory entry', async () => {
      const entry = createDefaultEntry({
        key: 'test-key',
        content: 'Test content',
        namespace: 'test',
        tags: ['tag1', 'tag2'],
      });

      await backend.store(entry);
      const retrieved = await backend.get(entry.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.key).toBe('test-key');
      expect(retrieved!.content).toBe('Test content');
      expect(retrieved!.namespace).toBe('test');
      expect(retrieved!.tags).toEqual(['tag1', 'tag2']);
    });

    it('should update existing entry with same id', async () => {
      const entry = createDefaultEntry({
        key: 'update-test',
        content: 'Original content',
        namespace: 'test',
      });

      await backend.store(entry);

      entry.content = 'Updated content';
      await backend.store(entry);

      const retrieved = await backend.get(entry.id);
      expect(retrieved!.content).toBe('Updated content');

      const count = await backend.count();
      expect(count).toBe(1);
    });

    it('should store entry with metadata', async () => {
      const entry = createDefaultEntry({
        key: 'metadata-test',
        content: 'Content with metadata',
        namespace: 'test',
        metadata: { importance: 'high', source: 'test' },
      });

      await backend.store(entry);
      const retrieved = await backend.get(entry.id);

      expect(retrieved!.metadata).toEqual({ importance: 'high', source: 'test' });
    });

    it('should store entry with embedding', async () => {
      const embedding = new Float32Array([0.1, 0.2, 0.3, 0.4]);
      const entry = createDefaultEntry({
        key: 'embedding-test',
        content: 'Content with embedding',
        namespace: 'test',
      });
      entry.embedding = embedding;

      await backend.store(entry);
      const retrieved = await backend.get(entry.id);

      expect(retrieved!.embedding).toBeDefined();
      expect(retrieved!.embedding!.length).toBe(4);
    });
  });

  describe('Get Operations', () => {
    it('should get entry by id', async () => {
      const entry = createDefaultEntry({
        key: 'get-by-id',
        content: 'Test content',
        namespace: 'test',
      });

      await backend.store(entry);
      const retrieved = await backend.get(entry.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(entry.id);
    });

    it('should return null for non-existent id', async () => {
      const retrieved = await backend.get('non-existent-id');
      expect(retrieved).toBeNull();
    });

    it('should get entry by namespace and key', async () => {
      const entry = createDefaultEntry({
        key: 'unique-key',
        content: 'Test content',
        namespace: 'unique-namespace',
      });

      await backend.store(entry);
      const retrieved = await backend.getByKey('unique-namespace', 'unique-key');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.key).toBe('unique-key');
      expect(retrieved!.namespace).toBe('unique-namespace');
    });

    it('should return null for non-existent namespace/key', async () => {
      const retrieved = await backend.getByKey('non-existent', 'non-existent');
      expect(retrieved).toBeNull();
    });
  });

  describe('Update Operations', () => {
    it('should update entry content', async () => {
      const entry = createDefaultEntry({
        key: 'update-content',
        content: 'Original',
        namespace: 'test',
      });

      await backend.store(entry);
      const updated = await backend.update(entry.id, { content: 'Updated' });

      expect(updated).not.toBeNull();
      expect(updated!.content).toBe('Updated');
      expect(updated!.version).toBe(2);
    });

    it('should update entry tags', async () => {
      const entry = createDefaultEntry({
        key: 'update-tags',
        content: 'Content',
        namespace: 'test',
        tags: ['old-tag'],
      });

      await backend.store(entry);
      const updated = await backend.update(entry.id, { tags: ['new-tag1', 'new-tag2'] });

      expect(updated!.tags).toEqual(['new-tag1', 'new-tag2']);
    });

    it('should update entry metadata', async () => {
      const entry = createDefaultEntry({
        key: 'update-metadata',
        content: 'Content',
        namespace: 'test',
        metadata: { old: true },
      });

      await backend.store(entry);
      const updated = await backend.update(entry.id, { metadata: { new: true, version: 2 } });

      expect(updated!.metadata).toEqual({ new: true, version: 2 });
    });

    it('should return null when updating non-existent entry', async () => {
      const updated = await backend.update('non-existent', { content: 'New' });
      expect(updated).toBeNull();
    });

    it('should increment version on update', async () => {
      const entry = createDefaultEntry({
        key: 'version-test',
        content: 'Original',
        namespace: 'test',
      });

      await backend.store(entry);
      expect(entry.version).toBe(1);

      const updated1 = await backend.update(entry.id, { content: 'Update 1' });
      expect(updated1!.version).toBe(2);

      const updated2 = await backend.update(entry.id, { content: 'Update 2' });
      expect(updated2!.version).toBe(3);
    });
  });

  describe('Delete Operations', () => {
    it('should delete entry by id', async () => {
      const entry = createDefaultEntry({
        key: 'delete-test',
        content: 'To be deleted',
        namespace: 'test',
      });

      await backend.store(entry);
      expect(await backend.count()).toBe(1);

      const deleted = await backend.delete(entry.id);
      expect(deleted).toBe(true);
      expect(await backend.count()).toBe(0);
    });

    it('should return false when deleting non-existent entry', async () => {
      const deleted = await backend.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('Query Operations', () => {
    beforeEach(async () => {
      // Add test entries
      const entries = [
        createDefaultEntry({ key: 'pattern1', content: 'Auth pattern', namespace: 'patterns', tags: ['auth'] }),
        createDefaultEntry({ key: 'pattern2', content: 'API pattern', namespace: 'patterns', tags: ['api'] }),
        createDefaultEntry({ key: 'decision1', content: 'Use PostgreSQL', namespace: 'decisions', tags: ['database'] }),
        createDefaultEntry({ key: 'error1', content: 'Build error', namespace: 'errors', tags: ['build'] }),
      ];

      for (const entry of entries) {
        await backend.store(entry);
      }
    });

    it('should query all entries with hybrid type', async () => {
      const results = await backend.query({ type: 'hybrid', limit: 10 });
      expect(results.length).toBe(4);
    });

    it('should query by namespace', async () => {
      const results = await backend.query({ type: 'hybrid', namespace: 'patterns', limit: 10 });
      expect(results.length).toBe(2);
      expect(results.every(e => e.namespace === 'patterns')).toBe(true);
    });

    it('should query by tags', async () => {
      const results = await backend.query({ type: 'hybrid', tags: ['auth'], limit: 10 });
      expect(results.length).toBe(1);
      expect(results[0].key).toBe('pattern1');
    });

    it('should limit results', async () => {
      const results = await backend.query({ type: 'hybrid', limit: 2 });
      expect(results.length).toBe(2);
    });

    it('should query by exact key', async () => {
      const results = await backend.query({ type: 'exact', key: 'pattern1', limit: 10 });
      expect(results.length).toBe(1);
      expect(results[0].key).toBe('pattern1');
    });

    it('should query by key prefix', async () => {
      const results = await backend.query({ type: 'prefix', keyPrefix: 'pattern', limit: 10 });
      expect(results.length).toBe(2);
    });
  });

  describe('Namespace Operations', () => {
    beforeEach(async () => {
      const entries = [
        createDefaultEntry({ key: 'e1', content: 'C1', namespace: 'ns1' }),
        createDefaultEntry({ key: 'e2', content: 'C2', namespace: 'ns1' }),
        createDefaultEntry({ key: 'e3', content: 'C3', namespace: 'ns2' }),
      ];

      for (const entry of entries) {
        await backend.store(entry);
      }
    });

    it('should list all namespaces', async () => {
      const namespaces = await backend.listNamespaces();
      expect(namespaces).toContain('ns1');
      expect(namespaces).toContain('ns2');
      expect(namespaces.length).toBe(2);
    });

    it('should count entries by namespace', async () => {
      const ns1Count = await backend.count('ns1');
      const ns2Count = await backend.count('ns2');

      expect(ns1Count).toBe(2);
      expect(ns2Count).toBe(1);
    });

    it('should clear namespace', async () => {
      const deleted = await backend.clearNamespace('ns1');
      expect(deleted).toBe(2);

      const ns1Count = await backend.count('ns1');
      const ns2Count = await backend.count('ns2');

      expect(ns1Count).toBe(0);
      expect(ns2Count).toBe(1);
    });
  });

  describe('Bulk Operations', () => {
    it('should bulk insert entries', async () => {
      const entries = [
        createDefaultEntry({ key: 'bulk1', content: 'C1', namespace: 'bulk' }),
        createDefaultEntry({ key: 'bulk2', content: 'C2', namespace: 'bulk' }),
        createDefaultEntry({ key: 'bulk3', content: 'C3', namespace: 'bulk' }),
      ];

      await backend.bulkInsert(entries);
      const count = await backend.count('bulk');

      expect(count).toBe(3);
    });

    it('should bulk delete entries', async () => {
      const entries = [
        createDefaultEntry({ key: 'bd1', content: 'C1', namespace: 'bd' }),
        createDefaultEntry({ key: 'bd2', content: 'C2', namespace: 'bd' }),
        createDefaultEntry({ key: 'bd3', content: 'C3', namespace: 'bd' }),
      ];

      await backend.bulkInsert(entries);
      expect(await backend.count('bd')).toBe(3);

      const deleted = await backend.bulkDelete([entries[0].id, entries[1].id]);
      expect(deleted).toBe(2);
      expect(await backend.count('bd')).toBe(1);
    });
  });

  describe('Statistics', () => {
    it('should return stats', async () => {
      const entries = [
        createDefaultEntry({ key: 's1', content: 'C1', namespace: 'ns1', type: 'semantic' }),
        createDefaultEntry({ key: 's2', content: 'C2', namespace: 'ns2', type: 'episodic' }),
      ];

      for (const entry of entries) {
        await backend.store(entry);
      }

      const stats = await backend.getStats();

      expect(stats.totalEntries).toBe(2);
      expect(stats.entriesByNamespace['ns1']).toBe(1);
      expect(stats.entriesByNamespace['ns2']).toBe(1);
      expect(stats.entriesByType['semantic']).toBe(1);
      expect(stats.entriesByType['episodic']).toBe(1);
    });
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const health = await backend.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.components.storage.status).toBe('healthy');
      expect(health.timestamp).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw error when not initialized', async () => {
      const uninitBackend = new SqlJsBackend({ databasePath: ':memory:' });

      await expect(uninitBackend.get('test')).rejects.toThrow('not initialized');
    });
  });
});
