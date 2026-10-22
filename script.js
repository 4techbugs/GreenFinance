// Green Finance data keys
const K = {
  p: "la_prefix",
  e: "la_exec",
  c: "la_customers",
  a: "la_apps",
  r: "la_reject",
  m: "la_merged",
  w: "la_wallet",
  h: "la_history",
  profiles: "gf_profiles",
  loans: "la_add_loans"
};

const $ = s => document.querySelector(s);
const all = s => [...document.querySelectorAll(s)];

// The app keeps its data in browser memory so it works without any database backend.
const APP_DATA = Object.create(null);
const DB_KEYS = [
  "la_prefix","la_exec","la_customers","la_apps","la_reject",
  "la_merged","la_wallet","la_history","gf_profiles","la_add_loans"
];
let DB_ONLINE = false;
const SYNC_QUEUE = Object.create(null);

const hasData = k => Object.prototype.hasOwnProperty.call(APP_DATA, k);
const get = k => hasData(k) ? APP_DATA[k] : [];

function normalizeExecutiveRow(row = {}) {
  const id = row.id ?? row.executive_code ?? row.executive_id ?? row.code ?? "";
  const joining = row.joining ?? row.joining_date;
  const status = row.status === "Acitve" ? "Active" : (row.status || "Active");

  return {
    id: String(id ?? ""),
    executive_id: row.executive_id ?? null,
    executive_code: String(row.executive_code ?? id ?? ""),
    name: row.name ?? row.full_name ?? "",
    phone: row.phone ?? row.phone_number ?? "",
    email: row.email ?? row.email_address ?? "",
    username: row.username ?? "",
    password: row.password ?? row.password_value ?? "",
    joining: joining ? new Date(joining).toISOString().slice(0, 10) : "",
    status,
    photo: row.photo ?? row.self_image ?? row.photo_data ?? null
  };
}

function normalizeExecutiveList(list = []) {
  return Array.isArray(list) ? list.map(normalizeExecutiveRow) : [];
}

function normalizeProfileList(list = []) {
  if (!Array.isArray(list)) return [];
  return list.map(item => ({
    ...item,
    id: String(item.id ?? item.profile_id ?? ""),
    workPlace: item.workPlace ?? item.work_place ?? "",
    officePhone: item.officePhone ?? item.office_phone ?? "",
    aadhaarProof: item.aadhaarProof ?? item.aadhaar_proof ?? null,
    panProof: item.panProof ?? item.pan_proof ?? null,
    selfImage: item.selfImage ?? item.self_image ?? null,
    otherContacts: Array.isArray(item.otherContacts) ? item.otherContacts : (Array.isArray(item.other_contacts) ? item.other_contacts : [])
  }));
}

function normalizeProfileId(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const match = raw.match(/(\d+)$/);
  return match ? match[1] : raw;
}

function findProfileById(id) {
  const target = normalizeProfileId(id);
  return (get(K.profiles) || []).find(profile => normalizeProfileId(profile?.id) === target);
}

function resolveProfileObject(value) {
  if (!value) return null;
  if (typeof value === "object") {
    if (value.id || value.profile_id || value.profileId || value.name) {
      return { ...value, id: String(value.id ?? value.profile_id ?? value.profileId ?? ""), name: value.name || "" };
    }
    return null;
  }

  const raw = String(value).trim();
  if (!raw) return null;
  const profile = findProfileById(raw);
  return profile ? profileSummary(profile) : { id: raw, name: raw };
}

function hydrateLoanApplicantNames() {
  const loans = get(K.loans) || [];
  if (!Array.isArray(loans)) return;
  const hydrated = loans.map(loan => ({
    ...loan,
    applicant: resolveProfileObject(loan.applicant),
    guarantor1: resolveProfileObject(loan.guarantor1),
    guarantor2: resolveProfileObject(loan.guarantor2)
  }));
  put(K.loans, hydrated);
}

function replaceProfileById(id, profile) {
  const target = normalizeProfileId(id);
  return (get(K.profiles) || []).map(item => normalizeProfileId(item?.id) === target ? profile : item);
}

function normalizeLoanList(list = []) {
  if (!Array.isArray(list)) return [];
  return list.map(item => ({
    ...item,
    id: item.id ?? item.loan_id ?? "",
    applicant: resolveProfileObject(item.applicant ?? item.applicant_id ?? item.profile_id ?? item.profileId ?? null),
    guarantor1: resolveProfileObject(item.guarantor1 ?? item.guarantor_1 ?? null),
    guarantor2: resolveProfileObject(item.guarantor2 ?? item.guarantor_2 ?? null),
    prefixLoanId: item.prefixLoanId ?? item.prefix_loan_id ?? "",
    loanType: item.loanType ?? item.loan_type ?? "",
    loanAmount: Number(item.loanAmount ?? item.loan_amount ?? 0),
    repayAmount: Number(item.repayAmount ?? item.repay_amount ?? 0),
    tenure: Number(item.tenure ?? 0),
    emi: Number(item.emi ?? 0),
    startDate: item.startDate ?? item.start_date ?? "",
    endDate: item.endDate ?? item.end_date ?? "",
    executive: item.executive ?? "",
    status: item.status ?? item.loan_status ?? "Active",
    savedAt: item.savedAt ?? item.saved_at ?? null
  }));
}

function normalizePrefixList(list = []) {
  if (!Array.isArray(list)) return [];
  return list.map(item => ({
    id: Number(item.id ?? 0),
    type: item.type ?? item.loan_type ?? "",
    amount: Number(item.amount ?? item.loan_amount ?? 0),
    repay: Number(item.repay ?? item.repay_amount ?? 0),
    emi: Number(item.emi ?? 0),
    tenure: Number(item.tenure ?? 0)
  })).filter(x => x.id > 0);
}

async function refreshPrefixLoansFromServer() {
  const response = await fetch('/api/prefix-loans');
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Prefix Loan fetch failed');
  const payload = await response.json();
  const rows = normalizePrefixList(payload.data || []);
  APP_DATA[K.p] = rows;
  return rows;
}

