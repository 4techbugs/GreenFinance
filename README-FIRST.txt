GREEN FINANCE - SQL SERVER EXPRESS (PRECONFIGURED)

Your detected setup:
  SQL Server instance : .\SQLEXPRESS
  Authentication      : Windows Authentication
  Database            : GreenFinanceDB
  Website port        : 3000

QUICK START

1) Open SQL Server Management Studio (SSMS).
2) Connect using:
     Server name    DESKTOP-JAFDM43\SQLEXPRESS
     Authentication Windows Authentication
3) Click "New Query".
4) Open database/01-create-GreenFinanceDB.sql and execute the entire script.
5) Confirm GreenFinanceDB appears under Databases.
6) Open this project folder in VS Code.
7) Open Terminal in the project root.
8) Run:
     npm install
9) Then run:
     npm run dev
10) Open:
     http://localhost:3000

IMPORTANT
- Do not double-click index.html. Always use the Node server URL.
- The first website load inserts the bundled demo data into empty SQL tables.
- All later Add/Edit/Delete actions are sent to SQL Server.
- Profile Aadhaar/PAN proof and self image uploads are stored in dbo.ProfileFiles as VARBINARY(MAX).
- Existing uploaded profile files are preserved during edit when no replacement file is selected.
- Email, Work, Work Place and Office Contact Number remain optional.
- Name, Age, Contact Number, Address, Aadhaar Number and PAN Number remain mandatory.

HOW TO CHECK DATA IN SSMS

USE GreenFinanceDB;
GO
SELECT * FROM dbo.vProfiles;
SELECT * FROM dbo.vCustomers;
SELECT * FROM dbo.vExecutives;
SELECT * FROM dbo.vAddedLoans;
SELECT ProfileId, FieldName, FileName, MimeType, DATALENGTH(FileData) AS Bytes
FROM dbo.ProfileFiles;

PORT 3000 ALREADY IN USE?
If you see EADDRINUSE:
  1) Close the old Node terminal, OR run:
       taskkill /F /IM node.exe
  2) Then run npm run dev again.

You can also change PORT=3000 to PORT=3001 in .env and open:
  http://localhost:3001

WINDOWS AUTHENTICATION NOTE
The Node server uses mssql + msnodesqlv8 and connects with your current Windows account.
No SQL username or password is stored in the project.
If Windows says an ODBC SQL Server driver is missing, install Microsoft ODBC Driver 18 for SQL Server,
then run npm install again.

SQL USERNAME / PASSWORD OPTION
Open .env in this project folder and use these settings:

  DB_AUTH=sql
  DB_TRUSTED_CONNECTION=false
  DB_USER=your_sql_username
  DB_PASSWORD=your_sql_password

For Windows Authentication, keep:

  DB_AUTH=windows
  DB_TRUSTED_CONNECTION=true

DATABASE CONNECTION TEST
After starting the server, open:
  http://localhost:3000/api/health

Expected result contains:
  "ok": true
  "database": "GreenFinanceDB"
  "authentication": "Windows Authentication"

When DB_AUTH=sql, the health check shows:
  "authentication": "SQL Server Authentication"
  "username": "your_sql_username"


PAYMENT WORKFLOW (ADDITIVE)
- The payment workflow is implemented in the existing Add Loan module.
- Payment schedule records are stored in dbo.tb_loan_payment.
- Loans assigned to multiple executives share one repayment schedule and payment history.
- All assigned executives can view and update the same loan payments.
- The new SQL migration is Payment_SQL_Migration.sql.
- New loans create daily payment rows from the loan tenure; partial payments carry forward remaining amount.
- SQL Server SYSDATETIME() is used for payment timestamps/today's date.
- Payment create/edit uses the existing logged-in Executive ID.
- Loan delete is now status-based (Inactive) so SQL payment history is not physically deleted.
- The Payment action includes payment history, edit, penalty, discount, carry-forward and Close Loan handling.
- Existing Executive/Profile/Prefix Loan/Add Loan data is not reset by the payment migration.
