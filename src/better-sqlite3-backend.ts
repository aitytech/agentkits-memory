/**
 * BetterSqlite3Backend - Native SQLite with FTS5 Trigram for CJK Support
 *
 * Production-grade backend using better-sqlite3 (native SQLite).
 * Provides:
 * - FTS5 with trigram tokenizer for CJK (Japanese, Chinese, Korean)
 * - BM25 ranking for relevance scoring
 * - 10x faster than sql.js for large datasets
 * - Proper word segmentation for all languages
 *
 * Requires:
 * - Node.js environment (no browser support)
 * - npm install better-sqlite3
 *
 * @module @agentkits/memory/better-sqlite3-backend
 */

import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import type Database from 'better-sqlite3';
import {
  IMemoryBackend,
  MemoryEntry,
  MemoryEntryUpdate,
  MemoryQuery,
  SearchOptions,
  SearchResult,
  BackendStats,
  HealthCheckResult,
  ComponentHealth,
  MemoryType,
  EmbeddingGenerator,
  generateMemoryId,
} from './types.js';

/**
 * Configuration for BetterSqlite3 Backend
 */
export interface BetterSqlite3BackendConfig {
  /** Path to SQLite database file (:memory: for in-memory) */
  databasePath: string;

  /** Enable query optimization and WAL mode */
  optimize: boolean;

  /** Default namespace */
  defaultNamespace: string;

  /** Embedding generator for semantic search */
  embeddingGenerator?: EmbeddingGenerator;

  /** Maximum entries before auto-cleanup */
  maxEntries: number;

  /** Enable verbose logging */
  verbose: boolean;

  /**
   * FTS5 tokenizer to use
   * - 'trigram': Best for CJK (Japanese, Chinese, Korean) - works with all languages
   * - 'unicode61': Standard tokenizer, good for English/Latin
   * - 'porter': Stemming for English
   */
  ftsTokenizer: 'trigram' | 'unicode61' | 'porter';

  /** Path to custom SQLite extension (e.g., lindera for advanced Japanese) */
  extensionPath?: string;

  /** Custom tokenizer name when using extension (e.g., 'lindera_tokenizer') */
  customTokenizer?: string;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: BetterSqlite3BackendConfig = {
  databasePath: ':memory:',
  optimize: true,
  defaultNamespace: 'default',
  maxEntries: 1000000,
  verbose: false,
  ftsTokenizer: 'trigram', // Best for CJK out of the box
};

/**
 * Estimate tokens from content (~4 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * BetterSqlite3 Backend for Production Memory Storage
 *
 * Features:
 * - Native SQLite performance (10x faster than sql.js)
 * - FTS5 with trigram tokenizer for CJK language support
 * - BM25 relevance ranking
 * - WAL mode for concurrent reads
 * - Optional extension loading (lindera, ICU, etc.)
 */
export class BetterSqlite3Backend extends EventEmitter implements IMemoryBackend {
  private config: BetterSqlite3BackendConfig;
  private db: Database.Database | null = null;
  private initialized: boolean = false;
  private ftsAvailable: boolean = false;

  // Performance tracking
  private stats = {
    queryCount: 0,
    totalQueryTime: 0,
    writeCount: 0,
    totalWriteTime: 0,
  };

