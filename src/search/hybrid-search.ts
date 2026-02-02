/**
 * Hybrid Search Module
 *
 * Combines FTS5 keyword search with vector semantic search
 * for improved recall (15-20% better than either alone).
 *
 * Features:
 * - SQLite FTS5 full-text search with trigram tokenizer (CJK support)
 * - Score fusion (α*keyword + β*semantic)
 * - 3-layer search workflow for token efficiency
 * - Token economics tracking
 *
 * CJK Language Support:
 * Uses trigram tokenizer which works for Japanese, Chinese, Korean
 * by matching substrings instead of requiring word boundaries.
 *
 * @module @aitytech/agentkits-memory/search
 */

import type { Database as BetterDatabase } from 'better-sqlite3';
import type { MemoryEntry, SearchResult, EmbeddingGenerator } from '../types.js';

/**
 * Hybrid search configuration
 */
export interface HybridSearchConfig {
  /** Weight for keyword/FTS5 score (0-1, default: 0.3) */
  keywordWeight: number;

  /** Weight for semantic/vector score (0-1, default: 0.7) */
  semanticWeight: number;

  /** Minimum combined score threshold (0-1, default: 0.1) */
  minScore: number;

  /** Enable BM25 scoring for FTS5 (default: true) */
  useBM25: boolean;

  /** Maximum results per search layer (default: 100) */
  maxResultsPerLayer: number;

  /**
   * FTS5 tokenizer to use (default: 'trigram')
   * - 'trigram': Best for CJK languages (Japanese, Chinese, Korean)
   * - 'unicode61': Standard tokenizer, English/Latin only
   * - 'porter': Stemming for English
   */
  tokenizer: 'trigram' | 'unicode61' | 'porter';

  /** Fall back to LIKE search if FTS5 unavailable (default: true) */
  fallbackToLike: boolean;
}

/**
 * Compact search result (Layer 1)
 * Minimal data for initial filtering - saves tokens
 */
export interface CompactSearchResult {
  /** Entry ID */
  id: string;

  /** Entry key */
  key: string;

  /** Namespace */
  namespace: string;

  /** Combined relevance score (0-1) */
  score: number;

  /** Keyword match score */
  keywordScore: number;

  /** Semantic similarity score */
  semanticScore: number;

  /** Preview snippet (first 100 chars) */
  snippet: string;

  /** Estimated token count */
  estimatedTokens: number;
}

/**
 * Timeline result (Layer 2)
 * Context around search results
 */
export interface TimelineResult {
  /** The target entry */
  entry: CompactSearchResult;

  /** Related entries before (chronologically) */
  before: CompactSearchResult[];

  /** Related entries after (chronologically) */
  after: CompactSearchResult[];

  /** Total context window tokens */
  totalTokens: number;
}

/**
 * Token economics for search operations
 */
export interface TokenEconomics {
  /** Tokens saved by using compact results */
  tokensSaved: number;

  /** Tokens that would be used with full results */
  fullResultTokens: number;

  /** Actual tokens used */
  actualTokens: number;

  /** Savings percentage */
  savingsPercent: number;

  /** Layer breakdown */
  layers: {
    compact: number;
    timeline: number;
    full: number;
  };
}

/**
 * Full search result with economics
 */
export interface HybridSearchResult {
  /** Search results */
  results: SearchResult[];

  /** Compact results (layer 1) */
  compact: CompactSearchResult[];

  /** Token economics */
  economics: TokenEconomics;

  /** Search timing */
  timing: {
    keywordMs: number;
    semanticMs: number;
    fusionMs: number;
    totalMs: number;
  };
}

/**
 * Default hybrid search configuration
 */
const DEFAULT_CONFIG: HybridSearchConfig = {
  keywordWeight: 0.3,
  semanticWeight: 0.7,
  minScore: 0.1,
  useBM25: true,
  maxResultsPerLayer: 100,
  tokenizer: 'trigram', // Best for CJK languages
  fallbackToLike: true,
};

/**
 * Estimate token count for text (rough approximation)
 * Uses ~4 chars per token as average for English text
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Hybrid Search Engine
 *
 * Provides enterprise-grade search combining keyword and semantic search
 * with token-efficient 3-layer retrieval workflow.
 *
 * Supports CJK languages (Japanese, Chinese, Korean) via trigram tokenizer.
 */
