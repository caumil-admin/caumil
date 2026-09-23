#!/usr/bin/env python3
"""드라이브 목록(inputs/drive_listing.json)과 카탈로그(data/papers.json)를 맞춘다.

목록은 세션의 Drive 커넥터로 4개 제출 폴더를 조회해 써 넣는다(docs/WORKFLOW.md 1단계).
카탈로그에는 드라이브 파일 ID 대신 해시(driveKey)만 둔다 — 저장소가 공개라 링크 공유된 원고 ID 를 싣지 않기 위해서다.
  - 새 파일: 'new' 로 임시 항목(id NEW-n) 추가 → 사람이 2글자 ID·저자·과제 매핑을 채운다.
  - 수정된 파일(modifiedTime 또는 fileSize 변화): 'updated'  /  그대로: 'unchanged'  /  목록에서 사라짐: 'removed'
--apply 없이 실행하면 보고만 한다. --text 를 주면 source_text/<ID>.txt 의 해시를 카탈로그 textSha 에 기록한다.
"""
import argparse, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import DATA, TEXT, VENUE_NAME, drive_key, load_json, load_listing, save_json  # noqa: E402
from extract import text_sha  # noqa: E402


def file_meta(f):
    return {"title": f["title"], "createdTime": f.get("createdTime"), "modifiedTime": f.get("modifiedTime"), "fileSize": str(f.get("fileSize"))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="카탈로그를 갱신")
    ap.add_argument("--text", action="store_true", help="source_text/ 해시를 textSha 에 기록")
    a = ap.parse_args()
    listing = load_listing()
    if listing is None:
        sys.exit("inputs/drive_listing.json 이 없습니다 — WORKFLOW 1단계")
    folders = {f["id"]: f for f in listing.get("folders", [])}
    papers = load_json(os.path.join(DATA, "papers.json"))
    by_key = {p["driveKey"]: p for p in papers}
    seen, rows, n_new = set(), [], 0
    for f in listing["files"]:
        k = drive_key(f["id"])
        seen.add(k)
        p = by_key.get(k)
        if p is None:
            n_new += 1
            fo = folders.get(f["parentId"], {})
            p = {
                "id": f"NEW-{n_new}", "driveKey": k, "track": fo.get("track"), "authors": [],
                "projectId": None, "projectMatch": "none", "venue": fo.get("venue"),
                "venueName": VENUE_NAME.get(fo.get("venue"), ""), "folder": fo.get("title"),
                "file": file_meta(f), "status": "new", "textSha": None,
            }
            if fo.get("track") == "team":
                m = re.search(r"(\d+)\s*[조팀]", f["title"])
                p["team"] = f"{m.group(1)}조" if m else None
            papers.append(p)
            by_key[k] = p
            rows.append(("new", p["id"], f["title"]))
            continue
        old = p.get("file", {})
        changed = old.get("modifiedTime") != f.get("modifiedTime") or str(old.get("fileSize")) != str(f.get("fileSize"))
        status = "updated" if changed else "unchanged"
        rows.append((status, p["id"], f["title"]))
        if a.apply:
            p["status"] = status
            p["file"] = file_meta(f)
    for p in papers:
        if p["driveKey"] not in seen:
            rows.append(("removed", p["id"], p.get("file", {}).get("title", "")))
            if a.apply:
                p["status"] = "removed"
    if a.text:
        for p in papers:
            tp = os.path.join(TEXT, f"{p['id']}.txt")
            if os.path.exists(tp):
                sha = text_sha(open(tp, encoding="utf-8").read())
                if sha != p.get("textSha"):
                    rows.append(("text-changed" if p.get("textSha") else "text-new", p["id"], f"{p.get('textSha')} -> {sha}"))
                    if a.apply:
                        p["textSha"] = sha
    for st, pid, title in rows:
        print(f"{st:12} {pid:6} {title[:70]}")
    counts = {}
    for st, _, _ in rows:
        counts[st] = counts.get(st, 0) + 1
    print("summary:", counts, "(applied)" if a.apply else "(dry run — --apply 로 반영)")
    if a.apply:
        save_json(os.path.join(DATA, "papers.json"), papers)
        fp = os.path.join(DATA, "folders.json")
        prev = load_json(fp) if os.path.exists(fp) else {}
        save_json(fp, {
            "excel": prev.get("excel", {"title": ""}),
            "folders": [{"key": drive_key(f["id"]), "title": f["title"], "venue": f["venue"], "track": f["track"]} for f in listing.get("folders", [])],
        })


if __name__ == "__main__":
    main()
