/**
 * Hook Types for AgentKits Memory
 *
 * Lightweight hook system for auto-capturing Claude Code sessions.
 * Based on claude-mem patterns but simplified for project-scoped storage.
 *
 * @module @agentkits/memory/hooks/types
 */

// ===== Claude Code Hook Input Types =====

/**
 * Raw input from Claude Code hooks (via stdin JSON)
 */
export interface ClaudeCodeHookInput {
  /** Claude's session ID */
  session_id?: string;

  /** Current working directory */
  cwd?: string;

  /** User's prompt (UserPromptSubmit) */
  prompt?: string;

  /** Tool name (PostToolUse) */
  tool_name?: string;

  /** Tool input parameters (PostToolUse) */
  tool_input?: unknown;

  /** Tool response/output (PostToolUse) */
  tool_result?: unknown;

  /** Path to conversation transcript (Stop) */
  transcript_path?: string;

  /** Stop reason (Stop) */
  stop_reason?: string;
}

/**
 * Normalized hook input for handlers
 */
export interface NormalizedHookInput {
  /** Session ID */
  sessionId: string;

  /** Project directory */
  cwd: string;

  /** Project name (derived from cwd) */
  project: string;

  /** User's prompt */
  prompt?: string;

  /** Tool name */
  toolName?: string;

  /** Tool input */
  toolInput?: unknown;

  /** Tool response */
  toolResponse?: unknown;

  /** Transcript path */
  transcriptPath?: string;

  /** Stop reason */
  stopReason?: string;

  /** Timestamp */
  timestamp: number;
}

// ===== Hook Result Types =====

/**
 * Hook execution result
 */
export interface HookResult {
  /** Continue processing (always true for us) */
  continue: boolean;

  /** Suppress output to Claude */
  suppressOutput: boolean;

  /** Additional context to inject (SessionStart only) */
  additionalContext?: string;

  /** Error message if failed */
  error?: string;
}

/**
 * Hook-specific output for Claude Code
 */
export interface HookSpecificOutput {
  hookEventName: string;
  additionalContext?: string;
}

/**
 * Full hook response for Claude Code
 */
export interface ClaudeCodeHookResponse {
  continue?: boolean;
  suppressOutput?: boolean;
  hookSpecificOutput?: HookSpecificOutput;
}

// ===== Event Handler Types =====

/**
 * Hook event types
 */
export type HookEventType =
  | 'context'        // SessionStart - inject context
  | 'session-init'   // UserPromptSubmit - initialize session
  | 'observation'    // PostToolUse - capture tool usage
  | 'summarize';     // Stop - generate summary

/**
 * Event handler interface
 */
export interface EventHandler {
  /** Execute the hook handler */
  execute(input: NormalizedHookInput): Promise<HookResult>;
}

// ===== Observation Types =====

/**
 * Captured observation from tool usage
 */
export interface Observation {
  /** Unique ID */
  id: string;

  /** Session ID */
  sessionId: string;

  /** Project name */
  project: string;

  /** Tool name */
  toolName: string;

  /** Tool input (JSON) */
  toolInput: string;

  /** Tool response (JSON, truncated) */
  toolResponse: string;

  /** Working directory */
  cwd: string;

  /** Timestamp */
  timestamp: number;

  /** Observation type */
  type: ObservationType;

  /** Brief title (auto-generated) */
  title?: string;
}

/**
 * Observation types based on tool usage
 */
export type ObservationType =
  | 'read'      // Read, Glob, Grep
  | 'write'     // Write, Edit
  | 'execute'   // Bash, Task
  | 'search'    // WebSearch, WebFetch
  | 'other';    // Unknown tools

/**
 * Session record for tracking
 */
export interface SessionRecord {
  /** Database ID */
  id: number;

  /** Claude's session ID */
  sessionId: string;

  /** Project name */
  project: string;

  /** First user prompt */
  prompt: string;

  /** Session start time */
  startedAt: number;

  /** Session end time */
  endedAt?: number;

  /** Number of observations */
  observationCount: number;

  /** Auto-generated summary */
  summary?: string;

