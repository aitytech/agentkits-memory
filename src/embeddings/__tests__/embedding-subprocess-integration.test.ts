/**
 * Real Integration Tests for EmbeddingSubprocess
 *
 * These tests spawn actual child processes and generate real embeddings.
 * They may be slower but verify the actual subprocess behavior.
 *
 * @module @aitytech/agentkits-memory/embeddings/__tests__/embedding-subprocess-integration.test
 */

import { describe, it, expect, afterEach } from 'vitest';
import { EmbeddingSubprocess } from '../embedding-subprocess.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// Skip integration tests in CI (set SKIP_INTEGRATION_TESTS=1 to skip)
const skipIntegration = process.env.SKIP_INTEGRATION_TESTS === '1' || process.env.CI === 'true';
const describeIntegration = skipIntegration ? describe.skip : describe;

describeIntegration('EmbeddingSubprocess Integration', () => {
  let subprocess: EmbeddingSubprocess | undefined;
  let tempDir: string;

  // Create temp directory for cache
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-test-'));

  afterEach(async () => {
    if (subprocess) {
      await subprocess.shutdown();
      subprocess = undefined;
    }
  });

  it('should spawn subprocess and generate real embedding', async () => {
    subprocess = new EmbeddingSubprocess({
      cacheDir: tempDir,
      dimensions: 384,
      requestTimeout: 60000, // Allow time for model download
    });

    subprocess.spawn();

    // Wait for ready with timeout
    const readyPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Subprocess did not become ready')), 120000);
      const checkReady = setInterval(() => {
        if ((subprocess as any).isReady) {
          clearInterval(checkReady);
          clearTimeout(timeout);
          resolve();
        }
      }, 100);
    });

    await readyPromise;

    // Generate real embedding
    const embedding = await subprocess.embed('Hello world, this is a test.');

    // Verify embedding structure
    expect(embedding).toBeInstanceOf(Float32Array);
    expect(embedding.length).toBe(384);

    // Verify values are normalized (typical for sentence embeddings)
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    expect(magnitude).toBeGreaterThan(0.5);
    expect(magnitude).toBeLessThan(1.5);

    // Values should not all be the same
    const uniqueValues = new Set(embedding);
    expect(uniqueValues.size).toBeGreaterThan(100);
  }, 180000); // 3 minute timeout for model download

  it('should generate different embeddings for different texts', async () => {
    subprocess = new EmbeddingSubprocess({
      cacheDir: tempDir,
      dimensions: 384,
      requestTimeout: 60000,
    });

    subprocess.spawn();

    // Wait for ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Subprocess did not become ready')), 120000);
      const checkReady = setInterval(() => {
        if ((subprocess as any).isReady) {
          clearInterval(checkReady);
          clearTimeout(timeout);
          resolve();
        }
      }, 100);
    });

    // Generate embeddings for different texts
    const [embedding1, embedding2] = await Promise.all([
      subprocess.embed('The quick brown fox jumps over the lazy dog.'),
      subprocess.embed('Python is a popular programming language.'),
    ]);

    // Both should be valid embeddings
    expect(embedding1).toBeInstanceOf(Float32Array);
    expect(embedding2).toBeInstanceOf(Float32Array);
    expect(embedding1.length).toBe(384);
    expect(embedding2.length).toBe(384);

    // Embeddings should be different (cosine similarity < 1)
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;
    for (let i = 0; i < 384; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      mag1 += embedding1[i] * embedding1[i];
      mag2 += embedding2[i] * embedding2[i];
    }
    const cosineSimilarity = dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));

    // Different texts should have similarity < 0.9
    expect(cosineSimilarity).toBeLessThan(0.9);
    expect(cosineSimilarity).toBeGreaterThan(-1);
  }, 180000);

  it('should handle CJK text correctly', async () => {
    subprocess = new EmbeddingSubprocess({
      cacheDir: tempDir,
      dimensions: 384,
      requestTimeout: 60000,
    });

    subprocess.spawn();

    // Wait for ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Subprocess did not become ready')), 120000);
      const checkReady = setInterval(() => {
        if ((subprocess as any).isReady) {
          clearInterval(checkReady);
          clearTimeout(timeout);
          resolve();
        }
      }, 100);
    });

    // Japanese text
    const japaneseEmbed = await subprocess.embed('これは日本語のテストです。');
    expect(japaneseEmbed).toBeInstanceOf(Float32Array);
    expect(japaneseEmbed.length).toBe(384);

    // Chinese text
    const chineseEmbed = await subprocess.embed('这是中文测试。');
    expect(chineseEmbed).toBeInstanceOf(Float32Array);
    expect(chineseEmbed.length).toBe(384);

    // Korean text
    const koreanEmbed = await subprocess.embed('이것은 한국어 테스트입니다.');
    expect(koreanEmbed).toBeInstanceOf(Float32Array);
    expect(koreanEmbed.length).toBe(384);

    // All should have valid values (not NaN or all zeros)
    const hasValidValues = (arr: Float32Array) =>
      arr.some(v => !isNaN(v) && v !== 0);

    expect(hasValidValues(japaneseEmbed)).toBe(true);
    expect(hasValidValues(chineseEmbed)).toBe(true);
    expect(hasValidValues(koreanEmbed)).toBe(true);
  }, 180000);
});
