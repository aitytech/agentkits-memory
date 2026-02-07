/**
 * @agentkits/memory - Project-Scoped Memory System
 *
 * Provides persistent memory for Claude Code sessions within a project.
 * Stores data in .claude/memory/memory.db using SQLite with sqlite-vec
 * for vector indexing and semantic search.
 *
 * @module @agentkits/memory
 *
 * @example
 * ```typescript
 * import { ProjectMemoryService } from '@agentkits/memory';
 *
 * // Initialize memory for current project
 * const memory = new ProjectMemoryService('.claude/memory');
 * await memory.initialize();
 *
 * // Store an entry
 * await memory.store({
 *   key: 'auth-pattern',
 *   content: 'Use JWT with refresh tokens for authentication',
 *   namespace: 'patterns',
 *   tags: ['auth', 'security'],
 * });
 *
 * // Query entries
 * const patterns = await memory.query({
 *   type: 'hybrid',
 *   namespace: 'patterns',
 *   tags: ['auth'],
 *   limit: 10,
 * });
 *
 * // Semantic search (if embeddings enabled)
 * const similar = await memory.semanticSearch('how to authenticate users', 5);
 *
 * // Session management
 * await memory.startSession();
 * await memory.checkpoint('Completed authentication setup');
 * await memory.endSession('Successfully implemented auth');
 * ```
 */

import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import {
  IMemoryBackend,
  MemoryEntry,
  MemoryEntryInput,
  MemoryEntryUpdate,
  MemoryQuery,
  SearchResult,
  SearchOptions,
  BackendStats,
  HealthCheckResult,
  EmbeddingGenerator,
  SessionInfo,
  createDefaultEntry,
  generateSessionId,
  DEFAULT_NAMESPACES,
  NAMESPACE_TYPE_MAP,
} from './types.js';
import { BetterSqlite3Backend } from './better-sqlite3-backend.js';
import { CacheManager } from './cache-manager.js';

// Re-export types
export * from './types.js';
export { CacheManager, TieredCacheManager } from './cache-manager.js';
export {
  LocalEmbeddingsService,
  createLocalEmbeddings,
  createEmbeddingGenerator,
  PersistentEmbeddingCache,
  createPersistentEmbeddingCache,
} from './embeddings/index.js';

export {
  HybridSearchEngine,
  createHybridSearchEngine,
  TokenEconomicsTracker,
  createTokenEconomicsTracker,
} from './search/index.js';

export {
  BetterSqlite3Backend,
  createBetterSqlite3Backend,
  createJapaneseOptimizedBackend,
} from './better-sqlite3-backend.js';

/**
 * Create a better-sqlite3 backend with FTS5 trigram tokenizer and sqlite-vec
 */
export function createAutoBackend(
  databasePath: string,
  options: { verbose?: boolean; dimensions?: number } = {}
): IMemoryBackend {
  return new BetterSqlite3Backend({
    databasePath,
    ftsTokenizer: 'trigram', // Full CJK support
    verbose: options.verbose,
    enableVectorSearch: true,
    vectorDimensions: options.dimensions || 384,
  });
}

/**
 * Configuration for ProjectMemoryService
 */
export interface ProjectMemoryConfig {
  /** Base directory for memory storage (default: .claude/memory) */
  baseDir: string;

  /** Database filename (default: memory.db) */
  dbFilename: string;

  /**
   * @deprecated This option is kept for backwards compatibility but has no effect.
   * Vector search is now handled by sqlite-vec in the backend.
   */
  enableVectorIndex?: boolean;

  /** Vector dimensions for embeddings (default: 384 for local models) */
  dimensions: number;

  /** Embedding generator function (optional) */
  embeddingGenerator?: EmbeddingGenerator;

  /** Enable caching */
  cacheEnabled: boolean;

  /** Cache size (number of entries) */
  cacheSize: number;

  /** Cache TTL in milliseconds */
  cacheTtl: number;

  /** Auto-persist interval in milliseconds */
  autoPersistInterval: number;

  /** Maximum entries before cleanup */
  maxEntries: number;

