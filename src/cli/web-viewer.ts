#!/usr/bin/env node
/**
 * AgentKits Memory Web Viewer
 *
 * Web-based viewer for memory database with CRUD support.
 *
 * Usage:
 *   npx agentkits-memory-web [--port=1905]
 *
 * @module @aitytech/agentkits-memory/cli/web-viewer
 */

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';

const args = process.argv.slice(2);
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

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

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

async function initSQL(): Promise<void> {
  if (!SQL) {
    const require = createRequire(import.meta.url);
    const sqlJsPath = require.resolve('sql.js');
    SQL = await initSqlJs({
      locateFile: (file: string) => path.join(path.dirname(sqlJsPath), file),
    });
  }
}

async function loadOrCreateDatabase(): Promise<SqlJsDatabase> {
  await initSQL();

  // Ensure directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  let db: SqlJsDatabase;

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(new Uint8Array(buffer));
  } else {
    db = new SQL.Database();
  }

  // Create table if not exists
  db.run(`
    CREATE TABLE IF NOT EXISTS memory_entries (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'semantic',
      namespace TEXT DEFAULT 'general',
      tags TEXT DEFAULT '[]',
      metadata TEXT DEFAULT '{}',
      embedding BLOB,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      accessed_at INTEGER,
      access_count INTEGER DEFAULT 0,
      importance REAL DEFAULT 0.5,
      decay_rate REAL DEFAULT 0.1
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_namespace ON memory_entries(namespace)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_key ON memory_entries(key)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_created ON memory_entries(created_at)`);

  return db;
}

