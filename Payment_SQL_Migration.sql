USE [GreenFinanceDB];
GO

/* =========================================================
   GREEN FINANCE - PAYMENT WORKFLOW MIGRATION
   SAFE ADDITIVE MIGRATION ONLY.
   It does not DROP, TRUNCATE or recreate existing tables.
   ========================================================= */

IF OBJECT_ID(N'dbo.added_loans', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH(N'dbo.added_loans', N'loan_status') IS NULL
    BEGIN
        ALTER TABLE dbo.added_loans
        ADD loan_status NVARCHAR(20) NOT NULL
            CONSTRAINT DF_added_loans_status DEFAULT N'Active';
    END;
END;
GO

IF OBJECT_ID(N'dbo.tb_loan_payment', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.tb_loan_payment
    (
        payment_id BIGINT IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_tb_loan_payment PRIMARY KEY,
        loan_id NVARCHAR(50) NOT NULL,
        payment_date DATE NOT NULL,
        day_number INT NOT NULL,
        emi_amount DECIMAL(18,2) NOT NULL
            CONSTRAINT DF_tb_loan_payment_emi DEFAULT (0),
        paying_amount DECIMAL(18,2) NOT NULL
            CONSTRAINT DF_tb_loan_payment_paying DEFAULT (0),
        receiving_amount DECIMAL(18,2) NOT NULL
            CONSTRAINT DF_tb_loan_payment_receiving DEFAULT (0),
        remaining_amount DECIMAL(18,2) NOT NULL
            CONSTRAINT DF_tb_loan_payment_remaining DEFAULT (0),
        penalty_amount DECIMAL(18,2) NOT NULL
            CONSTRAINT DF_tb_loan_payment_penalty DEFAULT (0),
        penalty_paid BIT NOT NULL
            CONSTRAINT DF_tb_loan_payment_penalty_paid DEFAULT (0),
        discount_amount DECIMAL(18,2) NOT NULL
            CONSTRAINT DF_tb_loan_payment_discount DEFAULT (0),
        reference_id NVARCHAR(50) NULL,
        reference_remark NVARCHAR(1000) NULL,
        remark NVARCHAR(1000) NULL,
        status NVARCHAR(20) NOT NULL
            CONSTRAINT DF_tb_loan_payment_status DEFAULT N'Pending',
        created_by INT NULL,
        created_date DATETIME2 NOT NULL
            CONSTRAINT DF_tb_loan_payment_created DEFAULT SYSDATETIME(),
        modified_by INT NULL,
        modified_date DATETIME2 NULL
    );

    CREATE INDEX IX_tb_loan_payment_loan_date
        ON dbo.tb_loan_payment(loan_id, payment_date);
END;
GO

IF OBJECT_ID(N'dbo.tb_loan_payment', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH(N'dbo.tb_loan_payment', N'reference_id') IS NULL
        ALTER TABLE dbo.tb_loan_payment ADD reference_id NVARCHAR(50) NULL;
    IF COL_LENGTH(N'dbo.tb_loan_payment', N'reference_remark') IS NULL
        ALTER TABLE dbo.tb_loan_payment ADD reference_remark NVARCHAR(1000) NULL;
END;
GO

IF OBJECT_ID(N'dbo.tb_loan_payment', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH(N'dbo.tb_loan_payment', N'payment_id') IS NULL
        THROW 51000, 'dbo.tb_loan_payment exists but payment_id is missing. No existing table was modified.', 1;

    IF COL_LENGTH(N'dbo.tb_loan_payment', N'loan_id') IS NULL
        ALTER TABLE dbo.tb_loan_payment ADD loan_id NVARCHAR(50) NULL;
    IF COL_LENGTH(N'dbo.tb_loan_payment', N'payment_date') IS NULL
        ALTER TABLE dbo.tb_loan_payment ADD payment_date DATE NULL;
    IF COL_LENGTH(N'dbo.tb_loan_payment', N'day_number') IS NULL
        ALTER TABLE dbo.tb_loan_payment ADD day_number INT NULL;
    IF COL_LENGTH(N'dbo.tb_loan_payment', N'emi_amount') IS NULL
        ALTER TABLE dbo.tb_loan_payment ADD emi_amount DECIMAL(18,2) NULL;
    IF COL_LENGTH(N'dbo.tb_loan_payment', N'paying_amount') IS NULL
        ALTER TABLE dbo.tb_loan_payment ADD paying_amount DECIMAL(18,2) NULL;
    IF COL_LENGTH(N'dbo.tb_loan_payment', N'receiving_amount') IS NULL
        ALTER TABLE dbo.tb_loan_payment ADD receiving_amount DECIMAL(18,2) NULL;
    IF COL_LENGTH(N'dbo.tb_loan_payment', N'remaining_amount') IS NULL
        ALTER TABLE dbo.tb_loan_payment ADD remaining_amount DECIMAL(18,2) NULL;
    IF COL_LENGTH(N'dbo.tb_loan_payment', N'penalty_amount') IS NULL
        ALTER TABLE dbo.tb_loan_payment ADD penalty_amount DECIMAL(18,2) NULL;
    IF COL_LENGTH(N'dbo.tb_loan_payment', N'penalty_paid') IS NULL
        ALTER TABLE dbo.tb_loan_payment ADD penalty_paid BIT NULL;
    IF COL_LENGTH(N'dbo.tb_loan_payment', N'discount_amount') IS NULL
        ALTER TABLE dbo.tb_loan_payment ADD discount_amount DECIMAL(18,2) NULL;
    IF COL_LENGTH(N'dbo.tb_loan_payment', N'remark') IS NULL
        ALTER TABLE dbo.tb_loan_payment ADD remark NVARCHAR(1000) NULL;
    IF COL_LENGTH(N'dbo.tb_loan_payment', N'status') IS NULL
        ALTER TABLE dbo.tb_loan_payment ADD status NVARCHAR(20) NULL;
    IF COL_LENGTH(N'dbo.tb_loan_payment', N'created_by') IS NULL
        ALTER TABLE dbo.tb_loan_payment ADD created_by INT NULL;
    IF COL_LENGTH(N'dbo.tb_loan_payment', N'created_date') IS NULL
        ALTER TABLE dbo.tb_loan_payment ADD created_date DATETIME2 NULL;
    IF COL_LENGTH(N'dbo.tb_loan_payment', N'modified_by') IS NULL
        ALTER TABLE dbo.tb_loan_payment ADD modified_by INT NULL;
    IF COL_LENGTH(N'dbo.tb_loan_payment', N'modified_date') IS NULL
        ALTER TABLE dbo.tb_loan_payment ADD modified_date DATETIME2 NULL;
END;
GO

IF OBJECT_ID(N'dbo.tb_loan_payment', N'U') IS NOT NULL
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_tb_loan_payment_loan_day' AND object_id = OBJECT_ID(N'dbo.tb_loan_payment'))
    BEGIN
        CREATE UNIQUE INDEX UX_tb_loan_payment_loan_day ON dbo.tb_loan_payment(loan_id, day_number);
    END;
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_tb_loan_payment_loan_date' AND object_id = OBJECT_ID(N'dbo.tb_loan_payment'))
    BEGIN
        CREATE INDEX IX_tb_loan_payment_loan_date ON dbo.tb_loan_payment(loan_id, payment_date);
    END;
END;
GO

/* Existing payment table is left untouched if it already exists. */
SELECT
    payment_id, loan_id, payment_date, day_number, emi_amount,
    paying_amount, receiving_amount, remaining_amount,
    penalty_amount, penalty_paid, discount_amount, reference_id, reference_remark, remark,
    status, created_by, created_date, modified_by, modified_date
FROM dbo.tb_loan_payment
ORDER BY loan_id, day_number;
GO
