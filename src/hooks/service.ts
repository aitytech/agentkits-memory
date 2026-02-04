/**
 * Memory Hook Service
 *
 * Lightweight service for hooks to store/retrieve memory.
 * Direct SQLite access without HTTP worker.
 *
 * @module @agentkits/memory/hooks/service
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, openSync, closeSync, constants as fsConstants } from 'node:fs';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import type { Database as BetterDatabase } from 'better-sqlite3';
import {
  Observation,
  SessionRecord,
  UserPrompt,
  SessionSummary,
  MemoryContext,
  generateObservationId,
  getObservationType,
  generateObservationTitle,
  generateObservationSubtitle,
  generateObservationNarrative,
  extractFilePaths,
  extractFacts,
  extractConcepts,
  detectIntent,
  extractIntents,
  extractCodeDiffs,
  formatDiffFact,
  truncate,
  computeContentHash,
  ContextConfig,
  DEFAULT_CONTEXT_CONFIG,
  MemorySettings,
  DEFAULT_MEMORY_SETTINGS,
  LifecycleConfig,
  DEFAULT_LIFECYCLE_CONFIG,
  LifecycleResult,
  LifecycleStats,
  ExportData,
  ExportSession,
  ImportResult,
} from './types.js';
import { enrichWithAI, enrichSummaryWithAI, compressObservationWithAI, generateSessionDigestWithAI } from './ai-enrichment.js';

/**
 * Memory Hook Service Configuration
 */
export interface MemoryHookServiceConfig {
  /** Base directory for memory storage */
  baseDir: string;

  /** Database filename */
  dbFilename: string;

  /** Maximum observations to return in context */
  maxContextObservations: number;

  /** Maximum sessions to return in context */
  maxContextSessions: number;

  /** Maximum response size to store (bytes) */
  maxResponseSize: number;
}

const DEFAULT_CONFIG: MemoryHookServiceConfig = {
  baseDir: '.claude/memory',
  dbFilename: 'memory.db',  // Single DB: hooks + memories in one file
  maxContextObservations: 20,
  maxContextSessions: 5,
  maxResponseSize: 5000,
};

/**
 * Memory Hook Service
 *
 * Provides direct SQLite access for hooks without HTTP overhead.
 * Stores observations and sessions for context injection.
 */
export class MemoryHookService {
  private config: MemoryHookServiceConfig;
  private db: BetterDatabase | null = null;
  private initialized: boolean = false;
  private dbPath: string;

  constructor(cwd: string, config: Partial<MemoryHookServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dbPath = path.join(cwd, this.config.baseDir, this.config.dbFilename);
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Open database with better-sqlite3
    this.db = new Database(this.dbPath);

    // Enable WAL mode for better performance
    this.db.pragma('journal_mode = WAL');
    // Prevent SQLITE_BUSY when concurrent processes access the DB
    this.db.pragma('busy_timeout = 10000');

    // Create schema
    this.createSchema();

    this.initialized = true;
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    if (!this.initialized || !this.db) return;

    this.db.close();
    this.db = null;
    this.initialized = false;
  }

  // ===== Session Management =====

  /**
   * Initialize or get session (idempotent)
   */
  async initSession(sessionId: string, project: string, prompt?: string): Promise<SessionRecord> {
    await this.ensureInitialized();

    // Check if session exists
    const existing = this.getSession(sessionId);
    if (existing) {
      return existing;
    }

    // Resume detection: find recent session in same project within 30 min
    let parentSessionId: string | null = null;
    const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
    const recentSession = this.db!.prepare(`
      SELECT session_id FROM sessions
      WHERE project = ? AND started_at > ? AND session_id != ?
      ORDER BY started_at DESC LIMIT 1
    `).get(project, thirtyMinAgo, sessionId) as { session_id: string } | undefined;

    if (recentSession) {
      parentSessionId = recentSession.session_id;
    }

    // Create new session
    const now = Date.now();
    const result = this.db!.prepare(`
      INSERT INTO sessions (session_id, project, prompt, started_at, observation_count, status, parent_session_id)
      VALUES (?, ?, ?, ?, 0, 'active', ?)
    `).run(sessionId, project, prompt || '', now, parentSessionId);

    return {
      id: Number(result.lastInsertRowid),
      sessionId,
      project,
      prompt: prompt || '',
      startedAt: now,
      observationCount: 0,
      status: 'active',
      parentSessionId: parentSessionId || undefined,
    };
  }

  // ===== User Prompt Management =====

