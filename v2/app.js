/* CAUMIL Paper Rank — data/data.js(window.RANK_DATA)를 읽어 순위표·가중치 실험·계획서 비교를 그린다.
   점수 계산식은 pipeline/score.py와 같다(노트북 experience_prior_probability의 닫힌식). */
(() => {
  "use strict";

  const D = window.RANK_DATA;
  const $ = (sel) => document.querySelector(sel);
  if (!D) {
    const board = $("#board");
    if (board) board.innerHTML = '<li class="row"><div class="row-main">data/data.js를 불러오지 못했습니다. pipeline/build.py를 실행하세요.</div></li>';
    return;
  }

  // ------------------------------------------------------------------ constants
  const KEYS = D.criteria.map((c) => c.key);
  const LABEL = Object.fromEntries(D.criteria.map((c) => [c.key, c.label]));
  const TINY = { sota: "SOTA", orig: "독창", hwUse: "유용", hwFit: "결합", stability: "안정", delivery: "발표" };
  const SHORT = { sota: "SOTA", orig: "독창성", hwUse: "HW유용", hwFit: "HW결합", stability: "안정성", delivery: "발표력" };
  const MID = { sota: "SOTA 실험", orig: "독창성", hwUse: "HW 유용성", hwFit: "HW 결합도", stability: "시연 안정성", delivery: "발표 전달력" };
  const HW = new Set(["hwUse", "hwFit"]);
  const W = D.weights;
  const LOGI = W.logistic;
  const SYN = W.synergies;
  const PAPERS = D.papers;
  const BY_ID = Object.fromEntries(PAPERS.map((p) => [p.id, p]));
  const PROJECTS = Object.fromEntries(D.projects.map((p) => [p.id, p]));
  const R = D.results;
  const VENUE = { ee: "전자공학회 특별호", it: "정보기술학회", dt: "국방기술학회" };
  const DEFAULT = { w: { ...W.presets[W.default].weights }, syn: !!W.presets[W.default].synergy, preset: W.default };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const f1 = (v) => Number(v).toFixed(1);
  const f2 = (v) => Number(v).toFixed(2);
  const pct = (v) => `${Math.round(v * 1000) / 10}%`;
  const kst = (iso) => {
    if (!iso) return "";
    const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  };

  // ------------------------------------------------------------------ state
  const state = {
    preset: W.default,
    weights: { ...DEFAULT.w },
    synergy: DEFAULT.syn,
    view: "papers",
    venue: "all",
    open: new Set(),
  };
  try {
    const v = localStorage.getItem("paperrank.view");
    if (v === "papers" || v === "people") state.view = v;
  } catch (e) { /* 저장소를 쓸 수 없는 환경 */ }

  // ------------------------------------------------------------------ scoring (score.py와 동일)
  function latent(x, w, syn) {
    let s = 0;
    for (const k of KEYS) s += (w[k] || 0) * x[k];
    if (syn) for (const sy of SYN) s += sy.coef * x[sy.a] * x[sy.b];
    return s;
  }
  function latentMax(w, syn) {
    return latent(Object.fromEntries(KEYS.map((k) => [k, 1])), w, syn);
  }
  function fitOf(lat) {
    return 100 / (1 + Math.exp(-LOGI.slope * (lat - LOGI.center)));
  }
  function current() {
    return { w: state.weights, syn: state.synergy, preset: state.preset };
  }
  function isDefault(m) {
    return m.preset === W.default;
  }
  function evaluate(scores, m) {
    const lat = latent(scores, m.w, m.syn);
    return { lat, fit: fitOf(lat), score: (100 * lat) / latentMax(m.w, m.syn) };
  }
  function rankRows(items, m) {
    const rows = items.map((it) => ({ it, ...evaluate(it.scores, m) }));
    rows.sort((a, b) => b.lat - a.lat || (a.it.id < b.it.id ? -1 : 1));
    rows.forEach((r, i) => { r.rank = i + 1; });
    return rows;
  }
  function peopleItems(m) {
    const groups = new Map();
    for (const p of PAPERS.filter((q) => q.track === "personal")) {
      const a = p.authors[0];
      if (!groups.has(a)) groups.set(a, []);
      groups.get(a).push(p);
    }
    return [...groups].map(([name, list]) => {
      const best = list.reduce((b, p) => (latent(p.scores, m.w, m.syn) > latent(b.scores, m.w, m.syn) ? p : b));
      return { id: name, name, scores: best.scores, paper: best, papers: list };
    });
  }
  const useFit = (m) => !!m.syn; // 로지스틱 적합도는 노트북형(상호작용 포함) 모델에서만 의미가 있다

  // ------------------------------------------------------------------ Monte Carlo (브라우저 계산용)
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rnd) {
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function gammaSample(rnd, a) {
    if (a < 1) return gammaSample(rnd, a + 1) * Math.pow(rnd(), 1 / a);
    const d = a - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v;
      do { x = gauss(rnd); v = 1 + c * x; } while (v <= 0);
      v = v * v * v;
      const u = rnd();
      if (u < 1 - 0.0331 * x ** 4) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }
  function monteCarlo(items, m, runs = 1500) {
    const rnd = mulberry32(R.mc.seed);
    const alpha = R.mc.alpha;
    const tot = KEYS.reduce((s, k) => s + (m.w[k] || 0), 0) || 1;
    const ranks = Object.fromEntries(items.map((it) => [it.id, []]));
    const steps = [-0.05, 0, 0.05];
    for (let r = 0; r < runs; r++) {
      const g = KEYS.map((k) => ((m.w[k] || 0) > 0 ? gammaSample(rnd, (alpha * m.w[k]) / tot) : 0));
      const gs = g.reduce((s, v) => s + v, 0) || 1;
      const w = Object.fromEntries(KEYS.map((k, j) => [k, (g[j] / gs) * tot]));
      const vals = items.map((it) => {
        const x = {};
        for (const k of KEYS) x[k] = Math.min(1, Math.max(0, it.scores[k] + steps[Math.floor(rnd() * 3)]));
        return [latent(x, w, m.syn), it.id];
      });
      vals.sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? -1 : 1));
      vals.forEach(([, id], i) => ranks[id].push(i + 1));
    }
    const out = {};
    for (const [id, rs] of Object.entries(ranks)) {
      rs.sort((a, b) => a - b);
      const q = (p) => rs[Math.min(rs.length - 1, Math.max(0, Math.round(p * (rs.length - 1))))];
      out[id] = {
        p1: rs.filter((v) => v === 1).length / rs.length,
        top3: rs.filter((v) => v <= 3).length / rs.length,
        p10: q(0.1), p50: q(0.5), p90: q(0.9),
      };
    }
    return out;
  }
  function stabilityFor(group, items, m, filtered = false) {
    const pre = R.stability[m.preset];
    if (!filtered && pre && pre[group]) return { data: pre[group], live: false };
    return { data: monteCarlo(items, m), live: true };
  }

  function levers(scores, m) {
    const base = evaluate(scores, m);
    const metric = useFit(m) ? "fit" : "score";
    return KEYS.map((k) => {
      if (scores[k] >= 1) return { key: k, from: scores[k], to: scores[k], delta: 0 };
      const y = { ...scores, [k]: Math.min(1, Math.round((scores[k] + 0.05) * 100) / 100) };
      return { key: k, from: scores[k], to: y[k], delta: evaluate(y, m)[metric] - base[metric] };
    }).sort((a, b) => b.delta - a.delta);
  }

  // ------------------------------------------------------------------ small renderers
  const chevron = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function venueChip(v) {
    return `<span class="chip venue-${esc(v)}">${esc(VENUE[v] || v)}</span>`;
  }
  function statusChip(p) {
    if (p.status === "new") return '<span class="chip new">신규</span>';
    if (p.status === "updated") return '<span class="chip updated">수정됨</span>';
    return "";
  }
  function riskChip(p) {
    const hi = (p.flags || []).filter((f) => f.level === "high").length;
    return hi ? `<span class="chip high" title="심각도 높은 리스크">리스크 ${hi}</span>` : "";
  }
  function strip(scores) {
    const bars = KEYS.map((k) => `<span class="bar${HW.has(k) ? " hw" : ""}" title="${esc(LABEL[k])} ${f2(scores[k])}"><i style="height:${Math.max(4, scores[k] * 100)}%"></i></span>`).join("");
    const labels = KEYS.map((k) => `<span${HW.has(k) ? ' class="hw"' : ""}>${TINY[k]}</span>`).join("");
    const aria = KEYS.map((k) => `${LABEL[k]} ${f2(scores[k])}`).join(", ");
    return `<div class="strip-box" role="img" aria-label="6개 변수: ${esc(aria)}"><div class="strip">${bars}</div><div class="strip-labels" aria-hidden="true">${labels}</div></div>`;
  }
  function metricCell(row, m) {
    const main = useFit(m)
      ? `<div class="val">${f1(row.fit)}<small>%</small></div><div class="lbl">적합도 · 환산 ${f1(row.score)}점</div>`
      : `<div class="val">${f1(row.score)}<small>점</small></div><div class="lbl">환산 점수 (0–100)</div>`;
    const w = useFit(m) ? row.fit : row.score;
    return `<div class="metric">${main}<div class="meter"><i style="width:${Math.max(1, Math.min(100, w))}%"></i></div></div>`;
  }
  function stabCell(s) {
    if (!s) return '<div class="stab"></div>';
    const range = s.p10 === s.p90 ? `${s.p10}위` : `${s.p10}–${s.p90}위`;
    return `<div class="stab">1위 확률 <b>${pct(s.p1)}</b><br />순위 범위 <b>${range}</b></div>`;
  }
  function rankCell(rank, defRank, changed) {
    let mv = "";
    if (changed && defRank && defRank !== rank) {
      const d = defRank - rank;
      mv = d > 0 ? `<small class="up" title="기본 가중치 대비">▲${d}</small>` : `<small class="down" title="기본 가중치 대비">▼${-d}</small>`;
    }
    return `<div class="rank">${rank}${mv}</div>`;
  }

  function detailHtml(p, m, extra = "") {
    const proj = p.projectId ? PROJECTS[p.projectId] : null;
    const planScores = proj && (p.projectMatch === "same" || p.projectMatch === "related") ? proj.scores : null;
    const rowsHtml = KEYS.map((k) => {
      const v = p.scores[k];
      const pv = planScores ? planScores[k] : null;
      const d = pv == null ? "" : v - pv;
      const dcls = d === "" ? "" : d < -0.001 ? "neg" : d > 0.001 ? "pos" : "";
      const dtxt = d === "" ? "–" : Math.abs(d) < 0.001 ? "0" : (d > 0 ? "+" : "−") + f2(Math.abs(d));
      return `<tr><td title="${esc(LABEL[k])}">${esc(MID[k])}</td><td class="n">${f2(v)}<span class="mini-bar"><i style="width:${v * 100}%"></i></span></td>`
        + `<td class="n">${pv == null ? "–" : f2(pv)}</td><td class="n delta ${dcls}">${dtxt}</td><td class="why">${esc(p.rationale[k])}</td></tr>`;
    }).join("");
    const lv = levers(p.scores, m).slice(0, 3);
    const maxd = Math.max(0.0001, ...lv.map((l) => l.delta));
    const unit = useFit(m) ? "%p" : "점";
    const leverHtml = lv.map((l) => `<div class="lever"><span>${esc(MID[l.key])} ${f2(l.from)}→${f2(l.to)}</span><span class="track"><i style="width:${(100 * l.delta) / maxd}%"></i></span><span class="d">+${f2(l.delta)}${unit}</span></div>`).join("");
    const lint = (D.lint || {})[p.id];
    const lintHtml = lint
      ? [`참고문헌 ${lint.refs}편`, `그림 ${lint.figures}·표 ${lint.tables}`, ...lint.residue.map((r) => `${r.label} ×${r.count}`)]
          .map((t, i) => `<span class="chip${i > 1 ? " mid" : ""}">${esc(t)}</span>`).join("")
      : "";
    const flags = (p.flags || []).slice().sort((a, b) => (a.level === b.level ? 0 : a.level === "high" ? -1 : 1));
    const flagHtml = flags.map((f) => `<li><span class="chip ${f.level === "high" ? "high" : "mid"}">${f.level === "high" ? "높음" : "중간"}</span><span>${esc(f.text)}</span></li>`).join("");
    const planLine = proj
      ? `<p class="muted small">계획서 ${esc(p.projectId)} · ${esc(proj.name)}${p.projectMatch === "different" ? " — <b>주제가 달라 사전값을 쓰지 않음</b>" : p.projectMatch === "related" ? " — 관련 과제" : ""}</p>`
      : "";
    return `
      <p class="lede">${esc(p.summary)}</p>
      ${planLine}
      <div class="detail-grid">
        <div>
          <h4>변수별 점수와 근거</h4>
          <div class="table-wrap"><table class="crit-table">
            <thead><tr><th>변수</th><th>원고</th><th>계획서</th><th>변화</th><th>근거</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table></div>
        </div>
        <div class="kv">
          <div><h4>대표 결과</h4><ul class="numbers">${(p.keyNumbers || []).map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>
          <div><h4>다음 0.05, 어디에</h4><div class="levers">${leverHtml}</div></div>
          <div><h4>강점</h4><p class="small">${esc(p.strengths)}</p></div>
        </div>
      </div>
      <div class="detail-grid">
        <div><h4>보완 우선순위</h4><ol class="fixes">${(p.fixes || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div>
        <div><h4>리스크</h4><ul class="flags">${flagHtml || '<li class="muted">기록된 리스크 없음</li>'}</ul></div>
      </div>
      ${p.overlap ? `<div><h4>다른 원고와의 관계</h4><p class="small muted">${esc(p.overlap)}</p></div>` : ""}
      ${p.planDelta ? `<div><h4>계획서 대비</h4><p class="small muted">${esc(p.planDelta)}</p></div>` : ""}
      <div class="autochk" aria-label="자동 점검">${lintHtml}</div>
      ${extra}
      <p class="small muted">평가 ${esc(p.evaluatedAt)} · 파일 ${esc(p.file.title)} · 텍스트 ${esc(p.textSha)}
        ${p.file.viewUrl ? ` · <a class="source-link" href="${esc(p.file.viewUrl)}" target="_blank" rel="noopener noreferrer">원문 열기 ↗</a>` : ""}</p>`;
  }

  function rowHtml(row, m, opts) {
    const { stab, defRank, changed, group } = opts;
    const isPerson = group === "people";
    const p = isPerson ? row.it.paper : row.it;
    const key = `${group}-${row.it.id}`;
    const open = state.open.has(key);
    const title = p.paperTitle || p.file.title;
    const who = isPerson ? row.it.name : p.track === "team" ? `${p.team || ""} ${p.authors.join("·")}` : p.authors.join("·");
    const others = isPerson && row.it.papers.length > 1
      ? `<div class="also">${row.it.papers.filter((q) => q.id !== p.id).map((q) => `<span class="chip more">외 ${esc(q.id)} · ${esc(VENUE[q.venue])}</span>`).join("")}</div>`
      : "";
    return `
      <li class="row${row.rank === 1 ? " lead" : ""}" id="row-${esc(key)}">
        <div class="row-main">
          ${rankCell(row.rank, defRank, changed)}
          <div class="ident">
            <div class="name">${esc(who)} <span class="mono small muted">${esc(p.id)}</span> ${venueChip(p.venue)} ${statusChip(p)} ${riskChip(p)}</div>
            <div class="title">${esc(title)}</div>
            ${others}
          </div>
          ${strip(row.it.scores)}
          ${metricCell(row, m)}
          ${stabCell(stab)}
          <button type="button" class="expand" aria-expanded="${open}" aria-controls="detail-${esc(key)}" data-key="${esc(key)}" aria-label="${esc(who)} 상세 ${open ? "닫기" : "보기"}">${chevron}</button>
        </div>
        <div class="detail" id="detail-${esc(key)}" ${open ? "" : "hidden"}>${open ? detailHtml(p, m) : ""}</div>
      </li>`;
  }

  // ------------------------------------------------------------------ sections
  function renderHero() {
    const personal = PAPERS.filter((p) => p.track === "personal");
    const rows = rankRows(personal, DEFAULT);
    const stab = R.stability[W.default].personal;
    const lead = rows[0];
    const lp = lead.it;
    const c = D.meta.counts;
    $("#hero-eyebrow").textContent = `PERSONAL PAPER RANKING · ${D.meta.basisDate.replace(/-/g, ".")} 기준`;
    $("#hero-summary").innerHTML = `공유 드라이브에 올라온 개인논문 <strong>${c.personal}편</strong>(팀논문 ${c.team}편 별도)을 경진대회 엑셀의 <strong>6개 변수</strong>로 다시 채점하고, 가중치 노트북의 <strong>사전함수</strong>로 순위를 매겼습니다. 계획서가 아니라 원고에 실제로 적힌 실험과 구현만 점수에 넣었습니다.`;
    $("#sync-chips").innerHTML = [
      `<li><span class="dot new"></span>신규 <b>${c.new}</b></li>`,
      `<li><span class="dot updated"></span>수정 <b>${c.updated}</b></li>`,
      `<li><span class="dot"></span>전체 <b>${c.total}</b>편</li>`,
      `<li>드라이브 확인 <b>${esc(kst(D.meta.lastSync))}</b></li>`,
    ].join("");
    const runners = rows.slice(1, 4).map((r) => `<li><span class="r">${r.rank}</span><span>${esc(r.it.authors[0])} <span class="muted small">${esc(r.it.id)}</span></span><span class="v">${f1(r.fit)}%</span></li>`).join("");
    const s = stab[lp.id];
    $("#hero-status").innerHTML = `
      <div class="status-head"><span>CURRENT LEADER</span><span class="live-dot">${esc(W.presets[W.default].label)}</span></div>
      <div class="leader">
        <span class="big">${f1(lead.fit)}<small>%</small></span>
        <span class="who">${esc(lp.authors[0])} · ${esc(lp.id)}</span>
        <span class="what">${esc(lp.paperTitle)}</span>
      </div>
      <p class="status-note">가중치를 기본값 주변에서 흔들고 점수를 ±0.05 바꿔 ${R.mc.runs.toLocaleString()}회 다시 매겼을 때 1위 유지 <b>${pct(s.p1)}</b>. 2위와의 환산 점수 차 ${f1(lead.score - rows[1].score)}점.</p>
      <ol class="runners">${runners}</ol>
      <p class="status-note">적합도(%)는 노트북이 쓰는 경험 기반 점수이며 실제 우승 확률이 아닙니다.</p>`;
  }

  function renderBoard() {
    const m = current();
    const changed = !isDefault(m);
    const group = state.view === "papers" ? "personal" : "people";
    let items;
    if (state.view === "papers") {
      items = PAPERS.filter((p) => p.track === "personal" && (state.venue === "all" || p.venue === state.venue));
    } else {
      items = peopleItems(m);
    }
    const rows = rankRows(items, m);
    const defItems = state.view === "papers" ? items : peopleItems(DEFAULT);
    const defRanks = Object.fromEntries(rankRows(defItems, DEFAULT).map((r) => [r.it.id, r.rank]));
    const st = stabilityFor(group, items, m, state.view === "papers" && state.venue !== "all");
    $("#board").innerHTML = rows.map((r) => rowHtml(r, m, { stab: st.data[r.it.id], defRank: defRanks[r.it.id], changed, group })).join("");
    const venueTxt = state.venue === "all" ? "" : ` ${VENUE[state.venue]} 안에서의 순위입니다.`;
    $("#ranking-note").textContent = state.view === "papers"
      ? `막대는 6개 변수(청록: 연구 품질, 파랑: HW)입니다. 행을 펼치면 변수별 근거, 계획서 대비 변화, 개선 레버, 리스크가 나옵니다.${venueTxt}${st.live ? " 안정성은 브라우저에서 다시 계산했습니다." : ""}`
      : `한 사람이 여러 편을 냈으면 현재 가중치에서 가장 높은 원고 하나로 비교합니다.${st.live ? " 안정성은 브라우저에서 다시 계산했습니다." : ""}`;
    const pre = W.presets[state.preset];
    $("#model-pill").innerHTML = `가중치 <b>${esc(pre ? pre.label : "사용자 설정")}</b> · 상호작용 ${m.syn ? "포함" : "없음"}${changed ? '<button type="button" id="reset-model">기본값으로</button>' : ""}`;
    $("#venue-filter").disabled = state.view === "people";
    for (const b of document.querySelectorAll(".segmented button")) b.setAttribute("aria-checked", String(b.dataset.view === state.view));
  }

  function renderTeam() {
    const m = current();
    const items = PAPERS.filter((p) => p.track === "team");
    const rows = rankRows(items, m);
    const defRanks = Object.fromEntries(rankRows(items, DEFAULT).map((r) => [r.it.id, r.rank]));
    const st = stabilityFor("team", items, m);
    $("#team-board").innerHTML = rows.map((r) => rowHtml(r, m, { stab: st.data[r.it.id], defRank: defRanks[r.it.id], changed: !isDefault(m), group: "team" })).join("");
    $("#team-note").textContent = `국방기술학회 팀논문 2편과 전자공학회 특별호 팀논문 1편입니다. 같은 6개 변수·가중치로 채점했고, 계획서가 있는 2편(2조 P102, 6조 P106)은 계획서 점수에서 출발했습니다.`;
  }

  function renderLab() {
    const m = current();
    $("#preset-row").innerHTML = Object.entries(W.presets).map(([key, pr]) =>
      `<button type="button" class="preset" role="radio" aria-checked="${state.preset === key}" data-preset="${esc(key)}" title="${esc(pr.note)}">${esc(pr.label)}</button>`).join("")
      + (state.preset === "custom" ? '<button type="button" class="preset" role="radio" aria-checked="true" disabled>사용자 설정</button>' : "");
    const tot = KEYS.reduce((s, k) => s + (m.w[k] || 0), 0) || 1;
    const sl = $("#sliders");
    if (!sl.dataset.built) {
      sl.innerHTML = KEYS.map((k) => `<div class="slider"><label for="w-${k}">${esc(LABEL[k])}</label><input type="range" id="w-${k}" min="0" max="50" step="0.5" data-key="${k}" /><output id="o-${k}" for="w-${k}"></output></div>`).join("");
      sl.dataset.built = "1";
    }
    for (const k of KEYS) {
      const v = (100 * (m.w[k] || 0)) / tot;
      const input = document.getElementById(`w-${k}`);
      if (document.activeElement !== input) input.value = String(Math.round(v * 2) / 2);
      document.getElementById(`o-${k}`).textContent = `${f1(v)}%`;
    }
    $("#synergy-toggle").checked = m.syn;
    $("#synergy-desc").textContent = SYN.map((s) => `${s.coef}×(${s.label})`).join(" + ");
    const pre = W.presets[state.preset];
    $("#lab-foot").textContent = pre
      ? `${pre.note}. 가중치 합 ${f2(KEYS.reduce((s, k) => s + (pre.weights[k] || 0), 0))}.`
      : "사용자 설정: 슬라이더 비율을 합 1로 정규화해 계산합니다.";
    renderCurve(m);
    renderStability(m);
  }

  function renderCurve(m) {
    const Wd = 640, Hd = 300, L = 46, Rr = 18, T = 16, B = 40;
    const x0 = 0, x1 = 1.2;
    const X = (v) => L + ((v - x0) / (x1 - x0)) * (Wd - L - Rr);
    const Y = (v) => T + (1 - v / 100) * (Hd - T - B);
    let path = "";
    for (let i = 0; i <= 120; i++) {
      const v = x0 + ((x1 - x0) * i) / 120;
      path += `${i ? "L" : "M"}${X(v).toFixed(1)},${Y(fitOf(v)).toFixed(1)}`;
    }
    const grid = [0, 25, 50, 75, 100].map((t) => `<line x1="${L}" x2="${Wd - Rr}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)" /><text x="${L - 8}" y="${Y(t) + 4}" text-anchor="end" font-size="11" fill="var(--subtle)">${t}%</text>`).join("");
    const xt = [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2].map((t) => `<text x="${X(t)}" y="${Hd - B + 18}" text-anchor="middle" font-size="11" fill="var(--subtle)">${t.toFixed(1)}</text>`).join("");
    const planDots = D.projects.map((pj) => {
      const e = evaluate(pj.scores, m);
      return `<circle cx="${X(Math.min(x1, e.lat)).toFixed(1)}" cy="${Y(e.fit).toFixed(1)}" r="3" fill="var(--subtle)" opacity="0.45"><title>계획서 ${esc(pj.id)} ${esc(pj.person || pj.team || "")} · ${f1(e.fit)}%</title></circle>`;
    }).join("");
    const pr = rankRows(PAPERS.filter((p) => p.track === "personal"), m);
    const labelIds = new Set([...pr.slice(0, 3).map((r) => r.it.id), pr[pr.length - 1].it.id]);
    const dots = PAPERS.map((p) => {
      const e = evaluate(p.scores, m);
      const cx = X(Math.min(x1, e.lat)), cy = Y(e.fit);
      const team = p.track === "team";
      const lbl = labelIds.has(p.id) ? `<text x="${(cx + 8).toFixed(1)}" y="${(cy - 8).toFixed(1)}" font-size="11" fill="var(--ink)">${esc(p.id)} ${esc(p.authors[0])}</text>` : "";
      return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5.5" fill="${team ? "var(--panel)" : "var(--cyan)"}" stroke="${team ? "var(--blue)" : "var(--panel)"}" stroke-width="2"><title>${esc(p.id)} ${esc(p.authors.join("·"))} · latent ${e.lat.toFixed(3)} · ${f1(e.fit)}%</title></circle>${lbl}`;
    }).join("");
    const cx = X(LOGI.center);
    $("#curve").innerHTML = `<svg viewBox="0 0 ${Wd} ${Hd}" role="img" aria-label="가중합(latent)과 적합도의 관계를 보여 주는 S자 곡선과 원고 위치">
      ${grid}${xt}
      <text x="${(L + Wd - Rr) / 2}" y="${Hd - 6}" text-anchor="middle" font-size="11" fill="var(--muted)">가중합 latent (선형항 + 상호작용)</text>
      <line x1="${cx}" x2="${cx}" y1="${T}" y2="${Hd - B}" stroke="var(--line-strong)" stroke-dasharray="4 4" />
      <text x="${cx + 6}" y="${T + 12}" font-size="11" fill="var(--muted)">중심 ${LOGI.center}</text>
      <path d="${path}" fill="none" stroke="var(--cyan)" stroke-width="2.2" opacity="0.8" />
      ${planDots}${dots}
    </svg>`;
    $("#curve-caption").textContent = `청록 ● 개인논문 · 파랑 ○ 팀논문 · 회색 점 엑셀 계획서 ${D.projects.length}건 · 적합도 = 1/(1+e^(−${LOGI.slope}·(latent−${LOGI.center})))`;
  }

  function renderStability(m) {
    const items = PAPERS.filter((p) => p.track === "personal");
    const rows = rankRows(items, m);
    const st = stabilityFor("personal", items, m);
    const n = items.length;
    const head = "<thead><tr><th>순위</th><th>원고</th><th>1위 확률</th><th>3위 안</th><th>순위 범위 (P10–P90)</th></tr></thead>";
    const body = rows.map((r) => {
      const s = st.data[r.it.id];
      const left = ((s.p10 - 1) / (n - 1)) * 100, right = ((s.p90 - 1) / (n - 1)) * 100, mid = ((s.p50 - 1) / (n - 1)) * 100;
      return `<tr><td class="n">${r.rank}</td><td>${esc(r.it.authors[0])} <span class="mono small muted">${esc(r.it.id)}</span></td><td class="n">${pct(s.p1)}</td><td class="n">${pct(s.top3)}</td>`
        + `<td><span class="range-bar" title="${s.p10}–${s.p90}위, 중앙 ${s.p50}위"><i style="left:${left}%;width:${Math.max(2, right - left)}%"></i><b style="left:${mid}%"></b></span> <span class="mono small">${s.p10 === s.p90 ? s.p10 : `${s.p10}–${s.p90}`}위</span></td></tr>`;
    }).join("");
    $("#stability-table").innerHTML = head + `<tbody>${body}</tbody>`;
    $("#stability-note").textContent = `가중치를 Dirichlet(α=${R.mc.alpha})로 현재값 주변에서 흔들고 모든 점수를 ±${R.mc.noise} 한 칸 무작위로 바꿔 ${st.live ? "1,500회(브라우저 계산)" : `${R.mc.runs.toLocaleString()}회`} 다시 매긴 결과입니다. 막대는 P10–P90 순위 범위, 점은 중앙 순위(왼쪽이 1위)입니다.`;
  }

  function renderPlan() {
    const mapped = PAPERS.filter((p) => p.projectId && (p.projectMatch === "same" || p.projectMatch === "related"));
    const card = (p) => {
      const pj = PROJECTS[p.projectId];
      const Wd = 300, rowH = 22, L = 58, Rr = 44, top = 8, H = top + KEYS.length * rowH + 22;
      const X = (v) => L + v * (Wd - L - Rr);
      const rows = KEYS.map((k, i) => {
        const y = top + i * rowH + 11;
        const a = pj.scores[k], b = p.scores[k], d = b - a;
        return `<text x="0" y="${y + 4}" font-size="11" fill="var(--muted)">${SHORT[k]}</text>
          <line x1="${X(0)}" x2="${X(1)}" y1="${y}" y2="${y}" stroke="var(--line)" />
          <line x1="${X(Math.min(a, b))}" x2="${X(Math.max(a, b))}" y1="${y}" y2="${y}" stroke="${d < 0 ? "var(--amber)" : "var(--cyan)"}" stroke-width="3" opacity="0.55" />
          <circle cx="${X(a)}" cy="${y}" r="4.5" fill="var(--panel)" stroke="var(--subtle)" stroke-width="2"><title>계획서 ${f2(a)}</title></circle>
          <circle cx="${X(b)}" cy="${y}" r="4.5" fill="var(--cyan)"><title>원고 ${f2(b)}</title></circle>
          <text x="${Wd}" y="${y + 4}" text-anchor="end" font-size="11" font-family="var(--font-mono)" fill="${Math.abs(d) < 0.001 ? "var(--subtle)" : d < 0 ? "var(--amber)" : "var(--cyan)"}">${Math.abs(d) < 0.001 ? "0" : (d > 0 ? "+" : "−") + f2(Math.abs(d))}</text>`;
      }).join("");
      const axis = [0, 0.5, 1].map((t) => `<text x="${X(t)}" y="${H - 4}" text-anchor="middle" font-size="10" fill="var(--subtle)">${t}</text>`).join("");
      const fa = evaluate(pj.scores, DEFAULT).fit, fb = evaluate(p.scores, DEFAULT).fit;
      return `<article class="db-card"><h4>${esc(p.id)} · ${esc(p.track === "team" ? `${p.team} 팀` : p.authors[0])} <span class="mono small muted">→ ${esc(p.projectId)}${p.projectMatch === "related" ? " (관련)" : ""}</span></h4>
        <p>적합도 계획 ${f1(fa)}% → 원고 ${f1(fb)}%</p>
        <svg viewBox="0 0 ${Wd} ${H}" role="img" aria-label="${esc(p.id)} 계획서 대비 원고 점수">${rows}${axis}</svg></article>`;
    };
    $("#dumbbells").innerHTML = mapped.map(card).join("");

    const plan = R.plan.personal;
    const personalRows = rankRows(PAPERS.filter((p) => p.track === "personal"), DEFAULT);
    const paperRankByPerson = {};
    for (const r of personalRows) {
      const a = r.it.authors[0];
      if (!(a in paperRankByPerson)) paperRankByPerson[a] = r;
    }
    const ids = Object.keys(plan).sort((a, b) => plan[a].rank - plan[b].rank);
    $("#plan-list").innerHTML = ids.map((id) => {
      const pj = PROJECTS[id];
      const pr = paperRankByPerson[pj.person];
      return `<li class="${pr ? "has" : ""}"><span class="r">${plan[id].rank}</span><span>${esc(pj.person || "")} <span class="mono small muted">${esc(id)}</span>${pr ? `<br /><span class="p">원고 개인 ${pr.rank}위 · ${esc(pr.it.id)}</span>` : ""}</span><span class="v">${f1(plan[id].fit)}%</span></li>`;
    }).join("");
    $("#plan-list-note").textContent = `엑셀 계획서 점수(${ids.length}건)에 같은 사전함수를 적용한 순위입니다. 원고가 있는 사람은 강조했고, 원고 순위는 논문 ${personalRows.length}편 기준입니다. 계획서는 낙관적 잠정치라 원고 점수와 한 표에 섞지 않았습니다.`;
  }

  function renderStatus() {
    const rows = PAPERS.slice().sort((a, b) => String(b.file.createdTime).localeCompare(String(a.file.createdTime)));
    $("#sub-table").innerHTML = "<thead><tr><th>업로드</th><th>상태</th><th>제출처</th><th>저자</th><th>원고</th></tr></thead><tbody>"
      + rows.map((p) => `<tr><td class="n">${esc(kst(p.file.createdTime))}${p.file.modifiedTime && p.status === "updated" ? `<br /><span class="small muted">수정 ${esc(kst(p.file.modifiedTime))}</span>` : ""}</td>
        <td>${statusChip(p) || '<span class="chip">그대로</span>'}</td>
        <td>${venueChip(p.venue)}<br /><span class="small muted">${p.track === "team" ? "팀" : "개인"}</span></td>
        <td>${esc(p.track === "team" ? `${p.team} ${p.authors.join("·")}` : p.authors.join("·"))}</td>
        <td><span class="t">${esc(p.paperTitle)}</span><br /><span class="f">${p.file.viewUrl ? `<a href="${esc(p.file.viewUrl)}" target="_blank" rel="noopener noreferrer">${esc(p.file.title)}</a>` : esc(p.file.title)}</span></td></tr>`).join("")
      + "</tbody>";
    const highs = [];
    for (const p of PAPERS) for (const f of p.flags || []) if (f.level === "high") highs.push({ p, f });
    const mids = PAPERS.reduce((s, p) => s + (p.flags || []).filter((f) => f.level !== "high").length, 0);
    $("#risk-list").innerHTML = highs.map(({ p, f }) => `<li><span class="who">${esc(p.track === "team" ? `${p.team} 팀` : p.authors[0])}<small>${esc(p.id)} · ${esc(VENUE[p.venue])}</small></span><p>${esc(f.text)}</p></li>`).join("");
    const c = D.meta.counts;
    $("#status-note").textContent = `제출 폴더 4곳에서 원고 ${c.total}편을 확인했습니다(신규 ${c.new}, 수정 ${c.updated}). 심각도 높은 리스크 ${highs.length}건을 아래에 모았고, 중간 수준 ${mids}건은 각 원고 상세에 있습니다.`;
  }

  function renderMethod() {
    const nb = W.presets[W.default].weights;
    const terms = KEYS.map((k) => `${f2(nb[k])}·${SHORT[k]}`).join(" + ");
    const syn = SYN.map((s) => `${s.coef}·${SHORT[s.a]}·${SHORT[s.b]}`).join(" + ");
    $("#formula").innerHTML = `latent = ${esc(terms)}<br />&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ ${esc(syn)}<br />적합도 = 100 / (1 + e<sup>−${LOGI.slope}(latent − ${LOGI.center})</sup>)`;
    $("#formula-note").textContent = `출처: ${W.source.file}의 experience_prior_probability(). 노트북의 신경망은 이 함수를 근사(검증 MAE 0.0036)하므로 순위는 닫힌식으로 계산합니다. 로지스틱은 단조 변환이라 순위는 latent만으로 정해집니다.`;
    $("#fix-list").innerHTML = (W.fixes || []).map((t) => `<li>${esc(t)}</li>`).join("");
    const v = W.validation || {};
    $("#validation-note").textContent = v.ok
      ? `이식 확인: 노트북에 저장된 이전 실행(7변수)의 신경망 출력 ${v.notebookNN}%를 닫힌식으로 계산하면 ${v.closedForm}%로, 차이가 1%p 안입니다.`
      : "이식 확인 값을 찾지 못했습니다.";
    $("#anchor-table").innerHTML = "<thead><tr><th>변수</th><th>0</th><th>0.5</th><th>1</th></tr></thead><tbody>"
      + D.criteria.map((c) => `<tr><td>${esc(c.label)}</td><td>${esc(c.anchors["0"])}</td><td>${esc(c.anchors["0.5"])}</td><td>${esc(c.anchors["1"])}</td></tr>`).join("")
      + "</tbody>";
    $("#footer-meta").textContent = `분석 기준 ${D.meta.basisDate} · 원고 ${D.meta.counts.total}편 · 가중치 ${W.source.file} · 입력 ${D.meta.excel}`;
  }

  function renderAll() {
    renderBoard();
    renderTeam();
    renderLab();
  }

  // ------------------------------------------------------------------ events
  function setPreset(key) {
    const pr = W.presets[key];
    if (!pr) return;
    state.preset = key;
    state.weights = { ...pr.weights };
    state.synergy = !!pr.synergy;
    renderAll();
  }
  function setCustomFromSliders() {
    const raw = Object.fromEntries(KEYS.map((k) => [k, Number(document.getElementById(`w-${k}`).value)]));
    const tot = KEYS.reduce((s, k) => s + raw[k], 0);
    if (tot <= 0) return;
    state.preset = "custom";
    state.weights = Object.fromEntries(KEYS.map((k) => [k, raw[k] / tot]));
    renderAll();
  }

  document.addEventListener("click", (e) => {
    const exp = e.target.closest(".expand");
    if (exp) {
      const key = exp.dataset.key;
      const panel = document.getElementById(`detail-${key}`);
      const open = exp.getAttribute("aria-expanded") !== "true";
      exp.setAttribute("aria-expanded", String(open));
      if (open) {
        state.open.add(key);
        const [group, ...rest] = key.split("-");
        const id = rest.join("-");
        const m = current();
        const p = group === "people" ? peopleItems(m).find((x) => x.id === id).paper : BY_ID[id];
        panel.innerHTML = detailHtml(p, m);
        panel.hidden = false;
      } else {
        state.open.delete(key);
        panel.hidden = true;
      }
      return;
    }
    const seg = e.target.closest(".segmented button");
    if (seg) {
      state.view = seg.dataset.view;
      try { localStorage.setItem("paperrank.view", state.view); } catch (err) { /* 무시 */ }
      renderBoard();
      return;
    }
    const pre = e.target.closest(".preset[data-preset]");
    if (pre) { setPreset(pre.dataset.preset); return; }
    if (e.target.id === "reset-model") { setPreset(W.default); }
  });
  $("#venue-filter").addEventListener("change", (e) => { state.venue = e.target.value; renderBoard(); });
  let slideTimer = null;
  $("#sliders").addEventListener("input", () => {
    clearTimeout(slideTimer);
    slideTimer = setTimeout(setCustomFromSliders, 60);
  });
  $("#synergy-toggle").addEventListener("change", (e) => {
    state.synergy = e.target.checked;
    const pr = W.presets[state.preset];
    if (!pr || !!pr.synergy !== state.synergy) state.preset = "custom";
    renderAll();
  });

  function highlightNav() {
    const links = [...document.querySelectorAll(".site-header nav a")];
    if (!("IntersectionObserver" in window)) return;
    const obs = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        for (const a of links) a.setAttribute("aria-current", a.getAttribute("href") === `#${en.target.id}` ? "location" : "false");
      }
    }, { rootMargin: "-35% 0px -55%", threshold: 0 });
    for (const a of links) {
      const sec = document.querySelector(a.getAttribute("href"));
      if (sec) obs.observe(sec);
    }
  }

  // ------------------------------------------------------------------ boot
  renderHero();
  renderAll();
  renderPlan();
  renderStatus();
  renderMethod();
  highlightNav();
  // 해시(#VT 등)로 특정 원고를 바로 펼치기
  const hash = location.hash.replace("#", "");
  if (BY_ID[hash]) {
    const btn = document.querySelector(`.expand[data-key="${BY_ID[hash].track === "team" ? "team" : "personal"}-${hash}"]`);
    if (btn) { btn.click(); btn.scrollIntoView({ block: "center" }); }
  }
})();
