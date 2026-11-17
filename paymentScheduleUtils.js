function calculateScheduledPaymentDue({ totalRepay, emi, tenure, dayNumber, paidBeforeDay }) {
  const repaymentAmount = Math.max(0, Number(totalRepay) || 0);
  const installmentAmount = Math.max(0, Number(emi) || 0);
  const scheduleLength = Math.max(0, Number(tenure) || 0);
  const day = Math.max(0, Number(dayNumber) || 0);
  const amountPaid = Math.max(0, Number(paidBeforeDay) || 0);

  const scheduledTarget = day <= scheduleLength
    ? Math.min(repaymentAmount, installmentAmount * day)
    : day === scheduleLength + 1 ? repaymentAmount : 0;

  return Math.max(0, scheduledTarget - amountPaid);
}

module.exports = { calculateScheduledPaymentDue };
