/* CAUMIL 논문 지표 v2 — data/data.js(window.RANK_DATA)를 읽어 순위 탐색·범주 개요·지표 산출·원고 프로필을 그린다.
   점수 계산식은 pipeline/score.py 와 같다(노트북 experience_prior_probability 의 닫힌식).
   화면 구성은 Claude Design 캔버스 'CAUMIL 논문 순위 v2'(9tBbBaMpePcUWcuFiKSsCm)를 따른다. */
(function () {
  "use strict";
  var D = window.RANK_DATA;
  var main = document.getElementById("main");
  if (!D) { main.innerHTML = '<div class="inner"><p class="empty">data/data.js를 불러오지 못했습니다. pipeline/build.py를 실행하세요.</p></div>'; return; }

  // ------------------------------------------------------------------ constants
  var KEYS = D.criteria.map(function (c) { return c.key; });
  var FULL = {}; D.criteria.forEach(function (c) { FULL[c.key] = c.label; });
  var ANCH = {}; D.criteria.forEach(function (c) { ANCH[c.key] = c; });
  var TINY = { sota: "SOTA", orig: "독창", hwUse: "유용", hwFit: "결합", stability: "안정", delivery: "발표" };
  var HW = { hwUse: true, hwFit: true };
  var W = D.weights, LOGI = W.logistic, SYN = W.synergies, R = D.results;
  var PAPERS = D.papers.slice();
  var BY_ID = {}; PAPERS.forEach(function (p) { BY_ID[p.id] = p; });
  var PROJECTS = {}; D.projects.forEach(function (p) { PROJECTS[p.id] = p; });
  var VENUE = { ee: "전자공학회 특별호", it: "정보기술학회", dt: "국방기술학회" };
  var VENUE_ORDER = ["ee", "it", "dt"];
  var CATS = [["personal", "개인논문"], ["people", "사람별 대표작"], ["team", "팀논문"]];
  var CAT_LABEL = {}; CATS.forEach(function (c) { CAT_LABEL[c[0]] = c[1]; });
  var PRESET_ORDER = Object.keys(W.presets);
  var PRESET_SHORT = { notebook: "노트북(정규화)", raw: "노트북 원본", equal: "균등", noHw: "HW 변수 제외" };
  var MC = R.mc || { runs: 4000, alpha: 60, noise: 0.05, seed: 20260923 };
  var Q_NOTE = { 1: "범주 상위 25% 이내", 2: "범주 상위 25–50%", 3: "범주 하위 25–50%", 4: "범주 하위 25%" };
  var HOST = D.meta.host || "pages";
  var V1_URL = "https://caumil-admin.github.io/caumil/v1/";
  var FOOT_NOTE = "원고 점수는 원고 텍스트만 근거로 매긴 0.05 단위 정성 점수이며 공식 심사 결과를 대신하지 않습니다.";

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
  function signed(d, digits, unit) { if (Math.abs(d) < 0.0005) return "0"; return (d > 0 ? "+" : "−") + Number(Math.abs(d)).toFixed(digits) + (unit || ""); }
  function deltaCls(d) { return Math.abs(d) < 0.0005 ? "muted" : d > 0 ? "up" : "down"; }
  var toastTimer = null;
  function toast(msg) { var el = document.getElementById("toast"); if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); } el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, 2600); }

  // ------------------------------------------------------------------ model (score.py와 동일)
  function latent(x, w, syn) { var s = 0; KEYS.forEach(function (k) { s += (w[k] || 0) * x[k]; }); if (syn) SYN.forEach(function (sy) { s += sy.coef * x[sy.a] * x[sy.b]; }); return s; }
  function latentMax(w, syn) { var ones = {}; KEYS.forEach(function (k) { ones[k] = 1; }); return latent(ones, w, syn); }
  function fitOf(lat) { return 100 / (1 + Math.exp(-LOGI.slope * (lat - LOGI.center))); }
  function evaluate(scores, m) { var lat = latent(scores, m.w, m.syn); return { lat: lat, fit: fitOf(lat), score: 100 * lat / latentMax(m.w, m.syn) }; }
  function metricLabel(m) { return m.syn ? "적합도 %" : "환산 점수"; }
  function metricUnit(m) { return m.syn ? "%p" : "점"; }
  function metricOf(e, m) { return m.syn ? e.fit : e.score; }
  function presetModel(key) { var pr = W.presets[key]; return { preset: key, w: Object.assign({}, pr.weights), syn: !!pr.synergy }; }
  function modelLabel(m) { return m.preset === "custom" ? "사용자 설정" : (PRESET_SHORT[m.preset] || W.presets[m.preset].label); }
  function rawFromModel(m) { var r = {}; KEYS.forEach(function (k) { r[k] = Math.round((m.w[k] || 0) * 1000) / 10; }); return r; }
  function modelFromRaw(raw, syn) { var tot = 0; KEYS.forEach(function (k) { tot += raw[k]; }); tot = tot || 1; var w = {}; KEYS.forEach(function (k) { w[k] = raw[k] / tot; }); return { preset: "custom", w: w, syn: syn }; }

  // ------------------------------------------------------------------ state
  var state = { page: "rank", cat: "personal", off: {}, sortKey: "rank", sortDir: 1, q: "", pid: null, model: presetModel(W.default), raw: null, labCat: "personal" };
  state.raw = rawFromModel(state.model);
  try { var sv = localStorage.getItem("caumil.v2.cat"); if (sv && CAT_LABEL[sv]) state.cat = sv; } catch (e) { /* 저장소를 쓸 수 없는 환경 */ }

  // ------------------------------------------------------------------ items & ranking
  function personalPapers() { return PAPERS.filter(function (p) { return p.track === "personal"; }); }
  function teamPapers() { return PAPERS.filter(function (p) { return p.track === "team"; }); }
  function itemOfPaper(p) {
    return { id: p.id, key: p.id, stabKey: p.id, who: whoOf(p), title: p.paperTitle || p.file.title, venueKey: p.venue, venue: VENUE[p.venue] || p.venueName || "", paper: p, scores: p.scores, isNew: p.status === "new", isUpd: p.status === "updated", extra: "" };
  }
  function peopleItems(m) {
    var groups = {}, order = [];
    personalPapers().forEach(function (p) { var a = p.authors[0]; if (!groups[a]) { groups[a] = []; order.push(a); } groups[a].push(p); });
    return order.map(function (name) {
      var list = groups[name], best = list[0];
      list.forEach(function (p) { if (latent(p.scores, m.w, m.syn) > latent(best.scores, m.w, m.syn)) best = p; });
      var it = itemOfPaper(best);
      it.key = "h-" + name; it.stabKey = name; it.who = name; it.papers = list;
      it.extra = list.filter(function (p) { return p.id !== best.id; }).map(function (p) { return p.id; }).join("·");
      return it;
    });
  }
  function items(cat, m) { return cat === "people" ? peopleItems(m) : (cat === "team" ? teamPapers() : personalPapers()).map(itemOfPaper); }
  function rankItems(list, m) {
    var rows = list.map(function (it) { return Object.assign({}, it, evaluate(it.scores, m)); });
    rows.sort(function (a, b) { return (b.lat - a.lat) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0); });
    var n = rows.length;
    rows.forEach(function (r, i) { r.rank = i + 1; r.n = n; r.pctl = percentile(n, r.rank); r.qn = quartile(r.pctl); r.prim = m.syn ? r.fit : r.score; r.sec = m.syn ? r.score : r.fit; });
    return rows;
  }
  function levers(scores, m) {
    var base = evaluate(scores, m), out = [];
    KEYS.forEach(function (k) {
      if (scores[k] >= 1) { out.push({ key: k, from: scores[k], to: scores[k], delta: 0 }); return; }
      var y = Object.assign({}, scores); y[k] = Math.min(1, Math.round((scores[k] + 0.05) * 100) / 100);
      out.push({ key: k, from: scores[k], to: y[k], delta: metricOf(evaluate(y, m), m) - metricOf(base, m) });
    });
    out.sort(function (a, b) { return b.delta - a.delta; });
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
    var rnd = mulberry32(MC.seed), alpha = MC.alpha, tot = 0;
    KEYS.forEach(function (k) { tot += (m.w[k] || 0); }); tot = tot || 1;
    var ranks = {}; list.forEach(function (it) { ranks[it.stabKey] = []; });
    var steps = [-MC.noise, 0, MC.noise];
    for (var r = 0; r < runs; r++) {
      var g = KEYS.map(function (k) { return (m.w[k] || 0) > 0 ? gammaSample(rnd, alpha * m.w[k] / tot) : 0; });
      var gs = g.reduce(function (s, v) { return s + v; }, 0) || 1;
      var w = {}; KEYS.forEach(function (k, j) { w[k] = g[j] / gs * tot; });
      var vals = list.map(function (it) { var x = {}; KEYS.forEach(function (k) { x[k] = Math.min(1, Math.max(0, it.scores[k] + steps[Math.floor(rnd() * 3)])); }); return [latent(x, w, m.syn), it.stabKey]; });
      vals.sort(function (a, b) { return (b[0] - a[0]) || (a[1] < b[1] ? -1 : 1); });
      vals.forEach(function (v, i) { ranks[v[1]].push(i + 1); });
    }
    var out = {};
    Object.keys(ranks).forEach(function (id) {
      var rs = ranks[id].slice().sort(function (a, b) { return a - b; }), n = rs.length;
      var q = function (p) { return rs[Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))))]; };
      out[id] = { p1: rs.filter(function (v) { return v === 1; }).length / n, top3: rs.filter(function (v) { return v <= 3; }).length / n, p10: q(0.1), p50: q(0.5), p90: q(0.9) };
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
  function footerText() { return "CAUMIL 논문 지표 v2 · 데이터 기준 " + basisText() + " · " + FOOT_NOTE; }

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
    var lede = "경진대회 엑셀의 6개 변수로 원고를 채점하고, 가중치 노트북의 사전함수로 적합도를 계산했습니다."
      + '<label class="search m-search" for="q-m"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6"></circle><path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg><input id="q-m" type="search" placeholder="제목·저자·ID 검색" aria-label="원고 검색" autocomplete="off" value="' + esc(state.q) + '" /></label>';
    var head = pageHead("<span>순위 탐색</span><span aria-hidden=\"true\">/</span><span>" + esc(c.catName) + "</span>", esc(c.catName) + " 순위", lede, right, yearOf() + " 제출분");

    var cats = CATS.map(function (cc) { var k = cc[0]; return '<button type="button" class="cat-btn" data-act="cat" data-cat="' + k + '" aria-pressed="' + (k === c.cat) + '"><span>' + esc(cc[1]) + '</span><span class="n">' + items(k, m).length + "</span></button>"; }).join("");
    var venues = c.vkeys.map(function (k) { return '<label class="chk" for="v-' + k + '"><input id="v-' + k + '" type="checkbox" data-venue="' + k + '"' + (state.off[k] ? "" : " checked") + ' /><span class="grow">' + esc(VENUE[k]) + '</span><span class="n">' + c.counts[k] + "</span></label>"; }).join("");
    var presets = PRESET_ORDER.map(function (k) { return '<label class="chk" for="w-' + k + '"><input id="w-' + k + '" type="radio" name="preset" data-preset="' + k + '"' + (m.preset === k ? " checked" : "") + ' /><span>' + esc(PRESET_SHORT[k] || W.presets[k].label) + "</span></label>"; }).join("")
      + (m.preset === "custom" ? '<label class="chk" for="w-custom"><input id="w-custom" type="radio" name="preset" checked disabled /><span>사용자 설정</span></label>' : "");
    var aside = '<aside class="filters" aria-label="필터">'
      + '<fieldset class="cats"><legend>범주</legend>' + cats + "</fieldset>"
      + '<fieldset class="venues"><legend>학회</legend>' + venues + "</fieldset>"
      + '<fieldset class="presets"><legend>가중치</legend>' + presets + '<a href="#method" style="margin-top:6px;font-size:12.5px">가중치를 직접 바꿔 보기 →</a></fieldset>'
      + '<div class="qleg"><span class="lg">사분위</span><div class="qlegend">' + [1, 2, 3, 4].map(function (q) { return qChip(q); }).join("") + '</div><span class="note">범주 안 백분위 75 초과가 Q1, 50 초과 Q2, 25 초과 Q3입니다.</span></div>'
      + "</aside>";
    main.innerHTML = head + '<div class="inner rank-layout">' + aside + '<section class="rank-main" aria-label="순위표" id="rank-body"></section></div>';
    renderRankBody(c);
  }
  function renderRankBody(c) {
    c = c || rankContext();
    var m = c.m, st = c.stab, N = c.N;
    var q = state.q.trim().toLowerCase();
    var shown = q ? c.kept.filter(function (r) { return (r.title + " " + r.who + " " + r.id).toLowerCase().indexOf(q) >= 0; }) : c.kept;
    var key = state.sortKey, dir = state.sortDir;
    function val(r) { var s = st ? st.data[r.stabKey] : null; return key === "rank" ? r.rank : key === "prim" ? r.prim : key === "sec" ? r.sec : key === "q" ? r.qn : key === "pctl" ? r.pctl : key === "range" ? (s ? s.p50 + s.p90 / 100 : r.rank) : r.scores[key]; }
    var rows = shown.slice().sort(function (a, b) { return ((val(a) - val(b)) * dir) || (a.rank - b.rank); });
    var defs = [["rank", "순위", "j-c", 1], ["title", "원고", "j-s", 0], ["prim", metricLabel(m), "j-e", -1], ["sec", m.syn ? "환산" : "적합도 %", "j-e", -1], ["q", "사분위", "j-c", 1], ["pctl", "백분위", "j-e", -1]]
      .concat(KEYS.map(function (k) { return [k, TINY[k], "j-c", -1]; })).concat([["range", "순위 범위", "j-s", 1]]);
    var thead = defs.map(function (d) {
      var k = d[0], on = d[3] !== 0 && k === key;
      return '<button type="button" class="' + d[2] + (on ? " on" : "") + '"' + (d[3] === 0 ? " disabled" : ' data-act="sort" data-key="' + k + '" data-d0="' + d[3] + '"') + ' aria-label="' + esc(d[3] === 0 ? d[1] : d[1] + " 기준 정렬" + (on ? (dir > 0 ? ", 오름차순" : ", 내림차순") : "")) + '"' + (HW[k] ? ' title="' + esc(FULL[k]) + '"' : "") + "><span>" + esc(d[1]) + '</span><span class="arr" aria-hidden="true">' + (on ? (dir > 0 ? "▲" : "▼") : "") + "</span></button>";
    }).join("");
    var body = rows.map(function (r) {
      var s = st ? st.data[r.stabKey] : null;
      var cells = KEYS.map(function (k) { return '<span class="c-var" title="' + esc(FULL[k]) + " " + f2(r.scores[k]) + '" style="background:' + heat(r.scores[k]) + '">' + f2(r.scores[k]) + "</span>"; }).join("");
      var rangeTxt = !s ? "—" : (s.p10 === s.p90 ? s.p10 + "위" : s.p10 + "–" + s.p90 + "위");
      var rbar = s && N > 1 ? '<span class="rbar"><i style="left:' + f1((s.p10 - 1) / (N - 1) * 100) + "%;width:" + f1(Math.max(6, (s.p90 - s.p10) / (N - 1) * 100)) + '%"></i></span>' : "";
      var extra = r.extra ? ' <span class="mono">(' + esc(r.extra) + ")</span>" : "";
      return '<div class="tgrid trow">'
        + '<span class="c-rank">' + r.rank + "</span>"
        + '<span class="c-title"><a href="#' + esc(r.id) + '" class="clamp2">' + esc(r.title) + '</a><span class="who"><b>' + esc(r.who) + '</b><span aria-hidden="true">·</span><span>' + esc(r.venue) + '</span><span class="mono id">' + esc(r.id) + "</span>" + extra + badges(r.paper) + "</span></span>"
        + '<span class="c-prim"><span class="v">' + f1(r.prim) + '</span><span class="bar"><i style="width:' + Math.max(1, Math.round(r.prim)) + '%"></i></span>' + qChip(r.qn, "mq") + "</span>"
        + '<span class="c-sec">' + f1(r.sec) + "</span>"
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
      + '<div class="tbl"><div class="tbl-scroll"><div class="tgrid tgroup"><span>경진대회 6개 변수 · 0–1</span></div><div class="tgrid thead">' + thead + "</div>" + body
      + (rows.length ? "" : '<p class="empty">검색어와 맞는 원고가 없습니다.</p>') + "</div></div>"
      + '<div class="notes"><span class="note">적합도 = 가중치 노트북 사전함수의 경험 기반 점수이며 실제 우승 확률이 아닙니다. 상호작용 항이 없는 가중치(균등, HW 변수 제외)는 환산 점수로 비교합니다.</span>'
      + '<span class="note">백분위 = (N − R + 0.5) ÷ N × 100 · N은 범주의 원고 수, R은 순위입니다.</span>'
      + '<span class="note">순위 범위 = 가중치와 점수를 흔든 ' + MC.runs.toLocaleString() + "회 재계산에서 순위의 P10–P90입니다. 학회를 거르면 표시하지 않습니다.</span></div>";
    lastRows = rows; lastCtx = c;
  }
  var lastRows = [], lastCtx = null;
  function exportCsv() {
    var c = lastCtx || rankContext(), m = c.m, st = c.stab;
    var head = ["순위", "ID", "저자", "원고", "학회", metricLabel(m), m.syn ? "환산 점수" : "적합도 %", "사분위", "백분위"].concat(KEYS.map(function (k) { return FULL[k]; })).concat(["P10", "P50", "P90"]);
    var lines = [head].concat(lastRows.map(function (r) {
      var s = st ? st.data[r.stabKey] : null;
      return [r.rank, r.id, r.who, r.title, r.venue, f1(r.prim), f1(r.sec), "Q" + r.qn, f1(r.pctl)].concat(KEYS.map(function (k) { return f2(r.scores[k]); })).concat(s ? [s.p10, s.p50, s.p90] : ["", "", ""]);
    }));
    var csv = lines.map(function (row) { return row.map(function (v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\r\n");
    var name = "caumil-rank-" + c.cat + "-" + m.preset + ".csv";
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
  function groupRow(label, sub, indent, link, ranked, m) {
    var n = ranked.length;
    var vals = ranked.map(function (r) { return r.prim; });
    var q1 = ranked.filter(function (r) { return r.qn === 1; });
    var top = ranked[0];
    var med = median(vals);
    var means = KEYS.map(function (k) { var v = ranked.reduce(function (s, r) { return s + r.scores[k]; }, 0) / (n || 1); return '<span class="mean" title="' + esc(FULL[k]) + " 평균 " + f2(v) + '" style="background:' + heat(v) + '">' + f2(v) + "</span>"; }).join("");
    var nNew = ranked.filter(function (r) { return r.isNew; }).length, nUpd = ranked.filter(function (r) { return r.isUpd; }).length;
    var dots = ranked.map(function (r) { return '<span class="dot" title="' + esc(r.id) + " " + f1(r.prim) + '" style="left:' + f1(Math.min(100, r.prim)) + '%"></span>'; }).join("");
    return '<div class="cgrid crow' + (indent ? " sub-row" : "") + '"><span class="lab' + (indent ? " ind" : "") + '"><a class="' + (indent ? "sm" : "big") + '" href="' + link + '">' + esc(label) + '</a><span class="sub">' + esc(sub) + "</span></span>"
      + '<span class="num">' + n + "</span>"
      + '<span class="num">' + (isNaN(med) ? "—" : f1(med)) + "</span>"
      + '<span class="num">' + (q1.length ? f1(Math.min.apply(null, q1.map(function (r) { return r.prim; }))) : "—") + "</span>"
      + '<span class="dist-cell"><span class="dist"><span class="ax"></span>' + (isNaN(med) ? "" : '<span class="med" title="중앙값" style="left:' + f1(Math.min(100, med)) + '%"></span>') + dots + (top ? '<span class="top" style="left:' + f1(Math.min(100, top.prim)) + '%">' + esc(top.id) + "</span>" : "") + "</span></span>"
      + '<span class="topc">' + (top ? "<span>" + esc(top.id) + " · " + esc(top.who) + '</span><span class="f">' + f1(top.prim) + (m.syn ? "%" : "점") + "</span>" : "—") + "</span>"
      + means + '<span class="st">' + (nNew || nUpd ? nNew + " · " + nUpd : "–") + "</span></div>";
  }
  function renderCategories() {
    var m = state.model;
    setTitle("범주 개요");
    var rows = [];
    ["personal", "team"].forEach(function (track) {
      var all = rankItems(items(track, m), m);
      rows.push(groupRow(CAT_LABEL[track], "전체", false, "#rank-" + track, all, m));
      VENUE_ORDER.forEach(function (v) {
        var sub = all.filter(function (r) { return r.venueKey === v; });
        if (sub.length) rows.push(groupRow(VENUE[v], CAT_LABEL[track], true, "#rank-" + track + "-" + v, rankItems(sub, m), m));
      });
      if (track === "personal") rows.push(groupRow("사람별 대표작", "한 사람당 가장 높은 원고 1편", false, "#rank-people", rankItems(items("people", m), m), m));
    });
    var ml = metricLabel(m).replace(" %", "");
    main.innerHTML = pageHead("<span>범주 개요</span>", "범주 개요", "범주마다 원고 수, " + esc(ml) + " 분포, 6개 변수의 평균을 비교합니다. " + esc(modelLabel(m)) + " 가중치 기준입니다.")
      + '<div class="inner cat-wrap"><div class="tbl"><div class="tbl-scroll">'
      + '<div class="cgrid chead"><span style="padding-left:16px">범주</span><span style="text-align:right">원고</span><span style="text-align:right">' + esc(ml) + ' 중앙값</span><span style="text-align:right">Q1 경계</span>'
      + '<span class="dist"><span>' + esc(ml) + ' 분포</span><span class="ax"><span>0</span><span>50</span><span>100</span></span></span><span>1위 원고</span>'
      + '<span class="means"><span class="t">6개 변수 평균 · 0–1</span><span class="k">' + KEYS.map(function (k) { return "<span>" + TINY[k] + "</span>"; }).join("") + "</span></span>"
      + '<span style="text-align:right;padding-right:12px">신규 · 수정</span></div>' + rows.join("") + "</div></div>"
      + '<div class="notes"><span class="note">' + esc(ml) + ' 분포의 점은 원고 한 편, 검은 눈금은 중앙값입니다. 범주 이름을 누르면 해당 순위표로 갑니다.</span>'
      + '<span class="note">Q1 경계는 Q1에 든 원고 가운데 가장 낮은 ' + esc(ml) + '입니다. 원고가 2편 이하인 범주는 백분위 정의상 Q1이 생기지 않습니다.</span></div></div>';
  }

  // ------------------------------------------------------------------ 지표 산출
  function renderMethod() {
    setTitle("지표 산출");
    var nb = W.presets[W.default].weights, rawW = (W.presets.raw || W.presets[W.default]).weights;
    var vrows = KEYS.map(function (k) {
      var a = ANCH[k].anchors;
      return '<div class="vgrid"><span><span style="font-weight:600">' + esc(FULL[k]) + '</span><span class="key">' + esc(ANCH[k].excelColumn || "") + '</span></span><span class="anch">0 ' + esc(a["0"]) + " · 0.5 " + esc(a["0.5"]) + " · 1 " + esc(a["1"]) + '</span><span class="r muted">' + f2(rawW[k]) + '</span><span class="r" style="font-weight:600">' + f3(nb[k]) + "</span></div>";
    }).join("");
    var synTxt = SYN.map(function (s) { return f2(s.coef) + "·" + esc(FULL[s.a].replace("프레임워크 ", "").replace("라이브 ", "").replace("-알고리즘", "")) + "·" + esc(FULL[s.b].replace("프레임워크 ", "").replace("라이브 ", "").replace("-알고리즘", "")); }).join(" + ");
    var v = W.validation || {};
    var left = '<div class="col">'
      + '<section class="card"><div class="card-b" style="gap:14px"><h2>계산식</h2><div class="formula"><span>latent</span><span>= Σ wₖ·xₖ + ' + synTxt + "</span><span>적합도</span><span>= 100 ÷ (1 + e^(−" + LOGI.slope + "·(latent − " + LOGI.center + ")))</span><span>환산 점수</span><span>= 100 × latent ÷ latent_max</span></div>"
      + '<p class="note" style="font-size:13px">xₖ는 원고의 6개 변수 점수(0–1, 0.05 단위), wₖ는 가중치입니다. 로지스틱은 단조 변환이라 적합도 순위와 latent 순위가 같습니다. 상호작용 항이 없는 가중치(균등, HW 변수 제외)는 적합도 대신 환산 점수로 비교합니다.</p></div></section>'
      + '<section class="card"><div class="card-h"><h2>변수와 가중치</h2><span>경진대회 엑셀 입력가이드의 채점 기준</span></div>'
      + '<div class="vgrid h"><span>변수</span><span>점수 기준</span><span class="r">노트북 원본</span><span class="r">기본(합 1)</span></div>' + vrows
      + '<div class="vgrid f"><span>합</span><span></span><span class="r muted" style="font-weight:400">' + f2(KEYS.reduce(function (s, k) { return s + rawW[k]; }, 0)) + '</span><span class="r">' + f3(KEYS.reduce(function (s, k) { return s + nb[k]; }, 0)) + "</span></div></section>"
      + '<section class="card"><div class="card-b"><h2>지표 정의</h2><dl class="defs">'
      + "<dt>적합도 %</dt><dd>노트북이 쓰는 경험 기반 우승 적합도입니다. 실제 우승 확률이 아닙니다.</dd>"
      + "<dt>환산 점수</dt><dd>latent를 만점(모든 변수 1일 때) 대비 0–100으로 바꾼 값입니다. 가중치끼리 비교할 때 씁니다.</dd>"
      + "<dt>순위</dt><dd>범주 안에서 latent 내림차순이며, 동점이면 ID 순입니다.</dd>"
      + "<dt>백분위</dt><dd>(N − R + 0.5) ÷ N × 100. N은 범주의 원고 수, R은 순위입니다.</dd>"
      + "<dt>사분위</dt><dd>백분위 75 초과 Q1, 50 초과 Q2, 25 초과 Q3, 나머지 Q4입니다.</dd>"
      + "<dt>순위 범위</dt><dd>가중치를 Dirichlet(α = " + MC.alpha + "·w)로, 모든 점수를 −" + MC.noise + "·0·+" + MC.noise + " 중 하나로 흔들어 " + MC.runs.toLocaleString() + "번 다시 매겼을 때 순위의 P10–P90입니다(시드 " + MC.seed + ").</dd>"
      + "<dt>1위 확률</dt><dd>같은 " + MC.runs.toLocaleString() + "번 가운데 1위를 지킨 비율입니다.</dd>"
      + "<dt>사람별 대표작</dt><dd>한 사람이 여러 편을 냈으면 현재 가중치에서 가장 높은 원고 한 편으로 비교합니다.</dd></dl></div></section>"
      + '<section class="card"><div class="card-b"><h2>원천 자료</h2><dl class="defs">'
      + "<dt>원고</dt><dd>공유 드라이브 제출 폴더 4곳의 " + D.meta.counts.total + "편(개인 " + D.meta.counts.personal + " · 팀 " + D.meta.counts.team + "), " + esc(basisText()) + " 동기화</dd>"
      + "<dt>채점</dt><dd>hwp·hwpx 본문과 수식만 읽고 0.05 단위로 채점했습니다. 그림은 근거에 넣지 않았습니다.</dd>"
      + "<dt>가중치</dt><dd>" + esc(W.source.file) + "의 " + esc(W.source["function"]) + "()</dd>"
      + "<dt>계획서 점수</dt><dd>" + esc(D.meta.excel) + "의 과제 " + D.projects.length + "건. 낙관적 잠정치라 원고 점수와 한 표에 섞지 않습니다.</dd>"
      + "<dt>보정</dt><dd><ul>" + (W.fixes || []).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></dd>"
      + "<dt>검증</dt><dd>" + (v.ok ? "같은 입력에서 노트북 신경망 " + v.notebookNN + "%, 닫힌식 " + v.closedForm + "%로 차이가 1%p 안입니다." : "이식 확인 값을 찾지 못했습니다.") + "</dd></dl></div></section></div>";
    var sliders = KEYS.map(function (k) { return '<div class="slider"><label for="s-' + k + '">' + esc(FULL[k]) + '</label><input id="s-' + k + '" type="range" min="0" max="50" step="0.5" data-w="' + k + '" /><output id="o-' + k + '" for="s-' + k + '"></output></div>'; }).join("");
    var right = '<div class="col"><section class="card" aria-label="가중치 실험"><div class="card-b" style="gap:14px">'
      + '<div class="lab-top"><h2>가중치 실험</h2><div class="seg" role="group" aria-label="범주" id="lab-cats"></div></div>'
      + '<div class="preset-grid" role="group" aria-label="가중치 묶음" id="lab-presets"></div>'
      + '<div class="sliders">' + sliders + "</div>"
      + '<label class="chk" for="lab-syn" style="align-items:flex-start"><input id="lab-syn" type="checkbox" style="margin-top:3px" /><span>상호작용 항 포함 <span class="muted">(' + synTxt + ")</span></span></label>"
      + '<div class="formula-line" id="lab-formula"></div>'
      + '<div class="lab-foot"><span id="lab-moved"></span><button type="button" class="btn" data-act="lab-reset">기본값으로</button></div>'
      + '<div style="border:1px solid var(--rule);border-radius:6px;overflow:hidden" id="lab-rows"></div></div></section>'
      + '<section class="card curve" aria-label="적합도 곡선"><div class="card-b" style="gap:10px"><div><h2>적합도 곡선</h2><span class="sub">가로 latent, 세로 적합도 · 가중치를 바꾸면 점이 곡선을 따라 움직입니다</span></div><div id="lab-curve"></div>'
      + '<div class="legend"><span><i style="background:var(--accent)"></i>원고(현재 범주)</span><span><i style="background:var(--rule-2);width:8px;height:8px"></i>엑셀 계획서</span><span>이름표는 상위 3편</span></div></div></section></div>';
    main.innerHTML = pageHead("<span>지표 산출</span>", "지표 산출 방법", "적합도·환산 점수·백분위·사분위·순위 범위를 계산하는 방법입니다. 오른쪽에서 가중치를 바꾸면 순위가 바로 다시 계산됩니다.")
      + '<div class="inner method-layout">' + left + right + "</div>";
    updateLab(true);
  }
  function updateLab(setSliders) {
    if (!document.getElementById("lab-rows")) return;
    var m = state.model, cat = state.labCat, raw = state.raw;
    var tot = KEYS.reduce(function (s, k) { return s + raw[k]; }, 0) || 1;
    document.getElementById("lab-cats").innerHTML = [["personal", "개인논문"], ["team", "팀논문"]].map(function (c) { return '<button type="button" data-act="lab-cat" data-cat="' + c[0] + '" aria-pressed="' + (c[0] === cat) + '">' + c[1] + "</button>"; }).join("");
    document.getElementById("lab-presets").innerHTML = PRESET_ORDER.map(function (k) { return '<button type="button" class="preset-btn" data-act="lab-preset" data-preset="' + k + '" aria-pressed="' + (m.preset === k) + '">' + esc(PRESET_SHORT[k] || W.presets[k].label) + "</button>"; }).join("");
    KEYS.forEach(function (k) {
      var input = document.getElementById("s-" + k);
      if (setSliders || document.activeElement !== input) input.value = String(raw[k]);
      document.getElementById("o-" + k).textContent = f1(100 * raw[k] / tot) + "%";
    });
    document.getElementById("lab-syn").checked = m.syn;
    document.getElementById("lab-formula").textContent = "latent = " + KEYS.map(function (k) { return f3(m.w[k] || 0) + "·" + TINY[k]; }).join(" + ") + (m.syn ? " + " + SYN.map(function (s) { return f2(s.coef) + "·" + TINY[s.a] + "×" + TINY[s.b]; }).join(" + ") : "");
    var ranked = rankItems(items(cat, m), m);
    var base = (R.ranks && R.ranks[W.default] && R.ranks[W.default][cat]) || {};
    var moved = 0;
    var rows = ranked.map(function (r, i) {
      var d = (base[r.id] || r.rank) - r.rank; if (d !== 0) moved += 1;
      return '<div class="lgrid"><span class="mono" style="font-weight:600">' + r.rank + '</span><span class="id"><span class="mono">' + esc(r.id) + "</span> " + esc(shortWho(r.paper)) + '</span><span class="m"><span class="bar"><i style="width:' + Math.max(1, Math.round(r.prim)) + '%"></i></span><span class="v">' + f1(r.prim) + '</span></span><span class="d ' + (d > 0 ? "up" : d < 0 ? "down" : "muted") + '">' + (d > 0 ? "▲" + d : d < 0 ? "▼" + (-d) : "–") + "</span></div>";
    }).join("");
    document.getElementById("lab-rows").innerHTML = '<div class="lgrid h"><span>순위</span><span>원고</span><span style="text-align:right">' + esc(metricLabel(m)) + '</span><span style="text-align:right">기본 대비</span></div>' + rows;
    var mv = document.getElementById("lab-moved");
    mv.textContent = moved ? "기본 가중치와 비교해 순위가 바뀐 원고 " + moved + "편" : "기본 가중치와 순위가 같습니다";
    mv.className = moved ? "hwc" : "muted";
    document.getElementById("lab-curve").innerHTML = curveSvg(ranked, cat, m);
  }
  function curveSvg(ranked, cat, m) {
    var Wd = 560, Hd = 250, L = 42, Rr = 548, T = 12, B = 214;
    var X = function (l) { return L + Math.min(1.2, Math.max(0, l)) / 1.2 * (Rr - L); };
    var Y = function (f) { return T + (1 - f / 100) * (B - T); };
    var grid = [0, 25, 50, 75, 100].map(function (t) { return '<line x1="' + L + '" x2="' + Rr + '" y1="' + Y(t) + '" y2="' + Y(t) + '" stroke="var(--rule)" /><text x="' + (L - 8) + '" y="' + (Y(t) + 4) + '" text-anchor="end" font-size="11" fill="var(--muted)">' + t + "%</text>"; }).join("");
    var xt = [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2].map(function (t) { return '<text x="' + X(t).toFixed(1) + '" y="' + (B + 18) + '" text-anchor="middle" font-size="11" fill="var(--muted)">' + t.toFixed(1) + "</text>"; }).join("");
    var path = "";
    for (var i = 0; i <= 120; i++) { var l = 1.2 * i / 120; path += (i ? "L" : "M") + X(l).toFixed(1) + "," + Y(fitOf(l)).toFixed(1) + " "; }
    var cx = X(LOGI.center).toFixed(1);
    var plans = D.projects.filter(function (p) { return p.track === cat; }).map(function (p) { var e = evaluate(p.scores, m); return '<circle cx="' + X(e.lat).toFixed(1) + '" cy="' + Y(e.fit).toFixed(1) + '" r="3.5" fill="var(--rule-2)"><title>계획서 ' + esc(p.id) + " " + esc(p.person || p.team || "") + " · " + f1(e.fit) + "%</title></circle>"; }).join("");
    var dots = ranked.map(function (r, i) {
      var x = X(r.lat), y = Y(r.fit);
      return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="5.5" fill="var(--accent)" stroke="var(--surface)" stroke-width="1.5"><title>' + esc(r.id) + " · latent " + f3(r.lat) + " · 적합도 " + f1(r.fit) + "%</title></circle>"
        + (i < 3 ? '<text x="' + (x + 8).toFixed(1) + '" y="' + (y - 8).toFixed(1) + '" font-size="11" font-weight="600" fill="var(--accent)">' + esc(r.id) + "</text>" : "");
    }).join("");
    return '<svg viewBox="0 0 ' + Wd + " " + Hd + '" role="img" aria-label="가중합(latent)과 적합도의 관계를 보여 주는 S자 곡선과 원고 위치">' + grid + xt
      + '<line x1="' + cx + '" x2="' + cx + '" y1="' + T + '" y2="' + B + '" stroke="var(--muted)" stroke-dasharray="4 4" /><text x="' + (Number(cx) + 6) + '" y="' + (T + 12) + '" font-size="11" fill="var(--muted)">중심 ' + LOGI.center + " · 적합도 50%</text>"
      + '<path d="' + path.trim() + '" fill="none" stroke="var(--ink)" stroke-width="2" />' + plans + dots + "</svg>";
  }

  // ------------------------------------------------------------------ 원고 프로필
  function catRows(p, m) {
    var rows = [], track = p.track;
    function row(name, ranked) { var me = null; ranked.forEach(function (r) { if (r.id === p.id) me = r; }); if (me) rows.push({ name: name, rank: me.rank, n: ranked.length, pctl: me.pctl, qn: me.qn }); }
    var all = rankItems(items(track, m), m);
    row(trackLabel(p) + " 전체", all);
    row((VENUE[p.venue] || p.venueName) + " · " + trackLabel(p), rankItems(all.filter(function (r) { return r.venueKey === p.venue; }), m));
    if (track === "personal") { var pe = rankItems(items("people", m), m); pe.forEach(function (r) { if (r.id === p.id) rows.push({ name: "사람별 대표작", rank: r.rank, n: pe.length, pctl: r.pctl, qn: r.qn }); }); }
    return { rows: rows, all: all };
  }
  function renderProfile() {
    var p = BY_ID[state.pid]; if (!p) { location.hash = "rank"; return; }
    var m = state.model;
    setTitle(p.id + " " + shortWho(p));
    var cr = catRows(p, m), all = cr.all, me = null;
    all.forEach(function (r) { if (r.id === p.id) me = r; });
    var N = all.length, idx = me.rank - 1;
    var st = stabilityFor(p.track, all, m, false), s = st.data[p.id] || null;
    var e = evaluate(p.scores, m);
    var proj = p.projectId ? PROJECTS[p.projectId] : null;
    var planOk = !!(proj && (p.projectMatch === "same" || p.projectMatch === "related"));
    var projTxt = proj ? p.projectId + (p.projectMatch === "same" ? " · 계획서와 같은 과제" : p.projectMatch === "related" ? " · 관련 과제" : " · 계획서와 다른 주제") : (p.relatedProject ? p.relatedProject + " · 관련 과제(점수 비교 없음)" : "계획서 없음");
    var prev = all[idx - 1], next = all[idx + 1];
    var chips = '<span class="chip">' + esc(VENUE[p.venue] || p.venueName) + '</span><span class="chip">' + esc(trackLabel(p)) + '</span><span class="chip muted">' + esc(projTxt) + "</span>"
      + (p.status === "new" ? '<span class="chip on">신규</span>' : "") + (p.status === "updated" ? '<span class="chip upd">수정</span>' : "");
    var head = '<section class="prof-head"><div class="inner">'
      + '<div class="prof-top"><nav class="crumbs" aria-label="현재 위치"><a href="#rank-' + p.track + '">순위 탐색</a><span aria-hidden="true">/</span><span>' + esc(trackLabel(p)) + '</span><span aria-hidden="true">/</span><span class="mono">' + esc(p.id) + "</span></nav>"
      + '<div class="prof-nav"><button type="button" class="btn" data-act="pick" data-pid="' + (prev ? esc(prev.id) : "") + '"' + (prev ? "" : " disabled") + ">← " + (prev ? '<span>' + prev.rank + "위 </span>" + esc(prev.id) : "이전 순위 없음") + '</button><button type="button" class="btn" data-act="pick" data-pid="' + (next ? esc(next.id) : "") + '"' + (next ? "" : " disabled") + ">" + (next ? '<span>' + next.rank + "위 </span>" + esc(next.id) : "다음 순위 없음") + " →</button></div></div>"
      + '<div class="chips">' + chips + "</div>"
      + '<h1 class="prof-title">' + esc(p.paperTitle || p.file.title) + "</h1>"
      + (p.paperTitleEn ? '<p class="prof-en">' + esc(p.paperTitleEn) + "</p>" : "")
      + '<div class="prof-who"><span style="font-weight:600">' + esc(whoOf(p)) + '</span><span class="muted">업로드 ' + esc(kst(p.file.createdTime)) + " · 평가 " + esc(p.evaluatedAt || "") + '</span><a class="back" href="#rank-' + p.track + '">순위표로 돌아가기</a></div></div></section>';
    var kpis = '<section class="inner kpis" aria-label="핵심 지표">'
      + '<div class="kpi"><span class="l">적합도</span><span class="v">' + f1(e.fit) + '<small>%</small></span><span class="s">노트북 사전함수 · 실제 확률 아님</span></div>'
      + '<div class="kpi"><span class="l">환산 점수</span><span class="v">' + f1(e.score) + '</span><span class="s">가중합 ÷ 만점 × 100</span></div>'
      + '<div class="kpi"><span class="l">순위</span><span class="v">' + me.rank + '<small class="mu"> / ' + N + '</small></span><span class="s">' + esc(trackLabel(p)) + " 전체</span></div>"
      + '<div class="kpi"><span class="l">백분위</span><span class="v">' + f1(me.pctl) + '</span><span class="s">(N − R + 0.5) ÷ N × 100</span></div>'
      + '<div class="kpi"><span class="l">사분위</span>' + qChip(me.qn) + '<span class="s">' + Q_NOTE[me.qn] + "</span></div>"
      + '<div class="kpi"><span class="l">1위 확률</span><span class="v">' + (s ? pct(s.p1) : "—") + '</span><span class="s">' + (st.live ? "브라우저 1,500회" : MC.runs.toLocaleString() + "회") + " 재계산 중 1위 비율</span></div></section>";
    var catsHtml = cr.rows.map(function (r) { return '<div class="pgrid"><span>' + esc(r.name) + '</span><span class="r">' + r.rank + " / " + r.n + '</span><span class="r pc">' + f1(r.pctl) + '</span><span class="c">' + qChip(r.qn) + "</span></div>"; }).join("");
    var critDesk = KEYS.map(function (k) {
      var v = p.scores[k], pv = planOk ? proj.scores[k] : null, d = pv == null ? null : v - pv;
      return '<div class="cg"><span class="lbl' + (HW[k] ? " hwc" : "") + '">' + esc(FULL[k]) + '</span><span class="sc"><span class="mono">' + f2(v) + '</span><span class="bar"><i style="width:' + (v * 100) + "%;background:" + (HW[k] ? "var(--accent)" : "var(--ink)") + '"></i></span></span><span class="r muted">' + (pv == null ? "–" : f2(pv)) + '</span><span class="r ' + (d == null ? "muted" : deltaCls(d)) + '">' + (d == null ? "–" : signed(d, 2)) + '</span><span class="why">' + esc((p.rationale || {})[k]) + "</span></div>";
    }).join("");
    var critMob = KEYS.map(function (k, i) {
      var v = p.scores[k], pv = planOk ? proj.scores[k] : null, d = pv == null ? null : v - pv;
      return "<details" + (i === 0 ? " open" : "") + '><summary><span class="lbl' + (HW[k] ? " hwc" : "") + '"><span>' + esc(FULL[k]) + '</span><span class="bar"><i style="width:' + (v * 100) + "%;background:" + (HW[k] ? "var(--accent)" : "var(--ink)") + '"></i></span></span><span class="r">' + f2(v) + '</span><span class="r ' + (d == null ? "muted" : deltaCls(d)) + '" style="font-size:12px">' + (d == null ? "–" : signed(d, 2)) + '</span><svg class="chev" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style="color:var(--muted)"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg></summary><p class="why">' + (pv == null ? "" : "계획서 " + f2(pv) + " · ") + esc((p.rationale || {})[k]) + "</p></details>";
    }).join("");
    var lv = levers(p.scores, m).slice(0, 3), maxd = Math.max(0.0001, lv[0] ? lv[0].delta : 0);
    var leversHtml = lv.map(function (l) { return '<div class="lever"><span class="t"><span>' + esc(FULL[l.key]) + " " + f2(l.from) + "→" + f2(l.to) + '</span><span class="d">+' + f2(l.delta) + metricUnit(m) + '</span></span><span class="bar"><i style="width:' + (100 * l.delta / maxd) + '%"></i></span></div>'; }).join("");
    var planHtml;
    if (planOk) {
      var pe = evaluate(proj.scores, m), pm = metricOf(pe, m), mm = metricOf(e, m);
      var tp = D.projects.filter(function (x) { return x.track === proj.track; }).map(function (x) { return { id: x.id, lat: latent(x.scores, m.w, m.syn) }; }).sort(function (a, b) { return (b.lat - a.lat) || (a.id < b.id ? -1 : 1); });
      var prank = 0; tp.forEach(function (x, i) { if (x.id === proj.id) prank = i + 1; });
      planHtml = '<div style="display:flex;flex-direction:column;gap:8px"><div style="display:flex;justify-content:space-between;gap:8px;font-size:12.5px;flex-wrap:wrap"><span>계획 ' + esc(proj.id) + ' <b class="mono">' + f1(pm) + (m.syn ? "%" : "점") + '</b> → 원고 <b class="mono">' + f1(mm) + (m.syn ? "%" : "점") + '</b></span><span class="mono muted">' + signed(mm - pm, 1, metricUnit(m)) + "</span></div>"
        + '<div class="dumb"><span class="ax"></span><span class="ln" style="left:' + f1(Math.min(pm, mm)) + "%;width:" + f1(Math.abs(mm - pm)) + '%"></span><span class="pl" title="계획서" style="left:' + f1(pm) + '%"></span><span class="pa" title="원고" style="left:' + f1(mm) + '%"></span></div>'
        + '<div class="range-ax"><span>0</span><span>계획서 순위 ' + prank + " / " + tp.length + "</span><span>100</span></div></div>";
    } else {
      planHtml = '<p class="note" style="font-size:12.5px">' + (proj ? "계획서와 주제가 달라 점수를 비교하지 않습니다." : "엑셀에 대응하는 계획서가 없는 원고입니다.") + "</p>";
    }
    var rangeHtml = s ? '<div class="range"><span class="ax"></span><span class="band" style="left:' + f1(N > 1 ? (s.p10 - 1) / (N - 1) * 100 : 0) + "%;width:" + f1(N > 1 ? Math.max(3, (s.p90 - s.p10) / (N - 1) * 100) : 100) + '%"></span><span class="mid" style="left:' + f1(N > 1 ? (s.p50 - 1) / (N - 1) * 100 : 0) + '%"></span></div><div class="range-ax"><span>1위</span><span>' + N + "위</span></div>"
      + '<dl class="kv"><dt>순위 범위 P10–P90</dt><dd>' + (s.p10 === s.p90 ? s.p10 + "위" : s.p10 + "–" + s.p90 + "위") + "</dd><dt>중앙 순위</dt><dd>" + s.p50 + "위</dd><dt>1위 확률</dt><dd>" + pct(s.p1) + "</dd><dt>3위 안 확률</dt><dd>" + pct(s.top3) + "</dd></dl>" : '<p class="note">안정성 자료가 없습니다.</p>';
    var sameList = all.map(function (r) { return '<button type="button" data-act="pick" data-pid="' + esc(r.id) + '" aria-pressed="' + (r.id === p.id) + '"><span class="r">' + r.rank + "</span><span>" + esc(shortWho(r.paper)) + ' <span class="mono muted" style="font-size:11.5px">' + esc(r.id) + '</span></span><span class="f">' + f1(r.prim) + (m.syn ? "%" : "") + "</span></button>"; }).join("");
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
      + '<section class="card"><div class="card-h"><h2>지표 구성</h2><span>경진대회 엑셀 6개 변수 · 0–1 · 0.05 단위 · 청색은 HW 변수</span></div>'
      + '<div class="crit-desk"><div class="cg h"><span>변수</span><span>원고 점수</span><span class="r">계획서</span><span class="r">변화</span><span>근거</span></div>' + critDesk + "</div>"
      + '<div class="crit-mob">' + critMob + "</div></section>"
      + '<section class="card"><div class="card-b"><h2>평가 요약</h2><p class="txt">' + esc(p.summary) + '</p><div><span class="sub" style="font-weight:600">강점</span><p class="txt">' + esc(p.strengths) + "</p></div></div></section>"
      + '<section class="card"><div class="card-b two"><div style="display:flex;flex-direction:column;gap:10px"><h2>보완 우선순위</h2><ol class="fixes">' + (p.fixes || []).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + '</ol></div><div style="display:flex;flex-direction:column;gap:10px"><h2>대표 결과</h2><div class="nums">' + (p.keyNumbers || []).map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div></div></div></section>"
      + "</div><aside class=\"col\">"
      + '<section class="card"><div class="card-b"><h2>순위 안정성</h2>' + rangeHtml + '<p class="note">가중치를 현재값 주변에서 흔들고 모든 점수를 ±' + MC.noise + " 바꿔 " + (st.live ? "1,500" : MC.runs.toLocaleString()) + "번 다시 매긴 분포입니다.</p></div></section>"
      + '<section class="card"><div class="card-b" style="gap:10px"><div><h2>다음 0.05, 어디에</h2><span class="sub">변수 하나를 0.05 올렸을 때 ' + esc(metricLabel(m).replace(" %", "")) + " 변화</span></div>" + leversHtml + "</div></section>"
      + '<section class="card"><div class="card-b"><h2>계획서 대비</h2>' + planHtml + (p.planDelta ? '<p class="note" style="font-size:12.5px;line-height:1.7">' + esc(p.planDelta) + "</p>" : "") + "</div></section>"
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
        try { localStorage.setItem("caumil.v2.cat", r.cat); } catch (e) { /* 무시 */ }
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
    else if (act === "lab-reset") { state.model = presetModel(W.default); state.raw = rawFromModel(state.model); updateLab(true); }
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.matches("input[data-venue]")) { var v = t.getAttribute("data-venue"); if (t.checked) delete state.off[v]; else state.off[v] = true; renderRank(); }
    else if (t.matches("input[data-preset]")) { state.model = presetModel(t.getAttribute("data-preset")); state.raw = rawFromModel(state.model); renderRank(); }
    else if (t.id === "lab-syn") { state.model = Object.assign({}, state.model, { syn: t.checked, preset: "custom" }); updateLab(false); }
  });
  var qTimer = null;
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.matches("input[data-w]")) {
      var k = t.getAttribute("data-w"), val = parseFloat(t.value);
      state.raw[k] = isNaN(val) ? 0 : val;
      state.model = modelFromRaw(state.raw, state.model.syn);
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
  var vc = document.getElementById("ver-cur"); if (vc) vc.textContent = "v2 · " + String(D.meta.basisDate || "").slice(0, 7).replace("-", ".");
  var q0 = document.getElementById("q"); if (q0) q0.value = state.q;
  route();
})();
