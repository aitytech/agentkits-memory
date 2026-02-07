#!/usr/bin/env node
/**
 * AgentKits Memory Save CLI
 *
 * Simple CLI to save entries to the memory database.
 *
 * Usage:
 *   npx @aitytech/agentkits-memory save --content "..." [options]
 *
 * Options:
 *   --content=X       Content to save (required)
 *   --category=X      Category: decision, pattern, error, context, observation (default: context)
 *   --tags=X          Comma-separated tags
 *   --importance=X    low, medium, high, critical (default: medium)
 *   --project-dir=X   Project directory (default: cwd or CLAUDE_PROJECT_DIR)
 *
 * @module @agentkits/memory/cli/save
 */

import { ProjectMemoryService, DEFAULT_NAMESPACES, MemoryEntryInput } from '../index.js';

const args = process.argv.slice(2);

const CATEGORY_TO_NAMESPACE: Record<string, string> = {
  decision: DEFAULT_NAMESPACES.DECISIONS,
  pattern: DEFAULT_NAMESPACES.PATTERNS,
  error: DEFAULT_NAMESPACES.ERRORS,
  context: DEFAULT_NAMESPACES.CONTEXT,
  observation: DEFAULT_NAMESPACES.ACTIVE,
};

const IMPORTANCE_MAP: Record<string, number> = {
  low: 0.3,
  medium: 0.5,
  high: 0.7,
  critical: 1.0,
};

function parseArgs(): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=');
      if (eqIndex > 0) {
        const key = arg.slice(2, eqIndex);
        const value = arg.slice(eqIndex + 1);
        parsed[key] = value;
      }
    }
  }
  return parsed;
}

async function main() {
  const options = parseArgs();

  const content = options.content;
  if (!content) {
    console.error('Error: --content is required');
    process.exit(1);
  }

  const category = options.category || 'context';
  const namespace = CATEGORY_TO_NAMESPACE[category] || DEFAULT_NAMESPACES.CONTEXT;
  const importance = IMPORTANCE_MAP[options.importance || 'medium'] || 0.5;
  const projectDir = options['project-dir'] || process.env.CLAUDE_PROJECT_DIR || process.cwd();

  const tags = options.tags
    ? options.tags.split(',').map((t) => t.trim())
    : [];

  try {
    const service = new ProjectMemoryService({
      baseDir: `${projectDir}/.claude/memory`,
      dbFilename: 'memory.db',
    });

    await service.initialize();

    const key = `${category}-${Date.now()}`;

    const input: MemoryEntryInput = {
      key,
      content,
      type: 'episodic',
      namespace,
      tags,
      metadata: {
        category,
        importance,
        source: 'cli',
      },
    };

    await service.storeEntry(input);

    await service.shutdown();

    console.log(JSON.stringify({ success: true, key, namespace }));
  } catch (error) {
    console.error(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }));
    process.exit(1);
  }
}

main();
