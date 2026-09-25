# HawkNexa ZKTeco edge sync — install Python + pyzk on Windows
# Run:  powershell -ExecutionPolicy Bypass -File .\setup-edge-sync.ps1
# Or double-click setup-edge-sync.bat

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

function Write-Step($msg) {
    Write-Host "`n==> $msg" -ForegroundColor Cyan
}

function Find-Python {
    foreach ($cmd in @("python", "py")) {
        try {
            $v = & $cmd -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
            if ($v) {
                $parts = $v.Trim().Split(".")
                $major = [int]$parts[0]
                $minor = [int]$parts[1]
                if ($major -ge 3 -and $minor -ge 9) {
                    return @{ Command = $cmd; Version = $v.Trim() }
                }
            }
        } catch {}
    }
    return $null
}

Write-Host "HawkNexa biometric edge sync — prerequisite setup" -ForegroundColor Green
Write-Host "Script folder: $ScriptDir"

Write-Step "Checking Python 3.9+"
$py = Find-Python
if (-not $py) {
    Write-Host "Python not found (or version too old)." -ForegroundColor Yellow
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        $answer = Read-Host "Install Python 3.12 with winget? [Y/n]"
        if ($answer -eq "" -or $answer -match "^[Yy]") {
            Write-Step "Installing Python via winget (may prompt for approval)"
            winget install --id Python.Python.3.12 -e --accept-source-agreements --accept-package-agreements
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
            $py = Find-Python
        }
    }
    if (-not $py) {
        Write-Host @"

Could not find Python 3.9+.
Install manually from https://www.python.org/downloads/
  - Check "Add python.exe to PATH"
Then run this script again.

"@ -ForegroundColor Red
        exit 1
    }
}

$python = $py.Command
Write-Host "Using $python ($($py.Version))" -ForegroundColor Green

Write-Step "Upgrading pip"
& $python -m pip install --upgrade pip

Write-Step "Installing pyzk (ZKTeco device library)"
& $python -m pip install pyzk

Write-Step "Installing tzdata (timezone data; harmless on Windows)"
& $python -m pip install tzdata

Write-Host "bootstrap.json is created automatically on first agent run (paste API key from Setup -> Attendance)." -ForegroundColor Gray

Write-Step "Verifying imports"
& $python -c "from zk import ZK; print('pyzk OK')"

Write-Host @"

Setup complete.

Next steps:
  1. Copy the sync API key from HawkNexa Setup -> Attendance -> Configuration.
  2. Run run-edge-sync.bat and paste the key when prompted.
  3. Test one sync cycle:
       $python hawknexa_device_sync.py --once
  3. Run continuously:
       $python hawknexa_device_sync.py

Or use:  run-edge-sync.bat

"@ -ForegroundColor Green
