import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { UsageTracker } from '../chat/tracking.js';

describe('UsageTracker', () => {
  it('starts with empty turns', () => {
    const tracker = new UsageTracker();
    const summary = tracker.getSummary();
    assert.equal(summary.totalTokens, 0);
    assert.equal(summary.inputTokens, 0);
    assert.equal(summary.outputTokens, 0);
    assert.equal(summary.totalCost, 0);
    assert.equal(summary.totalDurationMs, 0);
    assert.equal(summary.turnCount, 0);
  });

  it('tracks a single turn', () => {
    const tracker = new UsageTracker();
    tracker.track('gpt-4o-mini', { prompt_tokens: 100, completion_tokens: 50 }, 200);
    const summary = tracker.getSummary();
    assert.equal(summary.totalTokens, 150);
    assert.equal(summary.inputTokens, 100);
    assert.equal(summary.outputTokens, 50);
    assert.equal(summary.totalDurationMs, 200);
    assert.equal(summary.turnCount, 1);
  });

  it('accumulates multiple turns', () => {
    const tracker = new UsageTracker();
    tracker.track('gpt-4o-mini', { prompt_tokens: 100, completion_tokens: 50 }, 200);
    tracker.track('gpt-4o-mini', { prompt_tokens: 200, completion_tokens: 100 }, 300);
    const summary = tracker.getSummary();
    assert.equal(summary.totalTokens, 450);
    assert.equal(summary.inputTokens, 300);
    assert.equal(summary.outputTokens, 150);
    assert.equal(summary.totalDurationMs, 500);
    assert.equal(summary.turnCount, 2);
  });

  it('calculates cost correctly for gpt-4o-mini', () => {
    const tracker = new UsageTracker();
    // 1M input tokens = $0.15, 1M output tokens = $0.60
    tracker.track('gpt-4o-mini', { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 }, 1000);
    const summary = tracker.getSummary();
    assert.ok(Math.abs(summary.totalCost - 0.75) < 0.0001, `Expected ~$0.75, got $${summary.totalCost}`);
  });

  it('calculates cost for typical conversation turn', () => {
    const tracker = new UsageTracker();
    // Typical turn: ~500 input, ~100 output
    tracker.track('gpt-4o-mini', { prompt_tokens: 500, completion_tokens: 100 }, 300);
    const summary = tracker.getSummary();
    // 500 * 0.15/1M + 100 * 0.60/1M = 0.000075 + 0.000060 = 0.000135
    assert.ok(summary.totalCost > 0);
    assert.ok(summary.totalCost < 0.001);
  });

  it('handles null/undefined usage gracefully', () => {
    const tracker = new UsageTracker();
    tracker.track('gpt-4o-mini', null, 100);
    const summary = tracker.getSummary();
    assert.equal(summary.totalTokens, 0);
    assert.equal(summary.totalCost, 0);
    assert.equal(summary.turnCount, 1);
  });

  it('handles missing token fields gracefully', () => {
    const tracker = new UsageTracker();
    tracker.track('gpt-4o-mini', {}, 100);
    const summary = tracker.getSummary();
    assert.equal(summary.totalTokens, 0);
  });

  it('falls back to gpt-4o-mini pricing for unknown models', () => {
    const tracker = new UsageTracker();
    tracker.track('some-unknown-model', { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 }, 100);
    const summary = tracker.getSummary();
    // Should use gpt-4o-mini pricing as fallback
    assert.ok(Math.abs(summary.totalCost - 0.75) < 0.0001);
  });

  it('tracks tool call count', () => {
    const tracker = new UsageTracker();
    tracker.track('gpt-4o-mini', { prompt_tokens: 100, completion_tokens: 50 }, 200, 2);
    assert.equal(tracker.turns[0].toolCalls, 2);
  });

  it('defaults tool calls to 0', () => {
    const tracker = new UsageTracker();
    tracker.track('gpt-4o-mini', { prompt_tokens: 100, completion_tokens: 50 }, 200);
    assert.equal(tracker.turns[0].toolCalls, 0);
  });
});
