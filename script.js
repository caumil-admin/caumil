const teamData = [
  { id: "P104", name: "4조 EIII", probability: 20.51 },
  { id: "P101", name: "1조 야호", probability: 19.04 },
  { id: "P107", name: "7조 MSG", probability: 17.83, target: true },
  { id: "P102", name: "2조 김이박", probability: 16.15 },
  { id: "P105", name: "5조 오지", probability: 12.65 },
  { id: "P103", name: "3조 에이스", probability: 7.42 },
  { id: "P106", name: "6조 스파크", probability: 6.40 },
];

const componentData = [
  { label: "7조 P107", weighted: 19.64, prototype: 12.41, final: 17.83 },
  { label: "최석철 P201", weighted: 8.49, prototype: 1.60, final: 6.77 },
];

const auditData = [
  { label: "과거 우승 데이터 정합성", score: 13, max: 20 },
  { label: "실행 재현성", score: 8, max: 20 },
  { label: "통계적 학습 근거", score: 5, max: 25 },
  { label: "모델 설정 안정성", score: 16, max: 20 },
  { label: "확률 보정·외부검증", score: 4, max: 15 },
];

function renderTeamRanking() {
  const root = document.querySelector("#team-ranking");
  if (!root) return;
  const max = Math.max(...teamData.map((team) => team.probability));

  root.innerHTML = teamData
    .map(
      (team) => `
        <div class="bar-row${team.target ? " target" : "}" aria-label="${team.name} ${team.probability.toFixed(2)}퍼센트">
          <span class="label">${team.name}</span>
          <span class="bar-track"><span class="bar-fill" data-width="${(team.probability / max) * 100}%"></span></span>
          <span class="value">${team.probability.toFixed(2)}%</span>
        </div>`,
    )
    .join("");
}

function renderComponents() {
  const root = document.querySelector("#component-chart");
  if (!root) return;
  const headers = ["", "평가기준 75%", "닮은꼴 25%", "최종"];
  const maxScale = 25;

  root.innerHTML = [
    ...headers.map((header) => `<span class="head">${header}</span>`),
    ...componentData.flatMap((row) => [
      `<span class="component-label">${row.label}</span>`,
      componentCell(row.weighted, "weighted", maxScale),
      componentCell(row.prototype, "proto", maxScale),
      componentCell(row.final, "final", maxScale),
    ]),
  ].join("");
}

function componentCell(value, type, maxScale) {
  const width = Math.max(22, (value / maxScale) * 100);
  return `<span class="component-cell ${type}"><span style="--value:${width}%">${value.toFixed(2)}%</span></span>`;
}

function renderAudit() {
  const root = document.querySelector("#audit-breakdown");
  if (!root) return;
  root.innerHTML = auditData
    .map(
      (item) => `
        <div class="audit-item">
          <div class="audit-label"><span>${item.label}</span><strong>${item.score} / ${item.max}</strong></div>
          <div class="audit-track"><i data-width="${(item.score / item.max) * 100}%"></i></div>
        </div>`,
    )
    .join("");
}

function animateBars() {
  const targets = document.querySelectorAll("[data-width]");
  if (!("IntersectionObserver" in window)) {
    targets.forEach((target) => { target.style.width = target.dataset.width; });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.style.width = entry.target.dataset.width;
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.25 },
  );

  targets.forEach((target) => observer.observe(target));
}

function highlightCurrentSection() {
  const links = [...document.querySelectorAll("nav a")];
  const sections = links
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);
  if (!("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((link) => {
          const active = link.getAttribute("href") === `#${entry.target.id}`;
          link.style.color = active ? "var(--cyan)" : "";
          link.setAttribute("aria-current", active ? "location" : "false");
        });
      });
    },
    { rootMargin: "-35% 0px -55%", threshold: 0 },
  );
  sections.forEach((section) => observer.observe(section));
}

renderTeamRanking();
renderComponents();
renderAudit();
requestAnimationFrame(animateBars);
highlightCurrentSection();
