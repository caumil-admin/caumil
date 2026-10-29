#!/usr/bin/env python3
"""발표자료(슬라이드·대본) 트랙 — v5 심사 기준 4항목을 원고가 아니라 **발표자료**에 적용해 순위를 매긴다(2026-10-23~).

원고 트랙(fetch→extract→sync→eval→score→check→build)과 같은 흐름을 한 스크립트에 모았다. 원고 파이프라인은 건드리지 않는다.
  inputs/deck_listing.json   발표자료 드라이브 폴더 목록(파일·폴더 ID, 소유자 메일 포함 — gitignore)
  raw/decks/<driveId>.<ext>  원본, raw/decks/pdf/<driveId>.pdf 는 PowerPoint 로 변환한 슬라이드 PDF(평가자가 화면으로 봄)
  source_text/decks/<ID>.txt 슬라이드 텍스트([슬라이드 n] + [노트]) 또는 대본 텍스트
  data/decks.json            발표자료 카탈로그(ID = 주 원고 ID, papers = 다루는 원고들, driveKey 해시만)
  eval_deck/<ID>.json        평가 원자료(rubric 은 원고와 같은 스키마; presentation.qa 는 발표 전 자리값 0.5)
  data/deck_results.json     순위·원고 점수 대비 변화
  dist/decks.html            보고서(내부용 — 로컬에서만 본다. 배포·푸시 금지)

사용: python pipeline/decks.py fetch | render | extract | sync [--apply] | score | check | report
"""
import argparse, datetime, json, os, posixpath, re, subprocess, sys, zipfile
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import DATA, DIST, INPUTS, RAW, ROOT, TEXT, drive_key, load_json, load_papers, save_json  # noqa: E402
import extract as _ex  # noqa: E402
import fetch as _fetch  # noqa: E402
from rubric_score import Rubric, skey  # noqa: E402  # v5 4항목 계산(원고 순위 v6 는 score.py)

DECK_RAW = os.path.join(RAW, "decks")
DECK_PDF = os.path.join(DECK_RAW, "pdf")
DECK_TEXT = os.path.join(TEXT, "decks")
DECK_EVAL = os.path.join(ROOT, "eval_deck")
CATALOG = os.path.join(DATA, "decks.json")
RESULTS = os.path.join(DATA, "deck_results.json")
LISTING = os.path.join(INPUTS, "deck_listing.json")
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
DECK_KINDS = ("deck",)  # 채점 대상. deck-pdf 는 같은 자료의 PDF 판, video·paper·other 는 제외

A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def load_listing():
    return load_json(LISTING) if os.path.exists(LISTING) else None


def deck_files(listing):
    return [f for f in listing["files"] if f.get("kind") in DECK_KINDS]


def raw_path(f):
    return os.path.join(DECK_RAW, f"{f['id']}.{f['ext']}")


# ---------- fetch ----------
def cmd_fetch(a):
    listing = load_listing()
    if not listing:
        sys.exit("inputs/deck_listing.json 없음")
    _fetch.RAW = DECK_RAW
    bad = 0
    for f in deck_files(listing):
        out, st = _fetch.fetch(f, a.force)
        bad += st not in ("ok", "cached")
        print(f"{st:8} {os.path.basename(out):45} {f['title'][:50]}")
    sys.exit(1 if bad else 0)


# ---------- render (pptx → pdf, PowerPoint COM) ----------
PS_RENDER = r'''
$app = New-Object -ComObject PowerPoint.Application
try {
  foreach ($pair in $args) {
    $src, $dst = $pair -split '\|'
    $mode = "open"
    try { $pres = $app.Presentations.Open($src, $true, $false, $false) }
    catch { $pres = $app.Presentations.Open2007($src, -1, 0, 0, -1); $mode = "REPAIRED" }  # 일반 열기 실패 → '열고 복구'
    $n = $pres.Slides.Count
    $pres.SaveAs($dst, 32)
    $pres.Close()
    Write-Output "$n|$mode|$dst"
  }
} finally { $app.Quit() }
'''


