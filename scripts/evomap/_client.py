import hashlib
import json
import os
import secrets
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import requests

HUB_URL = os.environ.get("EVOMAP_HUB_URL", "https://evomap.ai")
PROTOCOL = "gep-a2a"
PROTOCOL_VERSION = "1.0.0"

REPO_ROOT = Path(__file__).resolve().parents[2]
STATE_DIR = REPO_ROOT / "memory" / "evomap" / "state"
CACHE_DIR = REPO_ROOT / "memory" / "evomap" / "cache"


def _now_iso_utc() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _msg_id() -> str:
    return f"msg_{int(time.time())}_{secrets.token_hex(4)}"


def _sha256_hex(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def canonical_json(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def load_sender_id() -> str:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    p = STATE_DIR / "sender_id.txt"
    if p.exists():
        return p.read_text(encoding="utf-8").strip()

    sender = "node_" + secrets.token_hex(8)
    p.write_text(sender, encoding="utf-8")
    return sender


@dataclass
class A2AClient:
    hub_url: str = HUB_URL

    def post(self, message_type: str, payload: dict) -> dict:
        sender_id = load_sender_id()
        body = {
            "protocol": PROTOCOL,
            "protocol_version": PROTOCOL_VERSION,
            "message_type": message_type,
            "message_id": _msg_id(),
            "sender_id": sender_id,
            "timestamp": _now_iso_utc(),
            "payload": payload,
        }

        url = self.hub_url.rstrip("/") + f"/a2a/{message_type}"
        r = requests.post(url, json=body, timeout=60, headers={"User-Agent": "OpenClaw-EvoMap"})
        r.raise_for_status()
        return r.json() if r.headers.get("content-type", "").startswith("application/json") else {"raw": r.text}


def save_cache(kind: str, data: dict) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().astimezone().strftime("%Y%m%d_%H%M%S")
    raw = canonical_json(data).encode("utf-8")
    h = _sha256_hex(raw)[:12]
    p = CACHE_DIR / f"{ts}_{kind}_{h}.json"
    p.write_bytes(raw)
    return p
