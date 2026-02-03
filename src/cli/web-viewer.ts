#!/usr/bin/env node
/**
 * AgentKits Memory Web Viewer
 *
 * Web-based viewer for memory database with hybrid search support.
 * Uses ProjectMemoryService for vector + text search.
 *
 * Usage:
 *   npx agentkits-memory-web [--port=1905]
 *
 * @module @aitytech/agentkits-memory/cli/web-viewer
 */

import * as http from 'node:http';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import type { Database as BetterDatabase } from 'better-sqlite3';
import { HybridSearchEngine, LocalEmbeddingsService } from '../index.js';

const args = process.argv.slice(2);
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// Embeddings service singleton
let _embeddingsService: LocalEmbeddingsService | null = null;

function parseArgs(): Record<string, string | boolean> {
  const parsed: Record<string, string | boolean> = {};
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      parsed[key] = value ?? true;
    }
  }
  return parsed;
}

const options = parseArgs();
const PORT = parseInt(options.port as string, 10) || 1905;

const dbDir = path.join(projectDir, '.claude/memory');
const dbPath = path.join(dbDir, 'memory.db');

// Singleton database and search engine
let _searchEngine: HybridSearchEngine | null = null;
let _db: BetterDatabase | null = null;

/**
 * Get direct database access (memory.db)
 */
function getDatabase(): BetterDatabase {
  if (_db) return _db;
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');

  // Ensure all tables exist (web viewer may start before MCP server or hooks)
  _db.exec(`
    CREATE TABLE IF NOT EXISTS memory_entries (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'semantic',
      namespace TEXT DEFAULT 'default',
      tags TEXT DEFAULT '[]',
      metadata TEXT DEFAULT '{}',
      embedding BLOB,
      session_id TEXT,
      owner_id TEXT,
      access_level TEXT DEFAULT 'project',
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      expires_at INTEGER,
      version INTEGER DEFAULT 1,
      "references" TEXT DEFAULT '[]',
      access_count INTEGER DEFAULT 0,
      last_accessed_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );
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
    );
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
    );
    CREATE TABLE IF NOT EXISTS user_prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      prompt_number INTEGER NOT NULL,
      prompt_text TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      embedding BLOB,
      UNIQUE(session_id, prompt_number),
      FOREIGN KEY (session_id) REFERENCES sessions(session_id)
    );
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
    );
  `);

  // Task queue table (shared with hooks service — used for embed + enrich workers)
  _db.exec(`
    CREATE TABLE IF NOT EXISTS task_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_type TEXT NOT NULL,
      target_table TEXT NOT NULL,
      target_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      status TEXT DEFAULT 'pending'
    )
  `);

  // Migration: add embedding column to existing session tables
  for (const table of ['observations', 'user_prompts', 'session_summaries']) {
    try {
      const cols = _db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
      if (!cols.some(c => c.name === 'embedding')) {
        _db.exec(`ALTER TABLE ${table} ADD COLUMN embedding BLOB`);
      }
    } catch { /* ignore */ }
  }

  return _db;
}

/**
 * Get or initialize embeddings service
 */
async function getEmbeddingsService(): Promise<LocalEmbeddingsService> {
  if (_embeddingsService) return _embeddingsService;

  _embeddingsService = new LocalEmbeddingsService({
    cacheDir: path.join(dbDir, 'embeddings-cache'),
  });
  await _embeddingsService.initialize();
  return _embeddingsService;
}

/**
 * Get or initialize the HybridSearchEngine with embeddings
 */
async function getSearchEngine(): Promise<HybridSearchEngine> {
  if (_searchEngine) return _searchEngine;

  const db = getDatabase();
  const embeddings = await getEmbeddingsService();

  // Create embedding generator function
  const embeddingGenerator = async (text: string): Promise<Float32Array> => {
    const result = await embeddings.embed(text);
    return result.embedding;
  };

  _searchEngine = new HybridSearchEngine(db, {}, embeddingGenerator);
  await _searchEngine.initialize();
  return _searchEngine;
}

// ===== Session Hybrid Search =====

/**
 * Cosine similarity between two Float32Arrays
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Extract text to embed for a session table row
 */
function getSessionEmbeddingText(
  table: 'observations' | 'user_prompts' | 'session_summaries',
  row: Record<string, unknown>
): string {
  switch (table) {
    case 'observations': {
      const parts = [row.title, row.subtitle, row.narrative];
      try {
        const concepts = JSON.parse((row.concepts as string) || '[]');
        if (concepts.length > 0) parts.push(concepts.join(', '));
      } catch { /* ignore */ }
      return parts.filter(Boolean).join(' ').trim();
    }
    case 'user_prompts':
      return ((row.prompt_text as string) || '').trim();
    case 'session_summaries': {
      const parts = [row.request, row.completed, row.next_steps, row.notes];
      return parts.filter(Boolean).join(' ').trim();
    }
  }
}

interface SessionSearchResult {
  table: 'observations' | 'user_prompts' | 'session_summaries';
  id: string | number;
  sessionId: string;
  score: number;
  keywordScore: number;
  semanticScore: number;
  time: number;
  snippet: string;
  data: Record<string, unknown>;
}

/**
 * Hybrid search across all session tables (text + vector)
 */
