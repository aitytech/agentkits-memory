import { describe, it, expect, beforeEach } from 'vitest';
import {
  TokenEconomicsTracker,
  createTokenEconomicsTracker,
} from '../token-economics.js';

describe('TokenEconomicsTracker', () => {
  let tracker: TokenEconomicsTracker;

  beforeEach(() => {
    tracker = new TokenEconomicsTracker();
  });

  describe('token estimation', () => {
    it('should estimate tokens (~4 chars per token)', () => {
      const text = 'This is a test'; // 14 chars
      const tokens = tracker.estimateTokens(text);
      expect(tokens).toBe(4); // ceil(14/4) = 4
    });

    it('should handle empty string', () => {
      expect(tracker.estimateTokens('')).toBe(0);
    });

    it('should handle long text', () => {
      const text = 'a'.repeat(1000);
      expect(tracker.estimateTokens(text)).toBe(250);
    });
  });

  describe('recording creation', () => {
    it('should record memory creation', () => {
      tracker.recordCreation('entry1', 'Test content here');

      const stats = tracker.getStats();
      expect(stats.totalObservations).toBe(1);
      expect(stats.totalDiscoveryTokens).toBeGreaterThan(0);
    });

    it('should track multiple creations', () => {
      tracker.recordCreation('entry1', 'First content');
      tracker.recordCreation('entry2', 'Second content');
      tracker.recordCreation('entry3', 'Third content');

      const stats = tracker.getStats();
      expect(stats.totalObservations).toBe(3);
    });

    it('should track per-entry metrics', () => {
      tracker.recordCreation('entry1', 'Test content');

      const metrics = tracker.getEntryMetrics('entry1');
      expect(metrics.length).toBe(1);
      expect(metrics[0].entryId).toBe('entry1');
      expect(metrics[0].discoveryTokens).toBeGreaterThan(0);
      expect(metrics[0].accessCount).toBe(0);
    });
  });

  describe('recording retrieval', () => {
    it('should record memory retrieval', () => {
      tracker.recordCreation('entry1', 'Test content');
      tracker.recordRetrieval('entry1', 'Test content');

      const stats = tracker.getStats();
      expect(stats.totalReadTokens).toBeGreaterThan(0);
    });

    it('should update access count', () => {
      tracker.recordCreation('entry1', 'Test content');
      tracker.recordRetrieval('entry1', 'Test content');
      tracker.recordRetrieval('entry1', 'Test content');

      const metrics = tracker.getEntryMetrics('entry1');
      expect(metrics[0].accessCount).toBe(2);
    });

    it('should calculate value score', () => {
      tracker.recordCreation('entry1', 'A'.repeat(100)); // 25 discovery tokens
      tracker.recordRetrieval('entry1', 'B'.repeat(40)); // 10 read tokens

      const metrics = tracker.getEntryMetrics('entry1');
      // savings = 25 - 10 = 15
      // valueScore = 15 * 1 = 15
      expect(metrics[0].savings).toBe(15);
      expect(metrics[0].valueScore).toBe(15);
    });
  });

  describe('statistics', () => {
    it('should calculate savings', () => {
      tracker.recordCreation('entry1', 'A'.repeat(100));
      tracker.recordRetrieval('entry1', 'B'.repeat(40));

      const stats = tracker.getStats();
      expect(stats.totalSavings).toBe(15); // 25 - 10
    });

    it('should calculate savings percentage', () => {
      tracker.recordCreation('entry1', 'A'.repeat(100));
      tracker.recordRetrieval('entry1', 'B'.repeat(40));

      const stats = tracker.getStats();
      // (25 - 10) / 25 * 100 = 60%
      expect(stats.savingsPercent).toBe(60);
    });

    it('should handle zero discovery tokens', () => {
      const stats = tracker.getStats();
      expect(stats.savingsPercent).toBe(0);
      expect(stats.avgTokensPerObservation).toBe(0);
    });

    it('should calculate average tokens per observation', () => {
      tracker.recordCreation('entry1', 'A'.repeat(40)); // 10 tokens
      tracker.recordCreation('entry2', 'B'.repeat(80)); // 20 tokens

      const stats = tracker.getStats();
      expect(stats.avgTokensPerObservation).toBe(15); // (10 + 20) / 2
    });
  });

  describe('top/low value entries', () => {
    beforeEach(() => {
      // Create entries with different value scores
      tracker.recordCreation('high-value', 'A'.repeat(200));
      tracker.recordRetrieval('high-value', 'B'.repeat(40));
      tracker.recordRetrieval('high-value', 'B'.repeat(40));
      tracker.recordRetrieval('high-value', 'B'.repeat(40));

      tracker.recordCreation('low-value', 'A'.repeat(40));
      // No retrievals - never accessed

      tracker.recordCreation('medium-value', 'A'.repeat(100));
      tracker.recordRetrieval('medium-value', 'B'.repeat(40));
    });

    it('should return top value entries', () => {
      const top = tracker.getTopValueEntries(2);

      expect(top.length).toBe(2);
      expect(top[0].entryId).toBe('high-value');
    });

    it('should return low value entries', () => {
      const low = tracker.getLowValueEntries(2);

      expect(low.length).toBeGreaterThanOrEqual(1);
      // low-value has 0 access count
      expect(low.some((e) => e.entryId === 'low-value')).toBe(true);
    });
  });

  describe('session tracking', () => {
    it('should track session input tokens', () => {
      tracker.recordSessionInput('session1', 500);

      const summary = tracker.getSessionSummary('session1');
      expect(summary).toBeDefined();
      expect(summary?.inputTokens).toBe(500);
    });

    it('should track session recalls', () => {
      tracker.recordCreation('entry1', 'Test content');
      tracker.recordRetrieval('entry1', 'Test content', 'session1');

      const summary = tracker.getSessionSummary('session1');
      expect(summary).toBeDefined();
      expect(summary?.memoriesRecalled).toBe(1);
    });

    it('should get all session summaries', () => {
      tracker.recordSessionInput('session1', 100);
      tracker.recordSessionInput('session2', 200);

      const summaries = tracker.getAllSessionSummaries();
      expect(summaries.length).toBe(2);
    });
  });

  describe('export/import', () => {
    it('should export metrics', () => {
      tracker.recordCreation('entry1', 'Test content');
      tracker.recordRetrieval('entry1', 'Test content');

      const exported = tracker.export();

      expect(exported.stats).toBeDefined();
      expect(exported.entries).toBeDefined();
      expect(exported.entries.length).toBe(1);
    });

    it('should import metrics', () => {
      const data = {
        entries: [
          {
            entryId: 'imported1',
            discoveryTokens: 100,
            readTokens: 50,
            savings: 50,
            accessCount: 5,
            valueScore: 250,
          },
        ],
      };

      tracker.import(data);

      const metrics = tracker.getEntryMetrics('imported1');
      expect(metrics.length).toBe(1);
      expect(metrics[0].discoveryTokens).toBe(100);
    });
  });

  describe('reset', () => {
    it('should reset all metrics', () => {
      tracker.recordCreation('entry1', 'Test content');
      tracker.recordRetrieval('entry1', 'Test content');

      tracker.reset();

      const stats = tracker.getStats();
      expect(stats.totalObservations).toBe(0);
      expect(stats.totalDiscoveryTokens).toBe(0);
      expect(stats.totalReadTokens).toBe(0);
    });
  });

  describe('formatStats', () => {
    it('should format stats for display', () => {
      tracker.recordCreation('entry1', 'Test content for display');

      const formatted = tracker.formatStats();

      expect(formatted).toContain('Token Economics');
      expect(formatted).toContain('Observations');
      expect(formatted).toContain('Discovery Tokens');
    });
  });

  describe('createTokenEconomicsTracker factory', () => {
    it('should create tracker with default config', () => {
      const tracker = createTokenEconomicsTracker();
      expect(tracker).toBeInstanceOf(TokenEconomicsTracker);
    });

    it('should create tracker with custom config', () => {
      const tracker = createTokenEconomicsTracker({ charsPerToken: 5 });
      // 10 chars / 5 = 2 tokens
      expect(tracker.estimateTokens('1234567890')).toBe(2);
    });
  });

  describe('configuration', () => {
    it('should use default chars per token', () => {
      const tracker = new TokenEconomicsTracker();
      expect(tracker.estimateTokens('1234')).toBe(1);
    });

    it('should accept custom chars per token', () => {
      const tracker = new TokenEconomicsTracker({ charsPerToken: 2 });
      expect(tracker.estimateTokens('1234')).toBe(2);
    });

    it('should include metadata tokens when configured', () => {
      const tracker = new TokenEconomicsTracker({ includeMetadata: true });
      tracker.recordCreation('entry1', 'content', { key: 'value' });

      const metrics = tracker.getEntryMetrics('entry1');
      // Should include metadata tokens
      expect(metrics[0].discoveryTokens).toBeGreaterThan(
        Math.ceil('content'.length / 4)
      );
    });
  });
});
