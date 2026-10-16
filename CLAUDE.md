# CLAUDE.md — CAUMIL 논문 지표

> **임시 폐쇄(2026-10-14).** 사용자 결정: 사유 "재미도 없고 경진대회에 직접적인 영향을 끼칠 수 있어서". 루트 `index.html`·`404.html` 은 폐쇄 안내 페이지이고, `.github/workflows/pages.yml` 은 그 안내 페이지만 Pages 에 올린다. **결과(순위·점수·평가)를 깃허브 Pages 나 외부로 다시 내보내지 않는다.** Pages 설정이 "브랜치에서 배포"(Jekyll)라 `_config.yml` 로 안내 페이지 외 전부 제외했다(`.nojekyll` 삭제). `./run.sh deploy` 는 `CAUMIL_REOPEN=1` 없이는 거부한다. 사용자가 재개를 말하기 전에는 `deploy`·푸시로 결과를 배포하지 말고, 내부 확인은 `./run.sh build`/`public` 의 `dist/`(gitignore)만 쓴다. 저장소 공개 범위(private 전환)·Pages 비활성화는 GitHub 설정에서 사용자가 직접 한다.

이 저장소는 CAUMIL 개인·팀 논문 원고를 경진대회 **심사 기준 4항목(v5, 2026-10-16 새 기준: 기술적 실현가능성 및 기술적 엄밀성 · 혁신성 및 독창성 · 구성 완성도 및 논리성 · 발표 및 전달력, 항목 최대 5점, 세부 요소 12개)** 으로 채점하고, 발표 전에는 발표 항목을 뺀 세 항목 평균×100(심사 점수, 20점 환산은 ÷5)으로 순위를 매기는 정적 사이트(**v5**)와 그 파이프라인이다. **v5 는 로컬 `dist/` 빌드로만 본다(배포 없음).** v4(심사 기준 5항목, 핵심5 포함 38편)는 2026-10-16 에 git 태그 `v4-2026-10-14` 와 `eval/<ID>.json` 의 `rubricV4` 로 동결했다. v3(엑셀 6개 변수 + 가중치 노트북 사전함수 순위)는 2026-10-02 에 `v3/` 로 동결했다.
절차의 정본은 `docs/WORKFLOW.md`, 화면 규격은 `DESIGN.md`, 진행 상황과 다음 일은 `PLAN.md` 에 있다. 이 파일은 작업할 때 지켜야 할 규칙만 적는다.

## 구조 한눈에
- `pipeline/` 표준 라이브러리만 쓰는 파이썬(3.14). `fetch.py`(내려받기) → `extract.py`(hwp/hwpx/docx 텍스트, PDF 는 커넥터 텍스트를 손으로 둠) → `sync.py`(카탈로그 동기화) → 평가는 사람·에이전트가 `eval/<ID>.json`(v5: 4항목 `rubric` 필수, 6개 변수 없음; v4 기록은 `rubricV4`) → `lint.py` → `score.py`(심사 점수 순위) → `check.py` → `build.py`.
- `data/` 카탈로그·기준·가중치·계획서·결과. `data/rubric.json` 이 v5 순위 기준(4항목·세부 요소 12개 앵커, 프리셋 `manuscript`(기본, 발표 가중치 0)·`equal4`, 제외 범위). `eval/` 원고별 평가 원자료. 카탈로그의 `folderSub: "핵심5"` 는 제출 폴더 안 '핵심5' 하위 폴더의 원고다. v4(10/7~10/14)에는 순위에 넣었고, **v5(2026-10-16~)에서는 다시 뺐다**(이전 세션 기록의 사용자 결정 — 카탈로그에는 남기고 평가하지 않음). 빼고 넣는 것은 `rubric.json` 의 `scope.excludeFolderSub` 하나로 정하고 `common.load_papers()` 가 따른다. 포함으로 바꾸면 핵심5 원고(PDF 5편은 커넥터 텍스트부터)도 평가해야 한다. `site/` v3 템플릿·스크립트, `site/legacy/` v2.
- 루트 `index.html`·`404.html` 은 **폐쇄 안내 페이지**(2026-10-14~)다. 폐쇄 전에는 `index.html`, `app.js`, `data/data.js` 가 `./run.sh deploy` 의 빌드 산출물(공개판 v4)이었고 지금은 `app.js`·`data/data.js` 를 지웠다. `v3/`·`v2/`·`v1/` 은 정적 보관본이라 손대지 않는다(빌드도 건드리지 않는다).
- `inputs/`, `raw/`, `source_text/`, `dist/` 는 gitignore 대상이다.

## 명령
`make` 가 없는 머신이므로 `./run.sh <target>` 을 쓴다. 이 머신의 `python3` 는 Windows 스토어 별칭이라 간헐적으로 "Python"만 찍고 종료(exit 49)하므로 `PY=python ./run.sh …` 로 실제 인터프리터(`Programs/Python/Python314`)를 지정한다(Makefile 과 같은 이름): `fetch extract sync sync-apply lint score check build public deploy all`.
빌드 전에 반드시 `./run.sh check` 가 0 errors 여야 한다.

