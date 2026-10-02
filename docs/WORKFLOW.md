# CAUMIL 논문 순위 — 작업 절차

공유 드라이브 제출 폴더의 개인·팀 원고를 경진대회 **심사 기준 5항목**(세부 요소 12개)으로 채점하고, 항목 점수의 가중 평균×100(**심사 점수**)으로 순위를 매겨 사이트로 만든다(**v4**, 2026-10-02~). '핵심5' 하위 폴더 원고는 순위에서 뺀다.
v3 까지는 경진대회 엑셀의 6개 변수와 가중치 노트북의 사전함수(닫힌식)로 순위를 매겼다 — 그 결과는 `v3/`(정적 동결본, git 태그 `v3-2026-10-02`)에 있고, 6개 변수 관련 절(아래 '6개 변수(v3 기록)')은 기록으로 남긴다.
원고 평가는 사람이(또는 에이전트가) 전문을 읽고 `eval/<ID>.json` 에 쓰고, 나머지는 `pipeline/` 스크립트가 처리한다. 표준 라이브러리만 쓴다(olefile 은 `pipeline/vendor/` 에 벤더링).
`make <target>` 이 없는 환경(이 WSL 머신에는 make 가 없다)에서는 같은 이름으로 `./run.sh <target>` 을 쓴다.

## 디렉터리

| 경로 | 내용 | 저장소에 올림 |
|---|---|---|
| `data/folders.json` | 제출 폴더 4곳과 그 안의 '핵심5' 하위 폴더 3곳(해시 키·이름·학회·트랙)과 엑셀 파일명 — 드라이브 ID 는 `inputs/` 에만 | ○ |
| `data/papers.json` | 원고 카탈로그(ID, driveKey=파일 ID 해시, 저자, 과제 매핑, 파일 메타, status, textSha) | ○ |
| `data/projects.json` | 엑셀 `프로젝트입력` 시트(계획서 점수 29건) — `pipeline/excel.py` 산출 | ○ |
| `data/rubric.json` | **v4 순위 기준**: 심사 기준 5항목·세부 요소 12개 앵커, 항목 가중치 프리셋(`presets`, 기본 `equal`), 제외 범위(`scope.excludeFolderSub`) | ○ |
| `data/criteria.json`, `data/weights.json` | (v3 기록) 6개 변수 앵커, 가중치 프리셋·상호작용·로지스틱 — v4 계산에는 쓰지 않음 | ○ |
| `eval/<ID>.json` | 평가 원자료(점수·근거·리스크·인용) | ○ (사용자 결정 9/23) |
| `data/lint.json`, `data/results.json` | 자동 점검, 순위·안정성 계산 결과(산출물) | ○ |
| `site/template.html`, `site/app.js` | v4 사이트(학술 지표 색인형, 보라색 톤, 심사 5항목 순위). `site/legacy/` 는 v2 페이지 원본(더 이상 빌드하지 않음) | ○ |
| `inputs/drive_listing.json`, `inputs/*.xlsx` | 드라이브 목록(파일·폴더 ID, 소유자 메일 포함)·엑셀 원본 | × |
| `raw/`, `source_text/` | 원고 원본, 추출 텍스트 | × |
| `dist/` | 빌드 산출물(`artifact.html`, `site/`) | × |
| `index.html`, `app.js`, `data/data.js` | 저장소 루트의 **공개용** v4 사이트(`./run.sh deploy` 산출물) | ○ |
| `v3/`, `v2/`, `v1/` | 정적 보관본. v3 = 6개 변수 사전함수 순위 동결본(2026-10-02), v2 = 캔버스 적용 전 다크 페이지, v1 = 경진대회 전략 사이트. **빌드가 건드리지 않는다** | ○ |

원고 ID 는 주제를 딴 대문자 2글자(VT, MP …). 파일명은 `raw/<driveId>.<ext>`, `source_text/<ID>.txt`.

## 새 원고가 왔을 때 (1~6단계)

