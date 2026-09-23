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
        <div class="bar-row${team.target ? " target" : ""}" aria-label="${team.name} ${team.probability.toFixed(2)}퍼센트">
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

const personData = [
  { id: "P201", name: "최석철", title: "지휘관 화상회의(VTC) 의사소통 신뢰성 보증을 위한 AI 프레임워크: 자동 사전점검, 실시간 명료화, 명령 복창 검증의 통합", hw: "VTC/마이크·스피커", scores: { sota: 0.70, orig: 0.85, hwUse: 0.85, hwFit: 0.90, stability: 0.65, delivery: 0.90 }, desc: "VTC-ASSURE는 회의 전 사전점검→회의 중 음성향상→회의 후 지시·결정 리드백 검증을 통합하며 HW 시연성이 높지만 실시간 음향·ASR 통합 리스크가 있음.", file: "최석철_개인프로젝트계획서_1/2.docx", source: "https://docs.google.com/document/d/10aiGETROxhqU5UmwEhXhY-ubEtjPRexr/edit?usp=drivesdk&ouid=116536920228399378514&rtpof=true&sd=true" },
  { id: "P202", name: "서보윤", title: "군 데이터 제약 환경에서의 TICN 자율복구를 위한 계층적 AI 라우팅 아키텍처 설계", hw: "TICN 유사 3계층 132노드 시뮬레이션", scores: { sota: 0.80, orig: 0.95, hwUse: 0.25, hwFit: 0.20, stability: 0.80, delivery: 0.90 }, desc: "H-ARS는 F1 물리파괴/F2 재밍/F3 트래픽폭주와 Normal·Degraded·Isolated 권한위임, EMCON 비용, 안전 폴백을 결합. 132노드 합성환경에서 REF-A~D와 S1~S5를 비교하며 실제 전술망 HW 검증은 후속 단계.", file: "서보윤_개인프로젝트계획서.hwp", source: "https://drive.google.com/file/d/1eeih6bI70YgafghLqW7BZ-F939LcYdFE/view?usp=drivesdk" },
  { id: "P203", name: "김두환", title: "유전 알고리즘 기반 항적 데이터를 활용한 딥러닝 무인기 충돌회피 기법", hw: "3-DoF 고정익 UAV 수치 시뮬레이션", scores: { sota: 0.85, orig: 0.85, hwUse: 0.45, hwFit: 0.35, stability: 0.85, delivery: 0.90 }, desc: "3-DoF 고정익 UAV에서 GA가 충돌회피 제어 항적을 만들고 MLP가 상태–제어입력을 지도학습. Base/GA-only/DL 및 1,000회 Monte Carlo 비교가 강점이며 실제 비행체 실증은 계획 범위 밖.", file: "김두환_개인프로젝트계획서.hwp", source: "https://drive.google.com/file/d/1uXqzFKRbmjq_WJnRVF3bJfswtu8bAoy8/view?usp=drivesdk" },
  { id: "P204", name: "이건희", title: "초분광 영상의 위장표적 탐지를 위한 어텐션 기반 밴드 셀렉션 기법 연구", hw: "초분광 센서(데이터 중심)", scores: { sota: 0.80, orig: 0.85, hwUse: 0.45, hwFit: 0.35, stability: 0.90, delivery: 0.90 }, desc: "HyperCOD에서 밴드 attention/gating+희소성 제약으로 Top-K 밴드를 선택하고 전체밴드·균등샘플링·분산/엔트로피·분광분리도 기반 방법과 비교. 센서 설계 의미는 크지만 실제 센서 운용은 계획서상 후속 확장.", file: "이건희_개인프로젝트계획서.pdf", source: "https://drive.google.com/file/d/1fseqyOHBb_UYU0sPxTAy1Rx0iVzEwln4/view?usp=drivesdk" },
  { id: "P205", name: "전누리", title: "합동·연합전력 추천을 위한 AI 의사결정지원 모델 연구 - JAIOS(Joint AI Orchestration System)", hw: "가상전장·지휘결심 SW", scores: { sota: 0.90, orig: 0.95, hwUse: 0.25, hwFit: 0.20, stability: 0.80, delivery: 0.95 }, desc: "Target/Force/Sensor/Weapon/Mission/Constraint 온톨로지와 제약기반 추천을 SMACv2·QMIX 가상전장에서 검증. 약 1만 합성 시나리오와 100개 사람/규칙 대응비교, HITL 원칙이 강점.", file: "전누리_개인프로젝트계획서.docx", source: "https://docs.google.com/document/d/1aQ_fe4zI1SYHMiOACcZfCjwUb8rqZd8W/edit?usp=drivesdk&ouid=116536920228399378514&rtpof=true&sd=true" },
  { id: "P206", name: "김민규", title: "경험 지능 기반 업무 절차 진화 시스템 설계 및 구현", hw: "폐쇄망 업무지원 SW", scores: { sota: 0.80, orig: 0.90, hwUse: 0.25, hwFit: 0.20, stability: 0.85, delivery: 0.95 }, desc: "자연어 경험을 상황-조건-판단-행동-결과-교훈으로 구조화하고 RAG로 재활용한 뒤 승인·버전관리된 피드백만 절차 진화에 반영. 지식오염 방지와 HITL 통제가 차별점.", file: "김민규_개인프로젝트계획서.pages", source: "https://drive.google.com/file/d/1koQBw7KtmfZEHrh9ubwFVgs-s4LrwhXU/view?usp=drivesdk" },
  { id: "P207", name: "최석철", title: "UA-SAHI-MAL: 구조 보존형 예산 제한 슬라이싱을 이용한 악성코드 정밀 지역화 및 탐지 효율화 연구", hw: "GPU 보안분석 SW", scores: { sota: 0.85, orig: 0.95, hwUse: 0.25, hwFit: 0.20, stability: 0.90, delivery: 0.95 }, desc: "P201의 1/2 계획서와 다른 두 번째 개인 프로젝트. 악성코드 이미지에서 UA 구조보존 확률지도+recall-guarded Top-K SAHI로 AP와 검출기 호출/latency/VRAM Pareto를 개선하는 연구.", file: "최석철_개인프로젝트계획서_2-2.docx", source: "https://docs.google.com/document/d/1l4NmVMJyPumJHdaeur_0z-950GsPRGox/edit?usp=drivesdk&ouid=116536920228399378514&rtpof=true&sd=true" },
  { id: "P208", name: "김민균", title: "다변량 전력품질 시계열 기반 Transformer를 활용한 전력설비 이상징후 사전 탐지", hw: "전력설비 센서 데이터", scores: { sota: 0.85, orig: 0.75, hwUse: 0.35, hwFit: 0.25, stability: 0.90, delivery: 0.85 }, desc: "AI-Hub 전력설비 데이터에서 전압고조파 단일변량을 전압·전류·유효전력·역률 다변량으로 확장. B0/M1/M2/M3 ablation, 5개 Transformer 계열, MSE/DILATE, 5회 반복 비교.", file: "김민균_개인프로젝트계획서.pdf", source: "https://drive.google.com/file/d/1_uqWVNFy2JJ6-k96ze47XfchElOnZ4xM/view?usp=drivesdk" },
  { id: "P209", name: "남하늘", title: "훈련생 자연어 응답 분석 기반 AI 기반 사이버 훈련 시스템 개발", hw: "로컬 GGUF/llama.cpp 사이버훈련 SW", scores: { sota: 0.65, orig: 0.80, hwUse: 0.20, hwFit: 0.15, stability: 0.85, delivery: 0.85 }, desc: "훈련생 자연어를 AI Evaluator가 해석하고 Rule Validator가 검증한 뒤 MITRE ATT&CK Scenario Graph의 다음 상황을 선택. 로컬 GGUF/llama.cpp 적용을 검토하며 정량 평가는 의도·분기 정확도와 일관성 중심.", file: "남하늘_개인연구프로젝트계획서.hwpx", source: "https://drive.google.com/file/d/1a2sMgwRmYSeSD-0lumUqcsUedIaEBDAq/view?usp=drivesdk" },
  { id: "P210", name: "이진욱", title: "북한·러시아 공개 군사교리 기반 멀티모달 적 위험 예측 시스템의 설계 및 구현", hw: "멀티모달 지휘결심 SW", scores: { sota: 0.90, orig: 0.95, hwUse: 0.25, hwFit: 0.20, stability: 0.80, delivery: 0.95 }, desc: "이진욱의 교리·멀티모달 프로젝트. Evidence→Indicator→Tactical Action→Doctrine Knowledge→Source→S0~S4→Risk의 Gold Chain과 M1/M2/M3 통제실험으로 설명가능·감사가능 위험판단을 검증.", file: "이진욱_프로젝트_연구계획서2.docx", source: "https://docs.google.com/document/d/1X2RgCsYv--SCbHwA2McBZgE8Xg4bNDok/edit?usp=drivesdk&ouid=116536920228399378514&rtpof=true&sd=true" },
  { id: "P211", name: "이진욱", title: "공산오차·혼합표적 피해반응·표적 공간분산을 반영한 AI 화력추천 시스템의 설계 및 구현", hw: "화력효과 시뮬레이션 SW", scores: { sota: 0.90, orig: 0.90, hwUse: 0.25, hwFit: 0.20, stability: 0.90, delivery: 0.95 }, desc: "이진욱의 별도 화력추천 프로젝트. 효과확률표 규칙판정+공산오차/혼합표적/공간분산 Monte Carlo로 Full-Physics 데이터를 만들고 동일 AI 구조의 Simplified 데이터 학습군과 독립 시험자료에서 비교.", file: "이진욱_개인프로젝트_연구계획서.docx", source: "https://docs.google.com/document/d/1kvRfv152lwhi_0OvwiusS9pioU5ktj4-/edit?usp=drivesdk&ouid=116536920228399378514&rtpof=true&sd=true" },
  { id: "P212", name: "박규민", title: "물리모델 기반 학습순위화 모델 비교를 통한 통신·거리 균형 경로 추천 연구", hw: "전술무전 전파·도로망 분석 SW", scores: { sota: 0.85, orig: 0.80, hwUse: 0.35, hwFit: 0.30, stability: 0.90, delivery: 0.90 }, desc: "지형·장애물 기반 회절손실/상대 전파여유와 K-shortest 후보경로 특징을 생성하고 XGBoost Ranker·RankSVM·RankNet·ListNet을 NDCG/순위상관/시간·메모리로 비교. 실제 무전기 실측은 후속 검증 성격.", file: "박규민_개인프로젝트계획서.hwp", source: "https://drive.google.com/file/d/1ZKAzl0d6udp3VJDFA39eRrDsgZdM0Xnv/view?usp=drivesdk" },
  { id: "P213", name: "김영수", title: "CCTVDetect2: 사람·차량 탐지·추적 및 익명 재식별 후보 제시 시스템", hw: "CCTV/RTSP 카메라", scores: { sota: 0.65, orig: 0.75, hwUse: 0.90, hwFit: 0.90, stability: 0.80, delivery: 0.90 }, desc: "YOLO11s→ByteTrack/BoT-SORT→사람 OSNet/차량 FastReID→Top-3 익명 후보→주석영상/HTML/웹 관제로 연결. 실제 신분을 자동 확정하지 않는 사람 검토형 Re-ID 보조 시스템.", file: "김영수_개인프로젝트계획서.pptx", source: "https://docs.google.com/presentation/d/1lfehMQnCi1B_hT7d0QDHsSpPxQphwpD-/edit?usp=drivesdk&ouid=116536920228399378514&rtpof=true&sd=true" },
  { id: "P214", name: "이시연", title: "개인 훈련 이력과 훈련일지 텍스트를 결합한 예비군 취약과목 예측 기법", hw: "훈련 데이터·업무지원 SW", scores: { sota: 0.80, orig: 0.85, hwUse: 0.20, hwFit: 0.15, stability: 0.90, delivery: 0.90 }, desc: "LLM을 직접 예측기가 아닌 훈련일지 취약요인 feature extractor로 사용하고, 이력만(A) vs 이력+일지(B)을 F1/PR-AUC/95% CI와 Precision·Recall@k로 비교. 교관 표본검증·Cohen kappa 포함.", file: "이시연_개인프로젝트계획서(업로드).pdf", source: "https://drive.google.com/file/d/1awe-JyMXwy5N_tjPM15RTqHCsG4dBp7U/view?usp=drivesdk" },
  { id: "P215", name: "김정윤", title: "군사 통신 채널 환경(협대역 제한 및 저비트레이트 코덱 압축)이 오디오 딥페이크 탐지 모델의 강건성에 미치는 영향 분석", hw: "협대역·Codec2 군 통신 채널 시뮬레이션", scores: { sota: 0.95, orig: 0.85, hwUse: 0.30, hwFit: 0.25, stability: 0.95, delivery: 0.95 }, desc: "ITW 31,779건에 협대역×저비트레이트 코덱 2×2 요인설계를 적용하고 공식 checkpoint 8종을 EER/minDCF로 비교. AASIST는 ASVspoof2019 LA 0.83% EER 및 ITW 43.02% EER 재현을 확인했으며 RawBoost 회복효과도 비교 예정.", file: "김정윤_개인프로젝트계획서.hwpx", source: "https://drive.google.com/file/d/1TBa2hnrI2co2isDsyK1elryyCZOMKtNk/view?usp=drivesdk" },
  { id: "P216", name: "이민우", title: "Task·Tool 기반 GPT Planner–Verifier를 활용한 에이전틱 AI 군 시설 운영비서 연구", hw: "항온항습기 점검자료·SW", scores: { sota: 0.80, orig: 0.90, hwUse: 0.35, hwFit: 0.25, stability: 0.85, delivery: 0.90 }, desc: "동일 LLM에서 A 기본 챗봇/B RAG/C RAG+Agent+Verifier를 비교하고 Task 16종·Tool 12종의 선택·순서·오류원인을 검증. 규정 변경과 항온항습기 누락/수치오류/모순을 가상 데이터로 평가.", file: "이민우_개인프로젝트계획서.pdf", source: "https://drive.google.com/file/d/1wQDjSYNEC1DomUqA_avNSdNbzfuOvk_w/view?usp=drivesdk" },
  { id: "P217", name: "강줄기", title: "구조적 무기록(Zero-Persistence) 제약 하의 온디바이스 AI 적용 한계 규명 및 실증", hw: "Android 단말 + Go 서버(실배포)", scores: { sota: 0.95, orig: 1.00, hwUse: 0.95, hwFit: 1.00, stability: 0.90, delivery: 0.95 }, desc: "Zero-Persistence 제약을 실제 Android+Go 메시징 시스템에 구현. 13개 실험에서 F1 0.805, 앱 +0.88MB, p95 76µs, 10만 키 주입 시 상태 1만 고정 등 정량 결과를 확보했고 필드·적대적 검증이 진행 중.", file: "강줄기_개인프로젝트계획서.hwp", source: "https://drive.google.com/file/d/15T526ZFqt0hS3q1eM1DRHjRAO2LnSaJn/view?usp=drivesdk" },
  { id: "P218", name: "김혜인", title: "GC/EI-MS 스펙트럼 데이터 기반 딥러닝을 활용한 화생방 미지 화합물 구조 예측 연구", hw: "GC/MS 분석 데이터", scores: { sota: 0.90, orig: 0.90, hwUse: 0.35, hwFit: 0.25, stability: 0.90, delivery: 0.95 }, desc: "OPCW VGWD structure-disjoint 분할에서 SpecTUS를 PEFT하고 Beam10 후보를 EI-MS로 재순위화. LoRA/RSLoRA/DoRA/AdaLoRA, Top-k 정확도·Tanimoto, MoNA 외부검증을 계획.", file: "김혜인_개인프로젝트계획서.pdf", source: "https://drive.google.com/file/d/1fp2mVh5ufE7f5uk8pnS_morjiDv88zfW/view?usp=drivesdk" },
  { id: "P219", name: "라경주", title: "Structure-Aware RAG와 경량 LLM을 활용한 자연어 기반 HWPX 보고 문서 양식 생성 및 변환", hw: "폐쇄망 PC + HWPX 편집 SW", scores: { sota: 0.75, orig: 0.90, hwUse: 0.15, hwFit: 0.10, stability: 0.90, delivery: 0.90 }, desc: "HWPX의 표·행·열·셀·제목·스타일을 구조화해 RAG하고 경량 LLM은 자연어를 Operation JSON으로 변환, Python 편집기가 Schema 검증 후 실제 HWPX를 수정. 모델 교체가 가능한 역할분리 구조가 핵심.", file: "라경주_개인프로젝트계획서.hwpx", source: "https://drive.google.com/file/d/1eYNGyr2yMPT7SqOxon4tJQU6h1Ep-qc2/view?usp=drivesdk" },
  { id: "P220", name: "강현재", title: "얼굴 행동 특징과 개인별 기준값을 활용한 군 장병 피로 위험 추정 모델 연구", hw: "웹캠·노트북", scores: { sota: 0.80, orig: 0.80, hwUse: 0.85, hwFit: 0.80, stability: 0.85, delivery: 0.90 }, desc: "웹캠 MediaPipe로 EAR/PERCLOS/Blink/MAR/Yawn/Head Pose를 추출하고 개인 Behavioral Baseline 대비 변화량을 추가. Model A/B/C와 RF/XGBoost, 참가자 단위 LOSO, KSS+PVT로 검증.", file: "강현재_개인프로젝트계획서.pdf", source: "https://drive.google.com/file/d/1gOoj5INEqd8wNvzRr8r83mP8Y8QsfPmJ/view?usp=drivesdk" },
  { id: "P221", name: "강현섭", title: "제한된 GPU 자원의 폐쇄 환경에서 LLM 규모와 RAG 구성에 따른 성능·자원 효율성 비교 연구", hw: "GPU 워크스테이션·폐쇄망", scores: { sota: 0.90, orig: 0.85, hwUse: 0.80, hwFit: 0.85, stability: 0.90, delivery: 0.95 }, desc: "Model Scale×RAG×Retrieval Quality를 MMLU-Pro/KMMLU/HotpotQA/TruthfulQA와 Recall@K/MRR/RAGAS, TTFT/latency/tok/s/VRAM으로 동시 비교해 Resource-aware Selection Matrix와 Pareto 기준을 도출.", file: "강현섭_개인프로젝트계획서.pdf", source: "https://drive.google.com/file/d/1ApsmtyCT-UTWxl6VOYUvm6xQx3ORvh3q/view?usp=drivesdk" },
  { id: "P222", name: "임철희", title: "합성 다중모달 데이터 기반 침수 도로 손상 평가 및 방향성 링크 안전 우회경로 추천 연구", hw: "UAV/드론·도로망 시뮬레이션", scores: { sota: 0.85, orig: 0.95, hwUse: 0.70, hwFit: 0.60, stability: 0.65, delivery: 0.95 }, desc: "Normal/Partial/Blocked 3상태 링크, 실제 방향성 LINK_ID, YOLO11n-seg 침수/잔해, Q-learning·관측 A* UAV 경로, 침수 노출량과 D* Lite 동적 재계획까지 결합한 확장형 연구. 범위가 커 일정·통합 리스크는 높음.", file: "연구계획서_침수도로손상평가_안전우회경로추천_4조 임철희.pdf", source: "https://drive.google.com/file/d/1bubcsWkQ3aGQt_JHCrqWy9uCnkddBrDR/view?usp=drivesdk" },
];

