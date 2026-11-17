# Windows Server deployment

## Server setup

1. Install a current Node.js LTS release on Windows Server.
2. Upload the contents of the `Wdist` folder to the application directory.
3. Open Command Prompt in that directory and run:

```bat
npm.cmd ci --omit=dev
copy .env.example .env
notepad .env
```

For SQL Server username/password authentication, configure `.env` as follows:

```env
DB_SERVER=your-sql-host,1433
DB_DATABASE=greenloadmgt
DB_AUTH=sql
DB_TRUSTED_CONNECTION=false
DB_USER=your_sql_username
DB_PASSWORD=your_sql_password
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
PORT=3000
```

For Windows Authentication, use `DB_AUTH=windows` and
`DB_TRUSTED_CONNECTION=true`. The Windows account running Node.js must have
permission to access the database. Windows Authentication also requires a
working Microsoft SQL Server ODBC driver on the server.

Start the application with `START-WINDOWS.bat` or:

```bat
npm.cmd start
```

Allow inbound TCP port 3000 in Windows Firewall, or configure IIS as a reverse
proxy to the local application at `http://localhost:3000`.

## IIS reverse proxy

The included `web.config` forwards the entire website to Node.js on port 3000.
Install IIS URL Rewrite and Application Request Routing (ARR), then enable the
ARR proxy at the server level. From an Administrator Command Prompt:

```bat
%windir%\system32\inetsrv\appcmd.exe set config -section:system.webServer/proxy /enabled:"True" /commit:apphost
iisreset
```

If the application uses a different `PORT`, update the port in `web.config` to
match before uploading it.

Do not publish `.env` or send it to anyone because it contains the database
password.

## Admin menu role refresh

After uploading this update, restart the Node.js application and reload the
portal with Ctrl+F5. Deploy both server.js and the frontend files together:
the portal now refreshes the current account through GET /api/me before
showing its menu. Existing browser sessions receive the current database role.

The header should show AD for an admin account. EX followed by the name admin
means the account is being treated as an executive; an account name does not
assign permissions. Check the intended account in SQL Server if it still shows EX:

```sql
SELECT executive_id, username, full_name, role, status
FROM dbo.executives
WHERE LOWER(LTRIM(RTRIM(username))) = N'admin';
```

Use the intended login username in the query. Its role must be Admin and its
status Active for admin access. This update does not change database roles.

## Data loading and page refresh after an update

Replacing server.js on disk does not restart an already running Node process.
If /api/health returns JSON but /api/me returns the portal HTML, the running
backend has not loaded the account refresh route. Restart the Node process
using its existing launcher or service manager after uploading the files.
For a manually started server, stop that application's console with Ctrl+C
and run START-WINDOWS.bat again from the deployed directory.

Check https://your-domain/api/health after restart. This build returns
apiVersion: 2026-10-22.2. Opening /api/me without a login session's request
headers should return HTTP 401 JSON. An unknown /api route should return
HTTP 404 JSON. It must not return index.html with HTTP 200.

The frontend supports the older backend during an update when /api/me is
missing. Data requests continue to use the login session and server-side
permissions. Genuine account verification or data failures show a retry action
instead of an empty dashboard. Upload index.html and script.js together, then
reload with Ctrl+F5.

## PM2 deployment path

Run pm2 describe greenfinance-api and verify script path and exec cwd point to
the directory receiving the update. For this installation that is expected to
be C:\HostingSpaces\admin\greenfinance.4techbugs.in\wwwroot with server.js as
the script. Restart the existing process with:

```bat
pm2 restart greenfinance-api --update-env
pm2 logs greenfinance-api --lines 20
```

The six legacy tables customers, loan_applications, rejected_loans,
merged_loans, executive_wallet, and payment_history are optional during
bootstrap. The updated API checks for their existence before querying them.
No tables are created by this compatibility fix. Required data in profiles,
added_loans, prefix_loans, and executives must load successfully; failures
return HTTP 500 rather than silently appearing as empty records.