### 1. 드라이브 목록 갱신 → `inputs/drive_listing.json`
세션의 Drive 커넥터로 목록의 `folders` 4곳을 `parentId = '<folderId>'` 로 조회해 파일마다
`id, parentId, title, ext, fileSize, createdTime, modifiedTime, owner` 를 적고 `syncedAt` 을 갱신한다.
(제출 루트에는 채점 대상이 아닌 7월 발표·온라인학습 폴더도 있다. 4곳만 본다. 루트·폴더 ID 는 이 파일의 `root`·`folders` 에 있고 저장소에는 올리지 않는다.)
제출 폴더 안의 **`핵심5` 하위 폴더**(2026-09-30 생성, 전자공학회 개인·팀, 국방기술학회 팀)도 `folders` 에 `sub: "핵심5"`·`parent` 를 붙여 같이 조회한다 — 2026-10-02 부터 원고가 들어와 있으며 용도는 미확인. 하위 폴더 원고는 카탈로그에 `folderSub: "핵심5"` 가 붙고(프로필에 '핵심5 폴더' 칩), 엑셀 계획서에 없는 팀이면 `team` 을 `핵심5 5조` 처럼 적어 본 폴더의 같은 번호 조와 구분한다(`projectMatch: none`).

### 2. 내려받기 → `raw/`
```bash
make fetch
```
공유 링크 방식이라 `https://drive.google.com/uc?export=download&id=<id>` 로 받는다. 크기가 목록과 같으면 건너뛴다.
로그인 페이지가 내려오면 파일 공유 설정을 확인한다.

### 3. 텍스트 추출과 카탈로그 동기화
```bash
make extract        # raw/ → source_text/<ID>.txt (hwp·hwpx·docx. 수식은 [수식: …] 로, 표·각주·머리글 포함)
make sync           # 새 파일 / 수정된 파일 / 텍스트 해시 변화 보고
make sync-apply     # 반영: 새 파일은 NEW-n 임시 ID 로 추가, status(new/updated/unchanged/removed)·file·textSha 갱신
```
`sync-apply` 뒤 `data/papers.json` 에서 `NEW-n` 항목의 `id`(2글자)·`authors`·`team`·`projectId`·`projectMatch` 를 채운다.
ID 를 바꿨으면 `source_text/NEW-n.txt` 는 지우고 `make extract` 를 다시 돌린다(카탈로그 ID 로 파일명이 정해진다).
`status` 는 직전 동기화 대비 변화다. 다음 동기화에서 변화가 없으면 `unchanged` 로 돌아간다(ID 를 바꾼 뒤 `sync-apply` 를 한 번 더 돌리면 전부 `unchanged` 가 되므로 빌드 전에 new/updated 를 되돌려 둔다).
- **재업로드로 파일 ID 가 바뀐 원고**(같은 제목·저자): `sync` 전에 `data/papers.json` 의 `driveKey` 를 새 ID 의 해시(`common.drive_key`)로 옮기면 new+removed 가 아니라 `updated` 로 잡힌다.
- **목록에서 사라진 원고**는 `removed` 가 되고 `common.load_papers()` 가 순위·사이트·점검에서 뺀다. `eval/<ID>.json` 과 `source_text/` 는 기록으로 남긴다.
- **docx 원고**는 `extract.py` 가 표준 라이브러리로 읽는다(본문·표·각주, OMML 수식은 `[수식: …]`).
- **PDF 원고**는 `extract.py` 가 다루지 못한다. 세션의 Drive 커넥터 `read_file_content` 로 텍스트를 받아 `source_text/<ID>.txt` 에 직접 넣으면 `make extract` 가 `KEEP` 으로 유지한다(2단 조판이 섞인 부분은 손으로 정리).
- 큰 파일은 드라이브가 '바이러스 검사 경고' 페이지를 먼저 주는데 `fetch.py` 가 확인 폼을 따라가 받는다.
카탈로그는 파일 ID 의 해시(`driveKey`)로 목록과 대응한다. 내부용 빌드는 `inputs/drive_listing.json` 이 있을 때만 원문 링크를 붙인다.

### 4. 평가 → `eval/<ID>.json`
대상: `status` 가 `new` 이거나 `updated` 인 원고, 그리고 `make check` 가 "텍스트가 평가 이후 바뀜" 이라고 보고한 원고.
`source_text/<ID>.txt` **전문**을 읽고 아래 스키마로 쓴다. 작성 후:
```bash
make lint           # 템플릿 잔재·참고문헌 수·그림·표·초록 수치 → data/lint.json
```