  constructor(config: Partial<BetterSqlite3BackendConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the BetterSqlite3 backend
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Dynamic import for better-sqlite3 (optional dependency)
    let DatabaseConstructor: typeof import('better-sqlite3');
    try {
      DatabaseConstructor = (await import('better-sqlite3')).default;
    } catch (error) {
      throw new Error(
        'better-sqlite3 is not installed. ' +
        'For production CJK support, run: npm install better-sqlite3'
      );
    }

    // Ensure directory exists for file-based databases
    if (this.config.databasePath !== ':memory:') {
      const dir = path.dirname(this.config.databasePath);
      if (dir && !existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    // Create database
    this.db = new DatabaseConstructor(this.config.databasePath);

    if (this.config.verbose) {
      const versionRow = this.db.prepare('SELECT sqlite_version() as version').get() as { version: string };
      console.log(`[BetterSqlite3] Opened database: ${this.config.databasePath}`);
      console.log(`[BetterSqlite3] SQLite version: ${versionRow.version}`);
    }

    // Enable optimizations
    if (this.config.optimize) {
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = -64000'); // 64MB cache
      this.db.pragma('temp_store = MEMORY');
    }

    // Load custom extension if provided
    if (this.config.extensionPath) {
      try {
        this.db.loadExtension(this.config.extensionPath);
        if (this.config.verbose) {
          console.log(`[BetterSqlite3] Loaded extension: ${this.config.extensionPath}`);
        }
      } catch (error) {
        console.warn(`[BetterSqlite3] Failed to load extension: ${error}`);
      }
    }

    // Create schema
    this.createSchema();

    // Create FTS5 table with appropriate tokenizer
    this.createFtsTable();

    this.initialized = true;
    this.emit('initialized');

    if (this.config.verbose) {
      console.log('[BetterSqlite3] Backend initialized');
      console.log(`[BetterSqlite3] FTS5 available: ${this.ftsAvailable}`);
      console.log(`[BetterSqlite3] Tokenizer: ${this.getActiveTokenizer()}`);
    }
  }

  /**
   * Create the database schema
   */
  private createSchema(): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_entries (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT DEFAULT 'semantic',
        namespace TEXT DEFAULT 'default',
        tags TEXT DEFAULT '[]',
        metadata TEXT DEFAULT '{}',
        embedding BLOB,
        session_id TEXT,
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

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_namespace ON memory_entries(namespace);
      CREATE INDEX IF NOT EXISTS idx_key ON memory_entries(key);
      CREATE INDEX IF NOT EXISTS idx_type ON memory_entries(type);
      CREATE INDEX IF NOT EXISTS idx_created_at ON memory_entries(created_at);
      CREATE INDEX IF NOT EXISTS idx_namespace_key ON memory_entries(namespace, key);
    `);
  }

  /**
   * Create FTS5 virtual table with appropriate tokenizer
   */
  private createFtsTable(): void {
    if (!this.db) throw new Error('Database not initialized');

    // Determine tokenizer configuration
    let tokenizerConfig: string;
    if (this.config.customTokenizer) {
      tokenizerConfig = `tokenize='${this.config.customTokenizer}'`;
    } else {
      switch (this.config.ftsTokenizer) {
        case 'trigram':
          tokenizerConfig = "tokenize='trigram'";
          break;
        case 'porter':
          tokenizerConfig = "tokenize='porter unicode61'";
          break;
        default:
          tokenizerConfig = "tokenize='unicode61'";
      }
    }

    try {
      // Create FTS5 virtual table
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
          key,
          content,
          namespace,
          tags,
          content=memory_entries,
          content_rowid=rowid,
          ${tokenizerConfig}
        )
      `);

      // Create triggers to keep FTS in sync
      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS memory_fts_insert AFTER INSERT ON memory_entries BEGIN
          INSERT INTO memory_fts(rowid, key, content, namespace, tags)
          VALUES (NEW.rowid, NEW.key, NEW.content, NEW.namespace, NEW.tags);
        END
      `);

      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS memory_fts_delete AFTER DELETE ON memory_entries BEGIN
          INSERT INTO memory_fts(memory_fts, rowid, key, content, namespace, tags)
          VALUES ('delete', OLD.rowid, OLD.key, OLD.content, OLD.namespace, OLD.tags);
        END
      `);

      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS memory_fts_update AFTER UPDATE ON memory_entries BEGIN
          INSERT INTO memory_fts(memory_fts, rowid, key, content, namespace, tags)
          VALUES ('delete', OLD.rowid, OLD.key, OLD.content, OLD.namespace, OLD.tags);
          INSERT INTO memory_fts(rowid, key, content, namespace, tags)
          VALUES (NEW.rowid, NEW.key, NEW.content, NEW.namespace, NEW.tags);
        END
      `);

      // Populate FTS from existing entries
      this.db.exec(`
        INSERT INTO memory_fts(memory_fts) VALUES('rebuild')
      `);

      this.ftsAvailable = true;

      if (this.config.verbose) {
        console.log(`[BetterSqlite3] FTS5 initialized with ${tokenizerConfig}`);
      }
    } catch (error) {
      console.warn(`[BetterSqlite3] FTS5 initialization failed: ${error}`);
      this.ftsAvailable = false;
    }
  }

  /**
   * Get the active tokenizer being used
   */
  getActiveTokenizer(): string {
    if (this.config.customTokenizer) {
      return this.config.customTokenizer;
    }
    return this.config.ftsTokenizer;
  }

  /**
   * Check if FTS5 is available and CJK optimized
   */
  isFtsAvailable(): boolean {
    return this.ftsAvailable;
  }

  /**
   * Check if CJK is optimally supported (trigram or lindera)
   */
  isCjkOptimized(): boolean {
    return this.ftsAvailable && (
      this.config.ftsTokenizer === 'trigram' ||
      this.config.customTokenizer?.includes('lindera') === true
    );
  }

  /**
   * Shutdown the backend
   */
  async shutdown(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.initialized = false;
    this.emit('shutdown');
  }

  /**
   * Store a memory entry
   */
  async store(entry: MemoryEntry): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const startTime = Date.now();

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO memory_entries
      (id, key, content, type, namespace, tags, metadata, embedding, session_id,
       owner_id, access_level, created_at, updated_at, expires_at, version,
       "references", access_count, last_accessed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      entry.id,
      entry.key,
      entry.content,
      entry.type,
      entry.namespace,
      JSON.stringify(entry.tags),
      JSON.stringify(entry.metadata),
      entry.embedding ? Buffer.from(entry.embedding.buffer) : null,
      entry.sessionId || null,
      entry.ownerId || null,
      entry.accessLevel,
      entry.createdAt,
      entry.updatedAt,
      entry.expiresAt || null,
      entry.version,
      JSON.stringify(entry.references),
      entry.accessCount,
      entry.lastAccessedAt
    );

    const duration = Date.now() - startTime;
    this.stats.writeCount++;
    this.stats.totalWriteTime += duration;
    this.emit('entry:stored', { entry, duration });
  }

  /**
   * Retrieve a memory entry by ID
   */
  async get(id: string): Promise<MemoryEntry | null> {
    if (!this.db) throw new Error('Database not initialized');

    const startTime = Date.now();
    const stmt = this.db.prepare('SELECT * FROM memory_entries WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;

    this.stats.queryCount++;
    this.stats.totalQueryTime += Date.now() - startTime;

    if (!row) return null;

    // Update access count
    this.db.prepare(
      'UPDATE memory_entries SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?'
    ).run(Date.now(), id);

    return this.rowToEntry(row);
  }

  /**
   * Retrieve a memory entry by key within a namespace
   */
  async getByKey(namespace: string, key: string): Promise<MemoryEntry | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(
      'SELECT * FROM memory_entries WHERE namespace = ? AND key = ?'
    );
    const row = stmt.get(namespace, key) as Record<string, unknown> | undefined;

    if (!row) return null;

    // Update access count
    this.db.prepare(
      'UPDATE memory_entries SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?'
    ).run(Date.now(), row.id);

    return this.rowToEntry(row);
  }

  /**
   * Update a memory entry
   */
  async update(id: string, update: MemoryEntryUpdate): Promise<MemoryEntry | null> {
    if (!this.db) throw new Error('Database not initialized');

    const existing = await this.get(id);
    if (!existing) return null;

    const updated: MemoryEntry = {
      ...existing,
      ...update,
      updatedAt: Date.now(),
      version: existing.version + 1,
    };

    await this.store(updated);
    return updated;
  }

  /**
   * Delete a memory entry
   */
  async delete(id: string): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.prepare('DELETE FROM memory_entries WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Query memory entries
   */
  async query(query: MemoryQuery): Promise<MemoryEntry[]> {
    if (!this.db) throw new Error('Database not initialized');

    const startTime = Date.now();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.namespace) {
      conditions.push('namespace = ?');
      params.push(query.namespace);
    }

    if (query.memoryType) {
      conditions.push('type = ?');
      params.push(query.memoryType);
    }

    if (query.tags && query.tags.length > 0) {
      const tagConditions = query.tags.map(() => 'tags LIKE ?');
      conditions.push(`(${tagConditions.join(' OR ')})`);
      query.tags.forEach((tag) => params.push(`%"${tag}"%`));
    }

    if (query.createdBefore) {
      conditions.push('created_at < ?');
      params.push(query.createdBefore);
    }

    if (query.createdAfter) {
      conditions.push('created_at > ?');
      params.push(query.createdAfter);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = query.limit || 100;

    const sql = `
      SELECT * FROM memory_entries
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ?
    `;
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];

    this.stats.queryCount++;
    this.stats.totalQueryTime += Date.now() - startTime;

    return rows.map((row) => this.rowToEntry(row));
  }

  /**
   * Full-text search using FTS5
   */
  async searchFts(query: string, options: { namespace?: string; limit?: number } = {}): Promise<MemoryEntry[]> {
    if (!this.db) throw new Error('Database not initialized');

    if (!this.ftsAvailable) {
      // Fall back to LIKE search
      return this.searchLike(query, options);
    }

    const limit = options.limit || 100;
    const params: (string | number)[] = [];

    // Sanitize query for FTS5
    const sanitizedQuery = this.sanitizeFtsQuery(query);
    if (!sanitizedQuery) return [];

    let sql: string;
    if (options.namespace) {
      sql = `
        SELECT m.*, bm25(memory_fts) as rank
        FROM memory_fts f
        JOIN memory_entries m ON f.rowid = m.rowid
        WHERE memory_fts MATCH ? AND m.namespace = ?
        ORDER BY rank
        LIMIT ?
      `;
      params.push(sanitizedQuery, options.namespace, limit);
    } else {
      sql = `
        SELECT m.*, bm25(memory_fts) as rank
        FROM memory_fts f
        JOIN memory_entries m ON f.rowid = m.rowid
        WHERE memory_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `;
      params.push(sanitizedQuery, limit);
    }

    try {
      const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
      return rows.map((row) => this.rowToEntry(row));
    } catch (error) {
      // Fall back to LIKE on error
      console.warn(`[BetterSqlite3] FTS5 search failed, falling back to LIKE: ${error}`);
      return this.searchLike(query, options);
    }
  }

  /**
   * LIKE-based search fallback
   */
  private searchLike(query: string, options: { namespace?: string; limit?: number }): MemoryEntry[] {
    if (!this.db) throw new Error('Database not initialized');

    const pattern = `%${query}%`;
    const limit = options.limit || 100;

    let sql: string;
    const params: (string | number)[] = [];

    if (options.namespace) {
      sql = `
        SELECT * FROM memory_entries
        WHERE (content LIKE ? OR key LIKE ? OR tags LIKE ?) AND namespace = ?
        ORDER BY created_at DESC
        LIMIT ?
      `;
      params.push(pattern, pattern, pattern, options.namespace, limit);
    } else {
      sql = `
        SELECT * FROM memory_entries
        WHERE content LIKE ? OR key LIKE ? OR tags LIKE ?
        ORDER BY created_at DESC
        LIMIT ?
      `;
      params.push(pattern, pattern, pattern, limit);
    }

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.rowToEntry(row));
  }

  /**
   * Sanitize query for FTS5
   */
  private sanitizeFtsQuery(query: string): string {
    // Remove special FTS5 operators and wrap terms in quotes
    return query
      .replace(/[^\w\s\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u3400-\u4DBF]/g, ' ')
      .split(/\s+/)
      .filter((term) => term.length > 0)
      .map((term) => `"${term}"`)
      .join(' OR ');
  }

  /**
   * Semantic vector search
   */
  async search(embedding: Float32Array, options: SearchOptions): Promise<SearchResult[]> {
    if (!this.db) throw new Error('Database not initialized');

    const startTime = Date.now();

    // Get all entries with embeddings
    let sql = `
      SELECT * FROM memory_entries
      WHERE embedding IS NOT NULL
    `;
    const params: unknown[] = [];

    // Apply filters if provided
    if (options.filters?.namespace) {
      sql += ' AND namespace = ?';
      params.push(options.filters.namespace);
    }

    if (options.filters?.memoryType) {
      sql += ' AND type = ?';
      params.push(options.filters.memoryType);
    }

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];

    // Calculate cosine similarity
    const results: SearchResult[] = rows
      .map((row) => {
        const entry = this.rowToEntry(row);
        if (!entry.embedding) return null;

        const similarity = this.cosineSimilarity(embedding, entry.embedding);
        const distance = 1 - similarity;

        // Apply threshold (similarity threshold, not distance)
        if (options.threshold !== undefined && similarity < options.threshold) {
          return null;
        }

        return { entry, score: similarity, distance };
      })
      .filter((r): r is SearchResult => r !== null);

    // Sort by score and limit
    results.sort((a, b) => b.score - a.score);

    this.stats.queryCount++;
    this.stats.totalQueryTime += Date.now() - startTime;

    return results.slice(0, options.k);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Bulk insert entries
   */
  async bulkInsert(entries: MemoryEntry[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    if (entries.length === 0) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO memory_entries
      (id, key, content, type, namespace, tags, metadata, embedding, session_id,
       owner_id, access_level, created_at, updated_at, expires_at, version,
       "references", access_count, last_accessed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insert = this.db.transaction((entries: MemoryEntry[]) => {
      for (const entry of entries) {
        stmt.run(
          entry.id,
          entry.key,
          entry.content,
          entry.type,
          entry.namespace,
          JSON.stringify(entry.tags),
          JSON.stringify(entry.metadata),
          entry.embedding ? Buffer.from(entry.embedding.buffer) : null,
          entry.sessionId || null,
          entry.ownerId || null,
          entry.accessLevel,
          entry.createdAt,
          entry.updatedAt,
          entry.expiresAt || null,
          entry.version,
          JSON.stringify(entry.references),
          entry.accessCount,
          entry.lastAccessedAt
        );
      }
    });

    insert(entries);
    this.emit('bulkInserted', entries.length);
  }

  /**
   * Bulk delete entries
   */
  async bulkDelete(ids: string[]): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    if (ids.length === 0) return 0;

    const placeholders = ids.map(() => '?').join(', ');
    const result = this.db
      .prepare(`DELETE FROM memory_entries WHERE id IN (${placeholders})`)
      .run(...ids);

    return result.changes;
  }

  /**
   * Get entry count
   */
  async count(namespace?: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    if (namespace) {
      const result = this.db
        .prepare('SELECT COUNT(*) as count FROM memory_entries WHERE namespace = ?')
        .get(namespace) as { count: number };
      return result.count;
    }

    const result = this.db
      .prepare('SELECT COUNT(*) as count FROM memory_entries')
      .get() as { count: number };
    return result.count;
  }

  /**
   * List all namespaces
   */
  async listNamespaces(): Promise<string[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = this.db
      .prepare('SELECT DISTINCT namespace FROM memory_entries')
      .all() as { namespace: string }[];

    return rows.map((r) => r.namespace);
  }

  /**
   * Clear all entries in a namespace
   */
  async clearNamespace(namespace: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db
      .prepare('DELETE FROM memory_entries WHERE namespace = ?')
      .run(namespace);

    return result.changes;
  }

  /**
   * Get backend statistics
   */
  async getStats(): Promise<BackendStats> {
    if (!this.db) throw new Error('Database not initialized');

    const totalEntries = await this.count();
    const namespaces = await this.listNamespaces();

    const entriesByNamespace: Record<string, number> = {};
    for (const ns of namespaces) {
      entriesByNamespace[ns] = await this.count(ns);
    }

    // Get database size
    const pageCount = this.db.pragma('page_count', { simple: true }) as number;
    const pageSize = this.db.pragma('page_size', { simple: true }) as number;
    const dbSizeBytes = pageCount * pageSize;

    // Get type breakdown
    const typeRows = this.db.prepare(`
      SELECT type, COUNT(*) as count FROM memory_entries GROUP BY type
    `).all() as { type: MemoryType; count: number }[];

    const entriesByType: Record<MemoryType, number> = {
      episodic: 0,
      semantic: 0,
      procedural: 0,
      working: 0,
      cache: 0,
    };
    for (const row of typeRows) {
      entriesByType[row.type] = row.count;
    }

    return {
      totalEntries,
      entriesByNamespace,
      entriesByType,
      memoryUsage: dbSizeBytes,
      avgQueryTime: this.stats.queryCount > 0 ? this.stats.totalQueryTime / this.stats.queryCount : 0,
      avgSearchTime: this.stats.queryCount > 0 ? this.stats.totalQueryTime / this.stats.queryCount : 0,
    };
  }

  /**
   * Perform health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check database (storage)
    let storageHealth: ComponentHealth;
    const storageStart = Date.now();
    try {
      if (this.db) {
        this.db.prepare('SELECT 1').get();
        storageHealth = {
          status: 'healthy',
          latency: Date.now() - storageStart,
        };
      } else {
        storageHealth = {
          status: 'unhealthy',
          latency: 0,
          message: 'Database not initialized',
        };
        issues.push('Database not initialized');
      }
    } catch (error) {
      storageHealth = {
        status: 'unhealthy',
        latency: Date.now() - storageStart,
        message: String(error),
      };
      issues.push(`Database error: ${error}`);
    }

    // Check FTS5 (index)
    const indexHealth: ComponentHealth = {
      status: this.ftsAvailable ? 'healthy' : 'degraded',
      latency: 0,
      message: this.ftsAvailable
        ? `Tokenizer: ${this.getActiveTokenizer()}`
        : 'FTS5 not available, using LIKE fallback',
    };
    if (!this.ftsAvailable) {
      recommendations.push('Enable FTS5 for better search performance');
    }

    // Check CJK optimization (cache - repurpose for CJK status)
    const cacheHealth: ComponentHealth = {
      status: this.isCjkOptimized() ? 'healthy' : 'degraded',
      latency: 0,
      message: this.isCjkOptimized()
        ? 'Trigram tokenizer active for CJK'
        : 'CJK using fallback search',
    };
    if (!this.isCjkOptimized()) {
      recommendations.push('Use trigram tokenizer for proper CJK (Japanese/Chinese/Korean) support');
    }

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (storageHealth.status === 'unhealthy') {
      status = 'unhealthy';
    } else if (indexHealth.status === 'degraded' || cacheHealth.status === 'degraded') {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return {
      status,
      timestamp: Date.now(),
      components: {
        storage: storageHealth,
        index: indexHealth,
        cache: cacheHealth,
      },
      issues,
      recommendations,
    };
  }

  /**
   * Get the underlying database for advanced operations
   */
  getDatabase(): Database.Database | null {
    return this.db;
  }

  /**
   * Rebuild FTS index
   */
  async rebuildFtsIndex(): Promise<void> {
    if (!this.db || !this.ftsAvailable) return;

    this.db.exec("INSERT INTO memory_fts(memory_fts) VALUES('rebuild')");

    if (this.config.verbose) {
      console.log('[BetterSqlite3] FTS index rebuilt');
    }
  }

  /**
   * Convert database row to MemoryEntry
   */
  private rowToEntry(row: Record<string, unknown>): MemoryEntry {
    let embedding: Float32Array | undefined;
    if (row.embedding) {
      const buffer = row.embedding as Buffer;
      embedding = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
    }

    return {
      id: row.id as string,
      key: row.key as string,
      content: row.content as string,
      embedding,
      type: row.type as MemoryType,
      namespace: row.namespace as string,
      tags: JSON.parse((row.tags as string) || '[]'),
      metadata: JSON.parse((row.metadata as string) || '{}'),
      sessionId: row.session_id as string | undefined,
      ownerId: row.owner_id as string | undefined,
      accessLevel: row.access_level as MemoryEntry['accessLevel'],
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      expiresAt: row.expires_at as number | undefined,
      version: row.version as number,
      references: JSON.parse((row.references as string) || '[]'),
      accessCount: row.access_count as number,
      lastAccessedAt: row.last_accessed_at as number,
    };
  }
}

/**
 * Create a BetterSqlite3 backend with default CJK support
 */
export function createBetterSqlite3Backend(
  config?: Partial<BetterSqlite3BackendConfig>
): BetterSqlite3Backend {
  return new BetterSqlite3Backend({
    ...config,
    ftsTokenizer: config?.ftsTokenizer || 'trigram', // Default to trigram for CJK
  });
}

/**
 * Create a BetterSqlite3 backend with lindera extension for advanced Japanese
 */
export function createJapaneseOptimizedBackend(
  config: Partial<BetterSqlite3BackendConfig> & { linderaPath: string }
): BetterSqlite3Backend {
  return new BetterSqlite3Backend({
    ...config,
    extensionPath: config.linderaPath,
    customTokenizer: 'lindera_tokenizer',
  });
}

export default BetterSqlite3Backend;
