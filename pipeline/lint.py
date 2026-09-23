#!/usr/bin/env python3
"""source_text/<ID>.txt 자동 점검 → data/lint.json

항목: 템플릿 잔재(residue), 참고문헌 수(refs), 그림·표 수(figures/tables), 초록의 수치 유무(abstractNumbers), 글자 수(chars).
점수에는 넣지 않고 원고 상세의 '자동 점검' 칩으로만 보여 준다.
사용: python3 pipeline/lint.py [-o data/lint.json] [--compare data/lint.json] [ID ...]
"""
import argparse, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import DATA, TEXT, load_json, save_json  # noqa: E402

RESIDUE = [
    ("템플릿 안내문 '심사용 논문에서는…'", r"심사용 논문에서는"),
    ("템플릿 안내문 '(수정할 필요 없음)'", r"\(수정할 필요 없음\)"),
    ("소속 자리표시자 '**소속/학과'", r"\*\*\s*(?:소속|대학교|학과|부서)"),
    ("소속 자리표시자 '[소속 학과 및 부서 기재]'", r"\[소속 학과 및 부서 기재\]"),
    ("템플릿 권호 'Vol. 01, 2018'", r"Vol\.\s*01,\s*No\.\s*1"),
    ("이메일 자리표시자", r"이메일\s*(?:주소\s*)?기재|E-?mail\s*[:：]\s*(?=\n|$)"),
    ("저자 자리표시자 '저자명'", r"저자명"),
    ("저자 자리표시자 'Author Name'", r"Author Name"),
    ("자리표시자 '회원구분 입력'", r"회원구분\s*입력"),
    ("과제번호 자리표시자", r"과제번호\s*(?:기재|입력|\))|RS-[o○]{3,}-[o○]{3,}"),  # 사사의 'RS-oooo-oooo' 도
    ("사사 자리표시자 '지원기관표기'", r"지원기관\s*표기"),
    ("사사 자리표시자 'Acknowledgment 내용 입력'", r"Acknowledgment\s*내용\s*입력"),
]
KNOWN_TYPOS = [("제목 오타 'PK-Talbe'", r"PK-Talbe")]
HEADER_CHECKS = [("머리글 '하계' (추계 행사 여부 확인)", r"하계")]  # 첫 600자(머리글·표제) 안에서만
ABSTRACT_END = r"Abstract|ABSTRACT|주제어|핵심어|Key\s*words|Keywords|Ⅰ\s*\.|I\s*\.\s*서\s*론"
NUMBERISH = r"\d+(?:[.,]\d+)?\s*(?:%|％|%p|배|건|개|명|초|분|ms|점|편|쌍|회|위|시간|GB|MB|KB|MiB|km|m|mm|Hz|kHz|MHz|GHz|W|dB)|\d+\.\d+"


def count_refs(text):
    nums = [int(m) for m in re.findall(r"^\s*\[(\d{1,3})\]", text, re.M)]
    if nums:
        return max(nums)
    m = re.search(r"참\s*고\s*문\s*헌|References|REFERENCES", text)
    if m:
        return len(re.findall(r"^\s*\d{1,3}[.)]\s", text[m.end():], re.M))
    return 0


def count_captions(text, words):
    nums = re.findall(r"^\s*(?:%s)\s*(\d+)\s*(?:[.:]|\t|\s{2,})" % words, text, re.M)  # '그림 3\t제목' 처럼 마침표 없는 캡션도 인정
    return len(set(nums))


def abstract_numbers(text):
    m = re.search(r"요\s*약", text)
    if not m:
        return None
    end = re.search(ABSTRACT_END, text[m.end():])
    abstract = text[m.end(): m.end() + (end.start() if end else 2500)]
    if len(abstract.strip()) < 80:
        return None
    return bool(re.search(NUMBERISH, abstract))


def lint_text(text):
    residue = []
    for label, pat in RESIDUE + KNOWN_TYPOS:
        n = len(re.findall(pat, text, re.M))
        if n:
            residue.append({"label": label, "count": n})
    head = text[:600]
    for label, pat in HEADER_CHECKS:
        n = len(re.findall(pat, head))
        if n:
            residue.append({"label": label, "count": n})
    return {
        "residue": residue,
        "refs": count_refs(text),
        "figures": count_captions(text, r"그림|Fig(?:ure|\.)?"),
        "tables": count_captions(text, r"표|Table"),
        "abstractNumbers": abstract_numbers(text),
        "chars": len(text),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*")
    ap.add_argument("-o", "--out")
    ap.add_argument("--compare")
    a = ap.parse_args()
    papers = load_json(os.path.join(DATA, "papers.json"))
    out = {}
    for p in papers:
        if a.ids and p["id"] not in a.ids:
            continue
        tp = os.path.join(TEXT, f"{p['id']}.txt")
        if not os.path.exists(tp):
            print("no text:", p["id"]); continue
        out[p["id"]] = lint_text(open(tp, encoding="utf-8").read())
    if a.compare:
        old = load_json(a.compare)
        print(f"{'id':3} {'refs':>9} {'fig':>7} {'tab':>7} {'abs#':>13}  residue(old->new)")
        for pid, n in out.items():
            o = old.get(pid, {})
            ol = {r['label']: r['count'] for r in o.get('residue', [])}
            nl = {r['label']: r['count'] for r in n['residue']}
            rd = [f"{k}:{ol.get(k)}->{nl.get(k)}" for k in sorted(set(ol) | set(nl)) if ol.get(k) != nl.get(k)]
            print(f"{pid:3} {o.get('refs')!s:>4}->{n['refs']:<4} {o.get('figures')!s:>3}->{n['figures']:<3} {o.get('tables')!s:>3}->{n['tables']:<3} {o.get('abstractNumbers')!s:>6}->{n['abstractNumbers']!s:<6} {'; '.join(rd)}")
    if a.out:
        if a.ids and os.path.exists(a.out):
            merged = load_json(a.out); merged.update(out); out = merged
        save_json(a.out, out)
        print("wrote", a.out, len(out))
    elif not a.compare:
        import json
        print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
