/**
 * Project-Scoped Memory Types
 *
 * Type definitions for the AgentKits memory system.
 * Designed for project-level memory stored in .claude/memory/
 *
 * @module @agentkits/memory/types
 */

// ===== Core Memory Entry Types =====

/**
 * Memory entry type classification (matches existing .claude/memory/*.md structure)
 */
export type MemoryType =
  | 'episodic'    // Time-based: active-context, session-state, progress
  | 'semantic'    // Facts: project-context, patterns
  | 'procedural'  // How-to: decisions, errors
  | 'working'     // Short-term operational memory
  | 'cache';      // Temporary cached data

/**
 * Access level for memory entries
 */
export type AccessLevel =
  | 'private'     // Only this session
  | 'project'     // All sessions in this project
  | 'shared';     // Shared across projects (future)

/**
 * Distance metrics for vector similarity search
 */
export type DistanceMetric =
  | 'cosine'      // Cosine similarity (default)
  | 'euclidean'   // Euclidean distance (L2)
  | 'dot'         // Dot product
  | 'manhattan';  // Manhattan distance (L1)

// ===== Memory Entry =====

/**
 * Core memory entry structure with optional vector embedding
 */
export interface MemoryEntry {
  /** Unique identifier */
  id: string;

  /** Human-readable key for retrieval (e.g., 'active-context', 'auth-pattern') */
  key: string;

  /** Actual content of the memory */
  content: string;

  /** Vector embedding for semantic search (Float32Array for efficiency) */
  embedding?: Float32Array;

  /** Type of memory */
  type: MemoryType;

  /** Namespace for organization (maps to old .md file categories) */
  namespace: string;

  /** Tags for categorization and filtering */
  tags: string[];

  /** Additional metadata */
  metadata: Record<string, unknown>;

  /** Session ID that created this entry */
  sessionId?: string;

  /** Owner ID for multi-user scenarios */
  ownerId?: string;

  /** Access level */
  accessLevel: AccessLevel;

  /** Creation timestamp */
  createdAt: number;

  /** Last update timestamp */
  updatedAt: number;

  /** Expiration timestamp (optional) */
  expiresAt?: number;

  /** Version number for optimistic locking */
  version: number;

  /** References to other memory entries */
  references: string[];

  /** Access count for usage tracking */
  accessCount: number;

  /** Last access timestamp */
  lastAccessedAt: number;
}

/**
 * Input for creating a new memory entry
 */
export interface MemoryEntryInput {
  key: string;
  content: string;
  type?: MemoryType;
  namespace?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  sessionId?: string;
  accessLevel?: AccessLevel;
  expiresAt?: number;
  references?: string[];
}

/**
 * Partial update for a memory entry
 */
export interface MemoryEntryUpdate {
  content?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  accessLevel?: AccessLevel;
  expiresAt?: number;
  references?: string[];
}

// ===== Query Types =====

/**
 * Query type for memory retrieval
 */
export type QueryType =
  | 'semantic'    // Vector similarity search
  | 'exact'       // Exact key match
  | 'prefix'      // Key prefix match
  | 'tag'         // Tag-based search
  | 'hybrid';     // Combined semantic + filters

/**
 * Memory query specification
 */
export interface MemoryQuery {
  /** Type of query to perform */
  type: QueryType;

  /** Content for semantic search (will be embedded) */
  content?: string;

  /** Pre-computed embedding for semantic search */
  embedding?: Float32Array;

  /** Exact key to match */
  key?: string;

  /** Key prefix to match */
  keyPrefix?: string;

  /** Namespace filter */
  namespace?: string;

  /** Tag filters (entries must have all specified tags) */
  tags?: string[];

  /** Memory type filter */
  memoryType?: MemoryType;

  /** Session ID filter */
  sessionId?: string;

  /** Owner ID filter */
  ownerId?: string;

  /** Access level filter */
  accessLevel?: AccessLevel;

  /** Metadata filters */
  metadata?: Record<string, unknown>;