const scoreLabels = {
  sota: "SOTA 실험 수준",
  orig: "프레임워크 독창성",
  hwUse: "HW 시연 유용성",
  hwFit: "HW-알고리즘 결합도",
  stability: "라이브 시연 안정성",
  delivery: "발표 전달력",
};

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

function personCardHtml(person) {
  const scoreRows = Object.entries(person.scores)
    .map(([key, value]) => `
      <div class="lookup-score">
        <div class="lookup-score-label"><span>${scoreLabels[key]}</span><strong>${value.toFixed(2)}</strong></div>
        <div class="lookup-score-track"><i style="width:${value * 100}%"></i></div>
      </div>`)
    .join("");

  return `
    <article class="lookup-card">
      <div class="lookup-card-head">
        <div><span class="pid">${person.id} · ${escapeHtml(person.name)}</span><h3>${escapeHtml(person.title)}</h3></div>
        <span class="hw">${escapeHtml(person.hw)}</span>
      </div>
      <p class="lookup-desc">${escapeHtml(person.desc)}</p>
      <div class="lookup-scores">${scoreRows}</div>
      <div class="lookup-card-footer">
        <span>${escapeHtml(person.file)}</span>
        <a href="${person.source}" target="_blank" rel="noopener noreferrer">연구계획서 원문 열기 ↗</a>
      </div>
    </article>`;
}

