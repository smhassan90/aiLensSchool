@echo off
REM HawkNexa edge sync - first-time setup on a fresh Windows laptop (installs Python + pyzk)
REM Run from this folder. Keep setup-edge-sync.ps1 and hawknexa_device_sync.py here.
cd /d "%~dp0"
if not exist "%~dp0setup-edge-sync.ps1" (
  echo.
  echo ERROR: setup-edge-sync.ps1 was not found in:
  echo   %~dp0
  echo.
  echo Copy the entire "scripts" folder to this PC, then run setup-edge-sync.bat again.
  echo.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-edge-sync.ps1"
if errorlevel 1 pause
