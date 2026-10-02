/* CAUMIL 논문 지표 v4 — data/data.js(window.RANK_DATA)를 읽어 순위 탐색·범주 개요·지표 산출·원고 프로필을 그린다.
   순위는 경진대회 심사 기준 5항목(data/rubric.json)으로만 매긴다. 계산식은 pipeline/score.py 와 같다:
     항목 점수 x_c = 세부 요소 평균(반올림 없음), 심사 점수 = 100 × Σ w_c·x_c (Σw = 1, 기본 5항목 균등),
     같은 점수(1e-6 단위)는 같은 순위, 백분위 = (N − R + 0.5) ÷ N × 100.
   화면 구성은 v3(Claude Design 캔버스 'CAUMIL 논문 순위 v2', 9tBbBaMpePcUWcuFiKSsCm)를 이어받는다. */
(function () {
  "use strict";
  var D = window.RANK_DATA;
  var main = document.getElementById("main");
  if (!D) { main.innerHTML = '<div class="inner"><p class="empty">data/data.js를 불러오지 못했습니다. pipeline/build.py를 실행하세요.</p></div>'; return; }

  // ------------------------------------------------------------------ constants
  var RUB = D.rubric, R = D.results;
  var CRIT = RUB.criteria;
  var KEYS = CRIT.map(function (c) { return c.key; });
  var FULL = {}, TINY = {}, SUBS = {}, SUBLABEL = {};
  CRIT.forEach(function (c) { FULL[c.key] = c.label; TINY[c.key] = c.short || c.label; SUBS[c.key] = c.sub.map(function (x) { return x.key; }); c.sub.forEach(function (x) { SUBLABEL[c.key + "." + x.key] = x.label; }); });
  var PRESETS = RUB.presets, DEFAULT = RUB["default"];
  var PRESET_ORDER = Object.keys(PRESETS);
  var PAPERS = D.papers.slice();
  var BY_ID = {}; PAPERS.forEach(function (p) { BY_ID[p.id] = p; });
  var VENUE = { ee: "전자공학회 특별호", it: "정보기술학회", dt: "국방기술학회" };
  var VENUE_ORDER = ["ee", "it", "dt"];
  var CATS = [["personal", "개인논문"], ["people", "사람별 대표작"], ["team", "팀논문"]];
  var CAT_LABEL = {}; CATS.forEach(function (c) { CAT_LABEL[c[0]] = c[1]; });
  var MC = R.mc || { runs: 4000, alpha: 60, noise: 0.05, seed: 20260923 };
  var Q_NOTE = { 1: "범주 상위 25% 이내", 2: "범주 상위 25–50%", 3: "범주 하위 25–50%", 4: "범주 하위 25%" };
  var HOST = D.meta.host || "pages";
  var EXCL = (D.meta.excludedSub || ["핵심5"]).join("·");
  var V3_URL = "https://caumil-admin.github.io/caumil/v3/";
  var FOOT_NOTE = "심사 점수는 원고 텍스트만 근거로 세부 요소마다 0.05 단위로 매긴 정성 점수이며 공식 심사 결과를 대신하지 않습니다.";

  // ------------------------------------------------------------------ helpers
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]; }); }
  function f1(v) { return Number(v).toFixed(1); }
  function f2(v) { return Number(v).toFixed(2); }
  function f3(v) { return Number(v).toFixed(3); }
  function pct(v) { return (Math.round(v * 1000) / 10) + "%"; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function kstDate(iso) { if (!iso) return null; var t = new Date(iso).getTime(); if (isNaN(t)) return null; return new Date(t + 9 * 3600 * 1000); }
  function kst(iso) { var d = kstDate(iso); return d ? (d.getUTCMonth() + 1) + "/" + d.getUTCDate() + " " + pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()) : ""; }
  function kstFull(iso) { var d = kstDate(iso); return d ? d.getUTCFullYear() + "." + pad2(d.getUTCMonth() + 1) + "." + pad2(d.getUTCDate()) + " " + pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()) : ""; }
  function median(vals) { var a = vals.slice().sort(function (x, y) { return x - y; }); var n = a.length; if (!n) return NaN; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; }
  function percentile(n, rank) { return (n - rank + 0.5) / n * 100; }
  function quartile(p) { return p > 75 ? 1 : p > 50 ? 2 : p > 25 ? 3 : 4; }
  function qChip(qn, cls) { return '<span class="q q' + qn + (cls ? " " + cls : "") + '">Q' + qn + "</span>"; }
  function heat(v) { return "rgba(var(--accent-rgb), " + (0.05 + 0.30 * v).toFixed(3) + ")"; }
  function basisText() { return D.meta.lastSync ? kstFull(D.meta.lastSync) : String(D.meta.basisDate || "").replace(/-/g, "."); }
  function whoOf(p) { return p.track === "team" ? ((p.team ? p.team + " " : "") + p.authors.join("·")) : p.authors.join("·"); }
  function shortWho(p) { return p.track === "team" ? (p.team || p.authors[0]) : p.authors[0]; }
  function trackLabel(p) { return p.track === "team" ? "팀논문" : "개인논문"; }
  function badges(p) { return (p.status === "new" ? ' <span class="badge b-new">신규</span>' : "") + (p.status === "updated" ? ' <span class="badge b-upd">수정</span>' : ""); }
  function tieMark(r) { return r.tie ? '<span class="tie" title="같은 점수 — 공동 순위">=</span>' : ""; }
  var toastTimer = null;
  function toast(msg) { var el = document.getElementById("toast"); if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); } el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, 2600); }

  // ------------------------------------------------------------------ 심사 점수 (= pipeline/score.py)
  function subOf(p, k, sk) { var c = (p.rubric || {})[k]; return c && c.sub && c.sub[sk] != null ? Number(c.sub[sk]) : 0; }
  function critOf(p) { var x = {}; KEYS.forEach(function (k) { var t = 0; SUBS[k].forEach(function (sk) { t += subOf(p, k, sk); }); x[k] = t / SUBS[k].length; }); return x; }
  function scoreOf(x, w) { var s = 0; KEYS.forEach(function (k) { s += (w[k] || 0) * x[k]; }); return 100 * s; }
  function skey(s) { return Math.round(s * 1e6); }
  function presetModel(key) { return { preset: key, w: Object.assign({}, PRESETS[key].weights) }; }
  function modelLabel(m) { return m.preset === "custom" ? "사용자 설정" : (PRESETS[m.preset].short || PRESETS[m.preset].label); }
  function rawFromModel(m) { var r = {}; KEYS.forEach(function (k) { r[k] = Math.round((m.w[k] || 0) * 1000) / 10; }); return r; }
  function modelFromRaw(raw) { var tot = 0; KEYS.forEach(function (k) { tot += raw[k]; }); tot = tot || 1; var w = {}; KEYS.forEach(function (k) { w[k] = raw[k] / tot; }); return { preset: "custom", w: w }; }

  // ------------------------------------------------------------------ state
  var state = { page: "rank", cat: "personal", off: {}, sortKey: "rank", sortDir: 1, q: "", pid: null, model: presetModel(DEFAULT), raw: null, labCat: "personal" };
  state.raw = rawFromModel(state.model);
  try { var sv = localStorage.getItem("caumil.v4.cat"); if (sv && CAT_LABEL[sv]) state.cat = sv; } catch (e) { /* 저장소를 쓸 수 없는 환경 */ }

  // ------------------------------------------------------------------ items & ranking
  function personalPapers() { return PAPERS.filter(function (p) { return p.track === "personal"; }); }
  function teamPapers() { return PAPERS.filter(function (p) { return p.track === "team"; }); }
  function itemOfPaper(p) {
    return { id: p.id, key: p.id, stabKey: p.id, who: whoOf(p), title: p.paperTitle || p.file.title, venueKey: p.venue, venue: VENUE[p.venue] || p.venueName || "", paper: p, x: critOf(p), isNew: p.status === "new", isUpd: p.status === "updated", extra: "" };
  }
  function peopleItems(m) {
    var groups = {}, order = [];
    personalPapers().forEach(function (p) { var a = p.authors[0]; if (!groups[a]) { groups[a] = []; order.push(a); } groups[a].push(p); });
    return order.map(function (name) {
      var list = groups[name], best = list[0];
      list.forEach(function (p) { if (skey(scoreOf(critOf(p), m.w)) > skey(scoreOf(critOf(best), m.w))) best = p; });
      var it = itemOfPaper(best);
      it.key = name; it.stabKey = name; it.who = name; it.papers = list;
      it.extra = list.filter(function (p) { return p.id !== best.id; }).map(function (p) { return p.id; }).join("·");
      return it;
    });
  }
  function items(cat, m) { return cat === "people" ? peopleItems(m) : (cat === "team" ? teamPapers() : personalPapers()).map(itemOfPaper); }
  function rankItems(list, m) {
    var rows = list.map(function (it) { return Object.assign({}, it, { score: scoreOf(it.x, m.w) }); });
    rows.sort(function (a, b) { return (skey(b.score) - skey(a.score)) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0); });
    var n = rows.length;
    rows.forEach(function (r, i) {
      r.rank = i > 0 && skey(rows[i - 1].score) === skey(r.score) ? rows[i - 1].rank : i + 1;
      r.n = n; r.pctl = percentile(n, r.rank); r.qn = quartile(r.pctl);
    });
    rows.forEach(function (r, i) { r.tie = (i > 0 && rows[i - 1].rank === r.rank) || (i < n - 1 && rows[i + 1].rank === r.rank); });
    return rows;
  }
  function levers(p, m) {
    var out = [];
    KEYS.forEach(function (k, ci) {
      var n = SUBS[k].length;
      SUBS[k].forEach(function (sk, si) {
        var v = subOf(p, k, sk), to = v >= 1 ? v : Math.min(1, Math.round((v + 0.05) * 100) / 100);
        out.push({ c: k, s: sk, from: v, to: to, delta: 100 * (m.w[k] || 0) * (to - v) / n, ci: ci, si: si });
      });
    });
    out.sort(function (a, b) { return (Math.round(b.delta * 1e9) - Math.round(a.delta * 1e9)) || (a.from - b.from) || (a.ci - b.ci) || (a.si - b.si); });
    return out;
  }

  // ------------------------------------------------------------------ Monte Carlo (사용자 가중치용 브라우저 계산)
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function gauss(rnd) { var u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function gammaSample(rnd, a) {
    if (a < 1) return gammaSample(rnd, a + 1) * Math.pow(rnd(), 1 / a);
    var d = a - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) { var x, v; do { x = gauss(rnd); v = 1 + c * x; } while (v <= 0); v = v * v * v; var u = rnd(); if (u < 1 - 0.0331 * Math.pow(x, 4)) return d * v; if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; }
  }
  function monteCarlo(list, m, runs) {
    var rnd = mulberry32(MC.seed), alpha = MC.alpha;
    var ranks = {}; list.forEach(function (it) { ranks[it.stabKey] = []; });
    var steps = [-MC.noise, 0, MC.noise];
    for (var r = 0; r < runs; r++) {
      var g = KEYS.map(function (k) { return (m.w[k] || 0) > 0 ? gammaSample(rnd, alpha * m.w[k]) : 0; });
      var gs = g.reduce(function (s, v) { return s + v; }, 0) || 1;
      var w = {}; KEYS.forEach(function (k, j) { w[k] = g[j] / gs; });
      var vals = list.map(function (it) {
        var x = {};
        KEYS.forEach(function (k) { var t = 0; SUBS[k].forEach(function (sk) { t += Math.min(1, Math.max(0, subOf(it.paper, k, sk) + steps[Math.floor(rnd() * 3)])); }); x[k] = t / SUBS[k].length; });
        return [scoreOf(x, w), it.stabKey];
      });
      vals.sort(function (a, b) { return (b[0] - a[0]) || (a[1] < b[1] ? -1 : 1); });
      vals.forEach(function (v, i) { ranks[v[1]].push(i + 1); });
    }
    var out = {};
    Object.keys(ranks).forEach(function (id) {
      var rs = ranks[id].slice().sort(function (a, b) { return a - b; }), n = rs.length;
      var q = function (p) { return rs[Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))))]; };
      out[id] = { p1: rs.filter(function (v) { return v === 1; }).length / n, top2: rs.filter(function (v) { return v <= 2; }).length / n, top3: rs.filter(function (v) { return v <= 3; }).length / n, p10: q(0.1), p50: q(0.5), p90: q(0.9) };
    });
    return out;
  }
  function stabilityFor(cat, list, m, filtered) {
    if (filtered) return null;
    var pre = R.stability && R.stability[m.preset];
    if (pre && pre[cat]) return { data: pre[cat], live: false };
    return { data: monteCarlo(list, m, 1500), live: true };
  }

  // ------------------------------------------------------------------ shell
  function setNav(page) { var nodes = document.querySelectorAll("[data-nav]"); for (var i = 0; i < nodes.length; i++) { if (nodes[i].getAttribute("data-nav") === page) nodes[i].setAttribute("aria-current", "page"); else nodes[i].removeAttribute("aria-current"); } }
  function setTitle(t) { document.title = t + " · CAUMIL 논문 지표"; }
  function yearOf() { return String(D.meta.basisDate || "").slice(0, 4); }
  function pageHead(crumbs, title, lede, right, pill) {
    return '<section class="page-head"><div class="inner"><div class="head-copy"><nav class="crumbs" aria-label="현재 위치">' + crumbs + "</nav>"
      + '<div class="title-row"><h1 class="title">' + title + "</h1>" + (pill ? '<span class="pill">' + esc(pill) + "</span>" : "") + "</div>"
      + (lede ? '<p class="lede">' + lede + "</p>" : "") + "</div>" + (right || "") + "</div></section>";
  }
  function footerText() { return "CAUMIL 논문 지표 v4 · 심사 기준 5항목 순위 · 데이터 기준 " + basisText() + " · " + FOOT_NOTE; }
  function critNames() { return CRIT.map(function (c) { return c.label; }).join("·"); }

  // ------------------------------------------------------------------ 순위 탐색
  function rankContext() {
    var m = state.model, cat = state.cat;
    var all = rankItems(items(cat, m), m);
    var counts = {}; all.forEach(function (r) { counts[r.venueKey] = (counts[r.venueKey] || 0) + 1; });
    var vkeys = VENUE_ORDER.filter(function (k) { return counts[k]; });
    var filtered = vkeys.some(function (k) { return state.off[k]; });
    var kept = rankItems(all.filter(function (r) { return !state.off[r.venueKey]; }), m);
    var onV = vkeys.filter(function (k) { return !state.off[k]; });
    var catLabel = CAT_LABEL[cat];
    var catName = !filtered ? catLabel : onV.length === 1 ? catLabel + " · " + VENUE[onV[0]] : onV.length === 0 ? catLabel + " · 학회 없음" : catLabel + " · 일부 학회";
    return { m: m, cat: cat, all: all, N: all.length, counts: counts, vkeys: vkeys, filtered: filtered, kept: kept, catName: catName, stab: stabilityFor(cat, all, m, filtered) };
  }
  function renderRank() {
    var c = rankContext(), m = c.m;
    setTitle(c.catName + " 순위");
    var right = '<dl class="meta-dl">'
      + '<div><dt>기준 시점</dt><dd class="mono">' + esc(basisText()) + "</dd></div>"
      + '<div><dt>원고</dt><dd class="mono">' + D.meta.counts.total + "편</dd></div>"
      + '<div><dt>신규 · 수정</dt><dd class="mono">' + D.meta.counts.new + " · " + D.meta.counts.updated + "</dd></div>"
      + "<div><dt>가중치</dt><dd>" + esc(modelLabel(m)) + "</dd></div></dl>";
    var lede = "경진대회 심사 기준 5항목(" + esc(critNames()) + ")의 세부 요소 12개를 원고 텍스트로 채점하고, 항목 점수의 평균×100(심사 점수)으로 순위를 매겼습니다."
      + (D.meta.counts.excluded ? " '" + esc(EXCL) + "' 하위 폴더 원고 " + D.meta.counts.excluded + "편은 제외했습니다." : "")
      + '<label class="search m-search" for="q-m"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6"></circle><path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg><input id="q-m" type="search" placeholder="제목·저자·ID 검색" aria-label="원고 검색" autocomplete="off" value="' + esc(state.q) + '" /></label>';
    var head = pageHead("<span>순위 탐색</span><span aria-hidden=\"true\">/</span><span>" + esc(c.catName) + "</span>", esc(c.catName) + " 순위", lede, right, yearOf() + " 제출분");

    var cats = CATS.map(function (cc) { var k = cc[0]; return '<button type="button" class="cat-btn" data-act="cat" data-cat="' + k + '" aria-pressed="' + (k === c.cat) + '"><span>' + esc(cc[1]) + '</span><span class="n">' + items(k, m).length + "</span></button>"; }).join("");
    var venues = c.vkeys.map(function (k) { return '<label class="chk" for="v-' + k + '"><input id="v-' + k + '" type="checkbox" data-venue="' + k + '"' + (state.off[k] ? "" : " checked") + ' /><span class="grow">' + esc(VENUE[k]) + '</span><span class="n">' + c.counts[k] + "</span></label>"; }).join("");
    var presets = PRESET_ORDER.map(function (k) { return '<label class="chk" for="w-' + k + '"><input id="w-' + k + '" type="radio" name="preset" data-preset="' + k + '"' + (m.preset === k ? " checked" : "") + ' /><span>' + esc(PRESETS[k].short || PRESETS[k].label) + "</span></label>"; }).join("")
      + (m.preset === "custom" ? '<label class="chk" for="w-custom"><input id="w-custom" type="radio" name="preset" checked disabled /><span>사용자 설정</span></label>' : "");
    var aside = '<aside class="filters" aria-label="필터">'
      + '<fieldset class="cats"><legend>범주</legend>' + cats + "</fieldset>"
      + '<fieldset class="venues"><legend>학회</legend>' + venues + "</fieldset>"
      + '<fieldset class="presets"><legend>항목 가중치</legend>' + presets + '<a href="#method" style="margin-top:6px;font-size:12.5px">가중치를 직접 바꿔 보기 →</a></fieldset>'
      + '<div class="qleg"><span class="lg">사분위</span><div class="qlegend">' + [1, 2, 3, 4].map(function (q) { return qChip(q); }).join("") + '</div><span class="note">범주 안 백분위 75 초과가 Q1, 50 초과 Q2, 25 초과 Q3입니다.</span></div>'
      + "</aside>";
    main.innerHTML = head + '<div class="inner rank-layout">' + aside + '<section class="rank-main" aria-label="순위표" id="rank-body"></section></div>';
    renderRankBody(c);
  }
  function renderRankBody(c) {
    c = c || rankContext();
    var st = c.stab, N = c.N;
    var q = state.q.trim().toLowerCase();
    var shown = q ? c.kept.filter(function (r) { return (r.title + " " + r.who + " " + r.id).toLowerCase().indexOf(q) >= 0; }) : c.kept;
    var key = state.sortKey, dir = state.sortDir;
    function val(r) { var s = st ? st.data[r.stabKey] : null; return key === "rank" ? r.rank : key === "score" ? r.score : key === "q" ? r.qn : key === "pctl" ? r.pctl : key === "range" ? (s ? s.p50 + s.p90 / 100 : r.rank) : r.x[key]; }
    var rows = shown.slice().sort(function (a, b) { return ((val(a) - val(b)) * dir) || (a.rank - b.rank) || (a.key < b.key ? -1 : 1); });
    var defs = [["rank", "순위", "j-c", 1], ["title", "원고", "j-s", 0], ["score", "심사 점수", "j-e", -1], ["q", "사분위", "j-c", 1], ["pctl", "백분위", "j-e", -1]]
      .concat(KEYS.map(function (k) { return [k, TINY[k], "j-c", -1]; })).concat([["range", "순위 범위", "j-s", 1]]);
    var thead = defs.map(function (d) {
      var k = d[0], on = d[3] !== 0 && k === key;
      return '<button type="button" class="' + d[2] + (on ? " on" : "") + '"' + (d[3] === 0 ? " disabled" : ' data-act="sort" data-key="' + k + '" data-d0="' + d[3] + '"') + ' aria-label="' + esc(d[3] === 0 ? d[1] : (FULL[k] || d[1]) + " 기준 정렬" + (on ? (dir > 0 ? ", 오름차순" : ", 내림차순") : "")) + '"' + (FULL[k] ? ' title="' + esc(FULL[k]) + ' (항목 점수 0–1)"' : "") + "><span>" + esc(d[1]) + '</span><span class="arr" aria-hidden="true">' + (on ? (dir > 0 ? "▲" : "▼") : "") + "</span></button>";
    }).join("");
    var body = rows.map(function (r) {
      var s = st ? st.data[r.stabKey] : null;
      var cells = KEYS.map(function (k) { return '<span class="c-var" title="' + esc(FULL[k]) + " " + f2(r.x[k]) + '" style="background:' + heat(r.x[k]) + '">' + f2(r.x[k]) + "</span>"; }).join("");
      var rangeTxt = !s ? "—" : (s.p10 === s.p90 ? s.p10 + "위" : s.p10 + "–" + s.p90 + "위");
      var rbar = s && N > 1 ? '<span class="rbar"><i style="left:' + f1((s.p10 - 1) / (N - 1) * 100) + "%;width:" + f1(Math.max(6, (s.p90 - s.p10) / (N - 1) * 100)) + '%"></i></span>' : "";
      var extra = r.extra ? ' <span class="mono">(' + esc(r.extra) + ")</span>" : "";
      return '<div class="tgrid trow' + (r.rank <= 2 ? " top2" : "") + '">'
        + '<span class="c-rank">' + r.rank + tieMark(r) + "</span>"
        + '<span class="c-title"><a href="#' + esc(r.id) + '" class="clamp2">' + esc(r.title) + '</a><span class="who"><b>' + esc(r.who) + '</b><span aria-hidden="true">·</span><span>' + esc(r.venue) + '</span><span class="mono id">' + esc(r.id) + "</span>" + extra + badges(r.paper) + "</span></span>"
        + '<span class="c-prim"><span class="v">' + f1(r.score) + '</span><span class="bar"><i style="width:' + Math.max(1, Math.round(r.score)) + '%"></i></span>' + qChip(r.qn, "mq") + "</span>"
        + '<span class="c-q">' + qChip(r.qn) + "</span>"
        + '<span class="c-pctl">' + f1(r.pctl) + "</span>" + cells
        + '<span class="c-range"><span class="t">' + rangeTxt + "</span>" + rbar + "</span></div>";
    }).join("");
    var csvLabel = HOST === "artifact" ? "CSV 복사" : "CSV 내려받기";
    document.getElementById("rank-body").innerHTML =
      '<div class="toolbar"><span><b class="mono">' + rows.length + '</b>개 원고 · 열 제목을 누르면 정렬됩니다</span><div class="right">'
      + (c.filtered ? '<span class="warn">학회를 걸렀습니다 · 순위·백분위를 남은 원고로 다시 매김</span>' : "")
      + (st && st.live ? '<span class="warn">사용자 가중치 · 순위 범위는 브라우저에서 1,500회 계산</span>' : "")
      + '<button type="button" class="btn csv" data-act="csv">' + csvLabel + "</button></div></div>"
      + '<div class="tbl"><div class="tbl-scroll"><div class="tgrid tgroup"><span>심사 기준 5항목 · 항목 점수 0–1</span></div><div class="tgrid thead">' + thead + "</div>" + body
      + (rows.length ? "" : '<p class="empty">검색어와 맞는 원고가 없습니다.</p>') + "</div></div>"
      + '<div class="notes"><span class="note">심사 점수 = 100 × Σ 항목 가중치 × 항목 점수. 기본(5항목 균등)은 다섯 항목 점수의 평균×100이고, 항목 점수는 세부 요소 점수의 평균입니다.</span>'
      + '<span class="note">1·2위는 왼쪽 띠로 강조합니다. 같은 점수는 같은 순위(=)입니다. 백분위 = (N − R + 0.5) ÷ N × 100 · N은 범주의 원고 수, R은 순위입니다.</span>'
      + '<span class="note">순위 범위 = 항목 가중치와 세부 요소 점수(±' + MC.noise + ")를 흔든 " + MC.runs.toLocaleString() + "회 재계산에서 순위의 P10–P90입니다. 학회를 거르면 표시하지 않습니다.</span>"
      + '<span class="note">v3까지 쓰던 엑셀 6개 변수·노트북 사전함수 순위는 <a href="' + V3_URL + '">v3 동결본</a>에 남아 있습니다.</span></div>';
    lastRows = rows; lastCtx = c;
  }
  var lastRows = [], lastCtx = null;
  function exportCsv() {
    var c = lastCtx || rankContext(), m = c.m, st = c.stab;
    var head = ["순위", "ID", "저자", "원고", "학회", "심사 점수", "사분위", "백분위"].concat(KEYS.map(function (k) { return FULL[k]; })).concat(["P10", "P50", "P90"]);
    var lines = [head].concat(lastRows.map(function (r) {
      var s = st ? st.data[r.stabKey] : null;
      return [r.rank, r.id, r.who, r.title, r.venue, f1(r.score), "Q" + r.qn, f1(r.pctl)].concat(KEYS.map(function (k) { return f3(r.x[k]); })).concat(s ? [s.p10, s.p50, s.p90] : ["", "", ""]);
    }));
    var csv = lines.map(function (row) { return row.map(function (v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\r\n");
    var name = "caumil-v4-rank-" + c.cat + "-" + m.preset + ".csv";
    function copy() {
      var done = function () { toast("CSV를 클립보드에 복사했습니다"); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(csv).then(done, function () { toast("복사하지 못했습니다"); });
      else toast("이 환경에서는 복사할 수 없습니다");
    }
    if (HOST === "artifact") { copy(); return; }
    try {
      var blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
      var url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      toast(name + " 내려받기");
    } catch (e) { copy(); }
  }

  // ------------------------------------------------------------------ 범주 개요
  var DMIN = 40, DMAX = 90;  // 범주 개요 분포 축(심사 점수 대부분이 40–80 사이)
  function dx(v) { return (Math.min(DMAX, Math.max(DMIN, v)) - DMIN) / (DMAX - DMIN) * 100; }
  function groupRow(label, sub, indent, link, ranked) {
    var n = ranked.length;
    var vals = ranked.map(function (r) { return r.score; });
    var q1 = ranked.filter(function (r) { return r.qn === 1; });
    var top = ranked[0], second = ranked[1];
    var who2 = function (r) { return r.paper.track === "team" ? shortWho(r.paper) : r.who; };
    var med = median(vals);
    var means = KEYS.map(function (k) { var v = ranked.reduce(function (s, r) { return s + r.x[k]; }, 0) / (n || 1); return '<span class="mean" title="' + esc(FULL[k]) + " 평균 " + f2(v) + '" style="background:' + heat(v) + '">' + f2(v) + "</span>"; }).join("");
    var nNew = ranked.filter(function (r) { return r.isNew; }).length, nUpd = ranked.filter(function (r) { return r.isUpd; }).length;
    var dots = ranked.map(function (r) { return '<span class="dot" title="' + esc(r.id) + " " + f1(r.score) + '" style="left:' + f1(dx(r.score)) + '%"></span>'; }).join("");
    return '<div class="cgrid crow' + (indent ? " sub-row" : "") + '"><span class="lab' + (indent ? " ind" : "") + '"><a class="' + (indent ? "sm" : "big") + '" href="' + link + '">' + esc(label) + '</a><span class="sub">' + esc(sub) + "</span></span>"
      + '<span class="num">' + n + "</span>"
      + '<span class="num">' + (isNaN(med) ? "—" : f1(med)) + "</span>"
      + '<span class="num">' + (q1.length ? f1(Math.min.apply(null, q1.map(function (r) { return r.score; }))) : "—") + "</span>"
      + '<span class="dist-cell"><span class="dist"><span class="ax"></span>' + (isNaN(med) ? "" : '<span class="med" title="중앙값 ' + f1(med) + '" style="left:' + f1(dx(med)) + '%"></span>') + dots + (top ? '<span class="toplab" style="left:' + f1(dx(top.score)) + '%">' + esc(top.id) + "</span>" : "") + "</span></span>"
      + '<span class="topc">' + (top ? '<span><span class="r">' + top.rank + "</span>" + esc(top.id) + " · " + esc(who2(top)) + ' <span class="f">' + f1(top.score) + "점</span></span>" : "—") + (second ? '<span><span class="r">' + second.rank + "</span>" + esc(second.id) + " · " + esc(who2(second)) + ' <span class="f">' + f1(second.score) + "점</span></span>" : "") + "</span>"
      + means + '<span class="st">' + (nNew || nUpd ? nNew + " · " + nUpd : "–") + "</span></div>";
  }
  function renderCategories() {
    var m = state.model;
    setTitle("범주 개요");
    var rows = [];
    ["personal", "team"].forEach(function (track) {
      var all = rankItems(items(track, m), m);
      rows.push(groupRow(CAT_LABEL[track], "전체", false, "#rank-" + track, all));
      VENUE_ORDER.forEach(function (v) {
        var sub = all.filter(function (r) { return r.venueKey === v; });
        if (sub.length) rows.push(groupRow(VENUE[v], CAT_LABEL[track], true, "#rank-" + track + "-" + v, rankItems(sub, m)));
      });
      if (track === "personal") rows.push(groupRow("사람별 대표작", "한 사람당 가장 높은 원고 1편", false, "#rank-people", rankItems(items("people", m), m)));
    });
    main.innerHTML = pageHead("<span>범주 개요</span>", "범주 개요", "범주마다 원고 수, 심사 점수 분포, 다섯 항목 점수의 평균을 비교합니다. " + esc(modelLabel(m)) + " 가중치 기준입니다.")
      + '<div class="inner cat-wrap"><div class="tbl"><div class="tbl-scroll">'
      + '<div class="cgrid chead"><span style="padding-left:16px">범주</span><span style="text-align:right">원고</span><span style="text-align:right">중앙값</span><span style="text-align:right">Q1 경계</span>'
      + '<span class="dist"><span>심사 점수 분포</span><span class="ax"><span>' + DMIN + "</span><span>" + ((DMIN + DMAX) / 2) + "</span><span>" + DMAX + "</span></span></span><span>상위 2편</span>"
      + '<span class="means"><span class="t">항목 점수 평균 · 0–1</span><span class="k">' + KEYS.map(function (k) { return '<span title="' + esc(FULL[k]) + '">' + TINY[k] + "</span>"; }).join("") + "</span></span>"
      + '<span style="text-align:right;padding-right:12px">신규 · 수정</span></div>' + rows.join("") + "</div></div>"
      + '<div class="notes"><span class="note">심사 점수 분포의 점은 원고 한 편, 검은 눈금은 중앙값입니다(축 ' + DMIN + '–' + DMAX + '점, 범위 밖은 양 끝에 붙임). 상위 2편은 1·2위 원고입니다. 범주 이름을 누르면 해당 순위표로 갑니다.</span>'
      + '<span class="note">Q1 경계는 Q1에 든 원고 가운데 가장 낮은 심사 점수입니다. 원고가 2편 이하인 범주는 백분위 정의상 Q1이 생기지 않습니다.</span></div></div>';
  }

  // ------------------------------------------------------------------ 지표 산출
  function rubricDefs() {
    var list = CRIT.map(function (c) {
      return "<dt>" + esc(c.label) + "</dt><dd>" + c.sub.map(function (x) { var a = x.anchors || {}; return "<b>" + esc(x.label) + "</b> — 0 " + esc(a["0"] || "") + " · 0.5 " + esc(a["0.5"] || "") + " · 1 " + esc(a["1"] || ""); }).join("<br />") + "</dd>";
    }).join("");
    return '<section class="card"><div class="card-b"><h2>세부 요소와 채점 기준</h2><p class="note" style="font-size:13px">' + esc(RUB.note || "") + '</p><dl class="rdefs">' + list + "</dl></div></section>";
  }
  function renderMethod() {
    setTitle("지표 산출");
    var pe = PRESETS[DEFAULT].weights, ps = (PRESETS.subEqual || PRESETS[DEFAULT]).weights;
    var vrows = CRIT.map(function (c) {
      return '<div class="vgrid"><span><span style="font-weight:600">' + esc(c.label) + '</span><span class="key">세부 요소 ' + c.sub.length + '개</span></span><span class="anch">' + c.sub.map(function (x) { return esc(x.label); }).join(" · ") + '</span><span class="r" style="font-weight:600">' + f3(pe[c.key]) + '</span><span class="r muted">' + f3(ps[c.key]) + "</span></div>";
    }).join("");
    var left = '<div class="col">'
      + '<section class="card"><div class="card-b" style="gap:14px"><h2>계산식</h2><div class="formula"><span>세부 요소</span><span>= 0–1, 0.05 단위 (원고 텍스트 근거만)</span><span>항목 점수</span><span>= 세부 요소 점수의 평균</span><span>심사 점수</span><span>= 100 × Σ wₖ · 항목 점수ₖ   (Σ wₖ = 1)</span><span>기본</span><span>= wₖ = 0.2 → 다섯 항목 평균 × 100</span></div>'
      + '<p class="note" style="font-size:13px">순위는 심사 점수 내림차순이며, 소수 여섯째 자리까지 같으면 같은 순위입니다. v3까지 쓰던 경진대회 엑셀 6개 변수와 가중치 노트북의 사전함수는 v4 순위에 쓰지 않습니다(<a href="' + V3_URL + '">v3 동결본</a>).</p></div></section>'
      + '<section class="card"><div class="card-h"><h2>항목과 가중치</h2><span>경진대회 심사 기준 5항목</span></div>'
      + '<div class="vgrid h"><span>항목</span><span>세부 요소</span><span class="r">' + esc(PRESETS[DEFAULT].short) + '</span><span class="r">' + esc((PRESETS.subEqual || PRESETS[DEFAULT]).short) + "</span></div>" + vrows
      + '<div class="vgrid f"><span>합</span><span></span><span class="r">' + f3(KEYS.reduce(function (s, k) { return s + pe[k]; }, 0)) + '</span><span class="r muted" style="font-weight:400">' + f3(KEYS.reduce(function (s, k) { return s + ps[k]; }, 0)) + "</span></div></section>"
      + '<section class="card"><div class="card-b"><h2>지표 정의</h2><dl class="defs">'
      + "<dt>심사 점수</dt><dd>항목 점수의 가중 평균×100(0–100). 기본 가중치에서는 원고 평가 파일의 심사 점수(rubric.total)와 같습니다.</dd>"
      + "<dt>항목 점수</dt><dd>세부 요소 점수의 평균(0–1)입니다. 세부 요소가 2개인 혁신성·구현 가능성·도전성은 세부 요소 하나의 무게가 더 큽니다.</dd>"
      + "<dt>순위</dt><dd>범주 안에서 심사 점수 내림차순입니다. 같은 점수는 같은 순위(=)로 표시하고, 다음 순위는 그만큼 건너뜁니다.</dd>"
      + "<dt>백분위</dt><dd>(N − R + 0.5) ÷ N × 100. N은 범주의 원고 수, R은 순위입니다.</dd>"
      + "<dt>사분위</dt><dd>백분위 75 초과 Q1, 50 초과 Q2, 25 초과 Q3, 나머지 Q4입니다.</dd>"
      + "<dt>순위 범위</dt><dd>항목 가중치를 Dirichlet(α = " + MC.alpha + "·w)로, 모든 세부 요소 점수를 −" + MC.noise + "·0·+" + MC.noise + " 중 하나로 흔들어 " + MC.runs.toLocaleString() + "번 다시 매겼을 때 순위의 P10–P90입니다(시드 " + MC.seed + ").</dd>"
      + "<dt>1위 확률</dt><dd>같은 " + MC.runs.toLocaleString() + "번 가운데 1위를 지킨 비율입니다.</dd>"
      + "<dt>사람별 대표작</dt><dd>한 사람이 여러 편을 냈으면 현재 가중치에서 가장 높은 개인논문 한 편으로 비교합니다.</dd>"
      + "<dt>제외</dt><dd>제출 폴더 안 '" + esc(EXCL) + "' 하위 폴더의 원고 " + (D.meta.counts.excluded || 0) + "편은 v4 순위에 넣지 않습니다.</dd></dl></div></section>"
      + rubricDefs()
      + '<section class="card"><div class="card-b"><h2>원천 자료</h2><dl class="defs">'
      + "<dt>원고</dt><dd>공유 드라이브 제출 폴더 4곳의 " + D.meta.counts.total + "편(개인 " + D.meta.counts.personal + " · 팀 " + D.meta.counts.team + "), " + esc(basisText()) + " 동기화</dd>"
      + "<dt>채점</dt><dd>hwp·hwpx·docx 본문과 수식만 읽고 세부 요소마다 0.05 단위로 채점했습니다. 그림은 근거에 넣지 않았습니다. 원고마다 평가자 1명이 공통 척도 지침으로 매기고, 전 원고를 한 표에 놓고 척도를 맞췄습니다.</dd>"
      + "<dt>리스크</dt><dd>중복게재 위험·블라인드 위반·템플릿 잔재 같은 투고 전 문제는 점수에 넣지 않고 따로 기록합니다.</dd>"
      + '<dt>이전 버전</dt><dd><a href="' + V3_URL + '">v3</a>는 경진대회 엑셀 6개 변수와 가중치 노트북 사전함수로 순위를 매긴 2026-10-02 동결본입니다.</dd></dl></div></section></div>';
    var sliders = KEYS.map(function (k) { return '<div class="slider"><label for="s-' + k + '">' + esc(FULL[k]) + '</label><input id="s-' + k + '" type="range" min="0" max="50" step="0.5" data-w="' + k + '" /><output id="o-' + k + '" for="s-' + k + '"></output></div>'; }).join("");
    var right = '<div class="col"><section class="card" aria-label="가중치 실험"><div class="card-b" style="gap:14px">'
      + '<div class="lab-top"><h2>가중치 실험</h2><div class="seg" role="group" aria-label="범주" id="lab-cats"></div></div>'
      + '<div class="preset-grid" role="group" aria-label="가중치 묶음" id="lab-presets"></div>'
      + '<div class="sliders">' + sliders + "</div>"
      + '<div class="formula-line" id="lab-formula"></div>'
      + '<div class="lab-foot"><span id="lab-moved"></span><button type="button" class="btn" data-act="lab-reset">기본값으로</button></div>'
      + '<div style="border:1px solid var(--rule);border-radius:6px;overflow:hidden" id="lab-rows"></div></div></section>'
      + '<section class="card curve" aria-label="항목 점수 분포"><div class="card-b" style="gap:10px"><div><h2>항목 점수 분포</h2><span class="sub">현재 범주 원고의 항목 점수 · 진한 점은 현재 가중치의 1·2위</span></div><div id="lab-strip"></div>'
      + '<div class="legend"><span><i style="background:rgba(var(--accent-rgb),0.35)"></i>원고</span><span><i style="background:var(--accent)"></i>1·2위</span><span>세로 눈금은 범주 중앙값</span></div></div></section></div>';
    main.innerHTML = pageHead("<span>지표 산출</span>", "지표 산출 방법", "심사 점수·백분위·사분위·순위 범위를 계산하는 방법입니다. 오른쪽에서 항목 가중치를 바꾸면 순위가 바로 다시 계산됩니다.")
      + '<div class="inner method-layout">' + left + right + "</div>";
    updateLab(true);
  }
  function updateLab(setSliders) {
    if (!document.getElementById("lab-rows")) return;
    var m = state.model, cat = state.labCat, raw = state.raw;
    var tot = KEYS.reduce(function (s, k) { return s + raw[k]; }, 0) || 1;
    document.getElementById("lab-cats").innerHTML = [["personal", "개인논문"], ["team", "팀논문"]].map(function (c) { return '<button type="button" data-act="lab-cat" data-cat="' + c[0] + '" aria-pressed="' + (c[0] === cat) + '">' + c[1] + "</button>"; }).join("");
    document.getElementById("lab-presets").innerHTML = PRESET_ORDER.map(function (k) { return '<button type="button" class="preset-btn" data-act="lab-preset" data-preset="' + k + '" aria-pressed="' + (m.preset === k) + '" title="' + esc(PRESETS[k].desc || "") + '">' + esc(PRESETS[k].label) + "</button>"; }).join("");
    KEYS.forEach(function (k) {
      var input = document.getElementById("s-" + k);
      if (setSliders || document.activeElement !== input) input.value = String(raw[k]);
      document.getElementById("o-" + k).textContent = f1(100 * raw[k] / tot) + "%";
    });
    document.getElementById("lab-formula").textContent = "심사 점수 = 100 × (" + KEYS.map(function (k) { return f3(m.w[k] || 0) + "·" + TINY[k]; }).join(" + ") + ")";
    var ranked = rankItems(items(cat, m), m);
    var base = (R.ranks && R.ranks[DEFAULT] && R.ranks[DEFAULT][cat]) || {};
    var moved = 0;
    var rows = ranked.map(function (r) {
      var d = (base[r.id] || r.rank) - r.rank; if (d !== 0) moved += 1;
      return '<div class="lgrid' + (r.rank <= 2 ? " top2" : "") + '"><span class="mono" style="font-weight:600">' + r.rank + tieMark(r) + '</span><span class="id"><span class="mono">' + esc(r.id) + "</span> " + esc(shortWho(r.paper)) + '</span><span class="m"><span class="bar"><i style="width:' + Math.max(1, Math.round(r.score)) + '%"></i></span><span class="v">' + f1(r.score) + '</span></span><span class="d ' + (d > 0 ? "up" : d < 0 ? "down" : "muted") + '">' + (d > 0 ? "▲" + d : d < 0 ? "▼" + (-d) : "–") + "</span></div>";
    }).join("");
    document.getElementById("lab-rows").innerHTML = '<div class="lgrid h"><span>순위</span><span>원고</span><span style="text-align:right">심사 점수</span><span style="text-align:right">기본 대비</span></div>' + rows;
    var mv = document.getElementById("lab-moved");
    mv.textContent = moved ? "기본 가중치와 비교해 순위가 바뀐 원고 " + moved + "편" : "기본 가중치와 순위가 같습니다";
    mv.className = moved ? "hwc" : "muted";
    document.getElementById("lab-strip").innerHTML = stripSvg(ranked);
  }
  function stripSvg(ranked) {
    var Wd = 560, L = 120, Rr = 544, row = 40, T = 10, Hd = T + row * KEYS.length + 26;
    var X = function (v) { return L + Math.min(1, Math.max(0, v)) * (Rr - L); };
    var grid = [0, 0.25, 0.5, 0.75, 1].map(function (t) { return '<line x1="' + X(t).toFixed(1) + '" x2="' + X(t).toFixed(1) + '" y1="' + T + '" y2="' + (T + row * KEYS.length) + '" stroke="var(--rule)" /><text x="' + X(t).toFixed(1) + '" y="' + (T + row * KEYS.length + 18) + '" text-anchor="middle" font-size="11" fill="var(--muted)">' + t.toFixed(2) + "</text>"; }).join("");
    var rowsSvg = KEYS.map(function (k, i) {
      var y = T + row * i + row / 2;
      var med = median(ranked.map(function (r) { return r.x[k]; }));
      var dots = ranked.map(function (r) {
        var hi = r.rank <= 2;
        return '<circle cx="' + X(r.x[k]).toFixed(1) + '" cy="' + y + '" r="' + (hi ? 6 : 5) + '" fill="' + (hi ? "var(--accent)" : "rgba(var(--accent-rgb),0.35)") + '" stroke="var(--surface)" stroke-width="1.2"><title>' + esc(r.id) + " · " + esc(FULL[k]) + " " + f2(r.x[k]) + "</title></circle>";
      }).join("");
      return '<text x="0" y="' + (y + 4) + '" font-size="12" fill="var(--ink)" style="font-family:var(--font-body)">' + esc(FULL[k]) + "</text>"
        + '<line x1="' + L + '" x2="' + Rr + '" y1="' + y + '" y2="' + y + '" stroke="var(--rule-2)" />'
        + (isNaN(med) ? "" : '<line x1="' + X(med).toFixed(1) + '" x2="' + X(med).toFixed(1) + '" y1="' + (y - 10) + '" y2="' + (y + 10) + '" stroke="var(--ink)" stroke-width="2" />') + dots;
    }).join("");
    return '<svg viewBox="0 0 ' + Wd + " " + Hd + '" role="img" aria-label="현재 범주 원고의 다섯 항목 점수 분포">' + grid + rowsSvg + "</svg>";
  }

  // ------------------------------------------------------------------ 원고 프로필
  function rubricCard(p, m, score) {
    var rb = p.rubric || {};
    var desk = CRIT.map(function (c) {
      var r = rb[c.key] || { sub: {}, why: "" }, v = critOf(p)[c.key];
      var chips = c.sub.map(function (x) { var sv = r.sub ? r.sub[x.key] : null; return '<span class="subchip">' + esc(x.label) + "<b>" + (sv == null ? "–" : f2(sv)) + "</b></span>"; }).join("");
      return '<div class="rgrid"><span style="font-weight:600">' + esc(c.label) + '<span class="key" style="display:block;font-family:var(--font-mono);font-size:11px;color:var(--muted);font-weight:400">가중치 ' + f3(m.w[c.key] || 0) + '</span></span><span class="sc"><span class="mono">' + f2(v) + '</span><span class="bar"><i style="width:' + (v * 100) + '%"></i></span></span><span class="subchips">' + chips + '</span><span class="why">' + esc(r.why || "") + "</span></div>";
    }).join("");
    var mob = CRIT.map(function (c, i) {
      var r = rb[c.key] || { sub: {}, why: "" }, v = critOf(p)[c.key];
      var chips = c.sub.map(function (x) { var sv = r.sub ? r.sub[x.key] : null; return '<span class="subchip">' + esc(x.label) + "<b>" + (sv == null ? "–" : f2(sv)) + "</b></span>"; }).join("");
      return "<details" + (i === 0 ? " open" : "") + '><summary><span class="lbl"><span>' + esc(c.label) + '</span><span class="bar"><i style="width:' + (v * 100) + '%"></i></span></span><span class="r">' + f2(v) + '</span><span></span><svg class="chev" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style="color:var(--muted)"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg></summary><div class="subchips" style="padding:0 16px 8px">' + chips + '</div><p class="why">' + esc(r.why || "") + "</p></details>";
    }).join("");
    return '<section class="card"><div class="card-h"><h2>' + esc(RUB.title || "심사 기준 5항목") + '</h2><span>세부 요소 0–1 · 0.05 단위 · 항목 점수는 세부 요소 평균</span></div>'
      + '<div class="crit-desk"><div class="rgrid h"><span>항목</span><span>항목 점수</span><span>세부 요소</span><span>근거</span></div>' + desk + "</div>"
      + '<div class="crit-mob">' + mob + "</div>"
      + '<div class="rgrid f"><span>심사 점수</span><span class="mono">' + f1(score) + ' / 100</span><span class="muted" style="font-weight:400;font-size:12px">' + esc(modelLabel(m)) + " 가중치" + (rb.evaluatedAt ? " · 평가 " + esc(rb.evaluatedAt) : "") + "</span><span></span></div></section>";
  }
  function catRows(p, m) {
    var rows = [], track = p.track;
    function row(name, ranked) { var me = null; ranked.forEach(function (r) { if (r.id === p.id) me = r; }); if (me) rows.push({ name: name, rank: me.rank, tie: me.tie, n: ranked.length, pctl: me.pctl, qn: me.qn }); }
    var all = rankItems(items(track, m), m);
    row(trackLabel(p) + " 전체", all);
    row((VENUE[p.venue] || p.venueName) + " · " + trackLabel(p), rankItems(all.filter(function (r) { return r.venueKey === p.venue; }), m));
    if (track === "personal") { var pe = rankItems(items("people", m), m); pe.forEach(function (r) { if (r.id === p.id) rows.push({ name: "사람별 대표작", rank: r.rank, tie: r.tie, n: pe.length, pctl: r.pctl, qn: r.qn }); }); }
    return { rows: rows, all: all };
  }
  function renderProfile() {
    var p = BY_ID[state.pid]; if (!p) { location.hash = "rank"; return; }
    var m = state.model;
    setTitle(p.id + " " + shortWho(p));
    var cr = catRows(p, m), all = cr.all, me = null, idx = 0;
    all.forEach(function (r, i) { if (r.id === p.id) { me = r; idx = i; } });
    var N = all.length;
    var st = stabilityFor(p.track, all, m, false), s = st.data[p.id] || null;
    var x = critOf(p), score = scoreOf(x, m.w);
    var best = KEYS.slice().sort(function (a, b) { return (x[b] - x[a]) || (KEYS.indexOf(a) - KEYS.indexOf(b)); })[0];
    var prev = all[idx - 1], next = all[idx + 1];
    var chips = '<span class="chip">' + esc(VENUE[p.venue] || p.venueName) + '</span><span class="chip">' + esc(trackLabel(p)) + "</span>"
      + (p.team && p.track === "team" ? '<span class="chip muted">' + esc(p.team) + "</span>" : "")
      + (p.status === "new" ? '<span class="chip on">신규</span>' : "") + (p.status === "updated" ? '<span class="chip upd">수정</span>' : "");
    var head = '<section class="prof-head"><div class="inner">'
      + '<div class="prof-top"><nav class="crumbs" aria-label="현재 위치"><a href="#rank-' + p.track + '">순위 탐색</a><span aria-hidden="true">/</span><span>' + esc(trackLabel(p)) + '</span><span aria-hidden="true">/</span><span class="mono">' + esc(p.id) + "</span></nav>"
      + '<div class="prof-nav"><button type="button" class="btn" data-act="pick" data-pid="' + (prev ? esc(prev.id) : "") + '"' + (prev ? "" : " disabled") + ">← " + (prev ? "<span>" + prev.rank + "위 </span>" + esc(prev.id) : "이전 순위 없음") + '</button><button type="button" class="btn" data-act="pick" data-pid="' + (next ? esc(next.id) : "") + '"' + (next ? "" : " disabled") + ">" + (next ? "<span>" + next.rank + "위 </span>" + esc(next.id) : "다음 순위 없음") + " →</button></div></div>"
      + '<div class="chips">' + chips + "</div>"
      + '<h1 class="prof-title">' + esc(p.paperTitle || p.file.title) + "</h1>"
      + (p.paperTitleEn ? '<p class="prof-en">' + esc(p.paperTitleEn) + "</p>" : "")
      + '<div class="prof-who"><span style="font-weight:600">' + esc(whoOf(p)) + '</span><span class="muted">업로드 ' + esc(kst(p.file.createdTime)) + " · 평가 " + esc((p.rubric && p.rubric.evaluatedAt) || p.evaluatedAt || "") + '</span><a class="back" href="#rank-' + p.track + '">순위표로 돌아가기</a></div></div></section>';
    var kpis = '<section class="inner kpis" aria-label="핵심 지표">'
      + '<div class="kpi"><span class="l">심사 점수</span><span class="v">' + f1(score) + '<small class="mu"> / 100</small></span><span class="s">' + esc(modelLabel(m)) + " · 항목 점수의 가중 평균×100</span></div>"
      + '<div class="kpi"><span class="l">순위</span><span class="v">' + me.rank + (me.tie ? '<small class="mu">=</small>' : "") + '<small class="mu"> / ' + N + '</small></span><span class="s">' + esc(trackLabel(p)) + " 전체" + (me.tie ? " · 같은 점수 공동 순위" : "") + "</span></div>"
      + '<div class="kpi"><span class="l">백분위</span><span class="v">' + f1(me.pctl) + '</span><span class="s">(N − R + 0.5) ÷ N × 100</span></div>'
      + '<div class="kpi"><span class="l">사분위</span>' + qChip(me.qn) + '<span class="s">' + Q_NOTE[me.qn] + "</span></div>"
      + '<div class="kpi"><span class="l">1위 확률 · 2위 안</span><span class="v">' + (s ? pct(s.p1) : "—") + '<small class="mu"> · ' + (s && s.top2 != null ? pct(s.top2) : "—") + '</small></span><span class="s">' + (st.live ? "브라우저 1,500회" : MC.runs.toLocaleString() + "회") + " 재계산 중 1위 · 2위 안 비율</span></div>"
      + '<div class="kpi"><span class="l">가장 높은 항목</span><span class="v txt">' + esc(FULL[best]) + ' <span class="mono" style="font-size:15px">' + f2(x[best]) + '</span></span><span class="s">항목 점수 0–1</span></div></section>';
    var catsHtml = cr.rows.map(function (r) { return '<div class="pgrid"><span>' + esc(r.name) + '</span><span class="r">' + r.rank + (r.tie ? "=" : "") + " / " + r.n + '</span><span class="r pc">' + f1(r.pctl) + '</span><span class="c">' + qChip(r.qn) + "</span></div>"; }).join("");
    var lv = levers(p, m).slice(0, 3), maxd = Math.max(0.0001, lv[0] ? lv[0].delta : 0);
    var leversHtml = lv.map(function (l) { return '<div class="lever"><span class="t"><span>' + esc(TINY[l.c]) + " · " + esc(SUBLABEL[l.c + "." + l.s]) + " " + f2(l.from) + "→" + f2(l.to) + '</span><span class="d">+' + f2(l.delta) + '점</span></span><span class="bar"><i style="width:' + (100 * l.delta / maxd) + '%"></i></span></div>'; }).join("");
    var rangeHtml = s ? '<div class="range"><span class="ax"></span><span class="band" style="left:' + f1(N > 1 ? (s.p10 - 1) / (N - 1) * 100 : 0) + "%;width:" + f1(N > 1 ? Math.max(3, (s.p90 - s.p10) / (N - 1) * 100) : 100) + '%"></span><span class="mid" style="left:' + f1(N > 1 ? (s.p50 - 1) / (N - 1) * 100 : 0) + '%"></span></div><div class="range-ax"><span>1위</span><span>' + N + "위</span></div>"
      + '<dl class="kv"><dt>순위 범위 P10–P90</dt><dd>' + (s.p10 === s.p90 ? s.p10 + "위" : s.p10 + "–" + s.p90 + "위") + "</dd><dt>중앙 순위</dt><dd>" + s.p50 + "위</dd><dt>1위 확률</dt><dd>" + pct(s.p1) + "</dd><dt>2위 안 확률</dt><dd>" + (s.top2 != null ? pct(s.top2) : "—") + "</dd><dt>3위 안 확률</dt><dd>" + pct(s.top3) + "</dd></dl>" : '<p class="note">안정성 자료가 없습니다.</p>';
    var sameList = all.map(function (r) { return '<button type="button" data-act="pick" data-pid="' + esc(r.id) + '" aria-pressed="' + (r.id === p.id) + '"><span class="r">' + r.rank + tieMark(r) + "</span><span>" + esc(shortWho(r.paper)) + ' <span class="mono muted" style="font-size:11.5px">' + esc(r.id) + '</span></span><span class="f">' + f1(r.score) + "</span></button>"; }).join("");
    var internal = "";
    if (!D.public) {
      var flags = (p.flags || []).slice().sort(function (a, b) { return (a.level === b.level) ? 0 : (a.level === "high" ? -1 : 1); });
      var lint = (D.lint || {})[p.id];
      internal = '<section class="card"><div class="card-h"><h2>투고 전 확인</h2><span>내부용 · 점수에는 넣지 않은 리스크</span></div><div class="card-b">'
        + (flags.length ? '<ul class="flags">' + flags.map(function (f) { return '<li><span class="badge ' + (f.level === "high" ? "b-high" : "b-mid") + '">' + (f.level === "high" ? "높음" : "중간") + "</span><span>" + esc(f.text) + "</span></li>"; }).join("") + "</ul>" : '<p class="note">기록된 리스크 없음</p>')
        + (p.overlap ? '<p class="note" style="font-size:12.5px"><b>다른 원고와의 관계</b> ' + esc(p.overlap) + "</p>" : "")
        + (lint ? '<div class="autochk">' + ["참고문헌 " + lint.refs + "편", "그림 " + lint.figures + " · 표 " + lint.tables].concat(lint.residue.map(function (r) { return r.label + " ×" + r.count; })).map(function (t, i) { return '<span class="chip' + (i > 1 ? " upd" : "") + '">' + esc(t) + "</span>"; }).join("") + "</div>" : "")
        + (p.file.viewUrl ? '<a href="' + esc(p.file.viewUrl) + '" target="_blank" rel="noopener noreferrer" style="font-size:12.5px">원문 열기 ↗</a>' : "")
        + '<p class="note">텍스트 ' + esc(p.textSha || "") + " · 파일 " + esc(p.file.title) + "</p></div></section>";
    }
    var body = '<div class="inner prof-layout"><div class="col">'
      + '<section class="card"><div class="card-h"><h2>범주별 순위</h2></div><div class="pgrid h"><span>범주</span><span class="r">순위</span><span class="r pc">백분위</span><span class="c">사분위</span></div>' + catsHtml + "</section>"
      + rubricCard(p, m, score)
      + '<section class="card"><div class="card-b"><h2>평가 요약</h2><p class="txt">' + esc(p.summary) + '</p><div><span class="sub" style="font-weight:600">강점</span><p class="txt">' + esc(p.strengths) + "</p></div></div></section>"
      + '<section class="card"><div class="card-b two"><div style="display:flex;flex-direction:column;gap:10px"><h2>보완 우선순위</h2><ol class="fixes">' + (p.fixes || []).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + '</ol></div><div style="display:flex;flex-direction:column;gap:10px"><h2>대표 결과</h2><div class="nums">' + (p.keyNumbers || []).map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div></div></div></section>"
      + '</div><aside class="col">'
      + '<section class="card"><div class="card-b"><h2>순위 안정성</h2>' + rangeHtml + '<p class="note">항목 가중치를 현재값 주변에서 흔들고 모든 세부 요소를 ±' + MC.noise + " 바꿔 " + (st.live ? "1,500" : MC.runs.toLocaleString()) + "번 다시 매긴 분포입니다.</p></div></section>"
      + '<section class="card"><div class="card-b" style="gap:10px"><div><h2>다음 0.05, 어디에</h2><span class="sub">세부 요소 하나를 0.05 올렸을 때 심사 점수 변화</span></div>' + leversHtml + "</div></section>"
      + internal
      + '<section class="card same-list"><div class="card-h"><h2>같은 범주 원고</h2><span>' + esc(trackLabel(p)) + " · " + esc(modelLabel(m)) + "</span></div>" + sameList + "</section>"
      + "</aside></div>";
    main.innerHTML = head + kpis + body;
  }

  // ------------------------------------------------------------------ router
  function parseHash() {
    var h = (location.hash || "").replace(/^#\/?/, "");
    if (!h || h === "rank") return { page: "rank" };
    if (BY_ID[h]) return { page: "paper", pid: h };
    if (h === "categories" || h === "method") return { page: h };
    var mm = /^rank-(personal|people|team)(?:-(ee|it|dt))?$/.exec(h);
    if (mm) return { page: "rank", cat: mm[1], venue: mm[2] || null };
    return { page: "rank" };
  }
  var lastPage = null;
  function route() {
    var r = parseHash();
    state.page = r.page;
    if (r.page === "rank") {
      if (r.cat) {
        state.cat = r.cat; state.off = {}; state.sortKey = "rank"; state.sortDir = 1;
        if (r.venue) VENUE_ORDER.forEach(function (v) { if (v !== r.venue) state.off[v] = true; });
        try { localStorage.setItem("caumil.v4.cat", r.cat); } catch (e) { /* 무시 */ }
      }
      renderRank();
    } else if (r.page === "categories") renderCategories();
    else if (r.page === "method") renderMethod();
    else { state.pid = r.pid; renderProfile(); }
    setNav(r.page === "paper" ? "rank" : r.page);
    var pageKey = r.page + ":" + (r.pid || r.cat || "");
    if (lastPage !== null && pageKey !== lastPage) window.scrollTo(0, 0);
    lastPage = pageKey;
  }

  // ------------------------------------------------------------------ events
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act]");
    if (!el) return;
    var act = el.getAttribute("data-act");
    if (act === "cat") { var k = el.getAttribute("data-cat"); if (location.hash === "#rank-" + k) { state.off = {}; state.sortKey = "rank"; state.sortDir = 1; renderRank(); } else location.hash = "rank-" + k; }
    else if (act === "sort") { var key = el.getAttribute("data-key"), d0 = Number(el.getAttribute("data-d0")); state.sortDir = key === state.sortKey ? -state.sortDir : d0; state.sortKey = key; renderRankBody(); }
    else if (act === "csv") exportCsv();
    else if (act === "pick") { var pid = el.getAttribute("data-pid"); if (pid) location.hash = pid; }
    else if (act === "lab-cat") { state.labCat = el.getAttribute("data-cat"); updateLab(false); }
    else if (act === "lab-preset") { state.model = presetModel(el.getAttribute("data-preset")); state.raw = rawFromModel(state.model); updateLab(true); }
    else if (act === "lab-reset") { state.model = presetModel(DEFAULT); state.raw = rawFromModel(state.model); updateLab(true); }
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.matches("input[data-venue]")) { var v = t.getAttribute("data-venue"); if (t.checked) delete state.off[v]; else state.off[v] = true; renderRank(); }
    else if (t.matches("input[data-preset]")) { state.model = presetModel(t.getAttribute("data-preset")); state.raw = rawFromModel(state.model); renderRank(); }
  });
  var qTimer = null;
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.matches("input[data-w]")) {
      var k = t.getAttribute("data-w"), val = parseFloat(t.value);
      state.raw[k] = isNaN(val) ? 0 : val;
      state.model = modelFromRaw(state.raw);
      clearTimeout(qTimer); qTimer = setTimeout(function () { updateLab(false); }, 40);
      return;
    }
    if (t.id === "q" || t.id === "q-m") {
      state.q = t.value;
      var other = document.getElementById(t.id === "q" ? "q-m" : "q");
      if (other && other.value !== t.value) other.value = t.value;
      clearTimeout(qTimer);
      qTimer = setTimeout(function () {
        if (state.page !== "rank") { location.hash = "rank"; return; }
        renderRankBody();
      }, 80);
    }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.target.id === "q" || e.target.id === "q-m") && state.page !== "rank") location.hash = "rank"; });
  window.addEventListener("hashchange", route);

  // ------------------------------------------------------------------ boot
  document.getElementById("foot-meta").textContent = footerText();
  var vc = document.getElementById("ver-cur"); if (vc) vc.textContent = "v4 · " + String(D.meta.basisDate || "").slice(0, 7).replace("-", ".");
  var q0 = document.getElementById("q"); if (q0) q0.value = state.q;
  route();
})();
