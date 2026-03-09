import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SYSTEM_PROMPT } from '../chat/prompts.js';

// ─── Pricing data embedded in prompt ──────────────────────────────────

describe('System prompt — Pricing data', () => {
  const EXPECTED_PRICES = [
    { desc: '30-minute lesson', amount: '€30' },
    { desc: '40-minute lesson', amount: '€40' },
    { desc: '1-hour lesson', amount: '€50' },
    { desc: '10×30min package', amount: '€270' },
    { desc: '10×40min package', amount: '€330' },
    { desc: '10×1hr package', amount: '€400' },
  ];

  for (const { desc, amount } of EXPECTED_PRICES) {
    it(`includes ${desc} at ${amount}`, () => {
      assert.ok(SYSTEM_PROMPT.includes(amount), `Missing price ${amount} for ${desc}`);
    });
  }

  it('mentions the 50% first lesson offer', () => {
    assert.ok(SYSTEM_PROMPT.includes('50%'));
    assert.ok(SYSTEM_PROMPT.toLowerCase().includes('first lesson'));
  });

  it('includes package savings amounts', () => {
    assert.ok(SYSTEM_PROMPT.includes('save €30'));
    assert.ok(SYSTEM_PROMPT.includes('save €70'));
    assert.ok(SYSTEM_PROMPT.includes('save €100'));
  });
});

// ─── Identity protection rules ────────────────────────────────────────

describe('System prompt — Identity protection', () => {
  it('instructs never to say AI', () => {
    assert.ok(SYSTEM_PROMPT.includes('"AI"'));
  });

  it('instructs never to say chatbot', () => {
    assert.ok(SYSTEM_PROMPT.includes('"chatbot"'));
  });

  it('instructs never to say language model', () => {
    assert.ok(SYSTEM_PROMPT.includes('"language model"'));
  });

  it('instructs never to say virtual assistant', () => {
    assert.ok(SYSTEM_PROMPT.includes('"virtual assistant"'));
  });

  it('instructs never to say bot', () => {
    assert.ok(SYSTEM_PROMPT.includes('"bot"'));
  });

  it('provides a redirect for meta-questions', () => {
    assert.ok(SYSTEM_PROMPT.includes("I'm here to help with piano lessons"));
  });
});

// ─── School data ──────────────────────────────────────────────────────

describe('System prompt — School data', () => {
  it('includes phone number', () => {
    assert.ok(SYSTEM_PROMPT.includes('086 872 9764'));
  });

  it('includes location', () => {
    assert.ok(SYSTEM_PROMPT.includes('Sandycove'));
    assert.ok(SYSTEM_PROMPT.includes('Dun Laoghaire'));
    assert.ok(SYSTEM_PROMPT.includes('Co. Dublin'));
  });

  it('includes all exam boards', () => {
    for (const board of ['RIAM', 'ABRSM', 'Trinity College London', 'Leaving Certificate', 'Junior Cycle']) {
      assert.ok(SYSTEM_PROMPT.includes(board), `Missing exam board: ${board}`);
    }
  });

  it('includes all areas served', () => {
    for (const area of ['Dalkey', 'Glasthule', 'Monkstown', 'Glenageary', 'Blackrock', 'Killiney', 'Booterstown', 'Stillorgan']) {
      assert.ok(SYSTEM_PROMPT.includes(area), `Missing area: ${area}`);
    }
  });

  it('includes all music styles', () => {
    for (const style of ['classical', 'jazz', 'pop', 'contemporary', 'Irish traditional']) {
      assert.ok(SYSTEM_PROMPT.toLowerCase().includes(style.toLowerCase()), `Missing style: ${style}`);
    }
  });

  it('states piano only', () => {
    assert.ok(SYSTEM_PROMPT.includes('ONLY teach piano'));
  });

  it('includes age range', () => {
    assert.ok(SYSTEM_PROMPT.includes('Ages 5+'));
    assert.ok(SYSTEM_PROMPT.toLowerCase().includes('adult'));
  });

  it('mentions in-person and online options', () => {
    assert.ok(SYSTEM_PROMPT.toLowerCase().includes('in-person'));
    assert.ok(SYSTEM_PROMPT.toLowerCase().includes('online'));
  });
});

// ─── Tool rules ───────────────────────────────────────────────────────

describe('System prompt — Tool rules', () => {
  it('references capture_lead tool', () => {
    assert.ok(SYSTEM_PROMPT.includes('capture_lead'));
  });

  it('requires name AND contact method', () => {
    assert.ok(SYSTEM_PROMPT.toLowerCase().includes('name'));
    assert.ok(SYSTEM_PROMPT.toLowerCase().includes('email or phone'));
  });

  it('instructs to respect declined contact requests', () => {
    assert.ok(SYSTEM_PROMPT.toLowerCase().includes('respect that'));
  });

  it('instructs to collect both email and phone', () => {
    assert.ok(SYSTEM_PROMPT.toLowerCase().includes('both email and phone'));
  });
});

// ─── Critical rules ───────────────────────────────────────────────────

describe('System prompt — Critical rules', () => {
  it('forbids inventing prices', () => {
    assert.ok(SYSTEM_PROMPT.includes('ONLY quote the exact prices'));
  });

  it('forbids mentioning competitors', () => {
    assert.ok(SYSTEM_PROMPT.toLowerCase().includes('never mention competitor'));
  });

  it('requires mentioning 50% offer with pricing', () => {
    assert.ok(SYSTEM_PROMPT.includes('50% first lesson offer'));
  });

  it('directs to phone when unsure', () => {
    assert.ok(SYSTEM_PROMPT.includes('086 872 9764'));
    assert.ok(SYSTEM_PROMPT.toLowerCase().includes('unsure'));
  });
});

// ─── Prompt structure ─────────────────────────────────────────────────

describe('System prompt — Structure', () => {
  it('is a non-empty string', () => {
    assert.equal(typeof SYSTEM_PROMPT, 'string');
    assert.ok(SYSTEM_PROMPT.length > 500, 'Prompt seems too short');
  });

  it('does not contain placeholder text', () => {
    assert.ok(!SYSTEM_PROMPT.includes('TODO'));
    assert.ok(!SYSTEM_PROMPT.includes('FIXME'));
    assert.ok(!SYSTEM_PROMPT.includes('[INSERT'));
  });

  it('uses euro currency, not dollars', () => {
    assert.ok(SYSTEM_PROMPT.includes('€'));
    // Should not have $ prices
    assert.ok(!/\$\d/.test(SYSTEM_PROMPT), 'Prompt should not contain dollar prices');
  });
});
