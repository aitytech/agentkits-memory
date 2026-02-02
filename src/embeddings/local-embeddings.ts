/**
 * Local Offline Embeddings Service
 *
 * Provides 100% offline text embeddings using Transformers.js (WASM-based).
 * No external API calls. Model is downloaded once and cached locally.
 *
 * @module @aitytech/agentkits-memory/embeddings
 */

import type { EmbeddingGenerator } from '../types.js';

/**
 * Embedding provider type
 */
export type EmbeddingProvider = 'transformers' | 'mock';

/**
 * Local embeddings configuration
 */
export interface LocalEmbeddingsConfig {
  /** Provider to use (default: 'transformers') */
  provider?: EmbeddingProvider;

  /**
   * Model ID for Transformers.js
   * Default: 'Xenova/multilingual-e5-small' (100+ languages, optimized for retrieval)
   * Alternative: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2' (50+ languages)
   * Alternative: 'Xenova/all-MiniLM-L6-v2' (English only, faster)
   */
  modelId?: string;

  /** Vector dimensions (default: 384) */
  dimensions?: number;

  /** Enable in-memory cache for repeated texts */
  cacheEnabled?: boolean;

  /** Maximum cache size (default: 1000) */
  maxCacheSize?: number;

  /** Show progress during model download */
  showProgress?: boolean;

  /** Custom cache directory for models */
  cacheDir?: string;
}

/**
 * Embedding result with metadata
 */
export interface EmbeddingResult {
  /** The embedding vector */
  embedding: Float32Array;

  /** Time taken in milliseconds */
  timeMs: number;

  /** Whether result was from cache */
  cached: boolean;

  /** Token count (approximate) */
  tokenCount?: number;
}

/**
 * Local embeddings service statistics
 */
export interface EmbeddingsStats {
  /** Total embeddings generated */
  totalEmbeddings: number;

  /** Cache hits */
  cacheHits: number;

  /** Cache misses */
  cacheMisses: number;

  /** Average time per embedding (ms) */
  avgTimeMs: number;

  /** Total time spent (ms) */
  totalTimeMs: number;

  /** Model loaded */
  modelLoaded: boolean;

  /** Provider being used */
  provider: EmbeddingProvider;
}

/**
 * In-memory LRU Cache for embeddings
 */
