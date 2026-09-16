#!/usr/bin/env python3
"""HTTPS deploy webhook — triggered by GitHub Actions over port 443 (no inbound SSH)."""
import fcntl
import hmac
import os
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

SECRET = os.environ.get("DEPLOY_WEBHOOK_SECRET", "")
DEPLOY_SCRIPT = os.environ.get("DEPLOY_SCRIPT", "/opt/apps/hawknexa/deploy/deploy.sh")
LISTEN_HOST = os.environ.get("DEPLOY_WEBHOOK_HOST", "0.0.0.0")
LISTEN_PORT = int(os.environ.get("DEPLOY_WEBHOOK_PORT", "9000"))
LOCK_PATH = "/tmp/hawknexa-deploy.lock"


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

        lock_file = open(LOCK_PATH, "w")
        try:
            fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self.send_response(409)
            self.end_headers()
            self.wfile.write(b"Deploy already in progress")
            return

        try:
            result = subprocess.run(
                ["bash", DEPLOY_SCRIPT],
                capture_output=True,
                text=True,
                timeout=1800,
            )
            body = (result.stdout or "") + (result.stderr or "")
            if result.returncode == 0:
                self.send_response(200)
            else:
                self.send_response(500)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(body.encode("utf-8", errors="replace"))
        finally:
            fcntl.flock(lock_file, fcntl.LOCK_UN)
            lock_file.close()


def main():
    if not SECRET:
        print("ERROR: DEPLOY_WEBHOOK_SECRET is required", file=sys.stderr)
        sys.exit(1)
    server = HTTPServer((LISTEN_HOST, LISTEN_PORT), DeployHandler)
    print(f"Deploy webhook listening on {LISTEN_HOST}:{LISTEN_PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
