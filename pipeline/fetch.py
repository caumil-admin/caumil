#!/usr/bin/env python3
"""inputs/drive_listing.json 의 파일을 raw/<driveId>.<ext> 로 내려받는다.

제출 폴더 파일은 '링크가 있는 사용자' 공유라 공개 내보내기 URL로 받을 수 있다.
크기가 목록과 같은 파일은 건너뛴다(--force 로 다시 받음).
사용: python3 pipeline/fetch.py [--force] [driveId ...]
"""
import argparse, os, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import INPUTS, RAW, load_json  # noqa: E402

MAGIC = (b"PK\x03\x04", b"\xd0\xcf\x11\xe0")


def fetch(f, force=False):
    os.makedirs(RAW, exist_ok=True)
    out = os.path.join(RAW, f"{f['id']}.{f['ext']}")
    want = int(f.get("fileSize") or 0)
    if not force and os.path.exists(out) and os.path.getsize(out) == want:
        return out, "cached"
    url = f"https://drive.google.com/uc?export=download&id={f['id']}"
    r = subprocess.run(["curl", "-sL", "-m", "300", "-o", out, url], capture_output=True)
    if r.returncode != 0 or not os.path.exists(out):
        return out, f"curl 실패({r.returncode})"
    head = open(out, "rb").read(4)
    if not any(head.startswith(m) for m in MAGIC):
        return out, "파일이 아님(로그인/확인 페이지?) — 공유 설정 확인"
    if want and os.path.getsize(out) != want:
        return out, f"크기 불일치 {os.path.getsize(out)} != {want}"
    return out, "ok"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    listing = load_json(os.path.join(INPUTS, "drive_listing.json"))
    files = [f for f in listing["files"] if not a.ids or f["id"] in a.ids]
    bad = 0
    for f in files:
        out, st = fetch(f, a.force)
        if st not in ("ok", "cached"):
            bad += 1
        print(f"{st:8} {os.path.basename(out):45} {f['title'][:50]}")
    print(f"{len(files) - bad}/{len(files)} ok")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