## 반드시 지킬 것
1. **드라이브 파일·폴더 ID, 원문 링크, 소유자 메일을 커밋하지 않는다.** 원고는 링크 공유 파일이라 ID 가 곧 원고 접근권이다. 카탈로그에는 `driveKey`(해시)만 둔다. 커밋 전에 `inputs/drive_listing.json` 의 ID 가 추적 파일에 없는지 확인한다(이전 세션의 검사 스크립트 참고).
2. **루트에는 공개판만 둔다.** 공개판은 원고 인용문(`evidenceQuotes`)·원문 링크·'투고 전 확인' 패널이 없고 `robots noindex` 가 붙는다. 내부용은 `dist/artifact.html` 로만 만들어 claude.ai 아티팩트 `https://claude.ai/artifact/L58PAzgKkDc6NZR6QSgbGz` 에 `url` 로 재게시한다.
3. **점수 계산식은 한 곳만 바꾸지 않는다.** `pipeline/score.py` 와 `site/app.js` 의 항목 점수(세부 평균)·심사 점수(100·Σw·x, 기본 프리셋은 기술·혁신·구성 1/3 씩·발표 0; `eval` 의 `rubric.total` 도 이 값이고 `check.py` 가 검증)·공동 순위(1e-6 단위)·백분위·사분위·레버·몬테카를로 계산은 같아야 한다. 바꾸면 둘 다 고치고 `score.py --compare data/results.json` 로 확인한다.
4. **채점 규칙**은 `docs/WORKFLOW.md` 4단계를 따른다: 세부 요소 0.05 단위, 원고 텍스트 근거만, 리스크는 점수에 넣지 않음, 척도는 원고 간 한 번 맞춤. **v5 순위는 심사 기준 4항목(`eval/<ID>.json` 의 `rubric`)만으로 매긴다**(2026-10-16). 발표 및 전달력은 발표 전이라 세부 요소 0.5 자리값·가중치 0 이며 발표 후 점수를 넣고 `rubric.json` 의 `default` 를 `equal4` 로 바꾼다. 새 원고에는 6개 변수(`scores`·`rationale`)를 쓰지 않고, 기존 기록(`scores`·`rationale`·`rubricV4`)은 지우지 않는다. 평가 지침은 `docs/EVAL_PROMPT_v5.md`(v4 는 `docs/EVAL_PROMPT.md`), 3인 워크플로는 `pipeline/eval_panel.workflow.js`(v4 용).
5. **평가 원자료(`eval/`) 공개는 사용자가 결정했다(2026-09-23).** 다시 묻지 않되, 새 필드를 추가할 때는 공개 저장소임을 감안한다.
6. 루트 `README.md`, `v1/` 의 내용은 사용자가 요청할 때만 바꾼다.

## 확인 방법
- 브라우저 확장이 없어도 Windows Chrome 을 헤드리스로 쓸 수 있다: `"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --screenshot=<win path> --window-size=1440,1500 file:///C:/.../index.html#rank`. 창 최소 폭이 약 500px 이므로 모바일은 390px iframe 래퍼로 감싸 찍는다(`docs/WORKFLOW.md` 사이트 구조 절).
- JS 구문은 스크래치패드의 esprima(순수 파이썬)로 검사할 수 있다. `site/app.js` 는 ES2017 문법만 쓴다(`?.`, `??`, 객체 spread 금지) — esprima 4 가 파싱할 수 있게 하기 위해서다.

## 배포
- **2026-10-14 부터 결과 배포 중단.** 아래는 재개가 결정됐을 때의 절차다. 재개 시 `pages.yml` 의 "Stage closure notice only" 단계를 되돌리고 `CAUMIL_REOPEN=1 ./run.sh deploy` 로 루트를 다시 만든다.
- `./run.sh deploy` → `./run.sh check` → 커밋 → `git push https://caumil-admin@github.com/caumil-admin/caumil.git main`(GitHub 저장소 이름은 `caumil`, 옛 `caumil.io` 주소는 리다이렉트). 이 머신의 자격 증명 관리자에는 개인 계정(`stonesteel84`)도 저장돼 있어 사용자명 없는 푸시는 403 이 난다.
- 푸시하면 `.github/workflows/pages.yml` 이 실행된다(폐쇄 중에는 안내 페이지만, 재개 후에는 저장소 전체를 배포). 스크립트 주소에 내용 해시(`app.js?v=…`)가 붙어 있어 캐시 문제는 없다.
- 커밋 메시지는 한국어로 쓰고 끝에 작업한 Claude 모델의 `Co-Authored-By` 줄을 붙인다(예: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).

## 버전 체계
- v5 = 현재(2026-10-16~, 로컬 `dist/` 빌드만). 심사 기준 4항목(발표 제외 3항목 균등 기본), 핵심5 제외, 헤더 녹색(#1F5B3A). 화면은 v4 를 이어받고 20점·5점 환산을 표시한다.
- v4 = 2026-10-07~10-14 사이트(폐쇄로 루트에서 내림). 심사 기준 5항목 순위, '핵심5' 하위 폴더 원고 포함(10-07~). git 태그 `v4-2026-10-14`, 평가 기록은 `eval/<ID>.json` 의 `rubricV4`, 마지막 내부용 빌드 사본은 `dist/caumil-v4-internal-2026-10-07.html`(gitignore). 화면은 v3 디자인(학술 지표 색인형, 보라색 톤, 상위 2편 강조)을 이어받았다.
- v3 = 엑셀 6개 변수 + 노트북 사전함수 순위의 **2026-10-02 동결본**(`v3/` 정적 사본, git 태그 `v3-2026-10-02`, 내부용은 아티팩트 버전 12). 디자인 원본은 Claude Design 캔버스 "CAUMIL 논문 순위 v2"(`https://claude.ai/artifact/9tBbBaMpePcUWcuFiKSsCm`)이며 **캔버스 제목의 v2 는 사이트 v2 가 아니다.**
- v2 = 캔버스 적용 전 다크 테마 순위 페이지(`v2/`, 10/2 데이터로 고정. 원본 `site/legacy/` 는 더 이상 빌드하지 않음). v1 = 경진대회 전략 사이트(`v1/`).
