/**
 * Embedding Subprocess Client
 *
 * Manages a child process that runs the embedding model.
 * MCP server uses this for non-blocking embeddings — the server
 * starts instantly while the model loads in the background.
 *
 * Provides the standard EmbeddingGenerator interface.
 * Falls back to mock embeddings on timeout or worker failure.
 *
 * @module @aitytech/agentkits-memory/embeddings/embedding-subprocess
 */

import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import type { EmbeddingGenerator } from '../types.js';

/**
 * Configuration for the embedding subprocess
 */
export interface EmbeddingSubprocessConfig {
  /** Cache directory for the embedding model */
  cacheDir: string;
  /** Vector dimensions (default: 384) */
  dimensions?: number;
  /** Timeout for worker initialization in ms (default: 60000) */
  initTimeout?: number;
  /** Timeout for individual embed requests in ms (default: 30000) */
  requestTimeout?: number;
}

// IPC message types
interface EmbedResultMessage {
  type: 'embed_result';
  id: string;
  embedding: number[];
  timeMs: number;
  cached: boolean;
}

interface ReadyMessage {
  type: 'ready';
}

interface ErrorMessage {
  type: 'error';
  id?: string;
  message: string;
}

type WorkerMessage = EmbedResultMessage | ReadyMessage | ErrorMessage;

interface PendingRequest {
  resolve: (embedding: Float32Array) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Deterministic mock embedding for fallback.
 * Matches the mock in LocalEmbeddingsService for consistency.
 */
function createMockEmbedding(text: string, dimensions: number): Float32Array {
  const embedding = new Float32Array(dimensions);
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash = hash & hash;
  }
  for (let i = 0; i < dimensions; i++) {
    hash = ((hash << 5) - hash) + i;
    hash = hash & hash;
    embedding[i] = (hash % 1000) / 1000 - 0.5;
  }
  let norm = 0;
  for (let i = 0; i < dimensions; i++) {
    norm += embedding[i] * embedding[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) {
      embedding[i] /= norm;
    }
  }
  return embedding;
}

/**
 * Embedding subprocess client.
 *
 * Spawns a child process that loads the embedding model.
 * Requests are queued until the worker is ready.
 * Falls back to mock embeddings on timeout.
 */
export class EmbeddingSubprocess {
  private child: ChildProcess | null = null;
  private ready = false;
  private pending = new Map<string, PendingRequest>();
  private queue: Array<{ id: string; text: string }> = [];
  private requestCounter = 0;
  private respawnCount = 0;
  private shuttingDown = false;
  private initTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly dimensions: number;
  private readonly cacheDir: string;
  private readonly initTimeout: number;
  private readonly requestTimeout: number;
  private readonly maxRespawns = 2;

  constructor(config: EmbeddingSubprocessConfig) {
    this.cacheDir = config.cacheDir;
    this.dimensions = config.dimensions ?? 384;
    this.initTimeout = config.initTimeout ?? 60_000;
    this.requestTimeout = config.requestTimeout ?? 30_000;
  }

  /**
   * Spawn the embedding worker process. Returns immediately.
   * The worker loads the model in the background.
   */
  spawn(): void {
    if (this.child || this.shuttingDown) return;

    const workerPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      'embedding-worker.js',
    );

    this.child = fork(workerPath, [this.cacheDir], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    this.child.on('message', (msg: WorkerMessage) => {
      this.handleMessage(msg);
    });

    this.child.on('exit', () => {
      this.child = null;
      this.ready = false;

      if (!this.shuttingDown && this.respawnCount < this.maxRespawns) {
        this.respawnCount++;
        this.spawn();
      } else {
        // Worker dead, resolve all pending with mock
        this.resolveAllWithMock('Worker exited');
      }
    });

    this.child.on('error', () => {
      // Handled by 'exit' event
    });

    // Init timeout — if worker doesn't become ready, fall back to mock
    this.initTimer = setTimeout(() => {
      if (!this.ready) {
        this.resolveAllWithMock('Init timeout');
        // Keep the worker alive — it may still become ready later
      }
    }, this.initTimeout);
  }

  /**
   * Handle IPC message from worker
   */
  private handleMessage(msg: WorkerMessage): void {
    if (msg.type === 'ready') {
      this.ready = true;
      if (this.initTimer) {
        clearTimeout(this.initTimer);
        this.initTimer = null;
      }
      this.drainQueue();
      return;
    }

    if (msg.type === 'embed_result') {
      const req = this.pending.get(msg.id);
      if (req) {
        clearTimeout(req.timer);
        this.pending.delete(msg.id);
        req.resolve(new Float32Array(msg.embedding));
      }
      return;
    }

    if (msg.type === 'error' && msg.id) {
      const req = this.pending.get(msg.id);
      if (req) {
        clearTimeout(req.timer);
        this.pending.delete(msg.id);
        // Fall back to mock instead of rejecting
        req.resolve(createMockEmbedding(msg.id, this.dimensions));
      }
    }
  }

  /**
   * Send all queued requests to the worker
   */
  private drainQueue(): void {
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.child?.send({ type: 'embed', id: item.id, text: item.text });
    }
  }

  /**
   * Resolve all pending and queued requests with mock embeddings
   */
  private resolveAllWithMock(_reason: string): void {
    // Resolve queued items
    for (const item of this.queue) {
      const req = this.pending.get(item.id);
      if (req) {
        clearTimeout(req.timer);
        this.pending.delete(item.id);
        req.resolve(createMockEmbedding(item.text, this.dimensions));
      }
    }
    this.queue = [];

    // Resolve remaining pending
    for (const [id, req] of this.pending) {
      clearTimeout(req.timer);
      req.resolve(createMockEmbedding(id, this.dimensions));
    }
    this.pending.clear();
  }

  /**
   * Generate embedding for text.
   * Queues the request if worker is not ready yet.
   * Falls back to mock on timeout.
   */
  async embed(text: string): Promise<Float32Array> {
    const id = String(this.requestCounter++);

    return new Promise<Float32Array>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(createMockEmbedding(text, this.dimensions));
      }, this.requestTimeout);

      this.pending.set(id, { resolve, reject: () => {}, timer });

      if (this.ready && this.child) {
        this.child.send({ type: 'embed', id, text });
      } else {
        this.queue.push({ id, text });
      }
    });
  }

  /**
   * Get an EmbeddingGenerator function compatible with ProjectMemoryService
   */
  getGenerator(): EmbeddingGenerator {
    return (content: string) => this.embed(content);
  }

  /**
   * Whether the worker is ready to process requests
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Shutdown the worker gracefully
   */
  async shutdown(): Promise<void> {
    this.shuttingDown = true;

    if (this.initTimer) {
      clearTimeout(this.initTimer);
      this.initTimer = null;
    }

    // Clear pending requests
    for (const [, req] of this.pending) {
      clearTimeout(req.timer);
    }
    this.pending.clear();
    this.queue = [];

    if (this.child) {
      try {
        this.child.send({ type: 'shutdown' });
      } catch {
        // IPC may already be closed
      }
      // Force kill after grace period
      const child = this.child;
      setTimeout(() => {
        try { child.kill(); } catch { /* already dead */ }
      }, 1000);
      this.child = null;
    }

    this.ready = false;
  }
}