  /** Enable verbose logging */
  verbose: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ProjectMemoryConfig = {
  baseDir: '.claude/memory',
  dbFilename: 'memory.db',
  dimensions: 384, // Local model dimensions (e.g., all-MiniLM-L6-v2)
  cacheEnabled: true,
  cacheSize: 1000,
  cacheTtl: 300000, // 5 minutes
  autoPersistInterval: 10000, // 10 seconds
  maxEntries: 100000,
  verbose: false,
};

/**
 * Project-Scoped Memory Service
 *
 * High-level interface for project memory that provides:
 * - Persistent storage in .claude/memory/memory.db
 * - Session tracking and checkpoints
 * - Vector search with sqlite-vec (persisted, no rebuild needed)
 * - Migration from existing markdown files
 * - Backward-compatible markdown exports
 */
export class ProjectMemoryService extends EventEmitter implements IMemoryBackend {
  private config: ProjectMemoryConfig;
  private backend: IMemoryBackend | null = null;
  private cache: CacheManager<MemoryEntry> | null = null;
  private initialized: boolean = false;
  private currentSession: SessionInfo | null = null;

  constructor(baseDirOrConfig: string | Partial<ProjectMemoryConfig> = {}) {
    super();

    // Handle string (baseDir) or config object
    const configInput = typeof baseDirOrConfig === 'string'
      ? { baseDir: baseDirOrConfig }
      : baseDirOrConfig;

    this.config = { ...DEFAULT_CONFIG, ...configInput };

    // Ensure directory exists
    if (!existsSync(this.config.baseDir)) {
      mkdirSync(this.config.baseDir, { recursive: true });
    }

    // Backend is created lazily in initialize() for auto-detection

    // Initialize cache if enabled
    if (this.config.cacheEnabled) {
      this.cache = new CacheManager<MemoryEntry>({
        maxSize: this.config.cacheSize,
        ttl: this.config.cacheTtl,
        lruEnabled: true,
      });
    }

    // Note: Vector search is handled by sqlite-vec in the backend
  }

  // ===== Lifecycle =====

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create backend with better-sqlite3 (FTS5 trigram + sqlite-vec for vector search)
    const dbPath = path.join(this.config.baseDir, this.config.dbFilename);
    this.backend = new BetterSqlite3Backend({
      databasePath: dbPath,
      ftsTokenizer: 'trigram',
      verbose: this.config.verbose,
      enableVectorSearch: true,
      vectorDimensions: this.config.dimensions,
    });

    // Forward backend events (if backend is an EventEmitter)
    const backendAsEmitter = this.backend as unknown as EventEmitter | undefined;
    if (backendAsEmitter && typeof backendAsEmitter.on === 'function') {
      backendAsEmitter.on('entry:stored', (data) => this.emit('entry:stored', data));
      backendAsEmitter.on('entry:updated', (data) => this.emit('entry:updated', data));
      backendAsEmitter.on('entry:deleted', (data) => this.emit('entry:deleted', data));
      backendAsEmitter.on('persisted', (data) => this.emit('persisted', data));
    }

    await this.backend.initialize();

    // Note: No need to rebuild vector index - sqlite-vec persists to disk

    this.initialized = true;
    this.emit('initialized', { dbPath: path.join(this.config.baseDir, this.config.dbFilename) });
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    // End session if active
    if (this.currentSession) {
      await this.endSession('Session ended by shutdown');
    }

    // Shutdown components
    if (this.cache) {
      this.cache.shutdown();
    }

    if (this.backend) {
      await this.backend.shutdown();
    }
    this.initialized = false;
    this.emit('shutdown');
  }

  // ===== Migration Methods =====

  /**
   * Check if migration is needed (entries with embeddings not yet indexed in sqlite-vec)
   */
  async needsMigration(): Promise<{ needed: boolean; count: number }> {
    const backend = this.ensureInitialized();
    if ('needsMigration' in backend && typeof backend.needsMigration === 'function') {
      return backend.needsMigration();
    }
    return { needed: false, count: 0 };
  }

  /**
   * Migrate existing embeddings to sqlite-vec index.
   * Call this to index any entries that have embeddings but are not yet in the vector index.
   */
  async migrateEmbeddingsToVec(): Promise<{ migrated: number; skipped: number; errors: number }> {
    const backend = this.ensureInitialized();
    if ('migrateEmbeddingsToVec' in backend && typeof backend.migrateEmbeddingsToVec === 'function') {
      return backend.migrateEmbeddingsToVec();
    }
    return { migrated: 0, skipped: 0, errors: 0 };
  }

  // ===== IMemoryBackend Implementation =====

