@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "PORT=8099"
set "PAGE=dist/eml-workbench.html"
set "URL=http://127.0.0.1:%PORT%/%PAGE%"

rem If the server is already running on this port, just open the browser.
netstat -ano | findstr ":%PORT%" | findstr "LISTENING" >nul
if %errorlevel%==0 (
  echo [EML] Server already running on port %PORT%.
  echo [EML] Opening %URL%
  start "" "%URL%"
  exit /b 0
)

rem --- Find a Python interpreter ---
rem Prefer the known-good managed build: a bare "python" on PATH is often the
rem Microsoft Store stub, which exits immediately instead of running the server.
set "PY="
if exist "%USERPROFILE%\.workbuddy\binaries\python\versions\3.13.12\python.exe" (
  set "PY=%USERPROFILE%\.workbuddy\binaries\python\versions\3.13.12\python.exe"
)
if not defined PY (
  python -c "import sys" >nul 2>nul
  if !errorlevel!==0 set "PY=python"
)
if not defined PY (
  py -3 -c "import sys" >nul 2>nul
  if !errorlevel!==0 set "PY=py -3"
)
if not defined PY (
  echo [EML] Python not found - opening the HTML file directly.
  echo [EML] Note: some browsers restrict storage on file:// URLs.
  start "" "%~dp0dist\eml-workbench.html"
  exit /b 1
)

echo [EML] EML Workbench - local web server
echo [EML] URL: %URL%
echo [EML] Keep this window open; close it to stop the server.
echo.
start "" "%URL%"
"%PY%" -m http.server %PORT% --bind 127.0.0.1
