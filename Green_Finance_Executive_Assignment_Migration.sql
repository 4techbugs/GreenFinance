/* Green Finance migration
   Run against GreenFinanceDB in SQL Server Management Studio BEFORE deploying the updated app.
   Adds optional Executive 2/3 assignment columns without dropping or rebuilding existing data.
*/
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.added_loans', N'U') IS NULL
    THROW 50001, 'dbo.added_loans was not found. Select the correct GreenFinanceDB database.', 1;
IF OBJECT_ID(N'dbo.executives', N'U') IS NULL
    THROW 50002, 'dbo.executives was not found. Select the correct GreenFinanceDB database.', 1;

IF COL_LENGTH(N'dbo.added_loans', N'assigned_executive_id') IS NULL
    ALTER TABLE dbo.added_loans ADD assigned_executive_id INT NULL;
IF COL_LENGTH(N'dbo.added_loans', N'executive2_id') IS NULL
    ALTER TABLE dbo.added_loans ADD executive2_id INT NULL;
IF COL_LENGTH(N'dbo.added_loans', N'executive3_id') IS NULL
    ALTER TABLE dbo.added_loans ADD executive3_id INT NULL;

/* Backfill Executive 1 ID for existing loans by matching its stored name. */
UPDATE l
SET assigned_executive_id = e.executive_id
FROM dbo.added_loans AS l
JOIN dbo.executives AS e
  ON LOWER(LTRIM(RTRIM(e.full_name))) = LOWER(LTRIM(RTRIM(l.executive)))
WHERE l.assigned_executive_id IS NULL
  AND NULLIF(LTRIM(RTRIM(l.executive)), N'') IS NOT NULL;

/* Optional IDs must point to an existing executive when supplied. */
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_added_loans_executive1' AND parent_object_id = OBJECT_ID(N'dbo.added_loans'))
    ALTER TABLE dbo.added_loans WITH NOCHECK ADD CONSTRAINT FK_added_loans_executive1 FOREIGN KEY (assigned_executive_id) REFERENCES dbo.executives(executive_id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_added_loans_executive2' AND parent_object_id = OBJECT_ID(N'dbo.added_loans'))
    ALTER TABLE dbo.added_loans WITH NOCHECK ADD CONSTRAINT FK_added_loans_executive2 FOREIGN KEY (executive2_id) REFERENCES dbo.executives(executive_id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_added_loans_executive3' AND parent_object_id = OBJECT_ID(N'dbo.added_loans'))
    ALTER TABLE dbo.added_loans WITH NOCHECK ADD CONSTRAINT FK_added_loans_executive3 FOREIGN KEY (executive3_id) REFERENCES dbo.executives(executive_id);

COMMIT TRANSACTION;
GO

/* Verify the resulting columns and current assignment backfill. */
SELECT c.name AS column_name, TYPE_NAME(c.user_type_id) AS data_type, c.is_nullable
FROM sys.columns AS c
WHERE c.object_id = OBJECT_ID(N'dbo.added_loans')
  AND c.name IN (N'assigned_executive_id', N'executive2_id', N'executive3_id')
ORDER BY c.name;
GO