  /** Time range filters */
  createdAfter?: number;
  createdBefore?: number;
  updatedAfter?: number;
  updatedBefore?: number;

  /** Maximum number of results */
  limit: number;

  /** Offset for pagination */
  offset?: number;

  /** Minimum similarity threshold (0-1) for semantic search */
  threshold?: number;

  /** Include expired entries */
  includeExpired?: boolean;

  /** Distance metric for semantic search */
  distanceMetric?: DistanceMetric;
}

/**
 * Search result with similarity score
 */
export interface SearchResult {
  /** The memory entry */
  entry: MemoryEntry;

  /** Similarity score (0-1, higher is better) */
  score: number;

  /** Distance from query vector */
  distance: number;
}

/**
 * Search options for vector search
 */
export interface SearchOptions {
  /** Number of results to return */
  k: number;

  /** Minimum similarity threshold (0-1) */
  threshold?: number;

  /** Distance metric */
  metric?: DistanceMetric;

  /** Additional filters to apply post-search */
  filters?: Partial<MemoryQuery>;
}

// ===== Backend Interface =====

/**
 * Memory backend interface for storage and retrieval
 */
export interface IMemoryBackend {
  /** Initialize the backend */
  initialize(): Promise<void>;

  /** Shutdown the backend */
  shutdown(): Promise<void>;

  /** Store a memory entry */
  store(entry: MemoryEntry): Promise<void>;

  /** Retrieve a memory entry by ID */
  get(id: string): Promise<MemoryEntry | null>;

  /** Retrieve a memory entry by key within a namespace */
  getByKey(namespace: string, key: string): Promise<MemoryEntry | null>;

  /** Update a memory entry */
  update(id: string, update: MemoryEntryUpdate): Promise<MemoryEntry | null>;

  /** Delete a memory entry */
  delete(id: string): Promise<boolean>;

  /** Query memory entries */
  query(query: MemoryQuery): Promise<MemoryEntry[]>;

  /** Semantic vector search */
  search(embedding: Float32Array, options: SearchOptions): Promise<SearchResult[]>;

  /** Bulk insert entries */
  bulkInsert(entries: MemoryEntry[]): Promise<void>;

  /** Bulk delete entries */
  bulkDelete(ids: string[]): Promise<number>;

  /** Get entry count */
  count(namespace?: string): Promise<number>;

  /** List all namespaces */
  listNamespaces(): Promise<string[]>;

  /** Clear all entries in a namespace */
  clearNamespace(namespace: string): Promise<number>;

  /** Get backend statistics */
  getStats(): Promise<BackendStats>;

  /** Perform health check */
  healthCheck(): Promise<HealthCheckResult>;
}

/**
 * Backend statistics
 */
export interface BackendStats {
  /** Total number of entries */
  totalEntries: number;

  /** Entries by namespace */
  entriesByNamespace: Record<string, number>;

  /** Entries by type */
  entriesByType: Record<MemoryType, number>;

  /** Total memory usage in bytes */
  memoryUsage: number;

  /** Cache statistics */
  cacheStats?: CacheStats;

  /** Average query time in milliseconds */
  avgQueryTime: number;

  /** Average search time in milliseconds */
  avgSearchTime: number;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  /** Overall health status */
  status: 'healthy' | 'degraded' | 'unhealthy';

  /** Individual component health */
  components: {
    storage: ComponentHealth;
    index: ComponentHealth;
    cache: ComponentHealth;
  };

  /** Health check timestamp */
  timestamp: number;

  /** Any issues detected */
  issues: string[];

  /** Recommendations for improvement */
  recommendations: string[];
}

/**
 * Individual component health status
 */
export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency: number;
  message?: string;
}

// ===== Cache Types =====

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Maximum number of entries in the cache */
  maxSize: number;

  /** Default TTL in milliseconds */
  ttl: number;

  /** Enable LRU eviction */
  lruEnabled: boolean;

  /** Maximum memory usage in bytes */
  maxMemory?: number;

  /** Enable write-through caching (write to backend immediately) */
  writeThrough?: boolean;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Number of entries in cache */
  size: number;

  /** Cache hit rate (0-1) */
  hitRate: number;

  /** Total cache hits */
  hits: number;

  /** Total cache misses */
  misses: number;

  /** Total evictions */
  evictions: number;

  /** Memory usage in bytes */
  memoryUsage: number;
}

