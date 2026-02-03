/**
 * Memory Hook Service
 *
 * Lightweight service for hooks to store/retrieve memory.
 * Direct SQLite access without HTTP worker.
 *
 * @module @agentkits/memory/hooks/service
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
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
  truncate,
} from './types.js';
import { enrichWithAI, enrichSummaryWithAI } from './ai-enrichment.js';

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

    // Create new session
    const now = Date.now();
    const result = this.db!.prepare(`
      INSERT INTO sessions (session_id, project, prompt, started_at, observation_count, status)
      VALUES (?, ?, ?, ?, 0, 'active')
    `).run(sessionId, project, prompt || '', now);

    return {
      id: Number(result.lastInsertRowid),
      sessionId,
      project,
      prompt: prompt || '',
      startedAt: now,
      observationCount: 0,
      status: 'active',
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

    // Get next prompt number
    const promptNumber = this.getPromptNumber(sessionId) + 1;
    const now = Date.now();

    const result = this.db!.prepare(`
      INSERT OR IGNORE INTO user_prompts (session_id, prompt_number, prompt_text, created_at)
      VALUES (?, ?, ?, ?)
    `).run(sessionId, promptNumber, promptText, now);

    const id = result.changes > 0 ? Number(result.lastInsertRowid) : 0;

    // Queue embedding generation if insert succeeded
    if (id > 0) {
      this.queueSessionEmbedding('user_prompts', id);
    }

    return {
      id,
      sessionId,
      promptNumber,
      promptText,
      createdAt: now,
    };
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

    // Truncate large responses
    const inputStr = JSON.stringify(toolInput || {});
    const responseStr = truncate(
      JSON.stringify(toolResponse || {}),
      this.config.maxResponseSize
    );

    // Template-based extraction only (fast, <10ms)
    // AI enrichment runs asynchronously via fire-and-forget process
    const subtitle = generateObservationSubtitle(toolName, toolInput, toolResponse);
    const narrative = generateObservationNarrative(toolName, toolInput, toolResponse);
    const facts = extractFacts(toolName, toolInput, toolResponse);
    const concepts = extractConcepts(toolName, toolInput, toolResponse);

    this.db!.prepare(`
      INSERT INTO observations (id, session_id, project, tool_name, tool_input, tool_response, cwd, timestamp, type, title, prompt_number, files_read, files_modified, subtitle, narrative, facts, concepts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, sessionId, project, toolName, inputStr, responseStr, cwd, now, type, title, promptNumber || null, JSON.stringify(filesRead), JSON.stringify(filesModified), subtitle, narrative, JSON.stringify(facts), JSON.stringify(concepts));

    // Queue embedding generation
    this.queueSessionEmbedding('observations', id);

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
   * Build embedding text for a session record based on table type.
   */
  private getSessionEmbeddingText(
    table: 'observations' | 'user_prompts' | 'session_summaries',
    row: Record<string, unknown>
  ): string {
    if (table === 'observations') {
      const parts = [row.title, row.subtitle, row.narrative];
      try {
        const concepts = JSON.parse((row.concepts as string) || '[]');
        if (concepts.length > 0) parts.push(concepts.join(', '));
      } catch { /* ignore */ }
      return (parts.filter(Boolean) as string[]).join(' ').trim();
    } else if (table === 'user_prompts') {
      return ((row.prompt_text as string) || '').trim();
    } else {
      const parts = [row.request, row.completed, row.next_steps, row.notes];
      return (parts.filter(Boolean) as string[]).join(' ').trim();
    }
  }

  // ===== Embedding Queue + Worker =====

  /** Max records to process per worker invocation */
  private static readonly EMBED_BATCH_LIMIT = 200;

  /**
   * Queue a session record for embedding generation.
   * Inserts into SQLite embedding_queue table — atomic, no file I/O.
   * Called from hook handlers — non-blocking, no model loading.
   */
  queueSessionEmbedding(
    table: 'observations' | 'user_prompts' | 'session_summaries',
    recordId: string | number
  ): void {
    if (!this.db) return;
    this.db.prepare(
      'INSERT INTO embedding_queue (target_table, target_id, created_at) VALUES (?, ?, ?)'
    ).run(table, String(recordId), Date.now());
  }

  /**
   * Spawn a detached embedding worker if not already running.
   * Uses a lock file (PID-based) to prevent multiple concurrent workers.
   */
  ensureEmbeddingWorkerRunning(cwd: string): void {
    const lockFile = path.join(path.dirname(this.dbPath), 'embed-worker.lock');

    // Check if worker is already running
    if (existsSync(lockFile)) {
      try {
        const pid = parseInt(readFileSync(lockFile, 'utf-8').trim(), 10);
        if (pid > 0) {
          try {
            process.kill(pid, 0); // signal 0 = check if alive
            return; // Worker still running
          } catch {
            // Stale lock, remove
            try { unlinkSync(lockFile); } catch { /* ignore */ }
          }
        }
      } catch {
        try { unlinkSync(lockFile); } catch { /* ignore */ }
      }
    }

    // Spawn detached worker
    try {
      const cliPath = path.resolve(cwd, 'dist/hooks/cli.js');
      const child = spawn('node', [cliPath, 'embed-session', cwd], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env },
      });
      child.unref();
    } catch {
      // Silently ignore
    }
  }

  /**
   * Process the embedding queue. Called by the worker process.
   * Loads embedding model ONCE. Processes queued items + any DB records missing embeddings.
   * Uses lock file to prevent concurrent workers. Respects EMBED_BATCH_LIMIT.
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
      };

      // Phase 1: Process queued items (claimed atomically)
      while (count < MemoryHookService.EMBED_BATCH_LIMIT) {
        // Claim next pending item
        const item = this.db!.prepare(
          "SELECT id, target_table, target_id FROM embedding_queue WHERE status = 'pending' ORDER BY id ASC LIMIT 1"
        ).get() as { id: number; target_table: string; target_id: string } | undefined;

        if (!item) break;

        // Mark as processing
        this.db!.prepare("UPDATE embedding_queue SET status = 'processing' WHERE id = ?").run(item.id);

        const idCol = idColMap[item.target_table];
        if (!idCol) {
          this.db!.prepare('DELETE FROM embedding_queue WHERE id = ?').run(item.id);
          continue;
        }

        try {
          const row = this.db!.prepare(
            `SELECT * FROM ${item.target_table} WHERE ${idCol} = ? AND embedding IS NULL`
          ).get(item.target_id) as Record<string, unknown> | undefined;

          if (!row) {
            // Already embedded or doesn't exist — remove from queue
            this.db!.prepare('DELETE FROM embedding_queue WHERE id = ?').run(item.id);
            continue;
          }

          const text = this.getSessionEmbeddingText(
            item.target_table as 'observations' | 'user_prompts' | 'session_summaries', row
          );
          if (!text) {
            this.db!.prepare('DELETE FROM embedding_queue WHERE id = ?').run(item.id);
            continue;
          }

          const result = await embService.embed(text);
          const buffer = Buffer.from(result.embedding.buffer, result.embedding.byteOffset, result.embedding.byteLength);
          this.db!.prepare(`UPDATE ${item.target_table} SET embedding = ? WHERE ${idCol} = ?`).run(buffer, item.target_id);
          this.db!.prepare('DELETE FROM embedding_queue WHERE id = ?').run(item.id);
          count++;
        } catch {
          // Mark as failed, will be retried on next worker run
          this.db!.prepare("UPDATE embedding_queue SET status = 'pending' WHERE id = ?").run(item.id);
        }
      }

      // Phase 2: Catch up on any DB records missing embeddings (not in queue)
      if (count < MemoryHookService.EMBED_BATCH_LIMIT) {
        const tables = Object.entries(idColMap);
        for (const [tableName, idCol] of tables) {
          if (count >= MemoryHookService.EMBED_BATCH_LIMIT) break;
          try {
            const remaining = MemoryHookService.EMBED_BATCH_LIMIT - count;
            const rows = this.db!.prepare(
              `SELECT *, ${idCol} as _rid FROM ${tableName} WHERE embedding IS NULL ORDER BY rowid DESC LIMIT ?`
            ).all(remaining) as Record<string, unknown>[];

            for (const row of rows) {
              if (count >= MemoryHookService.EMBED_BATCH_LIMIT) break;
              const text = this.getSessionEmbeddingText(
                tableName as 'observations' | 'user_prompts' | 'session_summaries', row
              );
              if (!text) continue;

              try {
                const result = await embService.embed(text);
                const buffer = Buffer.from(result.embedding.buffer, result.embedding.byteOffset, result.embedding.byteLength);
                this.db!.prepare(`UPDATE ${tableName} SET embedding = ? WHERE ${idCol} = ?`).run(buffer, row._rid);
                count++;
              } catch {
                // Skip
              }
            }
          } catch {
            // Table might not exist
          }
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

  // ===== Context Generation =====

  /**
   * Get memory context for session start
   */
  async getContext(project: string): Promise<MemoryContext> {
    await this.ensureInitialized();

    const recentObservations = await this.getRecentObservations(
      project,
      this.config.maxContextObservations
    );

    const previousSessions = await this.getRecentSessions(
      project,
      this.config.maxContextSessions
    );

    const userPrompts = await this.getRecentPrompts(project, 20);
    const sessionSummaries = await this.getRecentSummaries(project, 5);

    // Generate markdown
    const markdown = this.formatContextMarkdown(
      recentObservations, previousSessions, userPrompts, sessionSummaries, project
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
    project: string
  ): string {
    const lines: string[] = [];

    lines.push(`# Memory Context - ${project}`);
    lines.push('');

    // Tool-usage instruction header (CRITICAL for LLM tool adoption)
    lines.push('> **Memory tools available** — Use MCP tools to search and manage project memory:');
    lines.push('> `memory_search(query)` → `memory_timeline(anchor)` → `memory_details(ids)` (3-layer workflow)');
    lines.push('> Also: `memory_save`, `memory_recall`, `memory_list`, `memory_delete`, `memory_update`, `memory_status`');
    lines.push('');

    // Structured summaries from previous sessions (most valuable context)
    if (summaries.length > 0) {
      lines.push('## Previous Session Summaries');
      lines.push('');

      for (const summary of summaries.slice(0, 3)) {
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
        if (summary.nextSteps) {
          lines.push(`**Next Steps:** ${summary.nextSteps}`);
        }
        lines.push('');
      }
    }

    // Recent user prompts (shows what user has been asking)
    if (prompts.length > 0) {
      lines.push('## Recent User Prompts');
      lines.push('');

      for (const prompt of prompts.slice(0, 10)) {
        const time = this.formatRelativeTime(prompt.createdAt);
        lines.push(`- (${time}) ${prompt.promptText.substring(0, 150)}${prompt.promptText.length > 150 ? '...' : ''}`);
      }
      lines.push('');
    }

    // Recent observations with enriched details and IDs
    if (observations.length > 0) {
      lines.push('## Recent Activity');
      lines.push('');

      for (const obs of observations.slice(0, 10)) {
        const time = this.formatRelativeTime(obs.timestamp);
        const icon = this.getObservationIcon(obs.type);
        const detail = obs.subtitle || obs.title || obs.toolName;
        lines.push(`- ${icon} **${detail}** (${time}) [${obs.id}]`);
        if (obs.narrative) {
          lines.push(`  ${obs.narrative}`);
        }
        if (obs.concepts && obs.concepts.length > 0) {
          lines.push(`  *Concepts: ${obs.concepts.join(', ')}*`);
        }
      }
      lines.push('');
    }

    // Previous sessions (fallback if no structured summaries)
    if (summaries.length === 0 && sessions.length > 0) {
      lines.push('## Previous Sessions');
      lines.push('');

      for (const session of sessions.slice(0, 3)) {
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

    return lines.join('\n');
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

    // Extract file paths from observations
    const filesRead: Set<string> = new Set();
    const filesModified: Set<string> = new Set();
    const commands: string[] = [];

    for (const obs of observations) {
      try {
        const input = JSON.parse(obs.toolInput);
        const filePath = input.file_path || input.path || '';

        if (obs.type === 'read' && filePath) {
          filesRead.add(filePath);
        } else if (obs.type === 'write' && filePath) {
          filesModified.add(filePath);
        } else if (obs.type === 'execute' && input.command) {
          commands.push(input.command.substring(0, 80));
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
      (session_id, project, request, completed, files_read, files_modified, next_steps, notes, prompt_number, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      summary.sessionId,
      summary.project,
      summary.request,
      summary.completed,
      JSON.stringify(summary.filesRead),
      JSON.stringify(summary.filesModified),
      summary.nextSteps,
      summary.notes,
      summary.promptNumber,
      now
    );

    const id = Number(result.lastInsertRowid);

    // Queue embedding generation
    if (id > 0) {
      this.queueSessionEmbedding('session_summaries', id);
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

    // Update summary in-place
    this.db!.prepare(`
      UPDATE session_summaries
      SET completed = ?, next_steps = ?
      WHERE id = ?
    `).run(enriched.completed, enriched.nextSteps, summary.id);

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
      promptNumber: row.prompt_number as number || 0,
      createdAt: row.created_at as number,
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
        status TEXT DEFAULT 'active'
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
        prompt_number INTEGER,
        created_at INTEGER NOT NULL,
        embedding BLOB,
        FOREIGN KEY (session_id) REFERENCES sessions(session_id)
      )
    `);

    // Embedding queue: holds pending embed requests processed by a single worker
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embedding_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_table TEXT NOT NULL,
        target_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        status TEXT DEFAULT 'pending'
      )
    `);

    // Indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_obs_session ON observations(session_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_obs_project ON observations(project)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_obs_timestamp ON observations(timestamp)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_prompts_session ON user_prompts(session_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_summaries_session ON session_summaries(session_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_summaries_project ON session_summaries(project)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_embed_queue_status ON embedding_queue(status)');

    // Migration: add prompt_number to existing observations table
    this.migrateSchema();
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
      ];

      for (const [column, sql] of migrations) {
        if (!columnNames.has(column)) {
          this.db.exec(sql);
        }
      }

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