async function savePrefixLoanToServer(loan, id = '') {
  const response = await fetch(id ? `/api/prefix-loans/${encodeURIComponent(id)}` : '/api/prefix-loans', {
    method: id ? 'PUT' : 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({...loan, legacyId: id || loan.legacyId || ''})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Unable to save Prefix Loan');
  return normalizePrefixList([payload.prefixLoan])[0];
}

async function deletePrefixLoan(id) {
  if (!confirm('Delete this Prefix Loan?')) return;
  try {
    if (DB_ONLINE) {
      const response = await fetch(`/api/prefix-loans/${encodeURIComponent(id)}`, {method:'DELETE'});
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to delete Prefix Loan');
    }
    put(K.p, get(K.p).filter(x => String(x.id) !== String(id)));
    render('prefix');
    toast('Prefix Loan deleted');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Unable to delete Prefix Loan');
  }
}

function put(k, v) {
  APP_DATA[k] = v;
}

function syncDataSet() {
  return Promise.resolve();
}

async function syncProfileFiles() {
  return;
}

async function refreshProfilesFromServer() {
  try {
    const response = await fetch("/api/profiles");
    if (!response.ok) {
      throw new Error("Profile fetch failed");
    }

    const payload = await response.json().catch(() => ({}));
    const source = Array.isArray(payload) ? payload : (Array.isArray(payload.data) ? payload.data : (Array.isArray(payload.rows) ? payload.rows : []));
    const rows = normalizeProfileList(source);
    APP_DATA[K.profiles] = rows;
    hydrateLoanApplicantNames();
    return rows;
  } catch (error) {
    console.warn("Unable to refresh profiles from SQL Server", error);
    return get(K.profiles) || [];
  }
}

async function bootstrapDatabase() {
  try {
    const response = await fetch("/api/bootstrap");
    if (!response.ok) {
      throw new Error("Database bootstrap failed");
    }

    const data = await response.json();
    DB_ONLINE = true;

    for (const key of DB_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) continue;

      if (key === "la_exec") {
        APP_DATA[key] = normalizeExecutiveList(data[key]);
      } else if (key === "gf_profiles") {
        APP_DATA[key] = normalizeProfileList(data[key]);
      } else if (key === "la_add_loans") {
        APP_DATA[key] = normalizeLoanList(data[key]);
      } else {
        APP_DATA[key] = data[key];
      }
    }

    if (!hasData(K.p)) {
      APP_DATA[K.p] = [];
      const legacyPrefixes = [["PL001", "Personal Loan", 2000, 2500, 250, 100], ["PL002", "Home Loan", 50000, 60000, 3000, 120], ["PL003", "Car Loan", 50000, 60000, 3000, 120]];
      if (DB_ONLINE) {
        try {
          for (const x of legacyPrefixes) {
            const saved = await savePrefixLoanToServer({type:x[1], amount:x[2], repay:x[3], emi:x[4], tenure:x[5], legacyId:x[0]}, '');
            if (saved) APP_DATA[K.p].push(saved);
          }
        } catch (e) {
          console.warn('Prefix Loan SQL seed skipped:', e.message);
        }
      }
    } else if (DB_ONLINE) {
      APP_DATA[K.p] = normalizePrefixList(APP_DATA[K.p]);
    }
    // Never inject demo executives when SQL is online. Existing dbo.executives is authoritative.
    // A blank list is valid if the existing table currently has no rows.
    if (!hasData(K.e)) put(K.e, DB_ONLINE ? [] : []);
    if (!hasData(K.c)) put(K.c, []);
    if (!hasData(K.a)) put(K.a, []);
    if (!hasData(K.r)) put(K.r, []);
    if (!hasData(K.m)) put(K.m, []);
    if (!hasData(K.loans)) put(K.loans, []);
    if (!hasData(K.profiles) || !Array.isArray(get(K.profiles))) put(K.profiles, []);
    if (!hasData(K.w)) put(K.w, {});
    if (!hasData(K.h)) put(K.h, []);

    await refreshProfilesFromServer();
    if (DB_ONLINE) {
      try {
        const execResponse = await fetch("/api/executives");
        if (execResponse.ok) {
          const execPayload = await execResponse.json().catch(() => ({}));
          APP_DATA[K.e] = normalizeExecutiveList(execPayload.data || []);
        }
      } catch (e) {
        console.warn("Unable to refresh executives from SQL Server", e);
      }
    }
    console.log("Green Finance connected to SQL Server");
  } catch (error) {
    DB_ONLINE = false;
    console.error("Database load failed", error);
    toast("Database connection failed. Check SQL Server.");
  }
}

// Legacy IndexedDB helpers are retained only for backward compatibility.
// New uploads are stored in SQL Server through /api/profile-files.
const PROFILE_DB = "green_finance_profile_files";
const PROFILE_STORE = "files";
function openProfileDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PROFILE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(PROFILE_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function saveProfileFile(key, file) {
  if (!hasSelectedFile(file)) return null;
  const db = await openProfileDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROFILE_STORE, "readwrite");
    tx.objectStore(PROFILE_STORE).put(file, key);
    tx.oncomplete = () => { db.close(); resolve(key); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
// Remove legacy byte arrays from old profile metadata, if present.
(function cleanupLegacyProfileBytes(){
  try {
    const arr = get(K.profiles);
    if (!Array.isArray(arr)) return;
    let changed = false;
    const cleaned = arr.map(p => {
      const q = {...p};
      ["aadhaarProof","panProof","selfImage"].forEach(k => {
        if (q[k] && Array.isArray(q[k].bytes)) {
          const {bytes, ...meta} = q[k];
          q[k] = meta;
          changed = true;
        }
      });
      return q;
    });
    if (changed) put(K.profiles, cleaned);
  } catch(e) { console.warn("Profile storage cleanup skipped", e); }
})();
const money = n => "₹" + (+n || 0).toLocaleString("en-IN");
const esc = s => String(s ?? "").replace(/[&<>"']/g, x => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[x]));
const badge = s => `<span class="badge ${s === "Active" || s === "Approved" ? "active" : s === "Merged" ? "merged" : s === "Rejected" ? "rejected" : s === "Pending" ? "pending" : "inactive"}">${s}</span>`;
const toast = s => { $("#toast").textContent = s; $("#toast").classList.add("show"); setTimeout(() => $("#toast").classList.remove("show"), 1800); };

const AUTH_KEY = "green_finance_exec_session";

function getSession() {
  try {
    const value = localStorage.getItem(AUTH_KEY);
    return value ? JSON.parse(value) : null;
  } catch (e) {
    return null;
  }
}

function setSession(user) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(AUTH_KEY);
}

async function loginWithExecutive(username, password) {
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Login failed");
  }

  setSession(data.user);
  return data.user;
}

function showLoginScreen() {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="ey">Executive Login</div>
        <h2>Green Finance Portal</h2>
        <form id="executiveLoginForm" class="form">
          <div class="field">
            <label>Username</label>
            <input type="text" name="username" placeholder="Enter username" required>
          </div>
          <div class="field">
            <label>Password</label>
            <input type="password" name="password" placeholder="Enter password" required>
          </div>
          <button type="submit" class="btn primary" style="width:100%">Login</button>
        </form>
      </div>
    </div>
  `;

  document.getElementById("executiveLoginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const username = String(form.get("username") || "").trim();
    const password = String(form.get("password") || "");

    try {
      const user = await loginWithExecutive(username, password);
      toast(`Welcome ${user.name}`);
      document.querySelector("aside").style.display = "";
      document.querySelector("main header").style.display = "";
      bootstrapDatabase().finally(() => render());
    } catch (error) {
      toast(error.message || "Invalid login");
    }
  });

  const side = document.querySelector("aside");
  const header = document.querySelector("main header");
  if (side) side.style.display = "none";
  if (header) header.style.display = "none";
}

function dateAdd(d, n) {
  let x = new Date(d);
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
}

const types = ["Personal Loan", "Home Loan", "Car Loan", "Bike Loan", "Business Loan", "Education Loan", "Gold Loan", "Property Loan", "Vehicle Loan", "Agriculture Loan", "Medical Loan", "Wedding Loan", "Consumer Loan", "Other Loan"];

// Initial Setup & Seed Data
if (!hasData(K.p)) put(K.p, [["PL001", "Personal Loan", 2000, 2500, 250, 100], ["PL002", "Home Loan", 50000, 60000, 3000, 120], ["PL003", "Car Loan", 50000, 60000, 3000, 120]].map(x => ({ id: x[0], type: x[1], amount: x[2], repay: x[3], emi: x[4], tenure: x[5] })));
if (!hasData(K.e)) put(K.e, []);

const ex = get(K.e);
if (!hasData(K.c)) put(K.c, Array.from({ length: 5 }, (_, i) => ({ id: `C${String(i + 1).padStart(3, "0")}`, loanId: `LN-2026-${String(101 + i).padStart(5, "0")}`, name: ["Rahul Sharma", "Priya Mehta", "Vikram Malhotra", "Sneha Kapoor", "Arjun Patel"][i], executive: ex.length ? ex[i % ex.length].name : "", phone: `98${String(10000000 + i)}`, email: `customer${i + 1}@example.com`, age: 28 + i, aadhaar: `XXXX XXXX ${9000 + i}`, pan: `ABCDE${100 + i}F`, address: "New Delhi", occupation: "Businessman", guarantor: { name: "Demo Guarantor", age: 40, phone: "9710000000", email: "g@example.com", aadhaar: "XXXX XXXX 8000", pan: "BCDEF100G", address: "New Delhi", occupation: "Private Employee", relationship: "Brother" }, loanType: types[i], amount: 2000 * (i + 1), repay: 2500 * (i + 1), tenure: 100 + i * 10, emi: 250 * (i + 1), approval: "2026-08-10", firstEmi: "2026-08-11", lastEmi: "2026-11-18", status: "Active", remarks: "Maintained well." })));
if (!hasData(K.a)) put(K.a, []);
if (!hasData(K.r)) put(K.r, []);
if (!hasData(K.m)) put(K.m, []);
if (!hasData(K.loans)) put(K.loans, []);


if (!hasData(K.profiles)) {
  put(K.profiles, []);
}

// Initial Wallet & History Setup
if (!hasData(K.w)) {
  let wallet = {};
  get(K.e).forEach(e => wallet[e.name] = { collected: 5000, submitted: 2000 });
  put(K.w, wallet);
}
if (!hasData(K.h)) {
  put(K.h, []);
}

// Global Validation
function validatePhone(p) { return /^[6-9]\d{9}$/.test(p); }
function validatePAN(p) { return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(p); }

// CSV Export Utility
function exportTableToCSV(filename, tableId) {
  let rows = [];
  let table = document.getElementById(tableId);
  if(!table) return;
  for (let row of table.rows) {
    let cols = [...row.cells].map(c => `"${c.innerText.replace(/"/g, '""')}"`);
    rows.push(cols.join(","));
  }
  let csvContent = "data:text/csv;charset=utf-8," + rows.join("\n");
  let link = document.createElement("a");
  link.href = encodeURI(csvContent);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function downloadStoredFile(fileMeta, fallbackName = "document") {
  if (!fileMeta?.dataUrl) return toast("Document data is not available.");
  const link = document.createElement("a");
  link.href = fileMeta.dataUrl;
  link.download = fileMeta.name || fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
function downloadProfileProof(profileId, key) {
  const profile = findProfileById(profileId);
  const fileMeta = profile?.[key];
  downloadStoredFile(fileMeta, key === "aadhaarProof" ? "Aadhaar-Proof" : "PAN-Proof");
}

// UI Helpers
function head(title, sub, button = "") { return `<div class="head"><div><div class="ey">${sub}</div><h1>${title}</h1></div>${button}</div>`; }
function tableCard(title, headers, rows, id) {
  return `<div class="card"><div class="toolbar"><b>${title}</b><div><button class="btn secondary" onclick="exportTableToCSV('${id}.csv','${id}')" style="margin-right:8px;">📥 Export CSV</button><input class="find" data-table="${id}" placeholder="Search..."></div></div><div class="table"><table id="${id}"><thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function field(l, n, v = "", t = "text", full = false) { return `<div class="field ${full ? "full" : ""}"><label>${l}</label>${t === "text" && full ? `<textarea name="${n}">${esc(v)}</textarea>` : `<input type="${t}" name="${n}" value="${esc(v)}" required>`}</div>`; }
function num(l, n, v) { return field(l, n, v || 0, "number"); }
function sel(l, n, a, v) { return `<div class="field"><label>${l}</label><select name="${n}">${a.map(z => `<option ${z === v ? "selected" : ""}>${z}</option>`).join("")}</select></div>`; }
function person(p, x, g = false) { return [["Full Name", "name"], ["Age", "age"], ["Phone Number", "phone"], ["Email", "email"], ["Aadhaar Number", "aadhaar"], ["PAN Number", "pan"], ["Address", "address"], ["Occupation", "occupation"], ...(g ? [["Relationship with Customer", "relationship"]] : [])].map(([l, n]) => field(l, p + n, x[n] || "")).join(""); }

function formFields(x = {}, g = {}, id) {
  let exs = get(K.e).map(e => `<option ${e.name === x.executive ? "selected" : ""}>${esc(e.name)}</option>`).join("");
  return `<form id="customerForm" class="form"><div class="grid"><div class="title">Loan Details</div>${field("Loan ID", "loanId", x.loanId || "")}${field("Customer Name", "name", x.name || "")}${sel("Loan Type", "loanType", types, x.loanType)}${num("Loan Amount", "amount", x.amount)}${num("Repay Amount", "repay", x.repay)}${num("Tenure (Days)", "tenure", x.tenure)}${num("EMI", "emi", x.emi)}${field("Loan Approval Date", "approval", x.approval || "", "date")}${field("First EMI Date", "firstEmi", x.firstEmi || "", "date")}${field("Last EMI Date", "lastEmi", x.lastEmi || "", "date")}${sel("Loan Status", "status", ["Active", "Inactive", "Merged"], x.status)}<div class="field"><label>Assigned Executive</label><select name="executive"><option>Select Executive</option>${exs}</select></div>${field("Remarks", "remarks", x.remarks || "", "text", true)}<div class="title">Customer Details</div>${person("customer", x)}<div class="title">Guarantor Details</div>${person("guarantor", g, true)}</div><div class="formfoot"><button type="button" class="btn secondary close">Cancel</button><button class="btn primary">Save Customer</button></div></form>`;
}


// ==================== Profile / Master ====================
const profileRelations = ["Father","Mother","Brother","Sister","Spouse","Son","Daughter","Friend","Relative","Other"];

function profileField(label, name, value="", type="text", required=true, extra="") {
  return `<div class="field"><label>${label}${required ? " *" : ""}</label>
    <input type="${type}" name="${name}" value="${esc(value)}" ${required ? "required" : ""} ${extra}></div>`;
}

function profileContactRows(contacts=[]) {
  return contacts.map((c, i) => `
    <div class="other-contact-row" data-contact-index="${i}">
      <div class="field"><label>Name</label><input name="oc_name" value="${esc(c.name)}" required></div>
      <div class="field"><label>Relation</label><select name="oc_relation" required>${profileRelations.map(r => `<option ${r===c.relation?"selected":""}>${r}</option>`).join("")}</select></div>
      <div class="field"><label>Contact Number</label><input name="oc_phone" inputmode="numeric" maxlength="10" value="${esc(c.phone)}" required></div>
      <button type="button" class="other-delete" title="Delete contact" aria-label="Delete contact">×</button>
    </div>`).join("");
}

function profileDrawer(id="") {
  const profiles = get(K.profiles);
  const x = id ? findProfileById(id) : {otherContacts:[]};
  if (id && !x) return;
  const contacts = Array.isArray(x.otherContacts) ? x.otherContacts : [];
  const proofLabel = f => f ? `${esc(f.name)} (${Math.round((f.size||0)/1024)} KB)` : "No file uploaded";

  // Same centered popup/modal pattern as Add Customer.
  modal(`<div class="mhead"><div><div class="ey">Profile / Master</div><h2>${id ? "Edit Profile" : "Add Profile"}</h2></div><button type="button" class="close">×</button></div>
    <form id="profileForm" class="profile-form">
      <div class="profile-section">
        <div class="profile-section-title">Personal Details</div>
        <div class="grid">
          ${profileField("Name","name",x.name||"")}
          ${profileField("Age","age",x.age||"","number",true,'min="18" max="120"')}
          ${profileField("Contact Number","phone",x.phone||"","tel",true,'inputmode="numeric" maxlength="10"')}
          ${profileField("Email","email",x.email||"","email")}
          ${profileField("Address","address",x.address||"","text",true)}
          ${profileField("Work","work",x.work||"","text",false)}
          ${profileField("Work Place","workPlace",x.workPlace||"","text",false)}
          ${profileField("Office Contact Number","officePhone",x.officePhone||"","tel",false,'inputmode="numeric" maxlength="10"')}
          ${profileField("Aadhaar No.","aadhaar",x.aadhaar||"","text",true,'inputmode="numeric" maxlength="12"')}
          ${profileField("PAN No.","pan",x.pan||"","text",true,'maxlength="10" style="text-transform:uppercase"')}
          <div class="field"><label>Aadhaar Proof</label><input type="file" name="aadhaarProof" accept="image/*,.doc,.docx,.pdf"><small class="file-help">Image, DOC/DOCX or PDF • Maximum 1 MB${x.aadhaarProof ? ` • Existing: ${proofLabel(x.aadhaarProof)}` : ""}</small></div>
          <div class="field"><label>PAN Proof</label><input type="file" name="panProof" accept="image/*,.doc,.docx,.pdf"><small class="file-help">Image, DOC/DOCX or PDF • Maximum 1 MB${x.panProof ? ` • Existing: ${proofLabel(x.panProof)}` : ""}</small></div>
          <div class="field"><label>Self Image</label><input type="file" name="selfImage" accept="image/*">${x.selfImage?.dataUrl ? `<img id="profileSelfImagePreview" class="profile-self-image edit-self-image" src="${esc(x.selfImage.dataUrl)}" alt="Existing Self Image">` : `<div id="profileSelfImagePreview" class="profile-image-empty">No image uploaded</div>`}<small class="file-help">Image only • Maximum 1 MB • Stored in SQL Server${x.selfImage ? ` • Existing image: ${esc(x.selfImage.name||"uploaded")}` : ""}</small></div>
        </div>
      </div>

      <div class="profile-section">
        <div class="other-contact-head">
          <div>
            <div class="profile-section-title">Other Contact</div>
            <p>Add family or alternate contacts when required.</p>
          </div>
          <button type="button" class="btn secondary" id="addOtherContact">＋ Add Other Contact</button>
        </div>
        <div id="otherContactsList">${profileContactRows(contacts)}</div>
        <div id="contactLimitMsg" class="contact-limit-msg" ${contacts.length >= 10 ? "" : "hidden"}>Maximum 10 contacts allowed.</div>
      </div>

      <div class="formfoot profile-formfoot">
        <button type="button" class="btn secondary close">Cancel</button>

        <button type="submit" class="btn primary">${id ? "Update Profile" : "Save Profile"}</button>
      </div>

      </form>`);

  bindProfileDrawer(id, contacts.length);
}

function profileContactRow() {
  return `<div class="other-contact-row">
    <div class="field"><label>Name</label><input name="oc_name" required></div>
    <div class="field"><label>Relation</label><select name="oc_relation" required>${profileRelations.map(r => `<option>${r}</option>`).join("")}</select></div>
    <div class="field"><label>Contact Number</label><input name="oc_phone" inputmode="numeric" maxlength="10" required></div>
    <button type="button" class="other-delete" title="Delete contact" aria-label="Delete contact">×</button>
  </div>`;
}

function validateAadhaar(v) { return !v || /^\d{12}$/.test(v); }
function validateEmail(v) { return !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }

function hasSelectedFile(file) {
  return !!(file && typeof file.size === "number" && file.size > 0 && file.name);
}

function fileToBytes(file) {
  return new Promise((resolve, reject) => {
    if (!hasSelectedFile(file)) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(Array.from(new Uint8Array(reader.result)));
    reader.onerror = () => reject(reader.error || new Error("Unable to read file"));
    reader.readAsArrayBuffer(file);
  });
}

function fileMeta(file, key) {
  return file ? {name:file.name, type:file.type || "application/octet-stream", size:file.size, key} : null;
}

function fileMetaWithData(file, key) {
  return new Promise((resolve, reject) => {
    if (!hasSelectedFile(file)) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      key: key || null,
      dataUrl: String(reader.result || "")
    });
    reader.onerror = () => reject(reader.error || new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

function validateUpload(file, label, imageOnly=false) {
  // Empty File objects are returned when no new file is selected (important while editing).
  if (!hasSelectedFile(file)) return true;

  if (file.size > 1024 * 1024) {
    toast(`${label} must be under 1 MB.`);
    return false;
  }

  const ext = (String(file.name || "").split(".").pop() || "").toLowerCase();
  const type = String(file.type || "").toLowerCase();
  const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "jfif", "heic", "heif"];
  const isImageByType = type.startsWith("image/");
  const isImageByExtension = imageExts.includes(ext);

  // Some Windows browsers return an empty/incorrect MIME type for JPG/JPEG files.
  // Therefore validate Self Image by MIME type OR a known image extension.
  if (imageOnly) {
    if (!isImageByType && !isImageByExtension) {
      toast(`${label} must be a valid image (JPG, JPEG, PNG, WEBP, GIF, BMP).`);
      return false;
    }
    return true;
  }

  const allowed = isImageByType || isImageByExtension || ["pdf", "doc", "docx"].includes(ext);
  if (!allowed) {
    toast(`${label} must be an image, DOC/DOCX or PDF.`);
    return false;
  }
  return true;
}

function nextProfileId(profiles = get(K.profiles) || []) {
  let maxNo = 0;
  for (const profile of profiles) {
    const match = String(profile?.id || "").match(/(\d+)$/);
    if (match) {
      const num = Number(match[1]);
      if (num > maxNo) maxNo = num;
    }
  }
  return `PF${String(maxNo + 1).padStart(3, "0")}`;
}

function isDuplicateProfileField(profiles = [], currentId, field, value) {
  const cleanValue = String(value || "").trim();
  if (!cleanValue) return false;

  return profiles.some(profile => {
    if (currentId && String(profile?.id || "") === String(currentId)) return false;
    return String(profile?.[field] || "").trim() === cleanValue;
  });
}

function bindProfileDrawer(id, initialCount) {
  const form = $("#profileForm");
  const list = $("#otherContactsList");
  const selfImageInput = form.querySelector('input[name="selfImage"]');
  const selfImagePreview = () => {
    const file = selfImageInput?.files?.[0];
    if (!file || !hasSelectedFile(file)) return;
    const url = URL.createObjectURL(file);
    const oldPreview = form.querySelector('#profileSelfImagePreview');
    if (oldPreview) {
      if (oldPreview.tagName === 'IMG' && oldPreview.src.startsWith('blob:')) URL.revokeObjectURL(oldPreview.src);
      oldPreview.outerHTML = `<img id="profileSelfImagePreview" class="profile-self-image edit-self-image" src="${esc(url)}" alt="New Self Image">`;
    }
  };
  selfImageInput?.addEventListener('change', selfImagePreview);
  const addBtn = $("#addOtherContact");
  const limitMsg = $("#contactLimitMsg");

  function updateContactLimit() {
    const count = list.querySelectorAll(".other-contact-row").length;
    addBtn.disabled = count >= 10;
    limitMsg.hidden = count < 10;
  }

  addBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const count = list.querySelectorAll(".other-contact-row").length;
    if (count >= 10) return;
    list.insertAdjacentHTML("beforeend", profileContactRow());
    updateContactLimit();
    const rows = list.querySelectorAll(".other-contact-row");
    const last = rows[rows.length - 1];
    last.querySelector('input[name="oc_name"]').focus();
  });

  list.addEventListener("click", e => {
    const btn = e.target.closest(".other-delete");
    if (!btn) return;
    btn.closest(".other-contact-row").remove();
    updateContactLimit();
  });

  list.addEventListener("input", e => {
    if (e.target.matches('input[name="oc_phone"]')) e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10);
  });

  form.querySelectorAll('input[name="phone"], input[name="officePhone"]').forEach(input => {
    input.addEventListener("input", () => input.value = input.value.replace(/\D/g,"").slice(0,10));
  });
  form.querySelector('input[name="aadhaar"]').addEventListener("input", e => e.target.value = e.target.value.replace(/\D/g,"").slice(0,12));
  form.querySelector('input[name="pan"]').addEventListener("input", e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,10));

  form.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const phone = String(fd.get("phone")||"");
    const officePhone = String(fd.get("officePhone")||"");
    const aadhaar = String(fd.get("aadhaar")||"");
    const pan = String(fd.get("pan")||"").toUpperCase();
    const email = String(fd.get("email")||"").trim();
    const address = String(fd.get("address")||"").trim();
    const age = Number(fd.get("age"));
    const rows = [...list.querySelectorAll(".other-contact-row")];
    const aadhaarProofFile = fd.get("aadhaarProof");
    const panProofFile = fd.get("panProof");
    const selfImageFile = fd.get("selfImage");
    const newAadhaarProof = hasSelectedFile(aadhaarProofFile);
    const newPanProof = hasSelectedFile(panProofFile);
    const newSelfImage = hasSelectedFile(selfImageFile);

    const name = String(fd.get("name")||"").trim();
    if (!name) return toast("Name is mandatory!");
    if (!Number.isInteger(age) || age < 18 || age > 120) return toast("Enter a valid Age (18-120)!");
    if (!phone) return toast("Contact Number is mandatory!");
    if (!address) return toast("Address is mandatory!");
    if (!aadhaar) return toast("Aadhaar Number is mandatory!");
    if (!pan) return toast("PAN Number is mandatory!");
    if (!validatePhone(phone)) return toast("Enter a valid 10-digit Contact Number!");
    if (officePhone && !validatePhone(officePhone)) return toast("Enter a valid 10-digit Office Contact Number!");
    if (!validateEmail(email)) return toast("Enter a valid Email address!");
    if (!validateAadhaar(aadhaar)) return toast("Aadhaar Number must be exactly 12 digits!");
    if (!validatePAN(pan)) return toast("PAN Number is invalid. Use format ABCDE1234F.");
    if (!validateUpload(aadhaarProofFile, "Aadhaar Proof") || !validateUpload(panProofFile, "PAN Proof") || !validateUpload(selfImageFile, "Self Image", true)) return;

    const otherContacts = [];
    for (const row of rows) {
      const name = row.querySelector('[name="oc_name"]').value.trim();
      const relation = row.querySelector('[name="oc_relation"]').value;
      const cp = row.querySelector('[name="oc_phone"]').value.trim();
      if (!name || !relation || !cp) return toast("Complete every Other Contact row or delete it.");
      if (!validatePhone(cp)) return toast("Other Contact numbers must be valid 10-digit numbers.");
      otherContacts.push({name, relation, phone:cp});
    }

    const profiles = get(K.profiles) || [];
    if (isDuplicateProfileField(profiles, id, "phone", phone)) {
      return toast("This mobile number is already used in another profile.");
    }
    if (isDuplicateProfileField(profiles, id, "aadhaar", aadhaar)) {
      return toast("This Aadhaar number is already used in another profile.");
    }
    if (isDuplicateProfileField(profiles, id, "pan", pan)) {
      return toast("This PAN number is already used in another profile.");
    }

    try {
      const old = id ? findProfileById(id) : null;
      const profileId = id || nextProfileId(profiles);
      const profile = {
        ...(old || {}),
        id: profileId,
        name: String(fd.get("name")||"").trim(),
        age,
        phone,
        email,
        address,
        work: String(fd.get("work")||"").trim(),
        workPlace: String(fd.get("workPlace")||"").trim(),
        officePhone,
        aadhaar,
        pan,
        aadhaarProof: newAadhaarProof ? await fileMetaWithData(aadhaarProofFile, null) : (old?.aadhaarProof || null),
        panProof: newPanProof ? await fileMetaWithData(panProofFile, null) : (old?.panProof || null),
        selfImage: newSelfImage ? await fileMetaWithData(selfImageFile, null) : (old?.selfImage || null),
        otherContacts
      };

      const nextProfiles = id ? replaceProfileById(id, profile) : [...profiles, profile];
      if (DB_ONLINE) {
        const response = await fetch(id ? `/api/profiles/${encodeURIComponent(id)}` : "/api/profiles", {
          method: id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profile)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Unable to save profile");
        const saved = data.profile || profile;
        put(K.profiles, id ? replaceProfileById(id, saved) : [...profiles, saved]);
      } else {
        put(K.profiles, nextProfiles);
      }

      close();
      render("profiles");
      toast(id ? "Profile updated" : "Profile saved");
    } catch (err) {
      console.error(err);
      const msg = String(err && err.name || "");
      if (msg === "QuotaExceededError") {
        toast("Storage is full. Please remove an old profile/document and try again.");
      } else {
        toast(err.message || "Unable to save uploaded file. Please check the file (under 1 MB) and try again.");
      }
    }
  };

  updateContactLimit();
}

function viewProfile(id) {
  const x = findProfileById(id);
  if (!x) return;
  const contacts = (x.otherContacts||[]).map(c =>
    `<div class="profile-contact-view"><b>${esc(c.name)}</b><span>${esc(c.relation)}</span><span>${esc(c.phone)}</span></div>`).join("");
  const image = x.selfImage?.dataUrl || "";
  const proofInfo = (x.aadhaarProof || x.panProof || image) ? `
    <div class="profile-view-section"><h3>Uploaded Documents</h3><div class="profile-view-grid">
      <div><label>Aadhaar Proof</label>${x.aadhaarProof ? `<b>${esc(x.aadhaarProof.name || "Aadhaar Proof")}</b><button type="button" class="btn secondary proof-download" onclick='downloadProfileProof(${JSON.stringify(x.id)}, "aadhaarProof")'>Download</button>` : `<b>Not uploaded</b>`}</div>
      <div><label>PAN Proof</label>${x.panProof ? `<b>${esc(x.panProof.name || "PAN Proof")}</b><button type="button" class="btn secondary proof-download" onclick='downloadProfileProof(${JSON.stringify(x.id)}, "panProof")'>Download</button>` : `<b>Not uploaded</b>`}</div>
      <div class="profile-self-image-field"><label>Self Image</label>${image ? `<img class="profile-self-image" src="${esc(image)}" alt="${esc(x.name || "Profile")} Self Image">` : `<b>Not uploaded</b>`}</div>
    </div></div>` : "";
  modal(`<div class="mhead"><div><div class="ey">Profile / Master</div><h2>Profile Details</h2></div><button class="close">×</button></div>
    <div class="profile-view">
      <div class="profile-view-section"><h3>Personal Details</h3><div class="profile-view-grid">
        ${[["Name",x.name],["Age",x.age],["Contact Number",x.phone],["Email",x.email],["Address",x.address],["Work",x.work],["Work Place",x.workPlace],["Office Contact Number",x.officePhone],["Aadhaar No.",x.aadhaar],["PAN No.",x.pan]].map(a=>`<div><label>${a[0]}</label><b>${esc(a[1] || "—")}</b></div>`).join("")}
      </div></div>
      ${proofInfo}
      <div class="profile-view-section"><h3>Other Contact (${contacts.length})</h3>${contacts || '<div class="empty-contact">No other contacts added.</div>'}</div>
    </div><div class="foot"><button class="btn secondary close">Close</button></div>`);
}

async function deleteProfile(id) {
  if (!confirm("Are you sure you want to delete this profile?")) return;

  const profiles = get(K.profiles);
  const next = profiles.filter(p => normalizeProfileId(p?.id) !== normalizeProfileId(id));

  try {
    if (DB_ONLINE) {
      const response = await fetch(`/api/profiles/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to delete profile");
    }

    put(K.profiles, next);
    render("profiles");
    toast("Profile deleted");
  } catch (error) {
    console.error(error);
    toast(error.message || "Unable to delete profile.");
  }
}

