/**
 * Memory Migration Utility for AgentKits
 *
 * Migrates existing .claude/memory/*.md files to SQLite database.
 * Preserves all content and metadata from markdown frontmatter.
 *
 * @module @agentkits/memory/migration
 */

import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  MigrationConfig,
  MigrationProgress,
  MigrationResult,
  MigrationError,
  MigrationSource,
  MemoryEntry,
  MemoryType,
  MemoryEntryInput,
  EmbeddingGenerator,
  createDefaultEntry,
  DEFAULT_NAMESPACES,
  NAMESPACE_TYPE_MAP,
} from './types.js';

/**
 * Default migration configuration
 */
const DEFAULT_MIGRATION_CONFIG: Partial<MigrationConfig> = {
  batchSize: 50,
  generateEmbeddings: false, // Default false for speed
  validateData: true,
  continueOnError: true,
};

/**
 * Parsed markdown file structure
 */
interface ParsedMarkdown {
  frontmatter: Record<string, unknown>;
  content: string;
  sections: Array<{
    title: string;
    level: number;
    content: string;
  }>;
}

/**
 * Memory Migration Manager for AgentKits
 *
 * Handles migration from:
 * - Markdown files (.claude/memory/*.md)
 * - JSON exports
 * - Other SQLite databases
 */
export class MemoryMigrator extends EventEmitter {
  private config: MigrationConfig;
  private embeddingGenerator?: EmbeddingGenerator;
  private progress: MigrationProgress;
  private storeFunction: (entry: MemoryEntry) => Promise<void>;

  constructor(
    storeFunction: (entry: MemoryEntry) => Promise<void>,
    config: Partial<MigrationConfig>,
    embeddingGenerator?: EmbeddingGenerator
  ) {
    super();
    this.storeFunction = storeFunction;
    this.config = { ...DEFAULT_MIGRATION_CONFIG, ...config } as MigrationConfig;
    this.embeddingGenerator = embeddingGenerator;
    this.progress = this.initializeProgress();
  }

  /**
   * Run the migration
   */
  async migrate(): Promise<MigrationResult> {
    const startTime = Date.now();
    this.progress = this.initializeProgress();

    this.emit('migration:started', { source: this.config.source });

    try {
      // Load entries from source
      const entries = await this.loadFromSource();
      this.progress.total = entries.length;

      this.emit('migration:progress', { ...this.progress });

      // Process entries
      for (const entry of entries) {
        try {
          // Validate if enabled
          if (this.config.validateData) {
            const validation = this.validateEntry(entry);
            if (!validation.valid) {
              if (this.config.continueOnError) {
                this.addError(
                  entry.key,
                  validation.reason || 'Validation failed',
                  'VALIDATION_ERROR',
                  false
                );
                this.progress.skipped++;
                continue;
              } else {
                throw new Error(validation.reason);
              }
            }
          }

          // Store entry
          await this.storeFunction(entry);
          this.progress.migrated++;

          this.progress.percentage = Math.round(
            (this.progress.migrated / this.progress.total) * 100
          );

          this.emit('migration:progress', { ...this.progress });
        } catch (error) {
          if (this.config.continueOnError) {
            this.addError(
              entry.key,
              (error as Error).message,
              'STORE_ERROR',
              true
            );
            this.progress.failed++;
          } else {
            throw error;
          }
        }
      }

      const duration = Date.now() - startTime;

      const result: MigrationResult = {
        success: this.progress.failed === 0 || this.config.continueOnError,
        progress: { ...this.progress },
        duration,
        summary: this.generateSummary(),
      };

      this.emit('migration:completed', result);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      const result: MigrationResult = {
        success: false,
        progress: { ...this.progress },
        duration,
        summary: `Migration failed: ${(error as Error).message}`,
      };

      this.emit('migration:failed', { error, result });
      return result;
    }
  }

  /**
   * Get current migration progress
   */
  getProgress(): MigrationProgress {
    return { ...this.progress };
  }

  // ===== Source Loaders =====

  private async loadFromSource(): Promise<MemoryEntry[]> {
    switch (this.config.source) {
      case 'markdown':
        return this.loadFromMarkdown();
      case 'json':
        return this.loadFromJSON();
      case 'sqlite':
        return this.loadFromSQLite();
      default:
        throw new Error(`Unknown migration source: ${this.config.source}`);
    }
  }

