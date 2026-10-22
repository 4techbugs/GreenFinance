USE [GreenFinanceDB];
GO

/* =========================================================
   PREFIX LOAN MASTER TABLE
   ID is SQL Server IDENTITY: 1, 2, 3, 4 ...
   ========================================================= */
IF OBJECT_ID(N'dbo.prefix_loans', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.prefix_loans
    (
        id BIGINT IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_prefix_loans PRIMARY KEY,
        loan_type NVARCHAR(200) NOT NULL,
        loan_amount DECIMAL(18,2) NOT NULL CONSTRAINT DF_prefix_loans_amount DEFAULT (0),
        repay_amount DECIMAL(18,2) NOT NULL CONSTRAINT DF_prefix_loans_repay DEFAULT (0),
        emi DECIMAL(18,2) NOT NULL CONSTRAINT DF_prefix_loans_emi DEFAULT (0),
        tenure INT NOT NULL CONSTRAINT DF_prefix_loans_tenure DEFAULT (0),
        created_at DATETIME2 NOT NULL CONSTRAINT DF_prefix_loans_created DEFAULT SYSDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_prefix_loans_updated DEFAULT SYSDATETIME()
    );
END;
GO

/* Add starter Prefix Loans only if the table is empty. */
IF NOT EXISTS (SELECT 1 FROM dbo.prefix_loans)
BEGIN
    INSERT INTO dbo.prefix_loans
        (loan_type, loan_amount, repay_amount, emi, tenure)
    VALUES
        (N'Personal Loan', 2000, 2500, 250, 100),
        (N'Home Loan', 50000, 60000, 3000, 120),
        (N'Car Loan', 50000, 60000, 3000, 120);
END;
GO

/* Convert old Add Loan references such as PL003 -> 3. */
IF OBJECT_ID(N'dbo.added_loans', N'U') IS NOT NULL
BEGIN
    UPDATE dbo.added_loans
    SET prefix_loan_id = CONVERT(NVARCHAR(50),
        TRY_CONVERT(BIGINT,
            CASE
                WHEN UPPER(LTRIM(RTRIM(prefix_loan_id))) LIKE N'PL%'
                    THEN SUBSTRING(LTRIM(RTRIM(prefix_loan_id)), 3, 50)
                ELSE LTRIM(RTRIM(prefix_loan_id))
            END))
    WHERE prefix_loan_id IS NOT NULL
      AND TRY_CONVERT(BIGINT,
            CASE
                WHEN UPPER(LTRIM(RTRIM(prefix_loan_id))) LIKE N'PL%'
                    THEN SUBSTRING(LTRIM(RTRIM(prefix_loan_id)), 3, 50)
                ELSE LTRIM(RTRIM(prefix_loan_id))
            END) IS NOT NULL;
END;
GO

/* Verification */
SELECT
    id,
    loan_type,
    loan_amount,
    repay_amount,
    emi,
    tenure,
    created_at
FROM dbo.prefix_loans
ORDER BY id;
GO

SELECT
    loan_id,
    prefix_loan_id,
    loan_type,
    loan_amount
FROM dbo.added_loans
ORDER BY loan_id;
GO
