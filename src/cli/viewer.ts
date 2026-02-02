#!/usr/bin/env node
/**
 * AgentKits Memory Viewer CLI
 *
 * Simple CLI to view memory database contents.
 *
 * Usage:
 *   npx agentkits-memory-viewer [options]
 *
 * Options:
 *   --stats         Show database statistics
 *   --list          List all entries
 *   --namespace=X   Filter by namespace
 *   --limit=N       Limit results (default: 20)
 *   --json          Output as JSON
 *   --export        Export all to JSON file
 *
 * @module @agentkits/memory/cli/viewer
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import type { Database as BetterDatabase } from 'better-sqlite3';

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

function loadDatabase(): BetterDatabase | null {
  const dbPath = path.join(projectDir, '.claude/memory/memory.db');

  if (fs.existsSync(dbPath)) {
    return new Database(dbPath);
  } else {
    console.log(`\n📭 No database found at: ${dbPath}\n`);
    console.log('Run Claude Code with memory MCP server to create entries.');
    return null;
  }
}

function main() {
  const options = parseArgs();
  const limit = parseInt(options.limit as string, 10) || 20;
  const namespace = options.namespace as string | undefined;
  const asJson = !!options.json;

  try {
    const db = loadDatabase();
    if (!db) {
      process.exit(0);
    }

    if (options.stats) {
      // Get stats
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

      if (asJson) {
        console.log(JSON.stringify({ total, byNamespace, byType }, null, 2));
      } else {
        console.log('\n📊 Memory Database Statistics\n');
        console.log(`Total Entries: ${total}`);
        console.log('\nEntries by Namespace:');
        for (const [ns, count] of Object.entries(byNamespace)) {
          console.log(`  ${ns}: ${count}`);
        }
        console.log('\nEntries by Type:');
        for (const [type, count] of Object.entries(byType)) {
          console.log(`  ${type}: ${count}`);
        }
        console.log(`\nDatabase: ${projectDir}/.claude/memory/memory.db\n`);
      }
      db.close();
      return;
    }

    if (options.export) {
      const rows = db.prepare('SELECT * FROM memory_entries').all() as Record<string, unknown>[];
      if (rows.length === 0) {
        console.log('No entries to export.');
        db.close();
        return;
      }

      const filename = `memory-export-${Date.now()}.json`;
      fs.writeFileSync(filename, JSON.stringify({ entries: rows, exportedAt: new Date().toISOString() }, null, 2));
      console.log(`✓ Exported ${rows.length} entries to ${filename}`);
      db.close();
      return;
    }

    // Default: list entries
    let query = 'SELECT id, key, content, type, namespace, tags, created_at FROM memory_entries';
    const params: (string | number)[] = [];

    if (namespace) {
      query += ' WHERE namespace = ?';
      params.push(namespace);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const entries = db.prepare(query).all(...params) as {
      id: string;
      key: string;
      content: string;
      type: string;
      namespace: string;
      tags: string;
      created_at: number;
    }[];

    if (entries.length === 0) {
      console.log('\n📭 No memories found in database.\n');
      console.log(`Database: ${projectDir}/.claude/memory/memory.db`);
      db.close();
      return;
    }

    if (asJson) {
      console.log(JSON.stringify(entries, null, 2));
      db.close();
      return;
    }

    console.log(`\n📚 Memory Database (${entries.length} entries)\n`);
    console.log(`Database: ${projectDir}/.claude/memory/memory.db\n`);
    console.log('─'.repeat(80));

    for (const entry of entries) {
      const date = new Date(entry.created_at).toLocaleString();
      const content = entry.content.length > 100
        ? entry.content.slice(0, 100) + '...'
        : entry.content;
      const tags = JSON.parse(entry.tags || '[]').join(', ') || 'none';

      console.log(`\n[${entry.namespace}] ${entry.key}`);
      console.log(`  Type: ${entry.type} | Tags: ${tags}`);
      console.log(`  Created: ${date}`);
      console.log(`  Content: ${content}`);
      console.log('─'.repeat(80));
    }

    // Get total count
    const countRow = db.prepare('SELECT COUNT(*) as count FROM memory_entries').get() as { count: number };
    const totalCount = countRow?.count || entries.length;

    console.log(`\nShowing ${entries.length} of ${totalCount} total entries`);
    console.log('Use --limit=N to see more, --namespace=X to filter\n');

    db.close();

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