async function searchSessionsHybrid(
  db: BetterDatabase,
  query: string,
  options: { type?: 'hybrid' | 'text' | 'vector'; limit?: number } = {}
): Promise<SessionSearchResult[]> {
  const { type = 'hybrid', limit = 30 } = options;
  const results = new Map<string, SessionSearchResult>();
  const queryLower = query.toLowerCase();

  // === Text search (LIKE) ===
  if (type === 'hybrid' || type === 'text') {
    const pattern = `%${query}%`;

    // Observations
    const obs = db.prepare(`
      SELECT * FROM observations
      WHERE title LIKE ? OR subtitle LIKE ? OR narrative LIKE ? OR tool_name LIKE ?
      ORDER BY timestamp DESC LIMIT ?
    `).all(pattern, pattern, pattern, pattern, limit) as Record<string, unknown>[];
    for (const row of obs) {
      const text = getSessionEmbeddingText('observations', row);
      const idx = text.toLowerCase().indexOf(queryLower);
      const kwScore = idx >= 0 ? Math.max(0.3, 1 - idx / 500) : 0.3;
      results.set(`obs_${row.id}`, {
        table: 'observations', id: row.id as string, sessionId: row.session_id as string,
        score: type === 'text' ? kwScore : kwScore * 0.3,
        keywordScore: kwScore, semanticScore: 0,
        time: row.timestamp as number,
        snippet: text.substring(0, 120),
        data: { ...row, embedding: undefined },
      });
    }

    // User prompts
    const prompts = db.prepare(`
      SELECT * FROM user_prompts WHERE prompt_text LIKE ?
      ORDER BY created_at DESC LIMIT ?
    `).all(pattern, limit) as Record<string, unknown>[];
    for (const row of prompts) {
      const text = (row.prompt_text as string) || '';
      const idx = text.toLowerCase().indexOf(queryLower);
      const kwScore = idx >= 0 ? Math.max(0.3, 1 - idx / 500) : 0.3;
      results.set(`prompt_${row.id}`, {
        table: 'user_prompts', id: row.id as number, sessionId: row.session_id as string,
        score: type === 'text' ? kwScore : kwScore * 0.3,
        keywordScore: kwScore, semanticScore: 0,
        time: row.created_at as number,
        snippet: text.substring(0, 120),
        data: { ...row, embedding: undefined },
      });
    }

    // Session summaries
    const summaries = db.prepare(`
      SELECT * FROM session_summaries
      WHERE request LIKE ? OR completed LIKE ? OR notes LIKE ? OR next_steps LIKE ?
      ORDER BY created_at DESC LIMIT ?
    `).all(pattern, pattern, pattern, pattern, limit) as Record<string, unknown>[];
    for (const row of summaries) {
      const text = getSessionEmbeddingText('session_summaries', row);
      const idx = text.toLowerCase().indexOf(queryLower);
      const kwScore = idx >= 0 ? Math.max(0.3, 1 - idx / 500) : 0.3;
      results.set(`summary_${row.id}`, {
        table: 'session_summaries', id: row.id as number, sessionId: row.session_id as string,
        score: type === 'text' ? kwScore : kwScore * 0.3,
        keywordScore: kwScore, semanticScore: 0,
        time: row.created_at as number,
        snippet: text.substring(0, 120),
        data: { ...row, embedding: undefined },
      });
    }
  }

  // === Vector search ===
  if ((type === 'hybrid' || type === 'vector') && query.trim()) {
    try {
      const embeddingsService = await getEmbeddingsService();
      const queryResult = await embeddingsService.embed(query);
      const queryEmbedding = queryResult.embedding;

      const tables: Array<{ name: 'observations' | 'user_prompts' | 'session_summaries'; idCol: string; timeCol: string }> = [
        { name: 'observations', idCol: 'id', timeCol: 'timestamp' },
        { name: 'user_prompts', idCol: 'id', timeCol: 'created_at' },
        { name: 'session_summaries', idCol: 'id', timeCol: 'created_at' },
      ];

      for (const { name, idCol, timeCol } of tables) {
        const rows = db.prepare(
          `SELECT * FROM ${name} WHERE embedding IS NOT NULL AND LENGTH(embedding) > 0 ORDER BY ${timeCol} DESC LIMIT 2000`
        ).all() as Record<string, unknown>[];

        for (const row of rows) {
          const embBuffer = row.embedding as Buffer;
          if (!embBuffer || embBuffer.length === 0) continue;
          const embedding = new Float32Array(
            embBuffer.buffer.slice(embBuffer.byteOffset, embBuffer.byteOffset + embBuffer.byteLength)
          );
          const sim = cosineSimilarity(queryEmbedding, embedding);
          if (sim < 0.1) continue;

          const prefix = name === 'observations' ? 'obs' : name === 'user_prompts' ? 'prompt' : 'summary';
          const key = `${prefix}_${row[idCol]}`;
          const existing = results.get(key);

          if (existing) {
            existing.semanticScore = sim;
            existing.score = existing.keywordScore * 0.3 + sim * 0.7;
          } else {
            const text = getSessionEmbeddingText(name, row);
            results.set(key, {
              table: name,
              id: row[idCol] as string | number,
              sessionId: row.session_id as string,
              score: type === 'vector' ? sim : sim * 0.7,
              keywordScore: 0, semanticScore: sim,
              time: row[timeCol] as number,
              snippet: text.substring(0, 120),
              data: { ...row, embedding: undefined },
            });
          }
        }
      }
    } catch {
      // Embeddings not available, fall back to text-only results
    }
  }

  return Array.from(results.values())
    .filter(r => r.score >= 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Get database statistics using direct SQL (faster for stats queries)
 */
function getStats(db: BetterDatabase): {
  total: number;
  byNamespace: Record<string, number>;
  byType: Record<string, number>;
  tokenEconomics: {
    totalTokens: number;
    avgTokensPerEntry: number;
    totalCharacters: number;
    estimatedSavings: number;
  };
} {
  const totalRow = db.prepare('SELECT COUNT(*) as count FROM memory_entries').get() as { count: number };
  const total = totalRow?.count || 0;

  const nsRows = db.prepare('SELECT namespace, COUNT(*) as count FROM memory_entries GROUP BY namespace').all() as { namespace: string; count: number }[];
  const byNamespace: Record<string, number> = {};
  for (const row of nsRows) {
    byNamespace[row.namespace] = row.count;
  }

  const typeRows = db.prepare('SELECT type, COUNT(*) as count FROM memory_entries GROUP BY type').all() as { type: string; count: number }[];
  const byType: Record<string, number> = {};
  for (const row of typeRows) {
    byType[row.type] = row.count;
  }

  // Calculate token economics
  const contentRow = db.prepare('SELECT SUM(LENGTH(content)) as total_chars, COUNT(*) as count FROM memory_entries').get() as { total_chars: number; count: number };
  const totalCharacters = contentRow?.total_chars || 0;
  const entryCount = contentRow?.count || 0;

  // Estimate tokens (~4 chars per token)
  const totalTokens = Math.ceil(totalCharacters / 4);
  const avgTokensPerEntry = entryCount > 0 ? Math.ceil(totalTokens / entryCount) : 0;

  // Estimated savings: if you had to rediscover this info each time
  // Assume 5x overhead for discovery vs recall
  const estimatedSavings = totalTokens * 5;

  return {
    total,
    byNamespace,
    byType,
    tokenEconomics: {
      totalTokens,
      avgTokensPerEntry,
      totalCharacters,
      estimatedSavings,
    },
  };
}

/**
 * Result type for getEntries with optional score and embedding info
 */
interface EntryResult {
  id: string;
  key: string;
  content: string;
  type: string;
  namespace: string;
  tags: string[];
  created_at: number;
  updated_at: number;
  score?: number;
  hasEmbedding?: boolean;
}

/**
 * Get entries with optional search (standard listing)
 */
function getEntries(
  db: BetterDatabase,
  namespace?: string,
  limit = 50,
  offset = 0,
  search?: string
): EntryResult[] {
  // Standard query without search
  if (!search || !search.trim()) {
    let query = 'SELECT id, key, content, type, namespace, tags, embedding, created_at, updated_at FROM memory_entries';
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (namespace) {
      conditions.push('namespace = ?');
      params.push(namespace);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = db.prepare(query).all(...params) as {
      id: string;
      key: string;
      content: string;
      type: string;
      namespace: string;
      tags: string;
      embedding: Buffer | null;
      created_at: number;
      updated_at: number;
    }[];

    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      content: row.content,
      type: row.type,
      namespace: row.namespace,
      tags: JSON.parse(row.tags || '[]'),
      created_at: row.created_at,
      updated_at: row.updated_at,
      hasEmbedding: !!(row.embedding && row.embedding.length > 0),
    }));
  }

  // Use FTS5 search for better CJK support
  const sanitizedSearch = search.trim().replace(/"/g, '""');
  let ftsQuery = `
    SELECT m.id, m.key, m.content, m.type, m.namespace, m.tags, m.embedding, m.created_at, m.updated_at
    FROM memory_entries m
    INNER JOIN memory_fts f ON m.id = f.id
    WHERE memory_fts MATCH '"${sanitizedSearch}"'
  `;

  if (namespace) {
    ftsQuery += ` AND m.namespace = ?`;
  }

  ftsQuery += ` ORDER BY m.created_at DESC LIMIT ? OFFSET ?`;

  try {
    const params = namespace ? [namespace, limit, offset] : [limit, offset];
    const rows = db.prepare(ftsQuery).all(...params) as {
      id: string;
      key: string;
      content: string;
      type: string;
      namespace: string;
      tags: string;
      embedding: Buffer | null;
      created_at: number;
      updated_at: number;
    }[];

    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      content: row.content,
      type: row.type,
      namespace: row.namespace,
      tags: JSON.parse(row.tags || '[]'),
      created_at: row.created_at,
      updated_at: row.updated_at,
      hasEmbedding: !!(row.embedding && row.embedding.length > 0),
    }));
  } catch {
    // Fallback to LIKE if FTS fails
    console.warn('[WebViewer] FTS search failed, falling back to LIKE');

    let query = 'SELECT id, key, content, type, namespace, tags, embedding, created_at, updated_at FROM memory_entries';
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (namespace) {
      conditions.push('namespace = ?');
      params.push(namespace);
    }

    conditions.push('(content LIKE ? OR key LIKE ? OR tags LIKE ?)');
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern);

    query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = db.prepare(query).all(...params) as {
      id: string;
      key: string;
      content: string;
      type: string;
      namespace: string;
      tags: string;
      embedding: Buffer | null;
      created_at: number;
      updated_at: number;
    }[];

    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      content: row.content,
      type: row.type,
      namespace: row.namespace,
      tags: JSON.parse(row.tags || '[]'),
      created_at: row.created_at,
      updated_at: row.updated_at,
      hasEmbedding: !!(row.embedding && row.embedding.length > 0),
    }));
  }
}

/**
 * Search entries using HybridSearchEngine
 * Supports hybrid (text + vector), text-only, or vector-only search
 */
async function searchEntries(
  searchEngine: HybridSearchEngine,
  query: string,
  options: {
    type?: 'hybrid' | 'text' | 'vector';
    namespace?: string;
    limit?: number;
  } = {}
): Promise<EntryResult[]> {
  const { type = 'hybrid', namespace, limit = 20 } = options;

  // Use searchCompact for efficient search with scores
  const results = await searchEngine.searchCompact(query, {
    limit,
    namespace,
    includeKeyword: type === 'hybrid' || type === 'text',
    includeSemantic: type === 'hybrid' || type === 'vector',
  });

  // Fetch full entries for the results
  const db = getDatabase();
  const entries: EntryResult[] = [];

  for (const result of results) {
    const row = db.prepare(`
      SELECT id, key, content, type, namespace, tags, embedding, created_at, updated_at
      FROM memory_entries WHERE id = ?
    `).get(result.id) as {
      id: string;
      key: string;
      content: string;
      type: string;
      namespace: string;
      tags: string;
      embedding: Buffer | null;
      created_at: number;
      updated_at: number;
    } | undefined;

    if (row) {
      entries.push({
        id: row.id,
        key: row.key,
        content: row.content,
        type: row.type,
        namespace: row.namespace,
        tags: JSON.parse(row.tags || '[]'),
        created_at: row.created_at,
        updated_at: row.updated_at,
        score: result.score,
        hasEmbedding: !!(row.embedding && row.embedding.length > 0),
      });
    }
  }

  return entries;
}

function getHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgentKits Memory Viewer</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%233B82F6'/%3E%3Cstop offset='100%25' stop-color='%238B5CF6'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='12' cy='12' r='10' fill='url(%23g)'/%3E%3Cpath d='M10 14.17l-3.17-3.17-1.42 1.41L10 17l8-8-1.41-1.41z' fill='white'/%3E%3C/svg%3E">
  <style>
    :root {
      --bg-primary: #0F172A;
      --bg-secondary: #1E293B;
      --bg-card: #334155;
      --text-primary: #F8FAFC;
      --text-secondary: #94A3B8;
      --text-muted: #64748B;
      --border: #475569;
      --accent: #3B82F6;
      --accent-hover: #2563EB;
      --success: #22C55E;
      --warning: #F59E0B;
      --error: #EF4444;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      line-height: 1.5;
    }

    .container { max-width: 1400px; margin: 0 auto; padding: 24px; }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
      gap: 16px;
    }

    .logo { display: flex; align-items: center; gap: 12px; }

    .logo-icon {
      width: 40px; height: 40px;
      background: linear-gradient(135deg, var(--accent), #8B5CF6);
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
    }

    .logo-icon svg { width: 24px; height: 24px; fill: white; }
    h1 { font-size: 24px; font-weight: 600; }
    .subtitle { font-size: 14px; color: var(--text-secondary); }

    .header-actions { display: flex; gap: 12px; }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }

    .stat-card {
      background: var(--bg-secondary);
      border-radius: 12px;
      padding: 20px;
      border: 1px solid var(--border);
    }

    .stat-label {
      font-size: 13px;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .stat-value { font-size: 32px; font-weight: 700; color: var(--text-primary); }

    .controls { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }

    .search-box { flex: 1; min-width: 250px; position: relative; }

    .search-box input {
      width: 100%;
      padding: 12px 16px 12px 44px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 14px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .search-box input:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
    }

    .search-box input::placeholder { color: var(--text-muted); }

    .search-box svg {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      width: 18px; height: 18px;
      fill: var(--text-muted);
    }

    .search-type-select {
      padding: 12px 16px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 14px;
      cursor: pointer;
      min-width: 180px;
      transition: border-color 0.2s;
    }

    .search-type-select:focus {
      outline: none;
      border-color: var(--accent);
    }

    .search-type-select:hover { border-color: var(--accent); }

    .score-badge {
      font-size: 11px;
      padding: 3px 8px;
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(139, 92, 246, 0.2));
      color: var(--accent);
      border-radius: 4px;
      font-weight: 600;
      white-space: nowrap;
    }

    .vector-badge {
      display: inline-flex;
      align-items: center;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .vector-badge.has-vector {
      background: rgba(34, 197, 94, 0.15);
      color: #22C55E;
    }

    .vector-badge.no-vector {
      background: rgba(100, 116, 139, 0.1);
      color: var(--text-muted);
    }

    .embedding-stats {
      display: flex;
      gap: 16px;
      margin-bottom: 20px;
      padding: 16px;
      background: var(--bg-card);
      border-radius: 8px;
    }

    .embedding-stat {
      text-align: center;
      flex: 1;
    }

    .embedding-stat-value {
      font-size: 24px;
      font-weight: 700;
      color: var(--text-primary);
    }

    .embedding-stat-label {
      font-size: 12px;
      color: var(--text-muted);
      text-transform: uppercase;
    }

    .embedding-stat-value.success { color: var(--success); }
    .embedding-stat-value.warning { color: var(--warning); }

    .progress-bar {
      height: 8px;
      background: var(--bg-card);
      border-radius: 4px;
      overflow: hidden;
      margin: 16px 0;
    }

    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent), #8B5CF6);
      border-radius: 4px;
      transition: width 0.3s ease;
    }

    .progress-text {
      text-align: center;
      font-size: 14px;
      color: var(--text-secondary);
      margin-top: 8px;
    }

    .btn-icon {
      padding: 10px;
      min-width: auto;
    }

    .embedding-section {
      margin-top: 20px;
      padding: 16px;
      background: var(--bg-card);
      border-radius: 8px;
      border: 1px solid var(--border);
    }

    .embedding-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }

    .embedding-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      padding: 4px 10px;
      border-radius: 6px;
    }

    .embedding-status.has-embedding {
      background: rgba(34, 197, 94, 0.15);
      color: #22C55E;
    }

    .embedding-status.no-embedding {
      background: rgba(239, 68, 68, 0.15);
      color: #EF4444;
    }

    .embedding-status svg {
      width: 14px;
      height: 14px;
      fill: currentColor;
    }

    .embedding-dims {
      font-size: 12px;
      color: var(--text-muted);
    }

    .embedding-viz {
      display: flex;
      align-items: flex-end;
      gap: 2px;
      height: 40px;
      margin-top: 12px;
      padding: 8px;
      background: var(--bg-primary);
      border-radius: 6px;
      overflow: hidden;
    }

    .embedding-bar {
      flex: 1;
      min-width: 4px;
      border-radius: 2px 2px 0 0;
      transition: height 0.3s ease;
    }

    .embedding-bar.positive { background: linear-gradient(to top, #3B82F6, #60A5FA); }
    .embedding-bar.negative { background: linear-gradient(to top, #8B5CF6, #A78BFA); }

    .embedding-legend {
      display: flex;
      justify-content: space-between;
      margin-top: 8px;
      font-size: 11px;
      color: var(--text-muted);
    }

    .embedding-legend-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .legend-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .legend-dot.positive { background: #3B82F6; }
    .legend-dot.negative { background: #8B5CF6; }

    .entries-list { display: flex; flex-direction: column; gap: 12px; }

    .entry-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      cursor: pointer;
      transition: border-color 0.2s, transform 0.2s;
      position: relative;
    }

    .entry-card:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
    }

    .entry-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
      gap: 12px;
    }

    .entry-key { font-weight: 600; font-size: 15px; color: var(--text-primary); word-break: break-word; flex: 1; }

    .entry-badges {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .entry-namespace {
      font-size: 12px;
      padding: 4px 10px;
      background: var(--bg-card);
      border-radius: 6px;
      color: var(--text-secondary);
      white-space: nowrap;
    }

    .entry-content {
      font-size: 14px;
      color: var(--text-secondary);
      line-height: 1.6;
      margin-bottom: 12px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .entry-content.truncated {
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .entry-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }

    .entry-tags { display: flex; gap: 6px; flex-wrap: wrap; }

    .tag {
      font-size: 11px;
      padding: 3px 8px;
      background: rgba(59, 130, 246, 0.2);
      color: var(--accent);
      border-radius: 4px;
    }

    .entry-date { font-size: 12px; color: var(--text-muted); }

    .empty-state { text-align: center; padding: 60px 20px; color: var(--text-secondary); }
    .empty-state svg { width: 64px; height: 64px; fill: var(--text-muted); margin-bottom: 16px; }
    .empty-state h3 { font-size: 18px; margin-bottom: 8px; color: var(--text-primary); }

    .loading { display: flex; justify-content: center; padding: 40px; }

    .spinner {
      width: 32px; height: 32px;
      border: 3px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .namespace-pills { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 24px; }

    .namespace-pill {
      padding: 8px 16px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 20px;
      font-size: 13px;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.2s;
    }

    .namespace-pill:hover { border-color: var(--accent); color: var(--text-primary); }
    .namespace-pill.active { background: var(--accent); border-color: var(--accent); color: white; }
    .namespace-pill .count { margin-left: 6px; font-size: 11px; opacity: 0.7; }

    .modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 100;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .modal-overlay.active { display: flex; }

    .modal {
      background: var(--bg-secondary);
      border-radius: 16px;
      max-width: 700px;
      width: 100%;
      max-height: 90vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px;
      border-bottom: 1px solid var(--border);
    }

    .modal-title { font-size: 18px; font-weight: 600; }

    .modal-close {
      background: none;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      padding: 8px;
      border-radius: 6px;
      transition: background 0.2s;
    }

    .modal-close:hover { background: var(--bg-card); }
    .modal-close svg { width: 20px; height: 20px; fill: currentColor; }

    .modal-body { padding: 24px; overflow-y: auto; }

    .detail-row { margin-bottom: 20px; }

    .detail-label {
      font-size: 12px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }

    .detail-value {
      font-size: 14px;
      color: var(--text-primary);
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.6;
    }

    .detail-value.content {
      background: var(--bg-card);
      padding: 16px;
      border-radius: 8px;
      max-height: 200px;
      overflow-y: auto;
    }

    .pagination { display: flex; justify-content: center; gap: 8px; margin-top: 24px; }

    .btn {
      padding: 10px 18px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-primary);
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .btn:hover:not(:disabled) { border-color: var(--accent); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .btn-primary { background: var(--accent); border-color: var(--accent); color: white; }
    .btn-primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }

    .btn-danger { background: var(--error); border-color: var(--error); color: white; }
    .btn-danger:hover { background: #DC2626; border-color: #DC2626; }

    .btn-success { background: var(--success); border-color: var(--success); color: white; }
    .btn-success:hover { background: #16A34A; border-color: #16A34A; }

    .btn svg { width: 16px; height: 16px; fill: currentColor; }

    .form-group { margin-bottom: 20px; }

    .form-group label {
      display: block;
      font-size: 13px;
      color: var(--text-secondary);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .form-group input,
    .form-group textarea,
    .form-group select {
      width: 100%;
      padding: 12px 16px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 14px;
      font-family: inherit;
      transition: border-color 0.2s;
    }

    .form-group input:focus,
    .form-group textarea:focus,
    .form-group select:focus {
      outline: none;
      border-color: var(--accent);
    }

    .form-group textarea { min-height: 120px; resize: vertical; }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 16px 24px;
      border-top: 1px solid var(--border);
    }

    .detail-actions {
      display: flex;
      gap: 12px;
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
    }

    .toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 16px 24px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 14px;
      z-index: 200;
      animation: slideIn 0.3s ease;
    }

    .toast.success { border-color: var(--success); background: rgba(34, 197, 94, 0.1); }
    .toast.error { border-color: var(--error); background: rgba(239, 68, 68, 0.1); }

    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    @media (max-width: 768px) {
      .container { padding: 16px; }
      header { flex-direction: column; align-items: flex-start; }
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
      .controls { flex-direction: column; }
      .search-box { min-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">
        <div class="logo-icon">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
        </div>
        <div>
          <h1>Memory Viewer</h1>
          <p class="subtitle">AgentKits Memory Database</p>
        </div>
      </div>
      <div class="header-actions" id="header-actions-memories">
        <button class="btn btn-primary" onclick="openAddModal()">
          <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          Add Memory
        </button>
        <button class="btn" onclick="openEmbeddingModal()">
          <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          Embeddings
        </button>
        <button class="btn" onclick="loadData()">
          <svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
          Refresh
        </button>
      </div>
      <div class="header-actions" id="header-actions-sessions" style="display:none;">
        <button class="btn" onclick="generateSessionEmbeddings('missing')">
          <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          Generate Embeddings
        </button>
        <button class="btn" onclick="loadSessions()">
          <svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
          Refresh
        </button>
      </div>
    </header>

    <!-- Tab Navigation -->
    <div class="tab-nav" style="display:flex;gap:4px;margin-bottom:24px;border-bottom:1px solid var(--border);padding-bottom:0;">
      <button class="tab-btn active" onclick="switchTab('memories')" id="tab-memories"
        style="padding:10px 20px;background:none;border:none;color:var(--text-primary);cursor:pointer;border-bottom:2px solid var(--accent);font-size:14px;font-weight:500;">
        Memories
      </button>
      <button class="tab-btn" onclick="switchTab('sessions')" id="tab-sessions"
        style="padding:10px 20px;background:none;border:none;color:var(--text-secondary);cursor:pointer;border-bottom:2px solid transparent;font-size:14px;font-weight:500;">
        Sessions
      </button>
    </div>

    <!-- Memories Tab -->
    <div id="memories-tab">
    <div id="stats-container" class="stats-grid"></div>
    <div id="namespace-pills" class="namespace-pills"></div>

    <div class="controls">
      <div class="search-box">
        <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
        <input type="text" id="search-input" placeholder="Search memories..." oninput="debounceSearch()">
      </div>
      <select id="search-type" class="search-type-select" onchange="debounceSearch()">
        <option value="hybrid">Hybrid (Text + Semantic)</option>
        <option value="text">Text Only (FTS5)</option>
        <option value="vector">Semantic Only (Vector)</option>
      </select>
    </div>

    <div id="entries-container" class="entries-list">
      <div class="loading"><div class="spinner"></div></div>
    </div>

    <div id="pagination" class="pagination"></div>
    </div><!-- /memories-tab -->

    <!-- Sessions Tab -->
    <div id="sessions-tab" style="display:none;">
      <div class="stats-grid" id="sessions-stats"></div>
      <div class="controls">
        <div class="search-box">
          <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input type="text" id="session-search-input" placeholder="Search sessions, prompts, observations..." oninput="debounceSessionSearch()">
        </div>
        <select id="session-search-type" class="search-type-select" onchange="debounceSessionSearch()">
          <option value="hybrid">Hybrid (Text + Semantic)</option>
          <option value="text">Text Only</option>
          <option value="vector">Semantic Only (Vector)</option>
        </select>
      </div>
      <div id="session-embedding-bar" style="display:flex;align-items:center;gap:16px;margin-bottom:16px;padding:10px 16px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;font-size:13px;">
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:var(--accent);flex-shrink:0;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        <span id="session-emb-stats" style="color:var(--text-secondary);flex:1;">Vector index: loading...</span>
      </div>
      <div id="sessions-feed" class="entries-list">
        <div style="text-align:center;color:var(--text-secondary);padding:40px;">Loading sessions...</div>
      </div>
      <div id="session-pagination" class="pagination"></div>
    </div>
  </div>

  <!-- Detail Modal -->
  <div id="detail-modal" class="modal-overlay" onclick="closeDetailModal(event)">
    <div class="modal" onclick="event.stopPropagation()">
      <div class="modal-header">
        <span class="modal-title">Memory Details</span>
        <button class="modal-close" onclick="closeDetailModal()">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
      <div class="modal-body" id="detail-body"></div>
    </div>
  </div>

  <!-- Add/Edit Modal -->
  <div id="form-modal" class="modal-overlay" onclick="closeFormModal(event)">
    <div class="modal" onclick="event.stopPropagation()">
      <div class="modal-header">
        <span class="modal-title" id="form-title">Add Memory</span>
        <button class="modal-close" onclick="closeFormModal()">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="form-id">
        <div class="form-group">
          <label for="form-key">Key</label>
          <input type="text" id="form-key" placeholder="e.g., auth-pattern, api-design">
        </div>
        <div class="form-group">
          <label for="form-namespace">Namespace</label>
          <select id="form-namespace">
            <option value="patterns">patterns</option>
            <option value="decisions">decisions</option>
            <option value="errors">errors</option>
            <option value="context">context</option>
            <option value="active-context">active-context</option>
            <option value="session-state">session-state</option>
            <option value="progress">progress</option>
            <option value="general">general</option>
          </select>
        </div>
        <div class="form-group">
          <label for="form-type">Type</label>
          <select id="form-type">
            <option value="semantic">semantic</option>
            <option value="episodic">episodic</option>
            <option value="procedural">procedural</option>
          </select>
        </div>
        <div class="form-group">
          <label for="form-content">Content</label>
          <textarea id="form-content" placeholder="Enter the memory content..."></textarea>
        </div>
        <div class="form-group">
          <label for="form-tags">Tags (comma-separated)</label>
          <input type="text" id="form-tags" placeholder="e.g., auth, security, api">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="closeFormModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveEntry()">Save</button>
      </div>
    </div>
  </div>

  <!-- Delete Confirmation Modal -->
  <div id="delete-modal" class="modal-overlay" onclick="closeDeleteModal(event)">
    <div class="modal" style="max-width: 400px;" onclick="event.stopPropagation()">
      <div class="modal-header">
        <span class="modal-title">Delete Memory</span>
        <button class="modal-close" onclick="closeDeleteModal()">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <p>Are you sure you want to delete this memory? This action cannot be undone.</p>
        <input type="hidden" id="delete-id">
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="closeDeleteModal()">Cancel</button>
        <button class="btn btn-danger" onclick="confirmDelete()">Delete</button>
      </div>
    </div>
  </div>

  <!-- Embedding Management Modal -->
  <div id="embedding-modal" class="modal-overlay" onclick="closeEmbeddingModal(event)">
    <div class="modal" style="max-width: 500px;" onclick="event.stopPropagation()">
      <div class="modal-header">
        <span class="modal-title">Manage Embeddings</span>
        <button class="modal-close" onclick="closeEmbeddingModal()">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
      <div class="modal-body" id="embedding-modal-body">
        <div class="embedding-stats" id="embedding-stats">
          <div class="embedding-stat">
            <div class="embedding-stat-value" id="stat-total">-</div>
            <div class="embedding-stat-label">Total</div>
          </div>
          <div class="embedding-stat">
            <div class="embedding-stat-value success" id="stat-with">-</div>
            <div class="embedding-stat-label">With Embedding</div>
          </div>
          <div class="embedding-stat">
            <div class="embedding-stat-value warning" id="stat-without">-</div>
            <div class="embedding-stat-label">Without</div>
          </div>
        </div>
        <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 12px;">
          Vector embeddings enable semantic search - finding memories by meaning, not just keywords.
        </p>
        <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 20px; padding: 10px; background: var(--bg-card); border-radius: 6px;">
          <strong>Model:</strong> multilingual-e5-small (100+ languages, optimized for retrieval)
        </p>
        <div id="embedding-progress" style="display: none;">
          <div class="progress-bar">
            <div class="progress-bar-fill" id="progress-fill" style="width: 0%"></div>
          </div>
          <div class="progress-text" id="progress-text">Processing...</div>
        </div>
      </div>
      <div class="modal-footer" id="embedding-modal-footer">
        <button class="btn" onclick="closeEmbeddingModal()">Close</button>
        <button class="btn btn-primary" id="btn-generate-missing" onclick="generateEmbeddings('missing')">
          <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          Generate Missing
        </button>
        <button class="btn btn-success" id="btn-regenerate-all" onclick="generateEmbeddings('all')">
          <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
          Re-generate All
        </button>
      </div>
    </div>
  </div>

  <script>
    let currentNamespace = '';
    let currentSearch = '';
    let currentPage = 0;
    const pageSize = 20;
    let stats = { total: 0, byNamespace: {}, byType: {} };
    let debounceTimer = null;

    async function loadData() {
      try {
        const statsRes = await fetch('/api/stats');
        stats = await statsRes.json();
        renderStats();
        renderNamespacePills();
        await loadEntries();
      } catch (error) {
        console.error('Failed to load data:', error);
        showToast('Failed to load data', 'error');
      }
    }

    function renderStats() {
      const container = document.getElementById('stats-container');
      container.innerHTML = \`
        <div class="stat-card">
          <div class="stat-label">Total Memories</div>
          <div class="stat-value">\${stats.total || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Namespaces</div>
          <div class="stat-value">\${Object.keys(stats.byNamespace || {}).length}</div>
        </div>
      \`;
    }

    function renderNamespacePills() {
      const container = document.getElementById('namespace-pills');
      const pills = ['<span class="namespace-pill' + (currentNamespace === '' ? ' active' : '') + '" onclick="filterNamespace(\\'\\')">All<span class="count">' + (stats.total || 0) + '</span></span>'];

      for (const [ns, count] of Object.entries(stats.byNamespace || {})) {
        pills.push(\`<span class="namespace-pill\${currentNamespace === ns ? ' active' : ''}" onclick="filterNamespace('\${ns}')">\${ns}<span class="count">\${count}</span></span>\`);
      }

      container.innerHTML = pills.join('');
    }

    async function loadEntries() {
      const container = document.getElementById('entries-container');
      container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

      try {
        let entries;

        if (currentSearch && currentSearch.trim()) {
          // Use hybrid search endpoint when searching
          const searchType = document.getElementById('search-type').value;
          const params = new URLSearchParams({
            q: currentSearch,
            type: searchType,
            limit: String(pageSize)
          });
          if (currentNamespace) params.set('namespace', currentNamespace);

          const res = await fetch('/api/search?' + params);
          entries = await res.json();
        } else {
          // Use standard entries endpoint for listing
          const params = new URLSearchParams({
            limit: String(pageSize),
            offset: String(currentPage * pageSize)
          });
          if (currentNamespace) params.set('namespace', currentNamespace);

          const res = await fetch('/api/entries?' + params);
          entries = await res.json();
        }

        if (!Array.isArray(entries) || entries.length === 0) {
          container.innerHTML = \`
            <div class="empty-state">
              <svg viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-1 12H5c-.55 0-1-.45-1-1v-1h16v1c0 .55-.45 1-1 1zm1-4H4V8h16v6z"/></svg>
              <h3>No memories found</h3>
              <p>Click "Add Memory" to create your first entry</p>
            </div>
          \`;
        } else {
          container.innerHTML = entries.map(entry => \`
            <div class="entry-card" onclick="showDetail('\${entry.id}')">
              <div class="entry-header">
                <span class="entry-key">\${escapeHtml(entry.key)}</span>
                <div class="entry-badges">
                  \${entry.score !== undefined ? \`<span class="score-badge">\${(entry.score * 100).toFixed(1)}%</span>\` : ''}
                  \${entry.hasEmbedding ?
                    \`<span class="vector-badge has-vector" title="Vector embedding enabled">Vec</span>\` :
                    \`<span class="vector-badge no-vector" title="No vector embedding">--</span>\`
                  }
                  <span class="entry-namespace">\${entry.namespace}</span>
                </div>
              </div>
              <div class="entry-content truncated">\${escapeHtml(entry.content)}</div>
              <div class="entry-footer">
                <div class="entry-tags">
                  \${(entry.tags || []).map(tag => \`<span class="tag">\${escapeHtml(tag)}</span>\`).join('')}
                </div>
                <span class="entry-date">\${formatDate(entry.created_at)}</span>
              </div>
            </div>
          \`).join('');
        }

        renderPagination(entries.length);
      } catch (error) {
        container.innerHTML = '<div class="empty-state"><h3>No memories yet</h3><p>Click "Add Memory" to get started</p></div>';
      }
    }

    function renderPagination(currentCount) {
      const container = document.getElementById('pagination');
      const hasMore = currentCount === pageSize;
      const hasPrev = currentPage > 0;

      container.innerHTML = \`
        <button class="btn" \${!hasPrev ? 'disabled' : ''} onclick="prevPage()">Previous</button>
        <button class="btn" \${!hasMore ? 'disabled' : ''} onclick="nextPage()">Next</button>
      \`;
    }

    function filterNamespace(ns) {
      currentNamespace = ns;
      currentPage = 0;
      renderNamespacePills();
      loadEntries();
    }

    function debounceSearch() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        currentSearch = document.getElementById('search-input').value;
        currentPage = 0;
        loadEntries();
      }, 300);
    }

    function prevPage() { if (currentPage > 0) { currentPage--; loadEntries(); } }
    function nextPage() { currentPage++; loadEntries(); }

    function renderEmbeddingViz(embedding) {
      if (!embedding || !embedding.hasEmbedding) {
        return \`
          <div class="embedding-section">
            <div class="embedding-header">
              <span class="embedding-status no-embedding">
                <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                No Embedding
              </span>
            </div>
            <p style="font-size: 12px; color: var(--text-muted); margin: 0;">
              This entry doesn't have a vector embedding. Edit and save to generate one.
            </p>
          </div>
        \`;
      }

      const preview = embedding.preview || [];
      const maxVal = Math.max(...preview.map(Math.abs), 0.001);

      const bars = preview.map(val => {
        const height = Math.abs(val) / maxVal * 100;
        const isPositive = val >= 0;
        return \`<div class="embedding-bar \${isPositive ? 'positive' : 'negative'}" style="height: \${height}%" title="\${val.toFixed(4)}"></div>\`;
      }).join('');

      return \`
        <div class="embedding-section">
          <div class="embedding-header">
            <span class="embedding-status has-embedding">
              <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
              Vector Enabled
            </span>
            <span class="embedding-dims">\${embedding.dimensions}D</span>
          </div>
          <div class="embedding-viz">
            \${bars}
          </div>
          <div class="embedding-legend">
            <div class="embedding-legend-item">
              <span class="legend-dot positive"></span>
              Positive values
            </div>
            <div class="embedding-legend-item">
              <span class="legend-dot negative"></span>
              Negative values
            </div>
            <span>First 20 dimensions</span>
          </div>
        </div>
      \`;
    }

    async function showDetail(id) {
      try {
        const res = await fetch('/api/entry/' + id);
        const entry = await res.json();

        document.getElementById('detail-body').innerHTML = \`
          <div class="detail-row">
            <div class="detail-label">Key</div>
            <div class="detail-value">\${escapeHtml(entry.key)}</div>
          </div>
          <div class="detail-row">
            <div class="detail-label">Namespace</div>
            <div class="detail-value">\${entry.namespace}</div>
          </div>
          <div class="detail-row">
            <div class="detail-label">Type</div>
            <div class="detail-value">\${entry.type}</div>
          </div>
          <div class="detail-row">
            <div class="detail-label">Content</div>
            <div class="detail-value content">\${escapeHtml(entry.content)}</div>
          </div>
          <div class="detail-row">
            <div class="detail-label">Tags</div>
            <div class="detail-value">\${(entry.tags || []).join(', ') || 'None'}</div>
          </div>
          <div class="detail-row">
            <div class="detail-label">Created</div>
            <div class="detail-value">\${new Date(entry.created_at).toLocaleString()}</div>
          </div>
          \${renderEmbeddingViz(entry.embedding)}
          <div class="detail-actions">
            <button class="btn btn-primary" onclick="openEditModal('\${entry.id}')">
              <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
              Edit
            </button>
            <button class="btn btn-danger" onclick="openDeleteModal('\${entry.id}')">
              <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              Delete
            </button>
          </div>
        \`;

        document.getElementById('detail-modal').classList.add('active');
      } catch (error) {
        showToast('Failed to load entry', 'error');
      }
    }

    function closeDetailModal(event) {
      if (!event || event.target.id === 'detail-modal') {
        document.getElementById('detail-modal').classList.remove('active');
      }
    }

    function openAddModal() {
      document.getElementById('form-title').textContent = 'Add Memory';
      document.getElementById('form-id').value = '';
      document.getElementById('form-key').value = '';
      document.getElementById('form-namespace').value = 'patterns';
      document.getElementById('form-type').value = 'semantic';
      document.getElementById('form-content').value = '';
      document.getElementById('form-tags').value = '';
      document.getElementById('form-modal').classList.add('active');
    }

    async function openEditModal(id) {
      closeDetailModal();
      const res = await fetch('/api/entry/' + id);
      const entry = await res.json();

      document.getElementById('form-title').textContent = 'Edit Memory';
      document.getElementById('form-id').value = entry.id;
      document.getElementById('form-key').value = entry.key;
      document.getElementById('form-namespace').value = entry.namespace;
      document.getElementById('form-type').value = entry.type;
      document.getElementById('form-content').value = entry.content;
      document.getElementById('form-tags').value = (entry.tags || []).join(', ');
      document.getElementById('form-modal').classList.add('active');
    }

    function closeFormModal(event) {
      if (!event || event.target.id === 'form-modal') {
        document.getElementById('form-modal').classList.remove('active');
      }
    }

    async function saveEntry() {
      const id = document.getElementById('form-id').value;
      const data = {
        key: document.getElementById('form-key').value.trim(),
        namespace: document.getElementById('form-namespace').value,
        type: document.getElementById('form-type').value,
        content: document.getElementById('form-content').value.trim(),
        tags: document.getElementById('form-tags').value.split(',').map(t => t.trim()).filter(Boolean),
      };

      if (!data.key || !data.content) {
        showToast('Key and Content are required', 'error');
        return;
      }

      try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? '/api/entry/' + id : '/api/entries';
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (res.ok) {
          closeFormModal();
          showToast(id ? 'Memory updated' : 'Memory created', 'success');
          loadData();
        } else {
          const err = await res.json();
          showToast(err.error || 'Failed to save', 'error');
        }
      } catch (error) {
        showToast('Failed to save', 'error');
      }
    }

    function openDeleteModal(id) {
      closeDetailModal();
      document.getElementById('delete-id').value = id;
      document.getElementById('delete-modal').classList.add('active');
    }

    function closeDeleteModal(event) {
      if (!event || event.target.id === 'delete-modal') {
        document.getElementById('delete-modal').classList.remove('active');
      }
    }

    async function confirmDelete() {
      const id = document.getElementById('delete-id').value;
      try {
        const res = await fetch('/api/entry/' + id, { method: 'DELETE' });
        if (res.ok) {
          closeDeleteModal();
          showToast('Memory deleted', 'success');
          loadData();
        } else {
          showToast('Failed to delete', 'error');
        }
      } catch (error) {
        showToast('Failed to delete', 'error');
      }
    }

    async function openEmbeddingModal() {
      document.getElementById('embedding-modal').classList.add('active');
      document.getElementById('embedding-progress').style.display = 'none';
      document.getElementById('embedding-modal-footer').style.display = 'flex';

      // Load embedding stats
      try {
        const res = await fetch('/api/embeddings/stats');
        const embeddingStats = await res.json();
        document.getElementById('stat-total').textContent = embeddingStats.total;
        document.getElementById('stat-with').textContent = embeddingStats.withEmbedding;
        document.getElementById('stat-without').textContent = embeddingStats.withoutEmbedding;

        // Disable buttons if nothing to do
        document.getElementById('btn-generate-missing').disabled = embeddingStats.withoutEmbedding === 0;
        document.getElementById('btn-regenerate-all').disabled = embeddingStats.total === 0;
      } catch (error) {
        console.error('Failed to load embedding stats:', error);
      }
    }

    function closeEmbeddingModal(event) {
      if (!event || event.target.id === 'embedding-modal') {
        document.getElementById('embedding-modal').classList.remove('active');
      }
    }

    async function generateEmbeddings(mode) {
      const progressEl = document.getElementById('embedding-progress');
      const progressFill = document.getElementById('progress-fill');
      const progressText = document.getElementById('progress-text');
      const footerEl = document.getElementById('embedding-modal-footer');

      // Show progress, hide buttons
      progressEl.style.display = 'block';
      footerEl.style.display = 'none';
      progressFill.style.width = '0%';
      progressText.textContent = mode === 'missing' ? 'Generating missing embeddings...' : 'Re-generating all embeddings...';

      // Animate progress bar while waiting
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 10;
        if (progress > 90) progress = 90;
        progressFill.style.width = progress + '%';
      }, 200);

      try {
        const res = await fetch('/api/embeddings/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        });

        clearInterval(interval);
        progressFill.style.width = '100%';

        const result = await res.json();
        progressText.textContent = result.message || 'Done!';

        setTimeout(() => {
          showToast(result.message || 'Embeddings generated', 'success');
          closeEmbeddingModal();
          loadData();
        }, 1000);
      } catch (error) {
        clearInterval(interval);
        progressFill.style.width = '0%';
        progressText.textContent = 'Failed to generate embeddings';
        showToast('Failed to generate embeddings', 'error');

        // Re-show buttons after error
        setTimeout(() => {
          progressEl.style.display = 'none';
          footerEl.style.display = 'flex';
        }, 2000);
      }
    }

    function showToast(message, type = 'success') {
      const toast = document.createElement('div');
      toast.className = 'toast ' + type;
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    }

    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function formatDate(timestamp) {
      if (!timestamp) return 'Unknown';
      const date = new Date(timestamp);
      const now = new Date();
      const diff = now - date;

      if (diff < 60000) return 'Just now';
      if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
      if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
      if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';

      return date.toLocaleDateString();
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeDetailModal();
        closeFormModal();
        closeDeleteModal();
        closeEmbeddingModal();
      }
    });

    // Tab switching
    function switchTab(tab) {
      document.getElementById('memories-tab').style.display = tab === 'memories' ? '' : 'none';
      document.getElementById('sessions-tab').style.display = tab === 'sessions' ? '' : 'none';
      document.getElementById('header-actions-memories').style.display = tab === 'memories' ? '' : 'none';
      document.getElementById('header-actions-sessions').style.display = tab === 'sessions' ? '' : 'none';

      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.style.borderBottomColor = 'transparent';
        btn.style.color = 'var(--text-secondary)';
      });
      const activeBtn = document.getElementById('tab-' + tab);
      activeBtn.style.borderBottomColor = 'var(--accent)';
      activeBtn.style.color = 'var(--text-primary)';

      if (tab === 'sessions') loadSessions();
    }

    // Sessions search
    let sessionSearchQuery = '';
    let sessionSearchTimer = null;
    function debounceSessionSearch() {
      clearTimeout(sessionSearchTimer);
      sessionSearchTimer = setTimeout(() => {
        sessionSearchQuery = document.getElementById('session-search-input').value.trim();
        loadSessions();
      }, 300);
    }

    // Session embedding management
    async function loadSessionEmbeddingStats() {
      try {
        const res = await fetch('/api/sessions/embeddings/stats');
        const stats = await res.json();
        const el = document.getElementById('session-emb-stats');
        let totalAll = 0, totalWithEmb = 0;
        const parts = [];
        for (const [table, s] of Object.entries(stats)) {
          const label = table === 'observations' ? 'Obs' : table === 'user_prompts' ? 'Prompts' : 'Summaries';
          totalAll += s.total;
          totalWithEmb += s.withEmbedding;
          const missing = s.total - s.withEmbedding;
          const badge = missing > 0
            ? '<span style="color:var(--warning);font-weight:500;">' + s.withEmbedding + '/' + s.total + '</span>'
            : '<span style="color:var(--success);">' + s.total + '</span>';
          parts.push(label + ': ' + badge);
        }
        const missingTotal = totalAll - totalWithEmb;
        const status = missingTotal > 0
          ? '<span style="color:var(--warning);">' + missingTotal + ' missing</span>'
          : '<span style="color:var(--success);">All indexed</span>';
        el.innerHTML = 'Vector index: ' + parts.join(' &middot; ') + ' &mdash; ' + status;
      } catch { /* ignore */ }
    }

    async function generateSessionEmbeddings(mode) {
      const el = document.getElementById('session-emb-stats');
      el.innerHTML = '<span style="color:var(--accent);">Generating embeddings...</span>';
      try {
        const res = await fetch('/api/sessions/embeddings/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: mode || 'missing' }),
        });
        const result = await res.json();
        if (typeof showToast === 'function') {
          showToast(result.success + ' embeddings generated', 'success');
        }
        loadSessionEmbeddingStats();
      } catch (err) {
        el.innerHTML = '<span style="color:var(--error);">Error: ' + err.message + '</span>';
      }
    }

    // Sessions feed with pagination
    const sessionPageSize = 30;
    let sessionPage = 0;

    function sessionPrevPage() { if (sessionPage > 0) { sessionPage--; loadSessions(); } }
    function sessionNextPage() { sessionPage++; loadSessions(); }

    async function loadSessions() {
      const feed = document.getElementById('sessions-feed');
      const statsEl = document.getElementById('sessions-stats');
      const paginationEl = document.getElementById('session-pagination');
      loadSessionEmbeddingStats();

      try {
        let items = [];
        let totalItems = 0;

        if (sessionSearchQuery) {
          // Use hybrid search endpoint (no pagination for search — returns ranked results)
          const searchType = document.getElementById('session-search-type').value;
          const params = new URLSearchParams({
            q: sessionSearchQuery,
            type: searchType,
            limit: String(sessionPageSize),
          });
          const res = await fetch('/api/sessions/search?' + params);
          const results = await res.json();

          statsEl.innerHTML = \`
            <div class="stat-card">
              <div class="stat-label">Search Results</div>
              <div class="stat-value">\${results.length}</div>
            </div>
          \`;

          // Map search results to timeline items (already have hasEmbedding from data)
          for (const r of results) {
            const d = r.data || {};
            const hasEmb = !!(d.hasEmbedding || (r.semanticScore && r.semanticScore > 0));
            if (r.table === 'observations') {
              items.push({
                type: 'observation', time: r.time, sessionId: r.sessionId, score: r.score, hasEmbedding: hasEmb,
                toolName: d.tool_name, title: d.title, obsType: d.type, promptNumber: d.prompt_number,
                subtitle: d.subtitle, narrative: d.narrative,
              });
            } else if (r.table === 'user_prompts') {
              items.push({
                type: 'prompt', time: r.time, sessionId: r.sessionId, score: r.score, hasEmbedding: hasEmb,
                promptNumber: d.prompt_number, text: d.prompt_text,
              });
            } else if (r.table === 'session_summaries') {
              items.push({
                type: 'summary', time: r.time, sessionId: r.sessionId, score: r.score, hasEmbedding: hasEmb,
                request: d.request, completed: d.completed, filesModified: d.files_modified,
                nextSteps: d.next_steps, notes: d.notes,
              });
            }
          }
          totalItems = results.length;
          paginationEl.innerHTML = '';
        } else {
          // Browse mode with pagination
          const offset = sessionPage * sessionPageSize;
          const [sessRes, obsRes] = await Promise.all([
            fetch('/api/sessions?limit=' + sessionPageSize + '&offset=' + offset),
            fetch('/api/observations?limit=' + sessionPageSize + '&offset=' + offset)
          ]);
          const data = await sessRes.json();
          const observations = await obsRes.json();

          statsEl.innerHTML = \`
            <div class="stat-card">
              <div class="stat-label">Sessions</div>
              <div class="stat-value">\${data.sessions?.length || 0}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">User Prompts</div>
              <div class="stat-value">\${data.prompts?.length || 0}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Summaries</div>
              <div class="stat-value">\${data.summaries?.length || 0}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Observations</div>
              <div class="stat-value">\${observations?.length || 0}</div>
            </div>
          \`;

          for (const p of (data.prompts || [])) {
            items.push({ type: 'prompt', time: p.created_at, sessionId: p.session_id,
              promptNumber: p.prompt_number, text: p.prompt_text, project: p.project,
              hasEmbedding: !!p.hasEmbedding });
          }
          for (const s of (data.summaries || [])) {
            items.push({ type: 'summary', time: s.created_at, sessionId: s.session_id,
              request: s.request, completed: s.completed, filesModified: s.files_modified,
              nextSteps: s.next_steps, notes: s.notes, project: s.project,
              hasEmbedding: !!s.hasEmbedding });
          }
          for (const o of observations) {
            items.push({ type: 'observation', time: o.timestamp, sessionId: o.session_id,
              toolName: o.tool_name, title: o.title, obsType: o.type, promptNumber: o.prompt_number,
              hasEmbedding: !!o.hasEmbedding });
          }
          totalItems = items.length;

          // Render pagination
          const hasMore = observations.length === sessionPageSize || (data.prompts || []).length === sessionPageSize;
          paginationEl.innerHTML = \`
            <button class="btn" \${sessionPage <= 0 ? 'disabled' : ''} onclick="sessionPrevPage()">Previous</button>
            <span style="color:var(--text-secondary);font-size:13px;">Page \${sessionPage + 1}</span>
            <button class="btn" \${!hasMore ? 'disabled' : ''} onclick="sessionNextPage()">Next</button>
          \`;
        }

        items.sort((a, b) => (b.time || 0) - (a.time || 0));

        if (items.length === 0) {
          feed.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:40px;">' +
            (sessionSearchQuery ? 'No results for "' + escapeHtml(sessionSearchQuery) + '"' : 'No session data yet. Hook data will appear here after sessions run.') + '</div>';
          return;
        }

        feed.innerHTML = items.map(item => {
          const time = new Date(item.time).toLocaleString();
          const sid = (item.sessionId || '').substring(0, 8);
          const scoreBadge = item.score !== undefined
            ? '<span class="score-badge">' + (item.score * 100).toFixed(0) + '%</span>'
            : '';
          const vecBadge = item.hasEmbedding
            ? '<span class="vector-badge has-vector" title="Vector indexed">Vec</span>'
            : '<span class="vector-badge no-vector" title="Not indexed">--</span>';

          if (item.type === 'prompt') {
            return \`<div class="entry-card" style="border-left:3px solid var(--accent);">
              <div class="entry-header">
                <span class="entry-type" style="background:#3B82F6;color:white;padding:2px 8px;border-radius:4px;font-size:11px;">PROMPT #\${item.promptNumber || '?'}</span>
                <div class="entry-badges">\${scoreBadge}\${vecBadge}<span class="entry-meta">\${time} · \${sid}</span></div>
              </div>
              <div class="entry-content" style="margin-top:8px;white-space:pre-wrap;overflow:hidden;">\${escapeHtml(truncate(item.text, 300))}</div>
            </div>\`;
          }

          if (item.type === 'summary') {
            let filesStr = '';
            try { filesStr = JSON.parse(item.filesModified || '[]').join(', '); } catch {}
            return \`<div class="entry-card" style="border-left:3px solid var(--success);">
              <div class="entry-header">
                <span class="entry-type" style="background:#22C55E;color:white;padding:2px 8px;border-radius:4px;font-size:11px;">SUMMARY</span>
                <div class="entry-badges">\${scoreBadge}\${vecBadge}<span class="entry-meta">\${time} · \${sid}</span></div>
              </div>
              <div style="margin-top:8px;">
                \${item.request ? '<div><strong>Request:</strong> ' + escapeHtml(truncate(item.request, 250)) + '</div>' : ''}
                \${item.completed ? '<div><strong>Completed:</strong> ' + escapeHtml(truncate(item.completed, 250)) + '</div>' : ''}
                \${filesStr ? '<div><strong>Files:</strong> ' + escapeHtml(truncate(filesStr, 200)) + '</div>' : ''}
                \${item.nextSteps ? '<div><strong>Next:</strong> ' + escapeHtml(truncate(item.nextSteps, 200)) + '</div>' : ''}
              </div>
            </div>\`;
          }

          // observation
          const icons = { read: '📖', write: '✏️', execute: '⚡', search: '🔍' };
          const icon = icons[item.obsType] || '•';
          const subtitle = item.subtitle ? ' - ' + escapeHtml(truncate(item.subtitle, 120)) : '';
          return \`<div class="entry-card" style="border-left:3px solid var(--border);padding:12px 16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">\${icon} <strong>\${escapeHtml(item.toolName || '')}</strong> \${escapeHtml(truncate(item.title, 100))}\${subtitle}\${scoreBadge}</span>
              <span style="color:var(--text-muted);font-size:12px;">\${vecBadge} \${time}\${item.promptNumber ? ' · P#' + item.promptNumber : ''}</span>
            </div>
          </div>\`;
        }).join('');

      } catch (err) {
        feed.innerHTML = '<div style="text-align:center;color:var(--error);padding:40px;">Error loading sessions: ' + err.message + '</div>';
      }
    }

    function truncate(text, max = 200) {
      if (!text || text.length <= max) return text || '';
      return text.substring(0, max) + '…';
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    loadData();
  </script>
</body>
</html>`;
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): void {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const method = req.method || 'GET';

  res.setHeader('Content-Type', 'application/json');

  try {
    const db = getDatabase();

    // Serve HTML
    if (url.pathname === '/' && method === 'GET') {
      res.setHeader('Content-Type', 'text/html');
      res.writeHead(200);
      res.end(getHTML());
      return;
    }

    // GET stats
    if (url.pathname === '/api/stats' && method === 'GET') {
      const stats = getStats(db);
      res.writeHead(200);
      res.end(JSON.stringify(stats));
      return;
    }

    // GET entries (standard listing with optional FTS search)
    if (url.pathname === '/api/entries' && method === 'GET') {
      const namespace = url.searchParams.get('namespace') || undefined;
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);
      const search = url.searchParams.get('search') || undefined;

      const entries = getEntries(db, namespace, limit, offset, search);
      res.writeHead(200);
      res.end(JSON.stringify(entries));
      return;
    }

    // GET hybrid search (new endpoint with vector support)
    if (url.pathname === '/api/search' && method === 'GET') {
      const query = url.searchParams.get('q') || '';
      const searchType = (url.searchParams.get('type') || 'hybrid') as 'hybrid' | 'text' | 'vector';
      const limit = parseInt(url.searchParams.get('limit') || '20', 10);
      const namespace = url.searchParams.get('namespace') || undefined;

      getSearchEngine()
        .then((searchEngine) => searchEntries(searchEngine, query, { type: searchType, namespace, limit }))
        .then((results) => {
          res.writeHead(200);
          res.end(JSON.stringify(results));
        })
        .catch((error) => {
          res.writeHead(500);
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Search failed' }));
        });
      return;
    }

    // POST create entry (direct DB for compatibility with existing schema)
    if (url.pathname === '/api/entries' && method === 'POST') {
      readBody(req)
        .then(async (body) => {
          const data = JSON.parse(body) as {
            key: string;
            content: string;
            type?: string;
            namespace?: string;
            tags?: string[];
          };

          const now = Date.now();
          const id = `mem_${now}_${Math.random().toString(36).slice(2, 10)}`;
          const tags = JSON.stringify(data.tags || []);

          // Generate embedding for the content
          let embeddingBuffer: Buffer | null = null;
          try {
            const embeddingsService = await getEmbeddingsService();
            const result = await embeddingsService.embed(data.content);
            embeddingBuffer = Buffer.from(result.embedding);
          } catch (e) {
            console.warn('[WebViewer] Failed to generate embedding:', e);
          }

          db.prepare(
            `INSERT INTO memory_entries (id, key, content, type, namespace, tags, embedding, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(id, data.key, data.content, data.type || 'semantic', data.namespace || 'general', tags, embeddingBuffer, now, now);

          res.writeHead(201);
          res.end(JSON.stringify({ id, success: true }));
        })
        .catch((error) => {
          res.writeHead(500);
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }));
        });
      return;
    }

    // GET single entry
    if (url.pathname.startsWith('/api/entry/') && method === 'GET') {
      const id = url.pathname.split('/').pop();
      const row = db.prepare('SELECT * FROM memory_entries WHERE id = ?').get(id) as {
        id: string;
        key: string;
        content: string;
        type: string;
        namespace: string;
        tags: string;
        embedding: Buffer | null;
        created_at: number;
        updated_at: number;
      } | undefined;

      if (row) {
        // Extract embedding info for visualization
        let embeddingInfo: { hasEmbedding: boolean; dimensions?: number; preview?: number[] } = {
          hasEmbedding: false,
        };

        if (row.embedding && row.embedding.length > 0) {
          const embedding = new Float32Array(
            row.embedding.buffer.slice(
              row.embedding.byteOffset,
              row.embedding.byteOffset + row.embedding.byteLength
            )
          );
          // Get first 20 values for preview visualization
          const preview = Array.from(embedding.slice(0, 20));
          embeddingInfo = {
            hasEmbedding: true,
            dimensions: embedding.length,
            preview,
          };
        }

        res.writeHead(200);
        res.end(JSON.stringify({
          id: row.id,
          key: row.key,
          content: row.content,
          type: row.type,
          namespace: row.namespace,
          tags: JSON.parse(row.tags || '[]'),
          created_at: row.created_at,
          updated_at: row.updated_at,
          embedding: embeddingInfo,
        }));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Entry not found' }));
      }
      return;
    }

    // PUT update entry (direct DB for full field updates)
    if (url.pathname.startsWith('/api/entry/') && method === 'PUT') {
      const id = url.pathname.split('/').pop();
      if (!id) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing entry ID' }));
        return;
      }

      readBody(req)
        .then(async (body) => {
          const data = JSON.parse(body) as {
            key: string;
            content: string;
            type: string;
            namespace: string;
            tags?: string[];
          };
          const now = Date.now();
          const tags = JSON.stringify(data.tags || []);

          // Generate embedding for the updated content
          let embeddingBuffer: Buffer | null = null;
          try {
            const embeddingsService = await getEmbeddingsService();
            const result = await embeddingsService.embed(data.content);
            embeddingBuffer = Buffer.from(result.embedding);
          } catch (e) {
            console.warn('[WebViewer] Failed to generate embedding:', e);
          }

          // Update with embedding
          const result = db.prepare(
            `UPDATE memory_entries SET key = ?, content = ?, type = ?, namespace = ?, tags = ?, embedding = ?, updated_at = ?
             WHERE id = ?`
          ).run(data.key, data.content, data.type, data.namespace, tags, embeddingBuffer, now, id);

          if (result.changes > 0) {
            res.writeHead(200);
            res.end(JSON.stringify({ success: true }));
          } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Entry not found' }));
          }
        })
        .catch((error) => {
          res.writeHead(500);
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }));
        });
      return;
    }

    // DELETE entry (direct DB for compatibility)
    if (url.pathname.startsWith('/api/entry/') && method === 'DELETE') {
      const id = url.pathname.split('/').pop();
      if (!id) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing entry ID' }));
        return;
      }

      const result = db.prepare('DELETE FROM memory_entries WHERE id = ?').run(id);
      if (result.changes > 0) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Entry not found' }));
      }
      return;
    }

    // GET embedding stats
    if (url.pathname === '/api/embeddings/stats' && method === 'GET') {
      const totalRow = db.prepare('SELECT COUNT(*) as count FROM memory_entries').get() as { count: number };
      const withEmbeddingRow = db.prepare('SELECT COUNT(*) as count FROM memory_entries WHERE embedding IS NOT NULL AND LENGTH(embedding) > 0').get() as { count: number };

      res.writeHead(200);
      res.end(JSON.stringify({
        total: totalRow?.count || 0,
        withEmbedding: withEmbeddingRow?.count || 0,
        withoutEmbedding: (totalRow?.count || 0) - (withEmbeddingRow?.count || 0),
      }));
      return;
    }

    // POST batch generate embeddings
    if (url.pathname === '/api/embeddings/generate' && method === 'POST') {
      readBody(req)
        .then(async (body) => {
          const options = JSON.parse(body || '{}') as { mode?: 'missing' | 'all' };
          const mode = options.mode || 'missing';

          // Get entries to process
          const query = mode === 'missing'
            ? 'SELECT id, content FROM memory_entries WHERE embedding IS NULL OR LENGTH(embedding) = 0'
            : 'SELECT id, content FROM memory_entries';

          const entries = db.prepare(query).all() as { id: string; content: string }[];

          if (entries.length === 0) {
            res.writeHead(200);
            res.end(JSON.stringify({ processed: 0, success: 0, failed: 0, message: 'No entries to process' }));
            return;
          }

          const embeddingsService = await getEmbeddingsService();
          let success = 0;
          let failed = 0;

          const updateStmt = db.prepare('UPDATE memory_entries SET embedding = ?, updated_at = ? WHERE id = ?');

          for (const entry of entries) {
            try {
              const result = await embeddingsService.embed(entry.content);
              const embeddingBuffer = Buffer.from(result.embedding);
              updateStmt.run(embeddingBuffer, Date.now(), entry.id);
              success++;
            } catch (e) {
              console.warn(`[WebViewer] Failed to generate embedding for ${entry.id}:`, e);
              failed++;
            }
          }

          res.writeHead(200);
          res.end(JSON.stringify({
            processed: entries.length,
            success,
            failed,
            message: `Generated embeddings for ${success} entries${failed > 0 ? `, ${failed} failed` : ''}`,
          }));
        })
        .catch((error) => {
          res.writeHead(500);
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }));
        });
      return;
    }

    // GET session hybrid search
    if (url.pathname === '/api/sessions/search' && method === 'GET') {
      const query = url.searchParams.get('q') || '';
      const searchType = (url.searchParams.get('type') || 'hybrid') as 'hybrid' | 'text' | 'vector';
      const limit = parseInt(url.searchParams.get('limit') || '30', 10);

      searchSessionsHybrid(db, query, { type: searchType, limit })
        .then((results) => {
          res.writeHead(200);
          res.end(JSON.stringify(results));
        })
        .catch((error) => {
          res.writeHead(500);
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Search failed' }));
        });
      return;
    }

    // GET session embeddings stats
    if (url.pathname === '/api/sessions/embeddings/stats' && method === 'GET') {
      try {
        const stats: Record<string, { total: number; withEmbedding: number }> = {};
        for (const table of ['observations', 'user_prompts', 'session_summaries'] as const) {
          const total = (db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number }).c;
          const withEmb = (db.prepare(`SELECT COUNT(*) as c FROM ${table} WHERE embedding IS NOT NULL AND LENGTH(embedding) > 0`).get() as { c: number }).c;
          stats[table] = { total, withEmbedding: withEmb };
        }
        res.writeHead(200);
        res.end(JSON.stringify(stats));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: String(error) }));
      }
      return;
    }

    // POST generate session embeddings
    if (url.pathname === '/api/sessions/embeddings/generate' && method === 'POST') {
      readBody(req).then(async (body) => {
        try {
          const opts = JSON.parse(body || '{}') as { mode?: 'missing' | 'all' };
          const mode = opts.mode || 'missing';
          const embeddingsService = await getEmbeddingsService();

          let totalSuccess = 0, totalFailed = 0;
          const tableConfigs = [
            { name: 'observations' as const, idCol: 'id' },
            { name: 'user_prompts' as const, idCol: 'id' },
            { name: 'session_summaries' as const, idCol: 'id' },
          ];

          for (const { name, idCol } of tableConfigs) {
            const where = mode === 'missing' ? 'WHERE embedding IS NULL OR LENGTH(embedding) = 0' : '';
            const rows = db.prepare(`SELECT * FROM ${name} ${where}`).all() as Record<string, unknown>[];
            const updateStmt = db.prepare(`UPDATE ${name} SET embedding = ? WHERE ${idCol} = ?`);

            for (const row of rows) {
              const text = getSessionEmbeddingText(name, row);
              if (!text) { totalFailed++; continue; }
              try {
                const result = await embeddingsService.embed(text);
                const buffer = Buffer.from(result.embedding);
                updateStmt.run(buffer, row[idCol]);
                totalSuccess++;
              } catch { totalFailed++; }
            }
          }

          res.writeHead(200);
          res.end(JSON.stringify({
            processed: totalSuccess + totalFailed,
            success: totalSuccess,
            failed: totalFailed,
          }));
        } catch (error) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Generation failed' }));
        }
      }).catch(() => {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid request body' }));
      });
      return;
    }

    // GET sessions data (sessions, prompts, summaries) - all in memory.db now
    if (url.pathname === '/api/sessions' && method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '20', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);
      const query = url.searchParams.get('q') || '';

      // Strip embedding BLOBs and add hasEmbedding flag
      const stripEmb = (rows: Record<string, unknown>[]) =>
        rows.map(r => ({ ...r, hasEmbedding: !!(r.embedding && (r.embedding as Buffer).length > 0), embedding: undefined }));

      try {
        let sessions: Record<string, unknown>[];
        if (query) {
          const pattern = `%${query}%`;
          sessions = db.prepare(`
            SELECT * FROM sessions WHERE session_id LIKE ? OR project LIKE ? OR prompt LIKE ? OR summary LIKE ?
            ORDER BY started_at DESC LIMIT ? OFFSET ?
          `).all(pattern, pattern, pattern, pattern, limit, offset) as Record<string, unknown>[];
        } else {
          sessions = db.prepare(`
            SELECT * FROM sessions ORDER BY started_at DESC LIMIT ? OFFSET ?
          `).all(limit, offset) as Record<string, unknown>[];
        }

        // user_prompts
        let prompts: Record<string, unknown>[] = [];
        try {
          if (query) {
            const pattern = `%${query}%`;
            prompts = stripEmb(db.prepare(`
              SELECT up.*, s.project FROM user_prompts up
              JOIN sessions s ON s.session_id = up.session_id
              WHERE up.prompt_text LIKE ?
              ORDER BY up.created_at DESC LIMIT ? OFFSET ?
            `).all(pattern, limit, offset) as Record<string, unknown>[]);
          } else {
            prompts = stripEmb(db.prepare(`
              SELECT up.*, s.project FROM user_prompts up
              JOIN sessions s ON s.session_id = up.session_id
              ORDER BY up.created_at DESC LIMIT ? OFFSET ?
            `).all(limit, offset) as Record<string, unknown>[]);
          }
        } catch { /* table may not exist */ }

        // session_summaries
        let summaries: Record<string, unknown>[] = [];
        try {
          if (query) {
            const pattern = `%${query}%`;
            summaries = stripEmb(db.prepare(`
              SELECT * FROM session_summaries WHERE request LIKE ? OR completed LIKE ? OR notes LIKE ? OR next_steps LIKE ?
              ORDER BY created_at DESC LIMIT ? OFFSET ?
            `).all(pattern, pattern, pattern, pattern, limit, offset) as Record<string, unknown>[]);
          } else {
            summaries = stripEmb(db.prepare(`
              SELECT * FROM session_summaries ORDER BY created_at DESC LIMIT ? OFFSET ?
            `).all(limit, offset) as Record<string, unknown>[]);
          }
        } catch { /* table may not exist */ }

        res.writeHead(200);
        res.end(JSON.stringify({ sessions, prompts, summaries }));
      } catch (error) {
        res.writeHead(200);
        res.end(JSON.stringify({ sessions: [], prompts: [], summaries: [], error: String(error) }));
      }
      return;
    }

    // GET observations from memory.db
    if (url.pathname === '/api/observations' && method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);
      const sessionId = url.searchParams.get('session_id') || undefined;
      const query = url.searchParams.get('q') || '';

      // Strip embedding BLOBs and add hasEmbedding flag
      const stripEmb = (rows: Record<string, unknown>[]) =>
        rows.map(r => ({ ...r, hasEmbedding: !!(r.embedding && (r.embedding as Buffer).length > 0), embedding: undefined }));

      try {
        let rows: Record<string, unknown>[];
        if (query) {
          const pattern = `%${query}%`;
          if (sessionId) {
            rows = db.prepare(`
              SELECT * FROM observations WHERE session_id = ? AND (tool_name LIKE ? OR title LIKE ? OR subtitle LIKE ? OR narrative LIKE ?)
              ORDER BY timestamp DESC LIMIT ? OFFSET ?
            `).all(sessionId, pattern, pattern, pattern, pattern, limit, offset) as Record<string, unknown>[];
          } else {
            rows = db.prepare(`
              SELECT * FROM observations WHERE tool_name LIKE ? OR title LIKE ? OR subtitle LIKE ? OR narrative LIKE ?
              ORDER BY timestamp DESC LIMIT ? OFFSET ?
            `).all(pattern, pattern, pattern, pattern, limit, offset) as Record<string, unknown>[];
          }
        } else if (sessionId) {
          rows = db.prepare(`
            SELECT * FROM observations WHERE session_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?
          `).all(sessionId, limit, offset) as Record<string, unknown>[];
        } else {
          rows = db.prepare(`
            SELECT * FROM observations ORDER BY timestamp DESC LIMIT ? OFFSET ?
          `).all(limit, offset) as Record<string, unknown>[];
        }
        res.writeHead(200);
        res.end(JSON.stringify(stripEmb(rows)));
      } catch {
        res.writeHead(200);
        res.end(JSON.stringify([]));
      }
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }));
  }
}

const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`\n  AgentKits Memory Viewer\n`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Database: ${dbPath}\n`);
  console.log(`  Press Ctrl+C to stop\n`);
});

// Graceful shutdown: close server, DB, and embeddings service on SIGINT/SIGTERM
function cleanup() {
  server.close();
  if (_db) { try { _db.close(); } catch { /* ignore */ } _db = null; }
  if (_embeddingsService) { _embeddingsService = null; }
  if (_searchEngine) { _searchEngine = null; }
  process.exit(0);
}
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
