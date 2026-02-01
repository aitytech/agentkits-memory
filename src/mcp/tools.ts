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
    description: 'Search project memory using semantic similarity. Find relevant past decisions, patterns, or context.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What to search for in memory',
        },
        limit: {
          type: 'string',
          description: 'Maximum number of results (default: 5)',
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
