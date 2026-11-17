@echo off
setlocal
cd /d "%~dp0"

if not exist .env (
  echo ERROR: .env is missing.
  echo Copy .env.example to .env and enter the database settings first.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing production packages...
  call npm.cmd ci --omit=dev
  if errorlevel 1 (
    echo Package installation failed.
    pause
    exit /b 1
  )
)

echo Starting Green Finance...
call npm.cmd start
endlocal
