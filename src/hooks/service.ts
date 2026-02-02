/**
 * Memory Hook Service
 *
 * Lightweight service for hooks to store/retrieve memory.
 * Direct SQLite access without HTTP worker.
 *
 * @module @agentkits/memory/hooks/service
 */

import { existsSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import type { Database as BetterDatabase } from 'better-sqlite3';
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

    // Truncate large responses
    const inputStr = JSON.stringify(toolInput || {});
    const responseStr = truncate(
      JSON.stringify(toolResponse || {}),
      this.config.maxResponseSize
    );

    this.db!.prepare(`
      INSERT INTO observations (id, session_id, project, tool_name, tool_input, tool_response, cwd, timestamp, type, title)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, sessionId, project, toolName, inputStr, responseStr, cwd, now, type, title);

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
    };
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
        FOREIGN KEY (session_id) REFERENCES sessions(session_id)
      )
    `);

    this.db.exec('CREATE INDEX IF NOT EXISTS idx_obs_session ON observations(session_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_obs_project ON observations(project)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_obs_timestamp ON observations(timestamp)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project)');
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
