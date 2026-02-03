#!/usr/bin/env node
/**
 * Embedding Worker Process
 *
 * Runs as a child process spawned by EmbeddingSubprocess.
 * Loads the ML model once and handles embed requests via Node IPC.
 *
 * Usage: fork('embedding-worker.js', [cacheDir])
 *
 * @module @aitytech/agentkits-memory/embeddings/embedding-worker
 */

import { LocalEmbeddingsService } from './local-embeddings.js';

// IPC message types (worker → parent)
interface ReadyMessage {
  type: 'ready';
}

interface EmbedResultMessage {
  type: 'embed_result';
  id: string;
  embedding: number[];
  timeMs: number;
  cached: boolean;
}

interface ErrorMessage {
  type: 'error';
  id?: string;
  message: string;
}

// IPC message types (parent → worker)
interface EmbedRequest {
  type: 'embed';
  id: string;
  text: string;
}

interface ShutdownRequest {
  type: 'shutdown';
}

type ParentMessage = EmbedRequest | ShutdownRequest;
type WorkerResponse = ReadyMessage | EmbedResultMessage | ErrorMessage;

function send(msg: WorkerResponse): void {
  if (process.send) {
    process.send(msg);
  }
}

async function main(): Promise<void> {
  const cacheDir = process.argv[2] || '';

  const service = new LocalEmbeddingsService({
    cacheDir,
    cacheEnabled: true,
  });

  try {
    await service.initialize();
    send({ type: 'ready' });
  } catch (error) {
    send({
      type: 'error',
      message: `Init failed: ${error instanceof Error ? error.message : String(error)}`,
    });
    // Still send ready — LocalEmbeddingsService falls back to mock internally
    send({ type: 'ready' });
  }

  process.on('message', async (msg: ParentMessage) => {
    if (msg.type === 'shutdown') {
      await service.shutdown();
      process.exit(0);
    }

    if (msg.type === 'embed') {
      try {
        const result = await service.embed(msg.text);
        send({
          type: 'embed_result',
          id: msg.id,
          embedding: Array.from(result.embedding),
          timeMs: result.timeMs,
          cached: result.cached,
        });
      } catch (error) {
        send({
          type: 'error',
          id: msg.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });
}

main().catch((error) => {
  send({
    type: 'error',
    message: `Worker fatal: ${error instanceof Error ? error.message : String(error)}`,
  });
  process.exit(1);
});
