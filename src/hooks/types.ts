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

  /** Which prompt number this observation belongs to */
  promptNumber?: number;

  /** Files read in this observation (auto-extracted) */
  filesRead?: string[];

  /** Files modified in this observation (auto-extracted) */
  filesModified?: string[];

  /** Brief subtitle describing the action context */
  subtitle?: string;

  /** Narrative explanation of what happened */
  narrative?: string;

  /** Extracted facts from the observation */
  facts?: string[];

  /** Extracted concepts/topics */
  concepts?: string[];
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

/**
 * User prompt record - tracks ALL prompts in a session
 */
export interface UserPrompt {
  /** Database ID */
  id: number;

  /** Claude's session ID */
  sessionId: string;

  /** Prompt number within session (1, 2, 3...) */
  promptNumber: number;

  /** User's prompt text */
  promptText: string;

  /** Timestamp */
  createdAt: number;
}

/**
 * Structured session summary
 */
export interface SessionSummary {
  /** Database ID */
  id: number;

  /** Claude's session ID */
  sessionId: string;

  /** Project name */
  project: string;

  /** What user requested */
  request: string;

  /** What was completed */
  completed: string;

  /** Files read during session */
  filesRead: string[];

  /** Files modified during session */
  filesModified: string[];

  /** Remaining work / next steps */
  nextSteps: string;

  /** Additional notes */
  notes: string;

  /** Which prompt triggered this summary */
  promptNumber: number;

  /** Timestamp */
  createdAt: number;
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

  /** User prompts from recent sessions */
  userPrompts: UserPrompt[];

  /** Structured session summaries */
  sessionSummaries: SessionSummary[];

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
  const writeTools = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];
  const executeTools = ['Bash', 'Task', 'Skill'];
  const searchTools = ['WebSearch', 'WebFetch'];

  if (readTools.includes(toolName)) return 'read';
  if (writeTools.includes(toolName)) return 'write';
  if (executeTools.includes(toolName)) return 'execute';
  if (searchTools.includes(toolName)) return 'search';
  return 'other';
}

/**
 * Extract file paths from tool input, classified as read or modified
 */