function saveDatabase(db: SqlJsDatabase): void {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

function generateId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getStats(db: SqlJsDatabase): {
  total: number;
  byNamespace: Record<string, number>;
  byType: Record<string, number>;
} {
  const totalResult = db.exec('SELECT COUNT(*) as count FROM memory_entries');
  const total = (totalResult[0]?.values[0]?.[0] as number) || 0;

  const nsResult = db.exec('SELECT namespace, COUNT(*) FROM memory_entries GROUP BY namespace');
  const byNamespace: Record<string, number> = {};
  if (nsResult[0]) {
    for (const row of nsResult[0].values) {
      byNamespace[row[0] as string] = row[1] as number;
    }
  }

  const typeResult = db.exec('SELECT type, COUNT(*) FROM memory_entries GROUP BY type');
  const byType: Record<string, number> = {};
  if (typeResult[0]) {
    for (const row of typeResult[0].values) {
      byType[row[0] as string] = row[1] as number;
    }
  }

  return { total, byNamespace, byType };
}

function getEntries(
  db: SqlJsDatabase,
  namespace?: string,
  limit = 50,
  offset = 0,
  search?: string
): Array<{
  id: string;
  key: string;
  content: string;
  type: string;
  namespace: string;
  tags: string[];
  created_at: number;
  updated_at: number;
}> {
  let query = 'SELECT id, key, content, type, namespace, tags, created_at, updated_at FROM memory_entries';
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (namespace) {
    conditions.push('namespace = ?');
    params.push(namespace);
  }

  if (search) {
    conditions.push('(content LIKE ? OR key LIKE ? OR tags LIKE ?)');
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const stmt = db.prepare(query);
  stmt.bind(params);

  const entries: Array<{
    id: string;
    key: string;
    content: string;
    type: string;
    namespace: string;
    tags: string[];
    created_at: number;
    updated_at: number;
  }> = [];

  while (stmt.step()) {
    const row = stmt.getAsObject();
    entries.push({
      id: row.id as string,
      key: row.key as string,
      content: row.content as string,
      type: row.type as string,
      namespace: row.namespace as string,
      tags: JSON.parse((row.tags as string) || '[]'),
      created_at: row.created_at as number,
      updated_at: row.updated_at as number,
    });
  }
  stmt.free();

  return entries;
}

function getHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgentKits Memory Viewer</title>
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

    .entry-key { font-weight: 600; font-size: 15px; color: var(--text-primary); word-break: break-word; }

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
      <div class="header-actions">
        <button class="btn btn-primary" onclick="openAddModal()">
          <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          Add Memory
        </button>
        <button class="btn" onclick="loadData()">
          <svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
          Refresh
        </button>
      </div>
    </header>

    <div id="stats-container" class="stats-grid"></div>
    <div id="namespace-pills" class="namespace-pills"></div>

    <div class="controls">
      <div class="search-box">
        <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
        <input type="text" id="search-input" placeholder="Search memories..." oninput="debounceSearch()">
      </div>
    </div>

    <div id="entries-container" class="entries-list">
      <div class="loading"><div class="spinner"></div></div>
    </div>

    <div id="pagination" class="pagination"></div>
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
        <div class="stat-card">
          <div class="stat-label">Types</div>
          <div class="stat-value">\${Object.keys(stats.byType || {}).length}</div>
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

      const params = new URLSearchParams({ limit: pageSize, offset: currentPage * pageSize });
      if (currentNamespace) params.set('namespace', currentNamespace);
      if (currentSearch) params.set('search', currentSearch);

      try {
        const res = await fetch('/api/entries?' + params);
        const entries = await res.json();

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
                <span class="entry-namespace">\${entry.namespace}</span>
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
      }
    });

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

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const method = req.method || 'GET';

  res.setHeader('Content-Type', 'application/json');

  try {
    const db = await loadOrCreateDatabase();

    // Serve HTML
    if (url.pathname === '/' && method === 'GET') {
      res.setHeader('Content-Type', 'text/html');
      res.writeHead(200);
      res.end(getHTML());
      db.close();
      return;
    }

    // GET stats
    if (url.pathname === '/api/stats' && method === 'GET') {
      const stats = getStats(db);
      res.writeHead(200);
      res.end(JSON.stringify(stats));
      db.close();
      return;
    }

    // GET entries
    if (url.pathname === '/api/entries' && method === 'GET') {
      const namespace = url.searchParams.get('namespace') || undefined;
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);
      const search = url.searchParams.get('search') || undefined;

      const entries = getEntries(db, namespace, limit, offset, search);
      res.writeHead(200);
      res.end(JSON.stringify(entries));
      db.close();
      return;
    }

    // POST create entry
    if (url.pathname === '/api/entries' && method === 'POST') {
      const body = await readBody(req);
      const data = JSON.parse(body);
      const now = Date.now();
      const id = generateId();

      db.run(
        `INSERT INTO memory_entries (id, key, content, type, namespace, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, data.key, data.content, data.type || 'semantic', data.namespace || 'general', JSON.stringify(data.tags || []), now, now]
      );

      saveDatabase(db);
      res.writeHead(201);
      res.end(JSON.stringify({ id, success: true }));
      db.close();
      return;
    }

    // GET single entry
    if (url.pathname.startsWith('/api/entry/') && method === 'GET') {
      const id = url.pathname.split('/').pop();
      const stmt = db.prepare('SELECT * FROM memory_entries WHERE id = ?');
      stmt.bind([id]);

      if (stmt.step()) {
        const row = stmt.getAsObject();
        res.writeHead(200);
        res.end(JSON.stringify({
          id: row.id,
          key: row.key,
          content: row.content,
          type: row.type,
          namespace: row.namespace,
          tags: JSON.parse((row.tags as string) || '[]'),
          created_at: row.created_at,
          updated_at: row.updated_at,
        }));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Entry not found' }));
      }
      stmt.free();
      db.close();
      return;
    }

    // PUT update entry
    if (url.pathname.startsWith('/api/entry/') && method === 'PUT') {
      const id = url.pathname.split('/').pop();
      const body = await readBody(req);
      const data = JSON.parse(body);
      const now = Date.now();

      db.run(
        `UPDATE memory_entries SET key = ?, content = ?, type = ?, namespace = ?, tags = ?, updated_at = ?
         WHERE id = ?`,
        [data.key, data.content, data.type, data.namespace, JSON.stringify(data.tags || []), now, id]
      );

      saveDatabase(db);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
      db.close();
      return;
    }

    // DELETE entry
    if (url.pathname.startsWith('/api/entry/') && method === 'DELETE') {
      const id = url.pathname.split('/').pop();
      db.run('DELETE FROM memory_entries WHERE id = ?', [id]);
      saveDatabase(db);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
      db.close();
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
    db.close();
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
