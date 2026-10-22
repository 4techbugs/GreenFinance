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
