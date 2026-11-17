/* Green Finance: configurable penalty for short/partial payments.
   Run this migration once against GreenFinanceDB before deploying the updated app. */
IF OBJECT_ID(N'dbo.added_loans', N'U') IS NULL
    THROW 50001, 'dbo.added_loans does not exist. Run the existing Green Finance setup first.', 1;
GO
IF COL_LENGTH(N'dbo.added_loans', N'penalty_fee') IS NULL
BEGIN
    ALTER TABLE dbo.added_loans
      ADD penalty_fee DECIMAL(18,2) NOT NULL
          CONSTRAINT DF_added_loans_penalty_fee DEFAULT (50);
END;
GO
/* Existing loans retain the previous ₹50 behavior through the default. */