  async store(entry: MemoryEntry): Promise<void> {
    const backend = this.ensureInitialized();

    // Generate embedding if enabled and not present
    if (this.config.embeddingGenerator && !entry.embedding) {
      try {
        entry.embedding = await this.config.embeddingGenerator(entry.content);
      } catch (error) {
        if (this.config.verbose) {
          console.warn(`Failed to generate embedding: ${(error as Error).message}`);
        }
      }
    }

    // Add session ID if session active
    if (this.currentSession && !entry.sessionId) {
      entry.sessionId = this.currentSession.id;
    }

    // Store in backend (sqlite-vec handles vector storage automatically)
    await backend.store(entry);

    // Update cache
    if (this.cache) {
      this.cache.set(entry.id, entry);
      this.cache.set(`${entry.namespace}:${entry.key}`, entry);
    }
  }

  async get(id: string): Promise<MemoryEntry | null> {
    const backend = this.ensureInitialized();

    // Check cache first
    if (this.cache) {
      const cached = this.cache.get(id);
      if (cached) return cached;
    }

    const entry = await backend.get(id);

    // Update cache
    if (entry && this.cache) {
      this.cache.set(id, entry);
    }

    return entry;
  }

  async getByKey(namespace: string, key: string): Promise<MemoryEntry | null> {
    const backend = this.ensureInitialized();

    const cacheKey = `${namespace}:${key}`;

    // Check cache first
    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    const entry = await backend.getByKey(namespace, key);

    // Update cache
    if (entry && this.cache) {
      this.cache.set(cacheKey, entry);
      this.cache.set(entry.id, entry);
    }

    return entry;
  }

  async update(id: string, update: MemoryEntryUpdate): Promise<MemoryEntry | null> {
    const backend = this.ensureInitialized();

    const updated = await backend.update(id, update);

    if (updated) {
      // Regenerate embedding if content changed
      if (update.content && this.config.embeddingGenerator) {
        try {
          updated.embedding = await this.config.embeddingGenerator(updated.content);
          // Store will automatically update sqlite-vec
          await backend.store(updated);
        } catch {
          // Ignore embedding errors
        }
      }

      // Update cache
      if (this.cache) {
        this.cache.set(id, updated);
        this.cache.set(`${updated.namespace}:${updated.key}`, updated);
      }
    }

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const backend = this.ensureInitialized();

    const entry = await this.get(id);
    if (!entry) return false;

    // Backend delete will automatically clean up sqlite-vec
    const result = await backend.delete(id);

    if (result) {
      // Remove from cache
      if (this.cache) {
        this.cache.delete(id);
        this.cache.delete(`${entry.namespace}:${entry.key}`);
      }
    }

    return result;
  }

