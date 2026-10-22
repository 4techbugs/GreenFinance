# Linux deployment

Upload the contents of this `dist` directory to the server. Do not upload the
project's private `.env` file.

Install and configure the application:

```bash
npm ci --omit=dev
cp .env.example .env
nano .env
npm start
```

Use SQL Server Authentication on Linux:

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

Set `DB_ENCRYPT=true` when the SQL Server requires an encrypted connection.
Allow the application server's IP address through the SQL Server firewall and
make sure TCP port 1433 is reachable.

For a long-running deployment, start `npm start` with systemd or another process
manager and put Nginx or Apache in front of port 3000.