평가 파일 스키마(`eval/VT.json` 참고):
```jsonc
{
  "id": "VT",
  "paperTitle": "…", "paperTitleEn": "…",
  "authorsInText": ["원고에 적힌 저자 표기"], "venueHeader": "머리글에 적힌 학회지·권호",
  "scores":    {"sota": 0.7, "orig": 0.8, "hwUse": 0.8, "hwFit": 0.85, "stability": 0.7, "delivery": 0.85},
  "rationale": {"sota": "한 줄 근거(계획서 대비 변화와 이유)", "...": "…"},
  "planDelta": "계획서(엑셀)에서 원고로 오며 무엇이 달라졌는지",   // 계획서가 없으면 ""
  "keyNumbers": ["대표 수치 3~4개"],
  "summary": "원고 요약 3~4문장", "strengths": "강점 2~3문장",
  "fixes": ["보완 우선순위 3개"],
  "flags": [{"level": "high|mid", "text": "리스크"}],
  "refCount": 20, "overlap": "다른 원고와의 관계(없으면 \"\" 또는 생략)",
  "evidenceQuotes": ["원고 원문 인용 3~5개 — 점수의 근거가 되는 문장"],
  "evaluatedAt": "YYYY-MM-DD",
  "textSha": "<평가한 source_text 의 해시 — data/papers.json 의 textSha 와 같아야 함>"
}
```

**v4 에서는 새 원고·수정본에 `scores`·`rationale`(6개 변수)을 쓰지 않는다.** 순위는 `rubric` 만으로 매기며, 기존 원고의 6개 변수 기록은 그대로 둔다(빌드가 v4 데이터에서 뺀다). 나머지 필드(제목·저자·요약·강점·보완·리스크·인용 등)는 그대로 쓴다.

6개 변수(v3 기록) 채점 규칙 — v3 동결본을 다시 만들 일이 있을 때만:
- 6개 변수는 엑셀 `입력가이드` 앵커(0 / 0.5 / 1)를 따르고 **0.05 단위**로 준다. 앵커는 `data/criteria.json` 에 있다.
- **원고에 적힌 근거만** 점수에 넣는다. 그림은 읽지 않으므로(텍스트 추출) 그림에만 있는 내용은 근거로 쓰지 않는다.
- 계획서(엑셀 `data/projects.json`)가 같은 과제(`projectMatch: same|related`)면 계획서 점수에서 출발해 원고 근거로 올리고 내리며, 근거마다 `계획서 a→b(±d)` 를 적는다. `different` 면 사전값을 쓰지 않는다.
- 전용 HW 가 없는 순수 SW 과제는 엑셀 관례대로 `hwUse` 0.10~0.35, `hwFit` 0.05~0.30(시뮬레이션 구간) 안에서 준다. 실기기 end-to-end 시연이 있을 때만 두 값이 0.8 이상으로 간다.
- `stability` 는 반복 실행·통제 환경·변수 상황 근거로, `delivery` 는 초록·서론·결론에 문제–방법–수치가 짧고 일관되게 드러나는지로 본다.
- 리스크(`flags`)는 점수에 넣지 않는다. `high` 는 투고 전 반드시 고쳐야 하는 것(중복게재 위험, 블라인드 위반, 템플릿 잔재로 인한 소속 오기재 등), `mid` 는 심사에서 지적될 만한 것.
- 척도는 원고 간에 한 번 맞춘다. 여러 명이 나눠 채점했으면 마지막에 한 사람이 전 원고의 같은 변수를 나란히 놓고 보정한다.
- 계획서 점수와 원고 점수는 한 표에 섞지 않는다(계획서는 낙관적 잠정치).

