const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateScheduledPaymentDue } = require('./paymentScheduleUtils');

const loan = { totalRepay: 800, emi: 200, tenure: 4 };

test('carries a half-paid second-day installment into the third-day due', () => {
  assert.equal(calculateScheduledPaymentDue({ ...loan, dayNumber: 2, paidBeforeDay: 200 }), 200);
  assert.equal(calculateScheduledPaymentDue({ ...loan, dayNumber: 3, paidBeforeDay: 300 }), 300);
});

test('includes earlier unpaid installments in the current due', () => {
  assert.equal(calculateScheduledPaymentDue({ ...loan, dayNumber: 3, paidBeforeDay: 100 }), 500);
});

test('does not increase a later installment when earlier days were fully paid', () => {
  assert.equal(calculateScheduledPaymentDue({ ...loan, dayNumber: 3, paidBeforeDay: 400 }), 200);
});

test('caps the final schedule day at the remaining repayment balance', () => {
  assert.equal(calculateScheduledPaymentDue({
    totalRepay: 750, emi: 200, tenure: 4, dayNumber: 4, paidBeforeDay: 600
  }), 150);
});

test('uses the repayment balance for the extra day after the scheduled tenure', () => {
  assert.equal(calculateScheduledPaymentDue({
    totalRepay: 750, emi: 200, tenure: 3, dayNumber: 4, paidBeforeDay: 600
  }), 150);
});
