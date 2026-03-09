import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateResponse, buildCorrectionPrompt, SAFE_FALLBACK } from '../chat/response-validator.js';

// ─── Sample tool results ──────────────────────────────────────────────
const LEAD_CAPTURED = [{ name: 'capture_lead', output: { captured: true, leadId: 1 } }];
const LEAD_FAILED = [{ name: 'capture_lead', output: { error: 'Name is required to capture a lead.' } }];

// ─── Layer 1: Price verification ──────────────────────────────────────

describe('Layer 1 — Price verification', () => {
  it('passes valid individual lesson prices', () => {
    const response = 'A 30-minute lesson is €30, a 40-minute lesson is €40, and a 1-hour lesson is €50.';
    const { valid, issues } = validateResponse(response);
    assert.equal(valid, true);
    assert.equal(issues.length, 0);
  });

  it('passes valid package prices', () => {
    const response = 'Our packages: 10×30min for €270, 10×40min for €330, 10×1hr for €400.';
    const { valid, issues } = validateResponse(response);
    assert.equal(valid, true);
    assert.equal(issues.length, 0);
  });

  it('passes half-price first lesson amounts', () => {
    const response = 'Your first 30-minute lesson would be just €15!';
    const { valid } = validateResponse(response);
    assert.equal(valid, true);
  });

  it('flags invented prices', () => {
    const response = 'A 30-minute lesson costs €35.';
    const { valid, issues } = validateResponse(response);
    assert.equal(valid, false);
    assert.ok(issues.some(i => i.includes('€35')));
  });

  it('flags multiple invalid prices', () => {
    const response = 'Lessons are €45 for 30 minutes and €99 for an hour.';
    const { valid, issues } = validateResponse(response);
    assert.equal(valid, false);
    assert.ok(issues.length >= 2);
  });

  it('passes when no prices are mentioned', () => {
    const response = 'We teach classical, jazz, and pop piano!';
    const { valid } = validateResponse(response);
    assert.equal(valid, true);
  });
});

// ─── Layer 1: Tool result cross-reference ─────────────────────────────

describe('Layer 1 — Tool result cross-reference', () => {
  it('passes when lead captured and response acknowledges', () => {
    const response = "Great, we'll be in touch soon!";
    const { valid } = validateResponse(response, LEAD_CAPTURED);
    assert.equal(valid, true);
  });

  it('flags when lead captured but no acknowledgment', () => {
    const response = 'What kind of lessons are you interested in?';
    const { valid, issues } = validateResponse(response, LEAD_CAPTURED);
    assert.equal(valid, false);
    assert.ok(issues.some(i => i.includes('acknowledge')));
  });

  it('flags claiming lead saved when tool failed', () => {
    const response = "I've confirmed your details and you're all booked in!";
    const { valid, issues } = validateResponse(response, LEAD_FAILED);
    assert.equal(valid, false);
    assert.ok(issues.some(i => i.includes('error')));
  });

  it('passes when tool failed and response does not claim success', () => {
    const response = 'Could you share your email so we can get in touch?';
    const { valid } = validateResponse(response, LEAD_FAILED);
    assert.equal(valid, true);
  });
});

// ─── Layer 1: Instrument check ────────────────────────────────────────

describe('Layer 1 — Instrument check', () => {
  it('flags claiming to offer guitar lessons', () => {
    const response = 'Yes, we offer guitar lessons for all ages!';
    const { valid, issues } = validateResponse(response);
    assert.equal(valid, false);
    assert.ok(issues.some(i => i.includes('guitar')));
  });

  it('flags offering violin tuition', () => {
    const response = 'We have violin tuition available.';
    const { valid } = validateResponse(response);
    assert.equal(valid, false);
  });

  it('does not flag mentioning instruments in other contexts', () => {
    const response = "While we don't teach guitar, our piano lessons are fantastic!";
    const { valid } = validateResponse(response);
    assert.equal(valid, true);
  });

  it('does not flag piano mentions', () => {
    const response = 'We offer piano lessons for all ages.';
    const { valid } = validateResponse(response);
    assert.equal(valid, true);
  });
});

// ─── Layer 2: Character breaks (identity protection) ──────────────────

