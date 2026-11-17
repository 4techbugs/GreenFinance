-- Green Finance - Transaction Table
-- Run this script manually in GreenFinanceDB before using the Transactions section.

IF OBJECT_ID(N'dbo.transaction_tb', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.transaction_tb
    (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_transaction_tb PRIMARY KEY,
        [date] DATE NOT NULL,
        from_ac INT NULL,
        to_ac INT NULL,
        from_loan NVARCHAR(50) NULL,
        to_loan NVARCHAR(50) NULL,
        amount DECIMAL(18,2) NOT NULL,
        remark NVARCHAR(1000) NULL
    );
END;
GO

-- Helpful indexes for account/loan transaction history.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_transaction_tb_date'
      AND object_id = OBJECT_ID(N'dbo.transaction_tb')
)
BEGIN
    CREATE INDEX IX_transaction_tb_date ON dbo.transaction_tb([date], id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_transaction_tb_from_to_ac'
      AND object_id = OBJECT_ID(N'dbo.transaction_tb')
)
BEGIN
    CREATE INDEX IX_transaction_tb_from_to_ac ON dbo.transaction_tb(from_ac, to_ac);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_transaction_tb_loan'
      AND object_id = OBJECT_ID(N'dbo.transaction_tb')
)
BEGIN
    CREATE INDEX IX_transaction_tb_loan ON dbo.transaction_tb(from_loan, to_loan);
END;
GO
