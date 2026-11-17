USE [GreenFinanceDB];
GO

IF OBJECT_ID(N'dbo.executives', N'U') IS NULL
BEGIN
    THROW 50001, 'dbo.executives table was not found in GreenFinanceDB.', 1;
END
GO

IF EXISTS (
    SELECT 1
    FROM sys.key_constraints
    WHERE parent_object_id = OBJECT_ID(N'dbo.executives')
      AND name = N'UQ_executives_username'
      AND type = N'UQ'
)
BEGIN
    ALTER TABLE dbo.executives
    DROP CONSTRAINT UQ_executives_username;
END
GO

IF EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.executives')
      AND name = N'UQ_executives_username'
      AND is_unique = 1
)
BEGIN
    DROP INDEX UQ_executives_username ON dbo.executives;
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.executives')
      AND name = N'UX_executives_username_not_null'
)
BEGIN
    CREATE UNIQUE INDEX UX_executives_username_not_null
    ON dbo.executives(username)
    WHERE username IS NOT NULL;
END
GO

SELECT executive_id, executive_code, username, role
FROM dbo.executives
ORDER BY executive_id;
GO
