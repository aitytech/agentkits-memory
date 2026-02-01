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

async function loadDatabase(): Promise<SqlJsDatabase> {
  const require = createRequire(import.meta.url);
  const sqlJsPath = require.resolve('sql.js');

  const SQL = await initSqlJs({
    locateFile: (file: string) => path.join(path.dirname(sqlJsPath), file),
  });

  const dbPath = path.join(projectDir, '.claude/memory/memory.db');

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    return new SQL.Database(new Uint8Array(buffer));
  } else {
    console.log(`\n📭 No database found at: ${dbPath}\n`);
    console.log('Run Claude Code with memory MCP server to create entries.');
    process.exit(0);
  }
}

async function main() {
  const options = parseArgs();
  const limit = parseInt(options.limit as string, 10) || 20;
  const namespace = options.namespace as string | undefined;
  const asJson = !!options.json;

  try {
    const db = await loadDatabase();

    if (options.stats) {
      // Get stats
      const totalResult = db.exec('SELECT COUNT(*) as count FROM memory_entries');
      const total = totalResult[0]?.values[0]?.[0] || 0;

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
      const result = db.exec('SELECT * FROM memory_entries');
      if (!result[0]) {
        console.log('No entries to export.');
        db.close();
        return;
      }

      const columns = result[0].columns;
      const entries = result[0].values.map(row => {
        const entry: Record<string, unknown> = {};
        columns.forEach((col, i) => {
          entry[col] = row[i];
        });
        return entry;
      });

      const filename = `memory-export-${Date.now()}.json`;
      fs.writeFileSync(filename, JSON.stringify({ entries, exportedAt: new Date().toISOString() }, null, 2));
      console.log(`✓ Exported ${entries.length} entries to ${filename}`);
      db.close();
      return;
    }

    // Default: list entries
    let query = 'SELECT id, key, content, type, namespace, tags, created_at FROM memory_entries';
    const params: string[] = [];

    if (namespace) {
      query += ' WHERE namespace = ?';
      params.push(namespace);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(String(limit));

    const stmt = db.prepare(query);
    stmt.bind(params);

    const entries: Array<{
      id: string;
      key: string;
      content: string;
      type: string;
      namespace: string;
      tags: string;
      created_at: number;
    }> = [];

    while (stmt.step()) {
      const row = stmt.getAsObject();
      entries.push({
        id: row.id as string,
        key: row.key as string,
        content: row.content as string,
        type: row.type as string,
        namespace: row.namespace as string,
        tags: row.tags as string,
        created_at: row.created_at as number,
      });
    }
    stmt.free();

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
    const countResult = db.exec('SELECT COUNT(*) FROM memory_entries');
    const totalCount = countResult[0]?.values[0]?.[0] || entries.length;

    console.log(`\nShowing ${entries.length} of ${totalCount} total entries`);
    console.log('Use --limit=N to see more, --namespace=X to filter\n');

    db.close();

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
