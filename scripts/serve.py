#!/usr/bin/env python3
"""Static file server for the portfolio site with a content-editing API.

Serves the portfolio root statically and exposes POST /api/content for the
admin panel at /admin/ to save edits to content.json.

Usage:
    python scripts/serve.py [--port 8641]
"""

import argparse
import hmac
import http.server
import json
import os
import shutil
import smtplib
import threading
import time
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PORTFOLIO_ROOT = SCRIPT_DIR.parent
CONTENT_PATH = PORTFOLIO_ROOT / "content.json"
BACKUPS_DIR = PORTFOLIO_ROOT / "content.backups"
MESSAGES_DIR = PORTFOLIO_ROOT / "messages"
MESSAGES_PATH = MESSAGES_DIR / "messages.jsonl"

REQUIRED_KEYS = ("hero", "stats", "work", "experience", "skills")

RATE_LIMIT_SECONDS = 30
_last_post_by_ip = {}
_rate_lock = threading.Lock()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PORTFOLIO_ROOT), **kwargs)

    def end_headers(self):
        path = self.path.split("?")[0]
        # force revalidation so admin edits show up on plain reload
        if path.endswith((".html", ".css", ".js", ".json", "/")):
            self.send_header("Cache-Control", "no-cache")
        # frames and clips never change without a rename: cache hard
        elif path.startswith("/assets/frames/") or path.startswith("/assets/video/"):
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        super().end_headers()

    def _check_admin(self):
        """Admin auth. Fails closed: no ADMIN_PASSWORD, no admin API."""
        admin_password = os.environ.get("ADMIN_PASSWORD", "")
        if not admin_password:
            self._send_text(503, "Admin API disabled: ADMIN_PASSWORD is not set")
            return False
        if not hmac.compare_digest(self.headers.get("X-Admin-Key", ""), admin_password):
            self._send_text(401, "Unauthorized: invalid admin key")
            return False
        return True

    def do_GET(self):
        if self.path == "/admin":
            self.send_response(301)
            self.send_header("Location", "/admin/")
            self.end_headers()
            return
        if self.path.split("?")[0] == "/api/messages":
            self.handle_list_messages()
            return
        super().do_GET()

    def do_POST(self):
        if self.path == "/api/content":
            self.handle_save_content()
            return
        if self.path == "/api/contact":
            self.handle_contact()
            return
        self.send_error(404, "Not found")

    def _send_json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def _send_text(self, code, text):
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(text.encode("utf-8"))

    def handle_contact(self):
        length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(length)
        try:
            data = json.loads(raw_body)
        except json.JSONDecodeError:
            self._send_text(400, "Invalid JSON")
            return

        # honeypot: silently accept and drop bot submissions
        if isinstance(data, dict) and str(data.get("website", "")).strip():
            self._send_json(200, {"ok": True})
            return

        name = str(data.get("name", "")).strip() if isinstance(data, dict) else ""
        email = str(data.get("email", "")).strip() if isinstance(data, dict) else ""
        message = str(data.get("message", "")).strip() if isinstance(data, dict) else ""

        if not name or not message:
            self._send_text(400, "Name and message are required")
            return
        if "@" not in email or "." not in email or len(message) > 4000:
            self._send_text(400, "A valid email and a message under 4000 characters are required")
            return

        # behind the Cloudflare tunnel every socket has the tunnel container's
        # IP, so the real per-visitor address arrives in CF-Connecting-IP
        client_ip = self.headers.get("CF-Connecting-IP") or self.client_address[0]
        now = time.time()
        with _rate_lock:
            if len(_last_post_by_ip) > 1000:
                cutoff = now - RATE_LIMIT_SECONDS
                for ip, ts in list(_last_post_by_ip.items()):
                    if ts < cutoff:
                        del _last_post_by_ip[ip]
            last = _last_post_by_ip.get(client_ip, 0)
            if now - last < RATE_LIMIT_SECONDS:
                self._send_text(429, "Please wait a moment before sending another note")
                return
            _last_post_by_ip[client_ip] = now

        record = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "ip": client_ip,
            "name": name,
            "email": email,
            "message": message
        }
        MESSAGES_DIR.mkdir(parents=True, exist_ok=True)
        with open(MESSAGES_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

        emailed = send_notification(record)
        self._send_json(200, {"ok": True, "emailed": emailed})

    def handle_list_messages(self):
        if not self._check_admin():
            return
        items = []
        if MESSAGES_PATH.exists():
            with open(MESSAGES_PATH, "r", encoding="utf-8") as f:
                lines = f.readlines()[-100:]
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                try:
                    items.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        self._send_json(200, items)

    def handle_save_content(self):
        if not self._check_admin():
            return

        length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(length)

        try:
            data = json.loads(raw_body)
        except json.JSONDecodeError as e:
            self.send_response(400)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(("Invalid JSON: " + str(e)).encode("utf-8"))
            return

        if not isinstance(data, dict) or not all(key in data for key in REQUIRED_KEYS):
            self.send_response(400)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            missing = ", ".join(REQUIRED_KEYS)
            self.wfile.write(
                ("Invalid content: expected an object with keys: " + missing).encode("utf-8")
            )
            return

        BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
        if CONTENT_PATH.exists():
            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            backup_path = BACKUPS_DIR / ("content-" + timestamp + ".json")
            shutil.copyfile(CONTENT_PATH, backup_path)

        with open(CONTENT_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"ok": True}).encode("utf-8"))


def send_notification(record):
    """Email a contact note if SMTP is configured. Never raises: the note is
    already stored, so an email failure must not fail the request."""
    host = os.environ.get("SMTP_HOST")
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_PASS")
    if not (host and user and password):
        return False
    port = int(os.environ.get("SMTP_PORT", "587"))
    to_addr = os.environ.get("CONTACT_TO", "pyry.kiviluoma@aalto.fi")
    try:
        msg = EmailMessage()
        msg["Subject"] = "Portfolio note from " + record["name"]
        msg["From"] = user
        msg["To"] = to_addr
        msg["Reply-To"] = record["email"]
        msg.set_content(
            "Name: " + record["name"] + "\n"
            "Email: " + record["email"] + "\n\n"
            + record["message"]
        )
        with smtplib.SMTP(host, port, timeout=15) as server:
            server.starttls()
            server.login(user, password)
            server.send_message(msg)
        return True
    except Exception as e:
        print("Email notification failed: " + str(e))
        return False


def main():
    parser = argparse.ArgumentParser(description="Serve the portfolio site.")
    parser.add_argument("--port", type=int, default=8641)
    args = parser.parse_args()

    if not os.environ.get("ADMIN_PASSWORD"):
        print("WARNING: ADMIN_PASSWORD not set; the admin API (/api/content, /api/messages) is disabled.")

    # threaded server: the browser fetches 121 hero frames in parallel
    with http.server.ThreadingHTTPServer(("", args.port), Handler) as httpd:
        print("Serving " + str(PORTFOLIO_ROOT) + " at http://localhost:" + str(args.port))
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
