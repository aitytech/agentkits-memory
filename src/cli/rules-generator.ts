/**
 * Rules file generator for non-Claude platforms.
 *
 * Generates platform-specific rules files (.cursorrules, .windsurfrules, .clinerules)
 * with MCP memory workflow instructions so AI assistants use memory tools proactively.
 *
 * @module @agentkits/memory/cli/rules-generator
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const MARKER_START = '<!-- AgentKits Memory Rules START -->';
const MARKER_END = '<!-- AgentKits Memory Rules END -->';

/**
 * Generate rules file content for AI coding assistants.
 * Instructs the AI to use MCP memory tools proactively.
 */
export function generateRulesContent(platformName: string): string {
  return `${MARKER_START}
# AgentKits Memory — ${platformName}

This project uses AgentKits Memory for persistent project context across sessions.
The following MCP tools are available via the "memory" server.

## Memory Workflow (ALWAYS FOLLOW)

0. \`memory_status()\` — Check if memories exist BEFORE searching
1. \`memory_save(content, category, tags)\` — Save decisions, patterns, errors, context
2. \`memory_search(query)\` — Get index with IDs (~50 tokens/result)
3. \`memory_timeline(anchor="ID")\` — Get context around interesting results
4. \`memory_details(ids=["ID1","ID2"])\` — Fetch full content ONLY for filtered IDs

**IMPORTANT:** Do NOT call memory_search/timeline/details on empty memory — save first.

## Also Available

- \`memory_recall(topic)\` — Quick topic overview
- \`memory_list()\` — List recent memories
- \`memory_update(id, content)\` — Update existing memory
- \`memory_delete(ids)\` — Remove outdated memories

## When to Save Memories

Save important context proactively using \`memory_save(content, category, tags, importance)\`:

| Category | What to Save |
|----------|-------------|
| **decision** | Architectural choices, tech stack picks, trade-offs |
| **pattern** | Coding conventions, project patterns, recurring approaches |
| **error** | Bug fixes, error solutions, debugging insights |
| **context** | Project background, team conventions, environment setup |
| **observation** | What you learned during implementation |

## Token Efficiency Rules

1. ALWAYS start with \`memory_search\` (Layer 1), never jump to \`memory_details\`
2. Review search results and select only relevant IDs before fetching details
3. Use filters (category, date range) to narrow results
4. Limit \`memory_details\` to 3-5 IDs per call
5. This workflow saves ~87% tokens vs fetching everything at once

## At Session Start

1. Call \`memory_status()\` to check if memories exist
2. If memories exist, call \`memory_recall(topic)\` for relevant project context
3. Save important decisions and patterns as you work
${MARKER_END}`;
}

/**
 * Install rules file to project root.
 * If the file exists, appends/replaces the AgentKits section.
 * If the file doesn't exist, creates it.
 */
export function installRulesFile(
  projectDir: string,
  rulesFileName: string,
  force: boolean,
  asJson: boolean = false,
): { installed: boolean; path: string; action: 'created' | 'updated' | 'skipped' } {
  const filePath = path.join(projectDir, rulesFileName);
  const platformName = rulesFileName
    .replace(/^\./, '')
    .replace(/rules$/, '')
    .replace(/^./, c => c.toUpperCase());

  const newContent = generateRulesContent(platformName);

  // File doesn't exist → create
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, newContent + '\n');
    return { installed: true, path: filePath, action: 'created' };
  }

  // File exists — check for existing AgentKits section
  const existing = fs.readFileSync(filePath, 'utf-8');
  const hasMarker = existing.includes(MARKER_START);

  if (hasMarker) {
    if (!force) {
      return { installed: false, path: filePath, action: 'skipped' };
    }
    // Replace existing section
    const regex = new RegExp(
      escapeRegex(MARKER_START) + '[\\s\\S]*?' + escapeRegex(MARKER_END),
      'g'
    );
    const updated = existing.replace(regex, newContent);
    fs.writeFileSync(filePath, updated);
    return { installed: true, path: filePath, action: 'updated' };
  }

  // File exists but no marker → append
  const separator = existing.endsWith('\n') ? '\n' : '\n\n';
  fs.writeFileSync(filePath, existing + separator + newContent + '\n');
  if (!asJson) {
    // Inform user we appended to existing file
  }
  return { installed: true, path: filePath, action: 'updated' };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