#### 심사 기준 5항목 (`rubric`)
**v4 순위의 유일한 근거**다(2026-10-01 에 별도 점수로 추가, 2026-10-02 부터 순위 기준). 정의와 앵커는 `data/rubric.json` 에 있다. 원고 텍스트 근거만, 그림 제외, 리스크는 점수 밖(flags), 척도는 원고 간에 한 번 맞춘다는 원칙은 같다.
- 항목과 세부 요소: **AI 적용의 창의성**(AI 기술 적용 가능성 · 문제 인식 및 개선 방향 도출 · 세부 과제 선정의 적정성), **논문 작성 완성도**(논문의 논리성 · 자료의 신뢰성 · 참고자료의 수준), **혁신성**(AI 기술 적용의 파급효과 · 기술의 혁신성), **구현 가능성**(미래 적용 시 사업화 가능성 · R&D 구현 가능성), **도전성**(도전기술과제로 가능성 · 융합기술로의 도전성).
- 세부 요소마다 0~1(0.05 단위). 항목 `score` = 세부 요소 평균(소수 둘째 자리), `total` = 5개 항목 평균×100(소수 첫째 자리). `why` 는 항목마다 한 문단, 원고 텍스트 근거만.
- 심사 점수 = 100 × Σ 항목 가중치 × 항목 점수(반올림 전 세부 평균). 기본 가중치(5항목 균등)에서는 `total` 과 같다. `make check` 가 격자·평균·합계를 검증하고, 순위 대상 원고에 `rubric` 이 없으면 오류다.
- 스키마(`eval/<ID>.json` 의 `rubric` 키, `evaluatedAt` 앞):
```jsonc
"rubric": {
  "creativity":   {"sub": {"applicability": 0.7, "problem": 0.65, "scoping": 0.6}, "score": 0.65, "why": "…"},
  "completeness": {"sub": {"logic": 0.7, "reliability": 0.4, "references": 0.6}, "score": 0.57, "why": "…"},
  "innovation":   {"sub": {"impact": 0.5, "novelty": 0.6}, "score": 0.55, "why": "…"},
  "feasibility":  {"sub": {"commercial": 0.5, "rnd": 0.4}, "score": 0.45, "why": "…"},
  "challenge":    {"sub": {"frontier": 0.55, "convergence": 0.5}, "score": 0.53, "why": "…"},
  "total": 55.0, "evaluatedAt": "YYYY-MM-DD"
}
```
- 수정본(텍스트가 바뀐 재업로드)은 기존 `eval/<ID>.json` 을 기준선으로 갱신한다: 이전 텍스트와의 diff 를 에이전트에 넘겨 근거가 달라진 변수만 조정(rationale 끝에 "수정본(M/D): …")하고, evidenceQuotes 가 현재 텍스트에 있는지 확인·교체하며, 고쳐진 리스크는 flags 에서 지운다.
- 여러 원고를 한꺼번에 매길 때는 척도 기준점을 적은 공통 지침 파일(세부 요소별 0.3/0.5/0.7/0.9 의 뜻, 설계만 있는 원고의 상한 등)을 두고 원고당 에이전트 1개를 병렬로 돌린 뒤, 전 원고의 같은 변수를 한 표에 놓고 보정한다(2026-10-02 에 24편을 이렇게 매김).
- 평가 방식: 단일 에이전트는 `docs/EVAL_PROMPT.md` 템플릿(v4: 5항목만)을, 3인 평가 워크플로(독립 평가 3인 → 반박 검증 2인 → 판정자)는 `pipeline/eval_panel.workflow.js` 를 쓴다. 둘 다 5항목을 포함한다. 비용은 단일 ≈ 원고당 10만 토큰, 워크플로 ≈ 원고당 80만 토큰이므로 평소에는 단일, 중요한 원고나 사용자가 '최적'을 요구할 때만 워크플로.

### 5. 계산과 점검
```bash
make score          # data/results.json (v4: 프리셋별 심사 점수·순위·몬테카를로 안정성, 세부 요소 레버, 사람별 대표작)
make check          # 평가 누락·텍스트 변경·격자·ID 매핑·results 최신 여부. 오류가 있으면 빌드하지 않는다
```
계산식(v4, `pipeline/score.py` = `site/app.js`):
`항목 점수 x_c = 세부 요소 평균`, `심사 점수 = 100·Σ w_c·x_c`(Σw = 1), 순위는 심사 점수 내림차순이고 1e-6 단위까지 같으면 같은 순위(1, 2, 2, 4), 백분위 `(N−R+0.5)/N×100`, 사분위 75/50/25 초과.
프리셋은 `data/rubric.json` 의 `equal`(5항목 균등, 기본)과 `subEqual`(세부 요소 12개 균등 = 창의성·완성도 0.25, 나머지 1/6). 안정성은 항목 가중치 Dirichlet(α=60·w)와 세부 요소 ±0.05 흔들기 4,000회(시드 20260923), 레버는 세부 요소 하나를 0.05 올렸을 때의 심사 점수 변화.
(v3 기록) `latent = Σ w·x + 0.1·독창성·HW결합도 + 0.1·HW유용성·시연안정성`, `적합도 = 100/(1+e^(−8(latent−0.72)))` — `v3/app.js` 에만 남아 있다.

