/**
 * Hook Types for AgentKits Memory
 *
 * Lightweight hook system for auto-capturing Claude Code sessions.
 * Project-scoped storage.
 *
 * @module @agentkits/memory/hooks/types
 */

import { createHash } from 'node:crypto';

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

  /** Content hash for deduplication */
  contentHash?: string;

  /** Compressed single-sentence summary (AI-generated) */
  compressedSummary?: string;

  /** Whether raw data has been replaced by compressed summary */
  isCompressed?: boolean;
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
 * Observation intent — what the developer is trying to accomplish.
 * Stored as `intent:<type>` prefixed tags in the concepts array (no schema change).
 */
export type ObservationIntent =
  | 'bugfix'
  | 'feature'
  | 'refactor'
  | 'investigation'
  | 'testing'
  | 'documentation'
  | 'configuration'
  | 'optimization';

/**
 * Detect the developer's intent from tool usage context.
 * Pattern-matches on prompt text, tool name, and tool input.
 * Returns one or more intents (usually 1-2).
 */
export function detectIntent(
  toolName: string,
  toolInput: unknown,
  _toolResponse: unknown,
  prompt?: string
): ObservationIntent[] {
  const intents: Set<ObservationIntent> = new Set();

  // Pattern-match on latest prompt text (strongest signal)
  if (prompt) {
    const p = prompt.toLowerCase();

    // Bugfix signals
    if (/\b(fix|bug|broken|crash|error|issue|wrong|fail|regress|patch|hotfix)\b/.test(p)) {
      intents.add('bugfix');
    }
    // Feature signals
    if (/\b(add|create|implement|new|feature|build|introduce|enable)\b/.test(p)) {
      intents.add('feature');
    }
    // Refactor signals
    if (/\b(refactor|rename|restructure|reorganize|clean\s*up|simplify|extract|move|split|merge|dedup)\b/.test(p)) {
      intents.add('refactor');
    }
    // Testing signals
    if (/\b(test|spec|coverage|assert|expect|mock|stub|vitest|jest|pytest)\b/.test(p)) {
      intents.add('testing');
    }
    // Documentation signals
    if (/\b(doc|readme|comment|jsdoc|typedoc|changelog|annotation)\b/.test(p)) {
      intents.add('documentation');
    }
    // Configuration signals
    if (/\b(config|setting|env|environment|setup|install|dependency|package|deploy)\b/.test(p)) {
      intents.add('configuration');
    }
    // Optimization signals
    if (/\b(optimiz\w*|perf\w*|speed|slow|fast\w*|cach\w*|lazy|memory\s*leak|bundl\w*|minif\w*|compress\w*)\b/.test(p)) {
      intents.add('optimization');
    }
  }

  // Pattern-match on tool name (secondary signal)
  const readTools = ['Read', 'Glob', 'Grep', 'LS'];
  const writeTools = ['Write', 'Edit', 'MultiEdit'];
  const searchTools = ['WebSearch', 'WebFetch'];

  if (readTools.includes(toolName) || searchTools.includes(toolName)) {
    // Reading/searching without other intent → investigation
    if (intents.size === 0) {
      intents.add('investigation');
    }
  }

  // Pattern-match on tool input (tertiary signal)
  try {
    const input = typeof toolInput === 'string' ? JSON.parse(toolInput) : toolInput;

    if (toolName === 'Bash') {
      const cmd = ((input?.command as string) || '').toLowerCase();
      if (/\b(test|vitest|jest|pytest|mocha|tap)\b/.test(cmd)) {
        intents.add('testing');
      }
      if (/\b(build|tsc|webpack|vite|esbuild|rollup)\b/.test(cmd)) {
        if (intents.size === 0) intents.add('feature');
      }
      if (/\b(lint|eslint|prettier|format)\b/.test(cmd)) {
        intents.add('refactor');
      }
    }

    // File path hints
    const filePath = ((input?.file_path || input?.path || '') as string).toLowerCase();
    if (filePath) {
      if (/\.(test|spec)\.(ts|js|tsx|jsx)$/.test(filePath) || filePath.includes('__tests__')) {
        intents.add('testing');
      }
      if (/readme|changelog|\.md$/.test(filePath) && writeTools.includes(toolName)) {
        intents.add('documentation');
      }
      if (/config|\.env|tsconfig|package\.json|\.eslintrc/.test(filePath) && writeTools.includes(toolName)) {
        intents.add('configuration');
      }
    }
  } catch {
    // Ignore parse errors
  }

  // Fallback: if no intent detected, default to investigation
  if (intents.size === 0) {
    intents.add('investigation');
  }

  return Array.from(intents);
}

/**
 * Extract intent tags from a concepts array.
 * Filters concepts starting with 'intent:' and strips the prefix.
 */
export function extractIntents(concepts: string[]): ObservationIntent[] {
  return concepts
    .filter(c => c.startsWith('intent:'))
    .map(c => c.slice(7) as ObservationIntent);
}

// ===== Code Diff Types =====

/**
 * Structured code diff from Edit/MultiEdit operations.
 * Captures before/after snippets for understanding what changed.
 */
