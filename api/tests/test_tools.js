import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validatePhone, validateEmail } from '../chat/tools.js';

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

// ─── Email validation — valid ────────────────────────────────────────

describe('validateEmail — Valid emails', () => {
  it('accepts standard email', () => {
    const r = validateEmail('john@example.com');
    assert.equal(r.valid, true);
    assert.equal(r.normalized, 'john@example.com');
  });

  it('normalizes to lowercase', () => {
    const r = validateEmail('John.Doe@Gmail.COM');
    assert.equal(r.valid, true);
    assert.equal(r.normalized, 'john.doe@gmail.com');
  });

  it('trims whitespace', () => {
    const r = validateEmail('  jane@example.ie  ');
    assert.equal(r.valid, true);
    assert.equal(r.normalized, 'jane@example.ie');
  });

  it('accepts .ie domain', () => {
    const r = validateEmail('info@sandycove.ie');
    assert.equal(r.valid, true);
  });

  it('accepts subdomain emails', () => {
    const r = validateEmail('user@mail.example.co.uk');
    assert.equal(r.valid, true);
  });

  it('accepts + in local part', () => {
    const r = validateEmail('user+tag@gmail.com');
    assert.equal(r.valid, true);
  });
});

// ─── Email validation — invalid ──────────────────────────────────────

describe('validateEmail — Invalid emails', () => {
  it('rejects null', () => {
    const r = validateEmail(null);
    assert.equal(r.valid, false);
  });

  it('rejects empty string', () => {
    const r = validateEmail('');
    assert.equal(r.valid, false);
  });

  it('rejects no @ symbol', () => {
    const r = validateEmail('johngmail.com');
    assert.equal(r.valid, false);
    assert.ok(r.error.includes('@'));
  });

  it('rejects multiple @ symbols', () => {
    const r = validateEmail('john@@gmail.com');
    assert.equal(r.valid, false);
  });

  it('rejects missing local part', () => {
    const r = validateEmail('@gmail.com');
    assert.equal(r.valid, false);
    assert.ok(r.error.includes('before'));
  });

  it('rejects missing domain', () => {
    const r = validateEmail('john@');
    assert.equal(r.valid, false);
    assert.ok(r.error.includes('domain'));
  });

  it('rejects domain without TLD', () => {
    const r = validateEmail('john@gmail');
    assert.equal(r.valid, false);
    assert.ok(r.error.includes('domain'));
  });

  it('rejects single-char TLD', () => {
    const r = validateEmail('john@gmail.c');
    assert.equal(r.valid, false);
  });

  it('rejects spaces in email', () => {
    const r = validateEmail('john doe@gmail.com');
    assert.equal(r.valid, false);
  });
});