class InMemoryEmbeddingCache {
  private cache = new Map<string, Float32Array>();
  private accessOrder: string[] = [];
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: string): Float32Array | undefined {
    const value = this.cache.get(key);
    if (value) {
      // Move to end (most recently used)
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
      this.accessOrder.push(key);
    }
    return value;
  }

  set(key: string, value: Float32Array): void {
    if (this.cache.has(key)) {
      this.cache.set(key, value);
      return;
    }

    // Evict if at capacity
    while (this.cache.size >= this.maxSize && this.accessOrder.length > 0) {
      const oldest = this.accessOrder.shift();
      if (oldest) {
        this.cache.delete(oldest);
      }
    }

    this.cache.set(key, value);
    this.accessOrder.push(key);
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * Mock embedding provider for testing
 */
function createMockEmbedding(text: string, dimensions: number): Float32Array {
  const embedding = new Float32Array(dimensions);
  // Generate deterministic pseudo-random values based on text hash
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash = hash & hash;
  }

  for (let i = 0; i < dimensions; i++) {
    // Use hash to seed pseudo-random generation
    hash = ((hash << 5) - hash) + i;
    hash = hash & hash;
    embedding[i] = (hash % 1000) / 1000 - 0.5;
  }

  // Normalize
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
 * Local Embeddings Service
 *
 * Provides offline text embeddings using Transformers.js.
 * Models are downloaded once and cached locally in ~/.cache/huggingface.
 */
export class LocalEmbeddingsService {
  private config: Required<LocalEmbeddingsConfig>;
  private cache: InMemoryEmbeddingCache | null = null;
  private pipeline: any = null;
  private modelLoading: Promise<void> | null = null;
  private stats = {
    totalEmbeddings: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalTimeMs: 0,
  };

  constructor(config: LocalEmbeddingsConfig = {}) {
    this.config = {
      provider: config.provider || 'transformers',
      // Use multilingual-e5-small for best CJK support and retrieval accuracy
      modelId: config.modelId || 'Xenova/multilingual-e5-small',
      dimensions: config.dimensions || 384,
      cacheEnabled: config.cacheEnabled ?? true,
      maxCacheSize: config.maxCacheSize || 1000,
      showProgress: config.showProgress ?? false,
      cacheDir: config.cacheDir || '',
    };

    if (this.config.cacheEnabled) {
      this.cache = new InMemoryEmbeddingCache(this.config.maxCacheSize);
    }
  }

  /**
   * Initialize the embeddings service (loads model)
   */
  async initialize(): Promise<void> {
    if (this.config.provider === 'mock') {
      return;
    }

    if (this.pipeline) {
      return;
    }

    if (this.modelLoading) {
      await this.modelLoading;
      return;
    }

    this.modelLoading = this.loadModel();
    await this.modelLoading;
  }

  private async loadModel(): Promise<void> {
    try {
      // Dynamic import for Transformers.js
      const { pipeline } = await import('@xenova/transformers');

      const progressCallback = this.config.showProgress
        ? (progress: { status: string; progress?: number }) => {
            if (progress.status === 'progress' && progress.progress !== undefined) {
              process.stderr.write(
                `\rLoading model: ${Math.round(progress.progress)}%`
              );
            } else if (progress.status === 'done') {
              process.stderr.write('\rModel loaded successfully.          \n');
            }
          }
        : undefined;

      this.pipeline = await pipeline('feature-extraction', this.config.modelId, {
        progress_callback: progressCallback,
      });
    } catch (error) {
      // If Transformers.js is not available, fall back to mock
      console.warn(
        'Transformers.js not available, falling back to mock embeddings.',
        'Install with: npm install @xenova/transformers'
      );
      this.config.provider = 'mock';
    }
  }

  /**
   * Generate embedding for text
   */
  async embed(text: string): Promise<EmbeddingResult> {
    const startTime = performance.now();

    // Check cache
    if (this.cache) {
      const cached = this.cache.get(text);
      if (cached) {
        this.stats.cacheHits++;
        return {
          embedding: cached,
          timeMs: performance.now() - startTime,
          cached: true,
        };
      }
      this.stats.cacheMisses++;
    }

    // Generate embedding
    let embedding: Float32Array;

    if (this.config.provider === 'mock') {
      embedding = createMockEmbedding(text, this.config.dimensions);
    } else {
      await this.initialize();

      if (!this.pipeline) {
        // Fall back to mock if model failed to load
        embedding = createMockEmbedding(text, this.config.dimensions);
      } else {
        const output = await this.pipeline(text, {
          pooling: 'mean',
          normalize: true,
        });
        embedding = new Float32Array(output.data);
      }
    }

    const timeMs = performance.now() - startTime;

    // Update stats
    this.stats.totalEmbeddings++;
    this.stats.totalTimeMs += timeMs;

    // Cache result
    if (this.cache) {
      this.cache.set(text, embedding);
    }

    return {
      embedding,
      timeMs,
      cached: false,
    };
  }

  /**
   * Generate embeddings for multiple texts (batch)
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    // Process in parallel for better performance
    return Promise.all(texts.map((text) => this.embed(text)));
  }

  /**
   * Get embedding generator function compatible with ProjectMemoryService
   */
  getGenerator(): EmbeddingGenerator {
    return async (content: string): Promise<Float32Array> => {
      const result = await this.embed(content);
      return result.embedding;
    };
  }

  /**
   * Get service statistics
   */
  getStats(): EmbeddingsStats {
    return {
      totalEmbeddings: this.stats.totalEmbeddings,
      cacheHits: this.stats.cacheHits,
      cacheMisses: this.stats.cacheMisses,
      avgTimeMs:
        this.stats.totalEmbeddings > 0
          ? this.stats.totalTimeMs / this.stats.totalEmbeddings
          : 0,
      totalTimeMs: this.stats.totalTimeMs,
      modelLoaded: this.pipeline !== null || this.config.provider === 'mock',
      provider: this.config.provider,
    };
  }

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    if (this.cache) {
      this.cache.clear();
    }
  }

  /**
   * Get vector dimensions
   */
  getDimensions(): number {
    return this.config.dimensions;
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown(): Promise<void> {
    this.clearCache();
    this.pipeline = null;
    this.modelLoading = null;
  }
}

/**
 * Create a local embeddings service with default configuration
 */
export function createLocalEmbeddings(
  config?: LocalEmbeddingsConfig
): LocalEmbeddingsService {
  return new LocalEmbeddingsService(config);
}

/**
 * Create an embedding generator function for use with ProjectMemoryService
 *
 * @example
 * ```typescript
 * import { createEmbeddingGenerator } from '@aitytech/agentkits-memory/embeddings';
 * import { ProjectMemoryService } from '@aitytech/agentkits-memory';
 *
 * const embeddingGenerator = await createEmbeddingGenerator();
 *
 * const memory = new ProjectMemoryService({
 *   projectPath: '/path/to/project',
 *   enableVectorIndex: true,
 *   embeddingGenerator,
 * });
 * ```
 */
export async function createEmbeddingGenerator(
  config?: LocalEmbeddingsConfig
): Promise<EmbeddingGenerator> {
  const service = new LocalEmbeddingsService(config);
  await service.initialize();
  return service.getGenerator();
}

// Default export
export default LocalEmbeddingsService;
