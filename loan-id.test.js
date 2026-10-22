const test = require('node:test');
const assert = require('node:assert/strict');
const { buildNextLoanId } = require('./loanIdUtils');

test('buildNextLoanId returns the next numeric loan id in sequence', () => {
  assert.equal(buildNextLoanId(['1', '2', '10']), '11');
  assert.equal(buildNextLoanId([]), '1');
  assert.equal(buildNextLoanId(['1', '5', '7']), '8');
  assert.equal(buildNextLoanId(['AL001', 'AL002']), '3');
  assert.equal(buildNextLoanId(['PL005', '1', '2']), '6');
  assert.equal(buildNextLoanId(['LN-2026-00012', 'AL003']), '13');
});
