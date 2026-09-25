@echo off
REM HawkNexa edge sync — install Python dependencies (Windows)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-edge-sync.ps1"
if errorlevel 1 pause
