# HawkNexa ZKTeco edge sync - fresh Windows laptop setup (Python + pyzk)
# Run: setup-edge-sync.bat  (or powershell -ExecutionPolicy Bypass -File .\setup-edge-sync.ps1)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

if (-not $env:LOCALAPPDATA) {
    $env:LOCALAPPDATA = [Environment]::GetFolderPath("LocalApplicationData")
}
if (-not $env:ProgramFiles) {
    $env:ProgramFiles = [Environment]::GetFolderPath("ProgramFiles")
}

$PythonMinMajor = 3
$PythonMinMinor = 9
$PythonInstallerUrl = "https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe"
$PythonInstallerName = "python-3.12.7-amd64.exe"

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch {}

function Write-Step($msg) {
    Write-Host "`n==> $msg" -ForegroundColor Cyan
}

function Refresh-SessionPath {
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    if ($machinePath -and $userPath) {
        $env:Path = $machinePath + [char]59 + $userPath
    } elseif ($machinePath) {
        $env:Path = $machinePath
    }
}

function Get-PythonVersion($pythonExe) {
    $out = & $pythonExe --version 2>&1
    $text = "$out".Trim()
    if ($text -match 'Python (\d+)\.(\d+)') {
        return @{
            Major = [int]$Matches[1]
            Minor = [int]$Matches[2]
            Text = "$($Matches[1]).$($Matches[2])"
        }
    }
    return $null
}

function Test-PythonExe($pythonExe) {
    if (-not (Test-Path -LiteralPath $pythonExe)) {
        return $null
    }
    try {
        $ver = Get-PythonVersion $pythonExe
        if (-not $ver) {
            return $null
        }
        if ($ver.Major -gt $PythonMinMajor -or ($ver.Major -eq $PythonMinMajor -and $ver.Minor -ge $PythonMinMinor)) {
            return @{
                Exe = $pythonExe
                Version = $ver.Text
            }
        }
    } catch {}
    return $null
}

function Add-PythonCandidate($list, $path) {
    if ($path -and (Test-Path -LiteralPath $path)) {
        $list.Add($path)
    }
}

function Find-Python {
    $candidates = New-Object System.Collections.Generic.List[string]
    $pyExeProbe = 'import sys; print(sys.executable)'

    foreach ($cmd in @("python", "py")) {
        try {
            if ($cmd -eq "py") {
                $resolved = & py -3 -c $pyExeProbe 2>$null
            } else {
                $resolved = & python -c $pyExeProbe 2>$null
            }
            if ($resolved -and (Test-Path -LiteralPath $resolved.Trim())) {
                $candidates.Add($resolved.Trim())
            }
        } catch {}
    }

    $localPythonRoot = Join-Path $env:LOCALAPPDATA "Programs\Python"
    if (Test-Path -LiteralPath $localPythonRoot) {
        Get-ChildItem -LiteralPath $localPythonRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            Add-PythonCandidate $candidates (Join-Path $_.FullName "python.exe")
        }
    }

    foreach ($ver in @("312", "311", "310", "313")) {
        Add-PythonCandidate $candidates (Join-Path $env:LOCALAPPDATA "Programs\Python\Python$ver\python.exe")
        Add-PythonCandidate $candidates (Join-Path ${env:ProgramFiles} "Python$ver\python.exe")
    }

    $searchRoots = @(
        "$env:LOCALAPPDATA\Programs\Python",
        "${env:ProgramFiles}\Python312",
        "${env:ProgramFiles}\Python311",
        "${env:ProgramFiles}\Python310",
        "${env:ProgramFiles(x86)}\Python312"
    )
    foreach ($root in $searchRoots) {
        if (-not (Test-Path -LiteralPath $root)) {
            continue
        }
        Get-ChildItem -LiteralPath $root -Filter "python.exe" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
            $candidates.Add($_.FullName)
        }
    }

    $best = $null
    foreach ($exe in ($candidates | Select-Object -Unique)) {
        $hit = Test-PythonExe $exe
        if ($hit) {
            if (-not $best) {
                $best = $hit
            } else {
                $cur = Get-PythonVersion $hit.Exe
                $old = Get-PythonVersion $best.Exe
                if ($cur.Major -gt $old.Major -or ($cur.Major -eq $old.Major -and $cur.Minor -gt $old.Minor)) {
                    $best = $hit
                }
            }
        }
    }
    return $best
}

