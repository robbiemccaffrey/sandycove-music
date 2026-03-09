import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validatePhone } from '../chat/tools.js';

// ─── Irish mobile numbers ────────────────────────────────────────────

describe('validatePhone — Irish mobile', () => {
  it('accepts 087 123 4567 (spaced)', () => {
    const r = validatePhone('087 123 4567');
    assert.equal(r.valid, true);
    assert.equal(r.normalized, '+353 87 123 4567');
  });

  it('accepts 0871234567 (no spaces)', () => {
    const r = validatePhone('0871234567');
    assert.equal(r.valid, true);
    assert.equal(r.normalized, '+353 87 123 4567');
  });

  it('accepts 085-123-4567 (dashes)', () => {
    const r = validatePhone('085-123-4567');
    assert.equal(r.valid, true);
    assert.equal(r.normalized, '+353 85 123 4567');
  });

  it('accepts (089) 1234567 (parens)', () => {
    const r = validatePhone('(089) 1234567');
    assert.equal(r.valid, true);
    assert.equal(r.normalized, '+353 89 123 4567');
  });

  it('accepts 083, 085, 086, 087, 089 prefixes', () => {
    for (const prefix of ['083', '085', '086', '087', '089']) {
      const r = validatePhone(prefix + '1234567');
      assert.equal(r.valid, true, `Expected ${prefix} to be valid`);
    }
  });

  it('accepts +353 87 1234567 (international format)', () => {
    const r = validatePhone('+353 87 1234567');
    assert.equal(r.valid, true);
    assert.equal(r.normalized, '+353 87 123 4567');
  });

  it('accepts 00353 87 1234567 (00 prefix)', () => {
    const r = validatePhone('00353 87 1234567');
    assert.equal(r.valid, true);
    assert.equal(r.normalized, '+353 87 123 4567');
  });

  it('accepts +353871234567 (no spaces)', () => {
    const r = validatePhone('+353871234567');
    assert.equal(r.valid, true);
    assert.equal(r.normalized, '+353 87 123 4567');
  });
});

// ─── Irish landline (rejected) ───────────────────────────────────────

describe('validatePhone — Irish landline (rejected)', () => {
  it('rejects 01 234 5678 (Dublin landline)', () => {
    const r = validatePhone('01 234 5678');
    assert.equal(r.valid, false);
    assert.ok(r.error.includes('mobile'));
  });

  it('rejects 021 123 4567 (Cork landline)', () => {
    const r = validatePhone('021 123 4567');
    assert.equal(r.valid, false);
    assert.ok(r.error.includes('mobile'));
  });
});

// ─── International numbers ───────────────────────────────────────────

describe('validatePhone — International', () => {
  it('accepts +44 7911 123456 (UK mobile)', () => {
    const r = validatePhone('+44 7911 123456');
    assert.equal(r.valid, true);
  });

  it('accepts +1 555 123 4567 (US)', () => {
    const r = validatePhone('+1 555 123 4567');
    assert.equal(r.valid, true);
  });

  it('accepts +49 170 1234567 (Germany)', () => {
    const r = validatePhone('+49 170 1234567');
    assert.equal(r.valid, true);
  });
});

// ─── Missing country code (rejected) ─────────────────────────────────

describe('validatePhone — Missing country code', () => {
  it('rejects 7911123456 (UK without +44)', () => {
    const r = validatePhone('7911123456');
    assert.equal(r.valid, false);
    assert.ok(r.error.includes('country code'));
  });

  it('rejects 5551234567 (US without +1)', () => {
    const r = validatePhone('5551234567');
    assert.equal(r.valid, false);
    assert.ok(r.error.includes('country code'));
  });
});

// ─── Invalid input ───────────────────────────────────────────────────

describe('validatePhone — Invalid input', () => {
  it('rejects empty string', () => {
    const r = validatePhone('');
    assert.equal(r.valid, false);
  });

  it('rejects null', () => {
    const r = validatePhone(null);
    assert.equal(r.valid, false);
  });

  it('rejects letters', () => {
    const r = validatePhone('call me maybe');
    assert.equal(r.valid, false);
  });

  it('rejects too short (3 digits)', () => {
    const r = validatePhone('+1 23');
    assert.equal(r.valid, false);
  });

  it('rejects too long (20 digits)', () => {
    const r = validatePhone('+1234567890123456789');
    assert.equal(r.valid, false);
  });
});
