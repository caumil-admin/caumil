#!/usr/bin/env python3
"""경진대회 엑셀(프로젝트입력 시트)을 표준 라이브러리만으로 읽어 data/projects.json 형식으로 만든다.

사용: python3 pipeline/excel.py [inputs/competition_project_inputs_team_and_personal_filled.xlsx] [-o data/projects.json]
"""
import argparse, json, os, re, sys, zipfile
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
COLS = {"SOTA실험수준": "sota", "프레임워크독창성": "orig", "HW시연유용성": "hwUse",
        "HW알고리즘결합도": "hwFit", "라이브시연안정성": "stability", "발표전달력": "delivery"}


def _shared(z):
    if "xl/sharedStrings.xml" not in z.namelist():
        return []
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    out = []
    for si in root.findall("m:si", NS):
        out.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    return out


def _col(ref):
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n - 1


def read_sheet(path, sheet="xl/worksheets/sheet1.xml"):
    z = zipfile.ZipFile(path)
    ss = _shared(z)
    root = ET.fromstring(z.read(sheet))
    rows = []
    for row in root.find("m:sheetData", NS).findall("m:row", NS):
        cells = {}
        for c in row.findall("m:c", NS):
            v = c.find("m:v", NS)
            t = c.get("t")
            if t == "s" and v is not None:
                val = ss[int(v.text)]
            elif t == "inlineStr":
                val = "".join(x.text or "" for x in c.iter("{%s}t" % NS["m"]))
            elif v is not None:
                val = v.text
            else:
                val = ""
            cells[_col(c.get("r"))] = val
        rows.append(cells)
    return rows


def parse_projects(path):
    rows = read_sheet(path)
    header_i = next(i for i, r in enumerate(rows) if r.get(0) == "프로젝트ID")
    header = rows[header_i]
    idx = {v: k for k, v in header.items()}
    out = []
    for r in rows[header_i + 1 :]:
        pid = (r.get(idx["프로젝트ID"]) or "").strip()
        if not re.fullmatch(r"P\d{3}", pid):
            continue
        memo = r.get(idx["메모"], "") or ""
        track = "team" if pid.startswith("P1") else "personal"
        team = teamName = person = None
        m = re.match(r"\s*(\d+)조\((.+?)\)", memo)
        if track == "team" and m:
            team, teamName = f"{m.group(1)}조", m.group(2)
        m2 = re.match(r"\s*([가-힣]{2,4})\s+개인 프로젝트", memo)
        if track == "personal" and m2:
            person = m2.group(1)
        src = re.search(r"출처:\s*(\S+)", memo)
        scores = {}
        for col, key in COLS.items():
            v = r.get(idx[col], "")
            scores[key] = round(float(v), 4) if v not in ("", None) else None
        out.append({
            "id": pid, "track": track,
            "name": (r.get(idx["프로젝트명"]) or "").strip(),
            "hw": (r.get(idx["HW종류"]) or "").strip(),
            "person": person, "team": team, "teamName": teamName,
            "scores": scores,
            "source": src.group(1).replace("\\_", "_").replace("\\&", "&") if src else None,
            "role": (r.get(idx["역할"]) or "").strip(),
            "result": (r.get(idx["결과"]) or "").strip() or None,
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx", nargs="?", default=os.path.join(ROOT, "inputs", "competition_project_inputs_team_and_personal_filled.xlsx"))
    ap.add_argument("-o", "--out")
    ap.add_argument("--compare", help="기존 projects.json 과 비교")
    a = ap.parse_args()
    projects = parse_projects(a.xlsx)
    if a.compare:
        old = {p["id"]: p for p in json.load(open(a.compare, encoding="utf-8"))}
        diffs = 0
        for p in projects:
            o = old.get(p["id"])
            if not o:
                print("NEW", p["id"]); diffs += 1; continue
            for k in ("track", "name", "hw", "person", "team", "teamName", "scores", "source"):
                if o.get(k) != p.get(k):
                    print("DIFF", p["id"], k, repr(o.get(k))[:60], "->", repr(p.get(k))[:60]); diffs += 1
        for k in old:
            if k not in {p["id"] for p in projects}:
                print("GONE", k); diffs += 1
        print("projects", len(projects), "diffs", diffs)
    if a.out:
        json.dump(projects, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("wrote", a.out)
    elif not a.compare:
        print(json.dumps(projects[:2], ensure_ascii=False, indent=1), "...", len(projects))


if __name__ == "__main__":
    main()
