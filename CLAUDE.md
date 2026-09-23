# CLAUDE.md — CAUMIL 논문 지표

이 저장소는 CAUMIL 개인·팀 논문 원고를 경진대회 엑셀의 6개 변수로 채점하고, 가중치 노트북의 사전함수(닫힌식)로 순위를 매겨 GitHub Pages(`https://caumil-admin.github.io/caumil/`)에 올리는 정적 사이트와 그 파이프라인이다.
절차의 정본은 `docs/WORKFLOW.md`, 화면 규격은 `DESIGN.md`, 진행 상황과 다음 일은 `PLAN.md` 에 있다. 이 파일은 작업할 때 지켜야 할 규칙만 적는다.

## 구조 한눈에
- `pipeline/` 표준 라이브러리만 쓰는 파이썬(3.14). `fetch.py`(내려받기) → `extract.py`(hwp/hwpx 텍스트) → `sync.py`(카탈로그 동기화) → 평가는 사람이 `eval/<ID>.json` → `lint.py` → `score.py` → `check.py` → `build.py`.
- `data/` 카탈로그·기준·가중치·계획서·결과. `eval/` 원고별 평가 원자료. `site/` v3 템플릿·스크립트, `site/legacy/` v2.
- 루트 `index.html`, `app.js`, `data/data.js`, `v2/` 는 **빌드 산출물(공개판)** 이다. 직접 고치지 말고 `./run.sh deploy` 로 다시 만든다. `v1/` 은 손대지 않는다.
- `inputs/`, `raw/`, `source_text/`, `dist/` 는 gitignore 대상이다.

## 명령
`make` 가 없는 머신이므로 `./run.sh <target>` 을 쓴다(Makefile 과 같은 이름): `fetch extract sync sync-apply lint score check build public deploy all`.
빌드 전에 반드시 `./run.sh check` 가 0 errors 여야 한다.

## 반드시 지킬 것
1. **드라이브 파일·폴더 ID, 원문 링크, 소유자 메일을 커밋하지 않는다.** 원고는 링크 공유 파일이라 ID 가 곧 원고 접근권이다. 카탈로그에는 `driveKey`(해시)만 둔다. 커밋 전에 `inputs/drive_listing.json` 의 ID 가 추적 파일에 없는지 확인한다(이전 세션의 검사 스크립트 참고).
2. **루트에는 공개판만 둔다.** 공개판은 원고 인용문(`evidenceQuotes`)·원문 링크·'투고 전 확인' 패널이 없고 `robots noindex` 가 붙는다. 내부용은 `dist/artifact.html` 로만 만들어 claude.ai 아티팩트 `https://claude.ai/artifact/L58PAzgKkDc6NZR6QSgbGz` 에 `url` 로 재게시한다.
3. **점수 계산식은 한 곳만 바꾸지 않는다.** `pipeline/score.py` 와 `site/app.js` 의 latent·적합도·환산 점수·백분위·사분위 계산은 같아야 한다. 바꾸면 둘 다 고치고 `score.py --compare data/results.json` 로 확인한다.
4. **채점 규칙**은 `docs/WORKFLOW.md` 4단계를 따른다: 0.05 단위, 원고 텍스트 근거만, 계획서와 섞지 않음, 리스크는 점수에 넣지 않음, 척도는 원고 간 한 번 맞춤.
5. **평가 원자료(`eval/`) 공개는 사용자가 결정했다(2026-09-23).** 다시 묻지 않되, 새 필드를 추가할 때는 공개 저장소임을 감안한다.
6. 루트 `README.md`, `v1/` 의 내용은 사용자가 요청할 때만 바꾼다.

## 확인 방법
- 브라우저 확장이 없어도 Windows Chrome 을 헤드리스로 쓸 수 있다: `"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --screenshot=<win path> --window-size=1440,1500 file:///C:/.../index.html#rank`. 창 최소 폭이 약 500px 이므로 모바일은 390px iframe 래퍼로 감싸 찍는다(`docs/WORKFLOW.md` 사이트 구조 절).
- JS 구문은 스크래치패드의 esprima(순수 파이썬)로 검사할 수 있다. `site/app.js` 는 ES2017 문법만 쓴다(`?.`, `??`, 객체 spread 금지) — esprima 4 가 파싱할 수 있게 하기 위해서다.

## 배포
- `./run.sh deploy` → `./run.sh check` → 커밋 → `git push https://caumil-admin@github.com/caumil-admin/caumil.git main`. 이 머신의 자격 증명 관리자에는 개인 계정(`stonesteel84`)도 저장돼 있어 사용자명 없는 푸시는 403 이 난다.
- 푸시하면 `.github/workflows/pages.yml` 이 저장소 전체를 Pages 에 배포한다. 스크립트 주소에 내용 해시(`app.js?v=…`)가 붙어 있어 캐시 문제는 없다.
- 커밋 메시지는 한국어로 쓰고 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` 를 붙인다.

## 버전 체계
- v3 = 현재 사이트(학술 지표 색인형, 보라색 톤, 상위 2편 강조). 디자인 원본은 Claude Design 캔버스 "CAUMIL 논문 순위 v2"(`https://claude.ai/artifact/9tBbBaMpePcUWcuFiKSsCm`)이며 **캔버스 제목의 v2 는 사이트 v2 가 아니다.**
- v2 = 캔버스 적용 전 다크 테마 순위 페이지(`site/legacy/` → `v2/`). v1 = 경진대회 전략 사이트(`v1/`).
