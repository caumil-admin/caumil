# CLAUDE.md — CAUMIL 논문 지표

> **v6(2026-10-29~) · 재개.** 2026-10-14 임시 폐쇄를 사용자 결정(10/29)으로 해제했다. 루트 `index.html`·`app.js`·`data/data.js` 는 다시 `./run.sh deploy` 의 공개판 빌드 산출물이고 `.github/workflows/pages.yml` 은 저장소 전체를 Pages 에 올린다(`_config.yml` 삭제, `.nojekyll` 복원).

이 저장소는 CAUMIL 개인·팀 논문 원고를 **최초의 평가 체계 — 경진대회 엑셀 6개 변수(SOTA 실험 수준·프레임워크 독창성·HW 시연 유용성·HW-알고리즘 결합도·라이브 시연 안정성·발표 전달력, 0~1, 0.05 단위)** 로 채점하고 **가중치 노트북의 사전함수(닫힌식, `data/weights.json`)** 로 적합도·순위를 매기는 정적 사이트(**v6**)와 그 파이프라인이다. v6 는 2026-10-29 에 사용자 결정("논문 평가는 최초의 6가지 항목으로 재평가")으로 전 원고를 다시 매긴 것이며, 심사 기준 4항목(v5, `eval/<ID>.json` 의 `rubric`)·5항목(v4, `rubricV4`)과 발표자료 점수(`eval_deck/`)는 **참고용**으로만 사이트에 보여 준다(순위 계산에 넣지 않음). v3(2026-10-02 동결, `v3/`)와 계산식은 같고 v3 시기의 점수는 `scoresV3` 에 남겼다. 헤더·강조색은 붉은 주황(#C4401C, 사용자 지정 10/29).
절차의 정본은 `docs/WORKFLOW.md`, 화면 규격은 `DESIGN.md`, 진행 상황과 다음 일은 `PLAN.md` 에 있다. 이 파일은 작업할 때 지켜야 할 규칙만 적는다.

## 구조 한눈에
- `pipeline/` 표준 라이브러리만 쓰는 파이썬(3.14). `fetch.py`(내려받기) → `extract.py`(hwp/hwpx/docx 텍스트, PDF 는 커넥터 텍스트를 손으로 둠) → `sync.py`(카탈로그 동기화) → 평가는 사람·에이전트가 `eval/<ID>.json`(v6: 6개 변수 `scores`·`rationale` 필수, 지침 `docs/EVAL_PROMPT_v6.md`; `rubric`(v5)·`rubricV4`·`scoresV3` 는 기록) → `lint.py` → `score.py`(사전함수 순위) → `check.py` → `build.py`.
- `data/` 카탈로그·기준·가중치·계획서·결과. `data/criteria.json`(6개 변수 앵커)·`data/weights.json`(노트북 가중치 프리셋·상호작용·로지스틱)이 v6 순위 기준이고 `data/rubric.json` 은 v5 4항목 참고 기록(제외 범위 `scope.excludeFolderSub` 는 여기서 읽는다). `eval/` 원고별 평가 원자료. 카탈로그의 `folderSub: "핵심5"` 는 제출 폴더 안 '핵심5' 하위 폴더의 원고다. v4(10/7~10/14)에는 순위에 넣었고, **v5(2026-10-16~)에서는 다시 뺐다**(이전 세션 기록의 사용자 결정 — 카탈로그에는 남기고 평가하지 않음). 빼고 넣는 것은 `rubric.json` 의 `scope.excludeFolderSub` 하나로 정하고 `common.load_papers()` 가 따른다. 포함으로 바꾸면 핵심5 원고(PDF 5편은 커넥터 텍스트부터)도 평가해야 한다. `site/` v3 템플릿·스크립트, `site/legacy/` v2.
- 루트 `index.html`, `app.js`, `data/data.js` 는 `./run.sh deploy` 의 빌드 산출물(공개판 v6)이다. 직접 고치지 말고 다시 만든다. `v3/`·`v2/`·`v1/` 은 정적 보관본이라 손대지 않는다(빌드도 건드리지 않는다).
- `inputs/`, `raw/`, `source_text/`, `dist/` 는 gitignore 대상이다.
- **발표자료 트랙(2026-10-23~)**: 드라이브의 **국방AI 경진대회 발표자료 폴더**(2026-10-26 사용자 지정: 개인·팀 두 폴더, 그 안에 조·사람별 하위 폴더 — 10/23 의 '팀 10/26 · 개인 10/27' 폴더 내용이 여기로 옮겨짐)의 슬라이드(pptx·pdf·html)·대본(hwpx)을 **같은 심사 기준 4항목으로 발표자료만 근거로** 채점해 원고 순위와 별개의 발표자료 순위를 낸다. 한 스크립트 `pipeline/decks.py`(`./run.sh decks fetch|render|extract|sync|score|check|report`)가 담당하고 원고 파이프라인은 건드리지 않는다. 목록 `inputs/deck_listing.json`(ID·메일 포함, gitignore), 원본 `raw/decks/`, 슬라이드 PDF `raw/decks/pdf/`(PowerPoint COM 변환 — 평가자가 Read 로 화면을 봄), 텍스트 `source_text/decks/<ID>.txt`, 카탈로그 `data/decks.json`(ID = 주 원고 ID, `papers` = 다루는 원고들, `kind` slides|script), 평가 `eval_deck/<ID>.json`(원고 `rubric` 과 같은 스키마·같은 total 식, presentation.qa 는 자리값 0.5), 결과 `data/deck_results.json`, 보고서 `dist/decks.html`(내부용). 지침은 `docs/EVAL_PROMPT_decks.md`. 영상(mp4)은 채점하지 않는다. 발표 대상 명단은 `data/deck_roster.json`(팀 7개 조, 개인 21명 중 김민규 제외 — 원고 카탈로그에 없는 강현재 포함)이고 보고서의 미제출 명단이 이를 따른다. HTML 슬라이드는 헤드리스 Chrome 인쇄로, PowerPoint 가 '손상됨'으로 거부하는 pptx 는 '열고 복구'로 PDF 를 만든다. 원고가 원고 카탈로그에 없는 자료(강현재 DZ, 강줄기 NR)는 `papers: []` 와 `externalPaper`(제목·학회·메모)로 두고, 그 원고를 v5 로 평가한 파일이 있으면 `externalPaper.eval`(`eval_external/<ID>.json`)로 연결해 원고 점수·가상 순위만 비교 칸에 쓴다(원고 순위에는 넣지 않음 — 강현재 DZ, 사용자 지정 10/28). **미제출자 추정치**(사용자 지시 10/28, 이건희): 카탈로그에 `imputed` 항목(평가 파일 없음)을 두면 `decks score` 가 그 사람 원고의 항목 점수 + 원고가 카탈로그에 있는 개인 발표자료들의 평균 변화(발표자료 − 원고)로 점수를 만들어 순위에 넣고, 보고서는 '미제출 — 추정치'로 표시하며 미제출 명단에도 남긴다(전체 평균을 주는 대안 점수·순위도 함께 표시). 슬라이드가 그림뿐인 자료는 카탈로그 `manualText` 를 두고 PDF 판 커넥터 텍스트를 손으로 넣는다(extract 가 덮어쓰지 않음). **선정 규칙(사용자 2026-10-24)**: 팀은 7개 조마다 발표자료(ppt·pptx·pdf) 1건만, 개인은 **전자공학회 논문 기준**으로 이름 폴더의 파일(ppt·pptx·pdf·hwp, **HTML 슬라이드도 인정** — 사용자 결정 2026-10-27) 1건만 센다 — 세지 않는 자료는 `data/decks.json` 에 `counted: false` 로 두고(평가 파일은 남김) 순위·보고서에서 뺀다. 개인 자료의 비교 기준 원고(`papers[0]`)는 그 사람의 전자공학회 논문이다 — **김정윤(JT, 10/24)·박규민(LC)·서보윤(TC, 10/26)은 예외**(사용자 결정): 자료가 정보기술학회판을 다루므로 그 원고 기준이며 카탈로그 `venueException` 에 사유를 적는다(`decks check` 가 그 필드가 있으면 경고하지 않음).

## 명령
`make` 가 없는 머신이므로 `./run.sh <target>` 을 쓴다. 이 머신의 `python3` 는 Windows 스토어 별칭이라 간헐적으로 "Python"만 찍고 종료(exit 49)하므로 `PY=python ./run.sh …` 로 실제 인터프리터(`Programs/Python/Python314`)를 지정한다(Makefile 과 같은 이름): `fetch extract sync sync-apply lint score check build public deploy all`.
빌드 전에 반드시 `./run.sh check` 가 0 errors 여야 한다. 발표자료 트랙은 `./run.sh decks score|check|report`.

## 반드시 지킬 것
1. **드라이브 파일·폴더 ID, 원문 링크, 소유자 메일을 커밋하지 않는다.** 원고는 링크 공유 파일이라 ID 가 곧 원고 접근권이다. 카탈로그에는 `driveKey`(해시)만 둔다. 커밋 전에 `inputs/drive_listing.json` 의 ID 가 추적 파일에 없는지 확인한다(이전 세션의 검사 스크립트 참고).
2. **루트에는 공개판만 둔다.** 공개판은 원고 인용문(`evidenceQuotes`)·원문 링크·'투고 전 확인' 패널이 없고 `robots noindex` 가 붙는다. 내부용은 `dist/artifact.html` 로만 만들어 claude.ai 아티팩트 `https://claude.ai/artifact/L58PAzgKkDc6NZR6QSgbGz` 에 `url` 로 재게시한다.
3. **점수 계산식은 한 곳만 바꾸지 않는다.** `pipeline/score.py` 와 `site/app.js` 의 latent(Σw·x + 상호작용)·적합도(로지스틱)·환산 점수·순위·백분위·사분위·레버·몬테카를로 계산은 같아야 한다. 바꾸면 둘 다 고치고 `score.py --compare data/results.json` 로 확인한다.
4. **채점 규칙**은 `docs/EVAL_PROMPT_v6.md` 와 `docs/WORKFLOW.md` 4단계를 따른다: 6개 변수 0.05 단위, 원고 텍스트 근거만(발표자료는 참고, 점수 근거 아님), 계획서 same/related 는 사전값에서 출발, 순수 SW 는 hwUse 0.10~0.35·hwFit 0.05~0.30, 리스크는 점수에 넣지 않음, 척도는 원고 간 한 번 맞춤. `rubric`·`rubricV4`·`scoresV3` 는 지우지 않는다.
5. **평가 원자료(`eval/`) 공개는 사용자가 결정했다(2026-09-23).** 다시 묻지 않되, 새 필드를 추가할 때는 공개 저장소임을 감안한다.
6. 루트 `README.md`, `v1/` 의 내용은 사용자가 요청할 때만 바꾼다.

## 확인 방법
- 브라우저 확장이 없어도 Windows Chrome 을 헤드리스로 쓸 수 있다: `"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --screenshot=<win path> --window-size=1440,1500 file:///C:/.../index.html#rank`. 창 최소 폭이 약 500px 이므로 모바일은 390px iframe 래퍼로 감싸 찍는다(`docs/WORKFLOW.md` 사이트 구조 절).
- JS 구문은 스크래치패드의 esprima(순수 파이썬)로 검사할 수 있다. `site/app.js` 는 ES2017 문법만 쓴다(`?.`, `??`, 객체 spread 금지) — esprima 4 가 파싱할 수 있게 하기 위해서다.

## 배포
- 2026-10-29 재개. 결과를 Pages 에 올린다(사용자 결정).
- `./run.sh deploy` → `./run.sh check` → 커밋 → `git push https://caumil-admin@github.com/caumil-admin/caumil.git main`(GitHub 저장소 이름은 `caumil`, 옛 `caumil.io` 주소는 리다이렉트). 이 머신의 자격 증명 관리자에는 개인 계정(`stonesteel84`)도 저장돼 있어 사용자명 없는 푸시는 403 이 난다.
- 푸시하면 `.github/workflows/pages.yml` 이 저장소 전체를 Pages 에 배포한다. 스크립트 주소에 내용 해시(`app.js?v=…`)가 붙어 있어 캐시 문제는 없다.
- 커밋 메시지는 한국어로 쓰고 끝에 작업한 Claude 모델의 `Co-Authored-By` 줄을 붙인다(예: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).

## 버전 체계
- v6 = 현재(2026-10-29~, 루트 공개판). 최초 체계(6개 변수·노트북 사전함수)로 전 원고 재평가, 핵심5 제외, 헤더 붉은 주황(#C4401C, 다크 #7A2A12). v3 화면 복원 + 심사(v5)·발표자료 참고 열, 프로필에 발표자료 카드.
- v5 = 2026-10-16~10-28(로컬 `dist/` 빌드만, 배포 없음. 2026-10-22 사용자 선택으로 내부용 빌드를 비공개 아티팩트 L58PAzgKkDc6NZR6QSgbGz 버전 17 에 올림 — Pages·공인 IP 공개는 여전히 안 함, v5 커밋은 푸시하지 않음). 심사 기준 4항목(발표 제외 3항목 균등 기본), 핵심5 제외, 헤더 녹색(#1F5B3A). 화면은 v4 를 이어받고 20점·5점 환산을 표시한다.
- v4 = 2026-10-07~10-14 사이트(폐쇄로 루트에서 내림). 심사 기준 5항목 순위, '핵심5' 하위 폴더 원고 포함(10-07~). git 태그 `v4-2026-10-14`, 평가 기록은 `eval/<ID>.json` 의 `rubricV4`, 마지막 내부용 빌드 사본은 `dist/caumil-v4-internal-2026-10-07.html`(gitignore). 화면은 v3 디자인(학술 지표 색인형, 보라색 톤, 상위 2편 강조)을 이어받았다.
- v3 = 엑셀 6개 변수 + 노트북 사전함수 순위의 **2026-10-02 동결본**(`v3/` 정적 사본, git 태그 `v3-2026-10-02`, 내부용은 아티팩트 버전 12). 디자인 원본은 Claude Design 캔버스 "CAUMIL 논문 순위 v2"(`https://claude.ai/artifact/9tBbBaMpePcUWcuFiKSsCm`)이며 **캔버스 제목의 v2 는 사이트 v2 가 아니다.**
- v2 = 캔버스 적용 전 다크 테마 순위 페이지(`v2/`, 10/2 데이터로 고정. 원본 `site/legacy/` 는 더 이상 빌드하지 않음). v1 = 경진대회 전략 사이트(`v1/`).
