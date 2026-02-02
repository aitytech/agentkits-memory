/**
 * Search Module
 *
 * Enterprise-grade search capabilities for AgentKits Memory:
 * - Hybrid search (FTS5 keyword + vector semantic)
 * - 3-layer token-efficient retrieval
 * - Token economics tracking
 *
 * @module @aitytech/agentkits-memory/search
 */

export {
  HybridSearchEngine,
  createHybridSearchEngine,
  type HybridSearchConfig,
  type CompactSearchResult,
  type TimelineResult,
  type TokenEconomics,
  type HybridSearchResult,
} from './hybrid-search.js';

export {
  TokenEconomicsTracker,
  createTokenEconomicsTracker,
  type TokenStats,
  type EntryTokenMetrics,
  type SessionTokenSummary,
  type TokenEconomicsConfig,
} from './token-economics.js';