function renderProfiles() {
  const d = get(K.profiles);
  const rows = d.map((x,i) => `<tr>
    <td>${i+1}</td><td><b>${esc(x.name)}</b></td><td>${esc(x.phone)}</td><td>${esc(x.email)}</td>
    <td>${esc(x.age)}</td><td>${esc(x.work)}</td><td>${esc(x.workPlace)}</td>
    <td><div class="actions">
      <button class="btn secondary" onclick="viewProfile('${esc(String(x.id ?? ""))}')">View</button>
      <button class="btn secondary" onclick="profileDrawer('${esc(String(x.id ?? ""))}')">Edit</button>
      <button class="btn danger" onclick="deleteProfile('${esc(String(x.id ?? ""))}')">Delete</button>
    </div></td>
  </tr>`).join("");

  return head("Profile / Master", "Profile Management",
    `<button class="btn primary top-add-btn" onclick="profileDrawer()">＋ Add Profile</button>`) +
    `<div class="card profile-list-card">
      <div class="toolbar">
        <b>Profile List <span class="record-count">${d.length}</span></b>
        <input class="find profile-search" data-table="profileTable" placeholder="Search by name, contact number, email...">
      </div>
      <div class="table"><table id="profileTable"><thead><tr>
        <th>S.No.</th><th>Name</th><th>Contact Number</th><th>Email</th><th>Age</th><th>Work</th><th>Work Place</th><th>Action</th>
      </tr></thead><tbody>${rows || `<tr><td colspan="8" class="empty-table">No profiles found.</td></tr>`}</tbody></table></div>
    </div>`;
}