### 6. 빌드와 게시
```bash
make build          # 내부용: dist/artifact.html + dist/site/ (원문 링크 포함)
make public         # 공개용: 원고 인용문(evidenceQuotes)을 빼고 드라이브 링크를 붙이지 않으며 robots noindex 를 단다 → dist/
make deploy         # 공개용을 저장소 루트(index.html, app.js, data/data.js)에 배치(v3/·v2/·v1/ 은 그대로). 커밋·푸시하면 Pages 가 갱신된다
```
- **claude.ai 아티팩트**(비공개): `dist/artifact.html` 을 기존 URL `https://claude.ai/artifact/L58PAzgKkDc6NZR6QSgbGz` 에 `url` 로 넘겨 다시 게시한다.
- **GitHub Pages** `caumil-admin/caumil` (`https://caumil-admin.github.io/caumil/`): `make deploy` 로 루트를 갱신하고 커밋·푸시한다. `.github/workflows/pages.yml` 이 main 푸시마다 저장소 전체를 배포한다(v1 은 `v1/` 에 보존됨). 루트에는 항상 공개판만 둔다.
- 푸시는 내장 브라우저의 `caumil-admin` 세션으로 GitHub 웹 업로드를 쓴다(클라우드 git 프록시가 이 저장소 쓰기를 막음).

## 사이트 구조(v4)
- 한 페이지 앱이며 해시로 화면을 나눈다: `#rank`(`#rank-<personal|people|team>[-<ee|it|dt>]`), `#categories`, `#method`, `#<원고 ID>`.
- 계산은 전부 브라우저에서 한다(`site/app.js` 의 항목 점수·심사 점수·공동 순위·백분위·사분위·레버는 `pipeline/score.py` 와 같다). 순위 범위·1위 확률은 프리셋 2종은 `data/results.json` 의 4,000회 값을 쓰고, 사용자 가중치나 학회 필터가 걸리면 브라우저에서 1,500회 다시 계산하거나 표시하지 않는다.
- 버전: v4 = 현재(루트, 심사 5항목 순위, 핵심5 제외), v3 = 6개 변수 사전함수 순위의 2026-10-02 동결본(`v3/`, 내부용은 아티팩트 버전 12), v2 = 캔버스 적용 전 다크 페이지(`v2/`), v1 = 경진대회 전략 사이트(`v1/`). 헤더의 버전 전환과 푸터 링크로 오간다. 보관본은 빌드하지 않는 정적 파일이다.
- 상위 2편 기준: 순위표는 1·2위를 왼쪽 띠로 강조하고, 범주 개요는 범주마다 1·2위 원고를 보여 주며, 안정성에는 1위 확률·2위 안 확률(`top2`)·3위 안 확률이 있다(`pipeline/score.py` 몬테카를로).
- 내부용 빌드(`make build`)에는 원고 프로필에 '투고 전 확인'(리스크·자동 점검·원문 링크) 패널이 있고, 공개판(`make public`/`deploy`)에는 없다. 아티팩트에서는 CSV 내려받기가 막혀 있어 'CSV 복사' 버튼이 된다.
- 디자인 원본은 Claude Design 캔버스 https://claude.ai/artifact/9tBbBaMpePcUWcuFiKSsCm 이고, 토큰(색·서체)은 `site/template.html` 의 `:root` 에 있다. 다크 테마는 같은 토큰을 재정의한다.
- 렌더링 확인은 이 머신의 Windows Chrome 을 헤드리스로 쓴다(`"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --screenshot=... file:///...`). 헤드리스 창은 500px 아래로 줄지 않으므로 모바일 폭은 390px iframe 으로 감싸 찍는다.

## 가중치·엑셀이 바뀌었을 때
- 엑셀이 갱신되면 파일을 `inputs/` 에 받고 `python3 pipeline/excel.py --compare data/projects.json` 으로 차이를 본 뒤 `-o data/projects.json` 으로 쓴다.
- 노트북 가중치가 바뀌면 `data/weights.json` 의 프리셋과 `fixes`·`validation` 을 함께 고친다. 상호작용 항은 노트북 주석 의도(독창성×HW결합도, HW유용성×시연안정성)를 따른다.

## 결정 사항
- (2026-10-02) **v4 부터 순위는 심사 기준 5항목으로만 매긴다.** 6개 변수·사전함수 순위는 v3 로 동결. '핵심5' 하위 폴더 원고는 순위에서 뺀다(카탈로그·드라이브 목록에는 남김).
- (2026-09-23, v3) 순위는 닫힌식 사전함수로 계산한다. 노트북 신경망은 이 함수를 근사하는 것일 뿐이다.
- 기본값은 가중치를 합 1로 정규화한 것. 원본(합 0.92)은 프리셋으로 남긴다.
- 계획서 점수와 원고 점수는 섞지 않는다. 리스크는 점수에 넣지 않고 따로 표시한다.
- 잠정 루브릭(군 적합성·독창성·검증·정량성·완성도 100점)은 폐기했다.
- 평가 원자료(`eval/`)는 공개 저장소에 올린다. 원고 원본·전문 텍스트·드라이브 목록은 올리지 않는다.
