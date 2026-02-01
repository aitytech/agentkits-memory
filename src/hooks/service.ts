/**
 * Memory Hook Service
 *
 * Lightweight service for hooks to store/retrieve memory.
 * Direct SQLite access without HTTP worker (simpler than claude-mem).
 *
 * @module @agentkits/memory/hooks/service
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';

// ESM-compatible require for resolving sql.js WASM path
const require = createRequire(import.meta.url);
import {
  Observation,
  SessionRecord,
  MemoryContext,
  generateObservationId,
  getObservationType,
  generateObservationTitle,
  truncate,
} from './types.js';

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
  dbFilename: 'hooks.db',
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
  private db: SqlJsDatabase | null = null;
  private SQL: any = null;
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

    // Load sql.js - use local wasm file from node_modules
    this.SQL = await initSqlJs({
      locateFile: (file: string) => {
        // Try to find the wasm file in node_modules
        const localPath = path.join(
          path.dirname(require.resolve('sql.js')),
          file
        );
        return localPath;
      },
    });

    // Load or create database
    if (existsSync(this.dbPath)) {
      const buffer = readFileSync(this.dbPath);
      this.db = new this.SQL.Database(new Uint8Array(buffer));
    } else {
      this.db = new this.SQL.Database();
    }

    // Create schema
    this.createSchema();

    this.initialized = true;
  }

  /**
   * Persist database to disk
   */
  async persist(): Promise<void> {
    if (!this.db) return;

    const data = this.db.export();
    const buffer = Buffer.from(data);
    writeFileSync(this.dbPath, buffer);
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    if (!this.initialized || !this.db) return;

    await this.persist();
    this.db.close();
    this.db = null;
    this.initialized = false;
  }

  // ===== Session Management =====

  /**
   * Initialize or get session
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
    this.db!.run(`
      INSERT INTO sessions (session_id, project, prompt, started_at, observation_count, status)
      VALUES (?, ?, ?, ?, 0, 'active')
    `, [sessionId, project, prompt || '', now]);

    await this.persist();

    return {
      id: this.db!.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0] as number || 0,
      sessionId,
      project,
      prompt: prompt || '',
      startedAt: now,
      observationCount: 0,
      status: 'active',
    };
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): SessionRecord | null {
    if (!this.db) return null;

    const stmt = this.db.prepare('SELECT * FROM sessions WHERE session_id = ?');
    stmt.bind([sessionId]);

    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return this.rowToSession(row);
    }

    stmt.free();
    return null;
  }

  /**
   * Complete a session with summary
   */
  async completeSession(sessionId: string, summary?: string): Promise<void> {
    await this.ensureInitialized();

    const now = Date.now();
    this.db!.run(`
      UPDATE sessions
      SET ended_at = ?, summary = ?, status = 'completed'
      WHERE session_id = ?
    `, [now, summary || '', sessionId]);

    await this.persist();
  }

  /**
   * Get recent sessions
   */
  async getRecentSessions(project: string, limit: number = 5): Promise<SessionRecord[]> {
    await this.ensureInitialized();

    const stmt = this.db!.prepare(`
      SELECT * FROM sessions
      WHERE project = ?
      ORDER BY started_at DESC
      LIMIT ?
    `);
    stmt.bind([project, limit]);

    const sessions: SessionRecord[] = [];
    while (stmt.step()) {
      sessions.push(this.rowToSession(stmt.getAsObject()));
    }
    stmt.free();

    return sessions;
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

    // Truncate large responses
    const inputStr = JSON.stringify(toolInput || {});
    const responseStr = truncate(
      JSON.stringify(toolResponse || {}),
      this.config.maxResponseSize
    );

    this.db!.run(`
      INSERT INTO observations (id, session_id, project, tool_name, tool_input, tool_response, cwd, timestamp, type, title)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, sessionId, project, toolName, inputStr, responseStr, cwd, now, type, title]);

    // Update session observation count
    this.db!.run(`
      UPDATE sessions
      SET observation_count = observation_count + 1
      WHERE session_id = ?
    `, [sessionId]);

    await this.persist();

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
    };
  }

  /**
   * Get observations for a session
   */
  async getSessionObservations(sessionId: string, limit: number = 50): Promise<Observation[]> {
    await this.ensureInitialized();

    const stmt = this.db!.prepare(`
      SELECT * FROM observations
      WHERE session_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    stmt.bind([sessionId, limit]);

    const observations: Observation[] = [];
    while (stmt.step()) {
      observations.push(this.rowToObservation(stmt.getAsObject()));
    }
    stmt.free();

    return observations;
  }

  /**
   * Get recent observations for a project
   */
  async getRecentObservations(project: string, limit: number = 20): Promise<Observation[]> {
    await this.ensureInitialized();

    const stmt = this.db!.prepare(`
      SELECT * FROM observations
      WHERE project = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    stmt.bind([project, limit]);

    const observations: Observation[] = [];
    while (stmt.step()) {
      observations.push(this.rowToObservation(stmt.getAsObject()));
    }
    stmt.free();

    return observations;
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

    // Generate markdown
    const markdown = this.formatContextMarkdown(recentObservations, previousSessions, project);

    return {
      recentObservations,
      previousSessions,
      markdown,
    };
  }

  /**
   * Format context as markdown
   */
  private formatContextMarkdown(
    observations: Observation[],
    sessions: SessionRecord[],
    project: string
  ): string {
    const lines: string[] = [];

    lines.push(`# Memory Context - ${project}`);
    lines.push('');
    lines.push('*AgentKits CPS™ - Auto-captured session memory*');
    lines.push('');

    // Recent observations
    if (observations.length > 0) {
      lines.push('## Recent Activity');
      lines.push('');
      lines.push('| Time | Action | Details |');
      lines.push('|------|--------|---------|');

      for (const obs of observations.slice(0, 10)) {
        const time = this.formatRelativeTime(obs.timestamp);
        const icon = this.getObservationIcon(obs.type);
        lines.push(`| ${time} | ${icon} ${obs.toolName} | ${obs.title || ''} |`);
      }
      lines.push('');
    }

    // Previous sessions
    if (sessions.length > 0) {
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
    if (observations.length === 0 && sessions.length === 0) {
      lines.push('*No previous session context available.*');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generate session summary from observations
   */
  async generateSummary(sessionId: string): Promise<string> {
    const observations = await this.getSessionObservations(sessionId);

    if (observations.length === 0) {
      return 'No activity recorded in this session.';
    }

    // Group by type
    const byType: Record<string, number> = {};
    const files: Set<string> = new Set();

    for (const obs of observations) {
      byType[obs.type] = (byType[obs.type] || 0) + 1;

      // Extract file paths
      try {
        const input = JSON.parse(obs.toolInput);
        if (input.file_path || input.path) {
          files.add(input.file_path || input.path);
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Build summary
    const parts: string[] = [];

    if (byType.write) {
      parts.push(`${byType.write} file(s) modified`);
    }
    if (byType.read) {
      parts.push(`${byType.read} file(s) read`);
    }
    if (byType.execute) {
      parts.push(`${byType.execute} command(s) executed`);
    }
    if (byType.search) {
      parts.push(`${byType.search} search(es)`);
    }

    let summary = parts.join(', ') || 'Various operations performed';

    if (files.size > 0 && files.size <= 5) {
      summary += `. Files: ${Array.from(files).join(', ')}`;
    } else if (files.size > 5) {
      summary += `. ${files.size} files touched.`;
    }

    return summary;
  }

  // ===== Private Methods =====

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private createSchema(): void {
    if (!this.db) return;

    this.db.run(`
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

    this.db.run(`
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
        FOREIGN KEY (session_id) REFERENCES sessions(session_id)
      )
    `);

    this.db.run('CREATE INDEX IF NOT EXISTS idx_obs_session ON observations(session_id)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_obs_project ON observations(project)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_obs_timestamp ON observations(timestamp)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project)');
  }

  private rowToSession(row: any): SessionRecord {
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

  private rowToObservation(row: any): Observation {
    return {
      id: row.id as string,
      sessionId: row.session_id as string,
      project: row.project as string,
      toolName: row.tool_name as string,
      toolInput: row.tool_input as string,
      toolResponse: row.tool_response as string,
      cwd: row.cwd as string,
      timestamp: row.timestamp as number,
      type: row.type as any,
      title: row.title as string | undefined,
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

export default MemoryHookService;