def cmd_render(a):
    listing = load_listing()
    os.makedirs(DECK_PDF, exist_ok=True)
    jobs = []
    for f in deck_files(listing):
        src = raw_path(f)
        dst = os.path.join(DECK_PDF, f"{f['id']}.pdf")
        if f["ext"] in ("pptx", "ppt"):
            if a.force or not os.path.exists(dst):
                jobs.append(f"{os.path.abspath(src)}|{os.path.abspath(dst)}")
            else:
                print(f"cached   {f['title'][:50]}")
        elif f["ext"] == "pdf":
            if a.force or not os.path.exists(dst):
                import shutil
                shutil.copy(src, dst)
            print(f"pdf      {f['title'][:50]}")
        elif f["ext"] == "html":
            # 자체 완결형 HTML 슬라이드(@media print 로 슬라이드를 쪽마다 펼치는 덱). 원본은 따로 떼어 둔 폴더에서 헤드리스 Chrome 으로 인쇄.
            if a.force or not os.path.exists(dst):
                import shutil
                work = os.path.join(DECK_RAW, "html_render", f["id"])
                os.makedirs(work, exist_ok=True)
                shutil.copy(src, os.path.join(work, "deck.html"))
                url = "file:///" + os.path.abspath(os.path.join(work, "deck.html")).replace("\\", "/")
                r = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=8000",
                                    "--print-to-pdf=" + os.path.abspath(dst), url], capture_output=True, text=True)
                print(f"html     {f['title'][:50]} -> {pdf_pages(dst) if os.path.exists(dst) else '실패'}쪽")
            else:
                print(f"cached   {f['title'][:50]}")
        else:
            print(f"skip     {f['title'][:50]} ({f['ext']}: 슬라이드가 아님 — 텍스트만)")
    if jobs:
        ps = os.path.join(DECK_PDF, "_render.ps1")
        open(ps, "w", encoding="utf-8-sig").write(PS_RENDER)
        r = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps] + jobs, capture_output=True, text=True)
        print(r.stdout.strip())
        if r.returncode != 0 or r.stderr.strip():
            print(r.stderr.strip()[:2000]); sys.exit(1)


# ---------- extract ----------
def pptx_text(path):
    """슬라이드 순서대로 [슬라이드 n] 본문 문단 + [노트] 발표자 노트. 그림·도형 배치는 텍스트에 없다(PDF 로 본다)."""
    z = zipfile.ZipFile(path)
    pres = ET.fromstring(z.read("ppt/presentation.xml"))
    rels = ET.fromstring(z.read("ppt/_rels/presentation.xml.rels"))
    rmap = {r.get("Id"): r.get("Target") for r in rels}
    # 관계 대상은 상대경로(slides/slide1.xml)일 수도, 패키지 절대경로(/ppt/slides/slide1.xml)일 수도 있다
    order = [rmap[s.get(R + "id")].lstrip("/").removeprefix("ppt/") for s in pres.find(P + "sldIdLst")]
    out = []

    def paras(root):
        res = []
        for p in root.iter(A + "p"):
            t = "".join(x.text or "" for x in p.iter() if x.tag == A + "t").strip()
            if t:
                res.append(t)
        return res

    for i, n in enumerate(order, 1):
        out.append(f"[슬라이드 {i}]\n" + "\n".join(paras(ET.fromstring(z.read("ppt/" + n)))))
        relp = "ppt/slides/_rels/" + posixpath.basename(n) + ".rels"
        if relp in z.namelist():
            for r in ET.fromstring(z.read(relp)):
                if r.get("Type", "").endswith("/notesSlide"):
                    t = r.get("Target")
                    tgt = t.lstrip("/") if t.startswith("/") else posixpath.normpath(posixpath.join("ppt/slides", t))
                    if tgt not in z.namelist():  # 깨진 참조(없는 노트 파일) — PowerPoint 는 '손상됨'으로 보고 복구 모드에서만 연다
                        out.append(f"[노트 참조 깨짐: {tgt}]"); continue
                    nps = [t for t in paras(ET.fromstring(z.read(tgt))) if not re.fullmatch(r"\d+", t)]
                    if nps:
                        out.append("[노트]\n" + "\n".join(nps))
    return len(order), "\n\n".join(out)


