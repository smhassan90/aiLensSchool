#!/usr/bin/env python3
"""
HawkNexa ZKTeco edge sync agent.
First run: paste the school sync API key from Setup → Attendance (saved locally automatically).
Each run: pulls device IP, intervals, and options from the API.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from zk import ZK
except ImportError:
    print("Install pyzk: pip install pyzk", file=sys.stderr)
    sys.exit(1)

SCRIPT_DIR = Path(__file__).resolve().parent
BOOTSTRAP_PATH = SCRIPT_DIR / "bootstrap.json"
AGENT_CONFIG_PATH = SCRIPT_DIR / "hawknexa_agent_config.json"
STATE_PATH = SCRIPT_DIR / "hawknexa_sync_state.json"

DEFAULT_BACKEND_URL = os.environ.get(
    "HAWKNEXA_API_URL",
    os.environ.get("BACKEND_URL", "https://hawknexabackend.fynals.com/api/v1"),
).rstrip("/")


def log(msg: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"[{ts}] {msg}", flush=True)


def load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data: dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def http_post(url: str, api_key: str, body: dict[str, Any]) -> dict[str, Any]:
    import urllib.error
    import urllib.request

    payload = json.dumps({**body, "apiKey": api_key}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json", "X-School-Sync-Key": api_key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            data = json.loads(raw) if raw else {}
            if isinstance(data, dict) and "data" in data:
                return data["data"]
            return data if isinstance(data, dict) else {}
    except urllib.error.HTTPError as e:
        if e.code == 429:
            retry = e.headers.get("Retry-After", "60")
            raise RuntimeError(f"HTTP 429 — retry after {retry}s") from e
        body_text = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {body_text}") from e


def list_school_devices(backend_url: str, api_key: str) -> dict[str, Any]:
    return http_post(f"{backend_url}/device/list-offline", api_key, {})


def pick_device(devices: list[dict[str, Any]], device_id: str | None) -> str:
    if device_id:
        for d in devices:
            if d.get("id") == device_id:
                return device_id
        raise RuntimeError(f"Device id {device_id} not found for this school")

    if not devices:
        raise RuntimeError("No active terminals in HawkNexa — add one under Setup → Attendance → Devices")

    if len(devices) == 1:
        only = devices[0]
        log(f"Using terminal: {only.get('name')} ({only.get('ipAddress')})")
        return str(only["id"])

    print("\nSelect the terminal on this laptop's network:\n")
    for i, d in enumerate(devices, start=1):
        print(f"  {i}. {d.get('name')} — {d.get('ipAddress')}:{d.get('port', 4370)}")
    while True:
        choice = input("\nEnter number: ").strip()
        if not choice.isdigit():
            continue
        idx = int(choice) - 1
        if 0 <= idx < len(devices):
            return str(devices[idx]["id"])


def resolve_bootstrap(args: argparse.Namespace) -> dict[str, str]:
    backend = DEFAULT_BACKEND_URL
    api_key = (args.api_key or os.environ.get("HAWKNEXA_API_KEY") or os.environ.get("API_KEY") or "").strip()
    device_id = (args.device_id or os.environ.get("DEVICE_ID") or "").strip() or None
    reconfigure = getattr(args, "reconfigure", False)

    if BOOTSTRAP_PATH.exists() and not reconfigure:
        raw = load_json(BOOTSTRAP_PATH)
        backend = str(raw.get("backendUrl") or backend).rstrip("/")
        api_key = api_key or str(raw.get("apiKey", "")).strip()
        device_id = device_id or str(raw.get("deviceId", "")).strip() or None

    if api_key and device_id and not reconfigure:
        return {"backendUrl": backend, "apiKey": api_key, "deviceId": device_id}

    if not api_key:
        print("Paste the school sync API key from HawkNexa → Setup → Attendance → Configuration.")
        api_key = input("API key: ").strip()

    if not api_key:
        log("API key is required")
        sys.exit(1)

    listing = list_school_devices(backend, api_key)
    backend = str(listing.get("backendUrl") or backend).rstrip("/")
    devices = listing.get("devices") or []
    school = listing.get("schoolName", "")
    if school:
        log(f"School: {school}")

    device_id = pick_device(devices, device_id)

    bootstrap = {"backendUrl": backend, "apiKey": api_key, "deviceId": device_id}
    save_json(BOOTSTRAP_PATH, bootstrap)
    log(f"Saved {BOOTSTRAP_PATH.name}")
    return bootstrap


def fetch_remote_config(bootstrap: dict[str, str], quiet: bool = False) -> dict[str, Any]:
    base = bootstrap["backendUrl"]
    device_id = bootstrap["deviceId"]
    api_key = bootstrap["apiKey"]
    url = f"{base}/device/{device_id}/edge-config-offline"
    if not quiet:
        log("Fetching configuration from HawkNexa…")
    remote = http_post(url, api_key, {})
    save_json(
        AGENT_CONFIG_PATH,
        {"fetchedAt": datetime.now(timezone.utc).isoformat(), **remote},
    )
    if not quiet:
        log(
            f"Config: attendance every {remote.get('syncIntervalSec')}s, "
            f"users every {remote.get('userSyncIntervalSec')}s"
        )
    return remote


def ack_full_sync(cfg: dict[str, Any]) -> None:
    device_id = cfg["DEVICE_ID"]
    base = cfg["BACKEND_URL"].rstrip("/")
    http_post(f"{base}/device/{device_id}/ack-full-sync-offline", cfg["API_KEY"], {})
    log("Full sync completed (portal flag cleared)")


def apply_remote_config(bootstrap: dict[str, str], remote: dict[str, Any]) -> dict[str, Any]:
    return remote_to_runtime(bootstrap, remote)


def remote_to_runtime(bootstrap: dict[str, str], remote: dict[str, Any]) -> dict[str, Any]:
    if remote.get("isActive") is False:
        raise RuntimeError("Device is disabled in admin portal")
    return {
        "BACKEND_URL": remote.get("backendUrl") or bootstrap["backendUrl"],
        "API_KEY": bootstrap["apiKey"],
        "DEVICE_ID": remote.get("deviceId") or bootstrap["deviceId"],
        "DEVICE_IP": remote.get("deviceIp", ""),
        "DEVICE_PORT": int(remote.get("devicePort") or 4370),
        "SCHOOL_TIMEZONE": remote.get("schoolTimezone", "Asia/Karachi"),
        "SYNC_INTERVAL_SEC": int(remote.get("syncIntervalSec") or 600),
        "CONNECTION_TIMEOUT_SEC": int(remote.get("connectionTimeoutSec") or 30),
        "PREFER_UDP": bool(remote.get("preferUdp")),
        "USER_SYNC_INTERVAL_SEC": int(remote.get("userSyncIntervalSec") or 600),
        "BATCH_SIZE": int(remote.get("batchSize") or 25),
        "PUNCH_TIME_MODE": remote.get("punchTimeMode") or "school_local",
        "CONFIG_REFRESH_INTERVAL_SEC": int(remote.get("configRefreshIntervalSec") or 120),
    }


def load_state() -> dict[str, Any]:
    if not STATE_PATH.exists():
        return {"fingerprints": [], "last_user_sync": 0}
    return load_json(STATE_PATH)


def save_state(state: dict[str, Any]) -> None:
    save_json(STATE_PATH, state)


def punch_fingerprint(device_user_id: str, record_time: datetime) -> str:
    return f"{device_user_id}|{record_time.isoformat()}"


def connect_device(cfg: dict[str, Any]) -> ZK:
    return ZK(
        cfg["DEVICE_IP"],
        port=int(cfg["DEVICE_PORT"]),
        timeout=int(cfg["CONNECTION_TIMEOUT_SEC"]),
        password=0,
        force_udp=bool(cfg["PREFER_UDP"]),
        ommit_ping=False,
    )


def read_attendance(cfg: dict[str, Any]) -> list[dict[str, Any]]:
    zk = connect_device(cfg)
    conn = zk.connect()
    try:
        logs = conn.get_attendance() or []
        out = []
        for row in logs:
            uid = str(getattr(row, "user_id", "") or getattr(row, "uid", ""))
            ts = getattr(row, "timestamp", None)
            if not uid or not ts:
                continue
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            out.append(
                {
                    "deviceUserId": uid,
                    "recordTime": ts.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                    "type": int(getattr(row, "punch", 0) or 0),
                    "state": int(getattr(row, "status", 0) or 0),
                }
            )
        return out
    finally:
        conn.disconnect()


def read_users(cfg: dict[str, Any]) -> list[dict[str, Any]]:
    zk = connect_device(cfg)
    conn = zk.connect()
    try:
        users = conn.get_users() or []
        out = []
        for u in users:
            uid = str(getattr(u, "uid", "") or "")
            if not uid:
                continue
            out.append(
                {
                    "deviceUserId": uid,
                    "deviceUserName": getattr(u, "name", None),
                    "deviceBadgeId": str(getattr(u, "user_id", "") or "") or None,
                }
            )
        return out
    finally:
        conn.disconnect()


def sync_users(cfg: dict[str, Any]) -> None:
    users = read_users(cfg)
    device_id = cfg["DEVICE_ID"]
    base = cfg["BACKEND_URL"].rstrip("/")
    res = http_post(f"{base}/device/{device_id}/sync-users-offline", cfg["API_KEY"], {"users": users})
    log(f"Synced {len(users)} users — {res}")


def sync_attendance(cfg: dict[str, Any], state: dict[str, Any], reset: bool = False) -> None:
    fingerprints = set(state.get("fingerprints") or [])
    if reset:
        fingerprints = set()

    logs = read_attendance(cfg)
    new_logs = []
    for row in logs:
        fp = punch_fingerprint(
            row["deviceUserId"],
            datetime.fromisoformat(row["recordTime"].replace("Z", "+00:00")),
        )
        if fp in fingerprints:
            continue
        new_logs.append(row)
        fingerprints.add(fp)

    if not new_logs:
        log("No new attendance logs")
        state["fingerprints"] = list(fingerprints)[-50000:]
        save_state(state)
        return

    device_id = cfg["DEVICE_ID"]
    base = cfg["BACKEND_URL"].rstrip("/")
    batch = int(cfg["BATCH_SIZE"])
    for i in range(0, len(new_logs), batch):
        chunk = new_logs[i : i + batch]
        res = http_post(
            f"{base}/device/{device_id}/sync-attendance-offline",
            cfg["API_KEY"],
            {"logs": chunk, "punchTimeMode": cfg["PUNCH_TIME_MODE"]},
        )
        log(f"Uploaded {len(chunk)} punches — {res}")

    state["fingerprints"] = list(fingerprints)[-50000:]
    save_state(state)


def test_backend(cfg: dict[str, Any]) -> None:
    device_id = cfg["DEVICE_ID"]
    base = cfg["BACKEND_URL"].rstrip("/")
    res = http_post(f"{base}/device/{device_id}/test-backend-offline", cfg["API_KEY"], {})
    log(f"Backend OK — school={res.get('schoolName')} device={res.get('deviceName')}")


def run_cycle(cfg: dict[str, Any], state: dict[str, Any], reset: bool) -> None:
    now = time.time()
    if now - float(state.get("last_user_sync") or 0) >= float(cfg["USER_SYNC_INTERVAL_SEC"]):
        sync_users(cfg)
        state["last_user_sync"] = now
        save_state(state)
    sync_attendance(cfg, state, reset=reset)


def main() -> None:
    parser = argparse.ArgumentParser(description="HawkNexa ZKTeco edge sync")
    parser.add_argument("--once", action="store_true", help="Run a single cycle")
    parser.add_argument("--reset", action="store_true", help="Clear local dedup state and re-upload")
    parser.add_argument("--api-key", dest="api_key", help="School sync API key (or paste when prompted)")
    parser.add_argument("--device-id", dest="device_id", help="Terminal UUID (skip menu if set)")
    parser.add_argument(
        "--reconfigure",
        action="store_true",
        help="Ask for API key / terminal again (or delete bootstrap.json)",
    )
    args = parser.parse_args()

    bootstrap = resolve_bootstrap(args)
    state = load_state()
    if args.reset:
        state["fingerprints"] = []
        state.pop("full_sync_handled", None)
        save_state(state)

    remote = fetch_remote_config(bootstrap, quiet=False)
    cfg = apply_remote_config(bootstrap, remote)

    if not str(cfg.get("DEVICE_IP", "")).strip():
        log("Device IP missing — add the terminal in Setup → Attendance → Devices")
        sys.exit(1)

    test_backend(cfg)

    device_errors = 0
    http_errors = 0
    last_config_fetch = time.time()
    full_sync_pending = bool(remote.get("fullSync"))
    if full_sync_pending:
        log("Full re-upload requested from portal — clearing local dedup cache")
        state["fingerprints"] = []
        save_state(state)

    while True:
        try:
            now = time.time()
            refresh_sec = int(cfg.get("CONFIG_REFRESH_INTERVAL_SEC") or 120)
            if now - last_config_fetch >= refresh_sec:
                remote = fetch_remote_config(bootstrap, quiet=True)
                cfg = apply_remote_config(bootstrap, remote)
                last_config_fetch = now
                if remote.get("fullSync"):
                    log("Full re-upload requested from portal — clearing local dedup cache")
                    state["fingerprints"] = []
                    save_state(state)
                    full_sync_pending = True

            run_cycle(cfg, state, reset=False)
            if full_sync_pending:
                ack_full_sync(cfg)
                full_sync_pending = False
            device_errors = 0
            http_errors = 0
        except RuntimeError as e:
            msg = str(e)
            if "429" in msg:
                http_errors += 1
                sleep_s = min(60 * http_errors, 300)
                log(f"Rate limited — sleeping {sleep_s}s")
                time.sleep(sleep_s)
            else:
                log(f"HTTP error: {e}")
                http_errors += 1
                time.sleep(min(30 * http_errors, 120))
        except Exception as e:
            device_errors += 1
            sleep_s = min(2 ** device_errors, 60)
            log(f"Device error ({e}) — backoff {sleep_s}s")
            time.sleep(sleep_s)

        if args.once:
            break
        time.sleep(int(cfg["SYNC_INTERVAL_SEC"]))


if __name__ == "__main__":
    main()