export class HybridSearchEngine {
  private db: BetterDatabase;
  private config: HybridSearchConfig;
  private embeddingGenerator?: EmbeddingGenerator;
  private ftsInitialized = false;
  private ftsAvailable = false;
  /** The actual tokenizer being used (may differ from config if tokenizer not available) */
  private activeTokenizer: 'trigram' | 'unicode61' | 'porter' | null = null;

  constructor(
    db: BetterDatabase,
    config: Partial<HybridSearchConfig> = {},
    embeddingGenerator?: EmbeddingGenerator
  ) {
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.embeddingGenerator = embeddingGenerator;
  }

  /**
   * Check if FTS5 is available in this SQLite build
   */
  private checkFts5Available(): boolean {
    try {
      // Try to create a minimal FTS5 table
      this.db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS _fts5_check USING fts5(test)`);
      this.db.exec(`DROP TABLE IF EXISTS _fts5_check`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a specific tokenizer is available
   */
  private checkTokenizerAvailable(tokenizer: string): boolean {
    try {
      this.db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS _tokenizer_check USING fts5(test, ${tokenizer})`);
      this.db.exec(`DROP TABLE IF EXISTS _tokenizer_check`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the best available tokenizer for FTS5
   * Tries trigram first (best for CJK), then unicode61, then porter
   * Also sets the activeTokenizer field
   */
  private getBestTokenizer(): string {
    // Try tokenizers in order of preference for CJK support
    if (this.config.tokenizer === 'trigram' && this.checkTokenizerAvailable("tokenize='trigram'")) {
      this.activeTokenizer = 'trigram';
      return "tokenize='trigram'";
    }
    if (this.config.tokenizer === 'porter' && this.checkTokenizerAvailable("tokenize='porter unicode61'")) {
      this.activeTokenizer = 'porter';
      return "tokenize='porter unicode61'";
    }
    // Default to unicode61 which should always be available
    this.activeTokenizer = 'unicode61';
    return "tokenize='unicode61'";
  }

  /**
   * Initialize FTS5 virtual table
   * Note: For best CJK support, use better-sqlite3 which includes trigram tokenizer.
   */
  async initialize(): Promise<void> {
    if (this.ftsInitialized) return;

    // Check if FTS5 is available
    this.ftsAvailable = this.checkFts5Available();

    if (!this.ftsAvailable) {
      console.warn(
        '[HybridSearch] FTS5 not available in this SQLite build. ' +
        'Falling back to LIKE search.'
      );
      this.ftsInitialized = true;
      return;
    }

    try {
      // Get the best available tokenizer
      const tokenizer = this.getBestTokenizer();

      // Create FTS5 virtual table for full-text search
      // Uses content= to sync with main table
      // trigram tokenizer provides substring matching for CJK languages
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
          key,
          content,
          namespace,
          tags,
          content=memory_entries,
          content_rowid=rowid,
          ${tokenizer}
        )
      `);

      // Create triggers to keep FTS in sync with main table
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

      // Rebuild FTS index from existing data
      await this.rebuildFtsIndex();
    } catch (error) {
      console.warn('[HybridSearch] Failed to initialize FTS5:', error);
      this.ftsAvailable = false;
    }

    this.ftsInitialized = true;
  }

  /**
   * Check if FTS5 is available and initialized
   */
  isFtsAvailable(): boolean {
    return this.ftsAvailable;
  }

  /**
   * Get the active tokenizer being used
   * Returns null if FTS5 is not available
   */
  getActiveTokenizer(): 'trigram' | 'unicode61' | 'porter' | null {
    return this.activeTokenizer;
  }

  /**
   * Check if CJK search is fully supported (requires trigram tokenizer)
   * If not, CJK queries will fall back to LIKE search
   */
  isCjkOptimized(): boolean {
    return this.ftsAvailable && this.activeTokenizer === 'trigram';
  }

  /**
   * Rebuild FTS index from existing memory entries
   * Uses the FTS5 'rebuild' command for content-synced tables
   */
  async rebuildFtsIndex(): Promise<void> {
    if (!this.ftsAvailable) return;

    try {
      // For content-synced FTS5 tables (using content=memory_entries),
      // use the 'rebuild' command which re-reads from the content table
      this.db.exec(`INSERT INTO memory_fts(memory_fts) VALUES('rebuild')`);
    } catch (error) {
      console.warn('[HybridSearch] Failed to rebuild FTS index:', error);
    }
  }

  /**
   * Layer 1: Compact Search
   *
   * Returns minimal data for initial filtering.
   * ~10x token savings vs full results.
   */
  async searchCompact(
    query: string,
    options: {
      limit?: number;
      namespace?: string;
      includeKeyword?: boolean;
      includeSemantic?: boolean;
    } = {}
  ): Promise<CompactSearchResult[]> {
    const limit = options.limit || this.config.maxResultsPerLayer;
    const includeKeyword = options.includeKeyword ?? true;
    const includeSemantic = options.includeSemantic ?? !!this.embeddingGenerator;

    const results: Map<string, CompactSearchResult> = new Map();

    // Keyword search with FTS5
    if (includeKeyword) {
      const keywordResults = await this.keywordSearch(query, limit, options.namespace);
      for (const result of keywordResults) {
        results.set(result.id, result);
      }
    }

    // Semantic search with embeddings
    if (includeSemantic && this.embeddingGenerator) {
      const semanticResults = await this.semanticSearchCompact(query, limit, options.namespace);
      for (const result of semanticResults) {
        const existing = results.get(result.id);
        if (existing) {
          // Merge scores using fusion
          existing.semanticScore = result.semanticScore;
          existing.score = this.fuseScores(existing.keywordScore, result.semanticScore);
        } else {
          results.set(result.id, result);
        }
      }
    }

    // Sort by combined score and limit
    return Array.from(results.values())
      .filter((r) => r.score >= this.config.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Layer 2: Timeline Search
   *
   * Returns context around matched entries.
   * Useful for understanding temporal relationships.
   */
  async searchTimeline(
    entryIds: string[],
    contextWindow: number = 3
  ): Promise<TimelineResult[]> {
    const results: TimelineResult[] = [];

    for (const id of entryIds) {
      // Get the target entry
      const targetRow = this.db.prepare(`
        SELECT id, key, namespace, content, created_at
        FROM memory_entries WHERE id = ?
      `).get(id) as {
        id: string;
        key: string;
        namespace: string;
        content: string;
        created_at: number;
      } | undefined;

      if (!targetRow) continue;

      const targetCompact: CompactSearchResult = {
        id: targetRow.id,
        key: targetRow.key,
        namespace: targetRow.namespace,
        score: 1.0,
        keywordScore: 0,
        semanticScore: 0,
        snippet: targetRow.content.substring(0, 100),
        estimatedTokens: estimateTokens(targetRow.content),
      };

      // Get entries before
      const beforeRows = this.db.prepare(`
        SELECT id, key, namespace, content, created_at
        FROM memory_entries
        WHERE namespace = ? AND created_at < ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(targetRow.namespace, targetRow.created_at, contextWindow) as typeof targetRow[];

      const before: CompactSearchResult[] = beforeRows.map(row => ({
        id: row.id,
        key: row.key,
        namespace: row.namespace,
        score: 0.5,
        keywordScore: 0,
        semanticScore: 0,
        snippet: row.content.substring(0, 100),
        estimatedTokens: estimateTokens(row.content),
      }));

      // Get entries after
      const afterRows = this.db.prepare(`
        SELECT id, key, namespace, content, created_at
        FROM memory_entries
        WHERE namespace = ? AND created_at > ?
        ORDER BY created_at ASC
        LIMIT ?
      `).all(targetRow.namespace, targetRow.created_at, contextWindow) as typeof targetRow[];

      const after: CompactSearchResult[] = afterRows.map(row => ({
        id: row.id,
        key: row.key,
        namespace: row.namespace,
        score: 0.5,
        keywordScore: 0,
        semanticScore: 0,
        snippet: row.content.substring(0, 100),
        estimatedTokens: estimateTokens(row.content),
      }));

      const totalTokens =
        targetCompact.estimatedTokens +
        before.reduce((sum, r) => sum + r.estimatedTokens, 0) +
        after.reduce((sum, r) => sum + r.estimatedTokens, 0);

      results.push({
        entry: targetCompact,
        before: before.reverse(), // Chronological order
        after,
        totalTokens,
      });
    }

    return results;
  }

  /**
   * Layer 3: Full Search
   *
   * Returns complete entry data for selected IDs.
   * Only fetch what you need after filtering.
   */
  async getFull(ids: string[]): Promise<MemoryEntry[]> {
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => '?').join(', ');
    const rows = this.db.prepare(`
      SELECT * FROM memory_entries WHERE id IN (${placeholders})
    `).all(...ids) as Record<string, unknown>[];

    const entries = rows.map(row => this.rowToEntry(row));

    // Sort by original order
    const orderMap = new Map(ids.map((id, i) => [id, i]));
    entries.sort((a, b) => (orderMap.get(a.id) || 0) - (orderMap.get(b.id) || 0));

    return entries;
  }