/**
 * Change type classification for code diffs
 */
export type DiffChangeType = 'addition' | 'deletion' | 'modification' | 'replacement';

export interface CodeDiff {
  /** File path that was edited */
  file: string;
  /** Code before the change (truncated) */
  before: string;
  /** Code after the change (truncated) */
  after: string;
  /** Net line count change (positive=added, negative=removed) */
  changeLines: number;
  /** Classified change type */
  changeType: DiffChangeType;
}

/**
 * Classify the type of change in a diff
 */
export function classifyChangeType(before: string, after: string): DiffChangeType {
  if (!before.trim() && after.trim()) return 'addition';
  if (before.trim() && !after.trim()) return 'deletion';
  // If structure is similar (same first token), it's a modification; otherwise replacement
  const beforeFirst = before.trim().split(/[\s({\[]/)[0];
  const afterFirst = after.trim().split(/[\s({\[]/)[0];
  if (beforeFirst === afterFirst) return 'modification';
  return 'replacement';
}

/**
 * Extract structured code diffs from Edit/MultiEdit tool input.
 * Returns compact before/after snippets (truncated to 200 chars each).
 * For MultiEdit, captures up to 5 edits.
 */
export function extractCodeDiffs(toolName: string, toolInput: unknown): CodeDiff[] {
  if (toolName !== 'Edit' && toolName !== 'MultiEdit') return [];

  try {
    const input = typeof toolInput === 'string' ? JSON.parse(toolInput) : toolInput;
    const diffs: CodeDiff[] = [];
    const file = (input?.file_path || input?.path || '') as string;

    if (toolName === 'Edit') {
      const oldStr = (input?.old_string || '') as string;
      const newStr = (input?.new_string || '') as string;
      if (oldStr || newStr) {
        diffs.push({
          file,
          before: oldStr.substring(0, 200),
          after: newStr.substring(0, 200),
          changeLines: newStr.split('\n').length - oldStr.split('\n').length,
          changeType: classifyChangeType(oldStr, newStr),
        });
      }
    } else if (toolName === 'MultiEdit') {
      const edits = (input?.edits || []) as Array<{ old_string?: string; new_string?: string }>;
      for (const edit of edits.slice(0, 5)) {
        const oldStr = (edit?.old_string || '') as string;
        const newStr = (edit?.new_string || '') as string;
        if (oldStr || newStr) {
          diffs.push({
            file,
            before: oldStr.substring(0, 200),
            after: newStr.substring(0, 200),
            changeLines: newStr.split('\n').length - oldStr.split('\n').length,
            changeType: classifyChangeType(oldStr, newStr),
          });
        }
      }
    }

    return diffs;
  } catch {
    return [];
  }
}

/**
 * Format a code diff as a compact fact string.
 * Example: `DIFF src/auth.ts: "function auth(user)" → "function auth(user, opts)"`
 */
export function formatDiffFact(diff: CodeDiff): string {
  const fileName = diff.file.split(/[/\\]/).pop() || diff.file;
  const beforeLine = diff.before.split('\n')[0].trim().substring(0, 60);
  const afterLine = diff.after.split('\n')[0].trim().substring(0, 60);
  const tag = diff.changeType !== 'modification' ? ` [${diff.changeType}]` : '';
  return `DIFF ${fileName}${tag}: "${beforeLine}" → "${afterLine}"`;
}

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

  /** Parent session ID for session resume/continuation tracking */
  parentSessionId?: string;
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

  /** Content hash for deduplication */
  contentHash?: string;
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

  /** Decision rationale — why key changes were made */
  decisions: string[];

  /** Errors encountered during session */
  errors: string[];

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

// ===== Export/Import Types =====

/**
 * Export data format
 */
export interface ExportData {
  version: string;
  exportedAt: number;
  project: string;
  sessions: ExportSession[];
}

/**
 * Exported session with all related data
 */
export interface ExportSession {
  sessionId: string;
  project: string;
  prompt: string;
  startedAt: number;
  endedAt?: number;
  status: string;
  parentSessionId?: string;
  observations: ExportObservation[];
  prompts: ExportPrompt[];
  summary?: ExportSummary;
}

/**
 * Exported observation
 */
export interface ExportObservation {
  id: string;
  toolName: string;
  timestamp: number;
  type: string;
  title?: string;
  subtitle?: string;
  narrative?: string;
  facts: string[];
  concepts: string[];
  contentHash?: string;
  compressedSummary?: string;
  isCompressed: boolean;
}

/**
 * Exported user prompt
 */
export interface ExportPrompt {
  promptNumber: number;
  promptText: string;
  createdAt: number;
  contentHash?: string;
}

/**
 * Exported session summary
 */
export interface ExportSummary {
  request: string;
  completed: string;
  filesRead: string[];
  filesModified: string[];
  nextSteps: string;
  notes: string;
  decisions: string[];
  errors: string[];
}

/**
 * Import result
 */
export interface ImportResult {
  imported: { sessions: number; observations: number; prompts: number };
  skipped: { observations: number; prompts: number };
}

// ===== Utility Functions =====

/**
 * Context configuration for controlling what gets injected
 */
export interface ContextConfig {
  showSummaries: boolean;
  showPrompts: boolean;
  showObservations: boolean;
  showToolGuidance: boolean;
  maxSummaries: number;
  maxPrompts: number;
  maxObservations: number;
}

/**
 * Lifecycle configuration for memory decay/archival
 */
export interface LifecycleConfig {
  /** Auto-compress old observations */
  autoCompress: boolean;
  /** Days after which to compress observations */
  compressAfterDays: number;
  /** Auto-archive old sessions */
  autoArchive: boolean;
  /** Days after which to archive sessions */
  archiveAfterDays: number;
  /** Auto-delete archived sessions (opt-in, disabled by default) */
  autoDelete: boolean;
  /** Days after which to delete archived sessions */
  deleteAfterDays: number;
  /** Auto-vacuum after deletes */
  autoVacuum: boolean;
}

/** Default lifecycle configuration */
export const DEFAULT_LIFECYCLE_CONFIG: LifecycleConfig = {
  autoCompress: true,
  compressAfterDays: 7,
  autoArchive: true,
  archiveAfterDays: 30,
  autoDelete: false, // opt-in: destructive
  deleteAfterDays: 90,
  autoVacuum: true,
};

/**
 * Lifecycle task results
 */
export interface LifecycleResult {
  compressed: number;
  archived: number;
  deleted: number;
  vacuumed: boolean;
}

/**
 * Lifecycle statistics
 */
export interface LifecycleStats {
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  archivedSessions: number;
  totalObservations: number;
  compressedObservations: number;
  uncompressedObservations: number;
  totalPrompts: number;
  dbSizeBytes: number;
}

/** Default context configuration */
export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  showSummaries: true,
  showPrompts: true,
  showObservations: true,
  showToolGuidance: true,
  maxSummaries: 3,
  maxPrompts: 10,
  maxObservations: 10,
};

/**
 * Persistent memory settings stored in .claude/memory/settings.json
 */
export interface MemorySettings {
  /** Context injection configuration */
  context: ContextConfig;
  /** AI provider configuration (for enrichment/compression) */
  aiProvider?: import('./ai-provider.js').AIProviderConfig;
}

/** Default memory settings */
export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  context: DEFAULT_CONTEXT_CONFIG,
};

/**
 * Generate observation ID
 */
export function generateObservationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `obs_${timestamp}_${random}`;
}

/**
 * Compute content hash for deduplication.
 * Uses SHA-256 truncated to 16 hex chars (64 bits) — sufficient for dedup.
 * Computation: ~0.01ms.
 */
export function computeContentHash(...parts: string[]): string {
  const hash = createHash('sha256');
  for (const part of parts) {
    hash.update(part);
  }
  return hash.digest('hex').substring(0, 16);
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
        const diffs = extractCodeDiffs(toolName, toolInput);
        if (diffs.length > 0) {
          const diffDescs = diffs.map(d => {
            const bLine = d.before.split('\n')[0].trim().substring(0, 50);
            const aLine = d.after.split('\n')[0].trim().substring(0, 50);
            return `"${bLine}" → "${aLine}"`;
          });
          return `Edited ${filePath || 'a file'}: ${diffDescs.join('; ')}.`;
        }
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
      case 'MultiEdit': {
        if (filePath) facts.push(`File modified: ${filePath}`);
        // Extract structured code diffs
        const diffs = extractCodeDiffs(toolName, toolInput);
        for (const diff of diffs) {
          facts.push(formatDiffFact(diff));
        }
        if (diffs.length === 0 && input?.old_string) {
          facts.push(`Code replaced in ${filePath.split(/[/\\]/).pop() || 'file'}`);
        }
        break;
      }
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

    // Extract function/class names from Edit/MultiEdit for code-specific searchability
    if (toolName === 'Edit' || toolName === 'MultiEdit') {
      const oldStr = (input?.old_string || '') as string;
      const newStr = (input?.new_string || '') as string;
      const combined = oldStr + '\n' + newStr;

      // Extract function names
      const funcMatches = combined.match(/(?:function|async function|const|let|var)\s+(\w{3,})/g);
      if (funcMatches) {
        for (const m of funcMatches.slice(0, 3)) {
          const name = m.replace(/(?:function|async function|const|let|var)\s+/, '');
          concepts.add(`fn:${name}`);
        }
      }

      // Extract class names
      const classMatches = combined.match(/class\s+(\w{3,})/g);
      if (classMatches) {
        for (const m of classMatches.slice(0, 2)) {
          concepts.add(`class:${m.replace('class ', '')}`);
        }
      }

      // Extract patterns: import, export, interface, type, enum
      if (/\bimport\b/.test(combined)) concepts.add('pattern:import');
      if (/\bexport\b/.test(combined)) concepts.add('pattern:export');
      if (/\binterface\b/.test(combined)) concepts.add('pattern:interface');
      if (/\benum\b/.test(combined)) concepts.add('pattern:enum');
      if (/\btry\s*\{/.test(combined)) concepts.add('pattern:error-handling');
      if (/\basync\b/.test(combined)) concepts.add('pattern:async');
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
