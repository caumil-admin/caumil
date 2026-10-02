"""파이프라인 공통: 경로, JSON 입출력, 원고 카탈로그(data/papers.json)와 평가(eval/<ID>.json) 병합."""
import hashlib, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
EVAL = os.path.join(ROOT, "eval")
INPUTS = os.path.join(ROOT, "inputs")
RAW = os.path.join(ROOT, "raw")
TEXT = os.path.join(ROOT, "source_text")
DIST = os.path.join(ROOT, "dist")
SITE = os.path.join(ROOT, "site")

VENUE_NAME = {"ee": "전자공학회 특별호", "it": "정보기술학회", "dt": "국방기술학회"}

# eval/<ID>.json 이 갖는 필드(평가 원자료). 나머지는 data/papers.json(카탈로그)에 있다.
EVAL_FIELDS = [
    "paperTitle", "paperTitleEn", "authorsInText", "venueHeader",
    "scores", "rationale", "planDelta", "keyNumbers", "summary", "strengths",
    "fixes", "flags", "refCount", "overlap", "evidenceQuotes", "evaluatedAt", "textSha",
    "rubric",  # 심사 기준 5항목(data/rubric.json) — v4 순위의 유일한 근거. scores·rationale(6개 변수)은 v3 까지의 기록
]


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(path, obj):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.write("\n")


def keys():
    return [c["key"] for c in load_json(os.path.join(DATA, "criteria.json"))]


def excluded_subs():
    """v4 순위에서 빼는 하위 폴더 이름(data/rubric.json 의 scope.excludeFolderSub, 기본 '핵심5')."""
    p = os.path.join(DATA, "rubric.json")
    try:
        return set(load_json(p).get("scope", {}).get("excludeFolderSub", []))
    except (OSError, ValueError):
        return {"핵심5"}


def in_scope(p):
    return p.get("status") != "removed" and p.get("folderSub") not in excluded_subs()


def load_papers(with_eval=True, include_removed=False, include_excluded=False):
    """카탈로그에 평가를 덮어 하나의 레코드로 만든다. 평가의 textSha 는 evalTextSha 로 따로 둔다.
    드라이브 목록에서 사라진 원고(status removed)는 순위·사이트·점검에서 뺀다(eval/ 은 기록으로 남김).
    v4: '핵심5' 하위 폴더 원고(folderSub)도 기본으로 뺀다 — 카탈로그·목록 대조에는 남는다."""
    papers = load_json(os.path.join(DATA, "papers.json"))
    if not include_removed:
        papers = [p for p in papers if p.get("status") != "removed"]
    if not include_excluded:
        ex = excluded_subs()
        papers = [p for p in papers if p.get("folderSub") not in ex]
    if not with_eval:
        return papers
    for p in papers:
        ep = os.path.join(EVAL, f"{p['id']}.json")
        if not os.path.exists(ep):
            p["evaluated"] = False
            continue
        e = load_json(ep)
        for k, v in e.items():
            if k == "id":
                continue
            if k == "textSha":
                p["evalTextSha"] = v
            else:
                p[k] = v
        p["evaluated"] = True
    return papers


def drive_key(drive_id):
    """드라이브 파일 ID 의 해시. 공개 저장소에는 링크 공유된 원고의 ID 대신 이 키만 둔다."""
    return hashlib.sha256(drive_id.encode("utf-8")).hexdigest()[:16]


def load_listing():
    p = os.path.join(INPUTS, "drive_listing.json")
    return load_json(p) if os.path.exists(p) else None
