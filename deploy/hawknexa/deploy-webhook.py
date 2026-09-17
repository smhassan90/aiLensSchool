#!/usr/bin/env python3
"""HTTPS deploy webhook — triggered by GitHub Actions over port 443 (no inbound SSH)."""
import hmac
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer

SECRET = os.environ.get("DEPLOY_WEBHOOK_SECRET", "")
DEPLOY_SCRIPT = os.environ.get("DEPLOY_SCRIPT", "/opt/apps/hawknexa/deploy/deploy.sh")
DEPLOY_DIR = os.environ.get("DEPLOY_DIR", "/opt/apps/hawknexa/deploy")
COMPOSE_FILE = os.environ.get("COMPOSE_FILE", f"{DEPLOY_DIR}/docker-compose.prod.yml")
LISTEN_HOST = os.environ.get("DEPLOY_WEBHOOK_HOST", "0.0.0.0")
LISTEN_PORT = int(os.environ.get("DEPLOY_WEBHOOK_PORT", "9000"))
PID_FILE = "/tmp/hawknexa-deploy.pid"
LOG_FILE = "/tmp/hawknexa-deploy.log"
STATUS_FILE = f"{DEPLOY_DIR}/.last-deploy.json"
DEPLOY_CONTAINER = "hawknexa-deploy-run"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def write_status(payload: dict) -> None:
    payload.setdefault("updatedAt", utc_now())
    with open(STATUS_FILE, "w", encoding="utf-8") as handle:
        json.dump(payload, handle)
        handle.write("\n")


def read_status() -> dict:
    if not os.path.isfile(STATUS_FILE):
        return {"status": "idle"}
    try:
        with open(STATUS_FILE, encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {"status": "unknown"}


def log_tail(max_lines: int = 40) -> str:
    if not os.path.isfile(LOG_FILE):
        return ""
    try:
        with open(LOG_FILE, encoding="utf-8", errors="replace") as handle:
            lines = handle.readlines()
        return "".join(lines[-max_lines:])
    except OSError:
        return ""


def deploy_running() -> bool:
    inspect = subprocess.run(
        ["docker", "inspect", "-f", "{{.State.Running}}", DEPLOY_CONTAINER],
        capture_output=True,
        text=True,
    )
    return inspect.returncode == 0 and inspect.stdout.strip() == "true"


def start_deploy(deploy_targets: str = "") -> subprocess.Popen:
    """Run deploy.sh in a separate container so restarting deploy-webhook does not kill it."""
    subprocess.run(
        ["docker", "rm", "-f", DEPLOY_CONTAINER],
        capture_output=True,
        text=True,
    )

    write_status({"status": "running", "startedAt": utc_now()})

    log = open(LOG_FILE, "a", encoding="utf-8")
    log.write(f"\n=== Deploy triggered at {utc_now()} ===\n")
    log.flush()

    env_file = f"{DEPLOY_DIR}/.env"
    cmd = [
        "docker",
        "run",
        "--rm",
        "--name",
        DEPLOY_CONTAINER,
    ]
    if os.path.isfile(env_file):
        cmd += ["--env-file", env_file]
    if deploy_targets:
        cmd += ["-e", f"DEPLOY_TARGETS={deploy_targets}"]
    cmd += [
        "-v",
        "/opt/apps/hawknexa:/opt/apps/hawknexa",
        "-v",
        "/var/run/docker.sock:/var/run/docker.sock",
        "-e",
        "SKIP_WEBHOOK_RESTART=true",
        "-w",
        DEPLOY_DIR,
        "docker:27-cli",
        "sh",
        "-lc",
        (
            "apk add --no-cache bash git curl rsync python3 >/dev/null "
            f"&& bash {DEPLOY_SCRIPT}"
        ),
    ]

    return subprocess.Popen(
        cmd,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )


class DeployHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), fmt % args))

    def _authorized(self) -> bool:
        if not SECRET:
            return False
        auth = self.headers.get("Authorization", "")
        token = auth[7:].strip() if auth.startswith("Bearer ") else ""
        return bool(token) and hmac.compare_digest(token, SECRET)

    def _send_json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path in ("/internal/deploy/health", "/health"):
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"ok")
            return

        if self.path == "/internal/deploy/status":
            if not self._authorized():
                self.send_error(401)
                return
            status = read_status()
            running = deploy_running()
            if running and status.get("status") != "running":
                status = {**status, "status": "running"}
            if not running and status.get("status") == "running":
                status = {**status, "status": "failed", "message": "Deploy container stopped unexpectedly"}
            self._send_json(
                200,
                {
                    **status,
                    "running": running,
                    "logTail": log_tail(),
                },
            )
            return

        self.send_error(404)

    def do_POST(self):
        if self.path != "/internal/deploy":
            self.send_error(404)
            return

        if not SECRET:
            self.send_error(500, "DEPLOY_WEBHOOK_SECRET not configured")
            return

        if not self._authorized():
            self.send_error(401)
            return

        if deploy_running():
            self.send_response(409)
            self.end_headers()
            self.wfile.write(b"Deploy already in progress")
            return

        deploy_targets = ""
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length > 0:
            raw = self.rfile.read(length)
            try:
                payload = json.loads(raw.decode("utf-8"))
                targets = payload.get("targets")
                if isinstance(targets, list):
                    deploy_targets = ",".join(str(t) for t in targets if t)
                elif isinstance(targets, str) and targets.strip():
                    deploy_targets = targets.strip()
            except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
                pass

        proc = start_deploy(deploy_targets)

        with open(PID_FILE, "w", encoding="utf-8") as pid_file:
            pid_file.write(str(proc.pid))

        self.send_response(202)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(f"Deploy started (pid {proc.pid})\n".encode("utf-8"))


def main():
    if not SECRET:
        print(
            "WARNING: DEPLOY_WEBHOOK_SECRET is not set — health works but POST /internal/deploy returns 500",
            file=sys.stderr,
        )
    server = HTTPServer((LISTEN_HOST, LISTEN_PORT), DeployHandler)
    print(f"Deploy webhook listening on {LISTEN_HOST}:{LISTEN_PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
