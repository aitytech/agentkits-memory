/**
 * MCP Server Types
 *
 * Type definitions for the Model Context Protocol server.
 *
 * @module @agentkits/memory/mcp/types
 */

/**
 * MCP Tool input schema
 */
export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description: string;
    enum?: string[];
  }>;
  required?: string[];
}

/**
 * MCP Tool definition
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
}

/**
 * MCP Tool call request
 */
export interface ToolCallRequest {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * MCP Tool call result
 */
export interface ToolCallResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

/**
 * Memory save arguments
 */
export interface MemorySaveArgs {
  content: string;
  category?: 'decision' | 'pattern' | 'error' | 'context' | 'observation';
  tags?: string | string[];
  importance?: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Memory search arguments
 */
export interface MemorySearchArgs {
  query: string;
  limit?: number;
  category?: string;
  tags?: string[];
}

/**
 * Memory recall arguments
 */
export interface MemoryRecallArgs {
  topic: string;
  timeRange?: 'today' | 'week' | 'month' | 'all';
}

/**
 * Memory list arguments
 */
export interface MemoryListArgs {
  category?: string;
  limit?: number;
  since?: string;
}

/**
 * JSON-RPC request
 */
export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

/**
 * JSON-RPC response
 */
export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}
