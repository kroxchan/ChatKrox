import argparse

from _client import A2AClient, save_cache


def main() -> int:
    ap = argparse.ArgumentParser(description="EvoMap A2A fetch")
    ap.add_argument("--asset-type", default="Capsule")
    ap.add_argument("--include-tasks", action="store_true")
    args = ap.parse_args()

    c = A2AClient()
    resp = c.post(
        "fetch",
        {
            "asset_type": args.asset_type,
            "include_tasks": bool(args.include_tasks),
        },
    )
    p = save_cache("fetch", resp)
    print(str(p))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
