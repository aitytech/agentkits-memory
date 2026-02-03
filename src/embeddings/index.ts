/**
 * Local Embeddings Module
 *
 * 100% offline text embeddings for semantic search.
 * Uses Transformers.js (WASM) - no external API calls.
 *
 * @module @aitytech/agentkits-memory/embeddings
 */

export {
  LocalEmbeddingsService,
  createLocalEmbeddings,
  createEmbeddingGenerator,
  type LocalEmbeddingsConfig,
  type EmbeddingProvider,
  type EmbeddingResult,
  type EmbeddingsStats,
} from './local-embeddings.js';

export { PersistentEmbeddingCache, createPersistentEmbeddingCache } from './embedding-cache.js';

export { EmbeddingSubprocess, type EmbeddingSubprocessConfig } from './embedding-subprocess.js';
