@echo off
REM Run HawkNexa ZKTeco edge sync (after setup-edge-sync.bat)
cd /d "%~dp0"
where python >nul 2>&1 && set PY=python
if not defined PY where py >nul 2>&1 && set PY=py -3
if not defined PY (
  echo Python not found. Run setup-edge-sync.bat first.
  pause
  exit /b 1
)
%PY% hawknexa_device_sync.py %*
if errorlevel 1 pause
