#!/usr/bin/env python3
"""v4: 심사 기준 5항목(data/rubric.json)으로 순위·안정성·레버를 계산해 data/results.json 을 만든다.

site/app.js 의 계산과 같다:
  항목 점수 x_c = 세부 요소 점수의 평균(반올림하지 않음)
  심사 점수 S   = 100 · Σ_c w_c · x_c          (Σ w_c = 1, 기본 5항목 균등 → eval 의 rubric.total 과 같다)
순위는 S 내림차순. S 가 1e-6 단위까지 같으면 같은 순위(1, 2, 2, 4)이며 표시 순서는 id 오름차순.
백분위 = (N − R + 0.5) / N × 100, 사분위 = 백분위 >75 Q1, >50 Q2, >25 Q3, 나머지 Q4.
안정성 = 항목 가중치를 Dirichlet(α·w)로, 모든 세부 요소를 {−noise, 0, +noise} 중 하나로(0–1 안에서) 흔들어 runs 번 다시 매긴 순위 분포.
레버 = 세부 요소 하나를 0.05 올렸을 때 심사 점수 변화(= 100·w_c·0.05 / 세부 요소 수).
v3 까지의 6개 변수·노트북 사전함수는 쓰지 않는다(v3/ 동결본, git 태그 v3-2026-10-02).

사용: python3 pipeline/score.py [--runs 4000] [--seed 20260923] [--compare data/results.json] [-o data/results.json]
"""
import argparse, datetime, os, random, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import DATA, load_json, load_papers, save_json  # noqa: E402


def skey(s):
    return int(round(s * 1e6))


class Rubric:
    def __init__(self, rdef):
        self.keys = [c["key"] for c in rdef["criteria"]]
        self.subs = {c["key"]: [x["key"] for x in c["sub"]] for c in rdef["criteria"]}
        self.presets = rdef["presets"]
        self.default = rdef["default"]

    def crit(self, rubric):
        return {k: sum(float(rubric[k]["sub"][s]) for s in self.subs[k]) / len(self.subs[k]) for k in self.keys}

    def score(self, x, w):
        return 100.0 * sum((w.get(k) or 0.0) * x[k] for k in self.keys)

    def rank(self, items, w):
        rows = sorted(((it, self.score(it["x"], w)) for it in items), key=lambda r: (-skey(r[1]), r[0]["id"]))
        out, prev_key, prev_rank = [], None, 0
        for i, (it, s) in enumerate(rows):
            r = prev_rank if skey(s) == prev_key else i + 1
            out.append((r, it, s)); prev_key, prev_rank = skey(s), r
        return out

    def people_items(self, papers, w):
        groups, order = {}, []
        for p in papers:
            if p["track"] != "personal":
                continue
            a = p["authors"][0]
            if a not in groups:
                groups[a] = []; order.append(a)
            groups[a].append(p)
        out = []
        for name in order:
            lst = groups[name]
            best = lst[0]
            for p in lst[1:]:
                if skey(self.score(p["x"], w)) > skey(self.score(best["x"], w)):
                    best = p
            out.append({"id": name, "paperId": best["id"], "x": best["x"], "rubric": best["rubric"], "papers": [p["id"] for p in lst]})
        return out

    def monte_carlo(self, items, w, runs, alpha, noise, seed):
        rnd = random.Random(seed)
        ranks = {it["id"]: [] for it in items}
        steps = (-noise, 0.0, noise)
        for _ in range(runs):
            g = [rnd.gammavariate(alpha * w[k], 1.0) if (w.get(k) or 0) > 0 else 0.0 for k in self.keys]
            gs = sum(g) or 1.0
            ww = {k: g[j] / gs for j, k in enumerate(self.keys)}
            vals = []
            for it in items:
                x = {}
                for k in self.keys:
                    tot = 0.0
                    for s in self.subs[k]:
                        tot += min(1.0, max(0.0, float(it["rubric"][k]["sub"][s]) + steps[int(rnd.random() * 3)]))
                    x[k] = tot / len(self.subs[k])
                vals.append((-self.score(x, ww), it["id"]))
            vals.sort()
            for i, (_, pid) in enumerate(vals):
                ranks[pid].append(i + 1)
        out = {}
        for pid, rs in ranks.items():
            rs.sort()
            n = len(rs)
            q = lambda p: rs[min(n - 1, max(0, int(p * (n - 1) + 0.5)))]  # noqa: E731
            out[pid] = {
                "p1": round(sum(1 for v in rs if v == 1) / n, 4),
                "top2": round(sum(1 for v in rs if v <= 2) / n, 4),
                "top3": round(sum(1 for v in rs if v <= 3) / n, 4),
                "p10": q(0.1), "p50": q(0.5), "p90": q(0.9),
            }
        return out

    def levers(self, rubric, w):
        out = []
        for ci, k in enumerate(self.keys):
            n = len(self.subs[k])
            for si, s in enumerate(self.subs[k]):
                v = float(rubric[k]["sub"][s])
                to = v if v >= 1 else min(1.0, round((v + 0.05) * 100) / 100)
                out.append({"c": k, "s": s, "from": v, "to": to, "delta": 100.0 * (w.get(k) or 0.0) * (to - v) / n, "ci": ci, "si": si})
        out.sort(key=lambda l: (-round(l["delta"], 9), l["from"], l["ci"], l["si"]))
        return [{"c": l["c"], "s": l["s"], "from": l["from"], "to": l["to"], "delta": round(l["delta"], 4)} for l in out]


