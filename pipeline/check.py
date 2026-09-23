#!/usr/bin/env python3
"""빌드 전 정합성 점검. 오류가 있으면 종료 코드 1.

- 드라이브 목록 ↔ 카탈로그(data/papers.json) 대응, NEW- 임시 ID 여부
- 평가(eval/<ID>.json) 존재, 6개 점수 0~1·0.05 격자, 리스크 level, projectMatch, projectId 존재
- 평가 당시 텍스트 해시(eval.textSha) == 현재 텍스트 해시(카탈로그 textSha)  → 다르면 재평가 필요
- results.json·lint.json 이 평가된 원고 전부를 담고 있고 평가보다 최신인지
"""
import os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import DATA, EVAL, INPUTS, drive_key, load_json, load_papers  # noqa: E402

VALID_MATCH = {"same", "related", "different", "none"}


def main():
    errors, warns = [], []
    keys = [c["key"] for c in load_json(os.path.join(DATA, "criteria.json"))]
    papers = load_papers()
    projects = {p["id"] for p in load_json(os.path.join(DATA, "projects.json"))}
    ids = [p["id"] for p in papers]
    if len(ids) != len(set(ids)):
        errors.append("중복 ID: " + ", ".join(sorted({i for i in ids if ids.count(i) > 1})))
    lp = os.path.join(INPUTS, "drive_listing.json")
    if os.path.exists(lp):
        listing = load_json(lp)
        listed = {drive_key(f["id"]): f["title"] for f in listing["files"]}
        cat = {p["driveKey"] for p in papers}
        for d in set(listed) - cat:
            errors.append(f"목록에만 있는 파일(sync --apply 필요): {listed[d]}")
        for p in papers:
            if p["driveKey"] not in listed and p.get("status") != "removed":
                warns.append(f"{p['id']}: 드라이브 목록에 없음(status={p.get('status')})")
    else:
        warns.append("inputs/drive_listing.json 없음 — 목록 대조 생략")
    for p in papers:
        pid = p["id"]
        if pid.startswith("NEW-"):
            errors.append(f"{pid}: 임시 ID — 2글자 ID·저자·과제 매핑을 채우고 eval/ 을 작성해야 함")
        if not p.get("evaluated"):
            errors.append(f"{pid}: eval/{pid}.json 없음(미평가)")
            continue
        sc = p.get("scores") or {}
        for k in keys:
            v = sc.get(k)
            if v is None or not (0 <= v <= 1):
                errors.append(f"{pid}: 점수 {k}={v} 범위 밖")
            elif abs(v * 20 - round(v * 20)) > 1e-6:
                warns.append(f"{pid}: 점수 {k}={v} 가 0.05 격자가 아님")
            if not (p.get("rationale") or {}).get(k):
                errors.append(f"{pid}: {k} 근거(rationale) 없음")
        for f in p.get("flags") or []:
            if f.get("level") not in ("high", "mid"):
                errors.append(f"{pid}: flag level '{f.get('level')}' (high|mid)")
        if p.get("projectMatch") not in VALID_MATCH:
            errors.append(f"{pid}: projectMatch '{p.get('projectMatch')}'")
        if p.get("projectId") and p["projectId"] not in projects:
            errors.append(f"{pid}: projectId {p['projectId']} 가 projects.json 에 없음")
        if p.get("evalTextSha") != p.get("textSha"):
            errors.append(f"{pid}: 텍스트가 평가 이후 바뀜(eval {p.get('evalTextSha')} ≠ 현재 {p.get('textSha')}) — 재평가 또는 eval.textSha 갱신")
        if not p.get("authors"):
            errors.append(f"{pid}: authors 비어 있음")
    evaluated = {p["id"] for p in papers if p.get("evaluated")}
    rp = os.path.join(DATA, "results.json")
    if os.path.exists(rp):
        res = load_json(rp)
        missing = evaluated - set(res["papers"])
        if missing:
            errors.append("results.json 에 없는 원고(make score): " + ", ".join(sorted(missing)))
        latest_eval = max((p.get("evaluatedAt") or "") for p in papers if p.get("evaluated"))
        if res.get("generatedAt", "")[:10] < latest_eval[:10]:
            errors.append(f"results.json({res.get('generatedAt')[:10]}) 이 최신 평가({latest_eval}) 보다 오래됨 — make score")
    else:
        errors.append("data/results.json 없음 — make score")
    lint_p = os.path.join(DATA, "lint.json")
    if os.path.exists(lint_p):
        missing = evaluated - set(load_json(lint_p))
        if missing:
            warns.append("lint.json 에 없는 원고(make lint): " + ", ".join(sorted(missing)))
    for w in warns:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    print(f"check: {len(papers)} papers, {len(evaluated)} evaluated, {len(errors)} errors, {len(warns)} warnings")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