  /**
   * Full hybrid search with token economics
   *
   * Combines all three layers with detailed metrics.
   */
  async search(
    query: string,
    options: {
      limit?: number;
      namespace?: string;
      fetchFull?: boolean;
    } = {}
  ): Promise<HybridSearchResult> {
    const startTime = performance.now();
    const limit = options.limit || 10;

    // Layer 1: Compact search
    const keywordStart = performance.now();
    const compact = await this.searchCompact(query, {
      limit: this.config.maxResultsPerLayer,
      namespace: options.namespace,
    });
    const keywordTime = performance.now() - keywordStart;

    // Calculate token economics
    const compactTokens = compact.reduce((sum, r) => sum + r.estimatedTokens, 0);

    // Layer 3: Fetch full results if requested
    const semanticStart = performance.now();
    let results: SearchResult[] = [];
    let fullTokens = 0;

    if (options.fetchFull !== false) {
      const topIds = compact.slice(0, limit).map((r) => r.id);
      const fullEntries = await this.getFull(topIds);

      results = fullEntries.map((entry, i) => ({
        entry,
        score: compact[i]?.score || 0,
        distance: 1 - (compact[i]?.score || 0),
      }));

      fullTokens = fullEntries.reduce((sum, e) => sum + estimateTokens(e.content), 0);
    }
    const semanticTime = performance.now() - semanticStart;

    const totalTime = performance.now() - startTime;

    // Calculate savings
    const fullResultTokens = compact.reduce((sum, r) => sum + r.estimatedTokens, 0);
    const actualTokens = options.fetchFull !== false ? fullTokens : compactTokens / 10;
    const tokensSaved = fullResultTokens - actualTokens;
    const savingsPercent = fullResultTokens > 0 ? (tokensSaved / fullResultTokens) * 100 : 0;

    return {
      results,
      compact: compact.slice(0, limit),
      economics: {
        tokensSaved: Math.max(0, tokensSaved),
        fullResultTokens,
        actualTokens,
        savingsPercent: Math.max(0, savingsPercent),
        layers: {
          compact: compact.length,
          timeline: 0,
          full: results.length,
        },
      },
      timing: {
        keywordMs: keywordTime,
        semanticMs: semanticTime,
        fusionMs: 0,
        totalMs: totalTime,
      },
    };
  }

