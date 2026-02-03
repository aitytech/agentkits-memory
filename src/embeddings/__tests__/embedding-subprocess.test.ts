/**
 * Embedding Subprocess Tests
 *
 * Tests for the subprocess-based embedding service.
 * Uses mock provider to avoid downloading the real model.
 *
 * @module @aitytech/agentkits-memory/embeddings/__tests__/embedding-subprocess.test
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { EmbeddingSubprocess } from '../embedding-subprocess.js';
import { fork } from 'node:child_process';
import { EventEmitter } from 'node:events';

// Mock child_process.fork to avoid spawning real processes
vi.mock('node:child_process', () => ({
  fork: vi.fn(),
}));

const mockFork = vi.mocked(fork);

/**
 * Create a mock child process that emits events
 */
function createMockChild() {
  const child = new EventEmitter() as EventEmitter & {
    send: ReturnType<typeof vi.fn>;
    kill: ReturnType<typeof vi.fn>;
  };
  child.send = vi.fn();
  child.kill = vi.fn();
  return child;
}

describe('EmbeddingSubprocess', () => {
  let subprocess: EmbeddingSubprocess;
  let mockChild: ReturnType<typeof createMockChild>;

  afterEach(async () => {
    if (subprocess) {
      await subprocess.shutdown();
      subprocess = undefined as any;
    }
    vi.restoreAllMocks();
    // Re-mock fork after restore
    mockFork.mockReset();
  });

  describe('spawn', () => {
    it('should fork the embedding worker process', () => {
      mockChild = createMockChild();
      mockFork.mockReturnValue(mockChild as any);

      subprocess = new EmbeddingSubprocess({ cacheDir: '/tmp/test-cache' });
      subprocess.spawn();

      expect(mockFork).toHaveBeenCalledTimes(1);
      expect(mockFork).toHaveBeenCalledWith(
        expect.stringContaining('embedding-worker.js'),
        ['/tmp/test-cache'],
        expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe', 'ipc'] }),
      );
    });

    it('should not double-spawn', () => {
      mockChild = createMockChild();
      mockFork.mockReturnValue(mockChild as any);

      subprocess = new EmbeddingSubprocess({ cacheDir: '/tmp/test' });
      subprocess.spawn();
      subprocess.spawn();

      expect(mockFork).toHaveBeenCalledTimes(1);
    });
  });

  describe('ready state', () => {
    it('should mark as ready when worker sends ready message', () => {
      mockChild = createMockChild();
      mockFork.mockReturnValue(mockChild as any);

      subprocess = new EmbeddingSubprocess({ cacheDir: '/tmp/test' });
      subprocess.spawn();

      expect(subprocess.isReady()).toBe(false);

      // Emit ready — the subprocess registered listener on the fork result
      mockChild.emit('message', { type: 'ready' });

      expect(subprocess.isReady()).toBe(true);
    });

    it('should verify fork returns our mock', () => {
      mockChild = createMockChild();
      mockFork.mockReturnValue(mockChild as any);

      subprocess = new EmbeddingSubprocess({ cacheDir: '/tmp/test' });
      subprocess.spawn();

      // Verify fork was called and our mock has listeners
      expect(mockChild.listenerCount('message')).toBeGreaterThan(0);
    });
  });

  describe('embed', () => {
    it('should send embed request when worker is ready', async () => {
      mockChild = createMockChild();
      mockFork.mockReturnValue(mockChild as any);

      subprocess = new EmbeddingSubprocess({ cacheDir: '/tmp/test' });
      subprocess.spawn();
      mockChild.emit('message', { type: 'ready' });

      const embedPromise = subprocess.embed('test text');

      // Worker should receive the request
      expect(mockChild.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'embed',
          text: 'test text',
        }),
      );

      // Simulate worker response
      const callArgs = mockChild.send.mock.calls[0][0] as { id: string };
      mockChild.emit('message', {
        type: 'embed_result',
        id: callArgs.id,
        embedding: Array.from(new Float32Array(384).fill(0.1)),
        timeMs: 50,
        cached: false,
      });

      const result = await embedPromise;

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(384);
    });

    it('should queue requests when worker is not ready', async () => {
      mockChild = createMockChild();
      mockFork.mockReturnValue(mockChild as any);

      subprocess = new EmbeddingSubprocess({ cacheDir: '/tmp/test' });
      subprocess.spawn();

      // Embed before ready — should be queued
      const embedPromise = subprocess.embed('queued text');

      // No message sent yet (queued)
      expect(mockChild.send).not.toHaveBeenCalled();

      // Worker becomes ready — queue should drain
      mockChild.emit('message', { type: 'ready' });

      expect(mockChild.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'embed',
          text: 'queued text',
        }),
      );

      // Simulate response
      const callArgs = mockChild.send.mock.calls[0][0] as { id: string };
      mockChild.emit('message', {
        type: 'embed_result',
        id: callArgs.id,
        embedding: Array.from(new Float32Array(384).fill(0.2)),
        timeMs: 30,
        cached: false,
      });

      const result = await embedPromise;
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(384);
    });

    it('should fall back to mock embedding on request timeout', async () => {
      mockChild = createMockChild();
      mockFork.mockReturnValue(mockChild as any);

      subprocess = new EmbeddingSubprocess({
        cacheDir: '/tmp/test',
        requestTimeout: 50, // 50ms timeout for test
      });
      subprocess.spawn();
      mockChild.emit('message', { type: 'ready' });

      const result = await subprocess.embed('timeout text');

      // Should get a mock embedding (non-zero, deterministic)
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(384);
      // Mock embeddings are normalized, so magnitude should be ~1
      let magnitude = 0;
      for (const v of result) magnitude += v * v;
      expect(Math.sqrt(magnitude)).toBeCloseTo(1, 1);
    });

    it('should fall back to mock on worker error response', async () => {
      mockChild = createMockChild();
      mockFork.mockReturnValue(mockChild as any);

      subprocess = new EmbeddingSubprocess({ cacheDir: '/tmp/test' });
      subprocess.spawn();
      mockChild.emit('message', { type: 'ready' });

      const embedPromise = subprocess.embed('error text');

      const callArgs = mockChild.send.mock.calls[0][0] as { id: string };
      mockChild.emit('message', {
        type: 'error',
        id: callArgs.id,
        message: 'Embed failed',
      });

      const result = await embedPromise;
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(384);
    });
  });

  describe('getGenerator', () => {
    it('should return an EmbeddingGenerator function', () => {
      mockChild = createMockChild();
      mockFork.mockReturnValue(mockChild as any);

      subprocess = new EmbeddingSubprocess({ cacheDir: '/tmp/test' });
      subprocess.spawn();

      const generator = subprocess.getGenerator();

      expect(typeof generator).toBe('function');
    });
  });

  describe('respawn', () => {
    it('should respawn worker on unexpected exit', () => {
      mockChild = createMockChild();
      const secondChild = createMockChild();
      mockFork.mockReturnValueOnce(mockChild as any).mockReturnValueOnce(secondChild as any);

      subprocess = new EmbeddingSubprocess({ cacheDir: '/tmp/test' });
      subprocess.spawn();

      expect(mockFork).toHaveBeenCalledTimes(1);

      // Simulate crash
      mockChild.emit('exit', 1);

      expect(mockFork).toHaveBeenCalledTimes(2);
    });

    it('should stop respawning after max attempts', () => {
      const children = Array.from({ length: 4 }, () => createMockChild());
      for (const c of children) mockFork.mockReturnValueOnce(c as any);

      subprocess = new EmbeddingSubprocess({ cacheDir: '/tmp/test' });
      subprocess.spawn(); // spawn #1

      children[0].emit('exit', 1); // respawn #1
      children[1].emit('exit', 1); // respawn #2
      children[2].emit('exit', 1); // should NOT respawn (max 2 respawns)

      expect(mockFork).toHaveBeenCalledTimes(3); // initial + 2 respawns
    });
  });

  describe('shutdown', () => {
    it('should clean up on shutdown', async () => {
      mockChild = createMockChild();
      mockFork.mockReturnValue(mockChild as any);

      subprocess = new EmbeddingSubprocess({ cacheDir: '/tmp/test' });
      subprocess.spawn();

      mockChild.emit('message', { type: 'ready' });

      expect(subprocess.isReady()).toBe(true);

      await subprocess.shutdown();

      expect(subprocess.isReady()).toBe(false);
    });

    it('should not respawn after shutdown', () => {
      mockChild = createMockChild();
      mockFork.mockReturnValue(mockChild as any);

      subprocess = new EmbeddingSubprocess({ cacheDir: '/tmp/test' });
      subprocess.spawn();
      subprocess.shutdown();

      mockChild.emit('exit', 0);

      // Should not have spawned a second time
      expect(mockFork).toHaveBeenCalledTimes(1);
    });
  });

  describe('mock embedding consistency', () => {
    it('should produce deterministic mock embeddings for same text', async () => {
      mockChild = createMockChild();
      mockFork.mockReturnValue(mockChild as any);

      subprocess = new EmbeddingSubprocess({
        cacheDir: '/tmp/test',
        requestTimeout: 10,
      });
      subprocess.spawn();
      mockChild.emit('message', { type: 'ready' });

      const result1 = await subprocess.embed('deterministic test');
      const result2 = await subprocess.embed('deterministic test');

      expect(Array.from(result1)).toEqual(Array.from(result2));
    });

    it('should produce different mock embeddings for different text', async () => {
      mockChild = createMockChild();
      mockFork.mockReturnValue(mockChild as any);

      subprocess = new EmbeddingSubprocess({
        cacheDir: '/tmp/test',
        requestTimeout: 10,
      });
      subprocess.spawn();
      mockChild.emit('message', { type: 'ready' });

      const result1 = await subprocess.embed('text one');
      const result2 = await subprocess.embed('text two');

      expect(Array.from(result1)).not.toEqual(Array.from(result2));
    });
  });

  describe('custom dimensions', () => {
    it('should use custom dimensions for mock fallback', async () => {
      mockChild = createMockChild();
      mockFork.mockReturnValue(mockChild as any);

      subprocess = new EmbeddingSubprocess({
        cacheDir: '/tmp/test',
        dimensions: 128,
        requestTimeout: 10,
      });
      subprocess.spawn();
      mockChild.emit('message', { type: 'ready' });

      const result = await subprocess.embed('custom dims');

      expect(result.length).toBe(128);
    });
  });
});
