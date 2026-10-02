# CLAUDE.md — CAUMIL 논문 지표

이 저장소는 CAUMIL 개인·팀 논문 원고를 경진대회 **심사 기준 5항목**(세부 요소 12개)으로 채점하고, 항목 점수의 가중 평균×100(심사 점수)으로 순위를 매겨 GitHub Pages(`https://caumil-admin.github.io/caumil/`)에 올리는 정적 사이트(**v4**)와 그 파이프라인이다. v3(엑셀 6개 변수 + 가중치 노트북 사전함수 순위)는 2026-10-02 에 `v3/` 로 동결했다.
절차의 정본은 `docs/WORKFLOW.md`, 화면 규격은 `DESIGN.md`, 진행 상황과 다음 일은 `PLAN.md` 에 있다. 이 파일은 작업할 때 지켜야 할 규칙만 적는다.

## 구조 한눈에
- `pipeline/` 표준 라이브러리만 쓰는 파이썬(3.14). `fetch.py`(내려받기) → `extract.py`(hwp/hwpx/docx 텍스트, PDF 는 커넥터 텍스트를 손으로 둠) → `sync.py`(카탈로그 동기화) → 평가는 사람·에이전트가 `eval/<ID>.json`(v4: `rubric` 필수, 6개 변수 없음) → `lint.py` → `score.py`(심사 점수 순위) → `check.py` → `build.py`.
- `data/` 카탈로그·기준·가중치·계획서·결과. `data/rubric.json` 이 v4 순위 기준(5항목·세부 요소 앵커, 항목 가중치 프리셋, 제외 범위). `eval/` 원고별 평가 원자료. 카탈로그의 `folderSub: "핵심5"` 는 제출 폴더 안 '핵심5' 하위 폴더의 원고로, **v4 순위에서 뺀다**(`rubric.json` 의 `scope.excludeFolderSub`, `common.load_papers()` 가 기본으로 제외). 평가하지 않아도 된다. `site/` v3 템플릿·스크립트, `site/legacy/` v2.
- 루트 `index.html`, `app.js`, `data/data.js` 는 **빌드 산출물(공개판 v4)** 이다. 직접 고치지 말고 `./run.sh deploy` 로 다시 만든다. `v3/`·`v2/`·`v1/` 은 정적 보관본이라 손대지 않는다(빌드도 건드리지 않는다).
- `inputs/`, `raw/`, `source_text/`, `dist/` 는 gitignore 대상이다.

## 명령
`make` 가 없는 머신이므로 `./run.sh <target>` 을 쓴다(Makefile 과 같은 이름): `fetch extract sync sync-apply lint score check build public deploy all`.
빌드 전에 반드시 `./run.sh check` 가 0 errors 여야 한다.

## 반드시 지킬 것
1. **드라이브 파일·폴더 ID, 원문 링크, 소유자 메일을 커밋하지 않는다.** 원고는 링크 공유 파일이라 ID 가 곧 원고 접근권이다. 카탈로그에는 `driveKey`(해시)만 둔다. 커밋 전에 `inputs/drive_listing.json` 의 ID 가 추적 파일에 없는지 확인한다(이전 세션의 검사 스크립트 참고).
2. **루트에는 공개판만 둔다.** 공개판은 원고 인용문(`evidenceQuotes`)·원문 링크·'투고 전 확인' 패널이 없고 `robots noindex` 가 붙는다. 내부용은 `dist/artifact.html` 로만 만들어 claude.ai 아티팩트 `https://claude.ai/artifact/L58PAzgKkDc6NZR6QSgbGz` 에 `url` 로 재게시한다.
3. **점수 계산식은 한 곳만 바꾸지 않는다.** `pipeline/score.py` 와 `site/app.js` 의 항목 점수(세부 평균)·심사 점수(100·Σw·x)·공동 순위(1e-6 단위)·백분위·사분위·레버·몬테카를로 계산은 같아야 한다. 바꾸면 둘 다 고치고 `score.py --compare data/results.json` 로 확인한다.
4. **채점 규칙**은 `docs/WORKFLOW.md` 4단계를 따른다: 세부 요소 0.05 단위, 원고 텍스트 근거만, 리스크는 점수에 넣지 않음, 척도는 원고 간 한 번 맞춤. **v4 순위는 심사 기준 5항목(`eval/<ID>.json` 의 `rubric`)만으로 매긴다**(사용자 결정 2026-10-02). 새 원고에는 6개 변수(`scores`·`rationale`)를 쓰지 않고, 기존 기록은 지우지 않는다. 평가 프롬프트는 `docs/EVAL_PROMPT.md`(v4), 3인 워크플로는 `pipeline/eval_panel.workflow.js`.
5. **평가 원자료(`eval/`) 공개는 사용자가 결정했다(2026-09-23).** 다시 묻지 않되, 새 필드를 추가할 때는 공개 저장소임을 감안한다.
6. 루트 `README.md`, `v1/` 의 내용은 사용자가 요청할 때만 바꾼다.

## 확인 방법
- 브라우저 확장이 없어도 Windows Chrome 을 헤드리스로 쓸 수 있다: `"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --screenshot=<win path> --window-size=1440,1500 file:///C:/.../index.html#rank`. 창 최소 폭이 약 500px 이므로 모바일은 390px iframe 래퍼로 감싸 찍는다(`docs/WORKFLOW.md` 사이트 구조 절).
- JS 구문은 스크래치패드의 esprima(순수 파이썬)로 검사할 수 있다. `site/app.js` 는 ES2017 문법만 쓴다(`?.`, `??`, 객체 spread 금지) — esprima 4 가 파싱할 수 있게 하기 위해서다.

## 배포
- `./run.sh deploy` → `./run.sh check` → 커밋 → `git push https://caumil-admin@github.com/caumil-admin/caumil.git main`. 이 머신의 자격 증명 관리자에는 개인 계정(`stonesteel84`)도 저장돼 있어 사용자명 없는 푸시는 403 이 난다.
- 푸시하면 `.github/workflows/pages.yml` 이 저장소 전체를 Pages 에 배포한다. 스크립트 주소에 내용 해시(`app.js?v=…`)가 붙어 있어 캐시 문제는 없다.
- 커밋 메시지는 한국어로 쓰고 끝에 작업한 Claude 모델의 `Co-Authored-By` 줄을 붙인다(예: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).

## 버전 체계
- v4 = 현재 사이트(루트). 심사 기준 5항목 순위, '핵심5' 제외. 화면은 v3 디자인(학술 지표 색인형, 보라색 톤, 상위 2편 강조)을 이어받는다.
- v3 = 엑셀 6개 변수 + 노트북 사전함수 순위의 **2026-10-02 동결본**(`v3/` 정적 사본, git 태그 `v3-2026-10-02`, 내부용은 아티팩트 버전 12). 디자인 원본은 Claude Design 캔버스 "CAUMIL 논문 순위 v2"(`https://claude.ai/artifact/9tBbBaMpePcUWcuFiKSsCm`)이며 **캔버스 제목의 v2 는 사이트 v2 가 아니다.**
- v2 = 캔버스 적용 전 다크 테마 순위 페이지(`v2/`, 10/2 데이터로 고정. 원본 `site/legacy/` 는 더 이상 빌드하지 않음). v1 = 경진대회 전략 사이트(`v1/`).