  /**
   * Save a user prompt (tracks ALL prompts, not just the first)
   */
  async saveUserPrompt(sessionId: string, project: string, promptText: string): Promise<UserPrompt> {
    await this.ensureInitialized();

    // Ensure session exists
    await this.initSession(sessionId, project, promptText);

    // Dedup: check for identical prompt in same project within 5 minutes
    const contentHash = computeContentHash(project, promptText);
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const existing = this.db!.prepare(`
      SELECT up.* FROM user_prompts up
      JOIN sessions s ON s.session_id = up.session_id
      WHERE up.content_hash = ? AND s.project = ? AND up.created_at > ?
      LIMIT 1
    `).get(contentHash, project, fiveMinAgo) as Record<string, unknown> | undefined;

    if (existing) {
      return {
        id: existing.id as number,
        sessionId: existing.session_id as string,
        promptNumber: existing.prompt_number as number,
        promptText: existing.prompt_text as string,
        createdAt: existing.created_at as number,
        contentHash,
      };
    }

    // Get next prompt number
    const promptNumber = this.getPromptNumber(sessionId) + 1;
    const now = Date.now();

    const result = this.db!.prepare(`
      INSERT OR IGNORE INTO user_prompts (session_id, prompt_number, prompt_text, content_hash, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, promptNumber, promptText, contentHash, now);

    const id = result.changes > 0 ? Number(result.lastInsertRowid) : 0;

    // Queue embedding generation if insert succeeded
    if (id > 0) {
      this.queueTask('embed', 'user_prompts', id);
    }

    return {
      id,
      sessionId,
      promptNumber,
      promptText,
      createdAt: now,
      contentHash,
    };
  }

  /**
   * Get the latest prompt text for a session (for intent detection)
   */
  getLatestPromptText(sessionId: string): string | null {
    if (!this.db) return null;

    const row = this.db.prepare(
      'SELECT prompt_text FROM user_prompts WHERE session_id = ? ORDER BY prompt_number DESC LIMIT 1'
    ).get(sessionId) as { prompt_text: string } | undefined;

    return row?.prompt_text || null;
  }

  /**
   * Get current prompt number for a session (0 if no prompts yet)
   */
  getPromptNumber(sessionId: string): number {
    if (!this.db) return 0;

    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM user_prompts WHERE session_id = ?'
    ).get(sessionId) as { count: number } | undefined;

    return row?.count || 0;
  }

  /**
   * Get all prompts for a session
   */
  async getSessionPrompts(sessionId: string): Promise<UserPrompt[]> {
    await this.ensureInitialized();

    const rows = this.db!.prepare(`
      SELECT * FROM user_prompts
      WHERE session_id = ?
      ORDER BY prompt_number ASC
    `).all(sessionId) as Record<string, unknown>[];

    return rows.map(row => ({
      id: row.id as number,
      sessionId: row.session_id as string,
      promptNumber: row.prompt_number as number,
      promptText: row.prompt_text as string,
      createdAt: row.created_at as number,
    }));
  }

  /**
   * Get recent prompts across all sessions for a project
   */
  async getRecentPrompts(project: string, limit: number = 20): Promise<UserPrompt[]> {
    await this.ensureInitialized();

    const rows = this.db!.prepare(`
      SELECT up.* FROM user_prompts up
      JOIN sessions s ON s.session_id = up.session_id
      WHERE s.project = ?
      ORDER BY up.created_at DESC
      LIMIT ?
    `).all(project, limit) as Record<string, unknown>[];

    return rows.map(row => ({
      id: row.id as number,
      sessionId: row.session_id as string,
      promptNumber: row.prompt_number as number,
      promptText: row.prompt_text as string,
      createdAt: row.created_at as number,
    }));
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): SessionRecord | null {
    if (!this.db) return null;

    const row = this.db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId) as Record<string, unknown> | undefined;

    if (row) {
      return this.rowToSession(row);
    }

    return null;
  }

  /**
   * Complete a session with summary
   */
  async completeSession(sessionId: string, summary?: string): Promise<void> {
    await this.ensureInitialized();

    const now = Date.now();
    this.db!.prepare(`
      UPDATE sessions
      SET ended_at = ?, summary = ?, status = 'completed'
      WHERE session_id = ?
    `).run(now, summary || '', sessionId);
  }

  /**
   * Get recent sessions
   */
  async getRecentSessions(project: string, limit: number = 5): Promise<SessionRecord[]> {
    await this.ensureInitialized();

    const rows = this.db!.prepare(`
      SELECT * FROM sessions
      WHERE project = ?
      ORDER BY started_at DESC
      LIMIT ?
    `).all(project, limit) as Record<string, unknown>[];

    return rows.map(row => this.rowToSession(row));
  }

  // ===== Observation Management =====

  /**
   * Store an observation
   */
  async storeObservation(
    sessionId: string,
    project: string,
    toolName: string,
    toolInput: unknown,
    toolResponse: unknown,
    cwd: string
  ): Promise<Observation> {
    await this.ensureInitialized();

    const id = generateObservationId();
    const now = Date.now();
    const type = getObservationType(toolName);
    const title = generateObservationTitle(toolName, toolInput);
    const promptNumber = this.getPromptNumber(sessionId);
    const { filesRead, filesModified } = extractFilePaths(toolName, toolInput);

    // Truncate large responses (safe stringify handles circular refs)
    const safeStringify = (val: unknown): string => {
      try { return JSON.stringify(val || {}); } catch { return '{}'; }
    };
    const inputStr = safeStringify(toolInput);
    const responseStr = truncate(
      safeStringify(toolResponse),
      this.config.maxResponseSize
    );

    // Dedup: check for identical observation in same session within 60 seconds
    const contentHash = computeContentHash(sessionId, toolName, inputStr);
    const oneMinAgo = now - 60 * 1000;
    const existingObs = this.db!.prepare(
      'SELECT id FROM observations WHERE content_hash = ? AND session_id = ? AND timestamp > ? LIMIT 1'
    ).get(contentHash, sessionId, oneMinAgo) as { id: string } | undefined;

    if (existingObs) {
      // Return existing observation without re-inserting
      const row = this.db!.prepare('SELECT * FROM observations WHERE id = ?').get(existingObs.id) as Record<string, unknown>;
      return this.rowToObservation(row);
    }

    // Template-based extraction only (fast, <10ms)
    // AI enrichment runs asynchronously via fire-and-forget process
    const subtitle = generateObservationSubtitle(toolName, toolInput, toolResponse);
    const narrative = generateObservationNarrative(toolName, toolInput, toolResponse);
    const facts = extractFacts(toolName, toolInput, toolResponse);
    const concepts = extractConcepts(toolName, toolInput, toolResponse);

    // Detect developer intent and add as intent: prefixed tags
    const latestPrompt = this.getLatestPromptText(sessionId);
    const intents = detectIntent(toolName, toolInput, toolResponse, latestPrompt || undefined);
    for (const intent of intents) {
      concepts.push(`intent:${intent}`);
    }

    this.db!.prepare(`
      INSERT INTO observations (id, session_id, project, tool_name, tool_input, tool_response, cwd, timestamp, type, title, prompt_number, files_read, files_modified, subtitle, narrative, facts, concepts, content_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, sessionId, project, toolName, inputStr, responseStr, cwd, now, type, title, promptNumber || null, JSON.stringify(filesRead), JSON.stringify(filesModified), subtitle, narrative, JSON.stringify(facts), JSON.stringify(concepts), contentHash);

    // Queue background tasks (embedding + AI enrichment)
    this.queueTask('embed', 'observations', id);
    this.queueTask('enrich', 'observations', id);

    // Update session observation count
    this.db!.prepare(`
      UPDATE sessions
      SET observation_count = observation_count + 1
      WHERE session_id = ?
    `).run(sessionId);

    return {
      id,
      sessionId,
      project,
      toolName,
      toolInput: inputStr,
      toolResponse: responseStr,
      cwd,
      timestamp: now,
      type,
      title,
      promptNumber: promptNumber || undefined,
      filesRead,
      filesModified,
      subtitle,
      narrative,
      facts,
      concepts,
    };
  }

  /**
   * Enrich an existing observation with AI-generated data.
   * Called from a background process after the observation is saved.
   * Updates subtitle, narrative, facts, and concepts in-place.
   */
  async enrichObservation(id: string): Promise<boolean> {
    await this.ensureInitialized();

    const row = this.db!.prepare(
      'SELECT tool_name, tool_input, tool_response FROM observations WHERE id = ?'
    ).get(id) as { tool_name: string; tool_input: string; tool_response: string } | undefined;

    if (!row) return false;

    const aiResult = await enrichWithAI(row.tool_name, row.tool_input, row.tool_response).catch(() => null);
    if (!aiResult) return false;

    this.db!.prepare(`
      UPDATE observations
      SET subtitle = ?, narrative = ?, facts = ?, concepts = ?
      WHERE id = ?
    `).run(
      aiResult.subtitle,
      aiResult.narrative,
      JSON.stringify(aiResult.facts),
      JSON.stringify(aiResult.concepts),
      id
    );

    return true;
  }

  /**
   * Compress a single observation using AI.
   * Replaces raw tool_input/tool_response with a dense compressed_summary.
   * Sets is_compressed=1 to indicate the raw data has been replaced.
   */
  async compressObservation(id: string): Promise<boolean> {
    await this.ensureInitialized();

    const row = this.db!.prepare(
      'SELECT tool_name, tool_input, tool_response, subtitle, narrative, is_compressed FROM observations WHERE id = ?'
    ).get(id) as { tool_name: string; tool_input: string; tool_response: string; subtitle: string; narrative: string; is_compressed: number } | undefined;

    if (!row || row.is_compressed === 1) return false;

    const result = await compressObservationWithAI(
      row.tool_name, row.tool_input, row.tool_response, row.subtitle, row.narrative
    ).catch(() => null);

    if (!result) return false;

    // Write compressed summary and clear raw data to save space
    this.db!.prepare(`
      UPDATE observations
      SET compressed_summary = ?, is_compressed = 1, tool_input = '{}', tool_response = '{}'
      WHERE id = ?
    `).run(result.compressed_summary, id);

    return true;
  }

  /**
   * Compress all observations for a session and generate a session digest.
   * 1. Compresses each observation individually (10:1-25:1 ratio)
   * 2. Generates a session-level digest from summaries (20:1-100:1 ratio)
   * 3. Stores digest in session_digests table with embedding queued
   */
  async compressSessionObservations(sessionId: string): Promise<{ compressed: number; digestCreated: boolean }> {
    await this.ensureInitialized();

    // Get all uncompressed observations for this session
    const rows = this.db!.prepare(
      'SELECT id FROM observations WHERE session_id = ? AND is_compressed = 0'
    ).all(sessionId) as { id: string }[];

    let compressed = 0;
    for (const row of rows) {
      const ok = await this.compressObservation(row.id);
      if (ok) compressed++;
    }

    // Generate session digest
    let digestCreated = false;
    const summary = this.db!.prepare(
      'SELECT * FROM session_summaries WHERE session_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(sessionId) as Record<string, unknown> | undefined;

    if (summary) {
      // Collect observation summaries for digest input
      const obsRows = this.db!.prepare(
        'SELECT compressed_summary, subtitle, title FROM observations WHERE session_id = ? ORDER BY timestamp ASC'
      ).all(sessionId) as { compressed_summary: string | null; subtitle: string | null; title: string | null }[];

      const obsSummaries = obsRows.map(r => r.compressed_summary || r.subtitle || r.title || '').filter(Boolean);

      const filesModified = JSON.parse((summary.files_modified as string) || '[]') as string[];
      const request = (summary.request as string) || '';
      const completed = (summary.completed as string) || '';

      const digest = await generateSessionDigestWithAI(
        request, obsSummaries, completed, filesModified
      ).catch(() => null);

      if (digest) {
        const project = (summary.project as string) || '';
        this.db!.prepare(`
          INSERT OR REPLACE INTO session_digests (session_id, project, digest, observation_count, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(sessionId, project, digest.digest, obsRows.length, Date.now());

        // Queue embedding for the digest
        const digestRow = this.db!.prepare(
          'SELECT id FROM session_digests WHERE session_id = ?'
        ).get(sessionId) as { id: number } | undefined;
        if (digestRow) {
          this.queueTask('embed', 'session_digests', digestRow.id);
        }

        digestCreated = true;
      }
    }

    return { compressed, digestCreated };
  }

  /**
   * Build embedding text for a session record based on table type.
   */
  private getSessionEmbeddingText(
    table: 'observations' | 'user_prompts' | 'session_summaries' | 'session_digests',
    row: Record<string, unknown>
  ): string {
    if (table === 'observations') {
      // Prefer compressed summary if available
      if (row.compressed_summary) {
        return (row.compressed_summary as string).trim();
      }
      const parts = [row.title, row.subtitle, row.narrative];
      try {
        const concepts = JSON.parse((row.concepts as string) || '[]');
        if (concepts.length > 0) parts.push(concepts.join(', '));
      } catch { /* ignore */ }
      return (parts.filter(Boolean) as string[]).join(' ').trim();
    } else if (table === 'user_prompts') {
      return ((row.prompt_text as string) || '').trim();
    } else if (table === 'session_digests') {
      return ((row.digest as string) || '').trim();
    } else {
      const parts = [row.request, row.completed, row.next_steps, row.notes];
      return (parts.filter(Boolean) as string[]).join(' ').trim();
    }
  }

  // ===== Embedding Queue + Worker =====

  /** Max records to process per worker invocation */
  private static readonly WORKER_BATCH_LIMIT = 200;
  /** Max retries before marking a task as permanently failed */
  private static readonly MAX_TASK_RETRIES = 3;

  /**
   * Queue a background task. Inserts into SQLite task_queue — atomic, <1ms.
   * Called from hook handlers — non-blocking, no model/API loading.
   */
  queueTask(
    taskType: 'embed' | 'enrich' | 'compress',
    table: string,
    recordId: string | number
  ): void {
    if (!this.db) return;
    this.db.prepare(
      'INSERT INTO task_queue (task_type, target_table, target_id, created_at) VALUES (?, ?, ?, ?)'
    ).run(taskType, table, String(recordId), Date.now());
  }

  /**
   * Spawn a detached background worker if not already running.
   * Uses a PID-based lock file to prevent multiple concurrent workers.
   * @param workerType - 'embed-session' or 'enrich-session'
   * @param lockName - unique lock file name for this worker type
   */
  ensureWorkerRunning(cwd: string, workerType: string, lockName: string): void {
    const lockFile = path.join(path.dirname(this.dbPath), lockName);

    // Check if worker is already running (stale lock cleanup)
    if (existsSync(lockFile)) {
      try {
        const pid = parseInt(readFileSync(lockFile, 'utf-8').trim(), 10);
        if (pid > 0) {
          try {
            process.kill(pid, 0); // signal 0 = check if alive
            return; // Worker still running
          } catch {
            // Process dead — remove stale lock
            try { unlinkSync(lockFile); } catch { /* ignore */ }
          }
        } else {
          try { unlinkSync(lockFile); } catch { /* ignore */ }
        }
      } catch {
        try { unlinkSync(lockFile); } catch { /* ignore */ }
      }
    }

    // Atomic lock acquisition: O_CREAT | O_EXCL fails if file exists (prevents race)
    let fd: number;
    try {
      fd = openSync(lockFile, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY);
    } catch {
      // Another process created the lock between our check and open — that's fine
      return;
    }

    // Write PID placeholder (will be overwritten by worker with its actual PID)
    try {
      writeFileSync(lockFile, '0');
    } finally {
      try { closeSync(fd); } catch { /* ignore */ }
    }

    // Spawn detached worker (worker writes its own PID to lock file on start)
    try {
      const cliPath = path.resolve(cwd, 'dist/hooks/cli.js');
      const child = spawn('node', [cliPath, workerType, cwd], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env },
      });
      child.on('error', () => { /* spawn failure handled — lock cleaned below */ });
      child.unref();
    } catch {
      // Failed to spawn — clean up lock
      try { unlinkSync(lockFile); } catch { /* ignore */ }
    }
  }

  /**
   * Process embedding tasks from the queue.
   * Loads embedding model ONCE, processes queued items + DB catch-up.
   * Uses lock file to prevent concurrent workers.
   */
  async processEmbeddingQueue(): Promise<number> {
    await this.ensureInitialized();

    const lockFile = path.join(path.dirname(this.dbPath), 'embed-worker.lock');
    writeFileSync(lockFile, String(process.pid));

    let count = 0;
    try {
      const { LocalEmbeddingsService } = await import('../embeddings/local-embeddings.js');
      const cacheDir = path.join(path.dirname(this.dbPath), 'embeddings-cache');
      const embService = new LocalEmbeddingsService({ cacheDir });
      await embService.initialize();

      const idColMap: Record<string, string> = {
        observations: 'id',
        user_prompts: 'rowid',
        session_summaries: 'rowid',
        session_digests: 'id',
      };

      // Atomic claim: SELECT + UPDATE in a single transaction to prevent race conditions
      const claimEmbedTask = this.db!.transaction(() => {
        const item = this.db!.prepare(
          "SELECT id, target_table, target_id, retry_count FROM task_queue WHERE task_type = 'embed' AND status = 'pending' AND retry_count < ? ORDER BY id ASC LIMIT 1"
        ).get(MemoryHookService.MAX_TASK_RETRIES) as { id: number; target_table: string; target_id: string; retry_count: number } | undefined;
        if (item) {
          this.db!.prepare("UPDATE task_queue SET status = 'processing' WHERE id = ?").run(item.id);
        }
        return item;
      });

      // Phase 1: Process queued embed tasks
      while (count < MemoryHookService.WORKER_BATCH_LIMIT) {
        const item = claimEmbedTask();

        if (!item) break;

        const idCol = idColMap[item.target_table];
        if (!idCol) {
          this.db!.prepare('DELETE FROM task_queue WHERE id = ?').run(item.id);
          continue;
        }

        try {
          const row = this.db!.prepare(
            `SELECT * FROM ${item.target_table} WHERE ${idCol} = ? AND embedding IS NULL`
          ).get(item.target_id) as Record<string, unknown> | undefined;

          if (!row) {
            this.db!.prepare('DELETE FROM task_queue WHERE id = ?').run(item.id);
            continue;
          }

          const text = this.getSessionEmbeddingText(
            item.target_table as 'observations' | 'user_prompts' | 'session_summaries', row
          );
          if (!text) {
            this.db!.prepare('DELETE FROM task_queue WHERE id = ?').run(item.id);
            continue;
          }

          const result = await embService.embed(text);
          const buffer = Buffer.from(result.embedding);
          this.db!.prepare(`UPDATE ${item.target_table} SET embedding = ? WHERE ${idCol} = ?`).run(buffer, item.target_id);
          this.db!.prepare('DELETE FROM task_queue WHERE id = ?').run(item.id);
          count++;
        } catch {
          // Increment retry_count; mark as 'failed' if max retries exceeded
          const newRetry = (item.retry_count || 0) + 1;
          if (newRetry >= MemoryHookService.MAX_TASK_RETRIES) {
            this.db!.prepare("UPDATE task_queue SET status = 'failed', retry_count = ? WHERE id = ?").run(newRetry, item.id);
          } else {
            this.db!.prepare("UPDATE task_queue SET status = 'pending', retry_count = ? WHERE id = ?").run(newRetry, item.id);
          }
          count++;
        }
      }

      // Phase 2: Catch up on DB records missing embeddings
      if (count < MemoryHookService.WORKER_BATCH_LIMIT) {
        for (const [tableName, idCol] of Object.entries(idColMap)) {
          if (count >= MemoryHookService.WORKER_BATCH_LIMIT) break;
          try {
            const remaining = MemoryHookService.WORKER_BATCH_LIMIT - count;
            const rows = this.db!.prepare(
              `SELECT *, ${idCol} as _rid FROM ${tableName} WHERE embedding IS NULL ORDER BY rowid DESC LIMIT ?`
            ).all(remaining) as Record<string, unknown>[];

            for (const row of rows) {
              if (count >= MemoryHookService.WORKER_BATCH_LIMIT) break;
              const text = this.getSessionEmbeddingText(
                tableName as 'observations' | 'user_prompts' | 'session_summaries', row
              );
              if (!text) continue;
              try {
                const result = await embService.embed(text);
                const buffer = Buffer.from(result.embedding);
                this.db!.prepare(`UPDATE ${tableName} SET embedding = ? WHERE ${idCol} = ?`).run(buffer, row._rid);
                count++;
              } catch { /* skip */ }
            }
          } catch { /* table might not exist */ }
        }
      }
    } finally {
      try { unlinkSync(lockFile); } catch { /* ignore */ }
    }

    return count;
  }

  /**
   * Process enrichment tasks from the queue.
   * Calls claude --print sequentially for each observation.
   * Uses lock file to prevent concurrent workers.
   */
  async processEnrichmentQueue(): Promise<number> {
    await this.ensureInitialized();

    const lockFile = path.join(path.dirname(this.dbPath), 'enrich-worker.lock');
    writeFileSync(lockFile, String(process.pid));

    let count = 0;
    try {
      // Atomic claim: SELECT + UPDATE in a single transaction to prevent race conditions
      const claimEnrichTask = this.db!.transaction(() => {
        const item = this.db!.prepare(
          "SELECT id, target_table, target_id, retry_count FROM task_queue WHERE task_type = 'enrich' AND status = 'pending' AND retry_count < ? ORDER BY id ASC LIMIT 1"
        ).get(MemoryHookService.MAX_TASK_RETRIES) as { id: number; target_table: string; target_id: string; retry_count: number } | undefined;
        if (item) {
          this.db!.prepare("UPDATE task_queue SET status = 'processing' WHERE id = ?").run(item.id);
        }
        return item;
      });

      while (count < MemoryHookService.WORKER_BATCH_LIMIT) {
        const item = claimEnrichTask();

        if (!item) break;

        try {
          if (item.target_table === 'observations') {
            await this.enrichObservation(item.target_id);
          } else if (item.target_table === 'session_summaries') {
            // Summary enrichment needs transcript path — skip from queue
            // (handled separately in summarize hook with direct spawn)
          }
          this.db!.prepare('DELETE FROM task_queue WHERE id = ?').run(item.id);
          count++;
        } catch {
          const newRetry = (item.retry_count || 0) + 1;
          if (newRetry >= MemoryHookService.MAX_TASK_RETRIES) {
            this.db!.prepare("UPDATE task_queue SET status = 'failed', retry_count = ? WHERE id = ?").run(newRetry, item.id);
          } else {
            this.db!.prepare("UPDATE task_queue SET status = 'pending', retry_count = ? WHERE id = ?").run(newRetry, item.id);
          }
          count++;
        }
      }
    } finally {
      try { unlinkSync(lockFile); } catch { /* ignore */ }
    }

    return count;
  }

  /**
   * Process compression tasks from the queue.
   * Compresses observations and generates session digests.
   * Uses lock file to prevent concurrent workers.
   */
  async processCompressionQueue(): Promise<number> {
    await this.ensureInitialized();

    const lockFile = path.join(path.dirname(this.dbPath), 'compress-worker.lock');
    writeFileSync(lockFile, String(process.pid));

    let count = 0;
    try {
      // Atomic claim: SELECT + UPDATE in a single transaction
      const claimCompressTask = this.db!.transaction(() => {
        const item = this.db!.prepare(
          "SELECT id, target_table, target_id, retry_count FROM task_queue WHERE task_type = 'compress' AND status = 'pending' AND retry_count < ? ORDER BY id ASC LIMIT 1"
        ).get(MemoryHookService.MAX_TASK_RETRIES) as { id: number; target_table: string; target_id: string; retry_count: number } | undefined;
        if (item) {
          this.db!.prepare("UPDATE task_queue SET status = 'processing' WHERE id = ?").run(item.id);
        }
        return item;
      });

      while (count < MemoryHookService.WORKER_BATCH_LIMIT) {
        const item = claimCompressTask();

        if (!item) break;

        try {
          if (item.target_table === 'observations') {
            await this.compressObservation(item.target_id);
          } else if (item.target_table === 'sessions') {
            // Compress all observations for a session + generate digest
            await this.compressSessionObservations(item.target_id);
          }
          this.db!.prepare('DELETE FROM task_queue WHERE id = ?').run(item.id);
          count++;
        } catch {
          const newRetry = (item.retry_count || 0) + 1;
          if (newRetry >= MemoryHookService.MAX_TASK_RETRIES) {
            this.db!.prepare("UPDATE task_queue SET status = 'failed', retry_count = ? WHERE id = ?").run(newRetry, item.id);
          } else {
            this.db!.prepare("UPDATE task_queue SET status = 'pending', retry_count = ? WHERE id = ?").run(newRetry, item.id);
          }
          count++;
        }
      }
    } finally {
      try { unlinkSync(lockFile); } catch { /* ignore */ }
    }

    return count;
  }

  /**
   * Get observations for a session
   */
  async getSessionObservations(sessionId: string, limit: number = 50): Promise<Observation[]> {
    await this.ensureInitialized();

    const rows = this.db!.prepare(`
      SELECT * FROM observations
      WHERE session_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(sessionId, limit) as Record<string, unknown>[];

    return rows.map(row => this.rowToObservation(row));
  }

  /**
   * Get recent observations for a project
   */
  async getRecentObservations(project: string, limit: number = 20): Promise<Observation[]> {
    await this.ensureInitialized();

    const rows = this.db!.prepare(`
      SELECT * FROM observations
      WHERE project = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(project, limit) as Record<string, unknown>[];

    return rows.map(row => this.rowToObservation(row));
  }

  // ===== Settings =====

  /**
   * Load persistent settings from .claude/memory/settings.json
   * Returns merged with defaults (missing keys get default values)
   */
  loadSettings(): MemorySettings {
    const settingsPath = path.join(path.dirname(this.dbPath), 'settings.json');
    try {
      if (existsSync(settingsPath)) {
        const raw = JSON.parse(readFileSync(settingsPath, 'utf-8'));
        return {
          context: { ...DEFAULT_CONTEXT_CONFIG, ...(raw.context || {}) },
        };
      }
    } catch {
      // Ignore parse errors, return defaults
    }
    return { ...DEFAULT_MEMORY_SETTINGS, context: { ...DEFAULT_CONTEXT_CONFIG } };
  }

  /**
   * Save settings to .claude/memory/settings.json
   */
  saveSettings(settings: MemorySettings): void {
    const settingsPath = path.join(path.dirname(this.dbPath), 'settings.json');
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  }

  // ===== Context Generation =====

  /**
   * Get memory context for session start
   */
  async getContext(project: string, configOverride?: ContextConfig): Promise<MemoryContext> {
    await this.ensureInitialized();

    // Load persistent settings, allow runtime override
    const settings = this.loadSettings();
    const config = configOverride || settings.context;

    const recentObservations = await this.getRecentObservations(
      project,
      config.maxObservations
    );

    const previousSessions = await this.getRecentSessions(
      project,
      this.config.maxContextSessions
    );

    const userPrompts = await this.getRecentPrompts(project, config.maxPrompts);
    const sessionSummaries = await this.getRecentSummaries(project, config.maxSummaries);

    // Generate markdown with settings-driven config
    const markdown = this.formatContextMarkdown(
      recentObservations, previousSessions, userPrompts, sessionSummaries, project, config
    );

    return {
      recentObservations,
      previousSessions,
      userPrompts,
      sessionSummaries,
      markdown,
    };
  }

  /**
   * Format context as markdown
   */
  private formatContextMarkdown(
    observations: Observation[],
    sessions: SessionRecord[],
    prompts: UserPrompt[],
    summaries: SessionSummary[],
    project: string,
    config: ContextConfig = DEFAULT_CONTEXT_CONFIG
  ): string {
    const lines: string[] = [];

    lines.push(`# Memory Context - ${project}`);
    lines.push('');

    // Tool-usage instruction header (CRITICAL for LLM tool adoption)
    if (config.showToolGuidance) {
      lines.push('> **Memory tools available** — Use MCP tools to search and manage project memory:');
      lines.push('> `memory_search(query)` → `memory_timeline(anchor)` → `memory_details(ids)` (3-layer workflow)');
      lines.push('> Also: `memory_save`, `memory_recall`, `memory_list`, `memory_delete`, `memory_update`, `memory_status`');
      lines.push('');
    }

    // Structured summaries from previous sessions (most valuable context)
    if (config.showSummaries && summaries.length > 0) {
      lines.push('## Previous Session Summaries');
      lines.push('');

      for (const summary of summaries.slice(0, config.maxSummaries)) {
        const time = this.formatRelativeTime(summary.createdAt);
        lines.push(`### Session (${time})`);
        if (summary.request) {
          lines.push(`**Request:** ${summary.request.substring(0, 300)}`);
        }
        if (summary.completed) {
          lines.push(`**Completed:** ${summary.completed}`);
        }
        if (summary.filesModified.length > 0) {
          lines.push(`**Files Modified:** ${summary.filesModified.slice(0, 10).join(', ')}`);
        }
        if (summary.decisions && summary.decisions.length > 0) {
          lines.push(`**Decisions:** ${summary.decisions.slice(0, 5).join('; ')}`);
        }
        if (summary.errors && summary.errors.length > 0) {
          lines.push(`**Errors:** ${summary.errors.slice(0, 3).join('; ')}`);
        }
        if (summary.nextSteps) {
          lines.push(`**Next Steps:** ${summary.nextSteps}`);
        }
        lines.push('');
      }
    }

    // Recent user prompts (shows what user has been asking)
    if (config.showPrompts && prompts.length > 0) {
      lines.push('## Recent User Prompts');
      lines.push('');

      for (const prompt of prompts.slice(0, config.maxPrompts)) {
        const time = this.formatRelativeTime(prompt.createdAt);
        lines.push(`- (${time}) ${prompt.promptText.substring(0, 150)}${prompt.promptText.length > 150 ? '...' : ''}`);
      }
      lines.push('');
    }

    // Recent observations — group by prompt when available
    if (config.showObservations && observations.length > 0) {
      const maxObs = config.maxObservations;
      const slicedObs = observations.slice(0, maxObs);

      // Check if we have prompt-linked observations to group
      const hasPromptLinks = prompts.length > 0 && slicedObs.some(o => o.promptNumber);

      if (hasPromptLinks) {
        lines.push('## Recent Activity');
        lines.push('');

        // Group observations by prompt number
        const obsByPrompt = new Map<number, Observation[]>();
        for (const obs of slicedObs) {
          const pn = obs.promptNumber || 0;
          if (!obsByPrompt.has(pn)) obsByPrompt.set(pn, []);
          obsByPrompt.get(pn)!.push(obs);
        }

        for (const [pn, obsGroup] of obsByPrompt) {
          const prompt = prompts.find(p => p.promptNumber === pn);
          if (prompt) {
            lines.push(`### Prompt #${pn}: ${prompt.promptText.substring(0, 80)}${prompt.promptText.length > 80 ? '...' : ''}`);
          } else if (pn > 0) {
            lines.push(`### Prompt #${pn}`);
          }
          for (const obs of obsGroup) {
            const icon = this.getObservationIcon(obs.type);
            const detail = obs.compressedSummary || obs.subtitle || obs.title || obs.toolName;
            const intentBadge = this.formatIntentBadge(obs.concepts || []);
            lines.push(`- ${icon} **${detail}**${intentBadge} [${obs.id}]`);
          }
          lines.push('');
        }
      } else {
        // Flat list (no prompt grouping)
        lines.push('## Recent Activity');
        lines.push('');

        for (const obs of slicedObs) {
          const time = this.formatRelativeTime(obs.timestamp);
          const icon = this.getObservationIcon(obs.type);
          const detail = obs.compressedSummary || obs.subtitle || obs.title || obs.toolName;
          const intentBadge = this.formatIntentBadge(obs.concepts || []);
          lines.push(`- ${icon} **${detail}**${intentBadge} (${time}) [${obs.id}]`);
          if (obs.narrative) {
            lines.push(`  ${obs.narrative}`);
          }
          if (obs.concepts && obs.concepts.length > 0) {
            lines.push(`  *Concepts: ${obs.concepts.join(', ')}*`);
          }
        }
        lines.push('');
      }
    }

    // Previous sessions (fallback if no structured summaries)
    if (config.showSummaries && summaries.length === 0 && sessions.length > 0) {
      lines.push('## Previous Sessions');
      lines.push('');

      for (const session of sessions.slice(0, config.maxSummaries)) {
        const time = this.formatRelativeTime(session.startedAt);
        const status = session.status === 'completed' ? '✓' : '→';
        lines.push(`### ${status} Session (${time})`);

        if (session.prompt) {
          lines.push(`**Task:** ${session.prompt.substring(0, 100)}${session.prompt.length > 100 ? '...' : ''}`);
        }

        if (session.summary) {
          lines.push(`**Summary:** ${session.summary}`);
        }

        lines.push(`*Observations: ${session.observationCount}*`);
        lines.push('');
      }
    }

    // No context available
    if (observations.length === 0 && sessions.length === 0 && prompts.length === 0) {
      lines.push('*No previous session context available.*');
      lines.push('');
    }

    // Token economics footer (motivates LLM to use progressive disclosure)
    const totalObs = observations.length;
    const totalSessions = summaries.length || sessions.length;
    if (totalObs > 0 || totalSessions > 0) {
      const estimatedFullTokens = (totalObs * 500) + (totalSessions * 200);
      const contextTokens = lines.join('\n').length / 4; // rough estimate
      lines.push('---');
      lines.push(`*Context: ~${Math.round(contextTokens)} tokens shown. ~${estimatedFullTokens.toLocaleString()} tokens available via \`memory_search\` → \`memory_details\`.*`);
      lines.push('');
    }

    // Wrap in XML tags with usage disclaimer
    const content = lines.join('\n');
    return `<agentkits-memory-context>\n${content}\nUse these naturally when relevant. Don't force them into every response.\n</agentkits-memory-context>`;
  }

  /**
   * Generate session summary from observations (legacy text format)
   */
  async generateSummary(sessionId: string): Promise<string> {
    const structured = await this.generateStructuredSummary(sessionId);
    // Format as readable text
    const parts: string[] = [];
    if (structured.request) parts.push(`Request: ${structured.request}`);
    if (structured.completed) parts.push(`Completed: ${structured.completed}`);
    if (structured.filesModified.length > 0) {
      parts.push(`Files modified: ${structured.filesModified.join(', ')}`);
    }
    if (structured.nextSteps) parts.push(`Next: ${structured.nextSteps}`);
    return parts.join('. ') || 'No activity recorded.';
  }

  /**
   * Generate structured session summary from observations + prompts
   */
  async generateStructuredSummary(sessionId: string): Promise<Omit<SessionSummary, 'id' | 'createdAt'>> {
    const observations = await this.getSessionObservations(sessionId);
    const prompts = await this.getSessionPrompts(sessionId);
    const session = this.getSession(sessionId);

    // Extract file paths, commands, decisions, and errors from observations
    const filesRead: Set<string> = new Set();
    const filesModified: Set<string> = new Set();
    const commands: string[] = [];
    const decisions: string[] = [];
    const errors: string[] = [];

    for (const obs of observations) {
      try {
        const input = JSON.parse(obs.toolInput);
        const filePath = input.file_path || input.path || '';

        if (obs.type === 'read' && filePath) {
          filesRead.add(filePath);
        } else if (obs.type === 'write' && filePath) {
          filesModified.add(filePath);

          // Extract decision rationale from Edit/MultiEdit diffs
          if (obs.toolName === 'Edit' || obs.toolName === 'MultiEdit') {
            const diffs = extractCodeDiffs(obs.toolName, input);
            const intents = extractIntents(obs.concepts || []);
            const intentLabel = intents.length > 0 ? ` (${intents.join(', ')})` : '';
            const fileName = filePath.split(/[/\\]/).pop() || filePath;

            for (const diff of diffs.slice(0, 2)) {
              const beforeLine = diff.before.split('\n')[0].trim().substring(0, 40);
              const afterLine = diff.after.split('\n')[0].trim().substring(0, 40);
              if (beforeLine && afterLine && beforeLine !== afterLine) {
                decisions.push(`${fileName}${intentLabel}: "${beforeLine}" → "${afterLine}"`);
              }
            }
          }
        } else if (obs.type === 'execute' && input.command) {
          commands.push(input.command.substring(0, 80));

          // Extract errors from Bash output
          try {
            const response = JSON.parse(obs.toolResponse);
            const stderr = (response?.stderr || '') as string;
            const stdout = (response?.stdout || response?.output || '') as string;
            const output = stderr + '\n' + stdout;

            // Detect error patterns
            const errorLines = output.split('\n').filter((line: string) => {
              const l = line.toLowerCase();
              return (l.includes('error') || l.includes('failed') || l.includes('exception') || l.includes('fatal'))
                && !l.includes('0 errors') && !l.includes('no errors') && line.trim().length > 5;
            });

            for (const errLine of errorLines.slice(0, 3)) {
              const trimmed = errLine.trim().substring(0, 150);
              if (trimmed && !errors.includes(trimmed)) {
                errors.push(trimmed);
              }
            }
          } catch { /* ignore response parse errors */ }
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Build request from user prompts
    const request = prompts.length > 0
      ? prompts.map(p => `[#${p.promptNumber}] ${p.promptText.substring(0, 200)}`).join(' → ')
      : session?.prompt || '';

    // Build completed from observation summary
    const byType: Record<string, number> = {};
    for (const obs of observations) {
      byType[obs.type] = (byType[obs.type] || 0) + 1;
    }
    const completedParts: string[] = [];
    if (byType.write) completedParts.push(`${byType.write} file(s) modified`);
    if (byType.read) completedParts.push(`${byType.read} file(s) read`);
    if (byType.execute) completedParts.push(`${byType.execute} command(s) executed`);
    if (byType.search) completedParts.push(`${byType.search} search(es)`);

    // Build notes from commands
    const notes = commands.length > 0
      ? `Commands: ${commands.slice(0, 5).join('; ')}${commands.length > 5 ? ` (+${commands.length - 5} more)` : ''}`
      : '';

    return {
      sessionId,
      project: session?.project || '',
      request: truncate(request, 500),
      completed: completedParts.join(', ') || 'No activity recorded',
      filesRead: Array.from(filesRead).slice(0, 20),
      filesModified: Array.from(filesModified).slice(0, 20),
      nextSteps: '',
      notes,
      decisions: decisions.slice(0, 10),
      errors: errors.slice(0, 10),
      promptNumber: prompts.length,
    };
  }

  // ===== Session Summary Storage =====

  /**
   * Save structured session summary to session_summaries table
   */
  async saveSessionSummary(summary: Omit<SessionSummary, 'id' | 'createdAt'>): Promise<SessionSummary> {
    await this.ensureInitialized();

    const now = Date.now();
    const result = this.db!.prepare(`
      INSERT INTO session_summaries
      (session_id, project, request, completed, files_read, files_modified, next_steps, notes, decisions, errors, prompt_number, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      summary.sessionId,
      summary.project,
      summary.request,
      summary.completed,
      JSON.stringify(summary.filesRead),
      JSON.stringify(summary.filesModified),
      summary.nextSteps,
      summary.notes,
      JSON.stringify(summary.decisions || []),
      JSON.stringify(summary.errors || []),
      summary.promptNumber,
      now
    );

    const id = Number(result.lastInsertRowid);

    // Queue embedding generation
    if (id > 0) {
      this.queueTask('embed', 'session_summaries', id);
    }

    return {
      ...summary,
      id,
      createdAt: now,
    };
  }

  /**
   * Get recent session summaries for a project
   */
  async getRecentSummaries(project: string, limit: number = 5): Promise<SessionSummary[]> {
    await this.ensureInitialized();

    const rows = this.db!.prepare(`
      SELECT * FROM session_summaries
      WHERE project = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(project, limit) as Record<string, unknown>[];

    return rows.map(row => this.rowToSummary(row));
  }

  /**
   * Enrich a session summary with AI using transcript data.
   * Called from a background process after the template summary is saved.
   * Reads the transcript JSONL, extracts last assistant message,
   * then uses AI to enhance the completed/nextSteps fields.
   */
  async enrichSessionSummary(sessionId: string, transcriptPath: string): Promise<boolean> {
    await this.ensureInitialized();

    // Get existing summary from DB
    const rows = this.db!.prepare(
      'SELECT * FROM session_summaries WHERE session_id = ? ORDER BY created_at DESC LIMIT 1'
    ).all(sessionId) as Record<string, unknown>[];

    if (rows.length === 0) return false;

    const summary = this.rowToSummary(rows[0]);

    // Extract last assistant message from transcript
    const lastMessage = extractLastAssistantMessage(transcriptPath);
    if (!lastMessage) return false;

    // Build template summary text for AI context
    const templateText = [
      summary.request ? `Request: ${summary.request}` : '',
      summary.completed ? `Completed: ${summary.completed}` : '',
      summary.filesModified.length > 0 ? `Files modified: ${summary.filesModified.join(', ')}` : '',
      summary.notes ? `Notes: ${summary.notes}` : '',
    ].filter(Boolean).join('\n');

    // Call AI enrichment
    const enriched = await enrichSummaryWithAI(templateText, lastMessage).catch(() => null);
    if (!enriched) return false;

    // Update summary in-place (including AI-extracted decisions if available)
    this.db!.prepare(`
      UPDATE session_summaries
      SET completed = ?, next_steps = ?, decisions = ?
      WHERE id = ?
    `).run(
      enriched.completed,
      enriched.nextSteps,
      JSON.stringify(enriched.decisions || summary.decisions || []),
      summary.id
    );

    return true;
  }

  private rowToSummary(row: Record<string, unknown>): SessionSummary {
    return {
      id: row.id as number,
      sessionId: row.session_id as string,
      project: row.project as string,
      request: row.request as string || '',
      completed: row.completed as string || '',
      filesRead: JSON.parse((row.files_read as string) || '[]'),
      filesModified: JSON.parse((row.files_modified as string) || '[]'),
      nextSteps: row.next_steps as string || '',
      notes: row.notes as string || '',
      decisions: JSON.parse((row.decisions as string) || '[]'),
      errors: JSON.parse((row.errors as string) || '[]'),
      promptNumber: row.prompt_number as number || 0,
      createdAt: row.created_at as number,
    };
  }

  // ===== Lifecycle Management =====

  /**
   * Run lifecycle tasks: compress old observations, archive old sessions,
   * optionally delete archived sessions, and vacuum.
   */
  async runLifecycleTasks(config: Partial<LifecycleConfig> = {}): Promise<LifecycleResult> {
    await this.ensureInitialized();

    const cfg = { ...DEFAULT_LIFECYCLE_CONFIG, ...config };
    const now = Date.now();
    let compressed = 0;
    let archived = 0;
    let deleted = 0;
    let vacuumed = false;

    // 1. Compress old uncompressed observations
    if (cfg.autoCompress) {
      const cutoff = now - cfg.compressAfterDays * 86400000;
      const rows = this.db!.prepare(
        'SELECT id FROM observations WHERE is_compressed = 0 AND timestamp < ? LIMIT 100'
      ).all(cutoff) as { id: string }[];

      for (const row of rows) {
        this.queueTask('compress', 'observations', row.id);
        compressed++;
      }
    }

    // 2. Archive old completed sessions
    if (cfg.autoArchive) {
      const cutoff = now - cfg.archiveAfterDays * 86400000;
      const result = this.db!.prepare(
        "UPDATE sessions SET status = 'archived' WHERE status = 'completed' AND ended_at IS NOT NULL AND ended_at < ?"
      ).run(cutoff);
      archived = result.changes;
    }

    // 3. Delete archived sessions (opt-in)
    if (cfg.autoDelete) {
      const cutoff = now - cfg.deleteAfterDays * 86400000;
      const sessions = this.db!.prepare(
        "SELECT session_id FROM sessions WHERE status = 'archived' AND ended_at IS NOT NULL AND ended_at < ?"
      ).all(cutoff) as { session_id: string }[];

      if (sessions.length > 0) {
        const deleteTransaction = this.db!.transaction(() => {
          for (const s of sessions) {
            this.db!.prepare('DELETE FROM observations WHERE session_id = ?').run(s.session_id);
            this.db!.prepare('DELETE FROM user_prompts WHERE session_id = ?').run(s.session_id);
            this.db!.prepare('DELETE FROM session_summaries WHERE session_id = ?').run(s.session_id);
            this.db!.prepare('DELETE FROM session_digests WHERE session_id = ?').run(s.session_id);
            this.db!.prepare('DELETE FROM sessions WHERE session_id = ?').run(s.session_id);
          }
        });
        deleteTransaction();
        deleted = sessions.length;

        // 4. Vacuum if deletes occurred
        if (cfg.autoVacuum && deleted > 0) {
          this.db!.exec('VACUUM');
          vacuumed = true;
        }
      }
    }

    return { compressed, archived, deleted, vacuumed };
  }

  /**
   * Get lifecycle statistics for the database
   */
  async getLifecycleStats(): Promise<LifecycleStats> {
    await this.ensureInitialized();

    const sessionStats = this.db!.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived
      FROM sessions
    `).get() as { total: number; active: number; completed: number; archived: number };

    const obsStats = this.db!.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN is_compressed = 1 THEN 1 ELSE 0 END) as compressed,
        SUM(CASE WHEN is_compressed = 0 THEN 1 ELSE 0 END) as uncompressed
      FROM observations
    `).get() as { total: number; compressed: number; uncompressed: number };

    const promptStats = this.db!.prepare(
      'SELECT COUNT(*) as total FROM user_prompts'
    ).get() as { total: number };

    // Get DB file size
    let dbSizeBytes = 0;
    try {
      const { statSync } = await import('node:fs');
      const stat = statSync(this.dbPath);
      dbSizeBytes = stat.size;
    } catch { /* ignore */ }

    return {
      totalSessions: sessionStats.total || 0,
      activeSessions: sessionStats.active || 0,
      completedSessions: sessionStats.completed || 0,
      archivedSessions: sessionStats.archived || 0,
      totalObservations: obsStats.total || 0,
      compressedObservations: obsStats.compressed || 0,
      uncompressedObservations: obsStats.uncompressed || 0,
      totalPrompts: promptStats.total || 0,
      dbSizeBytes,
    };
  }

  // ===== Cross-Session Pattern Detection =====

  /**
   * Detect recurring patterns across sessions for a project.
   * Analyzes concept frequency across recent observations to identify
   * common workflows, frequently modified files, and recurring intents.
   * Returns top patterns sorted by frequency.
   */
  async detectCrossSessionPatterns(project: string, limit: number = 10): Promise<Array<{ pattern: string; count: number; category: string }>> {
    await this.ensureInitialized();

    // Get concepts from recent observations (last 30 days)
    const cutoff = Date.now() - 30 * 86400000;
    const rows = this.db!.prepare(`
      SELECT concepts FROM observations
      WHERE project = ? AND timestamp > ? AND concepts IS NOT NULL
    `).all(project, cutoff) as { concepts: string }[];

    // Count concept frequency
    const conceptCounts = new Map<string, number>();
    for (const row of rows) {
      try {
        const concepts = JSON.parse(row.concepts) as string[];
        for (const concept of concepts) {
          conceptCounts.set(concept, (conceptCounts.get(concept) || 0) + 1);
        }
      } catch { /* ignore */ }
    }

    // Categorize and sort
    const patterns = Array.from(conceptCounts.entries())
      .filter(([, count]) => count >= 2) // Only patterns that appear at least twice
      .map(([pattern, count]) => {
        let category = 'topic';
        if (pattern.startsWith('intent:')) category = 'intent';
        else if (pattern.startsWith('fn:')) category = 'function';
        else if (pattern.startsWith('class:')) category = 'class';
        else if (pattern.startsWith('pattern:')) category = 'code-pattern';
        return { pattern, count, category };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return patterns;
  }

  // ===== Export/Import =====

  /**
   * Export sessions and related data to JSON format
   */
  async exportToJSON(project: string, sessionIds?: string[]): Promise<ExportData> {
    await this.ensureInitialized();

    let sessions: Record<string, unknown>[];
    if (sessionIds && sessionIds.length > 0) {
      const placeholders = sessionIds.map(() => '?').join(',');
      sessions = this.db!.prepare(
        `SELECT * FROM sessions WHERE session_id IN (${placeholders})`
      ).all(...sessionIds) as Record<string, unknown>[];
    } else {
      sessions = this.db!.prepare(
        'SELECT * FROM sessions WHERE project = ? ORDER BY started_at DESC'
      ).all(project) as Record<string, unknown>[];
    }

    const exportSessions: ExportSession[] = [];

    for (const session of sessions) {
      const sid = session.session_id as string;

      const observations = this.db!.prepare(
        'SELECT * FROM observations WHERE session_id = ? ORDER BY timestamp ASC'
      ).all(sid) as Record<string, unknown>[];

      const prompts = this.db!.prepare(
        'SELECT * FROM user_prompts WHERE session_id = ? ORDER BY prompt_number ASC'
      ).all(sid) as Record<string, unknown>[];

      const summary = this.db!.prepare(
        'SELECT * FROM session_summaries WHERE session_id = ? ORDER BY created_at DESC LIMIT 1'
      ).get(sid) as Record<string, unknown> | undefined;

      exportSessions.push({
        sessionId: sid,
        project: session.project as string,
        prompt: session.prompt as string,
        startedAt: session.started_at as number,
        endedAt: (session.ended_at as number) || undefined,
        status: session.status as string,
        parentSessionId: (session.parent_session_id as string) || undefined,
        observations: observations.map(o => ({
          id: o.id as string,
          toolName: o.tool_name as string,
          timestamp: o.timestamp as number,
          type: o.type as string,
          title: o.title as string | undefined,
          subtitle: o.subtitle as string | undefined,
          narrative: o.narrative as string | undefined,
          facts: JSON.parse((o.facts as string) || '[]'),
          concepts: JSON.parse((o.concepts as string) || '[]'),
          contentHash: o.content_hash as string | undefined,
          compressedSummary: o.compressed_summary as string | undefined,
          isCompressed: (o.is_compressed as number) === 1,
        })),
        prompts: prompts.map(p => ({
          promptNumber: p.prompt_number as number,
          promptText: p.prompt_text as string,
          createdAt: p.created_at as number,
          contentHash: p.content_hash as string | undefined,
        })),
        summary: summary ? {
          request: summary.request as string,
          completed: summary.completed as string,
          filesRead: JSON.parse((summary.files_read as string) || '[]'),
          filesModified: JSON.parse((summary.files_modified as string) || '[]'),
          nextSteps: summary.next_steps as string,
          notes: summary.notes as string,
          decisions: JSON.parse((summary.decisions as string) || '[]'),
          errors: JSON.parse((summary.errors as string) || '[]'),
        } : undefined,
      });
    }

    return {
      version: '1.0',
      exportedAt: Date.now(),
      project,
      sessions: exportSessions,
    };
  }

  /**
   * Import sessions and related data from JSON format.
   * Generates new session IDs prefixed with 'imported_' to avoid conflicts.
   * Deduplicates observations and prompts via content_hash.
   */
  async importFromJSON(data: ExportData): Promise<ImportResult> {
    await this.ensureInitialized();

    let importedSessions = 0;
    let importedObservations = 0;
    let importedPrompts = 0;
    let skippedObservations = 0;
    let skippedPrompts = 0;

    const importTransaction = this.db!.transaction(() => {
      for (const session of data.sessions) {
        const newSessionId = `imported_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

        // Insert session
        this.db!.prepare(`
          INSERT INTO sessions (session_id, project, prompt, started_at, ended_at, observation_count, status, parent_session_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          newSessionId, session.project, session.prompt,
          session.startedAt, session.endedAt || null,
          session.observations.length, session.status || 'completed',
          session.parentSessionId || null
        );
        importedSessions++;

        // Import observations (dedup by content_hash)
        for (const obs of session.observations) {
          if (obs.contentHash) {
            const existing = this.db!.prepare(
              'SELECT id FROM observations WHERE content_hash = ? LIMIT 1'
            ).get(obs.contentHash) as { id: string } | undefined;
            if (existing) {
              skippedObservations++;
              continue;
            }
          }

          const newObsId = generateObservationId();
          this.db!.prepare(`
            INSERT INTO observations (id, session_id, project, tool_name, tool_input, tool_response, cwd, timestamp, type, title, subtitle, narrative, facts, concepts, content_hash, compressed_summary, is_compressed)
            VALUES (?, ?, ?, ?, '{}', '{}', '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            newObsId, newSessionId, session.project, obs.toolName,
            obs.timestamp, obs.type, obs.title || null, obs.subtitle || null,
            obs.narrative || null, JSON.stringify(obs.facts || []),
            JSON.stringify(obs.concepts || []), obs.contentHash || null,
            obs.compressedSummary || null, obs.isCompressed ? 1 : 0
          );
          importedObservations++;

          // Queue embedding
          this.queueTask('embed', 'observations', newObsId);
        }

        // Import prompts (dedup by content_hash)
        for (const prompt of session.prompts) {
          if (prompt.contentHash) {
            const fiveMinWindow = prompt.createdAt + 5 * 60 * 1000;
            const existing = this.db!.prepare(
              'SELECT id FROM user_prompts WHERE content_hash = ? AND created_at < ? LIMIT 1'
            ).get(prompt.contentHash, fiveMinWindow) as { id: number } | undefined;
            if (existing) {
              skippedPrompts++;
              continue;
            }
          }

          const result = this.db!.prepare(`
            INSERT INTO user_prompts (session_id, prompt_number, prompt_text, content_hash, created_at)
            VALUES (?, ?, ?, ?, ?)
          `).run(newSessionId, prompt.promptNumber, prompt.promptText, prompt.contentHash || null, prompt.createdAt);
          importedPrompts++;

          if (result.changes > 0) {
            this.queueTask('embed', 'user_prompts', Number(result.lastInsertRowid));
          }
        }

        // Import summary
        if (session.summary) {
          const s = session.summary;
          this.db!.prepare(`
            INSERT INTO session_summaries (session_id, project, request, completed, files_read, files_modified, next_steps, notes, decisions, errors, prompt_number, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            newSessionId, session.project, s.request, s.completed,
            JSON.stringify(s.filesRead || []), JSON.stringify(s.filesModified || []),
            s.nextSteps || '', s.notes || '', JSON.stringify(s.decisions || []),
            JSON.stringify(s.errors || []),
            session.prompts.length, Date.now()
          );
        }
      }
    });

    importTransaction();

    return {
      imported: { sessions: importedSessions, observations: importedObservations, prompts: importedPrompts },
      skipped: { observations: skippedObservations, prompts: skippedPrompts },
    };
  }

  // ===== Private Methods =====

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private createSchema(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE NOT NULL,
        project TEXT NOT NULL,
        prompt TEXT,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        observation_count INTEGER DEFAULT 0,
        summary TEXT,
        status TEXT DEFAULT 'active',
        parent_session_id TEXT
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS observations (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        project TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        tool_input TEXT,
        tool_response TEXT,
        cwd TEXT,
        timestamp INTEGER NOT NULL,
        type TEXT,
        title TEXT,
        prompt_number INTEGER,
        files_read TEXT DEFAULT '[]',
        files_modified TEXT DEFAULT '[]',
        subtitle TEXT,
        narrative TEXT,
        facts TEXT DEFAULT '[]',
        concepts TEXT DEFAULT '[]',
        embedding BLOB,
        content_hash TEXT,
        compressed_summary TEXT,
        is_compressed INTEGER DEFAULT 0,
        FOREIGN KEY (session_id) REFERENCES sessions(session_id)
      )
    `);

    // User prompts table - tracks ALL prompts in a session
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        prompt_number INTEGER NOT NULL,
        prompt_text TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        embedding BLOB,
        content_hash TEXT,
        UNIQUE(session_id, prompt_number),
        FOREIGN KEY (session_id) REFERENCES sessions(session_id)
      )
    `);

    // Structured session summaries
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        project TEXT NOT NULL,
        request TEXT,
        completed TEXT,
        files_read TEXT DEFAULT '[]',
        files_modified TEXT DEFAULT '[]',
        next_steps TEXT,
        notes TEXT,
        decisions TEXT DEFAULT '[]',
        errors TEXT DEFAULT '[]',
        prompt_number INTEGER,
        created_at INTEGER NOT NULL,
        embedding BLOB,
        FOREIGN KEY (session_id) REFERENCES sessions(session_id)
      )
    `);

    // Task queue: holds pending background tasks (embedding, enrichment)
    // processed by single-instance workers with lock files
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS task_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_type TEXT NOT NULL,
        target_table TEXT NOT NULL,
        target_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        retry_count INTEGER DEFAULT 0
      )
    `);

    // Session digests — compressed session-level summaries
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_digests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL UNIQUE,
        project TEXT NOT NULL,
        digest TEXT NOT NULL,
        observation_count INTEGER,
        created_at INTEGER NOT NULL,
        embedding BLOB
      )
    `);

    // Base indexes (columns that exist in original schema)
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_obs_session ON observations(session_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_obs_project ON observations(project)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_obs_timestamp ON observations(timestamp)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_prompts_session ON user_prompts(session_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_summaries_session ON session_summaries(session_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_summaries_project ON session_summaries(project)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_digests_project ON session_digests(project)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_task_queue_status ON task_queue(status, task_type)');

    // Migration: add new columns to existing tables
    this.migrateSchema();

    // Indexes on migrated columns (must run AFTER migration)
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_obs_content_hash ON observations(content_hash)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_prompts_hash ON user_prompts(content_hash)');
  }

  /**
   * Migrate schema for existing databases (add new columns)
   */
  private migrateSchema(): void {
    if (!this.db) return;

    try {
      const obsColumns = this.db.prepare("PRAGMA table_info(observations)").all() as Array<{ name: string }>;
      const columnNames = new Set(obsColumns.map(c => c.name));

      const migrations: Array<[string, string]> = [
        ['prompt_number', 'ALTER TABLE observations ADD COLUMN prompt_number INTEGER'],
        ['files_read', "ALTER TABLE observations ADD COLUMN files_read TEXT DEFAULT '[]'"],
        ['files_modified', "ALTER TABLE observations ADD COLUMN files_modified TEXT DEFAULT '[]'"],
        ['subtitle', 'ALTER TABLE observations ADD COLUMN subtitle TEXT'],
        ['narrative', 'ALTER TABLE observations ADD COLUMN narrative TEXT'],
        ['facts', "ALTER TABLE observations ADD COLUMN facts TEXT DEFAULT '[]'"],
        ['concepts', "ALTER TABLE observations ADD COLUMN concepts TEXT DEFAULT '[]'"],
        ['content_hash', 'ALTER TABLE observations ADD COLUMN content_hash TEXT'],
        ['compressed_summary', 'ALTER TABLE observations ADD COLUMN compressed_summary TEXT'],
        ['is_compressed', 'ALTER TABLE observations ADD COLUMN is_compressed INTEGER DEFAULT 0'],
      ];

      for (const [column, sql] of migrations) {
        if (!columnNames.has(column)) {
          this.db.exec(sql);
        }
      }

      // Migrate user_prompts: add content_hash
      try {
        const promptCols = this.db.prepare("PRAGMA table_info(user_prompts)").all() as Array<{ name: string }>;
        if (!promptCols.some(c => c.name === 'content_hash')) {
          this.db.exec('ALTER TABLE user_prompts ADD COLUMN content_hash TEXT');
        }
      } catch { /* ignore */ }

      // Migrate sessions: add parent_session_id
      try {
        const sessionCols = this.db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
        if (!sessionCols.some(c => c.name === 'parent_session_id')) {
          this.db.exec('ALTER TABLE sessions ADD COLUMN parent_session_id TEXT');
        }
      } catch { /* ignore */ }

      // Migrate session_summaries: add decisions + errors columns
      try {
        const summaryCols = this.db.prepare("PRAGMA table_info(session_summaries)").all() as Array<{ name: string }>;
        if (!summaryCols.some(c => c.name === 'decisions')) {
          this.db.exec("ALTER TABLE session_summaries ADD COLUMN decisions TEXT DEFAULT '[]'");
        }
        if (!summaryCols.some(c => c.name === 'errors')) {
          this.db.exec("ALTER TABLE session_summaries ADD COLUMN errors TEXT DEFAULT '[]'");
        }
      } catch { /* ignore */ }

      // Migrate task_queue: add retry_count column
      try {
        const queueCols = this.db.prepare("PRAGMA table_info(task_queue)").all() as Array<{ name: string }>;
        if (!queueCols.some(c => c.name === 'retry_count')) {
          this.db.exec('ALTER TABLE task_queue ADD COLUMN retry_count INTEGER DEFAULT 0');
        }
      } catch { /* ignore */ }

      // Add embedding column to all session tables
      for (const table of ['observations', 'user_prompts', 'session_summaries']) {
        const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
        if (!cols.some(c => c.name === 'embedding')) {
          this.db.exec(`ALTER TABLE ${table} ADD COLUMN embedding BLOB`);
        }
      }
    } catch {
      // Ignore migration errors on fresh databases
    }
  }

  private rowToSession(row: Record<string, unknown>): SessionRecord {
    return {
      id: row.id as number,
      sessionId: row.session_id as string,
      project: row.project as string,
      prompt: row.prompt as string,
      startedAt: row.started_at as number,
      endedAt: row.ended_at as number | undefined,
      observationCount: row.observation_count as number,
      summary: row.summary as string | undefined,
      status: row.status as 'active' | 'completed' | 'abandoned',
      parentSessionId: row.parent_session_id as string | undefined,
    };
  }

  private rowToObservation(row: Record<string, unknown>): Observation {
    return {
      id: row.id as string,
      sessionId: row.session_id as string,
      project: row.project as string,
      toolName: row.tool_name as string,
      toolInput: row.tool_input as string,
      toolResponse: row.tool_response as string,
      cwd: row.cwd as string,
      timestamp: row.timestamp as number,
      type: row.type as Observation['type'],
      title: row.title as string | undefined,
      promptNumber: row.prompt_number as number | undefined,
      filesRead: JSON.parse((row.files_read as string) || '[]'),
      filesModified: JSON.parse((row.files_modified as string) || '[]'),
      subtitle: row.subtitle as string | undefined,
      narrative: row.narrative as string | undefined,
      facts: JSON.parse((row.facts as string) || '[]'),
      concepts: JSON.parse((row.concepts as string) || '[]'),
      contentHash: row.content_hash as string | undefined,
      compressedSummary: row.compressed_summary as string | undefined,
      isCompressed: (row.is_compressed as number) === 1,
    };
  }

  private formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return new Date(timestamp).toLocaleDateString();
  }

  private formatIntentBadge(concepts: string[]): string {
    const intents = extractIntents(concepts);
    if (intents.length === 0) return '';
    return ` [${intents.join(', ')}]`;
  }

  private getObservationIcon(type: string): string {
    switch (type) {
      case 'read': return '📖';
      case 'write': return '✏️';
      case 'execute': return '⚡';
      case 'search': return '🔍';
      default: return '•';
    }
  }
}

/**
 * Create a hook service for the given project directory
 */
export function createHookService(cwd: string): MemoryHookService {
  return new MemoryHookService(cwd);
}

/**
 * Extract the last assistant message from a Claude Code transcript JSONL file.
 * Reads the file, iterates lines in reverse, finds the last 'assistant' type entry,
 * extracts text content, and strips <system-reminder> tags.
 */
export function extractLastAssistantMessage(transcriptPath: string): string | null {
  if (!transcriptPath || !existsSync(transcriptPath)) return null;

  try {
    const content = readFileSync(transcriptPath, 'utf-8').trim();
    if (!content) return null;

    const lines = content.split('\n');

    // Iterate in reverse to find the last assistant message
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const line = JSON.parse(lines[i]);
        if (line.type !== 'assistant') continue;

        const msgContent = line.message?.content;
        if (!msgContent) continue;

        let text = '';
        if (typeof msgContent === 'string') {
          text = msgContent;
        } else if (Array.isArray(msgContent)) {
          // Extract text blocks from content array (skip tool_use blocks)
          text = msgContent
            .filter((c: { type: string }) => c.type === 'text')
            .map((c: { text: string }) => c.text)
            .join('\n');
        }

        if (!text) continue;

        // Strip <system-reminder> tags
        text = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
        text = text.replace(/\n{3,}/g, '\n\n').trim();

        // Return truncated to avoid excessive tokens
        return text.substring(0, 5000);
      } catch {
        // Skip unparseable lines
        continue;
      }
    }

    return null;
  } catch {
    return null;
  }
}

export default MemoryHookService;
