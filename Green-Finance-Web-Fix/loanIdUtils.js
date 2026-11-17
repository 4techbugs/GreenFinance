function buildNextLoanId(existingIds = []) {
  const ids = Array.isArray(existingIds) ? existingIds : [];
  const serialNumbers = ids
    .map(value => String(value ?? "").trim())
    .map(value => {
      const match = value.match(/(\d+)$/);
      return match ? Number(match[1]) : null;
    })
    .filter(value => Number.isInteger(value) && value >= 0);

  const nextNumber = serialNumbers.length ? Math.max(...serialNumbers) + 1 : 1;
  return String(nextNumber);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildNextLoanId };
}

if (typeof window !== "undefined") {
  window.buildNextLoanId = buildNextLoanId;
}