// Render Main App Views
function render(p = "dashboard") {
  all("nav a").forEach(a => a.classList.toggle("active", a.dataset.p === p));
  let h = "";
  let c = get(K.c), a = get(K.a), e = get(K.e), r = get(K.r), w = get(K.w), hist = get(K.h);

  if (p === "profiles") {
    if (DB_ONLINE) {
      const currentRows = get(K.profiles);
      if (!currentRows.length) {
        refreshProfilesFromServer().then(() => {
          const appRoot = document.getElementById("app");
          if (appRoot) appRoot.innerHTML = renderProfiles();
        });
        return;
      }
    }

    h = renderProfiles();
  }

  if (p === "dashboard") {
    let active = c.filter(x => x.status === "Active").length;
    let totalCollected = Object.values(w).reduce((acc, curr) => acc + (curr.collected || 0), 0);
    let totalSubmitted = Object.values(w).reduce((acc, curr) => acc + (curr.submitted || 0), 0);
    let inHandCash = totalCollected - totalSubmitted;

    h = head("Dashboard", "Loan Management") +
      `<div class="welcome card"><div><div class="ey">Loan Administration</div><h2>Welcome to Loan Management Dashboard</h2><p>Monitor customers, executive collections, and wallet history.</p></div><div class="dash-date">${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div></div>
       <div class="stats">
         <div class="card stat"><span>Total Customers</span><strong>${c.length}</strong><small>${active} active accounts</small></div>
         <div class="card stat"><span>Total Collected</span><strong>${money(totalCollected)}</strong><small>By all executives</small></div>
         <div class="card stat"><span>Received by Admin</span><strong>${money(totalSubmitted)}</strong><small>Handed over cash</small></div>
         <div class="card stat"><span>Pending Cash in Hand</span><strong>${money(inHandCash)}</strong><small>With executives</small></div>
       </div>
       <div class="dash-grid">
         <div class="card dash-card"><div class="dash-title"><b>Quick Actions</b><span>Manage Portal</span></div><div class="quick-actions"><button onclick="render('customers')">Manage Customers</button><button onclick="render('wallet')">Executive Wallet</button><button onclick="render('executives')">Executive Team</button><button onclick="render('applications')">Loan Applications</button></div></div>
       </div>`;
  }

  // Executive Wallet & Collection Section
  if (p === "wallet") {
    let walletRows = e.map(exItem => {
      let exData = w[exItem.name] || { collected: 0, submitted: 0 };
      let inHand = exData.collected - exData.submitted;
      return `<tr>
        <td><b>${esc(exItem.name)}</b></td>
        <td>${money(exData.collected)}</td>
        <td>${money(exData.submitted)}</td>
        <td><b style="color:${inHand > 0 ? '#c32c39' : '#187c48'}">${money(inHand)}</b></td>
        <td>
          <button class="btn success" onclick="collectEMIDialog('${esc(exItem.name)}')">＋ Collect EMI</button>
          <button class="btn primary" onclick="receiveCashDialog('${esc(exItem.name)}', ${inHand})">↪ Receive Cash</button>
        </td>
      </tr>`;
    }).join("");

    let historyRows = hist.slice().reverse().map((hItem, idx) => `<tr>
      <td>${hist.length - idx}</td>
      <td><b>${esc(hItem.executive)}</b></td>
      <td><b style="color:#187c48">${money(hItem.amount)}</b></td>
      <td>${hItem.date}</td>
      <td><span class="badge active">${hItem.mode}</span></td>
      <td>${esc(hItem.remarks || "N/A")}</td>
    </tr>`).join("");

    h = head("Executive Wallet & Cash Handover", "Collection Management") +
      tableCard("Executive Wallet Summary", ["Executive Name", "Total Collected", "Submitted to Admin", "Cash In Hand", "Action"], walletRows, "wt") +
      `<br>` +
      tableCard("Payment Received History (Admin Log)", ["#", "Executive Name", "Amount Received", "Date", "Payment Mode", "Remarks"], historyRows, "ht");
  }

  if (p === "prefix") {
    let d = get(K.p);
    h = head("Prefix Loan", "Loan Configuration", `<button class="btn primary top-add-btn" onclick="customizedLoanForm()">＋ Add Loan</button>`) +
      tableCard("Loan List", ["ID", "Loan Type", "Loan Amount", "Repay Amount", "EMI", "Tenure", "Action"], d.map(x => `<tr><td>${x.id}</td><td>${esc(x.type)}</td><td>${money(x.amount)}</td><td>${money(x.repay)}</td><td>${money(x.emi)}</td><td>${x.tenure} Days</td><td><button class="btn secondary" onclick="prefixForm('${x.id}')">Edit</button> <button class="btn danger" onclick="deletePrefixLoan('${x.id}')">Delete</button></td></tr>`).join(""), "pt");
  }

  if (p === "customers") {
    let d = get(K.c);
    h = head("Customers", "Customer Management", `<button class="btn primary" onclick="customerForm()">＋ Add Customer</button>`) + tableCard("Customer List", ["#", "Customer Name", "Executive Name", "Status", "Action"], d.map((x, i) => `<tr><td>${i + 1}</td><td><b>${esc(x.name)}</b></td><td>${esc(x.executive)}</td><td>${badge(x.status)}</td><td><button class="btn secondary" onclick="viewCustomer('${x.id}')">View</button> <button class="btn secondary" onclick="customerForm('${x.id}')">Edit</button> <button class="btn danger" onclick="del(K.c,'${x.id}','customers')">Delete</button></td></tr>`).join(""), "ct");
  }

  if (p === "executives") {
    let d = get(K.e);
    h = head("Executive", "Team Management", `<button class="btn primary" onclick="execForm()">＋ Add Executive</button>`) + tableCard("Executive List", ["ID", "Name", "Phone Number", "Status", "Action"], d.map(x => `<tr><td>${x.id}</td><td><b>${esc(x.name)}</b></td><td>${x.phone}</td><td>${badge(x.status)}</td><td><button class="btn secondary" onclick="viewExec('${x.id}')">View</button> <button class="btn secondary" onclick="execForm('${x.id}')">Edit</button> <button class="btn danger" onclick="del(K.e,'${x.id}','executives')">Delete</button></td></tr>`).join(""), "et");
  }

  if (p === "applications") {
    let d = get(K.a);
    h = head("Loan Application", "Applications") + tableCard("All Applications", ["Customer Name", "Executive Name", "Loan Amount", "Status", "Action"], d.map(x => `<tr><td><b>${x.customer}</b></td><td>${x.executive}</td><td>${money(x.amount)}</td><td>${badge(x.status)}</td><td><button class="btn secondary" onclick="viewApp('${x.id}')">View</button> <button class="btn success" onclick="approve('${x.id}')">Approve</button> <button class="btn danger" onclick="reject('${x.id}')">Reject</button></td></tr>`).join(""), "at");
  }

  if (p === "rejected") {
    let d = get(K.r);
    h = head("Reject Loan", "Rejected Applications") + tableCard("Rejected Loan List", ["Customer Name", "Executive Name", "Loan Amount", "Status", "Action"], d.map(x => `<tr><td>${x.customer}</td><td>${x.executive}</td><td>${money(x.amount)}</td><td>${badge("Rejected")}</td><td><button class="btn secondary" onclick="viewApp('${x.id}',true)">View</button> <button class="btn success" onclick="approveRejected('${x.id}')">Approve</button></td></tr>`).join(""), "rt");
  }


  if (p === "addloan") {
    let d = get(K.loans).filter(x => String(x.status || "Active") === "Active");
    const loanRows = (d || []).map(x => {
      const applicant = resolveProfileObject(x.applicant);
      return `<tr><td>${esc(x.id)}</td><td><b>${esc(applicant?.name || "—")}</b></td><td>${money(x.loanAmount)}</td><td>${esc(x.tenure)} Days</td><td>${esc(x.executive)}</td><td><button class="btn payment-action" onclick="openPayment('${esc(String(x.id))}')">Payment</button> <button class="btn secondary" onclick="viewAddLoan('${esc(String(x.id))}')">View</button> <button class="btn secondary" onclick="addLoanForm('${esc(String(x.id))}')">Edit</button> <button class="btn danger" onclick="deleteAddLoan('${esc(String(x.id))}')">Delete</button></td></tr>`;
    }).join("");
    h = head("Add Loan", "Loan Creation", `<button class="btn primary top-add-btn" onclick="addLoanForm()">＋ New Loan</button>`) +
      tableCard("Active Loan List", ["Loan ID", "Applicant", "Loan Amount", "Tenure", "Executive", "Action"], loanRows, "alt");
  }

  if (p === "closeinactive") {
    let d = get(K.loans).filter(x => ["Closed", "Inactive"].includes(String(x.status || "")));
    const loanRows = (d || []).map(x => {
      const applicant = resolveProfileObject(x.applicant);
      const status = String(x.status || "Inactive");
      return `<tr><td>${esc(x.id)}</td><td><b>${esc(applicant?.name || "—")}</b></td><td>${money(x.loanAmount)}</td><td>${money(x.repayAmount)}</td><td>${esc(x.executive)}</td><td>${badge(status)}</td><td><button class="btn primary" onclick="newLoanFromInactive('${esc(String(x.id))}')">New Loan</button> <button class="btn secondary" onclick="viewAddLoan('${esc(String(x.id))}')">View</button></td></tr>`;
    }).join("");
    h = head("Close & Inactive", "Closed / Inactive Loans") +
      tableCard("Closed & Inactive Loan List", ["Loan ID", "Applicant", "Loan Amount", "Repay Amount", "Executive", "Status", "Action"], loanRows, "cilt");
  }

  if (p === "merged") {
    let d = get(K.m);
    h = head("Merged", "Loan Management", `<button class="btn primary" onclick="mergeForm()">＋ Add</button>`) + tableCard("Merged Loan List", ["Old Loan ID", "Customer Name", "Loan Amount", "Balance", "New Loan Amount", "Executive", "Action"], d.map(x => `<tr><td>${x.oldLoanId}</td><td>${x.customer}</td><td>${money(x.loanAmount)}</td><td>${money(x.balance)}</td><td>${money(x.newLoanAmount)}</td><td>${x.executive}</td><td><button class="btn secondary" onclick="viewMerged('${x.id}')">View</button> <button class="btn secondary" onclick="mergeForm('${x.id}')">Edit</button> <button class="btn danger" onclick="del(K.m,'${x.id}','merged')">Delete</button></td></tr>`).join(""), "mt");
  }

  $("#app").innerHTML = `<div class="content">${h}</div>`;
  bind();
}

// Bind Events & Actions
function bind() {
  all(".find").forEach(i => i.oninput = () => {
    let q = i.value.toLowerCase();
    all("#" + i.dataset.table + " tbody tr").forEach(r => r.style.display = r.innerText.toLowerCase().includes(q) ? "" : "none");
  });
  all(".close").forEach(x => x.onclick = close);
}