function renderLookup(query) {
  const root = document.querySelector("#lookup-result");
  if (!root) return;
  const trimmed = query.trim();

  if (!trimmed) {
    root.innerHTML = `<p class="lookup-empty">이름을 입력하거나 아래 목록에서 참가자를 선택하세요.</p>`;
    return;
  }

  const exact = personData.filter((person) => person.name === trimmed);
  const matches = exact.length ? exact : personData.filter((person) => person.name.includes(trimmed));

  if (!matches.length) {
    root.innerHTML = `<p class="lookup-empty">"${escapeHtml(trimmed)}"과 일치하는 참가자를 찾을 수 없습니다. 아래 목록에서 선택해 주세요.</p>`;
    return;
  }

  root.innerHTML = matches.map(personCardHtml).join("");
}

function initLookup() {
  const form = document.querySelector("#lookup-form");
  const input = document.querySelector("#lookup-input");
  const datalist = document.querySelector("#lookup-names");
  const chips = document.querySelector("#lookup-chips");
  if (!form || !input || !datalist || !chips) return;

  const uniqueNames = [...new Set(personData.map((person) => person.name))];

  datalist.innerHTML = uniqueNames.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
  chips.innerHTML = uniqueNames
    .map((name) => `<button type="button" class="lookup-chip" data-name="${escapeHtml(name)}">${escapeHtml(name)}</button>`)
    .join("");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    renderLookup(input.value);
  });

  chips.addEventListener("click", (event) => {
    const chip = event.target.closest(".lookup-chip");
    if (!chip) return;
    input.value = chip.dataset.name;
    chips.querySelectorAll(".lookup-chip").forEach((el) => el.classList.toggle("is-active", el === chip));
    renderLookup(chip.dataset.name);
    input.focus();
  });

  renderLookup("");
}

renderTeamRanking();
renderComponents();
renderAudit();
initLookup();
requestAnimationFrame(animateBars);
highlightCurrentSection();
