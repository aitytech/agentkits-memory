/**
 * Persistent Embedding Cache
 *
 * SQLite-backed cache for embeddings to avoid re-computing
 * embeddings for the same text content.
 *
 * @module @aitytech/agentkits-memory/embeddings
 */

import { createHash } from 'crypto';
import type { Database as BetterDatabase } from 'better-sqlite3';

/**
 * Embedding cache configuration
 */
export interface PersistentEmbeddingCacheConfig {
  /** Maximum number of entries (default: 10000) */
  maxSize?: number;

  /** TTL in milliseconds (default: 7 days) */
  ttlMs?: number;

  /** Vector dimensions (default: 384) */
  dimensions?: number;
}

/**
 * Cached embedding entry
 */
export interface CachedEmbedding {
  /** Content hash (primary key) */
  hash: string;

  /** The embedding vector */
  embedding: Float32Array;

  /** When the entry was created */
  createdAt: number;

  /** When the entry expires */
  expiresAt: number;

  /** Access count */
  accessCount: number;
}

/**
 * Cache statistics
 */
export interface PersistentEmbeddingCacheStats {
  /** Total entries in cache */
  size: number;

  /** Cache hits */
  hits: number;

  /** Cache misses */
  misses: number;

  /** Hit rate (0-1) */
  hitRate: number;

  /** Total bytes used */
  bytesUsed: number;

  /** Oldest entry age in ms */
  oldestEntryAge: number;
}

/**
 * Persistent Embedding Cache using SQLite
 */
export class PersistentEmbeddingCache {
  private db: BetterDatabase;
  private config: Required<PersistentEmbeddingCacheConfig>;
  private stats = {
    hits: 0,
    misses: 0,
  };

  constructor(db: BetterDatabase, config: PersistentEmbeddingCacheConfig = {}) {
    this.db = db;
    this.config = {
      maxSize: config.maxSize || 10000,
      ttlMs: config.ttlMs || 7 * 24 * 60 * 60 * 1000, // 7 days
      dimensions: config.dimensions || 384,
    };

    this.initializeSchema();
  }

  /**
   * Initialize the cache table
   */
  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embedding_cache (
        hash TEXT PRIMARY KEY,
        embedding BLOB NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        access_count INTEGER DEFAULT 1,
        last_accessed_at INTEGER NOT NULL
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_embedding_cache_expires
      ON embedding_cache(expires_at)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_embedding_cache_accessed
      ON embedding_cache(last_accessed_at)
    `);
  }

  /**
   * Hash content for cache key
   */
  private hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex').substring(0, 32);
  }

  /**
   * Convert Float32Array to Buffer for storage
   */
  private toBuffer(embedding: Float32Array): Buffer {
    return Buffer.from(embedding.buffer);
  }

  /**
   * Convert Buffer back to Float32Array
   */
  private fromBuffer(buffer: Buffer): Float32Array {
    return new Float32Array(buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ));
  }

  /**
   * Get embedding from cache
   */
  get(content: string): Float32Array | null {
    const hash = this.hashContent(content);
    const now = Date.now();

    const row = this.db.prepare(`
      SELECT embedding, expires_at
      FROM embedding_cache
      WHERE hash = ? AND expires_at > ?
    `).get(hash, now) as { embedding: Buffer; expires_at: number } | undefined;

    if (row) {
      // Update access stats
      this.db.prepare(`
        UPDATE embedding_cache
        SET access_count = access_count + 1,
            last_accessed_at = ?
        WHERE hash = ?
      `).run(now, hash);

      this.stats.hits++;
      return this.fromBuffer(row.embedding);
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Store embedding in cache
   */
  set(content: string, embedding: Float32Array): void {
    const hash = this.hashContent(content);
    const now = Date.now();
    const expiresAt = now + this.config.ttlMs;

    // Check if we need to evict entries
    this.evictIfNeeded();

    // Insert or replace
    this.db.prepare(`
      INSERT OR REPLACE INTO embedding_cache
      (hash, embedding, created_at, expires_at, access_count, last_accessed_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run(hash, this.toBuffer(embedding), now, expiresAt, now);
  }

  /**
   * Check if content is in cache
   */
  has(content: string): boolean {
    const hash = this.hashContent(content);
    const now = Date.now();

    const row = this.db.prepare(`
      SELECT 1 FROM embedding_cache
      WHERE hash = ? AND expires_at > ?
    `).get(hash, now);

    return !!row;
  }

  /**
   * Delete expired entries
   */
  evictExpired(): number {
    const now = Date.now();
    const result = this.db.prepare(`DELETE FROM embedding_cache WHERE expires_at <= ?`).run(now);
    return result.changes;
  }

  /**
   * Evict oldest entries if over capacity
   */
  private evictIfNeeded(): void {
    const countRow = this.db.prepare(`SELECT COUNT(*) as count FROM embedding_cache`).get() as { count: number };

    if (countRow.count >= this.config.maxSize) {
      // Delete oldest 10% of entries
      const deleteCount = Math.max(1, Math.floor(this.config.maxSize * 0.1));
      this.db.prepare(`
        DELETE FROM embedding_cache
        WHERE hash IN (
          SELECT hash FROM embedding_cache
          ORDER BY last_accessed_at ASC
          LIMIT ?
        )
      `).run(deleteCount);
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.db.exec(`DELETE FROM embedding_cache`);
    this.stats.hits = 0;
    this.stats.misses = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): PersistentEmbeddingCacheStats {
    const now = Date.now();

    // Get size and bytes
    const result = this.db.prepare(`
      SELECT
        COUNT(*) as size,
        COALESCE(SUM(LENGTH(embedding)), 0) as bytes,
        MIN(created_at) as oldest
      FROM embedding_cache
      WHERE expires_at > ?
    `).get(now) as {
      size: number;
      bytes: number;
      oldest: number | null;
    };

    const totalRequests = this.stats.hits + this.stats.misses;

    return {
      size: result.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
      bytesUsed: result.bytes,
      oldestEntryAge: result.oldest ? now - result.oldest : 0,
    };
  }

  /**
   * Get all cached embeddings
   */
  getAllEmbeddings(): Array<{ hash: string; embedding: Float32Array }> {
    const now = Date.now();

    const rows = this.db.prepare(`
      SELECT hash, embedding
      FROM embedding_cache
      WHERE expires_at > ?
    `).all(now) as { hash: string; embedding: Buffer }[];

    return rows.map(row => ({
      hash: row.hash,
      embedding: this.fromBuffer(row.embedding),
    }));
  }
}

/**
 * Create a persistent embedding cache
 *
 * @example
 * ```typescript
 * import Database from 'better-sqlite3';
 * import { createPersistentEmbeddingCache } from '@aitytech/agentkits-memory/embeddings';
 *
 * const db = new Database(':memory:');
 *
 * const cache = createPersistentEmbeddingCache(db, {
 *   maxSize: 10000,
 *   ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
 * });
 * ```
 */
export function createPersistentEmbeddingCache(
  db: BetterDatabase,
  config?: PersistentEmbeddingCacheConfig
): PersistentEmbeddingCache {
  return new PersistentEmbeddingCache(db, config);
}

export default PersistentEmbeddingCache;