  async query(query: MemoryQuery): Promise<MemoryEntry[]> {
    const backend = this.ensureInitialized();

    // If no content search term, just use basic query (ordered by date)
    if (!query.content && !query.embedding) {
      return backend.query(query);
    }

    // Handle different search types
    // 'semantic' = vector only, 'hybrid' = combined, others fall back to FTS
    const searchType = query.type || 'hybrid';
    const limit = query.limit || 100;

    // For exact, prefix, tag search - use backend directly
    if (searchType === 'exact' || searchType === 'prefix' || searchType === 'tag') {
      return backend.query(query);
    }

    // For semantic or hybrid search, need embedding
    let embedding = query.embedding;
    if (!embedding && query.content && this.config.embeddingGenerator) {
      try {
        embedding = await this.config.embeddingGenerator(query.content);
      } catch (error) {
        console.warn('[ProjectMemoryService] Failed to generate embedding, falling back to text search');
        const betterBackend = backend as BetterSqlite3Backend;
        if (typeof betterBackend.searchFts === 'function') {
          return betterBackend.searchFts(query.content, {
            namespace: query.namespace,
            limit,
          });
        }
        return backend.query(query);
      }
    }

    if (!embedding) {
      // No embedding available, fall back to FTS
      const betterBackend = backend as BetterSqlite3Backend;
      if (query.content && typeof betterBackend.searchFts === 'function') {
        return betterBackend.searchFts(query.content, {
          namespace: query.namespace,
          limit,
        });
      }
      return backend.query(query);
    }

    // For semantic-only (vector) search
    if (searchType === 'semantic') {
      const results = await this.search(embedding, {
        k: limit,
        threshold: query.threshold,
      });

      // Filter by namespace if specified
      const filtered = query.namespace
        ? results.filter((r) => r.entry.namespace === query.namespace)
        : results;

      return filtered.map((r) => r.entry);
    }

    // For hybrid search: combine FTS and vector results
    const vectorResults = await this.search(embedding, {
      k: limit * 2, // Get more candidates for fusion
      threshold: 0.1, // Low threshold to get more candidates
    });

    // Filter vector results by namespace if specified
    const filteredVectorResults = query.namespace
      ? vectorResults.filter((r) => r.entry.namespace === query.namespace)
      : vectorResults;

    // Get FTS results
    const betterBackend = backend as BetterSqlite3Backend;
    let ftsResults: MemoryEntry[] = [];
    if (query.content && typeof betterBackend.searchFts === 'function') {
      ftsResults = await betterBackend.searchFts(query.content, {
        namespace: query.namespace,
        limit: limit * 2,
      });
    }

    // Combine and rank results using score fusion
    const scoreMap = new Map<string, { entry: MemoryEntry; score: number; vectorScore: number; ftsScore: number }>();

    // Add vector results with scores (semantic weight: 0.7)
    filteredVectorResults.forEach((r) => {
      const vectorScore = r.score; // Already 0-1 similarity
      scoreMap.set(r.entry.id, {
        entry: r.entry,
        score: vectorScore * 0.7,
        vectorScore,
        ftsScore: 0,
      });
    });

    // Add FTS results with scores (keyword weight: 0.3)
    ftsResults.forEach((entry, index) => {
      const ftsScore = 1 - (index / (ftsResults.length || 1)); // Rank-based score
      const existing = scoreMap.get(entry.id);
      if (existing) {
        existing.ftsScore = ftsScore;
        existing.score += ftsScore * 0.3;
      } else {
        scoreMap.set(entry.id, {
          entry,
          score: ftsScore * 0.3,
          vectorScore: 0,
          ftsScore,
        });
      }
    });

    // Sort by combined score and return top results
    const sorted = Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Attach scores to entries for debugging/display
    return sorted.map((r) => ({
      ...r.entry,
      _score: r.score,
      _vectorScore: r.vectorScore,
      _ftsScore: r.ftsScore,
    }));
  }

  async search(embedding: Float32Array, options: SearchOptions): Promise<SearchResult[]> {
    const backend = this.ensureInitialized();

    // Use backend's sqlite-vec search (or brute-force fallback)
    return backend.search(embedding, options);
  }

  async bulkInsert(entries: MemoryEntry[]): Promise<void> {
    this.ensureInitialized(); // store() already gets backend

    for (const entry of entries) {
      await this.store(entry);
    }

    this.emit('bulk:inserted', { count: entries.length });
  }

  async bulkDelete(ids: string[]): Promise<number> {
    this.ensureInitialized();

    let count = 0;
    for (const id of ids) {
      const success = await this.delete(id);
      if (success) count++;
    }

    return count;
  }

  async count(namespace?: string): Promise<number> {
    const backend = this.ensureInitialized();
    return backend.count(namespace);
  }

  async listNamespaces(): Promise<string[]> {
    const backend = this.ensureInitialized();
    return backend.listNamespaces();
  }

  async clearNamespace(namespace: string): Promise<number> {
    const backend = this.ensureInitialized();

    // Clear from cache
    if (this.cache) {
      this.cache.invalidatePattern(new RegExp(`^${namespace}:`));
    }

    return backend.clearNamespace(namespace);
  }

  async getStats(): Promise<BackendStats> {
    const backend = this.ensureInitialized();

    const stats = await backend.getStats();

    // Add cache stats if available
    if (this.cache) {
      stats.cacheStats = this.cache.getStats();
    }

    return stats;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const backend = this.ensureInitialized();
    return backend.healthCheck();
  }

  // ===== Convenience Methods =====

  /**
   * Store an entry from simple input
   */
  async storeEntry(input: MemoryEntryInput): Promise<MemoryEntry> {
    const entry = createDefaultEntry(input);
    await this.store(entry);
    return entry;
  }

  /**
   * Semantic search by content string
   */
  async semanticSearch(
    content: string,
    k: number = 10,
    threshold?: number
  ): Promise<SearchResult[]> {
    if (!this.config.embeddingGenerator) {
      throw new Error('Embedding generator not configured. Cannot perform semantic search.');
    }

    const embedding = await this.config.embeddingGenerator(content);
    return this.search(embedding, { k, threshold });
  }

