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
PORT=3001
```

For Windows Authentication, use `DB_AUTH=windows` and
`DB_TRUSTED_CONNECTION=true`. The Windows account running Node.js must have
permission to access the database. Windows Authentication also requires a
working Microsoft SQL Server ODBC driver on the server.

Start the application with `START-WINDOWS.bat` or:

```bat
npm.cmd start
```

Allow inbound TCP port 3001 in Windows Firewall, or configure IIS as a reverse
proxy to the local application at `http://localhost:3001`.

## IIS reverse proxy

The included `web.config` forwards the entire website to Node.js on port 3001.
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

Set the IIS site physical path to the uploaded folder containing web.config. Visitors use the IIS website address on port 80 or 443. Port 3001 does not need an inbound firewall rule when IIS and Node.js run on the same server.

For an existing deployment, back up and preserve the server .env before uploading. Set PORT=3001 in that file and restart the Node.js process. Keep Node.js running with a Windows service or process manager for automatic restart after reboot.

Review and run SQL migrations required by your database before using the corresponding features. Uploading files does not execute migrations.
