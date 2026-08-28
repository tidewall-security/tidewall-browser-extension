"""Seed a running server with a policy and a registration token.

Writes the token to /tmp/int-rt.txt, where live-server.test.ts reads it.
Run from the tidewall-server checkout so its dependencies are available.
"""

import json
import subprocess
from datetime import UTC, datetime, timedelta

import os

# Overridable so CI can use its own bootstrap key. Defaults match the local
# instructions in this directory's README.
BASE = os.environ.get("TIDEWALL_SERVER", "http://localhost:8099")
ADMIN = os.environ.get("TIDEWALL_ADMIN_KEY", "ak_demo_bootstrap_key_000000000001")
OUT = os.environ.get("TIDEWALL_RT_FILE", "/tmp/int-rt.txt")


def call(method: str, path: str, body: dict | None = None) -> dict:
    """Call the admin API, and fail LOUDLY on anything that is not a success.

    This used to return `json.loads(...)` straight from curl, so a 401 became
    `KeyError: 'id'` two lines later. That is what it produced in CI when the
    seed step was given the wrong admin key: an error naming a field, for a
    problem that was authentication.
    """
    cmd = ["curl", "-s", "-w", "\n%{http_code}", "-X", method, BASE + path,
           "-H", f"Authorization: Bearer {ADMIN}", "-H", "Content-Type: application/json"]
    if body is not None:
        cmd += ["-d", json.dumps(body)]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise SystemExit(f"curl failed for {method} {path}: {proc.stderr.strip()}")

    raw, _, status = proc.stdout.rpartition("\n")
    if not status.isdigit():
        raise SystemExit(f"{method} {path}: no status from curl; is the server running at {BASE}?")
    if not 200 <= int(status) < 300:
        raise SystemExit(
            f"{method} {path} -> HTTP {status}\n"
            f"  body: {raw.strip()[:200]}\n"
            f"  using admin key {ADMIN[:12]}... — set TIDEWALL_ADMIN_KEY if the server "
            f"was bootstrapped with a different one."
        )
    return json.loads(raw)


policy = call("POST", "/v1/policies", {"name": "integration", "type": "application"})
token = call("POST", "/v1/registration-tokens", {
    "name": "integration",
    "policy_id": policy["id"],
    "expires_at": (datetime.now(UTC) + timedelta(days=30)).isoformat(),
})
with open(OUT, "w") as fh:
    fh.write(token["token"])
print(f"registration token written to {OUT} ({token['token'][:12]}...)")