def compute(papers, rdef, runs=4000, alpha=60.0, noise=0.05, seed=20260923):
    rb = Rubric(rdef)
    papers = [dict(p, x=rb.crit(p["rubric"])) for p in papers if p.get("rubric")]
    personal = [p for p in papers if p["track"] == "personal"]
    team = [p for p in papers if p["track"] == "team"]
    res = {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat(),
        "method": "rubric",
        "default": rb.default,
        "mc": {"runs": runs, "alpha": alpha, "noise": noise, "seed": seed},
        "papers": {}, "ranks": {}, "stability": {}, "levers": {}, "people": [],
    }
    for p in papers:
        res["papers"][p["id"]] = {"crit": {k: round(v, 6) for k, v in p["x"].items()}}
    for name, pr in rb.presets.items():
        w = pr["weights"]
        for p in papers:
            res["papers"][p["id"]][name] = round(rb.score(p["x"], w), 4)
        people = rb.people_items(papers, w)
        res["ranks"][name] = {
            "personal": {it["id"]: r for r, it, _ in rb.rank(personal, w)},
            "team": {it["id"]: r for r, it, _ in rb.rank(team, w)},
            "people": {it["id"]: r for r, it, _ in rb.rank(people, w)},
        }
        res["stability"][name] = {
            "personal": rb.monte_carlo(personal, w, runs, alpha, noise, seed),
            "people": rb.monte_carlo(people, w, runs, alpha, noise, seed),
            "team": rb.monte_carlo(team, w, runs, alpha, noise, seed),
        }
    w = rb.presets[rb.default]["weights"]
    for p in papers:
        res["levers"][p["id"]] = rb.levers(p["rubric"], w)
    res["people"] = [{k: v for k, v in it.items() if k not in ("x", "rubric")} for it in rb.people_items(papers, w)]
    return res


def compare(new, old):
    """이전 results.json 과 비교. 결정적 부분은 정확히, 몬테카를로는 허용오차로 본다."""
    if old.get("method") != "rubric":
        print("이전 results.json 은 v3(6개 변수) 형식이라 비교하지 않습니다."); return 0
    bad = 0
    for pid, per in old["papers"].items():
        for name, v in per.items():
            if name == "crit":
                continue
            nv = new["papers"].get(pid, {}).get(name)
            if nv is None or abs(nv - v) > 1e-3:
                print("DIFF papers", pid, name, v, "->", nv); bad += 1
    for name, g in old["ranks"].items():
        for grp, m in g.items():
            if new["ranks"].get(name, {}).get(grp) != m:
                print("DIFF ranks", name, grp, m, "->", new["ranks"].get(name, {}).get(grp)); bad += 1
    if {p["id"]: p["paperId"] for p in old["people"]} != {p["id"]: p["paperId"] for p in new["people"]}:
        print("DIFF people"); bad += 1
    worst = 0.0
    for name, g in old["stability"].items():
        for grp, m in g.items():
            for pid, v in m.items():
                nv = new["stability"].get(name, {}).get(grp, {}).get(pid)
                if nv:
                    worst = max(worst, abs(nv["p1"] - v["p1"]), abs(nv["top3"] - v["top3"]))
    print(f"deterministic diffs: {bad}; stability max |Δp| = {worst:.4f}")
    return bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=4000)
    ap.add_argument("--alpha", type=float, default=60.0)
    ap.add_argument("--noise", type=float, default=0.05)
    ap.add_argument("--seed", type=int, default=20260923)
    ap.add_argument("--compare")
    ap.add_argument("-o", "--out")
    a = ap.parse_args()
    rdef = load_json(os.path.join(DATA, "rubric.json"))
    res = compute(load_papers(), rdef, a.runs, a.alpha, a.noise, a.seed)
    if a.compare:
        compare(res, load_json(a.compare))
    if a.out:
        save_json(a.out, res)
        print("wrote", a.out)
    elif not a.compare:
        for cat in ("personal", "team", "people"):
            print(cat, " > ".join(f"{pid}({r})" for pid, r in sorted(res["ranks"][rdef["default"]][cat].items(), key=lambda kv: kv[1])))


if __name__ == "__main__":
    main()
