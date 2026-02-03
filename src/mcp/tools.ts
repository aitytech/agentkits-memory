/**
 * MCP Memory Tools
 *
 * Tool definitions for the memory MCP server.
 * Includes __IMPORTANT meta-tool that teaches LLMs the 3-layer workflow.
 *
 * @module @agentkits/memory/mcp/tools
 */

import type { MCPTool } from './types.js';

/**
 * Search strategy tips appended to search/timeline results.
 * Guides LLM through progressive disclosure workflow.
 */
export const SEARCH_STRATEGY_TIPS = `
---
**Memory Search Strategy (3-Layer Progressive Disclosure):**
1. \`memory_search(query)\` - Get index with IDs (~50 tokens/result)
2. \`memory_timeline(anchor: "ID")\` - Get context around interesting results
3. \`memory_details(ids: ["ID1", "ID2"])\` - Fetch full content ONLY for filtered IDs

**Tips:** Filter by category, dateStart/dateEnd, or orderBy for precise results.
NEVER fetch full details without filtering first — saves ~87% tokens.`;

/**
 * All available memory tools
 */
export const MEMORY_TOOLS: MCPTool[] = [
  // Meta-tool: teaches LLM the correct workflow (save-first, then search)
  {
    name: '__IMPORTANT',
    description: `MEMORY WORKFLOW (ALWAYS FOLLOW):
0. memory_status() → Check if memories exist BEFORE searching
1. memory_save(content, category, tags) → Save decisions, patterns, errors, context
2. memory_search(query) → Get index with IDs (~50 tokens/result)
3. memory_timeline(anchor="ID") → Get context around interesting results
4. memory_details(ids=["ID1","ID2"]) → Fetch full content ONLY for filtered IDs
IMPORTANT: Do NOT call memory_search/timeline/details on empty memory — save first.
Also available: memory_recall, memory_list, memory_update, memory_delete.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'memory_save',
    description: 'Save information to project memory. Use this to store decisions, patterns, error solutions, or important context that should persist across sessions.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The content to save to memory. Be specific and include context.',
        },
        category: {
          type: 'string',
          description: 'Category of memory',
          enum: ['decision', 'pattern', 'error', 'context', 'observation'],
        },
        tags: {
          type: 'string',
          description: 'Comma-separated tags for easier retrieval (e.g., "auth,security,api")',
        },
        importance: {
          type: 'string',
          description: 'How important is this memory',
          enum: ['low', 'medium', 'high', 'critical'],
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'memory_search',
    description: `[Step 1/3] Search memory index. Returns lightweight results with IDs and titles.
Use memory_timeline(anchor) for context, then memory_details(ids) for full content.
This 3-step workflow saves ~87% tokens vs fetching everything.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What to search for in memory',
        },
        limit: {
          type: 'string',
          description: 'Maximum number of results (default: 10)',
        },
        category: {
          type: 'string',
          description: 'Filter by category',
          enum: ['decision', 'pattern', 'error', 'context', 'observation'],
        },
        dateStart: {
          type: 'string',
          description: 'Filter: only memories after this date (ISO 8601, e.g., "2025-01-01")',
        },
        dateEnd: {
          type: 'string',
          description: 'Filter: only memories before this date (ISO 8601, e.g., "2025-12-31")',
        },
        orderBy: {
          type: 'string',
          description: 'Sort order for results',
          enum: ['relevance', 'date_asc', 'date_desc'],
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory_timeline',
    description: `[Step 2/3] Get timeline context around a memory. Use after memory_search to understand temporal context.
Shows what happened before/after a specific memory.`,
    inputSchema: {
      type: 'object',
      properties: {
        anchor: {
          type: 'string',
          description: 'Memory ID from memory_search results',
        },
        before: {
          type: 'number',
          description: 'Minutes before anchor to include (default: 30)',
        },
        after: {
          type: 'number',
          description: 'Minutes after anchor to include (default: 30)',
        },
      },
      required: ['anchor'],
    },
  },
  {
    name: 'memory_details',
    description: `[Step 3/3] Get full content for specific memories. Use after reviewing search/timeline results.
Only fetches memories you need, saving context tokens.`,
    inputSchema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Memory IDs from memory_search or memory_timeline',
        },
      },
      required: ['ids'],
    },
  },
  {
    name: 'memory_delete',
    description: 'Delete specific memories by ID. Use to clean up duplicates, outdated, or incorrect entries.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Memory IDs to delete',
        },
      },
      required: ['ids'],
    },
  },
  {
    name: 'memory_update',
    description: 'Update an existing memory. Replaces content and/or tags of an existing entry without creating duplicates.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Memory ID to update',
        },
        content: {
          type: 'string',
          description: 'New content (replaces existing)',
        },
        tags: {
          type: 'string',
          description: 'New comma-separated tags (replaces existing)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'memory_recall',
    description: `Recall specific topic from memory. Gets a summary of everything known about a topic.
Use for quick topic overview. For detailed investigation, use memory_search → memory_timeline → memory_details instead.`,
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'The topic to recall (e.g., "authentication", "database schema", "error handling")',
        },
        timeRange: {
          type: 'string',
          description: 'Time range to search',
          enum: ['today', 'week', 'month', 'all'],
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'memory_list',
    description: 'List recent memories. Shows what has been saved recently. Use memory_search for targeted lookup.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Filter by category',
          enum: ['decision', 'pattern', 'error', 'context', 'observation'],
        },
        limit: {
          type: 'string',
          description: 'Maximum number of results (default: 10)',
        },
      },
    },
  },
  {
    name: 'memory_status',
    description: 'Get memory system status. Shows database size, entry count, and health.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

export default MEMORY_TOOLS;
