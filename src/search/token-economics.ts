/**
 * Token Economics Module
 *
 * Tracks token usage and savings for memory operations.
 * Provides ROI metrics for the memory system.
 *
 * Key metrics:
 * - Discovery tokens: Input tokens used to create memories
 * - Read tokens: Tokens when retrieving memories
 * - Savings: Discovery - Read tokens (compression benefit)
 *
 * @module @aitytech/agentkits-memory/search
 */

/**
 * Token economics statistics
 */
export interface TokenStats {
  /** Total discovery tokens (input that created memories) */
  totalDiscoveryTokens: number;

  /** Total read tokens (output when retrieved) */
  totalReadTokens: number;

  /** Total tokens saved (discovery - read) */
  totalSavings: number;

  /** Savings as percentage */
  savingsPercent: number;

  /** Number of observations/memories */
  totalObservations: number;

  /** Average tokens per observation */
  avgTokensPerObservation: number;

  /** Token efficiency score (0-100) */
  efficiencyScore: number;
}

/**
 * Per-entry token metrics
 */
export interface EntryTokenMetrics {
  /** Entry ID */
  entryId: string;

  /** Tokens used to create this entry */
  discoveryTokens: number;

  /** Tokens when retrieved */
  readTokens: number;

  /** Savings for this entry */
  savings: number;

  /** Number of times accessed */
  accessCount: number;

  /** Value score (savings * accessCount) */
  valueScore: number;
}

/**
 * Session token summary
 */
export interface SessionTokenSummary {
  /** Session ID */
  sessionId: string;

  /** Tokens input during session */
  inputTokens: number;

  /** Tokens saved by memory recall */
  savedTokens: number;

  /** Number of memories created */
  memoriesCreated: number;

  /** Number of memories recalled */
  memoriesRecalled: number;

  /** Net efficiency */
  netEfficiency: number;
}

/**
 * Token economics configuration
 */
export interface TokenEconomicsConfig {
  /** Characters per token estimate (default: 4) */
  charsPerToken: number;

  /** Include metadata in token count (default: false) */
  includeMetadata: boolean;

  /** Track per-entry metrics (default: true) */
  trackPerEntry: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: TokenEconomicsConfig = {
  charsPerToken: 4,
  includeMetadata: false,
  trackPerEntry: true,
};

/**
 * Token Economics Tracker
 *
 * Provides detailed token usage metrics for the memory system.
 * Helps users understand the ROI of persistent memory.
 */
export class TokenEconomicsTracker {
  private config: TokenEconomicsConfig;
  private entryMetrics: Map<string, EntryTokenMetrics> = new Map();
  private sessionMetrics: Map<string, SessionTokenSummary> = new Map();

  // Aggregate stats
  private totalDiscoveryTokens = 0;
  private totalReadTokens = 0;
  private totalObservations = 0;

  constructor(config: Partial<TokenEconomicsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Estimate token count for text
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / this.config.charsPerToken);
  }

  /**
   * Record memory creation (discovery tokens)
   */
  recordCreation(
    entryId: string,
    content: string,
    metadata?: Record<string, unknown>
  ): void {
    const contentTokens = this.estimateTokens(content);
    const metadataTokens = this.config.includeMetadata && metadata
      ? this.estimateTokens(JSON.stringify(metadata))
      : 0;
    const discoveryTokens = contentTokens + metadataTokens;

    this.totalDiscoveryTokens += discoveryTokens;
    this.totalObservations++;

    if (this.config.trackPerEntry) {
      this.entryMetrics.set(entryId, {
        entryId,
        discoveryTokens,
        readTokens: 0,
        savings: discoveryTokens,
        accessCount: 0,
        valueScore: 0,
      });
    }
  }

  /**
   * Record memory retrieval (read tokens)
   */
  recordRetrieval(
    entryId: string,
    content: string,
    sessionId?: string
  ): void {
    const readTokens = this.estimateTokens(content);
    this.totalReadTokens += readTokens;

    if (this.config.trackPerEntry) {
      const metrics = this.entryMetrics.get(entryId);
      if (metrics) {
        metrics.readTokens += readTokens;
        metrics.accessCount++;
        metrics.savings = metrics.discoveryTokens - metrics.readTokens;
        metrics.valueScore = metrics.savings * metrics.accessCount;
      }
    }

    if (sessionId) {
      const session = this.sessionMetrics.get(sessionId) || {
        sessionId,
        inputTokens: 0,
        savedTokens: 0,
        memoriesCreated: 0,
        memoriesRecalled: 0,
        netEfficiency: 0,
      };
      session.memoriesRecalled++;
      session.savedTokens += readTokens;
      this.sessionMetrics.set(sessionId, session);
    }
  }

