/**
 * AgentKits Memory Hooks
 *
 * Lightweight hook system for auto-capturing Claude Code sessions.
 * Direct SQLite access without HTTP worker overhead.
 *
 * @module @agentkits/memory/hooks
 */

// Types
export * from './types.js';

// Service
export { MemoryHookService, createHookService } from './service.js';

// Handlers
export { ContextHook, createContextHook } from './context.js';
export { SessionInitHook, createSessionInitHook } from './session-init.js';
export { ObservationHook, createObservationHook } from './observation.js';
export { SummarizeHook, createSummarizeHook } from './summarize.js';

// Re-export default service
export { default } from './service.js';