function modal(inner) { $("#modal").innerHTML = `<div class="box">${inner}</div>`; $("#modal").classList.add("open"); }
function close() { $("#modal").classList.remove("open", "drawer-mode"); $("#modal").innerHTML = ""; }

// Handover Cash Dialog (Receive Cash from Executive)
function receiveCashDialog(execName, maxBal) {
  modal(`<div class="mhead"><h2>Receive Cash from ${esc(execName)}</h2><button class="close">×</button></div>
    <form class="form" id="cashForm">
      <div class="grid">
        ${field("Executive", "executive", execName, "text")}
        ${num("Amount Received", "amount", maxBal)}
        ${field("Date", "date", new Date().toISOString().slice(0, 10), "date")}
        ${sel("Payment Mode", "mode", ["Cash", "UPI / Bank Transfer", "Cheque"], "Cash")}
        ${field("Remarks / Notes", "remarks", "Cash collected from Executive", "text", true)}
      </div>
      <div class="formfoot">
        <button type="button" class="btn secondary close">Cancel</button>
        <button class="btn primary">Confirm Receipt</button>
      </div>
    </form>`);

  $("#cashForm").onsubmit = e => {
    e.preventDefault();
    let f = new FormData(e.target);
    let amt = +f.get("amount");
    if (amt <= 0) return toast("Enter valid amount");

    let wallet = get(K.w);
    if (!wallet[execName]) wallet[execName] = { collected: 0, submitted: 0 };
    wallet[execName].submitted += amt;
    put(K.w, wallet);

    let hist = get(K.h);
    hist.push({
      id: "H" + (hist.length + 101),
      executive: execName,
      amount: amt,
      date: f.get("date"),
      mode: f.get("mode"),
      remarks: f.get("remarks")
    });
    put(K.h, hist);

    close();
    render("wallet");
    toast(`Received ${money(amt)} from ${execName}`);
  };
}

// Executive Collects EMI Dialog (Simulate Customer Payment)
function collectEMIDialog(execName) {
  let custs = get(K.c).filter(x => x.executive === execName || !x.executive);
  let custOptions = custs.map(c => `<option value="${c.emi}">${esc(c.name)} (EMI: ${money(c.emi)})</option>`).join("");

  modal(`<div class="mhead"><h2>Collect EMI Payment (${esc(execName)})</h2><button class="close">×</button></div>
    <form class="form" id="emiForm">
      <div class="grid">
        <div class="field"><label>Select Customer</label><select name="cust">${custOptions}</select></div>
        ${num("EMI Amount Collected", "amount", 0)}
        ${field("Date", "date", new Date().toISOString().slice(0, 10), "date")}
      </div>
      <div class="formfoot">
        <button type="button" class="btn secondary close">Cancel</button>
        <button class="btn success">Add to Executive Wallet</button>
      </div>
    </form>`);

  let form = $("#emiForm");
  let selCust = form.querySelector('[name="cust"]');
  let amtInput = form.querySelector('[name="amount"]');
  if (selCust && selCust.value) amtInput.value = selCust.value;

  selCust.onchange = () => amtInput.value = selCust.value;

  form.onsubmit = e => {
    e.preventDefault();
    let f = new FormData(e.target);
    let amt = +f.get("amount");
    if (amt <= 0) return toast("Enter valid amount");

    let wallet = get(K.w);
    if (!wallet[execName]) wallet[execName] = { collected: 0, submitted: 0 };
    wallet[execName].collected += amt;
    put(K.w, wallet);

    close();
    render("wallet");
    toast(`Collected ${money(amt)} added to ${execName}'s wallet`);
  };
}

// Executive Form
function execForm(id) {
  const x = id ? get(K.e).find(v => String(v.id) === String(id)) : {};
  const existingImage = x?.photo?.dataUrl || x?.photo?.data_url || x?.selfImage?.dataUrl || "";
  modal(`<div class="mhead"><h2>${id ? "Edit" : "Add"} Executive</h2><button class="close">×</button></div><form class="form" id="ef"><div class="grid">${field("Executive ID", "id", x.id || "")}${field("Name", "name", x.name || "")}${field("Phone Number", "phone", x.phone || "")}${field("Email", "email", x.email || "")}${field("Username", "username", x.username || "")}${field("Password", "password", x.password || "", "password")}${field("Joining Date", "joining", x.joining || "", "date")}${sel("Status", "status", ["Active", "On Leave", "Inactive", "Resigned"], x.status)}<div class="field"><label>Executive Photo${!id ? " *" : ""}</label><input type="file" name="photo" accept="image/*">${existingImage ? `<img id="executivePhotoPreview" class="executive-edit-photo" src="${esc(existingImage)}" alt="Existing Executive Photo">` : `<div id="executivePhotoPreview" class="profile-image-empty">No photo uploaded</div>`}<small class="file-help">JPG, JPEG, PNG, WEBP, GIF or BMP • Maximum 1 MB${existingImage ? " • Existing photo will be kept if no new photo is selected" : ""}</small></div></div><div class="formfoot"><button type="button" class="btn secondary close">Cancel</button><button class="btn primary">Save Executive</button></div></form>`);

  const executivePhotoInput = $("#ef").querySelector('input[name="photo"]');
  executivePhotoInput?.addEventListener('change', () => {
    const file = executivePhotoInput.files?.[0];
    if (!file || !hasSelectedFile(file)) return;
    const url = URL.createObjectURL(file);
    const preview = $("#executivePhotoPreview");
    if (preview) {
      if (preview.tagName === 'IMG' && preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
      preview.outerHTML = `<img id="executivePhotoPreview" class="executive-edit-photo" src="${esc(url)}" alt="New Executive Photo">`;
    }
  });

  $("#ef").onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target), d = get(K.e), o = Object.fromEntries(f);
    if(!validatePhone(o.phone)) return toast("Enter valid 10-digit Phone Number!");
    const photoFile = f.get("photo");
    if (!id && !hasSelectedFile(photoFile)) return toast("Executive Photo is mandatory when adding an executive.");
    if (!validateUpload(photoFile, "Executive Photo", true)) return;
    if (hasSelectedFile(photoFile) && photoFile.size > 1024 * 1024) return;

    const newPhoto = hasSelectedFile(photoFile) ? await fileMetaWithData(photoFile, null) : null;
    const old = id ? d.find(v => String(v.id) === String(id)) : null;
    const payload = {
      id: o.id || o.executive_code || id || "",
      name: o.name, phone: o.phone, email: o.email, username: o.username,
      password: o.password, joining: o.joining, status: o.status || "Active",
      photo: newPhoto || old?.photo || old?.selfImage || null
    };

    try {
      if (DB_ONLINE) {
        const target = id ? `/api/executives/${encodeURIComponent(id)}` : "/api/executives";
        const response = await fetch(target, { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Executive save failed");
        const saved = normalizeExecutiveRow(data.executive || payload);
        if (id) put(K.e, d.map(v => String(v.id) === String(id) ? saved : v));
        else put(K.e, [...d, saved]);
      } else {
        put(K.e, id ? d.map(v => String(v.id) === String(id) ? { ...v, ...payload } : v) : [...d, { ...payload, id: payload.id || `EX${String(d.length + 1).padStart(3, "0")}` }]);
      }

      const wallet = get(K.w);
      if (!wallet[payload.name]) wallet[payload.name] = { collected: 0, submitted: 0 };
      put(K.w, wallet);
      close(); render("executives"); toast("Executive saved");
    } catch (error) {
      toast(error.message || "Could not save executive");
      console.error(error);
    }
  };
}

function viewExec(id) {
  const x = get(K.e).find(v => String(v.id) === String(id));
  if (!x) return;
  const image = x.photo?.dataUrl || x.photo?.data_url || x.selfImage?.dataUrl || "";
  modal(`<div class="mhead"><h2>Executive Details</h2><button class="close">×</button></div><div class="executive-view-head">${image ? `<img class="executive-view-photo" src="${esc(image)}" alt="${esc(x.name)} Executive Photo">` : `<div class="executive-view-photo executive-photo-fallback">${esc((x.name||"EX").split(" ").map(v=>v[0]).join("").slice(0,2).toUpperCase())}</div>`}<div><h3>${esc(x.name || "—")}</h3><span>${esc(x.id || "")}</span></div></div><div class="details">${[["Executive ID", x.id], ["Name", x.name], ["Phone Number", x.phone], ["Email", x.email], ["Username", x.username], ["Joining Date", x.joining], ["Status", x.status]].map(a => `<div class="detail"><label>${a[0]}</label><b>${esc(a[1])}</b></div>`).join("")}</div><div class="foot"><button class="btn secondary close">Close</button></div>`);
}

// Customer Form & Functions
function customerForm(id) {
  let x = id ? get(K.c).find(v => v.id === id) : { guarantor: {} };
  modal(`<div class="mhead"><h2>${id ? "Edit" : "Add"} Customer</h2><button class="close">×</button></div>${formFields(x, x.guarantor, id)}`);
  
  let cf = $("#customerForm"), first = cf.querySelector('[name="firstEmi"]'), last = cf.querySelector('[name="lastEmi"]'), tenure = cf.querySelector('[name="tenure"]'), approval = cf.querySelector('[name="approval"]');
  function calcLast() { if (first.value && tenure.value) last.value = dateAdd(first.value, Math.max(0, +tenure.value - 1)); }
  first.addEventListener("change", calcLast);
  tenure.addEventListener("input", calcLast);
  if (approval) approval.addEventListener("change", () => { if (!first.value) { first.value = dateAdd(approval.value, 1); calcLast(); } });
  calcLast();

  cf.onsubmit = e => {
    e.preventDefault();
    let f = new FormData(e.target), d = get(K.c);
    let custPhone = f.get("customerphone");
    let custPAN = f.get("customerpan");

    if (custPhone && !validatePhone(custPhone)) return toast("Invalid Customer Phone Number!");
    if (custPAN && !validatePAN(custPAN)) return toast("Invalid PAN Number format (e.g. ABCDE1234F)");

    let o = {
      ...(id ? d.find(v => v.id === id) : {}),
      id: id || "C" + String(d.length + 1).padStart(3, "0"),
      loanId: f.get("loanId"), name: f.get("name"), loanType: f.get("loanType"),
      amount: +f.get("amount"), repay: +f.get("repay"), tenure: +f.get("tenure"), emi: +f.get("emi"),
      approval: f.get("approval") || new Date().toISOString().slice(0, 10),
      firstEmi: f.get("firstEmi") || dateAdd(f.get("approval") || new Date(), 1),
      lastEmi: f.get("lastEmi") || dateAdd(f.get("firstEmi") || new Date(), Math.max(0, (+f.get("tenure") || 0) - 1)),
      status: f.get("status"), executive: f.get("executive"), remarks: f.get("remarks"),
      phone: custPhone, email: f.get("customeremail"), age: +f.get("customerage"),
      aadhaar: f.get("customeraadhaar"), pan: custPAN, address: f.get("customeraddress"), occupation: f.get("customeroccupation"),
      guarantor: { name: f.get("guarantorname"), age: +f.get("guarantorage"), phone: f.get("guarantorphone"), email: f.get("guarantoremail"), aadhaar: f.get("guarantoraadhaar"), pan: f.get("guarantorpan"), address: f.get("guarantoraddress"), occupation: f.get("guarantoroccupation"), relationship: f.get("relationship") }
    };
    put(K.c, id ? d.map(v => v.id === id ? o : v) : [...d, o]);
    close();
    render("customers");
    toast("Customer saved");
  };
}

function viewCustomer(id) { let x = get(K.c).find(v => v.id === id); viewCommon(x, "Customer Loan Details"); }
function personCard(title, x, g = false) { return `<div class="person"><h3>${title}</h3><div class="personbody">${[["Full Name", x.name], ["Age", x.age], ["Phone Number", x.phone], ["Email", x.email], ["Aadhaar Number", x.aadhaar], ["PAN Number", x.pan], ["Address", x.address], ["Occupation", x.occupation], ...(g ? [["Relationship", x.relationship]] : [])].map(a => `<div><label>${a[0]}</label><div>${esc(a[1] || "—")}</div></div>`).join("")}</div></div>`; }
function viewCommon(x, title) { modal(`<div class="mhead"><div><h2>${title}</h2><small>${esc(x.loanId || "")}</small></div><button class="close">×</button></div><div class="details">${[["Loan ID", x.loanId], ["Customer Name", x.name || x.customer], ["Guarantor", x.guarantor?.name || x.guarantor], ["Loan Type", x.loanType || "Personal Loan"], ["Loan Amount", money(x.amount)], ["Repay Amount", money(x.repay)], ["Tenure", x.tenure + " Days"], ["EMI", money(x.emi)], ["Loan Approval Date", x.approval], ["First EMI Date", x.firstEmi], ["Last EMI Date", x.lastEmi], ["Loan Status", x.status], ["Executive", x.executive], ["Remarks", x.remarks]].map(a => `<div class="detail"><label>${a[0]}</label><b>${esc(a[1] || "—")}</b></div>`).join("")}</div><div class="people">${personCard("Customer Details", x)}${personCard("Guarantor Details", x.guarantor || {}, true)}</div><div class="foot"><button class="btn secondary close">Close</button></div>`); }

function customizedLoanForm(id = "") {
  prefixForm(id);
}

async function prefixForm(id = "") {
  id = String(id || "");
  let x = id ? get(K.p).find(v => String(v.id) === id) : {};
  if (id && !x && DB_ONLINE) {
    try { await refreshPrefixLoansFromServer(); x = get(K.p).find(v => String(v.id) === id); } catch(e) {}
  }
  if (id && !x) return;
  modal(`<div class="mhead"><h2>${id ? "Edit" : "Add"} Prefix Loan</h2><button class="close">×</button></div>${formPrefix(x || {}, id)}`);
  const form = $("#pf");
  if (!form) return;
  form.onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(form);
    const loan = { type: f.get("type"), amount: +f.get("amount"), repay: +f.get("repay"), emi: +f.get("emi"), tenure: +f.get("tenure") };
    if (!loan.type) return toast("Select Loan Type.");
    if (loan.amount < 0 || loan.repay < 0 || loan.emi < 0 || loan.tenure < 0) return toast("Loan values cannot be negative.");
    try {
      if (DB_ONLINE) {
        const saved = await savePrefixLoanToServer(loan, id);
        if (id) put(K.p, get(K.p).map(v => String(v.id) === id ? saved : v));
        else put(K.p, [...get(K.p), saved]);
      } else {
        const nextId = Math.max(0, ...get(K.p).map(v => Number(v.id) || 0)) + 1;
        put(K.p, id ? get(K.p).map(v => String(v.id) === id ? {...loan, id:Number(id)} : v) : [...get(K.p), {...loan, id:nextId}]);
      }
      close(); render("prefix"); toast(id ? "Prefix Loan updated" : "Prefix Loan saved to SQL");
    } catch (error) { console.error(error); toast(error.message || "Unable to save Prefix Loan."); }
  };
}

