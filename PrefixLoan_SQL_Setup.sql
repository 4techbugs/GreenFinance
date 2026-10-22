USE GreenFinanceDB;
GO

IF OBJECT_ID(N'dbo.prefix_loans', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.prefix_loans (
        id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        loan_type NVARCHAR(200) NOT NULL,
        loan_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
        repay_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
        emi DECIMAL(18,2) NOT NULL DEFAULT 0,
        tenure INT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
    );
END
GO

SELECT * FROM dbo.prefix_loans ORDER BY id;
GO
