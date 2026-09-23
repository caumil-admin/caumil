#!/usr/bin/env python3
"""hwp(5.x)·hwpx 원고에서 본문 텍스트를 뽑는다.

- hwp: OLE 복합문서. BodyText/Section* 스트림을 (압축이면) raw deflate로 풀고
  레코드를 순서대로 읽어 PARA_TEXT(본문·표·각주·머리글)와 EQEDIT(수식 스크립트)를 낸다.
- hwpx: zip. Contents/section*.xml 을 문서 순서대로 훑어 hp:t 텍스트와 hp:script(수식)를 낸다.
- UTF-16 서로게이트 쌍은 그대로 합치고, 짝이 없는 서로게이트는 U+FFFD로 바꾼다.

사용: python3 pipeline/extract.py raw/<file>.hwp[x] [-o out.txt]
      python3 pipeline/extract.py --all   # inputs/drive_listing.json 의 파일 전부 → source_text/<paperId|driveId>.txt
"""
import argparse, hashlib, io, json, os, re, struct, sys, zipfile, zlib
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "vendor"))
import olefile  # noqa: E402
from common import drive_key  # noqa: E402

ROOT = os.path.dirname(HERE)

HWPTAG_BEGIN = 0x10
TAG_PARA_TEXT = HWPTAG_BEGIN + 51
TAG_CTRL_HEADER = HWPTAG_BEGIN + 55
TAG_EQEDIT = HWPTAG_BEGIN + 72

# 문자 컨트롤(1 WCHAR): 0, 10(줄바꿈), 13(문단끝), 24~31. 나머지 1~23은 8 WCHAR(인라인·확장 컨트롤).
CHAR_CTRL_1 = {0, 10, 13} | set(range(24, 32))
CHAR_MAP = {10: "\n", 13: "\n", 24: "-", 30: " ", 31: " ", 9: "\t"}


class ExtractError(Exception):
    pass


def _utf16(units):
    """UTF-16 code unit 리스트를 문자열로. 짝 없는 서로게이트는 U+FFFD."""
    out = []
    i, n = 0, len(units)
    while i < n:
        u = units[i]
        if 0xD800 <= u <= 0xDBFF and i + 1 < n and 0xDC00 <= units[i + 1] <= 0xDFFF:
            out.append(chr(0x10000 + ((u - 0xD800) << 10) + (units[i + 1] - 0xDC00)))
            i += 2
            continue
        if 0xD800 <= u <= 0xDFFF:
            out.append("�")
        else:
            out.append(chr(u))
        i += 1
    return "".join(out)


def _records(data):
    """HWP 레코드 스트림 → (tag, level, payload) 반복자."""
    pos, n = 0, len(data)
    while pos + 4 <= n:
        (hdr,) = struct.unpack_from("<I", data, pos)
        pos += 4
        tag = hdr & 0x3FF
        level = (hdr >> 10) & 0x3FF
        size = (hdr >> 20) & 0xFFF
        if size == 0xFFF:
            (size,) = struct.unpack_from("<I", data, pos)
            pos += 4
        yield tag, level, data[pos : pos + size]
        pos += size