export function extractFilePaths(toolName: string, toolInput: unknown): { filesRead: string[]; filesModified: string[] } {
  const filesRead: string[] = [];
  const filesModified: string[] = [];

  try {
    const input = typeof toolInput === 'string' ? JSON.parse(toolInput) : toolInput;
    const filePath = input?.file_path || input?.path || '';

    if (!filePath) return { filesRead, filesModified };

    const type = getObservationType(toolName);
    if (type === 'write') {
      filesModified.push(filePath);
    } else if (type === 'read') {
      filesRead.push(filePath);
    }
  } catch {
    // Ignore parse errors
  }

  return { filesRead, filesModified };
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
      case 'MultiEdit':
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
 * Generate observation subtitle from tool usage context
 */
export function generateObservationSubtitle(toolName: string, toolInput: unknown, _toolResponse?: unknown): string {
  try {
    const input = typeof toolInput === 'string' ? JSON.parse(toolInput) : toolInput;
    const filePath = input?.file_path || input?.path || '';
    const fileName = filePath ? filePath.split(/[/\\]/).pop() : '';

    switch (toolName) {
      case 'Read':
        return fileName ? `Examining ${fileName}` : 'Reading file contents';
      case 'Write':
        return fileName ? `Creating/updating ${fileName}` : 'Writing file';
      case 'Edit':
      case 'MultiEdit':
        return fileName ? `Modifying ${fileName}` : 'Editing file';
      case 'Bash': {
        const cmd = (input?.command || '').split(/\s+/)[0];
        const cmdMap: Record<string, string> = {
          npm: 'Running npm command', node: 'Running Node.js', git: 'Git operation',
          cd: 'Changing directory', ls: 'Listing files', mkdir: 'Creating directory',
          rm: 'Removing files', cp: 'Copying files', mv: 'Moving files',
          docker: 'Docker operation', python: 'Running Python', cargo: 'Cargo operation',
        };
        return cmdMap[cmd] || `Executing ${cmd || 'command'}`;
      }
      case 'Glob':
        return `Searching for ${input?.pattern || 'files'} pattern`;
      case 'Grep':
        return `Searching code for "${input?.pattern || 'pattern'}"`;
      case 'Task':
        return `Delegating to ${input?.subagent_type || 'sub-agent'}`;
      case 'WebSearch':
        return `Researching: ${(input?.query || '').substring(0, 60)}`;
      case 'WebFetch':
        return `Fetching web content`;
      default:
        return `Using ${toolName} tool`;
    }
  } catch {
    return `Using ${toolName}`;
  }
}

/**
 * Generate observation narrative from tool usage
 */
export function generateObservationNarrative(
  toolName: string, toolInput: unknown, _toolResponse?: unknown
): string {
  try {
    const input = typeof toolInput === 'string' ? JSON.parse(toolInput) : toolInput;
    const filePath = input?.file_path || input?.path || '';

    switch (toolName) {
      case 'Read':
        return `Read the contents of ${filePath || 'a file'} to understand the existing code structure.`;
      case 'Write':
        return `Wrote ${filePath || 'a file'} with new or updated content.`;
      case 'Edit':
      case 'MultiEdit': {
        const oldStr = input?.old_string ? `"${input.old_string.substring(0, 40)}..."` : 'code';
        return `Edited ${filePath || 'a file'}, replacing ${oldStr} with updated content.`;
      }
      case 'Bash': {
        const cmd = input?.command || '';
        if (cmd.startsWith('npm test') || cmd.startsWith('npx vitest'))
          return `Ran tests to verify changes: \`${cmd.substring(0, 80)}\`.`;
        if (cmd.startsWith('npm run build') || cmd.startsWith('tsc'))
          return `Built the project to check for compilation errors.`;
        if (cmd.startsWith('git '))
          return `Performed git operation: \`${cmd.substring(0, 80)}\`.`;
        return `Executed command: \`${cmd.substring(0, 80)}\`.`;
      }
      case 'Glob':
        return `Searched the filesystem for files matching pattern "${input?.pattern || ''}".`;
      case 'Grep':
        return `Searched code for pattern "${input?.pattern || ''}"${input?.path ? ` in ${input.path}` : ''}.`;
      case 'Task':
        return `Delegated work to a ${input?.subagent_type || 'sub'}-agent: ${input?.description || 'task'}.`;
      case 'WebSearch':
        return `Searched the web for: ${input?.query || 'information'}.`;
      case 'WebFetch':
        return `Fetched content from ${input?.url || 'a URL'}.`;
      default:
        return `Used ${toolName} tool.`;
    }
  } catch {
    return `Used ${toolName} tool.`;
  }
}

/**
 * Extract facts from tool input/response
 */
export function extractFacts(toolName: string, toolInput: unknown, toolResponse: unknown): string[] {
  const facts: string[] = [];

  try {
    const input = typeof toolInput === 'string' ? JSON.parse(toolInput) : toolInput;
    const response = typeof toolResponse === 'string' ? JSON.parse(toolResponse) : toolResponse;
    const filePath = input?.file_path || input?.path || '';

    switch (toolName) {
      case 'Read':
        if (filePath) facts.push(`File read: ${filePath}`);
        break;
      case 'Write':
        if (filePath) facts.push(`File created/updated: ${filePath}`);
        break;
      case 'Edit':
      case 'MultiEdit':
        if (filePath) facts.push(`File modified: ${filePath}`);
        if (input?.old_string) facts.push(`Code replaced in ${filePath.split(/[/\\]/).pop() || 'file'}`);
        break;
      case 'Bash': {
        const cmd = input?.command || '';
        facts.push(`Command executed: ${cmd.substring(0, 100)}`);
        // Extract test results
        const stdout = response?.stdout || response?.output || '';
        if (typeof stdout === 'string') {
          if (stdout.includes('passed') || stdout.includes('✓')) facts.push('Tests passed');
          if (stdout.includes('failed') || stdout.includes('✗')) facts.push('Tests failed');
          if (stdout.includes('error') || stdout.includes('Error')) facts.push('Errors encountered');
        }
        break;
      }
      case 'Glob':
        if (input?.pattern) facts.push(`Pattern searched: ${input.pattern}`);
        break;
      case 'Grep':
        if (input?.pattern) facts.push(`Code pattern searched: ${input.pattern}`);
        if (input?.path) facts.push(`Search scope: ${input.path}`);
        break;
      case 'WebSearch':
        if (input?.query) facts.push(`Web search: ${input.query}`);
        break;
      case 'WebFetch':
        if (input?.url) facts.push(`URL fetched: ${input.url}`);
        break;
      case 'Task':
        if (input?.description) facts.push(`Sub-task: ${input.description}`);
        if (input?.subagent_type) facts.push(`Agent type: ${input.subagent_type}`);
        break;
    }
  } catch {
    // Ignore parse errors
  }

  return facts;
}

/**
 * Extract concepts/topics from tool usage
 */
export function extractConcepts(toolName: string, toolInput: unknown, _toolResponse?: unknown): string[] {
  const concepts: Set<string> = new Set();

  try {
    const input = typeof toolInput === 'string' ? JSON.parse(toolInput) : toolInput;
    const filePath = (input?.file_path || input?.path || '') as string;

    // Extract concepts from file paths
    if (filePath) {
      // Directory-based concepts
      const parts = filePath.split(/[/\\]/);
      for (const part of parts) {
        if (['src', 'lib', 'dist', 'node_modules', '.', '..'].includes(part)) continue;
        if (part.includes('.')) {
          // File extension concepts
          const ext = part.split('.').pop();
          const extMap: Record<string, string> = {
            ts: 'typescript', tsx: 'react', js: 'javascript', jsx: 'react',
            py: 'python', rs: 'rust', go: 'golang', css: 'styling', scss: 'styling',
            html: 'html', json: 'configuration', yaml: 'configuration', yml: 'configuration',
            md: 'documentation', test: 'testing', spec: 'testing', sql: 'database',
          };
          if (ext && extMap[ext]) concepts.add(extMap[ext]);
        }
        // Directory-based concepts
        const dirMap: Record<string, string> = {
          tests: 'testing', __tests__: 'testing', test: 'testing', spec: 'testing',
          hooks: 'hooks', api: 'api', auth: 'authentication', db: 'database',
          components: 'components', pages: 'pages', routes: 'routing', utils: 'utilities',
          services: 'services', middleware: 'middleware', models: 'models', types: 'types',
          cli: 'cli', config: 'configuration', migrations: 'database', schemas: 'schemas',
        };
        if (dirMap[part]) concepts.add(dirMap[part]);
      }
    }

    // Tool-based concepts
    switch (toolName) {
      case 'Bash': {
        const cmd = (input?.command || '') as string;
        if (cmd.includes('test') || cmd.includes('vitest') || cmd.includes('jest')) concepts.add('testing');
        if (cmd.includes('build') || cmd.includes('tsc')) concepts.add('build');
        if (cmd.includes('git')) concepts.add('version-control');
        if (cmd.includes('npm') || cmd.includes('yarn') || cmd.includes('pnpm')) concepts.add('package-management');
        if (cmd.includes('docker')) concepts.add('containerization');
        if (cmd.includes('lint') || cmd.includes('eslint')) concepts.add('linting');
        break;
      }
      case 'WebSearch':
        concepts.add('research');
        break;
      case 'WebFetch':
        concepts.add('web-content');
        break;
      case 'Task':
        concepts.add('delegation');
        if (input?.subagent_type) concepts.add(input.subagent_type as string);
        break;
    }
  } catch {
    // Ignore parse errors
  }

  return Array.from(concepts);
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
