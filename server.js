require("dotenv").config();

const path = require("path");
const express = require("express");

const dbAuth = String(process.env.DB_AUTH || "").trim().toLowerCase();
const trustedConnection = String(process.env.DB_TRUSTED_CONNECTION || "true").toLowerCase() === "true";
const useSqlAuthentication = dbAuth === "sql" || (!trustedConnection && dbAuth !== "windows");
const sql = useSqlAuthentication ? require("mssql") : require("mssql/msnodesqlv8");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "8mb" }));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

app.use(express.static(__dirname));

function parseDatabaseServer(value) {
  const server = String(value || "").trim();
  const hostAndPort = server.match(/^(.+),(\d+)$/);

  if (!hostAndPort) return { server };
  return { server: hostAndPort[1].trim(), port: Number(hostAndPort[2]) };
}

const databaseServer = parseDatabaseServer(
  process.env.DB_SERVER || "DESKTOP-JAFDM43\\SQLEXPRESS"
);

const config = {
  server: databaseServer.server,
  database: process.env.DB_DATABASE || "GreenFinanceDB",
  options: {
    trustedConnection: !useSqlAuthentication,
    encrypt: String(process.env.DB_ENCRYPT || "false").toLowerCase() === "true",
    trustServerCertificate: String(process.env.DB_TRUST_SERVER_CERTIFICATE || "true").toLowerCase() === "true"
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

if (databaseServer.port) config.port = databaseServer.port;

if (useSqlAuthentication) {
  config.user = process.env.DB_USER || "";
  config.password = process.env.DB_PASSWORD || "";
}

function databaseAuthenticationLabel() {
  return useSqlAuthentication ? "SQL Server Authentication" : "Windows Authentication";
}

let poolPromise;
function getPool() {
  if (useSqlAuthentication && (!config.user || !config.password)) {
    throw new Error("DB_USER and DB_PASSWORD are required when DB_AUTH=sql.");
  }

  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config)
      .connect()
      .catch(err => {
        poolPromise = null;
        throw err;
      });
  }
  return poolPromise;
}

function safeJsonParse(value) {
  if (value === null || value === undefined || value === "") return null;
  if (Buffer.isBuffer(value)) {
    try {
      const text = value.toString("utf8");
      if (!text || text.trim() === "") return null;
      return JSON.parse(text);
    } catch (e) {
      return value.toString("utf8");
    }
  }
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return value;
  }
}

function normalizeProfileRow(row = {}) {
  const aadhaarProof = safeJsonParse(row.aadhaar_proof);
  const panProof = safeJsonParse(row.pan_proof);
  const selfImage = safeJsonParse(row.self_image);
  const otherContacts = safeJsonParse(row.other_contacts) || [];

  return {
    id: String(row.profile_id ?? row.id ?? ""),
    name: row.name ?? "",
    age: row.age ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    address: row.address ?? "",
    work: row.work ?? "",
    workPlace: row.work_place ?? "",
    officePhone: row.office_phone ?? "",
    aadhaar: row.aadhaar ?? "",
    pan: row.pan ?? "",
    aadhaarProof,
    panProof,
    selfImage,
    otherContacts
  };
}

async function getNextProfileId() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT profile_id
    FROM dbo.profiles
    ORDER BY profile_id;
  `);

  let maxNo = 0;
  for (const row of result.recordset || []) {
    const numericId = Number(row.profile_id ?? 0);
    if (Number.isFinite(numericId) && numericId > maxNo) maxNo = numericId;
  }

  return `PF${String(maxNo + 1).padStart(3, "0")}`;
}

function toDatabaseProfileId(profileId) {
  const match = String(profileId || "").match(/(\d+)$/);
  const raw = match ? match[1] : String(profileId || "");
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function normalizeProfileFileType(fileType) {
  const normalized = String(fileType || "").trim();
  const mapping = {
    aadhaar_proof: "aadhaarProof",
    aadhaarProof: "aadhaarProof",
    pan_proof: "panProof",
    panProof: "panProof",
    self_image: "selfImage",
    selfImage: "selfImage"
  };
  return mapping[normalized] || normalized;
}

async function saveProfileFileRecord(profileId, fileType, fileData) {
  // Profile documents are stored directly in the profiles table columns.
  // This legacy helper is intentionally kept as a no-op to avoid writing
  // to the legacy profile_files table, which has a stricter file_type CHECK
  // constraint than the current profile schema.
  return;
}

function normalizeLoanReference(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object") {
    const raw = value.id ?? value.profile_id ?? value.profileId ?? value.profileID ?? null;
    if (raw === null || raw === undefined || raw === "") return null;
    const numeric = Number(String(raw).trim());
    return Number.isFinite(numeric) ? numeric : String(raw).trim();
  }
  const text = String(value).trim();
  if (!text) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : text;
}

function buildNextLoanId(existingIds = []) {
  const ids = Array.isArray(existingIds) ? existingIds : [];
  const serialNumbers = ids
    .map(value => String(value ?? "").trim())
    .map(value => {
      const match = value.match(/(\d+)$/);
      return match ? Number(match[1]) : null;
    })
    .filter(value => Number.isInteger(value) && value >= 0);

  const nextNumber = serialNumbers.length ? Math.max(...serialNumbers) + 1 : 1;
  return String(nextNumber);
}

function normalizeAddedLoanRow(row = {}) {
  return {
    id: row.loan_id ?? row.id ?? "",
    applicant: normalizeLoanReference(safeJsonParse(row.applicant)),
    guarantor1: normalizeLoanReference(safeJsonParse(row.guarantor1)),
    guarantor2: normalizeLoanReference(safeJsonParse(row.guarantor2)),
    prefixLoanId: row.prefix_loan_id ?? row.prefixLoanId ?? "",
    loanType: row.loan_type ?? row.loanType ?? "",
    loanAmount: Number(row.loan_amount ?? row.loanAmount ?? 0),
    repayAmount: Number(row.repay_amount ?? row.repayAmount ?? 0),
    tenure: Number(row.tenure ?? 0),
    emi: Number(row.emi ?? 0),
    startDate: row.start_date ?? row.startDate ?? "",
    endDate: row.end_date ?? row.endDate ?? "",
    executive: row.executive ?? "",
    status: row.loan_status ?? row.status ?? "Active",
    savedAt: row.saved_at ?? row.savedAt ?? null
  };
}

let databaseSchemaPromise;

function ensureDatabaseSchema() {
  if (!databaseSchemaPromise) {
    databaseSchemaPromise = initializeDatabaseSchema();
  }
  return databaseSchemaPromise;
}

async function initializeDatabaseSchema() {
  // IMPORTANT: Existing GreenFinanceDB tables are owned by the user.
  // Never create/alter/drop/rebuild existing business tables here.
  // The payment workflow is the only schema this module is allowed to add.
  try {
    const pool = await getPool();
    await pool.request().query(`
      IF OBJECT_ID(N'dbo.tb_loan_payment', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.tb_loan_payment (
          payment_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_tb_loan_payment PRIMARY KEY,
          loan_id NVARCHAR(50) NOT NULL,
          payment_date DATE NOT NULL,
          day_number INT NOT NULL,
          emi_amount DECIMAL(18,2) NOT NULL CONSTRAINT DF_tb_loan_payment_emi DEFAULT (0),
          paying_amount DECIMAL(18,2) NOT NULL CONSTRAINT DF_tb_loan_payment_paying DEFAULT (0),
          receiving_amount DECIMAL(18,2) NOT NULL CONSTRAINT DF_tb_loan_payment_receiving DEFAULT (0),
          remaining_amount DECIMAL(18,2) NOT NULL CONSTRAINT DF_tb_loan_payment_remaining DEFAULT (0),
          penalty_amount DECIMAL(18,2) NOT NULL CONSTRAINT DF_tb_loan_payment_penalty DEFAULT (0),
          penalty_paid BIT NOT NULL CONSTRAINT DF_tb_loan_payment_penalty_paid DEFAULT (0),
          discount_amount DECIMAL(18,2) NOT NULL CONSTRAINT DF_tb_loan_payment_discount DEFAULT (0),
          reference_id NVARCHAR(50) NULL,
          reference_remark NVARCHAR(1000) NULL,
          remark NVARCHAR(1000) NULL,
          status NVARCHAR(20) NOT NULL CONSTRAINT DF_tb_loan_payment_status DEFAULT N'Pending',
          created_by INT NULL,
          created_date DATETIME2 NOT NULL CONSTRAINT DF_tb_loan_payment_created DEFAULT SYSDATETIME(),
          modified_by INT NULL,
          modified_date DATETIME2 NULL
        );
      END;

      IF OBJECT_ID(N'dbo.tb_loan_payment', N'U') IS NOT NULL
      BEGIN
        IF COL_LENGTH(N'dbo.tb_loan_payment', N'reference_id') IS NULL
          ALTER TABLE dbo.tb_loan_payment ADD reference_id NVARCHAR(50) NULL;
        IF COL_LENGTH(N'dbo.tb_loan_payment', N'reference_remark') IS NULL
          ALTER TABLE dbo.tb_loan_payment ADD reference_remark NVARCHAR(1000) NULL;
      END;

      -- These indexes belong only to the new payment table.
      IF OBJECT_ID(N'dbo.tb_loan_payment', N'U') IS NOT NULL
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM sys.indexes
          WHERE name = N'UX_tb_loan_payment_loan_day'
            AND object_id = OBJECT_ID(N'dbo.tb_loan_payment')
        )
        BEGIN
          CREATE UNIQUE INDEX UX_tb_loan_payment_loan_day
            ON dbo.tb_loan_payment(loan_id, day_number);
        END;

        IF NOT EXISTS (
          SELECT 1 FROM sys.indexes
          WHERE name = N'IX_tb_loan_payment_loan_date'
            AND object_id = OBJECT_ID(N'dbo.tb_loan_payment')
        )
        BEGIN
          CREATE INDEX IX_tb_loan_payment_loan_date
            ON dbo.tb_loan_payment(loan_id, payment_date);
        END;
      END;
    `);
  } catch (error) {
    console.error("Payment schema init failed:", error);
    databaseSchemaPromise = null;
    throw error;
  }
}
async function getProfileColumnMap() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'profiles';
  `);
  const names = new Set((result.recordset || []).map(r => String(r.COLUMN_NAME || "").toLowerCase()));

  return {
    nameColumn: names.has("name") ? "name" : (names.has("full_name") ? "full_name" : "name"),
    phoneColumn: names.has("phone") ? "phone" : (names.has("phone_number") ? "phone_number" : "phone"),
    emailColumn: names.has("email") ? "email" : (names.has("email_address") ? "email_address" : "email"),
    workColumn: names.has("work") ? "work" : (names.has("work_title") ? "work_title" : "work"),
    workPlaceColumn: names.has("work_place") ? "work_place" : "work_place",
    officePhoneColumn: names.has("office_phone") ? "office_phone" : "office_phone",
    aadhaarColumn: names.has("aadhaar") ? "aadhaar" : (names.has("aadhaar_number") ? "aadhaar_number" : "aadhaar"),
    panColumn: names.has("pan") ? "pan" : (names.has("pan_number") ? "pan_number" : "pan"),
    aadhaarProofColumn: names.has("aadhaar_proof") ? "aadhaar_proof" : "aadhaar_proof",
    panProofColumn: names.has("pan_proof") ? "pan_proof" : "pan_proof",
    selfImageColumn: names.has("self_image") ? "self_image" : "self_image",
    otherContactsColumn: names.has("other_contacts") ? "other_contacts" : "other_contacts"
  };
}