def html_text(path):
    """HTML 슬라이드 덱: <section class="slide …" data-notes="…"> 마다 [슬라이드 n] 본문 + [노트]. 스크립트·스타일은 버린다."""
    import html as _html
    from html.parser import HTMLParser

    class P(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.slides, self.cur, self.depth, self.skip = [], None, 0, 0

        def handle_starttag(self, tag, attrs):
            d = dict(attrs)
            if tag in ("script", "style"):
                self.skip += 1
            if tag == "section" and "slide" in (d.get("class") or "").split():
                self.cur = {"notes": d.get("data-notes") or "", "text": []}; self.depth = 1; return
            if self.cur is not None and tag == "section":
                self.depth += 1
            if self.cur is not None and tag in ("p", "div", "br", "tr", "li", "h1", "h2", "h3", "td", "th"):
                self.cur["text"].append("\n")

        def handle_endtag(self, tag):
            if tag in ("script", "style"):
                self.skip = max(0, self.skip - 1)
            if self.cur is not None and tag == "section":
                self.depth -= 1
                if self.depth == 0:
                    self.slides.append(self.cur); self.cur = None

        def handle_data(self, data):
            if self.cur is not None and not self.skip:
                self.cur["text"].append(data)

    p = P(); p.feed(open(path, encoding="utf-8", errors="replace").read())
    out = []
    for i, s in enumerate(p.slides, 1):
        lines = [re.sub(r"\s+", " ", x).strip() for x in "".join(s["text"]).split("\n")]
        out.append(f"[슬라이드 {i}]\n" + "\n".join(x for x in lines if x))
        if s["notes"].strip():
            out.append("[노트]\n" + _html.unescape(s["notes"]).strip())
    return len(p.slides), "\n\n".join(out)


def pdf_pages(path):
    try:
        r = subprocess.run(["pdfinfo", path], capture_output=True, text=True)
        m = re.search(r"Pages:\s+(\d+)", r.stdout)
        return int(m.group(1)) if m else None
    except OSError:
        return None


def cmd_extract(a):
    listing = load_listing()
    cat = load_json(CATALOG) if os.path.exists(CATALOG) else []
    by_key = {d["driveKey"]: d for d in cat}
    os.makedirs(DECK_TEXT, exist_ok=True)
    for f in deck_files(listing):
        d = by_key.get(drive_key(f["id"]))
        did = d["id"] if d else drive_key(f["id"])
        out = os.path.join(DECK_TEXT, f"{did}.txt")
        src = raw_path(f)
        n = None
        if d and d.get("manualText") and os.path.exists(out) and not a.force:
            # 슬라이드가 그림뿐이라 다른 출처(같은 자료의 PDF 판 커넥터 텍스트 등)를 손으로 넣은 경우 — 덮어쓰지 않는다
            print(f"KEEP     {did} (manualText: {d['manualText']})"); continue
        if f["ext"] == "pptx":
            n, txt = pptx_text(src)
        elif f["ext"] in ("hwpx", "hwp", "docx"):
            txt = _ex.extract(src)
        elif f["ext"] == "html":
            n, txt = html_text(src)
        elif f["ext"] == "pdf":
            n = pdf_pages(src)
            if os.path.exists(out) and not a.force:
                print(f"KEEP     {did} (PDF: 커넥터 텍스트 유지, {n}쪽)"); continue
            r = subprocess.run(["pdftotext", "-layout", src, "-"], capture_output=True)
            txt = r.stdout.decode("utf-8", "replace")
            if sum(1 for ch in txt if "가" <= ch <= "힣") < 50:
                print(f"WARN     {did}: PDF 에서 한글이 안 뽑힘 — Drive 커넥터 read_file_content 텍스트를 {out} 에 직접 넣으세요")
        else:
            print(f"skip     {did} ({f['ext']})"); continue
        txt = _ex.normalize(txt)
        open(out, "w", encoding="utf-8").write(txt)
        print(f"{did:6} {len(txt):7} chars {('%d장' % n) if n else '':5} {_ex.text_sha(txt)} {f['title'][:45]}")


# ---------- sync (listing ↔ data/decks.json) ----------
def cmd_sync(a):
    listing = load_listing()
    cat = load_json(CATALOG) if os.path.exists(CATALOG) else []
    by_key = {d["driveKey"]: d for d in cat}
    seen = set()
    n_new = 0
    for f in deck_files(listing):
        k = drive_key(f["id"]); seen.add(k)
        meta = {"title": f["title"], "ext": f["ext"], "fileSize": f.get("fileSize"), "createdTime": f.get("createdTime"), "modifiedTime": f.get("modifiedTime")}
        d = by_key.get(k)
        if not d:
            n_new += 1
            d = {"id": f"NEW-{n_new}", "driveKey": k, "track": None, "team": None, "presenter": None, "papers": [], "kind": "slides" if f["ext"] in ("pptx", "ppt", "pdf", "html") else "script", "file": meta, "status": "new"}
            cat.append(d); by_key[k] = d
            print("NEW     ", f["title"])
        else:
            if d["file"] != meta:
                d["status"] = "updated" if d.get("status") != "new" else "new"; print("UPDATED ", d["id"], f["title"])
            d["file"] = meta
        tp = os.path.join(DECK_TEXT, f"{d['id']}.txt")
        if os.path.exists(tp):
            sha = _ex.text_sha(open(tp, encoding="utf-8").read())
            if d.get("textSha") and d["textSha"] != sha and d.get("status") == "unchanged":
                d["status"] = "updated"; print("TEXT    ", d["id"], d["textSha"], "->", sha)
            d["textSha"] = sha
        src = raw_path(f)
        if f["ext"] == "pptx" and os.path.exists(src):
            d["slides"] = pptx_text(src)[0]
        elif f["ext"] == "html" and os.path.exists(src):
            d["slides"] = html_text(src)[0]
        elif f["ext"] == "pdf" and os.path.exists(src):
            d["slides"] = pdf_pages(src)
    for d in cat:
        if d.get("imputed"):
            continue  # 미제출 추정치 — 드라이브 파일 없음
        if d["driveKey"] not in seen and d.get("status") != "removed":
            d["status"] = "removed"; print("REMOVED ", d["id"])
    if a.apply:
        save_json(CATALOG, cat); print("wrote", CATALOG, len(cat))
    else:
        print(f"{len(cat)} decks ({n_new} new) — --apply 로 반영")


# ---------- score ----------
def load_decks(with_eval=True, counted_only=True):
    """카탈로그의 발표자료. 선정 규칙(사용자 2026-10-24): 팀은 조당 1건, 개인은 전자공학회 논문 기준으로 이름 폴더의 파일 1건만 센다 —
    세지 않는 자료는 `counted: false` 로 두고(평가는 남김) 순위·보고서에서 뺀다."""
    decks = [d for d in load_json(CATALOG) if d.get("status") != "removed"]
    if counted_only:
        decks = [d for d in decks if d.get("counted", True)]
    if not with_eval:
        return decks
    for d in decks:
        ep = os.path.join(DECK_EVAL, f"{d['id']}.json")
        d["evaluated"] = os.path.exists(ep)
        if d["evaluated"]:
            e = load_json(ep)
            for k, v in e.items():
                if k == "id" or (k == "externalPaper" and isinstance(d.get(k), dict)):
                    continue  # 카탈로그의 externalPaper(제목·학회·메모)를 평가 파일의 한 줄 표기가 덮지 않게
                d["evalTextSha" if k == "textSha" else k] = v
    return decks


def cmd_score(a):
    rdef = load_json(os.path.join(DATA, "rubric.json"))
    rb = Rubric(rdef)
    alld = load_decks()
    decks = [d for d in alld if d.get("rubric")]
    imputed = [d for d in alld if d.get("imputed")]
    papers = {p["id"]: p for p in load_papers() if p.get("rubric")}
    # v6 부터 data/results.json 은 6개 변수 순위라, 원고의 v5 심사 점수·순위는 여기서 rubric 으로 다시 계산한다(몬테카를로는 쓰지 않으므로 runs=1)
    from rubric_score import compute as rubric_compute
    paper_res = rubric_compute(load_papers(), rdef, runs=1)
    items = [dict(d, x=rb.crit(d["rubric"])) for d in decks]
    w0 = rb.presets[rb.default]["weights"]

    def ext_paper(d):
        """카탈로그 밖 원고(externalPaper.eval 의 v5 원고 평가) → (crit, score, 가상 순위, n). 원고 순위에는 넣지 않는다."""
        ep = d.get("externalPaper")
        if not isinstance(ep, dict) or not ep.get("eval") or not os.path.exists(os.path.join(ROOT, ep["eval"])):
            return None
        px = rb.crit(load_json(os.path.join(ROOT, ep["eval"]))["rubric"])
        sc = rb.score(px, w0)
        others = [paper_res["papers"][pid][rb.default] for pid in paper_res["ranks"][rb.default][d["track"]]]
        rank = 1 + sum(1 for v in others if skey(v) > skey(sc))
        return px, sc, rank, len(others) + 1

    # 미제출 추정치: 그 사람 원고의 항목 점수 + 실제 개인 발표자료들의 평균 변화(발표자료 − 원고)
    base = [it for it in items if it["track"] == "personal" and it["papers"] and papers.get(it["papers"][0])]
    mean_delta = ({k: sum(it["x"][k] - rb.crit(papers[it["papers"][0]]["rubric"])[k] for it in base) / len(base) for k in rb.keys}
                  if base else {k: 0.0 for k in rb.keys})
    pers = [it for it in items if it["track"] == "personal"]
    plain_mean = {k: sum(it["x"][k] for it in pers) / len(pers) for k in rb.keys} if pers else None
    for d in imputed:
        pp = papers.get(d["papers"][0]) if d.get("papers") else None
        if not pp:
            continue
        px = rb.crit(pp["rubric"])
        x = {k: min(1.0, max(0.0, px[k] + mean_delta[k])) for k in rb.keys}
        items.append(dict(d, x=x, imputedCalc={
            "method": "원고 항목 점수 + 개인 발표자료 평균 변화", "n": len(base),
            "meanDelta": {k: round(v, 6) for k, v in mean_delta.items()},
            "plainMeanScore": round(rb.score(plain_mean, w0), 4) if plain_mean else None}))
    res = {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat(),
        "method": "rubric-deck", "default": rb.default, "decks": {}, "ranks": {},
    }
    for it in items:
        d = res["decks"][it["id"]] = {"crit": {k: round(v, 6) for k, v in it["x"].items()}, "papers": it["papers"]}
        for name, pr in rb.presets.items():
            d[name] = round(rb.score(it["x"], pr["weights"]), 4)
        # 원고 점수와 비교(주 원고 = 첫 번째)
        pid = it["papers"][0] if it["papers"] else None
        pp = papers.get(pid)
        if pp:
            px = rb.crit(pp["rubric"])
            d["paper"] = {"id": pid, "crit": {k: round(v, 6) for k, v in px.items()},
                          "score": round(rb.score(px, rb.presets[rb.default]["weights"]), 4),
                          "rank": paper_res["ranks"][rb.default][pp["track"]].get(pid),
                          "n": len(paper_res["ranks"][rb.default][pp["track"]])}
            d["delta"] = round(d[rb.default] - d["paper"]["score"], 4)
            d["critDelta"] = {k: round(it["x"][k] - px[k], 6) for k in rb.keys}
        if not pp:
            ex = ext_paper(it)
            if ex:
                px, sc, rank, n = ex
                d["paper"] = {"id": "외부", "external": True, "crit": {k: round(v, 6) for k, v in px.items()},
                              "score": round(sc, 4), "rank": rank, "n": n}
                d["delta"] = round(d[rb.default] - sc, 4)
                d["critDelta"] = {k: round(it["x"][k] - px[k], 6) for k in rb.keys}
        if it.get("imputedCalc"):
            d["imputed"] = it["imputedCalc"]
            d["clarity"] = None
        else:
            d["clarity"] = it["rubric"]["presentation"]["sub"].get("clarity")
    for name, pr in rb.presets.items():
        w = pr["weights"]
        res["ranks"][name] = {
            "personal": {it["id"]: r for r, it, _ in rb.rank([i for i in items if i["track"] == "personal"], w)},
            "team": {it["id"]: r for r, it, _ in rb.rank([i for i in items if i["track"] == "team"], w)},
            "all": {it["id"]: r for r, it, _ in rb.rank(items, w)},
        }
    for did, dd in res["decks"].items():
        if dd.get("imputed") and dd["imputed"].get("plainMeanScore") is not None:
            pm = dd["imputed"]["plainMeanScore"]
            real = [v[rb.default] for k, v in res["decks"].items() if k != did and k in res["ranks"][rb.default]["personal"]]
            dd["imputed"]["plainMeanRank"] = 1 + sum(1 for v in real if skey(v) > skey(pm))
    save_json(RESULTS, res); print("wrote", RESULTS, len(items), "decks")
    for cat in ("team", "personal"):
        print(cat, " > ".join(f"{did}({res['decks'][did][rb.default]:.1f})" for did, r in sorted(res["ranks"][rb.default][cat].items(), key=lambda kv: kv[1])))


# ---------- check ----------
def cmd_check(a):
    errors, warns = [], []
    rdef = load_json(os.path.join(DATA, "rubric.json"))
    crit_def = {c["key"]: [x["key"] for x in c["sub"]] for c in rdef["criteria"]}
    w = rdef["presets"][rdef["default"]]["weights"]
    papers = {p["id"]: p for p in load_papers(with_eval=False)}
    decks = load_decks()
    ids = [d["id"] for d in load_decks(with_eval=False, counted_only=False)]
    if len(ids) != len(set(ids)):
        errors.append("중복 deck ID")
    seen_unit = {}
    for d in decks:  # 선정 규칙: 조당 1건, 사람당 1건
        unit = ("team", d.get("team")) if d.get("track") == "team" else ("personal", d.get("presenter"))
        if unit in seen_unit:
            errors.append(f"{d['id']}: {unit[1]} 의 자료가 {seen_unit[unit]} 와 중복으로 세어짐 — 하나만 counted: true 로")
        seen_unit[unit] = d["id"]
        if (d.get("track") == "personal" and d.get("papers") and papers.get(d["papers"][0], {}).get("venue") != "ee"
                and not d.get("venueException")):
            warns.append(f"{d['id']}: 개인 자료의 기준 원고 {d['papers'][0]} 가 전자공학회 논문이 아님(개인 순위는 전자공학회 논문 기준 — 예외면 venueException 에 사유)")
    for d in decks:
        did = d["id"]
        if d.get("imputed"):
            if not d.get("papers"):
                errors.append(f"{did}: 추정치에는 기준 원고(papers)가 필요")
            continue  # 미제출 추정치 — 평가 파일 없음
        if did.startswith("NEW-"):
            errors.append(f"{did}: 임시 ID — 주 원고 ID 로 바꾸고 papers·track·presenter 를 채워야 함"); continue
        if not d.get("papers") and not d.get("externalPaper"):
            errors.append(f"{did}: papers 비어 있음(카탈로그 밖 원고면 externalPaper 에 제목·학회를 적는다)")
        for pid in d.get("papers") or []:
            if pid not in papers:
                errors.append(f"{did}: 원고 {pid} 가 순위 대상 카탈로그에 없음")
        if d.get("track") not in ("personal", "team"):
            errors.append(f"{did}: track")
        if not d.get("evaluated"):
            errors.append(f"{did}: eval_deck/{did}.json 없음(미평가)"); continue
        if d.get("evalTextSha") != d.get("textSha"):
            errors.append(f"{did}: 텍스트가 평가 이후 바뀜(eval {d.get('evalTextSha')} ≠ 현재 {d.get('textSha')})")
        rub = d.get("rubric")
        if not rub:
            errors.append(f"{did}: rubric 없음"); continue
        tot = []
        for ck, subs in crit_def.items():
            c = rub.get(ck)
            if not isinstance(c, dict) or not isinstance(c.get("sub"), dict):
                errors.append(f"{did}: rubric.{ck} 없음"); continue
            vals = []
            for sk in subs:
                v = c["sub"].get(sk)
                if v is None or not (0 <= v <= 1):
                    errors.append(f"{did}: rubric.{ck}.{sk}={v} 범위 밖")
                elif abs(v * 20 - round(v * 20)) > 1e-6:
                    warns.append(f"{did}: rubric.{ck}.{sk}={v} 가 0.05 격자가 아님")
                vals.append(v or 0)
            mean = sum(vals) / len(vals)
            if abs((c.get("score") or 0) - mean) > 0.011:
                errors.append(f"{did}: rubric.{ck}.score {c.get('score')} ≠ 세부 평균 {mean:.2f}")
            if not c.get("why"):
                errors.append(f"{did}: rubric.{ck}.why 없음")
            tot.append((ck, mean))
        want = 100 * sum((w.get(k) or 0) * m for k, m in tot)
        if tot and abs((rub.get("total") or 0) - want) > 0.11:
            errors.append(f"{did}: rubric.total {rub.get('total')} ≠ 기본 가중치 심사 점수 {want:.1f}")
        if rub.get("presentation", {}).get("sub", {}).get("qa") not in (None, 0.5):
            warns.append(f"{did}: presentation.qa 는 발표 전 자리값 0.5 여야 함")
        for f in d.get("flags") or []:
            if f.get("level") not in ("high", "mid"):
                errors.append(f"{did}: flag level")
        raw = json.dumps(d, ensure_ascii=False)
        if "@" in raw:
            errors.append(f"{did}: '@' 문자(이메일?) 포함")
    if os.path.exists(RESULTS):
        res = load_json(RESULTS)
        ev = {d["id"] for d in decks if d.get("evaluated") and not d["id"].startswith("NEW-")}
        if ev - set(res["decks"]):
            errors.append("deck_results.json 에 없는 발표자료(decks.py score): " + ", ".join(sorted(ev - set(res["decks"]))))
    else:
        errors.append("data/deck_results.json 없음 — decks.py score")
    for x in warns:
        print("WARN ", x)
    for x in errors:
        print("ERROR", x)
    print(f"check: {len(decks)} decks, {sum(1 for d in decks if d.get('evaluated'))} evaluated, {len(errors)} errors, {len(warns)} warnings")
    sys.exit(1 if errors else 0)


# ---------- report ----------
def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def cmd_report(a):
    rdef = load_json(os.path.join(DATA, "rubric.json"))
    res = load_json(RESULTS)
    decks = {d["id"]: d for d in load_decks()}
    papers = {p["id"]: p for p in load_papers()}
    listing = load_listing()
    view = {drive_key(f["id"]): f["id"] for f in listing["files"]} if listing else {}
    crit = rdef["criteria"]
    default = rdef["default"]
    today = datetime.date.today().isoformat()
    labels = {"personal": "개인", "team": "팀"}

    def pt(x):
        return f"{x * 5:.2f}"

    rows_html = []
    for track in ("team", "personal"):
        ranks = res["ranks"][default][track]
        if not ranks:
            continue
        rows_html.append(f"<h2>{labels[track]} 발표자료 순위 <span class=n>({len(ranks)}건 · 심사 점수 = 기술·혁신·구성 평균×100, 20점 환산 ÷5)</span></h2>")
        rows_html.append("<table><thead><tr><th>순위</th><th>자료</th><th>발표자</th><th>원고</th><th>분량</th>"
                         + "".join(f"<th title='{esc(c['label'])}'>{esc(c['short'])}<br><small>/5</small></th>" for c in crit)
                         + "<th>심사 점수<br><small>/100 · /20</small></th><th>원고 점수<br><small>/100 · 순위</small></th><th>차이</th></tr></thead><tbody>")
        for did, r in sorted(ranks.items(), key=lambda kv: (kv[1], kv[0])):
            d = decks[did]; rd = res["decks"][did]
            pr = rd.get("paper") or {}
            delta = rd.get("delta")
            cls = "up" if delta is not None and delta > 0.05 else "down" if delta is not None and delta < -0.05 else ""
            vid = view.get(d.get("driveKey"))
            title = esc(d["file"]["title"])
            if vid:
                title = f"<a href='https://drive.google.com/file/d/{vid}/view' target='_blank'>{title}</a>"
            kind = "—" if d.get("imputed") else (f"{d.get('slides')}장" if d.get("slides") else ("대본" if d.get("kind") == "script" else d["file"]["ext"]))
            if d.get("durationMin"):
                kind += f" · {d['durationMin']}분"
            cells = "".join(f"<td class=num>{pt(rd['crit'][c['key']])}" + (f"<br><small class=d>{'+' if rd['critDelta'][c['key']]>=0 else ''}{rd['critDelta'][c['key']]*5:.2f}</small>" if rd.get("critDelta") else "") + "</td>" for c in crit)
            presenter = esc(d.get("presenter") or d.get("team") or "")
            paper_s = (f"{pr.get('score', 0):.1f} · {pr.get('rank')}/{pr.get('n')}위" + ("<br><small>카탈로그 밖·가상 순위</small>" if pr.get("external") else "")) if pr else "—"
            sub = ("미제출 — 추정치(원고 점수 + 평균 변화)" if d.get("imputed") else "발표 대본(슬라이드 아님)" if d.get("kind") == "script"
                   else ("기준 원고 예외(정보기술학회판)" if d.get("venueException") else ""))
            rows_html.append(f"<tr><td class=num><b>{r}</b></td><td>{title}<br><small>{esc(sub)}</small></td><td>{presenter}</td>"
                             f"<td>{', '.join(f'<a href=#p-{esc(p)}>{esc(p)}</a>' for p in d['papers']) or ('카탈로그 밖' if d.get('externalPaper') else '')}</td><td>{esc(kind)}</td>{cells}"
                             f"<td class=num><b>{rd[default]:.1f}</b> · {rd[default]/5:.1f}</td><td class=num>{paper_s}</td><td class='num {cls}'>{'' if delta is None else ('%+.1f' % delta)}</td></tr>")
        rows_html.append("</tbody></table>")

    details = []
    for did in sorted(res["decks"], key=lambda k: -res["decks"][k][default]):
        d = decks[did]; rd = res["decks"][did]
        p0 = papers.get(d["papers"][0]) if d["papers"] else None
        if rd.get("imputed"):
            im = rd["imputed"]
            md = " · ".join(f"{esc(c['short'])} {im['meanDelta'][c['key']] * 5:+.2f}" for c in crit if c["key"] in im["meanDelta"])
            ptitle = (" · " + esc(p0["paperTitle"])) if p0 and p0.get("paperTitle") else ""
            details.append(f"<section id='p-{esc(did)}'><h3>{esc(d.get('presenter') or '')} · 발표자료 미제출 — 추정치 "
                           f"<span class=n>원고 {esc(', '.join(d['papers']))}{ptitle}</span></h3>"
                           f"<p>{esc(d.get('note', ''))}</p>"
                           f"<p><b>계산</b> 원고 {esc(d['papers'][0])} 의 항목 점수에, 원고가 카탈로그에 있는 개인 발표자료 {im['n']}건의 평균 변화"
                           f"(발표자료 − 원고, 5점 환산: {md})를 더했다 → 심사 점수 <b>{rd[default]:.1f}</b>.</p>"
                           f"<p><b>다른 계산</b> 개인 발표자료 전체 평균을 그대로 주면 {im['plainMeanScore']:.1f} 이고, 그 경우 개인 순위는 {im.get('plainMeanRank')}위다.</p></section>")
            continue
        why = "".join(f"<p><b>{esc(c['short'])} {pt(rd['crit'][c['key']])}/5</b> — {esc(d['rubric'][c['key']]['why'])}</p>" for c in crit)
        flags = "".join(f"<li class={esc(f['level'])}>{esc(f['text'])}</li>" for f in d.get("flags") or [])
        fixes = "".join(f"<li>{esc(x)}</li>" for x in d.get("fixes") or [])
        details.append(f"""<section id="p-{esc(did)}"><h3>{esc(did)} · {esc(d['file']['title'])} <span class=n>{esc(d.get('presenter') or d.get('team') or '')} · 원고 {esc(', '.join(d['papers']) or '카탈로그 밖')}{(' · ' + esc(p0['paperTitle'])) if p0 and p0.get('paperTitle') else ((' · ' + esc(d['externalPaper'].get('title', '') if isinstance(d['externalPaper'], dict) else d['externalPaper'])) if d.get('externalPaper') else '')}</span></h3>
<p class=sum>{esc(d.get('summary', ''))}</p>
<p><b>강점</b> {esc(d.get('strengths', ''))}</p>
{('<p><b>원고와의 일치</b> ' + esc(d['consistency']) + '</p>') if d.get('consistency') else ''}
{why}
{('<p><b>보완</b></p><ol>' + fixes + '</ol>') if fixes else ''}
{('<p><b>리스크</b></p><ul class=flags>' + flags + '</ul>') if flags else ''}
</section>""")

    # 미제출: 팀은 조 단위(카탈로그의 팀 번호), 개인은 전자공학회 개인논문 저자 단위
    all_teams = sorted({p.get("team") for p in papers.values() if p["track"] == "team" and p.get("team")}, key=lambda t: (len(t), t))
    teams_done = {d.get("team") for d in decks.values() if d["track"] == "team" and not d.get("imputed")}
    ee_authors = []
    for p in papers.values():
        if p["track"] == "personal" and p.get("venue") == "ee" and p["authors"] and p["authors"][0] not in ee_authors:
            ee_authors.append(p["authors"][0])
    people_done = {d.get("presenter") for d in decks.values() if d["track"] == "personal" and not d.get("imputed")}
    roster_p = os.path.join(DATA, "deck_roster.json")
    if os.path.exists(roster_p):  # 발표 대상 명단이 있으면 그것을 따른다(카탈로그에 없는 사람·제외 대상 반영)
        roster = load_json(roster_p)
        all_teams = roster["teams"]
        ee_authors = [n for n in roster["personal"] if n not in roster.get("excludePersonal", [])]
    pending_teams = [t for t in all_teams if t not in teams_done]
    pending_people = sorted(a for a in ee_authors if a not in people_done)
    excluded = [d for d in load_decks(with_eval=False, counted_only=False) if not d.get("counted", True)]
    excluded_html = ""
    if excluded:
        excluded_html = "<h2>세지 않은 자료 <span class=n>(조당 1건 · 사람당 1건 규칙)</span></h2><ul>" + "".join(
            f"<li><b>{esc(d['id'])}</b> {esc(d['file']['title'])} — {esc(d.get('note') or '')}</li>" for d in excluded) + "</ul>"
    html = f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>CAUMIL 발표자료 순위(v5 기준) — {today}</title>
<style>
:root{{--g:#1F5B3A;--bg:#F6F8F6;--card:#fff;--ink:#1a1f1c;--mute:#5d6b63;--line:#dfe6e1;--up:#1b7f4b;--down:#b3261e;--hi:#fff8e1}}
@media(prefers-color-scheme:dark){{:root{{--g:#123A26;--bg:#111614;--card:#1a211d;--ink:#e6ebe8;--mute:#9aa8a0;--line:#2b352f;--hi:#2f2a14}}}}
body{{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 "Pretendard","Malgun Gothic",system-ui,sans-serif}}
header{{background:var(--g);color:#fff;padding:18px 24px}}header h1{{margin:0;font-size:20px}}header p{{margin:4px 0 0;opacity:.85;font-size:13px}}
main{{max-width:1240px;margin:0 auto;padding:16px 24px 48px}}
h2{{font-size:17px;margin:28px 0 8px}}h3{{font-size:15px;margin:0 0 6px}}.n{{font-weight:400;color:var(--mute);font-size:13px}}
table{{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}}
th,td{{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}}th{{background:rgba(31,91,58,.08);font-weight:600;font-size:12.5px}}
td.num,th.num{{text-align:right;white-space:nowrap}}td small.d{{color:var(--mute)}}td.up{{color:var(--up);font-weight:600}}td.down{{color:var(--down);font-weight:600}}
tbody tr:nth-child(-n+2) td:first-child{{box-shadow:inset 4px 0 var(--g)}}
section{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 18px;margin:12px 0}}section p{{margin:6px 0}}.sum{{color:var(--mute)}}
ul.flags li.high{{color:var(--down)}}ul.flags li.mid{{color:#8a6d00}}
.note{{background:var(--hi);border-radius:8px;padding:10px 14px;font-size:13px}}
a{{color:inherit}}
</style></head><body>
<header><h1>CAUMIL 발표자료 순위 <small>v5 심사 기준 4항목 · 발표자료 기준</small></h1>
<p>기준일 {today} · 발표자료 {len(res['decks'])}건 평가(팀 {len(res['ranks'][default]['team'])}/{len(all_teams)}조 · 개인 {len(res['ranks'][default]['personal'])}/{len(ee_authors)}명) · 드라이브 국방AI 경진대회 발표자료 폴더(개인·팀) · 내부용 — 외부 공유 금지</p></header>
<main>
<div class=note><b>읽는 법.</b> 원고와 같은 심사 기준(<code>data/rubric.json</code>)을 발표자료(슬라이드 본문·발표자 노트·슬라이드 화면, 대본)에 적용했다. 항목 점수는 5점 환산, 심사 점수는 기술·혁신·구성 세 항목 평균×100(기본 프리셋 <code>{esc(default)}</code>, 발표 가중치 0). 발표 항목의 '명확한 피칭'은 자료의 메시지·구조·시각 전달로, '시간 관리'는 자료에 적힌 시간 배분으로 매겼고 Q&amp;A 는 발표 전 자리값 0.5 다. '원고 점수'는 같은 원고의 v5 원고 평가 심사 점수와 그 범주 안 순위, '차이'는 발표자료 점수 − 원고 점수(세부 열의 작은 숫자는 항목별 차이, 5점 환산). <b>선정 규칙</b>: 팀은 조당 발표자료 1건, 개인은 사람당 이름 폴더의 파일(ppt·pptx·pdf·hwp, 10/27 부터 html 도 인정) 1건만 세고 기준 원고는 전자공학회 논문(김정윤·박규민·서보윤은 예외 — 자료가 다루는 정보기술학회판 JT·LC·TC 기준). 아직 자료가 없는 조 {len(pending_teams)}개·개인 {len(pending_people)}명은 표에 없다.</div>
{''.join(rows_html)}
<h2>자료별 평가</h2>
{''.join(details)}
{excluded_html}
<h2>아직 발표자료가 없는 조·사람</h2>
<p class=n>팀 {len(pending_teams)}/{len(all_teams)}조: {esc(', '.join(pending_teams) or '없음')}<br>개인 {len(pending_people)}/{len(ee_authors)}명: {esc(', '.join(pending_people) or '없음')}</p>
</main></body></html>"""
    os.makedirs(DIST, exist_ok=True)
    out = os.path.join(DIST, "decks.html")
    open(out, "w", encoding="utf-8").write(html)
    print("wrote", out, f"{len(html)//1024} KB")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("fetch", "render", "extract"):
        s = sub.add_parser(name); s.add_argument("--force", action="store_true")
    s = sub.add_parser("sync"); s.add_argument("--apply", action="store_true")
    for name in ("score", "check", "report"):
        sub.add_parser(name)
    a = ap.parse_args()
    globals()["cmd_" + a.cmd](a)


if __name__ == "__main__":
    main()
