@echo off
REM HawkNexa ZKTeco edge sync (run after setup-edge-sync.bat on a fresh laptop)
cd /d "%~dp0"
if not exist "%~dp0hawknexa_device_sync.py" (
  echo.
  echo ERROR: hawknexa_device_sync.py was not found in:
  echo   %~dp0
  echo.
  echo Copy the entire scripts folder, then run setup-edge-sync.bat first.
  echo.
  pause
  exit /b 1
)

if exist "%~dp0python.cmd" (
  call "%~dp0python.cmd" "%~dp0hawknexa_device_sync.py" %*
  if errorlevel 1 pause
  exit /b %ERRORLEVEL%
)

where python >nul 2>&1 && (
  python "%~dp0hawknexa_device_sync.py" %*
  if errorlevel 1 pause
  exit /b %ERRORLEVEL%
)

if exist "%LocalAppData%\Programs\Python\Python312\python.exe" (
  "%LocalAppData%\Programs\Python\Python312\python.exe" "%~dp0hawknexa_device_sync.py" %*
  if errorlevel 1 pause
  exit /b %ERRORLEVEL%
)

if exist "%ProgramFiles%\Python312\python.exe" (
  "%ProgramFiles%\Python312\python.exe" "%~dp0hawknexa_device_sync.py" %*
  if errorlevel 1 pause
  exit /b %ERRORLEVEL%
)

where py >nul 2>&1 && (
  py -3 "%~dp0hawknexa_device_sync.py" %*
  if errorlevel 1 pause
  exit /b %ERRORLEVEL%
)

echo.
echo Python not found. On a new laptop, run setup-edge-sync.bat first.
echo.
pause
exit /b 1