function formPrefix(x, id) { return `<form class="form" id="pf"><div class="grid">${sel("Loan Type", "type", types, x.type)}${num("Loan Amount", "amount", x.amount)}${num("Repay Amount", "repay", x.repay)}${num("EMI", "emi", x.emi)}${num("Tenure (Days)", "tenure", x.tenure)}</div><div class="formfoot"><button type="button" class="btn secondary close">Cancel</button><button class="btn primary">Save</button></div></form>`; }

function normalizeApplication(x) { return { ...x, name: x.customer, amount: +x.amount, guarantor: x.guarantorDetails || x.guarantor || {}, status: x.status, remarks: x.remarks || "" }; }
function viewApp(id, rejected = false) { let x = (rejected ? get(K.r) : get(K.a)).find(v => v.id === id); if (x) viewCommon(normalizeApplication(x), rejected ? "Rejected Loan Details" : "Loan Application Details"); }
function applicationToCustomer(x) { let d = get(K.c); return { id: "C" + String(d.length + 1).padStart(3, "0"), loanId: x.loanId, name: x.customer, executive: x.executive, loanType: x.loanType || "Personal Loan", amount: +x.amount, repay: +(x.repay || x.amount), tenure: +x.tenure, emi: +x.emi, approval: new Date().toISOString().slice(0, 10), firstEmi: dateAdd(new Date(), 1), lastEmi: dateAdd(new Date(), Math.max(0, (+x.tenure || 0) - 1)), status: "Active", remarks: "Approved loan application.", phone: x.customerDetails?.phone || "", email: x.customerDetails?.email || "", age: +(x.customerDetails?.age || 0), aadhaar: x.customerDetails?.aadhaar || "", pan: x.customerDetails?.pan || "", address: x.customerDetails?.address || "", occupation: x.customerDetails?.occupation || "", guarantor: x.guarantorDetails || {} }; }

function approve(id) { let x = get(K.a).find(v => v.id === id); if (!x) return; put(K.c, [...get(K.c), applicationToCustomer(x)]); put(K.a, get(K.a).filter(v => v.id !== id)); close(); render("applications"); toast("Approved → Customer panel"); }
function approveRejected(id) { let x = get(K.r).find(v => v.id === id); if (!x) return; put(K.c, [...get(K.c), applicationToCustomer(x)]); put(K.r, get(K.r).filter(v => v.id !== id)); close(); render("rejected"); toast("Approved → Customer panel"); }
function reject(id) { let x = get(K.a).find(v => v.id === id); if (!x) return; put(K.r, [...get(K.r), { ...x, status: "Rejected" }]); put(K.a, get(K.a).filter(v => v.id !== id)); close(); render("applications"); toast("Rejected → Reject Loan"); }


// ==================== Add Loan ====================
function profileSummary(p) {
  if (!p) return null;
  return {
    id:p.id, name:p.name||"", age:p.age||"", phone:p.phone||"", email:p.email||"",
    address:p.address||"", work:p.work||"", workPlace:p.workPlace||"", officePhone:p.officePhone||"",
    aadhaar:p.aadhaar||"", pan:p.pan||"", aadhaarProof:p.aadhaarProof||null, panProof:p.panProof||null,
    selfImage:p.selfImage||null, otherContacts:Array.isArray(p.otherContacts)?p.otherContacts:[]
  };
}
function profileMatch(q) {
  const s=String(q||"").trim().toLowerCase();
  if(!s) return null;
  return get(K.profiles).find(p => String(p.aadhaar||"").replace(/\s/g,"").toLowerCase()===s.replace(/\s/g,"") || String(p.pan||"").toLowerCase()===s);
}
async function loadLoanProfileSelfImage(profileId, imgEl) {
  if (!profileId || !imgEl) return;
  try {
    const dataUrl = imgEl.dataset.imageData || "";
    const showImage = (src) => {
      if (!src) return;
      imgEl.src = src;
      imgEl.style.display = "block";
      const fallback = imgEl.parentElement?.querySelector(".loan-person-photo-fallback");
      if (fallback) fallback.style.display = "none";
    };

    // Bundled demo profiles can carry a tiny inline SVG.
    if (/^data:image\//i.test(dataUrl)) {
      showImage(dataUrl);
      return;
    }

    // User-uploaded images are loaded directly from SQL Server.
    const r = await fetch(`/api/profile-file/${encodeURIComponent(profileId)}/selfImage`);
    if (!r.ok) return;
    const blob = await r.blob();
    if (blob.type.startsWith("image/")) showImage(URL.createObjectURL(blob));
  } catch (e) {
    console.warn("Unable to load profile self image from SQL Server", e);
  }
}

function hydrateLoanPersonImages() {
  all(".loan-person-photo[data-profile-id]").forEach(img => {
    loadLoanProfileSelfImage(img.dataset.profileId, img);
  });
}

function removeLoanPerson(role) {
  const edit = window.__editingLoanId || "";
  const current = edit ? get(K.loans).find(x => x.id === edit) : null;
  const data = current ? {...current} : (window.__newLoanDraft || {
    applicant:null, guarantor1:null, guarantor2:null,
    loanType:"",loanAmount:"",repayAmount:"",tenure:"",emi:"",
    startDate:"",endDate:"",executive:""
  });
  data[role] = null;

  // Allow Applicant, Guarantor 1 and Guarantor 2 to be removed.
  // Applicant becomes empty and must be selected again before saving the loan.
  window.__newLoanDraft = data;
  addLoanForm(edit);
}

function addLoanPersonCard(role, p) {
  const person = resolveProfileObject(p);
  const title = role==='applicant' ? 'Applicant' : role==='guarantor1' ? 'Guarantor 1' : 'Guarantor 2';
  const image = person ? (person.selfImage?.dataUrl || "") : "";
  const initials = person ? (person.name||title).split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase() : "";
  const photoId = person ? esc(person.id||"") : "";

  if (!person) {
    return `<div class="loan-person-card">
      <div class="loan-person-head">
        <div><span class="loan-role">${title}</span><h3>Not added</h3></div>
        <button type="button" class="loan-plus" onclick="selectLoanPerson('${role}')" aria-label="Add ${title}">＋</button>
      </div>
      <p class="loan-muted">Click + to search Profile List.</p>
    </div>`;
  }

  return `<div class="loan-person-card selected">
    <div class="loan-person-head">
      <div><span class="loan-role">${title}</span><h3>${esc(person.name)}</h3></div>
      <button type="button" class="loan-remove" onclick="removeLoanPerson('${role}')" aria-label="Remove ${title}" title="Remove">×</button>
    </div>

    <div class="loan-person-photo-wrap">
      <img class="loan-person-photo"
           data-profile-id="${photoId}"
           data-image-data="${image ? esc(image) : ''}"
           src="${image ? esc(image) : ''}"
           alt="${esc(person.name||title)} Self Image"
           style="display:${image?'block':'none'}"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
      <div class="loan-person-photo-fallback" style="display:${image?'none':'flex'}">
        ${esc(initials)}
      </div>
    </div>

    <div class="loan-person-basic">
      <span><b>Contact</b>${esc(person.phone||'—')}</span>
      <span><b>Address</b>${esc(person.address||'—')}</span>
      <span><b>Work</b>${esc(person.work||'—')}</span>
    </div>
    <button type="button" class="btn secondary loan-view-btn" onclick="viewLoanPerson('${role}')">View</button>
  </div>`;
}

