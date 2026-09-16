#!/usr/bin/env python3
"""HTTPS deploy webhook — triggered by GitHub Actions over port 443 (no inbound SSH)."""
import hmac
import os
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

SECRET = os.environ.get("DEPLOY_WEBHOOK_SECRET", "")
DEPLOY_SCRIPT = os.environ.get("DEPLOY_SCRIPT", "/opt/apps/hawknexa/deploy/deploy.sh")
LISTEN_HOST = os.environ.get("DEPLOY_WEBHOOK_HOST", "0.0.0.0")
LISTEN_PORT = int(os.environ.get("DEPLOY_WEBHOOK_PORT", "9000"))
PID_FILE = "/tmp/hawknexa-deploy.pid"
LOG_FILE = "/tmp/hawknexa-deploy.log"


def deploy_running() -> bool:
    if not os.path.exists(PID_FILE):
        return False
    try:
        pid = int(open(PID_FILE, encoding="utf-8").read().strip())
        os.kill(pid, 0)
        return True
    except (OSError, ValueError):
        return False


class DeployHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), fmt % args))

    def do_POST(self):
        if self.path != "/internal/deploy":
            self.send_error(404)
            return

        if not SECRET:
            self.send_error(500, "DEPLOY_WEBHOOK_SECRET not configured")
            return

        auth = self.headers.get("Authorization", "")
        token = auth[7:].strip() if auth.startswith("Bearer ") else ""
        if not token or not hmac.compare_digest(token, SECRET):
            self.send_error(401)
            return

        if deploy_running():
            self.send_response(409)
            self.end_headers()
            self.wfile.write(b"Deploy already in progress")
            return

        log = open(LOG_FILE, "a", encoding="utf-8")
        log.write("\n=== Deploy triggered ===\n")
        log.flush()
        proc = subprocess.Popen(
            ["bash", DEPLOY_SCRIPT],
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        with open(PID_FILE, "w", encoding="utf-8") as pid_file:
            pid_file.write(str(proc.pid))

        self.send_response(202)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(f"Deploy started (pid {proc.pid})\n".encode("utf-8"))


def main():
    if not SECRET:
        print("ERROR: DEPLOY_WEBHOOK_SECRET is required", file=sys.stderr)
        sys.exit(1)
    server = HTTPServer((LISTEN_HOST, LISTEN_PORT), DeployHandler)
    print(f"Deploy webhook listening on {LISTEN_HOST}:{LISTEN_PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
