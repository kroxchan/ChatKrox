import argparse

from _client import A2AClient, save_cache


def main() -> int:
    ap = argparse.ArgumentParser(description="EvoMap A2A hello")
    ap.add_argument("--platform", default="windows")
    ap.add_argument("--arch", default="x64")
    args = ap.parse_args()

    c = A2AClient()
    resp = c.post(
        "hello",
        {
            "capabilities": {},
            "gene_count": 0,
            "capsule_count": 0,
            "env_fingerprint": {"platform": args.platform, "arch": args.arch},
        },
    )
    p = save_cache("hello", resp)
    print(str(p))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
