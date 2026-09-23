#!/usr/bin/env python3
"""노트북 experience_prior_probability 의 닫힌식으로 순위·안정성·레버·계획서 순위를 계산해 data/results.json 을 만든다.

site/app.js 의 계산과 같다:
  latent = Σ w_k·x_k (+ Σ coef·x_a·x_b, 상호작용 포함 시)
  fit    = 100 / (1 + exp(−slope·(latent − center)))          # 노트북 적합도(%)
  score  = 100 · latent / latent_max                            # 환산 점수(0–100)
순위는 latent 내림차순(동점이면 id 오름차순). 로지스틱은 단조라 순위는 latent 로 정해진다.

사용: python3 pipeline/score.py [--runs 4000] [--seed 20260923] [--compare data/results.json] [-o data/results.json]
"""
import argparse, datetime, math, os, random, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import DATA, load_json, load_papers, save_json  # noqa: E402


class Prior:
    def __init__(self, weights, keys):
        self.keys = keys
        self.slope = weights["logistic"]["slope"]
        self.center = weights["logistic"]["center"]
        self.synergies = weights["synergies"]
        self.presets = weights["presets"]
        self.default = weights["default"]

    def latent(self, x, w, syn):
        s = sum((w.get(k) or 0) * x[k] for k in self.keys)
        if syn:
            s += sum(sy["coef"] * x[sy["a"]] * x[sy["b"]] for sy in self.synergies)
        return s

    def latent_max(self, w, syn):
        return self.latent({k: 1.0 for k in self.keys}, w, syn)

    def fit(self, lat):
        return 100.0 / (1.0 + math.exp(-self.slope * (lat - self.center)))

    def evaluate(self, scores, w, syn):
        lat = self.latent(scores, w, syn)
        return {"latent": lat, "fit": self.fit(lat), "score": 100.0 * lat / self.latent_max(w, syn)}

    def rank(self, items, w, syn):
        rows = [(it, self.evaluate(it["scores"], w, syn)) for it in items]
        rows.sort(key=lambda r: (-r[1]["latent"], r[0]["id"]))
        return [(i + 1, it, ev) for i, (it, ev) in enumerate(rows)]

    def preset(self, name):
        pr = self.presets[name]
        return pr["weights"], bool(pr.get("synergy"))

    def people_items(self, papers, w, syn):
        groups = {}
        for p in papers:
            if p["track"] != "personal":
                continue
            groups.setdefault(p["authors"][0], []).append(p)
        out = []
        for name, lst in groups.items():
            best = lst[0]
            for p in lst[1:]:
                if self.latent(p["scores"], w, syn) > self.latent(best["scores"], w, syn):
                    best = p
            out.append({"id": name, "paperId": best["id"], "scores": best["scores"], "papers": [p["id"] for p in lst]})
        return out

    def monte_carlo(self, items, w, syn, runs, alpha, noise, seed):
        """가중치는 Dirichlet(α·w)로, 점수는 {−noise, 0, +noise} 한 칸으로 흔들어 순위 분포를 본다."""
        rnd = random.Random(seed)
        tot = sum((w.get(k) or 0) for k in self.keys) or 1.0
        ranks = {it["id"]: [] for it in items}
        steps = (-noise, 0.0, noise)
        for _ in range(runs):
            g = [rnd.gammavariate(alpha * w[k] / tot, 1.0) if (w.get(k) or 0) > 0 else 0.0 for k in self.keys]
            gs = sum(g) or 1.0
            ww = {k: g[j] / gs * tot for j, k in enumerate(self.keys)}
            vals = []
            for it in items:
                x = {k: min(1.0, max(0.0, it["scores"][k] + steps[int(rnd.random() * 3)])) for k in self.keys}
                vals.append((-self.latent(x, ww, syn), it["id"]))
            vals.sort()
            for i, (_, pid) in enumerate(vals):
                ranks[pid].append(i + 1)
        out = {}
        for pid, rs in ranks.items():
            rs.sort()
            n = len(rs)
            q = lambda p: rs[min(n - 1, max(0, int(math.floor(p * (n - 1) + 0.5))))]  # noqa: E731
            out[pid] = {
                "p1": round(sum(1 for v in rs if v == 1) / n, 4),
                "top2": round(sum(1 for v in rs if v <= 2) / n, 4),
                "top3": round(sum(1 for v in rs if v <= 3) / n, 4),
                "p10": q(0.1), "p50": q(0.5), "p90": q(0.9),
            }
        return out

    def levers(self, scores, w, syn):
        base = self.evaluate(scores, w, syn)
        metric = "fit" if syn else "score"
        out = []
        for k in self.keys:
            if scores[k] >= 1:
                out.append({"key": k, "from": scores[k], "to": scores[k], "delta": 0.0})
                continue
            y = dict(scores)
            y[k] = min(1.0, round((scores[k] + 0.05) * 100) / 100)
            out.append({"key": k, "from": scores[k], "to": y[k], "delta": round(self.evaluate(y, w, syn)[metric] - base[metric], 3)})
        out.sort(key=lambda l: -l["delta"])
        return out


