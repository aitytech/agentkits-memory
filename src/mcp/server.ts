#!/usr/bin/env node
/**
 * AgentKits Memory MCP Server
 *
 * Model Context Protocol server for Claude Code memory access.
 * Provides tools for saving, searching, and recalling memories.
 *
 * Usage:
 *   Add to .mcp.json:
 *   {
 *     "mcpServers": {
 *       "memory": {
 *         "command": "npx",
 *         "args": ["agentkits-memory-server"]
 *       }
 *     }
 *   }
 *
 * @module @agentkits/memory/mcp/server
 */

import * as readline from 'node:readline';
import * as path from 'node:path';
import { ProjectMemoryService, MemoryEntry, MemoryQuery, DEFAULT_NAMESPACES, LocalEmbeddingsService } from '../index.js';
import { MEMORY_TOOLS } from './tools.js';
import type {
  JSONRPCRequest,
  JSONRPCResponse,
  ToolCallRequest,
  ToolCallResult,
  MemorySaveArgs,
  MemorySearchArgs,
  MemoryRecallArgs,
  MemoryListArgs,
  MemoryTimelineArgs,
  MemoryDetailsArgs,
} from './types.js';

// Map category names to namespaces
const CATEGORY_TO_NAMESPACE: Record<string, string> = {
  decision: DEFAULT_NAMESPACES.DECISIONS,
  pattern: DEFAULT_NAMESPACES.PATTERNS,
  error: DEFAULT_NAMESPACES.ERRORS,
  context: DEFAULT_NAMESPACES.CONTEXT,
  observation: DEFAULT_NAMESPACES.ACTIVE,
};

/**
 * Memory MCP Server
 */
class MemoryMCPServer {
  private service: ProjectMemoryService | null = null;
  private embeddingsService: LocalEmbeddingsService | null = null;
  private projectDir: string;
  private initialized = false;

  constructor() {
    this.projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  }

  /**
   * Initialize the memory service with embeddings support
   */
  private async ensureInitialized(): Promise<ProjectMemoryService> {
    if (!this.service || !this.initialized) {
      const baseDir = path.join(this.projectDir, '.claude/memory');

      // Initialize embeddings service
      this.embeddingsService = new LocalEmbeddingsService({
        cacheDir: path.join(baseDir, 'embeddings-cache'),
      });
      await this.embeddingsService.initialize();

      // Create embedding generator function
      const embeddingGenerator = async (text: string): Promise<Float32Array> => {
        const result = await this.embeddingsService!.embed(text);
        return result.embedding;
      };

      this.service = new ProjectMemoryService({
        baseDir,
        dbFilename: 'memory.db',
        embeddingGenerator,
      });
      await this.service.initialize();
      this.initialized = true;
    }
    return this.service;
  }