function addLoanForm(id="", referenceLoanId="") {
  window.__editingLoanId=id||"";
  if (referenceLoanId) window.__referenceLoanId=referenceLoanId;
  else if (!id) window.__referenceLoanId="";
  const loans=get(K.loans), old=id?loans.find(x=>String(x.id)===String(id)):null;
  const source=window.__referenceLoanId && !id ? loans.find(x=>String(x.id)===String(window.__referenceLoanId)) : null;
  if(id&&!old)return;
  const prefix=get(K.p), activeEx=get(K.e).filter(e=>e.status==='Active');
  const data=old||window.__newLoanDraft|| (source ? {
    applicant:source.applicant, guarantor1:source.guarantor1, guarantor2:source.guarantor2,
    loanType:"",loanAmount:"",repayAmount:"",tenure:"",emi:"",startDate:"",endDate:"",executive:getSession()?.name||""
  } : {applicant:null,guarantor1:null,guarantor2:null,loanType:"",loanAmount:"",repayAmount:"",tenure:"",emi:"",startDate:"",endDate:"",executive:""});
  window.__newLoanDraft=data;
  window.__activeAddLoanId=id||"";
  const referenceSection=source ? `<div class="loan-detail-section"><div class="title">Previous Loan Reference</div><div class="grid"><div class="field"><label>Reference Loan ID</label><input type="text" name="referenceLoanId" value="${esc(source.id)}" readonly></div><div class="field full"><label>Reference Remark</label><textarea name="referenceRemark" rows="3" placeholder="Why is this new loan being given?">${esc(window.__referenceRemark||'')}</textarea></div></div><p class="form-help">Reference ID is automatically the selected Close &amp; Inactive loan ID.</p></div>` : '';
  modal(`<div class="mhead"><div><div class="ey">Loan Management</div><h2>${id?'Edit Add Loan':source?'New Loan from Close & Inactive':'Add Loan'}</h2></div><button class="close">×</button></div>
    <form class="form add-loan-form" id="addLoanForm">
      <div class="loan-party-grid">${addLoanPersonCard('applicant',data.applicant)}${addLoanPersonCard('guarantor1',data.guarantor1)}${addLoanPersonCard('guarantor2',data.guarantor2)}</div>
      ${referenceSection}
      <div class="loan-detail-section"><div class="title">Loan Details</div><div class="grid">
        <div class="field"><label>Prefix Loan</label><select name="prefixLoan" id="addLoanPrefix"><option value="">Select Prefix Loan / Manual Entry</option>${prefix.map(x=>`<option value="${esc(x.id)}" ${String(x.id)===String(data.prefixLoanId)?'selected':''}>${esc(x.id)} — ${esc(x.type)} — ${money(x.amount)}</option>`).join('')}</select></div>
        ${sel('Loan Type','loanType',types,data.loanType||'')}
        ${num('Loan Amount','loanAmount',data.loanAmount)}${num('Repay Amount','repayAmount',data.repayAmount)}${num('Tenure (Days)','tenure',data.tenure)}${num('EMI','emi',data.emi)}
        ${field('Start Date','startDate',data.startDate||'','date')}${field('End Date','endDate',data.endDate||'','date')}
        <div class="field"><label>Assigned Executive</label><select name="executive" id="addLoanExecutive"><option value="">Select Active Executive</option>${activeEx.map(e=>`<option value="${esc(e.name)}" ${e.name===data.executive?'selected':''}>${esc(e.name)}</option>`).join('')}</select></div>
      </div></div>
      <div class="formfoot"><button type="button" class="btn secondary close">Cancel</button><button class="btn primary">${id?'Update Loan':'Save Loan'}</button></div>
    </form>`);
  hydrateLoanPersonImages();
  const f=$('#addLoanForm'), prefixSelect=$('#addLoanPrefix'), amount=f.querySelector('[name="loanAmount"]'), repay=f.querySelector('[name="repayAmount"]'), tenure=f.querySelector('[name="tenure"]'), emi=f.querySelector('[name="emi"]'), start=f.querySelector('[name="startDate"]'), end=f.querySelector('[name="endDate"]'), type=f.querySelector('[name="loanType"]');
  function applyPrefix(){const x=get(K.p).find(v=>String(v.id)===String(prefixSelect.value));if(!x)return; amount.value=x.amount;repay.value=x.repay;tenure.value=x.tenure;emi.value=x.emi;type.value=x.type;calcEnd();}
  function calcEnd(){if(start.value&&tenure.value>0){end.value=dateAdd(new Date(start.value+'T00:00:00'),+tenure.value);}}
  function calcTenure(){if(start.value&&end.value){const a=new Date(start.value+'T00:00:00'),b=new Date(end.value+'T00:00:00');const days=Math.round((b-a)/86400000);if(days>=0)tenure.value=days;}}
  prefixSelect.onchange=applyPrefix; start.onchange=()=>{calcEnd();calcTenure()}; end.onchange=calcTenure; tenure.oninput=calcEnd;
  f.onsubmit=async e=>{e.preventDefault();const fd=new FormData(f), d=get(K.loans); if(!data.applicant)return toast('Applicant is mandatory.'); if(!fd.get('loanAmount')||+fd.get('loanAmount')<=0)return toast('Enter Loan Amount.'); if(!fd.get('repayAmount')||+fd.get('repayAmount')<0)return toast('Enter Repay Amount.'); if(!fd.get('tenure')||+fd.get('tenure')<=0)return toast('Enter valid Tenure.'); if(!fd.get('emi')||+fd.get('emi')<=0)return toast('Enter valid EMI.'); if(!fd.get('startDate'))return toast('Select Start Date.'); if(!fd.get('endDate'))calcEnd(); if(!fd.get('executive'))return toast('Select an Active Executive.');
    if(source && !String(fd.get('referenceRemark')||'').trim())return toast('Enter Reference Remark.');
    const nextLoanId = typeof buildNextLoanId === 'function' ? buildNextLoanId(d.map(v => v && v.id)) : String(d.length + 1);
    const o={...(old||{}),id:id||nextLoanId,applicant:data.applicant,guarantor1:data.guarantor1||null,guarantor2:data.guarantor2||null,prefixLoanId:prefixSelect.value,loanType:fd.get('loanType'),loanAmount:+fd.get('loanAmount'),repayAmount:+fd.get('repayAmount'),tenure:+fd.get('tenure'),emi:+fd.get('emi'),startDate:fd.get('startDate'),endDate:fd.get('endDate'),executive:fd.get('executive'),status:'Active',createdBy:getSession()?.id || null,savedAt:new Date().toISOString()};
    if(source){o.referenceLoanId=source.id;o.referenceRemark=String(fd.get('referenceRemark')||'').trim();}
    try {
      if (DB_ONLINE) {
        const requestBody={...o, forceNewLoan:false};
        let response = await fetch(id ? `/api/loans/${encodeURIComponent(id)}` : '/api/loans', {method: id ? 'PUT' : 'POST',headers: { 'Content-Type': 'application/json' },body: JSON.stringify(requestBody)});
        let payload = await response.json().catch(() => ({}));
        if(!response.ok && payload.code==='ACTIVE_LOAN_WARNING' && !id){
          const proceed=confirm(`${payload.error}${payload.activeLoanId ? `\nActive Loan ID: ${payload.activeLoanId}` : ''}\n\nDo you want to create this new loan anyway?`);
          if(!proceed) return;
          response=await fetch('/api/loans',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...requestBody,forceNewLoan:true})});
          payload=await response.json().catch(()=>({}));
        }
        if (!response.ok) throw new Error(payload.error || 'Unable to save loan');
        const saved = payload.loan || o;
        put(K.loans, id ? d.map(v => String(v.id) === String(id) ? saved : v) : [...d, saved]);
      } else {
        put(K.loans, id ? d.map(v => v.id === id ? o : v) : [...d, o]);
      }
      window.__newLoanDraft=null;window.__editingLoanId='';window.__referenceLoanId='';window.__referenceRemark='';close();render('addloan');toast(id?'Loan updated':'Loan saved');
    } catch (error) { console.error(error); toast(error.message || 'Unable to save loan.'); }
  };
}

function newLoanFromInactive(id){
  const source=get(K.loans).find(x=>String(x.id)===String(id));
  if(!source || !['Closed','Inactive'].includes(String(source.status||''))) return toast('Closed / Inactive loan not found.');
  window.__referenceLoanId=String(source.id);
  window.__referenceRemark='';
  window.__newLoanDraft=null;
  addLoanForm('', String(source.id));
}

