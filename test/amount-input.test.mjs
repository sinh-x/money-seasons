import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, formatAmountInput, MAX_AMOUNT } from '../public/amount-input.js';
test('confirmed shorthand and exact expanded grammar', () => {
  for (const [source, expected] of [['5', 5000], ['500', 500000], ['5000', 5000000], ['5M', 5000000], ['5tr', 5000000], ['5 trăm', 500000], ['5 ngàn', 5000], ['5 nghìn', 5000], ['5,000', 5000000], ['5.000', 5000000], ['1,5tr', 1500000], ['1.5', 1500], ['1,25 triệu', 1250000], ['5000 VND', 5000], ['0', 0], ['0,01k', 10], ['12 đ', 12], ['12 đồng', 12], ['1,000,000 VND', 1000000]]) assert.equal(parseAmount(source), expected, source);
  assert.equal(parseAmount(''), null); assert.throws(() => parseAmount('', { required: true }));
});
test('reject ambiguous/malformed/fractional/overflow input without rounding', () => {
  for (const source of ['-1', '+1', '1e3', 'Infinity', 'NaN', '1,234.567', '1,2345', '1.2345tr', '1,000tr', '1,2,3', '1,23,456', '0.01VND', '10USD', '5tr extra', '.', '999999999999999999999999999999', String(MAX_AMOUNT)]) {
    // A single consistent 3-digit separator is grouping, including explicit units.
    if (source === '1,000tr') { assert.equal(parseAmount(source), 1000000000); continue; }
    assert.throws(() => parseAmount(source), source);
  }
});
test('stored VND editor round trips never double-scale, including maximum and unknown', () => {
  for (const value of [null, 0, 1, 5000, 5000000, MAX_AMOUNT]) assert.equal(parseAmount(formatAmountInput(value)), value);
});