def _para_text(payload):
    units = list(struct.unpack_from("<%dH" % (len(payload) // 2), payload, 0))
    out, buf = [], []
    i, n = 0, len(units)
    while i < n:
        u = units[i]
        if u < 32:
            if buf:
                out.append(_utf16(buf))
                buf = []
            if u in CHAR_CTRL_1:
                out.append(CHAR_MAP.get(u, ""))
                i += 1
            else:
                if u == 9:
                    out.append("\t")
                i += 8  # 인라인/확장 컨트롤: 코드 + 7 WCHAR
            continue
        buf.append(u)
        i += 1
    if buf:
        out.append(_utf16(buf))
    return "".join(out)


def _eq_script(payload):
    if len(payload) < 6:
        return ""
    (length,) = struct.unpack_from("<H", payload, 4)
    raw = payload[6 : 6 + 2 * length]
    units = struct.unpack_from("<%dH" % (len(raw) // 2), raw, 0)
    return _utf16(list(units)).strip()


def extract_hwp(path):
    ole = olefile.OleFileIO(path)
    try:
        if not ole.exists("FileHeader"):
            raise ExtractError("FileHeader 스트림이 없음(HWP 5.x 아님)")
        fh = ole.openstream("FileHeader").read()
        if not fh.startswith(b"HWP Document File"):
            raise ExtractError("HWP 서명 불일치")
        (flags,) = struct.unpack_from("<I", fh, 36)
        compressed = bool(flags & 1)
        if flags & 2:
            raise ExtractError("암호 문서(비밀번호)라 본문을 읽을 수 없음")
        if flags & 4:
            raise ExtractError("배포용 문서라 본문이 암호화됨")
        sections = sorted(
            (e for e in ole.listdir() if len(e) == 2 and e[0] == "BodyText" and e[1].startswith("Section")),
            key=lambda e: int(re.sub(r"\D", "", e[1]) or 0),
        )
        if not sections:
            raise ExtractError("BodyText 섹션이 없음")
        parts = []
        for sec in sections:
            data = ole.openstream("/".join(sec)).read()
            if compressed:
                data = zlib.decompress(data, -15)
            for tag, level, payload in _records(data):
                if tag == TAG_PARA_TEXT:
                    parts.append(_para_text(payload))
                    if not parts[-1].endswith("\n"):
                        parts.append("\n")
                elif tag == TAG_EQEDIT:
                    s = _eq_script(payload)
                    if s:
                        parts.append(f"[수식: {s}]\n")
        return "".join(parts)
    finally:
        ole.close()


HP = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"


def extract_hwpx(path):
    z = zipfile.ZipFile(path)
    names = [n for n in z.namelist() if re.fullmatch(r"Contents/section\d+\.xml", n)]
    if not names:
        raise ExtractError("Contents/section*.xml 이 없음")
    names.sort(key=lambda n: int(re.findall(r"\d+", n)[-1]))
    parts = []
    for name in names:
        for ev, el in ET.iterparse(io.BytesIO(z.read(name)), events=("end",)):
            if el.tag == HP + "t":
                parts.append(el.text or "")
                for ch in el:
                    if ch.tag == HP + "tab":
                        parts.append("\t")
                    elif ch.tag == HP + "lineBreak":
                        parts.append("\n")
                    parts.append(ch.tail or "")
            elif el.tag == HP + "script" and el.text and el.text.strip():
                parts.append(f"[수식: {el.text.strip()}]")
            elif el.tag == HP + "p":
                if parts and not parts[-1].endswith("\n"):
                    parts.append("\n")
    return "".join(parts)


def normalize(text):
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "")
    text = re.sub(r"[ \t　]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip() + "\n"


def extract(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".hwpx":
        return normalize(extract_hwpx(path))
    if ext == ".hwp":
        return normalize(extract_hwp(path))
    raise ExtractError(f"지원하지 않는 확장자: {ext}")


def text_sha(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path", nargs="?")
    ap.add_argument("-o", "--out")
    ap.add_argument("--all", action="store_true", help="inputs/drive_listing.json 의 전 파일 처리")
    a = ap.parse_args()
    if a.all:
        listing = json.load(open(os.path.join(ROOT, "inputs", "drive_listing.json"), encoding="utf-8"))
        papers = {}
        pj = os.path.join(ROOT, "data", "papers.json")
        if os.path.exists(pj):
            papers = {p["driveKey"]: p["id"] for p in json.load(open(pj, encoding="utf-8"))}
        os.makedirs(os.path.join(ROOT, "source_text"), exist_ok=True)
        rows = []
        for f in listing["files"]:
            src = os.path.join(ROOT, "raw", f"{f['id']}.{f['ext']}")
            pid = papers.get(drive_key(f["id"]), drive_key(f["id"]))
            try:
                text = extract(src)
                out = os.path.join(ROOT, "source_text", f"{pid}.txt")
                open(out, "w", encoding="utf-8").write(text)
                rows.append((pid, "OK", len(text), text_sha(text), text.count("[수식:"), ""))
            except Exception as e:  # noqa: BLE001
                rows.append((pid, "FAIL", 0, "", 0, f"{type(e).__name__}: {e}"))
        print(f"{'id':4} {'st':4} {'chars':>7} {'sha':16} {'eq':>3} note")
        for r in rows:
            print(f"{r[0]:4} {r[1]:4} {r[2]:>7} {r[3]:16} {r[4]:>3} {r[5]}")
        return
    if not a.path:
        ap.error("path 또는 --all")
    text = extract(a.path)
    if a.out:
        open(a.out, "w", encoding="utf-8").write(text)
        print(a.out, len(text), text_sha(text))
    else:
        sys.stdout.write(text)


if __name__ == "__main__":
    main()