function selectLoanPerson(role){
  modal(`<div class="mhead"><div><div class="ey">Profile List</div><h2>Search ${role==='applicant'?'Applicant':role==='guarantor1'?'Guarantor 1':'Guarantor 2'}</h2></div><button class="close">×</button></div><div class="profile-search-popup"><p>Enter Aadhaar Number or PAN Number (any one is enough).</p><div class="field"><label>Aadhaar No. / PAN No.</label><input id="loanProfileQuery" placeholder="Enter Aadhaar or PAN"></div><button type="button" class="btn primary" id="searchLoanProfile">Search</button><div id="loanProfileResult"></div></div>`);
  $('#searchLoanProfile').onclick=()=>{const p=profileMatch($('#loanProfileQuery').value);const out=$('#loanProfileResult');if(!p){out.innerHTML='<div class="loan-no-result">No matching profile found in Profile List.</div>';return;}out.innerHTML=`<div class="loan-found-profile"><div><b>${esc(p.name)}</b><span>${esc(p.phone)}</span></div><div><label>Address</label>${esc(p.address||'—')}</div><div><label>Work</label>${esc(p.work||'—')}</div><button type="button" class="btn primary" id="useLoanProfile">Use This Profile</button></div>`;$('#useLoanProfile').onclick=()=>{window.__loanPersonSelection={role,profile:profileSummary(p)};close();const modalEl=document.getElementById('modal');setTimeout(()=>{},0);reopenAddLoanWithSelection();};};
}
function reopenAddLoanWithSelection(){const sel=window.__loanPersonSelection;if(!sel)return; const current=get(K.loans).find(x=>String(x.id)===String(window.__editingLoanId))||null; const data=current?{...current}:window.__newLoanDraft||{applicant:null,guarantor1:null,guarantor2:null,loanType:'',loanAmount:'',repayAmount:'',tenure:'',emi:'',startDate:'',endDate:'',executive:''}; data[sel.role]=sel.profile; window.__newLoanDraft=data; const edit=window.__editingLoanId||''; const reference=window.__referenceLoanId||''; window.__loanPersonSelection=null; addLoanForm(edit,reference);}
function viewLoanPerson(role){const id=window.__activeAddLoanId;const loan=get(K.loans).find(x=>String(x.id)===String(id));const p=loan?.[role]||window.__newLoanDraft?.[role];if(p)viewProfileObject(p,role==='applicant'?'Applicant Details':role==='guarantor1'?'Guarantor 1 Details':'Guarantor 2 Details');}
function viewProfileObject(x,title){const contacts=(x.otherContacts||[]).map(c=>`<div class="profile-contact-view"><b>${esc(c.name)}</b><span>${esc(c.relation)}</span><span>${esc(c.phone)}</span></div>`).join('');modal(`<div class="mhead"><div><div class="ey">Profile List</div><h2>${title}</h2></div><button class="close">×</button></div><div class="profile-view"><div class="profile-view-section"><h3>Personal Details</h3><div class="profile-view-grid">${[['Name',x.name],['Age',x.age],['Contact Number',x.phone],['Email',x.email],['Address',x.address],['Work',x.work],['Work Place',x.workPlace],['Office Contact Number',x.officePhone],['Aadhaar No.',x.aadhaar],['PAN No.',x.pan]].map(a=>`<div><label>${a[0]}</label><b>${esc(a[1]||'—')}</b></div>`).join('')}</div></div><div class="profile-view-section"><h3>Uploaded Documents</h3><div class="profile-view-grid"><div><label>Aadhaar Proof</label><b>${esc(x.aadhaarProof?.name||'Not uploaded')}</b></div><div><label>PAN Proof</label><b>${esc(x.panProof?.name||'Not uploaded')}</b></div><div><label>Self Image</label><b>${esc(x.selfImage?.name||'Not uploaded')}</b></div></div></div><div class="profile-view-section"><h3>Other Contact (${(x.otherContacts||[]).length})</h3>${contacts||'<div class="empty-contact">No other contacts added.</div>'}</div></div><div class="foot"><button class="btn secondary close">Close</button></div>`);}
function viewAddLoan(id){const x=get(K.loans).find(v=>String(v.id)===String(id));if(!x)return;window.__activeAddLoanId=id;window.__editingLoanId=id;modal(`<div class="mhead"><div><div class="ey">Loan Management</div><h2>Loan Details</h2></div><button class="close">×</button></div><div class="loan-view-wrap"><div class="loan-party-grid">${addLoanPersonCard('applicant',x.applicant)}${addLoanPersonCard('guarantor1',x.guarantor1)}${addLoanPersonCard('guarantor2',x.guarantor2)}</div><div class="profile-view-section"><h3>Loan Details</h3><div class="profile-view-grid">${[['Loan ID',x.id],['Prefix Loan',x.prefixLoanId||'Manual Entry'],['Loan Type',x.loanType],['Loan Amount',money(x.loanAmount)],['Repay Amount',money(x.repayAmount)],['Tenure',x.tenure+' Days'],['EMI',money(x.emi)],['Start Date',x.startDate],['End Date',x.endDate],['Executive',x.executive]].map(a=>`<div><label>${a[0]}</label><b>${esc(a[1]||'—')}</b></div>`).join('')}</div></div></div><div class="foot"><button class="btn secondary close">Close</button></div>`);hydrateLoanPersonImages();}
async function deleteAddLoan(id){
  if (!confirm('Move this loan to Close & Inactive? The SQL record will be preserved.')) return;
  try {
    if (DB_ONLINE) {
      const response = await fetch(`/api/loans/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to move loan');
    }
    put(K.loans, get(K.loans).map(x => String(x.id) === String(id) ? {...x,status:'Inactive'} : x));
    render('addloan');
    toast('Loan moved to Close & Inactive');
  } catch (error) { console.error(error); toast(error.message || 'Unable to move loan.'); }
}


function paymentDateDisplay(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString("en-GB");
}

function paymentDateInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function paymentField(label, name, value, opts = {}) {
  const type = opts.type || "number";
  const readonly = opts.readonly ? "readonly" : "";
  const step = type === "number" ? 'step="0.01" min="0"' : "";
  return `<div class="field"><label>${label}</label><input type="${type}" name="${name}" value="${esc(value ?? "")}" ${step} ${readonly}></div>`;
}

async function openPayment(loanId, paymentId = "") {
  if (!DB_ONLINE) {
    toast("SQL Server is not connected.");
    return;
  }

  const session = getSession();
  if (!session?.id) {
    toast("Please login again.");
    return;
  }

  try {
    const query = new URLSearchParams({ executiveId: String(session.id) });
    const response = await fetch(`/api/payments/loan/${encodeURIComponent(loanId)}?${query.toString()}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to load payment details.");
    renderPaymentModal(data, paymentId);
  } catch (error) {
    console.error(error);
    toast(error.message || "Unable to load payment details.");
  }
}

function renderPaymentHistory(history, loan) {
  const rows = Array.isArray(history) ? history : [];
  modal(`
    <div class="mhead payment-mhead">
      <div><div class="ey">Payment History</div><h2>${esc(loan.id || "")} — ${esc(loan.customerName || "")}</h2></div>
      <button class="close">×</button>
    </div>
    <div class="payment-history-card payment-history-modal-card">
      <div class="payment-history-head">
        <div><div class="ey">SQL Payment History</div><h3>All payment days</h3></div>
        <span>${rows.length} record(s)</span>
      </div>
      <div class="payment-history-scroll">
        <table class="payment-history-table">
          <thead><tr><th>Day</th><th>Date</th><th>Paying</th><th>Received</th><th>Unpaid</th><th>Penalty</th><th>Penalty Paid</th><th>Discount</th><th>Reference ID</th><th>Reference Remark</th><th>Status</th><th>Remark</th></tr></thead>
          <tbody>${rows.length ? rows.map(r => `<tr>
            <td>${esc(r.day_number)}</td>
            <td>${paymentDateDisplay(r.payment_date)}</td>
            <td>${money(r.paying_amount)}</td>
            <td>${money(r.receiving_amount)}</td>
            <td>${money(r.remaining_amount)}</td>
            <td>${money(r.penalty_amount)}</td>
            <td>${r.penalty_paid ? "Yes" : "No"}</td>
            <td>${money(r.discount_amount)}</td>
            <td>${esc(r.reference_id || "—")}</td>
            <td>${esc(r.reference_remark || "—")}</td>
            <td>${esc(r.status || "Pending")}</td>
            <td>${esc(r.remark || "—")}</td>
          </tr>`).join("") : `<tr><td colspan="12">No payment history found.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
    <div class="payment-footer"><button class="btn secondary close">Close</button></div>
  `);
}

function renderPaymentModal(data, editPaymentId = "") {
  const loan = data.loan || {};
  const history = Array.isArray(data.history) ? data.history : [];
  const current = editPaymentId
    ? history.find(x => String(x.payment_id) === String(editPaymentId))
    : (data.current || null);

  if (!current) {
    modal(`
      <div class="mhead payment-mhead">
        <div><div class="ey">Payment</div><h2>${esc(loan.id || "")} — Payment Complete</h2></div>
        <button class="close">×</button>
      </div>
      <div class="payment-empty">
        <div class="payment-empty-icon">✓</div>
        <h3>${loan.status === "Closed" ? "Loan is Closed" : "No Pending Payment"}</h3>
        <p>Pay Amount: <b>${money(loan.payAmount || 0)}</b> &nbsp; | &nbsp; Remaining Amount: <b>${money(loan.remainingAmount || 0)}</b></p>
      </div>
      <div class="payment-footer">
        <button type="button" class="btn secondary" id="paymentHistoryBtn">History</button>
        <button type="button" class="btn secondary close">Close</button>
      </div>
    `);
    const historyBtn = $("#paymentHistoryBtn");
    if (historyBtn) historyBtn.onclick = () => renderPaymentHistory(history, loan);
    return;
  }

  const isEdit = !!editPaymentId;
  const serverDate = paymentDateInput(data.serverNow);
  const customer = loan.customerName || "—";
  const remaining = Number(loan.remainingAmount || 0);
  const penalty = Number(current.penalty_amount || 0);
  const paying = Number(current.paying_amount || 0);
  const totalPaid = Number(loan.payAmount || 0);

  modal(`
    <div class="mhead payment-mhead">
      <div><div class="ey">Loan Payment</div><h2>${isEdit ? "Edit Payment" : "Payment Entry"}</h2></div>
      <div class="payment-head-actions">
        <button type="button" class="btn secondary" id="paymentHistoryBtn">History</button>
        <button class="close">×</button>
      </div>
    </div>

    <form class="form payment-form" id="paymentForm">
      <input type="hidden" name="paymentId" value="${esc(current.payment_id)}">
      <input type="hidden" name="loanId" value="${esc(loan.id)}">

      <div class="payment-top-grid">
        <div class="payment-card">
          <div class="payment-card-title">Loan Details</div>
          <div class="payment-info-grid">
            ${paymentField("Today's Date", "todayDate", serverDate, {type:"date"})}
            ${paymentField("Loan ID", "loanIdDisplay", loan.id, {type:"text", readonly:true})}
            ${paymentField("Customer Name", "customerName", customer, {type:"text", readonly:true})}
            ${paymentField("Pay Amount", "payAmount", totalPaid, {type:"number", readonly:true})}
            ${paymentField("EMI", "emi", Number(loan.emi || 0), {type:"number", readonly:true})}
          </div>
        </div>

        <div class="payment-card payment-card-side">
          <div class="payment-card-title">Schedule</div>
          <div class="payment-info-grid">
            ${paymentField("Start Date", "startDate", paymentDateInput(loan.startDate), {type:"date", readonly:true})}
            ${paymentField("End Date", "endDate", paymentDateInput(loan.endDate), {type:"date", readonly:true})}
            ${paymentField("Remaining Amount", "remainingAmount", remaining, {type:"number", readonly:true})}
            ${paymentField("Penalty", "currentPenalty", penalty, {type:"number", readonly:true})}
          </div>
        </div>
      </div>

      <div class="payment-card payment-entry-card">
        <div class="payment-card-title">Payment Entry</div>
        <div class="payment-entry-grid">
          ${paymentField("Paying Amount", "payingAmount", paying, {type:"number", readonly:true})}
          ${paymentField("Receiving Amount", "receivingAmount", 0)}
          ${paymentField("Penalty Amount", "penaltyAmount", 0)}
          ${paymentField("Discount", "discountAmount", 0)}
        </div>
        <div class="field payment-remark">
          <label>Remark</label>
          <textarea name="remark" rows="3" placeholder="Enter payment remark">${esc(current.remark || "")}</textarea>
        </div>
        <div class="payment-day-meta">
          <span>Payment Day <b>${esc(current.day_number)}</b></span>
          <span>Due Date <b>${paymentDateDisplay(current.payment_date)}</b></span>
          <span>Status <b>${esc(current.status || "Pending")}</b></span>
          <span>Unpaid Carry Forward <b>${money(current.remaining_amount || 0)}</b></span>
        </div>
      </div>

      <div class="payment-footer">
        ${!isEdit ? `<button type="button" class="btn warning" id="closeLoanBtn">Close Loan</button>` : ""}
        <button type="submit" class="btn primary">${isEdit ? "Update Payment" : "Submit Payment"}</button>
      </div>
    </form>
  `);

  const historyBtn = $("#paymentHistoryBtn");
  if (historyBtn) historyBtn.onclick = () => renderPaymentHistory(history, loan);

  const form = $("#paymentForm");
  if (!form) return;

  form.onsubmit = async (event) => {
    event.preventDefault();
    const fd = new FormData(form);
    const receivingAmount = Number(fd.get("receivingAmount") || 0);
    const penaltyAmount = Number(fd.get("penaltyAmount") || 0);
    const discountAmount = Number(fd.get("discountAmount") || 0);

    if (receivingAmount < 0 || penaltyAmount < 0 || discountAmount < 0) {
      return toast("Amounts cannot be negative.");
    }
    if (penaltyAmount > penalty) return toast(`Penalty Amount cannot exceed ${money(penalty)}.`);
    if (discountAmount > Math.max(0, penalty - penaltyAmount)) return toast("Discount cannot exceed the unpaid penalty.");

    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
          paymentId: Number(fd.get("paymentId") || 0),
          loanId: fd.get("loanId"),
          receivingAmount,
          penaltyAmount,
          discountAmount,
          paymentDate: String(fd.get("todayDate") || ""),
          remark: String(fd.get("remark") || ""),
          executiveId: getSession()?.id || null
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Unable to save payment.");
      toast(result.accountClosed ? "Payment saved — account closed" : (isEdit ? "Payment updated" : "Payment saved"));
      close();
      render("addloan");
    } catch (error) {
      console.error(error);
      toast(error.message || "Unable to save payment.");
    }
  };

  const closeLoanBtn = $("#closeLoanBtn");
  if (closeLoanBtn) {
    closeLoanBtn.onclick = async () => {
      let confirmOutstanding = false;
      if (Number(loan.remainingAmount || 0) > 0) {
        confirmOutstanding = confirm(`Warning: this loan still has ${money(loan.remainingAmount)} remaining.

If you close it now, the loan will move to Close & Inactive and no more EMI will be generated. Continue?`);
      } else {
        confirmOutstanding = confirm("Close this loan/payment schedule? No new payment entries will be generated after closing.");
      }
      if (!confirmOutstanding) return;
      try {
        const response = await fetch(`/api/payments/close/${encodeURIComponent(loan.id)}`, {
          method: "POST", headers: {"Content-Type":"application/json"},
          body: JSON.stringify({executiveId: getSession()?.id || null, confirmOutstanding:true})
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Unable to close loan.");
        const rows=get(K.loans).map(x=>String(x.id)===String(loan.id)?{...x,status:"Closed"}:x);
        put(K.loans,rows); toast("Loan closed and moved to Close & Inactive"); close(); render("addloan");
      } catch (error) { console.error(error); toast(error.message || "Unable to close loan."); }
    };
  }
}

function mergeForm(id) {
  let x = id ? get(K.m).find(v => v.id === id) : {};
  let exs = get(K.e).map(e => `<option ${e.name === x.executive ? "selected" : ""}>${esc(e.name)}</option>`).join("");
  modal(`<div class="mhead"><h2>${id ? "Edit" : "Add"} Merged Loan</h2><button class="close">×</button></div><form class="form" id="mf"><div class="grid">${field("Old Loan ID", "oldLoanId", x.oldLoanId || "")} ${field("Customer Name", "customer", x.customer || "")} ${num("Loan Amount", "loanAmount", x.loanAmount)} ${num("Balance", "balance", x.balance)} ${num("New Loan Amount", "newLoanAmount", x.newLoanAmount)}<div class="field"><label>Assigned Executive</label><select name="executive">${exs}</select></div></div><p class="form-help">Enter an existing Loan ID.</p><div class="formfoot"><button type="button" class="btn secondary close">Cancel</button><button class="btn primary">Save</button></div></form>`);
  let f = $("#mf"), old = f.querySelector('[name="oldLoanId"]'), customer = f.querySelector('[name="customer"]'), amount = f.querySelector('[name="loanAmount"]');
  function lookup() { let c = get(K.c).find(v => String(v.loanId).toLowerCase() === old.value.trim().toLowerCase()); if (c) { customer.value = c.name; amount.value = c.amount; customer.readOnly = true; amount.readOnly = true; toast("Customer name & amount auto-filled"); } }
  old.addEventListener("change", lookup);
  lookup();
  f.onsubmit = e => {
    e.preventDefault();
    let fd = new FormData(f), d = get(K.m), c = get(K.c), oldId = fd.get("oldLoanId"), linked = c.find(v => v.loanId === oldId), o = { ...(id ? d.find(v => v.id === id) : {}), id: id || "M" + String(d.length + 1).padStart(3, "0"), oldLoanId: oldId, customer: fd.get("customer"), loanAmount: +fd.get("loanAmount"), balance: +fd.get("balance"), newLoanAmount: +fd.get("newLoanAmount"), executive: fd.get("executive") };
    put(K.m, id ? d.map(v => v.id === id ? o : v) : [...d, o]);
    if (linked) put(K.c, c.map(v => v.loanId === oldId ? { ...v, status: "Merged" } : v));
    close();
    render("merged");
    toast("Merged loan saved");
  };
}

function viewMerged(id) { let x = get(K.m).find(v => v.id === id); if (!x) return; modal(`<div class="mhead"><h2>Merged Loan Details</h2><button class="close">×</button></div><div class="details">${[["Old Loan ID", x.oldLoanId], ["Customer Name", x.customer], ["Loan Amount", money(x.loanAmount)], ["Balance", money(x.balance)], ["New Loan Amount", money(x.newLoanAmount)], ["Assigned Executive", x.executive]].map(a => `<div class="detail"><label>${a[0]}</label><b>${esc(a[1])}</b></div>`).join("")}</div><div class="foot"><button class="btn secondary close">Close</button></div>`); }

async function del(k, id, p) { 
  if (!confirm("Delete this record?")) return;

  try {
    if (k === K.e && DB_ONLINE) {
      const response = await fetch(`/api/executives/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Delete failed");
    }

    put(k, get(k).filter(x => x.id !== id));
    render(p);
    toast("Deleted");
  } catch (error) {
    toast(error.message || "Delete failed");
    console.error(error);
  }
}

// Init Nav Handlers
all("nav a").forEach(a => a.onclick = () => { render(a.dataset.p); document.querySelector("aside").classList.remove("open"); });
$("#menu").onclick = () => document.querySelector("aside").classList.toggle("open");
$("#modal").addEventListener("click", e => { if (e.target.id === "modal" || e.target.closest(".close") || e.target.closest("[data-drawer-close]")) close(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });

// App Init

async function initApp() {
  const session = getSession();
  if (!session) {
    showLoginScreen();
    return;
  }

  await bootstrapDatabase();
  render();
}

const logoutLink = document.querySelector(".logout");
if (logoutLink) {
  logoutLink.addEventListener("click", (event) => {
    event.preventDefault();
    clearSession();
    showLoginScreen();
  });
}

initApp();
