const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const outputDir = path.join(projectRoot, "Wdist");
const deploymentFiles = [
  "server.js",
  "index.html",
  "login.html",
  "logo.svg",
  "script.js",
  "style.css",
  "loanIdUtils.js",
  "paymentScheduleUtils.js",
  "package.json",
  "package-lock.json",
  ".env.example",
  "web.config",
  "DEPLOY-WINDOWS.md",
  "START-WINDOWS.bat",
  "Payment_SQL_Migration.sql",
  "Transaction_SQL_Migration.sql",
  "Executive_Username_Unique_Migration.sql",
  "PrefixLoan_SQL_Migration.sql",
  "PrefixLoan_SQL_Setup.sql",
  "Role_Family_NRE_Migration.sql",
  "Green_Finance_Executive_Assignment_Migration.sql",
  "Penalty_Config_Migration.sql"
];

for (const file of ["server.js", "script.js", "loanIdUtils.js", "paymentScheduleUtils.js"]) {
  childProcess.execFileSync(process.execPath, ["--check", file], {
    cwd: projectRoot,
    stdio: "inherit"
  });
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

for (const file of deploymentFiles) {
  fs.copyFileSync(path.join(projectRoot, file), path.join(outputDir, file));
}

const templatePath = path.join(outputDir, ".env.example");
fs.writeFileSync(templatePath, fs.readFileSync(templatePath, "utf8").replace(/^PORT=3000/m, "PORT=3001"));

console.log(`Windows deployment package created at ${outputDir}`);
console.log("The private .env file was intentionally excluded.");
