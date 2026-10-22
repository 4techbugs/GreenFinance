GREEN FINANCE - FIXED ADD LOAN VERSION

What was fixed:
1. New Loan always opens a fresh blank form.
2. Applicant / Guarantor 1 / Guarantor 2 can be selected from Profile List.
3. Profile search works by Name, Contact Number, Aadhaar or PAN.
4. Selected profile cards have View + Change + Remove.
5. Save Loan sends the loan to SQL Server through POST /api/loans.
6. Edit sends UPDATE through PUT /api/loans/:id.
7. Delete sends DELETE through DELETE /api/loans/:id.
8. Existing SQL loans are loaded by /api/bootstrap and /api/loans.
9. Unfinished Add Loan drafts are not accidentally reused when clicking New Loan.

RUN:
1. Open this folder in PowerShell.
2. Run: npm install
3. Run: npm run dev
4. Open: http://localhost:3000
5. If an old UI is shown, press Ctrl+Shift+R.

SQL:
Database: GreenFinanceDB
Table: dbo.added_loans

Check saved loans in SSMS:
SELECT * FROM dbo.added_loans ORDER BY created_at DESC;