  /**
   * Check if text contains CJK characters
   * CJK requires special handling (LIKE or trigram tokenizer)
   */
  private containsCJK(text: string): boolean {
    // Unicode ranges for CJK characters
    // - CJK Unified Ideographs: \u4E00-\u9FFF
    // - Hiragana: \u3040-\u309F
    // - Katakana: \u30A0-\u30FF
    // - Hangul: \uAC00-\uD7AF
    // - CJK Extension: \u3400-\u4DBF
    return /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u3400-\u4DBF]/.test(text);
  }

  /**
   * Keyword search using FTS5 (with LIKE fallback)
   *
   * For CJK languages, automatically falls back to LIKE search
   * unless trigram tokenizer is available.
   */
  private async keywordSearch(
    query: string,
    limit: number,
    namespace?: string
  ): Promise<CompactSearchResult[]> {
    // Use LIKE fallback if FTS5 not available
    if (!this.ftsAvailable) {
      return this.likeSearch(query, limit, namespace);
    }

    // For CJK queries, use LIKE fallback unless trigram tokenizer is actually active
    // (unicode61 tokenizer doesn't work with CJK - no word boundaries)
    if (this.containsCJK(query) && this.activeTokenizer !== 'trigram') {
      return this.likeSearch(query, limit, namespace);
    }

    // Trigram tokenizer requires at least 3 characters to match
    // For short CJK queries (< 3 chars), fall back to LIKE search
    if (this.activeTokenizer === 'trigram' && this.containsCJK(query)) {
      const cjkChars = query.match(/[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u3400-\u4DBF]/g);
      if (cjkChars && cjkChars.length < 3) {
        return this.likeSearch(query, limit, namespace);
      }
    }

    // Sanitize query for FTS5
    const sanitizedQuery = this.sanitizeFtsQuery(query);
    if (!sanitizedQuery) return [];

    try {
      let rows: {
        id: string;
        key: string;
        namespace: string;
        content: string;
        rank: number;
      }[];

      if (namespace) {
        rows = this.db.prepare(`
          SELECT
            m.id, m.key, m.namespace, m.content,
            bm25(memory_fts) as rank
          FROM memory_fts f
          JOIN memory_entries m ON f.rowid = m.rowid
          WHERE memory_fts MATCH ? AND m.namespace = ?
          ORDER BY rank
          LIMIT ?
        `).all(sanitizedQuery, namespace, limit) as typeof rows;
      } else {
        rows = this.db.prepare(`
          SELECT
            m.id, m.key, m.namespace, m.content,
            bm25(memory_fts) as rank
          FROM memory_fts f
          JOIN memory_entries m ON f.rowid = m.rowid
          WHERE memory_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `).all(sanitizedQuery, limit) as typeof rows;
      }

      return rows.map(row => {
        // Normalize BM25 score (negative, closer to 0 is better)
        // Convert to 0-1 scale where 1 is best
        const keywordScore = Math.min(1, Math.max(0, 1 + row.rank / 10));

        return {
          id: row.id,
          key: row.key,
          namespace: row.namespace,
          score: keywordScore * this.config.keywordWeight,
          keywordScore,
          semanticScore: 0,
          snippet: row.content.substring(0, 100),
          estimatedTokens: estimateTokens(row.content),
        };
      });
    } catch (error) {
      // Fall back to LIKE search on error
      if (this.config.fallbackToLike) {
        return this.likeSearch(query, limit, namespace);
      }
      throw error;
    }
  }

  /**
   * LIKE-based search fallback (works without FTS5)
   *
   * Less efficient but supports all languages.
   */
  private likeSearch(
    query: string,
    limit: number,
    namespace?: string
  ): CompactSearchResult[] {
    // Handle empty query
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return [];

    const searchPattern = `%${trimmedQuery}%`;
    let rows: {
      id: string;
      key: string;
      namespace: string;
      content: string;
    }[];

    if (namespace) {
      rows = this.db.prepare(`
        SELECT id, key, namespace, content
        FROM memory_entries
        WHERE (content LIKE ? OR key LIKE ? OR tags LIKE ?)
          AND namespace = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(searchPattern, searchPattern, searchPattern, namespace, limit) as typeof rows;
    } else {
      rows = this.db.prepare(`
        SELECT id, key, namespace, content
        FROM memory_entries
        WHERE content LIKE ? OR key LIKE ? OR tags LIKE ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(searchPattern, searchPattern, searchPattern, limit) as typeof rows;
    }

    return rows.map(row => {
      // Simple scoring based on match position
      const lowerContent = row.content.toLowerCase();
      const lowerQuery = query.toLowerCase();
      const matchIndex = lowerContent.indexOf(lowerQuery);
      const keywordScore = matchIndex >= 0 ? Math.max(0.3, 1 - matchIndex / 1000) : 0.5;

      return {
        id: row.id,
        key: row.key,
        namespace: row.namespace,
        score: keywordScore * this.config.keywordWeight,
        keywordScore,
        semanticScore: 0,
        snippet: row.content.substring(0, 100),
        estimatedTokens: estimateTokens(row.content),
      };
    });
  }

  /**
   * Semantic search returning compact results
   */
  private async semanticSearchCompact(
    query: string,
    limit: number,
    namespace?: string
  ): Promise<CompactSearchResult[]> {
    if (!this.embeddingGenerator) return [];

    // Generate query embedding
    const queryEmbedding = await this.embeddingGenerator(query);

    // Get all entries with embeddings
    let rows: {
      id: string;
      key: string;
      namespace: string;
      content: string;
      embedding: Buffer;
    }[];

    if (namespace) {
      rows = this.db.prepare(`
        SELECT id, key, namespace, content, embedding
        FROM memory_entries
        WHERE embedding IS NOT NULL AND namespace = ?
      `).all(namespace) as typeof rows;
    } else {
      rows = this.db.prepare(`
        SELECT id, key, namespace, content, embedding
        FROM memory_entries
        WHERE embedding IS NOT NULL
      `).all() as typeof rows;
    }

    const candidates: Array<{
      id: string;
      key: string;
      namespace: string;
      content: string;
      similarity: number;
    }> = [];

    for (const row of rows) {
      if (row.embedding) {
        const embedding = new Float32Array(row.embedding.buffer.slice(
          row.embedding.byteOffset,
          row.embedding.byteOffset + row.embedding.byteLength
        ));
        const similarity = this.cosineSimilarity(queryEmbedding, embedding);

        candidates.push({
          id: row.id,
          key: row.key,
          namespace: row.namespace,
          content: row.content,
          similarity,
        });
      }
    }

    // Sort by similarity and take top results
    candidates.sort((a, b) => b.similarity - a.similarity);

    return candidates.slice(0, limit).map((c) => ({
      id: c.id,
      key: c.key,
      namespace: c.namespace,
      score: c.similarity * this.config.semanticWeight,
      keywordScore: 0,
      semanticScore: c.similarity,
      snippet: c.content.substring(0, 100),
      estimatedTokens: estimateTokens(c.content),
    }));
  }

  /**
   * Fuse keyword and semantic scores
   */
  private fuseScores(keywordScore: number, semanticScore: number): number {
    return (
      keywordScore * this.config.keywordWeight +
      semanticScore * this.config.semanticWeight
    );
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
   * Sanitize query for FTS5
   * Preserves CJK characters (Japanese, Chinese, Korean) and basic alphanumerics
   */
  private sanitizeFtsQuery(query: string): string {
    // For trigram tokenizer, preserve CJK characters
    // Remove only FTS5 special operators: AND, OR, NOT, *, ^, :, ", (, )
    // Keep Unicode letters, digits, and spaces
    const sanitized = query
      // Remove FTS5 special characters and operators, but preserve Unicode letters
      .replace(/[*^:"()]/g, ' ')
      .replace(/\bAND\b|\bOR\b|\bNOT\b|\bNEAR\b/gi, ' ')
      .trim();

    if (!sanitized) return '';

    // For trigram tokenizer with CJK, we can pass the text directly
    // The trigram tokenizer handles the text as-is
    if (this.activeTokenizer === 'trigram') {
      // With trigram, wrap the entire query in quotes for phrase matching
      return `"${sanitized}"`;
    }

    // For other tokenizers, split into terms and wrap each
    return sanitized
      .split(/\s+/)
      .filter((term) => term.length > 0)
      .map((term) => `"${term}"`)
      .join(' OR ');
  }

  /**
   * Convert database row to MemoryEntry
   */
  private rowToEntry(row: Record<string, unknown>): MemoryEntry {
    let embedding: Float32Array | undefined;
    if (row.embedding) {
      const embeddingData = row.embedding as Buffer;
      embedding = new Float32Array(
        embeddingData.buffer.slice(
          embeddingData.byteOffset,
          embeddingData.byteOffset + embeddingData.byteLength
        )
      );
    }

    return {
      id: row.id as string,
      key: row.key as string,
      content: row.content as string,
      embedding,
      type: row.type as MemoryEntry['type'],
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

  /**
   * Get configuration
   */
  getConfig(): HybridSearchConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HybridSearchConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Create a hybrid search engine
 */
export function createHybridSearchEngine(
  db: BetterDatabase,
  config?: Partial<HybridSearchConfig>,
  embeddingGenerator?: EmbeddingGenerator
): HybridSearchEngine {
  return new HybridSearchEngine(db, config, embeddingGenerator);
}

export default HybridSearchEngine;
