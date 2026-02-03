/**
 * MCP Memory Tools
 *
 * Tool definitions for the memory MCP server.
 *
 * @module @agentkits/memory/mcp/tools
 */

import type { MCPTool } from './types.js';

/**
 * All available memory tools
 */
export const MEMORY_TOOLS: MCPTool[] = [
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
    name: 'memory_recall',
    description: 'Recall specific topic from memory. Gets a summary of everything known about a topic.',
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
    description: 'List recent memories. Shows what has been saved recently.',
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