function normalizeExecutiveRow(row = {}) {
  const id = row.executive_code ?? row.id ?? row.executive_id ?? "";
  const status = row.status === "Acitve" ? "Active" : (row.status || "Active");
  return {
    executive_id: row.executive_id ?? null,
    executive_code: String(row.executive_code ?? id ?? ""),
    id: String(id ?? ""),
    name: row.full_name ?? row.name ?? "",
    phone: row.phone_number ?? row.phone ?? "",
    email: row.email_address ?? row.email ?? "",
    username: row.username ?? "",
    password: row.password_value ?? row.password ?? "",
    joining: row.joining_date ? new Date(row.joining_date).toISOString().slice(0, 10) : (row.joining || ""),
    status,
    photo: safeJsonParse(row.photo) || safeJsonParse(row.self_image) || null
  };
}

app.get("/api/health", async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query("SELECT DB_NAME() AS databaseName, @@SERVERNAME AS serverName;");
    res.json({
      ok: true,
      server: result.recordset[0].serverName,
      database: result.recordset[0].databaseName,
      authentication: databaseAuthenticationLabel(),
      username: useSqlAuthentication ? config.user : null
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "Username and password are required." });
  }

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input("username", sql.NVarChar(80), String(username).trim())
      .input("password", sql.NVarChar(255), String(password))
      .query(`
        SELECT
          executive_id,
          executive_code,
          full_name,
          username,
          phone_number,
          email_address,
          joining_date,
          status
        FROM dbo.executives
        WHERE username = @username AND password_value = @password;
      `);

    if (!result.recordset.length) {
      return res.status(401).json({ ok: false, error: "Invalid username or password." });
    }

    const user = result.recordset[0];
    return res.json({
      ok: true,
      user: {
        id: user.executive_id,
        code: user.executive_code,
        name: user.full_name,
        username: user.username,
        phone: user.phone_number,
        email: user.email_address,
        joiningDate: user.joining_date,
        status: user.status
      }
    });
  } catch (error) {
    console.error("Login failed:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

function normalizePrefixLoanRow(row = {}) {
  return {
    id: Number(row.id ?? 0),
    type: row.loan_type ?? row.type ?? "",
    amount: Number(row.loan_amount ?? row.amount ?? 0),
    repay: Number(row.repay_amount ?? row.repay ?? 0),
    emi: Number(row.emi ?? 0),
    tenure: Number(row.tenure ?? 0),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null
  };
}

app.get("/api/prefix-loans", async (req, res) => {
  try {
    await ensureDatabaseSchema();
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT id, loan_type, loan_amount, repay_amount, emi, tenure, created_at, updated_at
      FROM dbo.prefix_loans
      ORDER BY id;
    `);
    res.json({ ok: true, data: result.recordset.map(normalizePrefixLoanRow) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/prefix-loans", async (req, res) => {
  try {
    await ensureDatabaseSchema();
    const payload = req.body || {};
    const type = String(payload.type ?? payload.loan_type ?? "").trim();
    const amount = Number(payload.amount ?? payload.loan_amount ?? 0);
    const repay = Number(payload.repay ?? payload.repay_amount ?? 0);
    const emi = Number(payload.emi ?? 0);
    const tenure = Number(payload.tenure ?? 0);
    if (!type) return res.status(400).json({ ok: false, error: "Loan Type is required." });
    if (amount < 0 || repay < 0 || emi < 0 || tenure < 0) return res.status(400).json({ ok: false, error: "Loan values cannot be negative." });

    const pool = await getPool();
    const result = await pool.request()
      .input("loan_type", sql.NVarChar(200), type)
      .input("loan_amount", sql.Decimal(18, 2), amount)
      .input("repay_amount", sql.Decimal(18, 2), repay)
      .input("emi", sql.Decimal(18, 2), emi)
      .input("tenure", sql.Int, tenure)
      .query(`
        INSERT INTO dbo.prefix_loans (loan_type, loan_amount, repay_amount, emi, tenure)
        OUTPUT INSERTED.id, INSERTED.loan_type, INSERTED.loan_amount, INSERTED.repay_amount, INSERTED.emi, INSERTED.tenure, INSERTED.created_at, INSERTED.updated_at
        VALUES (@loan_type, @loan_amount, @repay_amount, @emi, @tenure);
      `);

    const row = result.recordset[0];
    const legacyId = String(payload.legacyId || "").trim();
    if (legacyId && /^PL\d+$/i.test(legacyId)) {
      await pool.request()
        .input("legacy_id", sql.NVarChar(50), legacyId)
        .input("new_id", sql.NVarChar(50), String(row.id))
        .query(`UPDATE dbo.added_loans SET prefix_loan_id = @new_id WHERE prefix_loan_id = @legacy_id;`)
        .catch(() => {});
    }

    res.json({ ok: true, prefixLoan: normalizePrefixLoanRow(row) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put("/api/prefix-loans/:id", async (req, res) => {
  try {
    await ensureDatabaseSchema();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: "Invalid Prefix Loan ID." });
    const payload = req.body || {};
    const type = String(payload.type ?? payload.loan_type ?? "").trim();
    const amount = Number(payload.amount ?? payload.loan_amount ?? 0);
    const repay = Number(payload.repay ?? payload.repay_amount ?? 0);
    const emi = Number(payload.emi ?? 0);
    const tenure = Number(payload.tenure ?? 0);
    if (!type) return res.status(400).json({ ok: false, error: "Loan Type is required." });

    const pool = await getPool();
    const result = await pool.request()
      .input("id", sql.BigInt, id)
      .input("loan_type", sql.NVarChar(200), type)
      .input("loan_amount", sql.Decimal(18, 2), amount)
      .input("repay_amount", sql.Decimal(18, 2), repay)
      .input("emi", sql.Decimal(18, 2), emi)
      .input("tenure", sql.Int, tenure)
      .query(`
        UPDATE dbo.prefix_loans
        SET loan_type=@loan_type, loan_amount=@loan_amount, repay_amount=@repay_amount, emi=@emi, tenure=@tenure, updated_at=SYSDATETIME()
        OUTPUT INSERTED.id, INSERTED.loan_type, INSERTED.loan_amount, INSERTED.repay_amount, INSERTED.emi, INSERTED.tenure, INSERTED.created_at, INSERTED.updated_at
        WHERE id=@id;
      `);
    if (!result.recordset.length) return res.status(404).json({ ok: false, error: "Prefix Loan not found." });
    res.json({ ok: true, prefixLoan: normalizePrefixLoanRow(result.recordset[0]) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete("/api/prefix-loans/:id", async (req, res) => {
  try {
    await ensureDatabaseSchema();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: "Invalid Prefix Loan ID." });
    const pool = await getPool();
    const result = await pool.request().input("id", sql.BigInt, id).query(`DELETE FROM dbo.prefix_loans WHERE id=@id;`);
    res.json({ ok: true, deleted: result.rowsAffected[0] > 0 });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/bootstrap", async (req, res) => {
  try {
    await ensureDatabaseSchema();
    const pool = await getPool();
    const tables = [
      { key: "la_prefix", table: "prefix_loans", shape: "array" },
      { key: "la_exec", table: "executives", shape: "array" },
      { key: "la_customers", table: "customers", shape: "array" },
      { key: "la_apps", table: "loan_applications", shape: "array" },
      { key: "la_reject", table: "rejected_loans", shape: "array" },
      { key: "la_merged", table: "merged_loans", shape: "array" },
      { key: "la_wallet", table: "executive_wallet", shape: "object" },
      { key: "la_history", table: "payment_history", shape: "array" },
      { key: "gf_profiles", table: "profiles", shape: "array" },
      { key: "la_add_loans", table: "added_loans", shape: "array" }
    ];

    const out = {};

    for (const meta of tables) {
      try {
        const result = await pool.request().query(`SELECT * FROM dbo.${meta.table};`);
        if (result.recordset.length) {
          out[meta.key] = meta.key === "la_exec"
            ? result.recordset.map(normalizeExecutiveRow)
            : meta.key === "la_add_loans"
              ? result.recordset.map(normalizeAddedLoanRow)
              : result.recordset.map(row => row);
        }
      } catch (tableError) {
        console.warn(`Bootstrap skipped table dbo.${meta.table}:`, tableError.message);
      }
    }

    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/profiles", async (req, res) => {
  try {
    await ensureDatabaseSchema();
    const pool = await getPool();
    const columnMap = await getProfileColumnMap();
    const result = await pool.request().query(`
      SELECT profile_id,
             ${columnMap.nameColumn},
             age,
             ${columnMap.phoneColumn},
             ${columnMap.emailColumn},
             address,
             ${columnMap.workColumn},
             ${columnMap.workPlaceColumn},
             ${columnMap.officePhoneColumn},
             ${columnMap.aadhaarColumn},
             ${columnMap.panColumn},
             ${columnMap.aadhaarProofColumn},
             ${columnMap.panProofColumn},
             ${columnMap.selfImageColumn},
             ${columnMap.otherContactsColumn}
      FROM dbo.profiles
      ORDER BY profile_id;
    `);

    const rows = result.recordset.map(normalizeProfileRow);
    const ids = rows.map(p => p.id).filter(Boolean);
    if (ids.length) {
      const safeIds = ids.map(id => `'${String(id).replace(/'/g, "''")}'`).join(", ");
      const fileResult = await pool.request().query(`
        SELECT profile_id, file_type, file_data
        FROM dbo.profile_files
        WHERE profile_id IN (${safeIds});
      `);

      const fileMap = {};
      for (const row of fileResult.recordset) {
        const value = safeJsonParse(row.file_data);
        const field = normalizeProfileFileType(row.file_type);
        if (field && value) {
          fileMap[row.profile_id] ||= {};
          fileMap[row.profile_id][field] = value;
        }
      }

      for (const profile of rows) {
        const files = fileMap[profile.id] || {};
        if (files.aadhaarProof) profile.aadhaarProof = files.aadhaarProof;
        if (files.panProof) profile.panProof = files.panProof;
        if (files.selfImage) profile.selfImage = files.selfImage;
      }
    }

    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/profiles", async (req, res) => {
  try {
    await ensureDatabaseSchema();
    const payload = req.body || {};
    const profileId = String(payload.id || await getNextProfileId()).trim();
    const profile = {
      id: profileId,
      name: String(payload.name || "").trim(),
      age: Number(payload.age || 0),
      phone: String(payload.phone || "").trim(),
      email: String(payload.email || "").trim(),
      address: String(payload.address || "").trim(),
      work: String(payload.work || "").trim(),
      workPlace: String(payload.workPlace || "").trim(),
      officePhone: String(payload.officePhone || "").trim(),
      aadhaar: String(payload.aadhaar || "").trim(),
      pan: String(payload.pan || "").trim(),
      aadhaarProof: payload.aadhaarProof || null,
      panProof: payload.panProof || null,
      selfImage: payload.selfImage || null,
      otherContacts: Array.isArray(payload.otherContacts) ? payload.otherContacts : []
    };

    const pool = await getPool();

    const duplicateCheck = await pool.request()
      .input("phone", sql.NVarChar(30), profile.phone || "")
      .input("aadhaar", sql.NVarChar(50), profile.aadhaar || "")
      .input("pan", sql.NVarChar(50), profile.pan || "")
      .input("profile_id", sql.Int, 0)
      .query(`
        SELECT TOP 1 profile_id
        FROM dbo.profiles
        WHERE profile_id <> @profile_id
          AND ((LEN(@phone) > 0 AND phone = @phone)
            OR (LEN(@aadhaar) > 0 AND aadhaar = @aadhaar)
            OR (LEN(@pan) > 0 AND pan = @pan));
      `);

    if (duplicateCheck.recordset.length) {
      return res.status(409).json({ ok: false, error: "A profile already exists with this mobile number, Aadhaar number, or PAN number." });
    }

    const columnMap = await getProfileColumnMap();
    const request = pool.request()
      .input("age", sql.Int, Number.isFinite(profile.age) ? profile.age : 0)
      .input("address", sql.NVarChar(500), profile.address)
      .input("aadhaar_proof", sql.NVarChar(sql.MAX), JSON.stringify(profile.aadhaarProof))
      .input("pan_proof", sql.NVarChar(sql.MAX), JSON.stringify(profile.panProof))
      .input("self_image", sql.NVarChar(sql.MAX), JSON.stringify(profile.selfImage))
      .input("other_contacts", sql.NVarChar(sql.MAX), JSON.stringify(profile.otherContacts));

    if (columnMap.nameColumn === "name") {
      request.input("name", sql.NVarChar(200), profile.name);
    } else {
      request.input("full_name", sql.NVarChar(200), profile.name);
    }

    if (columnMap.phoneColumn === "phone") {
      request.input("phone", sql.NVarChar(30), profile.phone);
    } else {
      request.input("phone_number", sql.NVarChar(30), profile.phone);
    }

    if (columnMap.emailColumn === "email") {
      request.input("email", sql.NVarChar(200), profile.email);
    } else {
      request.input("email_address", sql.NVarChar(200), profile.email);
    }

    if (columnMap.workColumn === "work") {
      request.input("work", sql.NVarChar(200), profile.work);
    } else {
      request.input("work_title", sql.NVarChar(200), profile.work);
    }

    request.input("work_place", sql.NVarChar(200), profile.workPlace)
      .input("office_phone", sql.NVarChar(30), profile.officePhone);

    if (columnMap.aadhaarColumn === "aadhaar") {
      request.input("aadhaar", sql.NVarChar(50), profile.aadhaar);
    } else {
      request.input("aadhaar_number", sql.NVarChar(50), profile.aadhaar);
    }

    if (columnMap.panColumn === "pan") {
      request.input("pan", sql.NVarChar(50), profile.pan);
    } else {
      request.input("pan_number", sql.NVarChar(50), profile.pan);
    }

    const insertColumns = [
      "profile_id",
      columnMap.nameColumn,
      "age",
      columnMap.phoneColumn,
      columnMap.emailColumn,
      "address",
      columnMap.workColumn,
      "work_place",
      "office_phone",
      columnMap.aadhaarColumn,
      columnMap.panColumn,
      "aadhaar_proof",
      "pan_proof",
      "self_image",
      "other_contacts",
      "created_at",
      "updated_at"
    ];

    await request.query(`
      INSERT INTO dbo.profiles (${insertColumns.filter(col => col !== "profile_id").join(", ")})
      VALUES (@${columnMap.nameColumn === "name" ? "name" : "full_name"}, @age, @${columnMap.phoneColumn === "phone" ? "phone" : "phone_number"}, @${columnMap.emailColumn === "email" ? "email" : "email_address"}, @address, @${columnMap.workColumn === "work" ? "work" : "work_title"}, @work_place, @office_phone, @${columnMap.aadhaarColumn === "aadhaar" ? "aadhaar" : "aadhaar_number"}, @${columnMap.panColumn === "pan" ? "pan" : "pan_number"}, @aadhaar_proof, @pan_proof, @self_image, @other_contacts, SYSDATETIME(), SYSDATETIME());
    `);

    res.json({ ok: true, profile: profile });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put("/api/profiles/:id", async (req, res) => {
  try {
    await ensureDatabaseSchema();
    const payload = req.body || {};
    const profileId = String(req.params.id || payload.id || "").trim();
    if (!profileId) {
      return res.status(400).json({ ok: false, error: "Profile id is required." });
    }

    const profile = {
      id: profileId,
      name: String(payload.name || "").trim(),
      age: Number(payload.age || 0),
      phone: String(payload.phone || "").trim(),
      email: String(payload.email || "").trim(),
      address: String(payload.address || "").trim(),
      work: String(payload.work || "").trim(),
      workPlace: String(payload.workPlace || "").trim(),
      officePhone: String(payload.officePhone || "").trim(),
      aadhaar: String(payload.aadhaar || "").trim(),
      pan: String(payload.pan || "").trim(),
      aadhaarProof: payload.aadhaarProof || null,
      panProof: payload.panProof || null,
      selfImage: payload.selfImage || null,
      otherContacts: Array.isArray(payload.otherContacts) ? payload.otherContacts : []
    };

    const pool = await getPool();

    const duplicateCheck = await pool.request()
      .input("phone", sql.NVarChar(30), profile.phone || "")
      .input("aadhaar", sql.NVarChar(50), profile.aadhaar || "")
      .input("pan", sql.NVarChar(50), profile.pan || "")
      .input("profile_id", sql.Int, toDatabaseProfileId(profileId))
      .query(`
        SELECT TOP 1 profile_id
        FROM dbo.profiles
        WHERE profile_id <> @profile_id
          AND ((LEN(@phone) > 0 AND phone = @phone)
            OR (LEN(@aadhaar) > 0 AND aadhaar = @aadhaar)
            OR (LEN(@pan) > 0 AND pan = @pan));
      `);

    if (duplicateCheck.recordset.length) {
      return res.status(409).json({ ok: false, error: "A profile already exists with this mobile number, Aadhaar number, or PAN number." });
    }

    const columnMap = await getProfileColumnMap();
    const request = pool.request()
      .input("age", sql.Int, Number.isFinite(profile.age) ? profile.age : 0)
      .input("address", sql.NVarChar(500), profile.address)
      .input("aadhaar_proof", sql.NVarChar(sql.MAX), JSON.stringify(profile.aadhaarProof))
      .input("pan_proof", sql.NVarChar(sql.MAX), JSON.stringify(profile.panProof))
      .input("self_image", sql.NVarChar(sql.MAX), JSON.stringify(profile.selfImage))
      .input("other_contacts", sql.NVarChar(sql.MAX), JSON.stringify(profile.otherContacts));

    if (columnMap.nameColumn === "name") {
      request.input("name", sql.NVarChar(200), profile.name);
    } else {
      request.input("full_name", sql.NVarChar(200), profile.name);
    }

    if (columnMap.phoneColumn === "phone") {
      request.input("phone", sql.NVarChar(30), profile.phone);
    } else {
      request.input("phone_number", sql.NVarChar(30), profile.phone);
    }

    if (columnMap.emailColumn === "email") {
      request.input("email", sql.NVarChar(200), profile.email);
    } else {
      request.input("email_address", sql.NVarChar(200), profile.email);
    }

    if (columnMap.workColumn === "work") {
      request.input("work", sql.NVarChar(200), profile.work);
    } else {
      request.input("work_title", sql.NVarChar(200), profile.work);
    }

    request.input("work_place", sql.NVarChar(200), profile.workPlace)
      .input("office_phone", sql.NVarChar(30), profile.officePhone);

    if (columnMap.aadhaarColumn === "aadhaar") {
      request.input("aadhaar", sql.NVarChar(50), profile.aadhaar);
    } else {
      request.input("aadhaar_number", sql.NVarChar(50), profile.aadhaar);
    }

    if (columnMap.panColumn === "pan") {
      request.input("pan", sql.NVarChar(50), profile.pan);
    } else {
      request.input("pan_number", sql.NVarChar(50), profile.pan);
    }

    const setClauses = [
      `${columnMap.nameColumn} = @${columnMap.nameColumn === "name" ? "name" : "full_name"}`,
      `age = @age`,
      `${columnMap.phoneColumn} = @${columnMap.phoneColumn === "phone" ? "phone" : "phone_number"}`,
      `${columnMap.emailColumn} = @${columnMap.emailColumn === "email" ? "email" : "email_address"}`,
      `address = @address`,
      `${columnMap.workColumn} = @${columnMap.workColumn === "work" ? "work" : "work_title"}`,
      `work_place = @work_place`,
      `office_phone = @office_phone`,
      `${columnMap.aadhaarColumn} = @${columnMap.aadhaarColumn === "aadhaar" ? "aadhaar" : "aadhaar_number"}`,
      `${columnMap.panColumn} = @${columnMap.panColumn === "pan" ? "pan" : "pan_number"}`,
      `aadhaar_proof = @aadhaar_proof`,
      `pan_proof = @pan_proof`,
      `self_image = @self_image`,
      `other_contacts = @other_contacts`,
      `updated_at = SYSDATETIME()`
    ];

    request.input("profile_id", sql.Int, toDatabaseProfileId(profileId));

    await request.query(`
      UPDATE dbo.profiles
      SET ${setClauses.join(", ")}
      WHERE profile_id = @profile_id;
    `);

    res.json({ ok: true, profile });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete("/api/profiles/:id", async (req, res) => {
  try {
    await ensureDatabaseSchema();
    const pool = await getPool();
    const id = String(req.params.id || "").trim();
    const result = await pool.request()
      .input("profile_id", sql.Int, toDatabaseProfileId(id))
      .query(`DELETE FROM dbo.profiles WHERE profile_id = @profile_id;`);
    res.json({ ok: true, deleted: result.rowsAffected[0] > 0 });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/loans", async (req, res) => {
  try {
    await ensureDatabaseSchema();
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT loan_id, applicant, guarantor1, guarantor2, prefix_loan_id, loan_type, loan_amount, repay_amount, tenure, emi,
             start_date, end_date, executive, loan_status, saved_at
      FROM dbo.added_loans
      ORDER BY loan_id;
    `);
    res.json({ ok: true, data: result.recordset.map(normalizeAddedLoanRow) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/loans", async (req, res) => {
  const payload = req.body || {};
  try {
    await ensureDatabaseSchema();
    const pool = await getPool();

    const existingLoanIds = (await pool.request().query(`SELECT loan_id FROM dbo.added_loans;`)).recordset
      .map(row => row.loan_id)
      .filter(Boolean);

    let loanId = String(payload.id || "").trim();
    if (!loanId) {
      loanId = buildNextLoanId(existingLoanIds);
      let attempts = 0;
      while ((await pool.request().input("loan_id", sql.NVarChar(50), loanId).query(`SELECT TOP 1 loan_id FROM dbo.added_loans WHERE loan_id = @loan_id;`)).recordset.length) {
        loanId = buildNextLoanId([...existingLoanIds, loanId]);
        attempts += 1;
        if (attempts > 1000) throw new Error("Unable to generate a unique Loan ID.");
      }
    }

    const loan = {
      id: loanId,
      applicant: normalizeLoanReference(payload.applicant),
      guarantor1: normalizeLoanReference(payload.guarantor1),
      guarantor2: normalizeLoanReference(payload.guarantor2),
      prefixLoanId: payload.prefixLoanId || "",
      loanType: payload.loanType || "",
      loanAmount: Number(payload.loanAmount || 0),
      repayAmount: Number(payload.repayAmount || 0),
      tenure: Math.max(0, Number(payload.tenure || 0)),
      emi: Number(payload.emi || 0),
      startDate: payload.startDate || "",
      endDate: payload.endDate || "",
      executive: payload.executive || "",
      status: "Active",
      savedAt: payload.savedAt || new Date().toISOString()
    };

    if (!loan.startDate || loan.tenure <= 0 || loan.emi <= 0) {
      return res.status(400).json({ ok: false, error: "Start date, tenure and EMI are required for the payment schedule." });
    }

    const referenceLoanId = String(payload.referenceLoanId || "").trim();
    const referenceRemark = String(payload.referenceRemark || "").trim();
    const forceNewLoan = payload.forceNewLoan === true;

    if (loan.applicant !== null && loan.applicant !== undefined) {
      const activeCheck = await pool.request()
        .input("applicant", sql.Int, Number(loan.applicant))
        .query(`SELECT TOP 1 loan_id FROM dbo.added_loans WHERE applicant = @applicant AND loan_status = N'Active' ORDER BY loan_id DESC;`);
      if (activeCheck.recordset.length && !forceNewLoan) {
        return res.status(409).json({ ok: false, code: "ACTIVE_LOAN_WARNING", error: "This customer already has an active loan.", activeLoanId: activeCheck.recordset[0].loan_id });
      }
    }

    if (referenceLoanId) {
      const ref = await pool.request()
        .input("reference_loan_id", sql.NVarChar(50), referenceLoanId)
        .query(`SELECT TOP 1 loan_id, applicant, loan_status FROM dbo.added_loans WHERE loan_id = @reference_loan_id;`);
      const source = ref.recordset[0];
      if (!source) return res.status(400).json({ ok: false, error: "Reference loan was not found." });
      if (String(source.loan_status || "Active") === "Active") return res.status(400).json({ ok: false, error: "A new loan can use a reference only from Close & Inactive." });
      if (source.applicant !== null && loan.applicant !== null && Number(source.applicant) !== Number(loan.applicant)) {
        return res.status(400).json({ ok: false, error: "Reference loan customer does not match the new loan customer." });
      }
      if (!referenceRemark) return res.status(400).json({ ok: false, error: "Reference Remark is required for a new loan from Close & Inactive." });
    }

    const createdBy = Number(payload.createdBy);
    const createdById = Number.isInteger(createdBy) && createdBy > 0 ? createdBy : null;
    if (createdById !== null) {
      const ex = await pool.request()
        .input("executive_id", sql.Int, createdById)
        .query(`SELECT TOP 1 executive_id FROM dbo.executives WHERE executive_id = @executive_id;`);
      if (!ex.recordset.length) {
        return res.status(400).json({ ok: false, error: "Invalid logged-in Executive ID." });
      }
    }

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx)
        .input("loan_id", sql.NVarChar(50), loanId)
        .input("applicant", sql.Int, loan.applicant ?? null)
        .input("guarantor1", sql.Int, loan.guarantor1 ?? null)
        .input("guarantor2", sql.Int, loan.guarantor2 ?? null)
        .input("prefix_loan_id", sql.NVarChar(50), loan.prefixLoanId)
        .input("loan_type", sql.NVarChar(200), loan.loanType)
        .input("loan_amount", sql.Decimal(18, 2), loan.loanAmount)
        .input("repay_amount", sql.Decimal(18, 2), loan.repayAmount)
        .input("tenure", sql.Int, loan.tenure)
        .input("emi", sql.Decimal(18, 2), loan.emi)
        .input("start_date", sql.Date, loan.startDate)
        .input("end_date", sql.Date, loan.endDate || null)
        .input("executive", sql.NVarChar(200), loan.executive)
        .input("status", sql.NVarChar(20), "Active")
        .input("saved_at", sql.DateTime2, loan.savedAt || new Date())
        .query(`
          INSERT INTO dbo.added_loans
            (loan_id, applicant, guarantor1, guarantor2, prefix_loan_id, loan_type, loan_amount, repay_amount, tenure, emi, start_date, end_date, executive, loan_status, saved_at, created_at, updated_at)
          VALUES
            (@loan_id, @applicant, @guarantor1, @guarantor2, @prefix_loan_id, @loan_type, @loan_amount, @repay_amount, @tenure, @emi, @start_date, @end_date, @executive, @status, @saved_at, SYSDATETIME(), SYSDATETIME());
        `);

      await new sql.Request(tx)
        .input("loan_id", sql.NVarChar(50), loanId)
        .input("start_date", sql.Date, loan.startDate)
        .input("tenure", sql.Int, loan.tenure)
        .input("emi", sql.Decimal(18, 2), loan.emi)
        .input("created_by", sql.Int, createdById)
        .input("reference_id", sql.NVarChar(50), referenceLoanId || null)
        .input("reference_remark", sql.NVarChar(1000), referenceLoanId ? referenceRemark : null)
        .query(`
          ;WITH Days AS (
            SELECT 1 AS day_number
            UNION ALL
            SELECT day_number + 1 FROM Days WHERE day_number < @tenure
          )
          INSERT INTO dbo.tb_loan_payment
            (loan_id, payment_date, day_number, emi_amount, paying_amount, receiving_amount,
             remaining_amount, penalty_amount, penalty_paid, discount_amount, reference_id, reference_remark, remark, status,
             created_by, created_date)
          SELECT
            @loan_id,
            DATEADD(day, day_number - 1, @start_date),
            day_number,
            @emi,
            @emi,
            0,
            0,
            0,
            0,
            0,
            @reference_id,
            @reference_remark,
            NULL,
            N'Pending',
            @created_by,
            SYSDATETIME()
          FROM Days
          OPTION (MAXRECURSION 0);
        `);

      await tx.commit();
    } catch (err) {
      try { await tx.rollback(); } catch (_) {}
      throw err;
    }

    res.json({ ok: true, loan });
  } catch (e) {
    console.error("Create loan failed:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put("/api/loans/:id", async (req, res) => {
  try {
    await ensureDatabaseSchema();
    const payload = req.body || {};
    const loanId = String(req.params.id || payload.id || "").trim();
    if (!loanId) {
      return res.status(400).json({ ok: false, error: "Loan id is required." });
    }

    const loan = {
      id: loanId,
      applicant: normalizeLoanReference(payload.applicant),
      guarantor1: normalizeLoanReference(payload.guarantor1),
      guarantor2: normalizeLoanReference(payload.guarantor2),
      prefixLoanId: payload.prefixLoanId || "",
      loanType: payload.loanType || "",
      loanAmount: Number(payload.loanAmount || 0),
      repayAmount: Number(payload.repayAmount || 0),
      tenure: Number(payload.tenure || 0),
      emi: Number(payload.emi || 0),
      startDate: payload.startDate || "",
      endDate: payload.endDate || "",
      executive: payload.executive || "",
      status: payload.status || "Active",
      savedAt: payload.savedAt || new Date().toISOString()
    };

    const pool = await getPool();
    await pool.request()
      .input("loan_id", sql.NVarChar(50), loanId)
      .input("applicant", sql.Int, loan.applicant ?? null)
      .input("guarantor1", sql.Int, loan.guarantor1 ?? null)
      .input("guarantor2", sql.Int, loan.guarantor2 ?? null)
      .input("prefix_loan_id", sql.NVarChar(50), loan.prefixLoanId)
      .input("loan_type", sql.NVarChar(200), loan.loanType)
      .input("loan_amount", sql.Decimal(18, 2), loan.loanAmount)
      .input("repay_amount", sql.Decimal(18, 2), loan.repayAmount)
      .input("tenure", sql.Int, loan.tenure)
      .input("emi", sql.Decimal(18, 2), loan.emi)
      .input("start_date", sql.Date, loan.startDate || null)
      .input("end_date", sql.Date, loan.endDate || null)
      .input("executive", sql.NVarChar(200), loan.executive)
      .input("status", sql.NVarChar(20), loan.status || "Active")
      .input("saved_at", sql.DateTime2, loan.savedAt || new Date())
      .query(`
        UPDATE dbo.added_loans
        SET applicant = @applicant,
            guarantor1 = @guarantor1,
            guarantor2 = @guarantor2,
            prefix_loan_id = @prefix_loan_id,
            loan_type = @loan_type,
            loan_amount = @loan_amount,
            repay_amount = @repay_amount,
            tenure = @tenure,
            emi = @emi,
            start_date = @start_date,
            end_date = @end_date,
            executive = @executive,
            loan_status = @status,
            saved_at = @saved_at,
            updated_at = SYSDATETIME()
        WHERE loan_id = @loan_id;
      `);

    res.json({ ok: true, loan });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete("/api/loans/:id", async (req, res) => {
  try {
    await ensureDatabaseSchema();
    const pool = await getPool();
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "Loan id is required." });

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const result = await new sql.Request(tx)
        .input("loan_id", sql.NVarChar(50), id)
        .query(`
          UPDATE dbo.added_loans
          SET loan_status = N'Inactive', updated_at = SYSDATETIME()
          WHERE loan_id = @loan_id;
        `);

      await new sql.Request(tx)
        .input("loan_id", sql.NVarChar(50), id)
        .query(`
          UPDATE dbo.tb_loan_payment
          SET status = N'Inactive', modified_date = SYSDATETIME()
          WHERE loan_id = @loan_id AND status <> N'Inactive';
        `);

      await tx.commit();
      res.json({ ok: true, deleted: result.rowsAffected[0] > 0, status: "Inactive" });
    } catch (e) {
      try { await tx.rollback(); } catch (_) {}
      throw e;
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


async function validateExecutiveId(pool, value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  const result = await pool.request()
    .input("executive_id", sql.Int, id)
    .query(`SELECT TOP 1 executive_id FROM dbo.executives WHERE executive_id = @executive_id;`);
  return result.recordset.length ? id : null;
}

async function ensurePaymentScheduleForLoan(pool, loanId, createdBy) {
  const loanResult = await pool.request()
    .input("loan_id", sql.NVarChar(50), loanId)
    .query(`
      SELECT TOP 1 loan_id, start_date, tenure, emi, loan_status
      FROM dbo.added_loans
      WHERE loan_id = @loan_id;
    `);
  const loan = loanResult.recordset[0];
  if (!loan) throw new Error("Loan not found.");
  if (String(loan.loan_status || "Active") !== "Active") return loan;

  const existing = await pool.request()
    .input("loan_id", sql.NVarChar(50), loanId)
    .query(`
      SELECT MAX(day_number) AS max_day, COUNT(*) AS total
      FROM dbo.tb_loan_payment
      WHERE loan_id = @loan_id;
    `);
  const maxDay = Number(existing.recordset[0]?.max_day || 0);
  const tenure = Math.max(0, Number(loan.tenure || 0));
  if (tenure <= 0 || !loan.start_date) return loan;

  if (maxDay === 0) {
    await pool.request()
      .input("loan_id", sql.NVarChar(50), loanId)
      .input("start_date", sql.Date, loan.start_date)
      .input("tenure", sql.Int, tenure)
      .input("emi", sql.Decimal(18, 2), Number(loan.emi || 0))
      .input("created_by", sql.Int, createdBy)
      .query(`
        ;WITH Days AS (
          SELECT 1 AS day_number
          UNION ALL
          SELECT day_number + 1 FROM Days WHERE day_number < @tenure
        )
        INSERT INTO dbo.tb_loan_payment
          (loan_id, payment_date, day_number, emi_amount, paying_amount, receiving_amount,
           remaining_amount, penalty_amount, penalty_paid, discount_amount, status,
           created_by, created_date)
        SELECT @loan_id, DATEADD(day, day_number - 1, @start_date), day_number,
               @emi, @emi, 0, 0, 0, 0, 0, N'Pending', @created_by, SYSDATETIME()
        FROM Days
        OPTION (MAXRECURSION 0);
      `);
  } else if (maxDay < tenure) {
    await pool.request()
      .input("loan_id", sql.NVarChar(50), loanId)
      .input("start_date", sql.Date, loan.start_date)
      .input("from_day", sql.Int, maxDay + 1)
      .input("to_day", sql.Int, tenure)
      .input("emi", sql.Decimal(18, 2), Number(loan.emi || 0))
      .input("created_by", sql.Int, createdBy)
      .query(`
        ;WITH Days AS (
          SELECT @from_day AS day_number
          UNION ALL
          SELECT day_number + 1 FROM Days WHERE day_number < @to_day
        )
        INSERT INTO dbo.tb_loan_payment
          (loan_id, payment_date, day_number, emi_amount, paying_amount, receiving_amount,
           remaining_amount, penalty_amount, penalty_paid, discount_amount, status,
           created_by, created_date)
        SELECT @loan_id, DATEADD(day, day_number - 1, @start_date), day_number,
               @emi, @emi, 0, 0, 0, 0, 0, N'Pending', @created_by, SYSDATETIME()
        FROM Days
        OPTION (MAXRECURSION 0);
      `);
  }
  return loan;
}

async function getLoanPaymentContext(pool, loanId, createdBy) {
  const loan = await ensurePaymentScheduleForLoan(pool, loanId, createdBy);
  const serverNowResult = await pool.request().query(`SELECT SYSDATETIME() AS server_now;`);
  const serverNow = serverNowResult.recordset[0].server_now;

  const rows = await pool.request()
    .input("loan_id", sql.NVarChar(50), loanId)
    .query(`
      SELECT payment_id, loan_id, payment_date, day_number, emi_amount, paying_amount,
             receiving_amount, remaining_amount, penalty_amount, penalty_paid,
             discount_amount, reference_id, reference_remark, remark, status, created_by, created_date,
             modified_by, modified_date
      FROM dbo.tb_loan_payment
      WHERE loan_id = @loan_id
      ORDER BY day_number;
    `);

  let current = null;
  if (String(loan.loan_status || "Active") === "Active") {
    current = rows.recordset.find(r =>
      String(r.status || "") === "Pending" &&
      new Date(r.payment_date) <= new Date(serverNow)
    ) || rows.recordset.find(r => String(r.status || "") === "Pending") || null;
  }

  return { loan, serverNow, rows: rows.recordset, current };
}

app.get("/api/payments/today", async (req, res) => {
  try {
    await ensureDatabaseSchema();
    const pool = await getPool();
    const result = await pool.request().query(`SELECT SYSDATETIME() AS server_now;`);
    res.json({ ok: true, serverNow: result.recordset[0].server_now });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/payments/loan/:id", async (req, res) => {
  try {
    await ensureDatabaseSchema();
    const pool = await getPool();
    const loanId = String(req.params.id || "").trim();
    const createdBy = await validateExecutiveId(pool, req.query.executiveId);
    const context = await getLoanPaymentContext(pool, loanId, createdBy);
    const profileId = context.loan.applicant;

    let customerName = "";
    if (profileId !== null && profileId !== undefined && String(profileId) !== "") {
      const p = await pool.request()
        .input("profile_id", sql.Int, Number(profileId))
        .query(`SELECT TOP 1 name FROM dbo.profiles WHERE profile_id = @profile_id;`);
      customerName = p.recordset[0]?.name || "";
    }

    const totalPaid = context.rows.reduce((sum, r) => sum + Math.max(0, Number(r.receiving_amount || 0)), 0);
    const totalRepay = Math.max(0, Number(context.loan.repay_amount || 0));
    const remainingAmount = Math.max(0, totalRepay - totalPaid);
    const totalPenalty = context.rows.reduce((sum, r) => sum + Math.max(0, Number(r.penalty_amount || 0)), 0);

    res.json({
      ok: true,
      serverNow: context.serverNow,
      loan: {
        id: context.loan.loan_id,
        customerName,
        repayAmount: totalRepay,
        payAmount: totalPaid,
        remainingAmount,
        totalPenalty,
        emi: Number(context.loan.emi || 0),
        startDate: context.loan.start_date,
        endDate: context.loan.end_date,
        status: context.loan.loan_status || "Active"
      },
      current: context.current,
      history: context.rows
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/payments", async (req, res) => {
  const payload = req.body || {};
  try {
    await ensureDatabaseSchema();
    const pool = await getPool();
    const loanId = String(payload.loanId || "").trim();
    if (!loanId) return res.status(400).json({ ok: false, error: "Loan ID is required." });

    const executiveId = await validateExecutiveId(pool, payload.executiveId);
    if (!executiveId) return res.status(400).json({ ok: false, error: "Valid logged-in Executive ID is required." });

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const loanResult = await new sql.Request(tx)
        .input("loan_id", sql.NVarChar(50), loanId)
        .query(`
          SELECT TOP 1 loan_id, emi, repay_amount, tenure, loan_status
          FROM dbo.added_loans WITH (UPDLOCK, HOLDLOCK)
          WHERE loan_id = @loan_id;
        `);
      const loan = loanResult.recordset[0];
      if (!loan) throw new Error("Loan not found.");
      if (String(loan.loan_status || "Active") !== "Active") throw new Error("This loan is already closed or inactive.");

      let paymentId = Number(payload.paymentId || 0);
      let row;
      if (paymentId > 0) {
        const result = await new sql.Request(tx)
          .input("payment_id", sql.BigInt, paymentId)
          .input("loan_id", sql.NVarChar(50), loanId)
          .query(`
            SELECT TOP 1 * FROM dbo.tb_loan_payment WITH (UPDLOCK, HOLDLOCK)
            WHERE payment_id = @payment_id AND loan_id = @loan_id;
          `);
        row = result.recordset[0];
      } else {
        const result = await new sql.Request(tx)
          .input("loan_id", sql.NVarChar(50), loanId)
          .query(`
            SELECT TOP 1 * FROM dbo.tb_loan_payment WITH (UPDLOCK, HOLDLOCK)
            WHERE loan_id = @loan_id AND status = N'Pending'
            ORDER BY day_number;
          `);
        row = result.recordset[0];
      }

      if (!row) throw new Error("No applicable payment entry was found.");

      const receiving = Math.max(0, Number(payload.receivingAmount || 0));
      const penaltyPayment = Math.max(0, Number(payload.penaltyAmount || 0));
      const discount = Math.max(0, Number(payload.discountAmount || 0));
      const paying = Math.max(0, Number(row.paying_amount || 0));
      const currentPenalty = Math.max(0, Number(row.penalty_amount || 0));
      const totalRepay = Math.max(0, Number(loan.repay_amount || 0));

      if (penaltyPayment > currentPenalty) throw new Error(`Penalty payment cannot exceed current penalty of ₹${currentPenalty.toFixed(2)}.`);
      if (discount > Math.max(0, currentPenalty - penaltyPayment)) throw new Error(`Discount cannot exceed the unpaid penalty after penalty payment (₹${Math.max(0, currentPenalty - penaltyPayment).toFixed(2)}).`);

      // Paying Amount is EMI + previous unpaid amount. Penalty is tracked separately.
      const unpaidAfterPayment = Math.max(0, paying - receiving);
      const nextPenaltyAdded = receiving < paying ? 50 : 0;
      const penaltyAfterSettlement = Math.max(0, currentPenalty - penaltyPayment - discount);
      const nextPenalty = penaltyAfterSettlement + nextPenaltyAdded;
      const status = (receiving > 0 || penaltyPayment > 0 || discount > 0) ? "Paid" : "Pending";
      const remark = payload.remark == null ? (row.remark || null) : String(payload.remark);

      const update = await new sql.Request(tx)
        .input("payment_id", sql.BigInt, Number(row.payment_id))
        .input("receiving_amount", sql.Decimal(18, 2), receiving)
        .input("remaining_amount", sql.Decimal(18, 2), unpaidAfterPayment)
        .input("penalty_amount", sql.Decimal(18, 2), penaltyAfterSettlement)
        .input("penalty_paid", sql.Bit, penaltyAfterSettlement <= 0 ? 1 : 0)
        .input("discount_amount", sql.Decimal(18, 2), discount)
        .input("remark", sql.NVarChar(1000), remark)
        .input("status", sql.NVarChar(20), status)
        .input("modified_by", sql.Int, executiveId)
        .query(`
          UPDATE dbo.tb_loan_payment
          SET receiving_amount = @receiving_amount,
              remaining_amount = @remaining_amount,
              penalty_amount = @penalty_amount,
              penalty_paid = @penalty_paid,
              discount_amount = @discount_amount,
              remark = @remark,
              status = @status,
              modified_by = @modified_by,
              modified_date = SYSDATETIME()
          WHERE payment_id = @payment_id;
        `);
      if (!update.rowsAffected[0]) throw new Error("Payment entry was not updated.");

      // Recalculate total paid after this payment. Penalties/discounts do not reduce loan principal/repayment balance.
      const totals = await new sql.Request(tx)
        .input("loan_id", sql.NVarChar(50), loanId)
        .query(`
          SELECT
            ISNULL(SUM(CASE WHEN receiving_amount > 0 THEN receiving_amount ELSE 0 END), 0) AS total_paid,
            ISNULL(SUM(CASE WHEN penalty_amount > 0 THEN penalty_amount ELSE 0 END), 0) AS total_penalty
          FROM dbo.tb_loan_payment
          WHERE loan_id = @loan_id;
        `);
      const totalPaid = Number(totals.recordset[0]?.total_paid || 0);
      const overallRemaining = Math.max(0, totalRepay - totalPaid);

      // Once the full repayment amount is received, close the account and stop all future dues.
      if (overallRemaining <= 0) {
        await new sql.Request(tx)
          .input("loan_id", sql.NVarChar(50), loanId)
          .query(`UPDATE dbo.added_loans SET loan_status = N'Closed', updated_at = SYSDATETIME() WHERE loan_id = @loan_id;`);
        await new sql.Request(tx)
          .input("loan_id", sql.NVarChar(50), loanId)
          .input("executive_id", sql.Int, executiveId)
          .query(`
            UPDATE dbo.tb_loan_payment
            SET status = CASE WHEN status = N'Pending' THEN N'Closed' ELSE status END,
                modified_by = @executive_id,
                modified_date = SYSDATETIME()
            WHERE loan_id = @loan_id AND status = N'Pending';
          `);
        await tx.commit();
        return res.json({ ok: true, paymentId: Number(row.payment_id), status: "Closed", payAmount: totalPaid, remainingAmount: 0, nextPenalty: 0, accountClosed: true });
      }

      // Determine the next day. During the original tenure it is EMI + unpaid amount.
      // After the scheduled tenure ends, no new EMI is added: only the outstanding balance carries forward.
      const nextDay = Number(row.day_number) + 1;
      const nextExists = await new sql.Request(tx)
        .input("loan_id", sql.NVarChar(50), loanId)
        .input("day_number", sql.Int, nextDay)
        .query(`
          SELECT TOP 1 payment_id, status, receiving_amount, paying_amount, penalty_amount
          FROM dbo.tb_loan_payment WITH (UPDLOCK, HOLDLOCK)
          WHERE loan_id = @loan_id AND day_number = @day_number;
        `);

      const originalTenure = Math.max(0, Number(loan.tenure || 0));
      const nextPaying = nextDay <= originalTenure
        ? Math.max(0, Number(loan.emi || row.emi_amount || 0)) + unpaidAfterPayment
        : unpaidAfterPayment;

      if (nextPaying > 0) {
        if (nextExists.recordset.length) {
          const next = nextExists.recordset[0];
          if (String(next.status) === "Pending" && Number(next.receiving_amount || 0) === 0) {
            await new sql.Request(tx)
              .input("payment_id", sql.BigInt, Number(next.payment_id))
              .input("paying_amount", sql.Decimal(18, 2), nextPaying)
              .input("penalty_amount", sql.Decimal(18, 2), nextPenalty)
              .query(`
                UPDATE dbo.tb_loan_payment
                SET paying_amount = @paying_amount,
                    penalty_amount = @penalty_amount,
                    penalty_paid = CASE WHEN @penalty_amount <= 0 THEN 1 ELSE 0 END
                WHERE payment_id = @payment_id;
              `);
          }
        } else {
          const nextDate = new Date(row.payment_date);
          nextDate.setUTCDate(nextDate.getUTCDate() + 1);
          await new sql.Request(tx)
            .input("loan_id", sql.NVarChar(50), loanId)
            .input("payment_date", sql.Date, nextDate)
            .input("day_number", sql.Int, nextDay)
            .input("emi_amount", sql.Decimal(18, 2), Number(loan.emi || row.emi_amount || 0))
            .input("paying_amount", sql.Decimal(18, 2), nextPaying)
            .input("penalty_amount", sql.Decimal(18, 2), nextPenalty)
            .input("created_by", sql.Int, executiveId)
            .query(`
              INSERT INTO dbo.tb_loan_payment
                (loan_id, payment_date, day_number, emi_amount, paying_amount, receiving_amount,
                 remaining_amount, penalty_amount, penalty_paid, discount_amount, status,
                 created_by, created_date)
              VALUES
                (@loan_id, @payment_date, @day_number, @emi_amount, @paying_amount, 0,
                 0, @penalty_amount, CASE WHEN @penalty_amount <= 0 THEN 1 ELSE 0 END, 0, N'Pending', @created_by, SYSDATETIME());
            `);
        }
      }

      await tx.commit();
      res.json({ ok: true, paymentId: Number(row.payment_id), status, payAmount: totalPaid, remainingAmount: overallRemaining, nextPenalty, accountClosed: false });
    } catch (e) {
      try { await tx.rollback(); } catch (_) {}
      throw e;
    }
  } catch (e) {
    console.error("Payment save failed:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/payments/close/:loanId", async (req, res) => {
  try {
    await ensureDatabaseSchema();
    const pool = await getPool();
    const loanId = String(req.params.loanId || "").trim();
    const executiveId = await validateExecutiveId(pool, req.body?.executiveId);
    if (!executiveId) return res.status(400).json({ ok: false, error: "Valid logged-in Executive ID is required." });

    const loanCheck = await pool.request()
      .input("loan_id", sql.NVarChar(50), loanId)
      .query(`SELECT TOP 1 repay_amount FROM dbo.added_loans WHERE loan_id = @loan_id AND loan_status = N'Active';`);
    if (!loanCheck.recordset.length) return res.status(404).json({ ok: false, error: "Active loan not found." });
    const paymentTotals = await pool.request()
      .input("loan_id", sql.NVarChar(50), loanId)
      .query(`SELECT ISNULL(SUM(CASE WHEN receiving_amount > 0 THEN receiving_amount ELSE 0 END),0) AS total_paid FROM dbo.tb_loan_payment WHERE loan_id=@loan_id;`);
    const closeRemaining = Math.max(0, Number(loanCheck.recordset[0].repay_amount || 0) - Number(paymentTotals.recordset[0]?.total_paid || 0));
    if (closeRemaining > 0 && req.body?.confirmOutstanding !== true) {
      return res.status(409).json({ ok: false, code: "OUTSTANDING_WARNING", error: `This loan still has ₹${closeRemaining.toFixed(2)} remaining.`, remainingAmount: closeRemaining });
    }

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx)
        .input("loan_id", sql.NVarChar(50), loanId)
        .query(`
          UPDATE dbo.added_loans
          SET loan_status = N'Closed', updated_at = SYSDATETIME()
          WHERE loan_id = @loan_id;
        `);
      await new sql.Request(tx)
        .input("loan_id", sql.NVarChar(50), loanId)
        .input("executive_id", sql.Int, executiveId)
        .query(`
          UPDATE dbo.tb_loan_payment
          SET status = N'Closed', modified_by = @executive_id, modified_date = SYSDATETIME()
          WHERE loan_id = @loan_id AND status = N'Pending';
        `);
      await tx.commit();
      res.json({ ok: true, status: "Closed" });
    } catch (e) {
      try { await tx.rollback(); } catch (_) {}
      throw e;
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/executives", async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT executive_id, executive_code, full_name, phone_number, email_address, username, password_value, joining_date, status, photo
      FROM dbo.executives
      ORDER BY executive_id;
    `);
    res.json({ ok: true, data: result.recordset.map(normalizeExecutiveRow) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/executives", async (req, res) => {
  const payload = req.body || {};
  const id = String(payload.id || payload.executive_code || payload.code || "").trim();
  const executiveCode = id || `EX${Date.now().toString().slice(-6)}`;
  const name = String(payload.name || "").trim();
  const phone = String(payload.phone || "").trim();
  const email = String(payload.email || "").trim();
  const username = String(payload.username || "").trim();
  const password = String(payload.password || "").trim();
  const joining = String(payload.joining || new Date().toISOString().slice(0, 10));
  const status = String(payload.status || "Active").trim();
  const photo = payload.photo || null;

  if (!name || !phone || !username) {
    return res.status(400).json({ ok: false, error: "Executive name, phone number and username are required." });
  }

  try {
    const pool = await getPool();
    await pool.request()
      .input("executive_code", sql.NVarChar(20), executiveCode)
      .input("full_name", sql.NVarChar(150), name)
      .input("phone_number", sql.NVarChar(20), phone)
      .input("email_address", sql.NVarChar(150), email)
      .input("username", sql.NVarChar(80), username)
      .input("password_value", sql.NVarChar(255), password)
      .input("joining_date", sql.Date, joining)
      .input("status", sql.NVarChar(20), status)
      .input("photo", sql.NVarChar(sql.MAX), JSON.stringify(photo))
      .query(`
        INSERT INTO dbo.executives (executive_code, full_name, phone_number, email_address, username, password_value, joining_date, status, photo)
        VALUES (@executive_code, @full_name, @phone_number, @email_address, @username, @password_value, @joining_date, @status, @photo);
      `);

    const saved = await pool.request()
      .input("executive_code", sql.NVarChar(20), executiveCode)
      .query(`
        SELECT executive_id, executive_code, full_name, phone_number, email_address, username, password_value, joining_date, status, photo
        FROM dbo.executives
        WHERE executive_code = @executive_code;
      `);

    const row = saved.recordset[0];
    return res.json({ ok: true, executive: normalizeExecutiveRow(row) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.put("/api/executives/:id", async (req, res) => {
  const { id } = req.params;
  const payload = req.body || {};
  const executiveCode = String(payload.id || payload.executive_code || id || "").trim();

  try {
    const pool = await getPool();
    await pool.request()
      .input("executive_code", sql.NVarChar(20), executiveCode)
      .input("full_name", sql.NVarChar(150), String(payload.name || "").trim())
      .input("phone_number", sql.NVarChar(20), String(payload.phone || "").trim())
      .input("email_address", sql.NVarChar(150), String(payload.email || "").trim())
      .input("username", sql.NVarChar(80), String(payload.username || "").trim())
      .input("password_value", sql.NVarChar(255), String(payload.password || "").trim())
      .input("joining_date", sql.Date, String(payload.joining || new Date().toISOString().slice(0, 10)))
      .input("status", sql.NVarChar(20), String(payload.status || "Active").trim())
      .input("photo", sql.NVarChar(sql.MAX), JSON.stringify(payload.photo || null))
      .query(`
        UPDATE dbo.executives
        SET executive_code = @executive_code,
            full_name = @full_name,
            phone_number = @phone_number,
            email_address = @email_address,
            username = @username,
            password_value = @password_value,
            joining_date = @joining_date,
            status = @status,
            photo = @photo,
            updated_at = SYSDATETIME()
        WHERE executive_code = @executive_code OR CAST(executive_id AS nvarchar(20)) = @executive_code;
      `);

    const saved = await pool.request()
      .input("executive_code", sql.NVarChar(20), executiveCode)
      .query(`
        SELECT executive_id, executive_code, full_name, phone_number, email_address, username, password_value, joining_date, status, photo
        FROM dbo.executives
        WHERE executive_code = @executive_code;
      `);

    const row = saved.recordset[0];
    return res.json({ ok: true, executive: normalizeExecutiveRow(row) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete("/api/executives/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input("executive_code", sql.NVarChar(20), String(id).trim())
      .query(`
        DELETE FROM dbo.executives
        WHERE executive_code = @executive_code OR CAST(executive_id AS nvarchar(20)) = @executive_code;
      `);

    return res.json({ ok: true, deleted: result.rowsAffected[0] > 0 });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.put("/api/data/:key", async (req, res) => {
  const allowed = new Set([
    "la_prefix","la_exec","la_customers","la_apps","la_reject",
    "la_merged","la_wallet","la_history","gf_profiles","la_add_loans"
  ]);

  if (!allowed.has(req.params.key)) {
    return res.status(400).json({ error: "Invalid dataset key" });
  }

  try {
    const pool = await getPool();
    const value = req.body;

    if (req.params.key === "la_exec") {
      for (const item of Array.isArray(value) ? value : []) {
        await pool.request()
          .input("executive_code", sql.NVarChar(20), item.id || item.executive_code || "")
          .input("full_name", sql.NVarChar(150), item.name || "")
          .input("phone_number", sql.NVarChar(20), item.phone || "")
          .input("email_address", sql.NVarChar(150), item.email || "")
          .input("username", sql.NVarChar(80), item.username || "")
          .input("password_value", sql.NVarChar(255), item.password || "")
          .input("joining_date", sql.Date, item.joining || new Date().toISOString().slice(0, 10))
          .input("status", sql.NVarChar(20), item.status || "Active")
          .input("photo", sql.NVarChar(sql.MAX), JSON.stringify(item.photo || null))
          .query(`
            IF EXISTS (SELECT 1 FROM dbo.executives WHERE executive_code = @executive_code)
              UPDATE dbo.executives SET full_name=@full_name, phone_number=@phone_number, email_address=@email_address, username=@username, password_value=@password_value, joining_date=@joining_date, status=@status, photo=@photo, updated_at=SYSDATETIME()
              WHERE executive_code=@executive_code;
            ELSE
              INSERT INTO dbo.executives(executive_code, full_name, phone_number, email_address, username, password_value, joining_date, status, photo)
              VALUES(@executive_code, @full_name, @phone_number, @email_address, @username, @password_value, @joining_date, @status, @photo);
          `);
      }
    }

    res.json({ ok: true, key: req.params.key });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/profile-files", async (req, res) => {
  res.json({ ok: true, message: "Profile files are stored directly in dbo.profiles." });
});

// Serve a profile image that is stored inside SQL Server as a data URL.
app.get("/api/profile-file/:profileId/:field", async (req, res) => {
  try {
    const profileId = String(req.params.profileId || "").trim();
    const field = String(req.params.field || "").trim();
    const dbFileType = normalizeProfileFileType(field);
    const profileColumnMap = { selfImage: "self_image", aadhaarProof: "aadhaar_proof", panProof: "pan_proof" };
    const profileColumn = profileColumnMap[field] || null;
    if (!profileId || !dbFileType || !profileColumn) {
      return res.status(400).json({ error: "Invalid profile file request." });
    }

    await ensureDatabaseSchema();
    const pool = await getPool();

    let result = await pool.request()
      .input("profile_id", sql.Int, toDatabaseProfileId(profileId))
      .input("file_type", sql.NVarChar(30), dbFileType)
      .query(`SELECT CAST(file_data AS NVARCHAR(MAX)) AS file_data FROM dbo.profile_files WHERE profile_id = @profile_id AND file_type = @file_type;`);

    if (!result.recordset.length) {
      result = await pool.request()
        .input("profile_id", sql.Int, toDatabaseProfileId(profileId))
        .query(`SELECT CAST(${profileColumn} AS NVARCHAR(MAX)) AS ${profileColumn} FROM dbo.profiles WHERE profile_id = @profile_id;`);
    }

    const storedValue = result.recordset.length ? (result.recordset[0].file_data ?? result.recordset[0][profileColumn]) : null;
    if (!storedValue) {
      return res.status(404).json({ error: "Profile file not found." });
    }

    const value = safeJsonParse(storedValue);
    const dataUrl = value && typeof value === "object" ? value.dataUrl : null;
    if (!dataUrl || !/^data:image\//i.test(dataUrl)) {
      return res.status(404).json({ error: "Profile image data not found." });
    }

    const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/i);
    if (!match) return res.status(404).json({ error: "Invalid stored image." });

    res.setHeader("Content-Type", match[1]);
    res.setHeader("Cache-Control", "no-store");
    res.send(Buffer.from(match[2], "base64"));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.use((req, res) => res.sendFile(path.join(__dirname, "index.html")));

app.listen(PORT, () => {
  console.log("");
  console.log("Green Finance is running");
  console.log(`Website: http://localhost:${PORT}`);
  console.log(`SQL Server: ${config.server}`);
  console.log(`Database: ${config.database}`);
  console.log(`Authentication: ${databaseAuthenticationLabel()}`);
  if (useSqlAuthentication) console.log(`Username: ${config.user || "(missing DB_USER)"}`);
  console.log("");
});
