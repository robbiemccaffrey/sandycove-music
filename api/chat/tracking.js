// gpt-4o-mini pricing per 1M tokens
const PRICING = {
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
};

class UsageTracker {
  constructor() {
    this.turns = [];
  }

  track(model, usage, durationMs, toolCalls = 0) {
    const pricing = PRICING[model] || PRICING['gpt-4o-mini'];
    const inputTokens = usage?.prompt_tokens || 0;
    const outputTokens = usage?.completion_tokens || 0;
    const cost =
      (inputTokens * pricing.input) / 1_000_000 +
      (outputTokens * pricing.output) / 1_000_000;

    this.turns.push({
      model,
      inputTokens,
      outputTokens,
      cost,
      durationMs,
      toolCalls,
    });
  }

  getSummary() {
    let totalTokens = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let totalCost = 0;
    let totalDurationMs = 0;

    for (const turn of this.turns) {
      inputTokens += turn.inputTokens;
      outputTokens += turn.outputTokens;
      totalTokens += turn.inputTokens + turn.outputTokens;
      totalCost += turn.cost;
      totalDurationMs += turn.durationMs;
    }

    return {
      totalTokens,
      inputTokens,
      outputTokens,
      totalCost,
      totalDurationMs,
      turnCount: this.turns.length,
    };
  }
}

export { UsageTracker };
