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
