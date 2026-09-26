# HawkNexa ZKTeco edge sync

Cloud-hosted HawkNexa cannot open TCP port **4370** on school LANs. Run `hawknexa_device_sync.py` on a laptop or Android phone (Termux) on the **same network** as the terminal.

## Admin portal (all configuration)

1. **Setup → Attendance**  
   - **Configuration** tab: sync behaviour (intervals, punch mode, UDP, auto check-out), download **bootstrap.json**  
   - **Devices** tab: terminal name, LAN IP, port, per-device poll interval  
2. **Teacher attendance → Device sync** — map device users to teachers.

After changing settings in the portal, **stop and restart** the Python script so it fetches fresh config from the API.

## Laptop agent

### Install prerequisites (fresh Windows laptop)

Copy the **entire** `scripts` folder to the school PC (e.g. `C:\HawkNexa-edge-sync`). Do not copy only the `.bat` files.

| OS | Run |
|----|-----|
| **Windows** | Double-click `setup-edge-sync.bat` once (needs internet). It installs **Python 3.12** if missing (winget or python.org), then `pyzk` and `tzdata`. Creates `python.cmd` for `run-edge-sync.bat`. |
| **Linux / macOS / Termux** | `./setup-edge-sync.sh` |

Nothing else needs to be pre-installed on Windows (no Python, pip, or winget required — setup falls back to the official installer).

### First run on the laptop

1. Run `setup-edge-sync.bat`, then `run-edge-sync.bat`.
2. Paste the **school sync API key** from **Setup → Attendance → Configuration** (Copy key).
3. If the school has multiple terminals, choose which one this laptop syncs.

The script saves `bootstrap.json` locally (you do not download anything from the portal). On **every run** it refreshes IP, intervals, and options from the API.

```bash
python hawknexa_device_sync.py --once   # test
python hawknexa_device_sync.py          # keep running
```

### API host URL

Set `PUBLIC_API_BASE_URL` on the backend (e.g. `https://hawknexabackend.fynals.com/api/v1`) so bootstrap and edge-config return the correct `backendUrl`.

## On-prem API (optional)

```bash
node scripts/fetch-device-data.js 192.168.1.201 --token <admin-jwt> --api-url http://localhost:3001/api/v1
```

## Database

Apply `backend/prisma/add-biometric-devices.sql` once on MySQL.