  /**
   * Handle JSON-RPC request
   */
  async handleRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    try {
      switch (request.method) {
        case 'initialize':
          return this.handleInitialize(request);

        case 'tools/list':
          return this.handleToolsList(request);

        case 'tools/call':
          return this.handleToolCall(request);

        case 'notifications/initialized':
          // Client initialized notification - acknowledge silently
          return { jsonrpc: '2.0', id: request.id, result: {} };

        default:
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32601,
              message: `Method not found: ${request.method}`,
            },
          };
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error',
        },
      };
    }
  }

  /**
   * Handle initialize request
   */
  private handleInitialize(request: JSONRPCRequest): JSONRPCResponse {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'agentkits-memory',
          version: '1.0.0',
        },
      },
    };
  }

  /**
   * Handle tools/list request
   */
  private handleToolsList(request: JSONRPCRequest): JSONRPCResponse {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        tools: MEMORY_TOOLS,
      },
    };
  }

  /**
   * Handle tools/call request
   */
  private async handleToolCall(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    const params = request.params as ToolCallRequest;
    const result = await this.executeTool(params.name, params.arguments);

    return {
      jsonrpc: '2.0',
      id: request.id,
      result,
    };
  }

  /**
   * Execute a tool
   */
  private async executeTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<ToolCallResult> {
    try {
      const service = await this.ensureInitialized();

      switch (name) {
        case 'memory_save':
          return this.toolSave(service, args as unknown as MemorySaveArgs);

        case 'memory_search':
          return this.toolSearch(service, args as unknown as MemorySearchArgs);

        case 'memory_timeline':
          return this.toolTimeline(service, args as unknown as MemoryTimelineArgs);

        case 'memory_details':
          return this.toolDetails(service, args as unknown as MemoryDetailsArgs);

        case 'memory_recall':
          return this.toolRecall(service, args as unknown as MemoryRecallArgs);

        case 'memory_list':
          return this.toolList(service, args as unknown as MemoryListArgs);

        case 'memory_status':
          return this.toolStatus(service);

        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  /**
   * Save memory tool
   */
  private async toolSave(
    service: ProjectMemoryService,
    args: MemorySaveArgs
  ): Promise<ToolCallResult> {
    const tags = typeof args.tags === 'string'
      ? args.tags.split(',').map((t: string) => t.trim())
      : args.tags || [];

    // Map category to namespace
    const category = args.category || 'observation';
    const namespace = CATEGORY_TO_NAMESPACE[category] || DEFAULT_NAMESPACES.ACTIVE;

    // Store entry using storeEntry convenience method
    const entry = await service.storeEntry({
      key: `${category}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      content: args.content,
      namespace,
      tags: [...tags, category],
      metadata: {
        importance: args.importance || 'medium',
        source: 'mcp',
        savedAt: new Date().toISOString(),
      },
    });

    return {
      content: [{
        type: 'text',
        text: `Saved to memory (${category}): "${args.content.slice(0, 100)}${args.content.length > 100 ? '...' : ''}"`,
      }],
    };
  }

  /**
   * Search memory tool (Progressive Disclosure Layer 1)
   * Returns lightweight index: id, title, category, score
   */
  private async toolSearch(
    service: ProjectMemoryService,
    args: MemorySearchArgs
  ): Promise<ToolCallResult> {
    const limit = typeof args.limit === 'string' ? parseInt(args.limit, 10) : (args.limit || 10);

    // Map category to namespace
    const namespace = args.category ? CATEGORY_TO_NAMESPACE[args.category] : undefined;

    // Build query
    const query: MemoryQuery = {
      type: 'hybrid',
      limit,
      namespace,
      content: args.query,
    };

    const results = await service.query(query);

    if (results.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No memories found for: "${args.query}"`,
        }],
      };
    }

    // Progressive Disclosure Layer 1: Return lightweight index only
    // Full content requires memory_details(ids)
    const index = results.map((entry: MemoryEntry, i: number) => {
      const category = entry.tags.find(t => Object.keys(CATEGORY_TO_NAMESPACE).includes(t)) || entry.namespace;
      const date = new Date(entry.createdAt).toLocaleDateString();
      // Extract title from content (first line or first 60 chars)
      const title = entry.content.split('\n')[0].slice(0, 60) + (entry.content.length > 60 ? '...' : '');
      const score = (entry as MemoryEntry & { score?: number }).score;

      return {
        id: entry.id,
        title,
        category,
        tags: entry.tags.slice(0, 3), // Limit tags
        date,
        score: score ? Math.round(score * 100) : undefined,
      };
    });

    // Format as compact table
    const formatted = index.map((item, i) =>
      `${i + 1}. [${item.category}] ${item.title}\n   ID: ${item.id} | Tags: ${item.tags.join(', ') || '-'} | ${item.date}${item.score ? ` | Score: ${item.score}%` : ''}`
    ).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `## Search Results (${results.length} memories)

${formatted}

---
**Next steps:**
- \`memory_timeline(anchor: "ID")\` - Get context around a memory
- \`memory_details(ids: ["ID1", "ID2"])\` - Get full content`,
      }],
    };
  }

  /**
   * Timeline context tool (Progressive Disclosure Layer 2)
   * Returns memories before/after anchor
   */
  private async toolTimeline(
    service: ProjectMemoryService,
    args: MemoryTimelineArgs
  ): Promise<ToolCallResult> {
    const before = args.before || 30; // minutes
    const after = args.after || 30;

    // Get the anchor memory
    const anchor = await service.get(args.anchor);
    if (!anchor) {
      return {
        content: [{
          type: 'text',
          text: `Memory not found: ${args.anchor}`,
        }],
        isError: true,
      };
    }

    const anchorTime = new Date(anchor.createdAt).getTime();
    const startTime = anchorTime - (before * 60 * 1000);
    const endTime = anchorTime + (after * 60 * 1000);

    // Query memories in time range
    const query: MemoryQuery = {
      type: 'hybrid',
      limit: 20,
      namespace: anchor.namespace,
    };

    const allResults = await service.query(query);

    // Filter by time range
    const nearby = allResults.filter((entry: MemoryEntry) => {
      const time = new Date(entry.createdAt).getTime();
      return time >= startTime && time <= endTime;
    });

    // Sort by time
    nearby.sort((a: MemoryEntry, b: MemoryEntry) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // Format timeline
    const category = anchor.tags.find(t => Object.keys(CATEGORY_TO_NAMESPACE).includes(t)) || anchor.namespace;
    const anchorTitle = anchor.content.split('\n')[0].slice(0, 60);

    const timeline = nearby.map((entry: MemoryEntry) => {
      const time = new Date(entry.createdAt).toLocaleTimeString();
      const isAnchor = entry.id === anchor.id;
      const title = entry.content.split('\n')[0].slice(0, 50);
      return `${isAnchor ? '→' : ' '} ${time} | ${entry.id} | ${title}${isAnchor ? ' ←' : ''}`;
    }).join('\n');

    return {
      content: [{
        type: 'text',
        text: `## Timeline Context

**Anchor:** ${anchorTitle}
**Category:** ${category}
**Time range:** ${before}min before → ${after}min after

\`\`\`
${timeline}
\`\`\`

---
**Next:** \`memory_details(ids: ["${anchor.id}"])\` - Get full content`,
      }],
    };
  }

  /**
   * Get full details tool (Progressive Disclosure Layer 3)
   * Returns complete content for specified IDs
   */
  private async toolDetails(
    service: ProjectMemoryService,
    args: MemoryDetailsArgs
  ): Promise<ToolCallResult> {
    if (!args.ids || args.ids.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No memory IDs provided. Use memory_search first to find IDs.',
        }],
        isError: true,
      };
    }

    // Limit to prevent token explosion
    const ids = args.ids.slice(0, 5);
    if (args.ids.length > 5) {
      // Will add note about limit
    }

    const memories: MemoryEntry[] = [];
    for (const id of ids) {
      const entry = await service.get(id);
      if (entry) {
        memories.push(entry);
      }
    }

    if (memories.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No memories found for IDs: ${ids.join(', ')}`,
        }],
        isError: true,
      };
    }

    // Format full details
    const formatted = memories.map((entry: MemoryEntry, i: number) => {
      const category = entry.tags.find(t => Object.keys(CATEGORY_TO_NAMESPACE).includes(t)) || entry.namespace;
      const date = new Date(entry.createdAt).toLocaleString();

      return `### ${i + 1}. [${category}] ${entry.id}

**Created:** ${date}
**Tags:** ${entry.tags.join(', ') || 'none'}

${entry.content}`;
    }).join('\n\n---\n\n');

    let output = `## Memory Details (${memories.length} of ${args.ids.length} requested)\n\n${formatted}`;

    if (args.ids.length > 5) {
      output += `\n\n---\n⚠️ Limited to 5 memories. Request remaining IDs separately.`;
    }

    return {
      content: [{ type: 'text', text: output }],
    };
  }

  /**
   * Recall topic tool
   */
  private async toolRecall(
    service: ProjectMemoryService,
    args: MemoryRecallArgs
  ): Promise<ToolCallResult> {
    // Search for topic
    const query: MemoryQuery = {
      type: 'hybrid',
      limit: 10,
      content: args.topic,
    };

    const results = await service.query(query);

    if (results.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No memories found about: "${args.topic}"`,
        }],
      };
    }

    // Group by namespace
    const byNamespace: Record<string, string[]> = {};
    for (const entry of results) {
      const ns = entry.namespace || 'general';
      if (!byNamespace[ns]) byNamespace[ns] = [];
      byNamespace[ns].push(entry.content);
    }

    // Format output
    let output = `## Memory Recall: ${args.topic}\n\n`;
    for (const [namespace, items] of Object.entries(byNamespace)) {
      output += `### ${namespace.charAt(0).toUpperCase() + namespace.slice(1)}\n`;
      items.forEach((item: string) => {
        output += `- ${item}\n`;
      });
      output += '\n';
    }

    return {
      content: [{ type: 'text', text: output }],
    };
  }

  /**
   * List memories tool
   */
  private async toolList(
    service: ProjectMemoryService,
    args: MemoryListArgs
  ): Promise<ToolCallResult> {
    const limit = typeof args.limit === 'string' ? parseInt(args.limit, 10) : (args.limit || 10);

    // Map category to namespace
    const namespace = args.category ? CATEGORY_TO_NAMESPACE[args.category] : undefined;

    // Get recent entries
    const query: MemoryQuery = {
      type: 'hybrid',
      limit,
      namespace,
    };

    const results = await service.query(query);

    if (results.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No memories stored yet.',
        }],
      };
    }

    const formatted = results.map((entry: MemoryEntry, i: number) => {
      const date = new Date(entry.createdAt).toLocaleString();
      const category = entry.tags.find(t => Object.keys(CATEGORY_TO_NAMESPACE).includes(t)) || entry.namespace;
      return `${i + 1}. [${category}] ${entry.content.slice(0, 80)}${entry.content.length > 80 ? '...' : ''}\n   Created: ${date}`;
    }).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `Recent memories (${results.length}):\n\n${formatted}`,
      }],
    };
  }

  /**
   * Memory status tool
   */
  private async toolStatus(service: ProjectMemoryService): Promise<ToolCallResult> {
    const stats = await service.getStats();

    const output = `## Memory System Status

- **Entries**: ${stats.totalEntries}
- **Namespaces**: ${Object.keys(stats.entriesByNamespace || {}).join(', ') || 'none'}
- **Database**: ${this.projectDir}/.claude/memory/memory.db
- **Status**: Connected

### Namespace Breakdown
${Object.entries(stats.entriesByNamespace || {}).map(([ns, count]) => `- ${ns}: ${count}`).join('\n') || '- No entries yet'}
`;

    return {
      content: [{ type: 'text', text: output }],
    };
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    // Handle each line as a JSON-RPC request
    rl.on('line', async (line) => {
      try {
        const request = JSON.parse(line) as JSONRPCRequest;
        const response = await this.handleRequest(request);

        // Only send response if there's an id (not a notification)
        if (request.id !== undefined) {
          console.log(JSON.stringify(response));
        }
      } catch (error) {
        // Parse error
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error',
          },
        }));
      }
    });

    rl.on('close', () => {
      process.exit(0);
    });
  }
}

// Start server
const server = new MemoryMCPServer();
server.start().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