/**
 * Cached entry wrapper
 */
export interface CachedEntry<T> {
  /** The cached data */
  data: T;

  /** When the entry was cached */
  cachedAt: number;

  /** When the entry expires */
  expiresAt: number;

  /** Last access timestamp */
  lastAccessedAt: number;

  /** Access count */
  accessCount: number;
}

// ===== Session Types =====

/**
 * Session information for tracking Claude Code sessions
 */
export interface SessionInfo {
  /** Session ID */
  id: string;

  /** Session start time */
  startedAt: number;

  /** Session end time (if ended) */
  endedAt?: number;

  /** Summary of work done */
  summary?: string;

  /** Status */
  status: 'active' | 'completed' | 'abandoned';

  /** Last checkpoint */
  lastCheckpoint?: string;
}

// ===== Event Types =====

/**
 * Memory event types for index operations
 */
export type MemoryEventType =
  | 'insert'
  | 'update'
  | 'delete'
  | 'search'
  | 'rebuild'
  | 'resize';

/**
 * Memory event for tracking index operations
 */
export interface MemoryEvent {
  /** Event type */
  type: MemoryEventType;

  /** Entry ID (if applicable) */
  entryId?: string;

  /** Timestamp */
  timestamp: number;

  /** Additional event data */
  data?: Record<string, unknown>;
}

/**
 * Handler function for memory events
 */
export type MemoryEventHandler = (event: MemoryEvent) => void | Promise<void>;

// ===== Utility Types =====

/**
 * Embedding generator function type
 */
export type EmbeddingGenerator = (content: string) => Promise<Float32Array>;

/**
 * Generates a unique memory ID
 */
export function generateMemoryId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `mem_${timestamp}_${random}`;
}

/**
 * Generates a unique session ID
 */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `ses_${timestamp}_${random}`;
}

/**
 * Creates a default memory entry
 */
export function createDefaultEntry(input: MemoryEntryInput): MemoryEntry {
  const now = Date.now();
  return {
    id: generateMemoryId(),
    key: input.key,
    content: input.content,
    type: input.type || 'semantic',
    namespace: input.namespace || 'default',
    tags: input.tags || [],
    metadata: input.metadata || {},
    sessionId: input.sessionId,
    accessLevel: input.accessLevel || 'project',
    createdAt: now,
    updatedAt: now,
    expiresAt: input.expiresAt,
    version: 1,
    references: input.references || [],
    accessCount: 0,
    lastAccessedAt: now,
  };
}

/**
 * Default namespaces matching existing .claude/memory/*.md structure
 */
export const DEFAULT_NAMESPACES = {
  CONTEXT: 'context',           // project-context.md
  ACTIVE: 'active-context',     // active-context.md
  SESSION: 'session-state',     // session-state.md
  PROGRESS: 'progress',         // progress.md
  PATTERNS: 'patterns',         // patterns.md
  DECISIONS: 'decisions',       // decisions.md
  ERRORS: 'errors',             // errors.md
} as const;

/**
 * Maps namespace to memory type
 */
export const NAMESPACE_TYPE_MAP: Record<string, MemoryType> = {
  [DEFAULT_NAMESPACES.CONTEXT]: 'semantic',
  [DEFAULT_NAMESPACES.ACTIVE]: 'episodic',
  [DEFAULT_NAMESPACES.SESSION]: 'episodic',
  [DEFAULT_NAMESPACES.PROGRESS]: 'episodic',
  [DEFAULT_NAMESPACES.PATTERNS]: 'semantic',
  [DEFAULT_NAMESPACES.DECISIONS]: 'procedural',
  [DEFAULT_NAMESPACES.ERRORS]: 'procedural',
};