def compute(papers, projects, weights, keys, runs=4000, alpha=60.0, noise=0.05, seed=20260923):
    prior = Prior(weights, keys)
    papers = [p for p in papers if p.get("scores")]
    personal = [p for p in papers if p["track"] == "personal"]
    team = [p for p in papers if p["track"] == "team"]
    res = {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat(),
        "default": prior.default,
        "mc": {"runs": runs, "alpha": alpha, "noise": noise, "seed": seed},
        "papers": {}, "ranks": {}, "stability": {}, "levers": {}, "plan": {}, "people": [],
    }
    for p in papers:
        res["papers"][p["id"]] = {}
    for name in prior.presets:
        w, syn = prior.preset(name)
        for p in papers:
            ev = prior.evaluate(p["scores"], w, syn)
            res["papers"][p["id"]][name] = {"latent": round(ev["latent"], 6), "fit": round(ev["fit"], 3), "score": round(ev["score"], 3)}
        people = prior.people_items(papers, w, syn)
        res["ranks"][name] = {
            "personal": {it["id"]: r for r, it, _ in prior.rank(personal, w, syn)},
            "team": {it["id"]: r for r, it, _ in prior.rank(team, w, syn)},
            "people": {it["id"]: r for r, it, _ in prior.rank(people, w, syn)},
        }
        res["stability"][name] = {
            "personal": prior.monte_carlo(personal, w, syn, runs, alpha, noise, seed),
            "people": prior.monte_carlo(people, w, syn, runs, alpha, noise, seed),
            "team": prior.monte_carlo(team, w, syn, runs, alpha, noise, seed),
        }
    w, syn = prior.preset(prior.default)
    for p in papers:
        res["levers"][p["id"]] = prior.levers(p["scores"], w, syn)
    for track in ("personal", "team"):
        items = [pj for pj in projects if pj["track"] == track and all(pj["scores"].get(k) is not None for k in keys)]
        ranked = prior.rank(items, w, syn)
        res["plan"][track] = {it["id"]: {"rank": r, "of": len(items), "fit": round(ev["fit"], 3), "score": round(ev["score"], 3)} for r, it, ev in ranked}
    res["people"] = prior.people_items(papers, w, syn)
    return res


def compare(new, old):
    """이전 results.json 과 비교. 결정적 부분은 정확히, 몬테카를로는 허용오차로 본다."""
    bad = 0
    for pid, per in old["papers"].items():
        for name, v in per.items():
            nv = new["papers"].get(pid, {}).get(name)
            if not nv or any(abs(nv[k] - v[k]) > 1e-3 for k in ("latent", "fit", "score")):
                print("DIFF papers", pid, name, v, "->", nv); bad += 1
    for name, g in old["ranks"].items():
        for grp, m in g.items():
            if new["ranks"].get(name, {}).get(grp) != m:
                print("DIFF ranks", name, grp, m, "->", new["ranks"].get(name, {}).get(grp)); bad += 1
    for pid, lv in old["levers"].items():
        nl = new["levers"].get(pid)
        if [(l["key"], l["from"], l["to"]) for l in lv] != [(l["key"], l["from"], l["to"]) for l in (nl or [])] or any(abs(a["delta"] - b["delta"]) > 2e-3 for a, b in zip(lv, nl or [])):
            print("DIFF levers", pid, lv[:2], "->", (nl or [])[:2]); bad += 1
    for track, m in old["plan"].items():
        for pid, v in m.items():
            nv = new["plan"].get(track, {}).get(pid)
            if not nv or nv["rank"] != v["rank"] or nv["of"] != v["of"] or abs(nv["fit"] - v["fit"]) > 1e-3:
                print("DIFF plan", track, pid, v, "->", nv); bad += 1
    if sorted(p["id"] for p in old["people"]) != sorted(p["id"] for p in new["people"]) or {p["id"]: p["paperId"] for p in old["people"]} != {p["id"]: p["paperId"] for p in new["people"]}:
        print("DIFF people", old["people"], new["people"]); bad += 1
    worst = 0.0; rank_mismatch = 0; cells = 0
    for name, g in old["stability"].items():
        for grp, m in g.items():
            for pid, v in m.items():
                nv = new["stability"][name][grp][pid]
                worst = max(worst, abs(nv["p1"] - v["p1"]), abs(nv["top3"] - v["top3"]))
                cells += 3
                rank_mismatch += sum(1 for k in ("p10", "p50", "p90") if nv[k] != v[k])
    print(f"deterministic diffs: {bad}; stability max |Δp| = {worst:.4f}; percentile-rank mismatches {rank_mismatch}/{cells}")
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
    weights = load_json(os.path.join(DATA, "weights.json"))
    keys = [c["key"] for c in load_json(os.path.join(DATA, "criteria.json"))]
    papers = load_papers()
    projects = load_json(os.path.join(DATA, "projects.json"))
    res = compute(papers, projects, weights, keys, a.runs, a.alpha, a.noise, a.seed)
    if a.compare:
        compare(res, load_json(a.compare))
    if a.out:
        save_json(a.out, res)
        print("wrote", a.out)
    elif not a.compare:
        w, syn = weights["presets"][weights["default"]]["weights"], weights["presets"][weights["default"]].get("synergy")
        for pid, r in res["ranks"][weights["default"]]["personal"].items():
            print(r, pid, res["papers"][pid][weights["default"]])


if __name__ == "__main__":
    main()
