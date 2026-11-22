import test from 'node:test';
import assert from 'node:assert';
import { latin, num, money } from '../src/lib/format.js';

test('Arabic-Indic and Persian digits become 0-9', () => {
  assert.equal(latin('٠١٠٩٨٧٦٥٤٣٢'), '01098765432');
  assert.equal(latin('۰۱۲۳۴۵۶۷۸۹'), '0123456789');
  assert.equal(latin('تيست ٢'), 'تيست 2');
  assert.equal(latin(null), '');
});

test('negative amounts keep the minus in front inside RTL text', () => {
  assert.equal(num(-16000), '‎-16,000');
  assert.equal(num(1500.5), '1,500.5');
  assert.equal(money(0), '0 ج.م');
});