  /**
   * Get entries by namespace (convenience method)
   */
  async getByNamespace(namespace: string, limit: number = 100): Promise<MemoryEntry[]> {
    return this.query({
      type: 'hybrid',
      namespace,
      limit,
    });
  }

  /**
   * Get or create an entry
   */
  async getOrCreate(
    namespace: string,
    key: string,
    creator: () => MemoryEntryInput | Promise<MemoryEntryInput>
  ): Promise<MemoryEntry> {
    const existing = await this.getByKey(namespace, key);
    if (existing) return existing;

    const input = await creator();
    return this.storeEntry({ ...input, namespace, key });
  }

  // ===== Session Management =====

  /**
   * Start a new session
   */
  async startSession(): Promise<SessionInfo> {
    const session: SessionInfo = {
      id: generateSessionId(),
      startedAt: Date.now(),
      status: 'active',
    };

    this.currentSession = session;

    // Store session info
    await this.storeEntry({
      key: `session:${session.id}`,
      content: JSON.stringify(session),
      type: 'episodic',
      namespace: DEFAULT_NAMESPACES.SESSION,
      tags: ['session', 'active'],
      metadata: { sessionId: session.id },
    });

    this.emit('session:started', session);
    return session;
  }

  /**
   * Get current session
   */
  getCurrentSession(): SessionInfo | null {
    return this.currentSession;
  }

  /**
   * Create a checkpoint in current session
   */
  async checkpoint(description: string): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session. Call startSession() first.');
    }

    this.currentSession.lastCheckpoint = description;

    await this.storeEntry({
      key: `checkpoint:${this.currentSession.id}:${Date.now()}`,
      content: description,
      type: 'episodic',
      namespace: DEFAULT_NAMESPACES.SESSION,
      tags: ['checkpoint'],
      metadata: {
        sessionId: this.currentSession.id,
        timestamp: Date.now(),
      },
    });

    this.emit('session:checkpoint', { session: this.currentSession, description });
  }

  /**
   * End current session
   */
  async endSession(summary?: string): Promise<SessionInfo | null> {
    if (!this.currentSession) return null;

    this.currentSession.endedAt = Date.now();
    this.currentSession.summary = summary;
    this.currentSession.status = 'completed';

    // Update session entry
    const sessionEntry = await this.getByKey(
      DEFAULT_NAMESPACES.SESSION,
      `session:${this.currentSession.id}`
    );

    if (sessionEntry) {
      await this.update(sessionEntry.id, {
        content: JSON.stringify(this.currentSession),
        tags: ['session', 'completed'],
      });
    }

    const endedSession = { ...this.currentSession };
    this.currentSession = null;

    this.emit('session:ended', endedSession);
    return endedSession;
  }

  /**
   * Get recent sessions
   */
  async getRecentSessions(limit: number = 10): Promise<SessionInfo[]> {
    const entries = await this.query({
      type: 'hybrid',
      namespace: DEFAULT_NAMESPACES.SESSION,
      tags: ['session'],
      limit,
    });

    return entries
      .map((e) => {
        try {
          return JSON.parse(e.content) as SessionInfo;
        } catch {
          return null;
        }
      })
      .filter((s): s is SessionInfo => s !== null);
  }

  // ===== Private Methods =====

  private ensureInitialized(): IMemoryBackend {
    if (!this.initialized || !this.backend) {
      throw new Error('ProjectMemoryService not initialized. Call initialize() first.');
    }
    return this.backend;
  }
}

// ===== Factory Functions =====

/**
 * Create a memory service for the current project
 */
export function createProjectMemory(
  baseDir: string = '.claude/memory',
  options: Partial<ProjectMemoryConfig> = {}
): ProjectMemoryService {
  return new ProjectMemoryService({ baseDir, ...options });
}

/**
 * Create a memory service with embedding support
 */
export function createEmbeddingMemory(
  baseDir: string,
  embeddingGenerator: EmbeddingGenerator,
  dimensions: number = 384
): ProjectMemoryService {
  return new ProjectMemoryService({
    baseDir,
    embeddingGenerator,
    dimensions,
  });
}

// Default export
export default ProjectMemoryService;