  /** Status */
  status: 'active' | 'completed' | 'abandoned';
}

// ===== Context Types =====

/**
 * Context to inject on session start
 */
export interface MemoryContext {
  /** Recent observations */
  recentObservations: Observation[];

  /** Previous sessions */
  previousSessions: SessionRecord[];

  /** Project-specific patterns */
  patterns?: string[];

  /** Recent decisions */
  decisions?: string[];

  /** Formatted markdown */
  markdown: string;
}

// ===== Utility Functions =====

/**
 * Generate observation ID
 */
export function generateObservationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `obs_${timestamp}_${random}`;
}

/**
 * Get project name from cwd
 */
export function getProjectName(cwd: string): string {
  const parts = cwd.split(/[/\\]/);
  return parts[parts.length - 1] || 'unknown';
}

/**
 * Determine observation type from tool name
 */
export function getObservationType(toolName: string): ObservationType {
  const readTools = ['Read', 'Glob', 'Grep', 'LS'];
  const writeTools = ['Write', 'Edit', 'NotebookEdit'];
  const executeTools = ['Bash', 'Task', 'Skill'];
  const searchTools = ['WebSearch', 'WebFetch'];

  if (readTools.includes(toolName)) return 'read';
  if (writeTools.includes(toolName)) return 'write';
  if (executeTools.includes(toolName)) return 'execute';
  if (searchTools.includes(toolName)) return 'search';
  return 'other';
}

/**
 * Generate observation title from tool usage
 */
export function generateObservationTitle(toolName: string, toolInput: unknown): string {
  try {
    const input = typeof toolInput === 'string' ? JSON.parse(toolInput) : toolInput;

    switch (toolName) {
      case 'Read':
        return `Read ${input?.file_path || input?.path || 'file'}`;
      case 'Write':
        return `Write ${input?.file_path || input?.path || 'file'}`;
      case 'Edit':
        return `Edit ${input?.file_path || input?.path || 'file'}`;
      case 'Bash':
        const cmd = input?.command || '';
        return `Run: ${cmd.substring(0, 50)}${cmd.length > 50 ? '...' : ''}`;
      case 'Glob':
        return `Find ${input?.pattern || 'files'}`;
      case 'Grep':
        return `Search "${input?.pattern || ''}"`;
      case 'Task':
        return `Task: ${input?.description || 'agent'}`;
      case 'WebSearch':
        return `Search: ${input?.query || ''}`;
      case 'WebFetch':
        return `Fetch: ${input?.url || ''}`;
      default:
        return `${toolName}`;
    }
  } catch {
    return toolName;
  }
}

/**
 * Truncate string to max length
 */
export function truncate(str: string, maxLength: number = 1000): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...[truncated]';
}

/**
 * Standard hook response (continue, no output)
 */
export const STANDARD_RESPONSE: ClaudeCodeHookResponse = {
  continue: true,
  suppressOutput: true,
};

/**
 * Format hook response for stdout
 */
export function formatResponse(result: HookResult): string {
  if (result.additionalContext) {
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: result.additionalContext,
      },
    });
  }

  return JSON.stringify(STANDARD_RESPONSE);
}

/**
 * Parse stdin input from Claude Code
 */
export function parseHookInput(stdin: string): NormalizedHookInput {
  try {
    const raw: ClaudeCodeHookInput = JSON.parse(stdin);

    const cwd = raw.cwd || process.cwd();

    return {
      sessionId: raw.session_id || `session_${Date.now()}`,
      cwd,
      project: getProjectName(cwd),
      prompt: raw.prompt,
      toolName: raw.tool_name,
      toolInput: raw.tool_input,
      toolResponse: raw.tool_result,
      transcriptPath: raw.transcript_path,
      stopReason: raw.stop_reason,
      timestamp: Date.now(),
    };
  } catch {
    // Fallback for empty or invalid input
    const cwd = process.cwd();
    return {
      sessionId: `session_${Date.now()}`,
      cwd,
      project: getProjectName(cwd),
      timestamp: Date.now(),
    };
  }
}