  /**
   * Load entries from .claude/memory/*.md files
   */
  private async loadFromMarkdown(): Promise<MemoryEntry[]> {
    const entries: MemoryEntry[] = [];
    const basePath = this.config.sourcePath;

    try {
      const files = await this.getMarkdownFiles(basePath);

      for (const filePath of files) {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const parsed = this.parseMarkdownFile(content);
          const fileEntries = await this.markdownToEntries(filePath, parsed, basePath);
          entries.push(...fileEntries);
        } catch (error) {
          this.addError(filePath, (error as Error).message, 'PARSE_ERROR', true);
        }
      }

      return entries;
    } catch (error) {
      throw new Error(`Failed to load Markdown: ${(error as Error).message}`);
    }
  }

  /**
   * Get all markdown files in directory
   */
  private async getMarkdownFiles(dir: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isFile() && entry.name.endsWith('.md')) {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist
    }

    return files;
  }

  /**
   * Parse a markdown file with frontmatter and sections
   */
  private parseMarkdownFile(content: string): ParsedMarkdown {
    const result: ParsedMarkdown = {
      frontmatter: {},
      content: content,
      sections: [],
    };

    // Extract frontmatter if present
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (frontmatterMatch) {
      const frontmatterText = frontmatterMatch[1];
      result.content = frontmatterMatch[2];

      // Parse YAML-like frontmatter
      for (const line of frontmatterText.split('\n')) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim();
          let value: unknown = line.substring(colonIndex + 1).trim();

          // Parse common types
          if (value === 'true') value = true;
          else if (value === 'false') value = false;
          else if (typeof value === 'string' && /^\d+$/.test(value)) value = parseInt(value, 10);
          else if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
            try {
              value = JSON.parse(value.replace(/'/g, '"'));
            } catch {
              // Keep as string
            }
          }

          result.frontmatter[key] = value;
        }
      }
    }

    // Parse sections (## headers)
    const sectionRegex = /^(#{1,6})\s+(.+)$/gm;
    let lastIndex = 0;
    let match;
    const sections: Array<{ title: string; level: number; startIndex: number }> = [];

    while ((match = sectionRegex.exec(result.content)) !== null) {
      sections.push({
        title: match[2],
        level: match[1].length,
        startIndex: match.index,
      });
    }

    // Extract section content
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const nextSection = sections[i + 1];
      const endIndex = nextSection ? nextSection.startIndex : result.content.length;
      const sectionContent = result.content
        .substring(section.startIndex, endIndex)
        .replace(/^#{1,6}\s+.+\n/, '') // Remove header line
        .trim();

      result.sections.push({
        title: section.title,
        level: section.level,
        content: sectionContent,
      });
    }

    return result;
  }

  /**
   * Convert parsed markdown to memory entries
   */
  private async markdownToEntries(
    filePath: string,
    parsed: ParsedMarkdown,
    basePath: string
  ): Promise<MemoryEntry[]> {
    const entries: MemoryEntry[] = [];

    // Derive namespace from filename (e.g., 'active-context.md' -> 'active-context')
    const filename = path.basename(filePath, '.md');
    const namespace = this.mapFilenameToNamespace(filename);
    const type = NAMESPACE_TYPE_MAP[namespace] || 'semantic';

    // Create main entry for the file
    const mainEntry = createDefaultEntry({
      key: filename,
      content: parsed.content.trim(),
      type,
      namespace,
      tags: Array.isArray(parsed.frontmatter.tags)
        ? parsed.frontmatter.tags as string[]
        : [],
      metadata: {
        ...parsed.frontmatter,
        sourceFile: filePath,
        migratedAt: Date.now(),
      },
    });

    // Generate embedding if enabled
    if (this.config.generateEmbeddings && this.embeddingGenerator && parsed.content.trim()) {
      try {
        mainEntry.embedding = await this.embeddingGenerator(parsed.content.trim());
      } catch (error) {
        this.emit('migration:warning', {
          message: `Failed to generate embedding for ${filename}: ${(error as Error).message}`,
        });
      }
    }

    entries.push(mainEntry);

    // Optionally create entries for each section
    for (const section of parsed.sections) {
      if (section.content.length > 100) { // Only create entries for substantial sections
        const sectionKey = `${filename}:${this.slugify(section.title)}`;
        const sectionEntry = createDefaultEntry({
          key: sectionKey,
          content: section.content,
          type,
          namespace,
          tags: ['section', `level-${section.level}`],
          metadata: {
            parentKey: filename,
            sectionTitle: section.title,
            sectionLevel: section.level,
            sourceFile: filePath,
          },
          references: [mainEntry.id],
        });

        // Generate embedding for section if enabled
        if (this.config.generateEmbeddings && this.embeddingGenerator) {
          try {
            sectionEntry.embedding = await this.embeddingGenerator(section.content);
          } catch {
            // Skip embedding for this section
          }
        }

        entries.push(sectionEntry);
      }
    }

    return entries;
  }

  /**
   * Map filename to standard namespace
   */
  private mapFilenameToNamespace(filename: string): string {
    const mapping: Record<string, string> = {
      'project-context': DEFAULT_NAMESPACES.CONTEXT,
      'active-context': DEFAULT_NAMESPACES.ACTIVE,
      'session-state': DEFAULT_NAMESPACES.SESSION,
      'progress': DEFAULT_NAMESPACES.PROGRESS,
      'patterns': DEFAULT_NAMESPACES.PATTERNS,
      'decisions': DEFAULT_NAMESPACES.DECISIONS,
      'errors': DEFAULT_NAMESPACES.ERRORS,
    };

    return mapping[filename] || filename;
  }

  /**
   * Load entries from JSON file
   */
  private async loadFromJSON(): Promise<MemoryEntry[]> {
    const filePath = this.config.sourcePath;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      // Handle different JSON formats
      if (Array.isArray(data)) {
        return data.map((item) => this.jsonItemToEntry(item));
      } else if (data.entries && Array.isArray(data.entries)) {
        return data.entries.map((item: unknown) => this.jsonItemToEntry(item));
      } else if (typeof data === 'object') {
        // Assume it's a namespace -> entries map
        const entries: MemoryEntry[] = [];
        for (const [namespace, namespaceEntries] of Object.entries(data)) {
          if (Array.isArray(namespaceEntries)) {
            for (const item of namespaceEntries) {
              entries.push(this.jsonItemToEntry({ ...item, namespace }));
            }
          }
        }
        return entries;
      }

      return [];
    } catch (error) {
      throw new Error(`Failed to load JSON: ${(error as Error).message}`);
    }
  }

  /**
   * Convert JSON item to MemoryEntry
   */
  private jsonItemToEntry(item: any): MemoryEntry {
    return createDefaultEntry({
      key: item.key || item.id || `entry_${Date.now()}`,
      content: typeof item.content === 'string'
        ? item.content
        : typeof item.value === 'string'
          ? item.value
          : JSON.stringify(item.value || item.content || item),
      type: item.type || 'semantic',
      namespace: item.namespace || 'default',
      tags: item.tags || [],
      metadata: item.metadata || {},
    });
  }

  /**
   * Load entries from existing SQLite database
   */
  private async loadFromSQLite(): Promise<MemoryEntry[]> {
    // Would need sql.js to read existing database
    // For now, return empty and log warning
    this.emit('migration:warning', {
      message: 'SQLite migration requires sql.js to be loaded. Use JSON export instead.',
    });
    return [];
  }

  // ===== Helper Methods =====

  private initializeProgress(): MigrationProgress {
    return {
      total: 0,
      migrated: 0,
      failed: 0,
      skipped: 0,
      percentage: 0,
      errors: [],
    };
  }

  private validateEntry(entry: MemoryEntry): { valid: boolean; reason?: string } {
    if (!entry.key || typeof entry.key !== 'string') {
      return { valid: false, reason: 'Missing or invalid key' };
    }

    if (!entry.content || typeof entry.content !== 'string') {
      return { valid: false, reason: 'Missing or invalid content' };
    }

    if (entry.key.length > 500) {
      return { valid: false, reason: 'Key too long (max 500 chars)' };
    }

    return { valid: true };
  }

  private addError(
    entryId: string,
    message: string,
    code: string,
    recoverable: boolean
  ): void {
    const error: MigrationError = {
      entryId,
      message,
      code,
      recoverable,
    };
    this.progress.errors.push(error);
    this.emit('migration:error', error);
  }

  private generateSummary(): string {
    const { migrated, failed, skipped, total, errors } = this.progress;

    let summary = `Migrated ${migrated}/${total} entries`;

    if (failed > 0) {
      summary += `, ${failed} failed`;
    }

    if (skipped > 0) {
      summary += `, ${skipped} skipped`;
    }

    if (errors.length > 0) {
      const errorTypes = new Map<string, number>();
      for (const error of errors) {
        errorTypes.set(error.code, (errorTypes.get(error.code) || 0) + 1);
      }

      const errorSummary = Array.from(errorTypes.entries())
        .map(([code, count]) => `${code}: ${count}`)
        .join(', ');

      summary += `. Errors: ${errorSummary}`;
    }

    return summary;
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}

/**
 * Convenience function to migrate markdown files
 */
export async function migrateMarkdownMemory(
  memoryDir: string,
  storeFunction: (entry: MemoryEntry) => Promise<void>,
  options: Partial<MigrationConfig> = {}
): Promise<MigrationResult> {
  const migrator = new MemoryMigrator(
    storeFunction,
    {
      source: 'markdown',
      sourcePath: memoryDir,
      ...options,
    }
  );

  return migrator.migrate();
}

export default MemoryMigrator;