function Test-IsAdministrator {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($id)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Finalize-DownloadedFile($stagingPath, $destination) {
    Start-Sleep -Seconds 2
    if (Test-Path -LiteralPath $destination) {
        Remove-Item -LiteralPath $destination -Force -ErrorAction SilentlyContinue
    }
    Move-Item -LiteralPath $stagingPath -Destination $destination -Force
    Start-Sleep -Seconds 1
}

function Download-PythonInstaller($destination) {
    $staging = $destination + '.part'
    foreach ($path in @($destination, $staging)) {
        if (Test-Path -LiteralPath $path) {
            Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
        }
    }

    Write-Host "Downloading Python 3.12.7 (~25 MB). On slow Wi-Fi this can take several minutes." -ForegroundColor Gray
    Write-Host "Progress updates below - please wait and do not close this window." -ForegroundColor Gray

    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($curl) {
        Write-Host "Using curl.exe (shows download progress)..." -ForegroundColor Gray
        & curl.exe -f -L --retry 3 --retry-delay 3 --connect-timeout 30 --max-time 1800 `
            -o $staging $PythonInstallerUrl --progress-bar
        if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $staging)) {
            Finalize-DownloadedFile $staging $destination
            return $true
        }
        Write-Host "curl download did not complete - trying another method..." -ForegroundColor Yellow
    }

    try {
        Write-Host "Using BITS transfer (Windows background downloader)..." -ForegroundColor Gray
        Start-BitsTransfer -Source $PythonInstallerUrl -Destination $staging `
            -DisplayName "Python 3.12.7" -Description "HawkNexa setup" -Priority Foreground -ErrorAction Stop
        if (Test-Path -LiteralPath $staging) {
            Finalize-DownloadedFile $staging $destination
            return $true
        }
    } catch {
        Write-Host ("BITS failed: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
    }

    try {
        Write-Host "Using WebClient with percent progress..." -ForegroundColor Gray
        $wc = New-Object System.Net.WebClient
        $sub = Register-ObjectEvent -InputObject $wc -EventName DownloadProgressChanged -Action {
            $e = $EventArgs
            if ($e.TotalBytesToReceive -gt 0) {
                $pct = $e.ProgressPercentage
                $mb = [math]::Round($e.BytesReceived / 1MB, 1)
                $totalMb = [math]::Round($e.TotalBytesToReceive / 1MB, 1)
                $line = '  ' + $pct + '% (' + $mb + ' / ' + $totalMb + ' MB)'
                Write-Host $line
            }
        }
        try {
            $wc.DownloadFile($PythonInstallerUrl, $staging)
        } finally {
            Unregister-Event -SourceIdentifier $sub.Name -ErrorAction SilentlyContinue
            Remove-Job -Name $sub.Name -Force -ErrorAction SilentlyContinue
            $wc.Dispose()
        }
        if (Test-Path -LiteralPath $staging) {
            Finalize-DownloadedFile $staging $destination
            return $true
        }
    } catch {
        Write-Host ("WebClient failed: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
    }

    return $false
}

function Copy-InstallerForLaunch($downloadedPath) {
    $launchPath = Join-Path $env:TEMP ('hawknexa-python-' + [guid]::NewGuid().ToString('N') + '.exe')
    for ($attempt = 1; $attempt -le 10; $attempt++) {
        try {
            Copy-Item -LiteralPath $downloadedPath -Destination $launchPath -Force -ErrorAction Stop
            return $launchPath
        } catch {
            Write-Host ("Waiting for installer file to unlock (attempt {0}/10)..." -f $attempt) -ForegroundColor Yellow
            Start-Sleep -Seconds 3
        }
    }
    return $null
}

function Invoke-PythonInstaller($downloadedPath, $installerArgs) {
    $launchPath = Copy-InstallerForLaunch $downloadedPath
    if (-not $launchPath) {
        Write-Host "Could not prepare installer (file locked). Close other setup windows or reboot, then try again." -ForegroundColor Red
        return $null
    }

    for ($attempt = 1; $attempt -le 5; $attempt++) {
        try {
            $proc = Start-Process -FilePath $launchPath -ArgumentList $installerArgs -Wait -PassThru -ErrorAction Stop
            Remove-Item -LiteralPath $launchPath -Force -ErrorAction SilentlyContinue
            return $proc
        } catch {
            Write-Host ("Installer start failed (attempt {0}/5): {1}" -f $attempt, $_.Exception.Message) -ForegroundColor Yellow
            Start-Sleep -Seconds 4
        }
    }

    Remove-Item -LiteralPath $launchPath -Force -ErrorAction SilentlyContinue
    return $null
}

function Install-Python-Winget {
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
        return $false
    }
    Write-Step "Installing Python 3.12 with winget (first-time install may take several minutes)"
    & winget install --id Python.Python.3.12 -e --accept-source-agreements --accept-package-agreements --silent
    if ($LASTEXITCODE -ne 0) {
        return $false
    }
    return $true
}

function Install-Python-OfficialInstaller {
    $installer = Join-Path $env:TEMP $PythonInstallerName
    Write-Step "Downloading Python 3.12.7 from python.org (internet required)"
    if (-not (Download-PythonInstaller $installer)) {
        Write-Host "Download failed. Check internet, firewall, or proxy." -ForegroundColor Red
        Write-Host "Manual option: download and run the installer from:" -ForegroundColor Yellow
        Write-Host $PythonInstallerUrl -ForegroundColor Yellow
        return $false
    }
    $sizeMb = [math]::Round((Get-Item -LiteralPath $installer).Length / 1MB, 1)
    Write-Host ('Download complete (' + $sizeMb + ' MB).') -ForegroundColor Green

    $forAllUsers = Test-IsAdministrator
    if ($forAllUsers) {
        Write-Step "Installing Python silently for all users (add to PATH)"
        $installerArgs = @(
            "/quiet",
            "InstallAllUsers=1",
            "PrependPath=1",
            "Include_launcher=1",
            "Include_pip=1"
        )
    } else {
        Write-Step 'Installing Python for this user only (no admin - add to PATH)'
        $installerArgs = @(
            "/quiet",
            "InstallAllUsers=0",
            "PrependPath=1",
            "Include_launcher=1",
            "Include_pip=1"
        )
    }

    Write-Host "Preparing installer (releases download lock)..." -ForegroundColor Gray
    $proc = Invoke-PythonInstaller $installer $installerArgs
    Remove-Item -LiteralPath $installer -Force -ErrorAction SilentlyContinue
    if (-not $proc) {
        return $false
    }
    if ($proc.ExitCode -eq 0) {
        return $true
    }

    if ($forAllUsers -and $proc.ExitCode -eq 1603) {
        Write-Host "All-users install failed (1603) - retrying for current user only..." -ForegroundColor Yellow
        if (-not (Test-Path -LiteralPath $installer)) {
            if (-not (Download-PythonInstaller $installer)) {
                return $false
            }
        }
        $installerArgs = @(
            "/quiet",
            "InstallAllUsers=0",
            "PrependPath=1",
            "Include_launcher=1",
            "Include_pip=1"
        )
        $proc = Invoke-PythonInstaller $installer $installerArgs
        Remove-Item -LiteralPath $installer -Force -ErrorAction SilentlyContinue
        if ($proc -and $proc.ExitCode -eq 0) {
            return $true
        }
    }

    if ($proc) {
        Write-Host ("Python installer exited with code {0}" -f $proc.ExitCode) -ForegroundColor Red
        if ($proc.ExitCode -eq 1603) {
            Write-Host "Try: right-click setup-edge-sync.bat -> Run as administrator" -ForegroundColor Yellow
        }
    }
    return $false
}

function Get-DefaultPython312Path {
    return Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe"
}

function Ensure-PythonInstalled {
    Refresh-SessionPath
    $found = Find-Python
    if ($found) {
        return $found
    }

    $defaultPy = Get-DefaultPython312Path
    if (Test-Path -LiteralPath $defaultPy) {
        $hit = Test-PythonExe $defaultPy
        if ($hit) {
            return $hit
        }
    }

    Write-Host ""
    Write-Host "This laptop does not have Python 3.9+ yet (normal on a fresh Windows install)." -ForegroundColor Yellow
    Write-Host "HawkNexa will install Python 3.12 automatically." -ForegroundColor Yellow
    $answer = Read-Host "Continue? [Y/n]"
    if ($answer -ne "" -and $answer -notmatch "^[Yy]") {
        exit 1
    }

    $installed = Install-Python-Winget
    if (-not $installed) {
        Write-Host "winget not available or install failed - using official Python installer instead." -ForegroundColor Yellow
        $installed = Install-Python-OfficialInstaller
    }
    if (-not $installed) {
        Write-Host ""
        Write-Host "Could not install Python automatically." -ForegroundColor Red
        Write-Host "Install manually from https://www.python.org/downloads/" -ForegroundColor Red
        Write-Host 'Enable "Add python.exe to PATH", then run setup-edge-sync.bat again.' -ForegroundColor Red
        exit 1
    }

    Start-Sleep -Seconds 5
    Refresh-SessionPath
    $found = Find-Python
    if (-not $found) {
        Write-Host "Python was installed but not detected yet - retrying discovery..." -ForegroundColor Yellow
        Start-Sleep -Seconds 5
        Refresh-SessionPath
        $found = Find-Python
    }
    if (-not $found) {
        Write-Host "Python was installed but is not on PATH yet." -ForegroundColor Yellow
        Write-Host "Close this window, open a new Command Prompt, and run setup-edge-sync.bat again." -ForegroundColor Yellow
        exit 1
    }
    return $found
}

function Write-PythonShim($pythonExe) {
    $shim = Join-Path $ScriptDir "python.cmd"
    $lines = @(
        "@echo off",
        ('"{0}" %*' -f $pythonExe)
    )
    Set-Content -LiteralPath $shim -Value $lines -Encoding ASCII
    Write-Host ("Created {0} so run-edge-sync.bat works without editing PATH." -f $shim) -ForegroundColor Gray
}

Write-Host "HawkNexa biometric edge sync - setup for a fresh Windows laptop" -ForegroundColor Green
Write-Host "Script folder: $ScriptDir"
Write-Host "Needs: internet once (Python + pyzk). Nothing else is assumed to be pre-installed." -ForegroundColor Gray

Write-Step "Python 3.9+"
$py = Ensure-PythonInstalled
$pythonExe = $py.Exe
Write-Host ('Using {0} ({1})' -f $pythonExe, $py.Version) -ForegroundColor Green
Write-PythonShim $pythonExe

Write-Step "pip (Python package manager)"
& $pythonExe -m ensurepip --upgrade --default-pip
& $pythonExe -m pip install --upgrade pip

Write-Step "Installing pyzk (ZKTeco device library)"
& $pythonExe -m pip install pyzk

Write-Step 'Installing tzdata (timezone data; harmless on Windows)'
& $pythonExe -m pip install tzdata

Write-Host 'bootstrap.json is created on first agent run (paste API key from Setup - Attendance).' -ForegroundColor Gray

Write-Step "Verifying imports"
& $pythonExe -c "import zk; print('pyzk OK')"

$doneMsg = @'
Setup complete.

Next steps:
  1. Copy the sync API key from HawkNexa Setup - Attendance - Configuration.
  2. Double-click run-edge-sync.bat and paste the key when prompted.
  3. Optional test (one sync cycle):
       run-edge-sync.bat --once

Keep this whole scripts folder together (do not move only the .bat files).
'@
Write-Host $doneMsg -ForegroundColor Green