  /**
   * Record session input tokens
   */
  recordSessionInput(sessionId: string, inputTokens: number): void {
    const session = this.sessionMetrics.get(sessionId) || {
      sessionId,
      inputTokens: 0,
      savedTokens: 0,
      memoriesCreated: 0,
      memoriesRecalled: 0,
      netEfficiency: 0,
    };
    session.inputTokens += inputTokens;
    session.netEfficiency = session.inputTokens > 0
      ? session.savedTokens / session.inputTokens
      : 0;
    this.sessionMetrics.set(sessionId, session);
  }

  /**
   * Get aggregate statistics
   */
  getStats(): TokenStats {
    const totalSavings = Math.max(0, this.totalDiscoveryTokens - this.totalReadTokens);
    const savingsPercent = this.totalDiscoveryTokens > 0
      ? (totalSavings / this.totalDiscoveryTokens) * 100
      : 0;

    // Efficiency score: 0-100 based on savings and usage
    const usageRatio = this.totalReadTokens > 0
      ? this.totalDiscoveryTokens / this.totalReadTokens
      : 0;
    const efficiencyScore = Math.min(100, usageRatio * 10);

    return {
      totalDiscoveryTokens: this.totalDiscoveryTokens,
      totalReadTokens: this.totalReadTokens,
      totalSavings,
      savingsPercent,
      totalObservations: this.totalObservations,
      avgTokensPerObservation: this.totalObservations > 0
        ? this.totalDiscoveryTokens / this.totalObservations
        : 0,
      efficiencyScore,
    };
  }

  /**
   * Get per-entry metrics
   */
  getEntryMetrics(entryId?: string): EntryTokenMetrics[] {
    if (entryId) {
      const metrics = this.entryMetrics.get(entryId);
      return metrics ? [metrics] : [];
    }
    return Array.from(this.entryMetrics.values());
  }

  /**
   * Get top entries by value score
   */
  getTopValueEntries(limit: number = 10): EntryTokenMetrics[] {
    return Array.from(this.entryMetrics.values())
      .sort((a, b) => b.valueScore - a.valueScore)
      .slice(0, limit);
  }

  /**
   * Get low-value entries (candidates for archival)
   */
  getLowValueEntries(limit: number = 10): EntryTokenMetrics[] {
    return Array.from(this.entryMetrics.values())
      .filter((e) => e.accessCount === 0 || e.valueScore < 0)
      .sort((a, b) => a.valueScore - b.valueScore)
      .slice(0, limit);
  }

  /**
   * Get session summary
   */
  getSessionSummary(sessionId: string): SessionTokenSummary | undefined {
    return this.sessionMetrics.get(sessionId);
  }

  /**
   * Get all session summaries
   */
  getAllSessionSummaries(): SessionTokenSummary[] {
    return Array.from(this.sessionMetrics.values());
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.entryMetrics.clear();
    this.sessionMetrics.clear();
    this.totalDiscoveryTokens = 0;
    this.totalReadTokens = 0;
    this.totalObservations = 0;
  }

  /**
   * Export metrics as JSON
   */
  export(): {
    stats: TokenStats;
    entries: EntryTokenMetrics[];
    sessions: SessionTokenSummary[];
  } {
    return {
      stats: this.getStats(),
      entries: this.getEntryMetrics(),
      sessions: this.getAllSessionSummaries(),
    };
  }

  /**
   * Import metrics from JSON
   */
  import(data: {
    entries?: EntryTokenMetrics[];
    sessions?: SessionTokenSummary[];
  }): void {
    if (data.entries) {
      for (const entry of data.entries) {
        this.entryMetrics.set(entry.entryId, entry);
        this.totalDiscoveryTokens += entry.discoveryTokens;
        this.totalReadTokens += entry.readTokens;
        this.totalObservations++;
      }
    }
    if (data.sessions) {
      for (const session of data.sessions) {
        this.sessionMetrics.set(session.sessionId, session);
      }
    }
  }

  /**
   * Format stats for display
   */
  formatStats(): string {
    const stats = this.getStats();
    return [
      `📊 Token Economics`,
      `━━━━━━━━━━━━━━━━━━`,
      `Observations: ${stats.totalObservations.toLocaleString()}`,
      `Discovery Tokens: ${stats.totalDiscoveryTokens.toLocaleString()}`,
      `Read Tokens: ${stats.totalReadTokens.toLocaleString()}`,
      `Tokens Saved: ${stats.totalSavings.toLocaleString()} (${stats.savingsPercent.toFixed(1)}%)`,
      `Efficiency Score: ${stats.efficiencyScore.toFixed(0)}/100`,
    ].join('\n');
  }
}

/**
 * Create a token economics tracker
 */
export function createTokenEconomicsTracker(
  config?: Partial<TokenEconomicsConfig>
): TokenEconomicsTracker {
  return new TokenEconomicsTracker(config);
}

export default TokenEconomicsTracker;
