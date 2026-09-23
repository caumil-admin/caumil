#!/usr/bin/env python3
"""data/·eval/·results 를 합쳐 사이트를 만든다.

출력:
  dist/artifact.html      한 파일(CSS·데이터·스크립트 인라인) — claude.ai 아티팩트 게시용(내부용)
  dist/site/              GitHub Pages 형태(index.html, app.js, data/data.js, favicon.svg) — v3
  dist/v2/                캔버스 디자인 적용 전 페이지(site/legacy/) — v2 보관본
  --root                  공개판을 저장소 루트(index.html, app.js, data/data.js)와 v2/ 에 써서 Pages 배포 준비

--public(공개판): 원고 인용문(evidenceQuotes)을 빼고, 드라이브 파일 ID·원문 링크를 붙이지 않으며, robots noindex 를 단다.
내부용 빌드는 inputs/drive_listing.json 이 있을 때만 driveId·viewUrl 을 붙인다(카탈로그에는 해시만 있다).
사용: python3 pipeline/build.py [--public] [--root] [--basis-date YYYY-MM-DD] [--last-sync ISO] [--out dist]
"""
import argparse, datetime, hashlib, json, os, shutil, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import DATA, DIST, ROOT, SITE, drive_key, load_json, load_listing, load_papers  # noqa: E402

PUBLIC_DROP_PAPER = ("evidenceQuotes",)
ROBOTS = '<meta name="robots" content="noindex" />'
FAVICON = '<link rel="icon" href="favicon.svg" type="image/svg+xml" />'


def build_data(public=False, basis_date=None, last_sync=None):
    papers = [p for p in load_papers() if p.get("evaluated")]
    folders = load_json(os.path.join(DATA, "folders.json"))
    listing = load_listing()
    if last_sync is None and listing:
        last_sync = listing.get("syncedAt")
    by_key = {drive_key(f["id"]): f for f in listing["files"]} if listing else {}
    counts = {
        "total": len(papers),
        "personal": sum(p["track"] == "personal" for p in papers),
        "team": sum(p["track"] == "team" for p in papers),
        "new": sum(p.get("status") == "new" for p in papers),
        "updated": sum(p.get("status") == "updated" for p in papers),
    }
    for p in papers:
        p.pop("evaluated", None)
        p.pop("evalTextSha", None)
        if public:
            for k in PUBLIC_DROP_PAPER:
                p.pop(k, None)
        else:
            f = by_key.get(p.get("driveKey"))
            if f:
                p["driveId"] = f["id"]
                p["file"]["viewUrl"] = f"https://drive.google.com/file/d/{f['id']}/view?usp=drivesdk"
    meta = {
        "basisDate": basis_date or datetime.date.today().isoformat(),
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat(),
        "lastSync": last_sync,
        "excel": folders["excel"]["title"],
        "counts": counts,
    }
    if listing and not public and listing.get("root"):
        meta["root"] = listing["root"]
        meta["rootUrl"] = f"https://drive.google.com/drive/folders/{listing['root']}"
    return {
        "meta": meta,
        "criteria": load_json(os.path.join(DATA, "criteria.json")),
        "weights": load_json(os.path.join(DATA, "weights.json")),
        "papers": papers,
        "results": load_json(os.path.join(DATA, "results.json")),
        "projects": load_json(os.path.join(DATA, "projects.json")),
        "lint": load_json(os.path.join(DATA, "lint.json")) if os.path.exists(os.path.join(DATA, "lint.json")) else {},
        "public": public,
    }


def data_js(data):
    s = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return "/* 자동 생성: pipeline/build.py — 직접 수정하지 마세요 */\nwindow.RANK_DATA = " + s + ";\n"


def render(template, head_extra, scripts):
    return template.replace("{{HEAD_EXTRA}}", head_extra).replace("{{SCRIPTS}}", scripts)


def _h(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:8]


def write_site(dirpath, template, app, djs, head_extra):
    """Pages 용. 스크립트 주소에 내용 해시를 붙여 브라우저·CDN 캐시가 옛 파일을 잡고 있지 않게 한다."""
    os.makedirs(os.path.join(dirpath, "data"), exist_ok=True)
    page = render(template, head_extra, f'<script src="data/data.js?v={_h(djs)}"></script>\n<script src="app.js?v={_h(app)}"></script>')
    open(os.path.join(dirpath, "index.html"), "w", encoding="utf-8").write(page)
    open(os.path.join(dirpath, "data", "data.js"), "w", encoding="utf-8").write(djs)
    open(os.path.join(dirpath, "app.js"), "w", encoding="utf-8").write(app)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--public", action="store_true")
    ap.add_argument("--root", action="store_true", help="공개판을 저장소 루트에 쓴다(Pages 배포 준비)")
    ap.add_argument("--basis-date")
    ap.add_argument("--last-sync")
    ap.add_argument("--out", default=DIST)
    a = ap.parse_args()
    public = a.public or a.root
    data = build_data(public, a.basis_date, a.last_sync)
    template = open(os.path.join(SITE, "template.html"), encoding="utf-8").read()
    app = open(os.path.join(SITE, "app.js"), encoding="utf-8").read()
    robots = ROBOTS if public else ""

    os.makedirs(a.out, exist_ok=True)
    data["meta"]["host"] = "artifact"  # 아티팩트 샌드박스는 파일 내려받기를 막으므로 CSV 는 복사로
    artifact = render(template, robots, f"<script>\n{data_js(data)}</script>\n<script>\n{app}</script>")
    open(os.path.join(a.out, "artifact.html"), "w", encoding="utf-8").write(artifact)
    data["meta"]["host"] = "pages"
    djs = data_js(data)
    site = os.path.join(a.out, "site")
    write_site(site, template, app, djs, FAVICON + ("\n" + robots if robots else ""))
    for name in ("favicon.svg", ".nojekyll"):
        src = os.path.join(ROOT, name)
        if os.path.exists(src):
            shutil.copy(src, os.path.join(site, name))
    legacy_t = open(os.path.join(SITE, "legacy", "template.html"), encoding="utf-8").read()
    legacy_a = open(os.path.join(SITE, "legacy", "app.js"), encoding="utf-8").read()
    legacy_head = '<link rel="icon" href="../favicon.svg" type="image/svg+xml" />' + ("\n" + robots if robots else "")
    write_site(os.path.join(a.out, "v2"), legacy_t, legacy_a, djs, legacy_head)
    c = data["meta"]["counts"]
    print(f"built {'PUBLIC' if public else 'internal'}: {a.out}/artifact.html ({len(artifact)//1024} KB), {site}/ — papers {c['total']} (new {c['new']}, updated {c['updated']})")
    if a.root:
        write_site(ROOT, template, app, djs, FAVICON + "\n" + robots)
        write_site(os.path.join(ROOT, "v2"), legacy_t, legacy_a, djs, legacy_head)
        print("deployed PUBLIC site to repo root: index.html, app.js, data/data.js, v2/")


if __name__ == "__main__":
    main()
