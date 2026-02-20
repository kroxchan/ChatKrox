import argparse
import datetime as dt
import os
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_VENV_PY = REPO_ROOT / "third_party" / "OpenClaw-DeepReeder" / ".venv" / "Scripts" / "python.exe"
DEFAULT_OUT_DIR = REPO_ROOT / "memory" / "inbox"


def _slugify(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "inbox"


def _write_stub_md(url: str, out_dir: Path, reason: str) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    now = dt.datetime.now().astimezone().isoformat(timespec="seconds")
    fname = f"{dt.date.today().isoformat()}_{_slugify(url)[:40]}.md"
    path = out_dir / fname
    text = "\n".join(
        [
            "---",
            f'title: "Ingest failed"',
            f'source: "{url}"',
            f"ingested_at: {now}",
            "type: external_resource",
            "tags: [ingest_failed]",
            "---",
            "",
            "# Ingest failed",
            "",
            reason.strip(),
            "",
        ]
    )
    path.write_text(text, encoding="utf-8")
    return path


def _fallback_ingest(url: str, out_dir: Path) -> str | None:
    """Fallback chain: web_fetch-like (requests+trafilatura) -> r.jina.ai.

    Returns saved path on success, otherwise None.
    """
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1) Lightweight local fetch + trafilatura (similar spirit to web_fetch)
    try:
        import requests
        import trafilatura

        r = requests.get(url, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
        extracted = trafilatura.extract(r.text) or ""
        if extracted.strip():
            now = dt.datetime.now().astimezone().isoformat(timespec="seconds")
            path = out_dir / f"{dt.date.today().isoformat()}_{_slugify(url)[:40]}.md"
            md = "\n".join(
                [
                    "---",
                    f'title: "Ingest (fallback)"',
                    f'source: "{url}"',
                    f"ingested_at: {now}",
                    "type: external_resource",
                    "tags: [fallback, trafilatura]",
                    "---",
                    "",
                    extracted,
                    "",
                ]
            )
            path.write_text(md, encoding="utf-8")
            return str(path)
    except Exception:
        pass

    # 2) r.jina.ai
    try:
        import requests

        jina_url = "https://r.jina.ai/http://" + url[len("https://") :] if url.startswith("https://") else "https://r.jina.ai/http://" + url[len("http://") :] if url.startswith("http://") else "https://r.jina.ai/http://" + url
        r = requests.get(jina_url, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
        text = r.text
        if text.strip():
            now = dt.datetime.now().astimezone().isoformat(timespec="seconds")
            path = out_dir / f"{dt.date.today().isoformat()}_{_slugify(url)[:40]}_jina.md"
            md = "\n".join(
                [
                    "---",
                    f'title: "Ingest (fallback)"',
                    f'source: "{url}"',
                    f"ingested_at: {now}",
                    "type: external_resource",
                    "tags: [fallback, jina]",
                    "---",
                    "",
                    text,
                    "",
                ]
            )
            path.write_text(md, encoding="utf-8")
            return str(path)
    except Exception:
        pass

    return None


def main() -> int:
    ap = argparse.ArgumentParser(description="DeepReader-first URL ingest -> memory/inbox")
    ap.add_argument("url")
    ap.add_argument("--python", default=str(DEFAULT_VENV_PY), help="DeepReader venv python.exe")
    ap.add_argument("--out", default=str(DEFAULT_OUT_DIR), help="Output directory")
    args = ap.parse_args()

    url = args.url
    out_dir = Path(args.out)
    py = Path(args.python)

    if not py.exists():
        stub = _write_stub_md(url, out_dir, f"DeepReader python not found: {py}")
        print(str(stub))
        return 2

    env = os.environ.copy()
    env.setdefault("PYTHONUTF8", "1")
    env.setdefault("PYTHONIOENCODING", "utf-8")

    code = """
import sys
from deepreader_skill.core.router import ParserRouter
from deepreader_skill.core.storage import StorageManager

url = sys.argv[1]
out_dir = sys.argv[2]

router = ParserRouter()
storage = StorageManager(memory_dir=out_dir)

res = router.route(url)
if not res.success:
    raise SystemExit(res.error)

saved = storage.save(res)
print(saved)
""".strip()

    # Fallback chain (DeepReader-first SOP): web_fetch -> r.jina.ai
    # We keep fallbacks in the parent process so DeepReader remains untouched.

    try:
        # Avoid Windows console encoding issues by capturing bytes and decoding safely.
        p = subprocess.run(
            [str(py), "-c", code, url, str(out_dir)],
            check=True,
            capture_output=True,
            text=False,
            env=env,
        )
        stdout = (p.stdout or b"").decode("utf-8", errors="replace")
        saved = stdout.strip().splitlines()[-1].strip()
        if saved:
            try:
                subprocess.run(
                    [sys.executable, str(REPO_ROOT / "scripts" / "memory" / "inbox_index.py"), saved],
                    check=False,
                    capture_output=True,
                )
            except Exception:
                pass
            print(saved)
            return 0

        stub = _write_stub_md(url, out_dir, "DeepReader returned empty output path")
        print(str(stub))
        return 3

    except subprocess.CalledProcessError as e:
        stderr = (e.stderr or b"").decode("utf-8", errors="replace").strip() if isinstance(e.stderr, (bytes, bytearray)) else str(e.stderr or "").strip()
        stdout = (e.stdout or b"").decode("utf-8", errors="replace").strip() if isinstance(e.stdout, (bytes, bytearray)) else str(e.stdout or "").strip()

        # Try fallbacks.
        fallback_reason = "DeepReader failed.\n\nSTDOUT:\n" + stdout + "\n\nSTDERR:\n" + stderr
        saved = _fallback_ingest(url, out_dir)
        if saved:
            try:
                subprocess.run(
                    [sys.executable, str(REPO_ROOT / "scripts" / "memory" / "inbox_index.py"), saved],
                    check=False,
                    capture_output=True,
                )
            except Exception:
                pass
            print(saved)
            return 0

        stub = _write_stub_md(url, out_dir, fallback_reason)
        print(str(stub))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