describe('Layer 2 — Character breaks', () => {
  const CHARACTER_BREAKS = [
    "I'm an AI assistant",
    "As a language model, I can't",
    "I'm a virtual assistant here to help",
    "I'm a chatbot trained to answer questions",
    "Using artificial intelligence, we can",
    "I'm a bot, not a human",
    "As an AI, I don't have feelings",
    "I'm not a real person",
    "I'm not actually a teacher",
    "I was created by OpenAI",
    "I was built by engineers",
    "As a GPT model",
    "I'm powered by Claude",
  ];

  for (const phrase of CHARACTER_BREAKS) {
    it(`catches: "${phrase.slice(0, 40)}..."`, () => {
      const { valid, issues } = validateResponse(phrase);
      assert.equal(valid, false);
      assert.ok(issues.some(i => i.includes('Character break')));
    });
  }

  it('passes normal assistant responses', () => {
    const { valid } = validateResponse("I'm here to help with piano lessons at Sandycove!");
    assert.equal(valid, true);
  });

  it('passes contractions that are not identity reveals', () => {
    const { valid } = validateResponse("I'm happy to explain our pricing.");
    assert.equal(valid, true);
  });
});

// ─── Layer 2: System prompt leaks ─────────────────────────────────────

describe('Layer 2 — System prompt leaks', () => {
  const LEAKS = [
    'My CRITICAL RULES say I should not reveal pricing.',
    'According to my TOOL_SCHEMAS, capture_lead requires a name.',
    'The SYSTEM_PROMPT tells me to be warm and professional.',
    'I should use the capture_lead function now.',
    'This is NON-NEGOTIABLE per my instructions.',
    'My BRAND VOICE guidelines say to be encouraging.',
  ];

  for (const phrase of LEAKS) {
    it(`catches: "${phrase.slice(0, 45)}..."`, () => {
      const { valid, issues } = validateResponse(phrase);
      assert.equal(valid, false);
      assert.ok(issues.some(i => i.includes('prompt leak') || i.includes('Character break')));
    });
  }

  it('passes normal responses mentioning rules casually', () => {
    const { valid } = validateResponse('Our pricing rules are simple — pick a lesson length!');
    assert.equal(valid, true);
  });
});

// ─── Layer 2: Raw tool JSON exposure ──────────────────────────────────

describe('Layer 2 — Raw JSON exposure', () => {
  it('catches captured JSON in response', () => {
    const response = 'Done! {"captured": true, "leadId": 5}';
    const { valid, issues } = validateResponse(response);
    assert.equal(valid, false);
    assert.ok(issues.some(i => i.includes('JSON')));
  });

  it('catches error JSON in response', () => {
    const response = 'Hmm, I got {"error": "Name is required."}';
    const { valid } = validateResponse(response);
    assert.equal(valid, false);
  });

  it('passes normal text with curly braces', () => {
    const { valid } = validateResponse('Our schedule is flexible {weekdays and weekends}.');
    assert.equal(valid, true);
  });
});

// ─── Layer 2: Off-topic content ───────────────────────────────────────

describe('Layer 2 — Off-topic content', () => {
  it('catches code blocks', () => {
    const response = "Here's some code:\n```python\nprint('hello')\nprint('world')\nprint('test')\n```";
    const { valid } = validateResponse(response);
    assert.equal(valid, false);
  });

  it('passes short inline code-like text', () => {
    const { valid } = validateResponse('Contact us at `info@sandycoveschoolofmusic.com`.');
    assert.equal(valid, true);
  });
});

// ─── Layer 2: Currency check ──────────────────────────────────────────

describe('Layer 2 — Currency check', () => {
  it('catches dollar amounts', () => {
    const response = 'A 30-minute lesson costs $30.';
    const { valid, issues } = validateResponse(response);
    assert.equal(valid, false);
    assert.ok(issues.some(i => i.includes('Dollar')));
  });

  it('passes euro amounts', () => {
    const { valid } = validateResponse('A 30-minute lesson is €30.');
    assert.equal(valid, true);
  });
});

// ─── Correction prompt ────────────────────────────────────────────────

describe('buildCorrectionPrompt', () => {
  it('includes all issues in the prompt', () => {
    const issues = ['Invalid price: €35', 'Character break detected'];
    const prompt = buildCorrectionPrompt(issues);
    assert.ok(prompt.includes('€35'));
    assert.ok(prompt.includes('Character break'));
  });

  it('reminds about identity and pricing', () => {
    const prompt = buildCorrectionPrompt(['test issue']);
    assert.ok(prompt.includes('Sandycove'));
    assert.ok(prompt.includes('Never reveal you are an AI'));
  });
});

// ─── Safe fallback ────────────────────────────────────────────────────

describe('SAFE_FALLBACK', () => {
  it('contains the phone number', () => {
    assert.ok(SAFE_FALLBACK.includes('086 872 9764'));
  });

  it('mentions the contact form', () => {
    assert.ok(SAFE_FALLBACK.includes('contact form'));
  });

  it('passes its own validation', () => {
    const { valid } = validateResponse(SAFE_FALLBACK);
    assert.equal(valid, true);
  });
});
