const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const outputDir = path.join(projectRoot, "dist");
const deploymentFiles = [
  "server.js",
  "index.html",
  "login.html",
  "script.js",
  "style.css",
  "loanIdUtils.js",
  "package.json",
  "package-lock.json",
  ".env.example",
  "DEPLOY-LINUX.md",
  "Payment_SQL_Migration.sql",
  "PrefixLoan_SQL_Migration.sql",
  "PrefixLoan_SQL_Setup.sql"
];

for (const file of ["server.js", "script.js", "loanIdUtils.js"]) {
  require("child_process").execFileSync(process.execPath, ["--check", file], {
    cwd: projectRoot,
    stdio: "inherit"
  });
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

for (const file of deploymentFiles) {
  fs.copyFileSync(path.join(projectRoot, file), path.join(outputDir, file));
}

console.log(`Deployment package created at ${outputDir}`);
console.log("The private .env file was intentionally excluded.");
