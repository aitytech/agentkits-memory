/**
 * MCP Server Tests
 *
 * Tests for the Memory MCP Server tools.
 *
 * @module @agentkits/memory/mcp/__tests__/server.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProjectMemoryService, DEFAULT_NAMESPACES } from '../../index.js';
import { MEMORY_TOOLS } from '../tools.js';
import type {
  MemorySaveArgs,
  MemorySearchArgs,
  MemoryRecallArgs,
  MemoryListArgs,
  MemoryTimelineArgs,
  MemoryDetailsArgs,
} from '../types.js';

// Mock ProjectMemoryService for isolated testing
vi.mock('../../index.js', async () => {
  const actual = await vi.importActual('../../index.js');
  return {
    ...actual,
    ProjectMemoryService: vi.fn(),
  };
});

describe('MCP Server', () => {
  describe('MEMORY_TOOLS', () => {
    it('should export all required tools', () => {
      const toolNames = MEMORY_TOOLS.map(t => t.name);

      expect(toolNames).toContain('memory_save');
      expect(toolNames).toContain('memory_search');
      expect(toolNames).toContain('memory_timeline');
      expect(toolNames).toContain('memory_details');
      expect(toolNames).toContain('memory_recall');
      expect(toolNames).toContain('memory_list');
      expect(toolNames).toContain('memory_status');
    });

    it('should have valid input schemas for all tools', () => {
      for (const tool of MEMORY_TOOLS) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
      }
    });

    describe('memory_save tool', () => {
      const saveTool = MEMORY_TOOLS.find(t => t.name === 'memory_save')!;

      it('should require content parameter', () => {
        expect(saveTool.inputSchema.required).toContain('content');
      });

      it('should have valid category enum', () => {
        const categoryProp = saveTool.inputSchema.properties.category;
        expect(categoryProp.enum).toEqual(['decision', 'pattern', 'error', 'context', 'observation']);
      });

      it('should have valid importance enum', () => {
        const importanceProp = saveTool.inputSchema.properties.importance;
        expect(importanceProp.enum).toEqual(['low', 'medium', 'high', 'critical']);
      });
    });

    describe('memory_search tool (Progressive Disclosure Layer 1)', () => {
      const searchTool = MEMORY_TOOLS.find(t => t.name === 'memory_search')!;

      it('should require query parameter', () => {
        expect(searchTool.inputSchema.required).toContain('query');
      });

      it('should have category filter option', () => {
        expect(searchTool.inputSchema.properties.category).toBeDefined();
      });

      it('should have limit option', () => {
        expect(searchTool.inputSchema.properties.limit).toBeDefined();
      });

      it('should describe progressive disclosure workflow in description', () => {
        expect(searchTool.description).toContain('Step 1/3');
        expect(searchTool.description).toContain('memory_timeline');
        expect(searchTool.description).toContain('memory_details');
      });
    });

    describe('memory_timeline tool (Progressive Disclosure Layer 2)', () => {
      const timelineTool = MEMORY_TOOLS.find(t => t.name === 'memory_timeline')!;

      it('should require anchor parameter', () => {
        expect(timelineTool.inputSchema.required).toContain('anchor');
      });

      it('should have before and after options', () => {
        expect(timelineTool.inputSchema.properties.before).toBeDefined();
        expect(timelineTool.inputSchema.properties.after).toBeDefined();
      });

      it('should describe as Step 2/3', () => {
        expect(timelineTool.description).toContain('Step 2/3');
      });
    });

    describe('memory_details tool (Progressive Disclosure Layer 3)', () => {
      const detailsTool = MEMORY_TOOLS.find(t => t.name === 'memory_details')!;

      it('should require ids parameter', () => {
        expect(detailsTool.inputSchema.required).toContain('ids');
      });

      it('should have ids as array type', () => {
        const idsProp = detailsTool.inputSchema.properties.ids;
        expect(idsProp.type).toBe('array');
        expect(idsProp.items).toEqual({ type: 'string' });
      });

      it('should describe as Step 3/3', () => {
        expect(detailsTool.description).toContain('Step 3/3');
      });
    });

    describe('memory_recall tool', () => {
      const recallTool = MEMORY_TOOLS.find(t => t.name === 'memory_recall')!;

      it('should require topic parameter', () => {
        expect(recallTool.inputSchema.required).toContain('topic');
      });

      it('should have valid timeRange enum', () => {
        const timeRangeProp = recallTool.inputSchema.properties.timeRange;
        expect(timeRangeProp.enum).toEqual(['today', 'week', 'month', 'all']);
      });
    });

    describe('memory_list tool', () => {
      const listTool = MEMORY_TOOLS.find(t => t.name === 'memory_list')!;

      it('should have optional category filter', () => {
        expect(listTool.inputSchema.properties.category).toBeDefined();
        // required is undefined or doesn't contain 'category'
        const required = listTool.inputSchema.required || [];
        expect(required).not.toContain('category');
      });

      it('should have optional limit parameter', () => {
        expect(listTool.inputSchema.properties.limit).toBeDefined();
      });
    });

    describe('memory_status tool', () => {
      const statusTool = MEMORY_TOOLS.find(t => t.name === 'memory_status')!;

      it('should have no required parameters', () => {
        expect(statusTool.inputSchema.required).toBeUndefined();
      });

      it('should have empty properties', () => {
        expect(Object.keys(statusTool.inputSchema.properties)).toHaveLength(0);
      });
    });
  });

  describe('Tool Argument Types', () => {
    it('MemorySaveArgs should accept valid arguments', () => {
      const args: MemorySaveArgs = {
        content: 'Test content',
        category: 'pattern',
        tags: 'tag1,tag2',
        importance: 'high',
      };

      expect(args.content).toBe('Test content');
      expect(args.category).toBe('pattern');
      expect(args.tags).toBe('tag1,tag2');
      expect(args.importance).toBe('high');
    });

    it('MemorySaveArgs should work with minimal arguments', () => {
      const args: MemorySaveArgs = {
        content: 'Minimal content',
      };

      expect(args.content).toBe('Minimal content');
      expect(args.category).toBeUndefined();
      expect(args.tags).toBeUndefined();
      expect(args.importance).toBeUndefined();
    });

    it('MemorySearchArgs should accept valid arguments', () => {
      const args: MemorySearchArgs = {
        query: 'search term',
        limit: 10,
        category: 'decision',
      };

      expect(args.query).toBe('search term');
      expect(args.limit).toBe(10);
      expect(args.category).toBe('decision');
    });

    it('MemoryRecallArgs should accept valid arguments', () => {
      const args: MemoryRecallArgs = {
        topic: 'authentication',
        timeRange: 'week',
      };

      expect(args.topic).toBe('authentication');
      expect(args.timeRange).toBe('week');
    });

    it('MemoryListArgs should accept valid arguments', () => {
      const args: MemoryListArgs = {
        category: 'error',
        limit: 5,
      };

      expect(args.category).toBe('error');
      expect(args.limit).toBe(5);
    });

    it('MemoryTimelineArgs should accept valid arguments', () => {
      const args: MemoryTimelineArgs = {
        anchor: 'memory-123',
        before: 30,
        after: 30,
      };

      expect(args.anchor).toBe('memory-123');
      expect(args.before).toBe(30);
      expect(args.after).toBe(30);
    });

    it('MemoryTimelineArgs should work with minimal arguments', () => {
      const args: MemoryTimelineArgs = {
        anchor: 'memory-456',
      };

      expect(args.anchor).toBe('memory-456');
      expect(args.before).toBeUndefined();
      expect(args.after).toBeUndefined();
    });

    it('MemoryDetailsArgs should accept valid arguments', () => {
      const args: MemoryDetailsArgs = {
        ids: ['memory-1', 'memory-2', 'memory-3'],
      };

      expect(args.ids).toHaveLength(3);
      expect(args.ids).toContain('memory-1');
      expect(args.ids).toContain('memory-2');
      expect(args.ids).toContain('memory-3');
    });
  });
});
