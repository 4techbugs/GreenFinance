USE [GreenFinanceDB];
GO

/* =========================================================
   GREEN FINANCE - EXECUTIVE ROLE / FAMILY(NRE) MIGRATION
   SAFE ADDITIVE ONLY.
   This script is NOT executed by the application.
   It does not DROP, TRUNCATE or recreate dbo.executives.
   ========================================================= */

IF OBJECT_ID(N'dbo.executives', N'U') IS NULL
BEGIN
    THROW 50001, 'dbo.executives table was not found in GreenFinanceDB.', 1;
END
GO

IF COL_LENGTH(N'dbo.executives', N'role') IS NULL
BEGIN
    ALTER TABLE dbo.executives
    ADD role NVARCHAR(20) NOT NULL
        CONSTRAINT DF_executives_role DEFAULT (N'Executive');
END
GO

IF COL_LENGTH(N'dbo.executives', N'status') IS NULL
BEGIN
    ALTER TABLE dbo.executives
    ADD status NVARCHAR(20) NOT NULL
        CONSTRAINT DF_executives_status DEFAULT (N'Active');
END
GO

UPDATE dbo.executives
SET role = N'Executive'
WHERE role IS NULL OR LTRIM(RTRIM(role)) = N'';
GO

UPDATE dbo.executives
SET status = N'Active'
WHERE status IS NULL OR LTRIM(RTRIM(status)) = N'';
GO

SELECT executive_id, executive_code, full_name, username, status, role
FROM dbo.executives
ORDER BY executive_id;
GO
