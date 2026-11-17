@echo off
title Green Finance SQL Server
echo ==========================================
echo Green Finance - SQL Server
echo ==========================================
echo.
if not exist node_modules (
  echo Installing Node packages...
  call npm install
  if errorlevel 1 goto :error
)
echo.
echo Starting Green Finance...
echo Open http://localhost:3001 in your browser.
echo.
call npm run dev
goto :eof
:error
echo.
echo Setup failed. Read README-FIRST.txt for troubleshooting.
pause
