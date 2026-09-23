# CAUMIL 논문 순위 — 작업 절차

공유 드라이브 제출 폴더의 개인·팀 원고를 경진대회 엑셀의 **6개 변수**로 채점하고, 가중치 노트북의 **사전함수(닫힌식)** 로 순위를 매겨 사이트로 만든다.
원고 평가는 사람이(또는 에이전트가) 전문을 읽고 `eval/<ID>.json` 에 쓰고, 나머지는 `pipeline/` 스크립트가 처리한다. 표준 라이브러리만 쓴다(olefile 은 `pipeline/vendor/` 에 벤더링).
`make <target>` 이 없는 환경(이 WSL 머신에는 make 가 없다)에서는 같은 이름으로 `./run.sh <target>` 을 쓴다.

## 디렉터리

| 경로 | 내용 | 저장소에 올림 |
|---|---|---|
| `data/folders.json` | 제출 폴더 4곳(해시 키·이름·학회·트랙)과 엑셀 파일명 — 드라이브 ID 는 `inputs/` 에만 | ○ |
| `data/papers.json` | 원고 카탈로그(ID, driveKey=파일 ID 해시, 저자, 과제 매핑, 파일 메타, status, textSha) | ○ |
| `data/projects.json` | 엑셀 `프로젝트입력` 시트(계획서 점수 29건) — `pipeline/excel.py` 산출 | ○ |
| `data/criteria.json`, `data/weights.json` | 6개 변수 앵커, 가중치 프리셋·상호작용·로지스틱 | ○ |
| `eval/<ID>.json` | 평가 원자료(점수·근거·리스크·인용) | ○ (사용자 결정 9/23) |
| `data/lint.json`, `data/results.json` | 자동 점검, 순위·안정성 계산 결과(산출물) | ○ |
| `site/template.html`, `site/app.js` | v3 사이트(학술 지표 색인형, 보라색 톤). `site/legacy/` 는 v2 페이지(같이 빌드되어 `v2/` 로 배포) | ○ |
| `inputs/drive_listing.json`, `inputs/*.xlsx` | 드라이브 목록(파일·폴더 ID, 소유자 메일 포함)·엑셀 원본 | × |
| `raw/`, `source_text/` | 원고 원본, 추출 텍스트 | × |
| `dist/` | 빌드 산출물(`artifact.html`, `site/`) | × |
| `index.html`, `app.js`, `data/data.js`, `v2/` | 저장소 루트의 **공개용** v3 사이트와 v2 보관본(`./run.sh deploy` 산출물) | ○ |

원고 ID 는 주제를 딴 대문자 2글자(VT, MP …). 파일명은 `raw/<driveId>.<ext>`, `source_text/<ID>.txt`.

## 새 원고가 왔을 때 (1~6단계)

### 1. 드라이브 목록 갱신 → `inputs/drive_listing.json`
세션의 Drive 커넥터로 목록의 `folders` 4곳을 `parentId = '<folderId>'` 로 조회해 파일마다
`id, parentId, title, ext, fileSize, createdTime, modifiedTime, owner` 를 적고 `syncedAt` 을 갱신한다.
(제출 루트에는 채점 대상이 아닌 7월 발표·온라인학습 폴더도 있다. 4곳만 본다. 루트·폴더 ID 는 이 파일의 `root`·`folders` 에 있고 저장소에는 올리지 않는다.)

### 2. 내려받기 → `raw/`
```bash
make fetch
```
공유 링크 방식이라 `https://drive.google.com/uc?export=download&id=<id>` 로 받는다. 크기가 목록과 같으면 건너뛴다.
로그인 페이지가 내려오면 파일 공유 설정을 확인한다.

### 3. 텍스트 추출과 카탈로그 동기화
```bash
make extract        # raw/ → source_text/<ID>.txt (수식은 [수식: …] 로, 표·각주·머리글 포함)
make sync           # 새 파일 / 수정된 파일 / 텍스트 해시 변화 보고
make sync-apply     # 반영: 새 파일은 NEW-n 임시 ID 로 추가, status(new/updated/unchanged/removed)·file·textSha 갱신
```
`sync-apply` 뒤 `data/papers.json` 에서 `NEW-n` 항목의 `id`(2글자)·`authors`·`team`·`projectId`·`projectMatch` 를 채운다.
ID 를 바꿨으면 `source_text/NEW-n.txt` 는 지우고 `make extract` 를 다시 돌린다(카탈로그 ID 로 파일명이 정해진다).
`status` 는 직전 동기화 대비 변화다. 다음 동기화에서 변화가 없으면 `unchanged` 로 돌아간다.
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

채점 규칙:
- 6개 변수는 엑셀 `입력가이드` 앵커(0 / 0.5 / 1)를 따르고 **0.05 단위**로 준다. 앵커는 `data/criteria.json` 에 있다.
- **원고에 적힌 근거만** 점수에 넣는다. 그림은 읽지 않으므로(텍스트 추출) 그림에만 있는 내용은 근거로 쓰지 않는다.
- 계획서(엑셀 `data/projects.json`)가 같은 과제(`projectMatch: same|related`)면 계획서 점수에서 출발해 원고 근거로 올리고 내리며, 근거마다 `계획서 a→b(±d)` 를 적는다. `different` 면 사전값을 쓰지 않는다.
- 전용 HW 가 없는 순수 SW 과제는 엑셀 관례대로 `hwUse` 0.10~0.35, `hwFit` 0.05~0.30(시뮬레이션 구간) 안에서 준다. 실기기 end-to-end 시연이 있을 때만 두 값이 0.8 이상으로 간다.
- `stability` 는 반복 실행·통제 환경·변수 상황 근거로, `delivery` 는 초록·서론·결론에 문제–방법–수치가 짧고 일관되게 드러나는지로 본다.
- 리스크(`flags`)는 점수에 넣지 않는다. `high` 는 투고 전 반드시 고쳐야 하는 것(중복게재 위험, 블라인드 위반, 템플릿 잔재로 인한 소속 오기재 등), `mid` 는 심사에서 지적될 만한 것.
- 척도는 원고 간에 한 번 맞춘다. 여러 명이 나눠 채점했으면 마지막에 한 사람이 전 원고의 같은 변수를 나란히 놓고 보정한다.
- 계획서 점수와 원고 점수는 한 표에 섞지 않는다(계획서는 낙관적 잠정치).

### 5. 계산과 점검
```bash
make score          # data/results.json (모든 프리셋의 latent/fit/score, 순위, 몬테카를로 안정성, 레버, 계획서 순위, 사람별 대표작)
make check          # 평가 누락·텍스트 변경·격자·ID 매핑·results 최신 여부. 오류가 있으면 빌드하지 않는다
```
계산식(`pipeline/score.py` = `site/app.js`):
`latent = Σ w·x + 0.1·독창성·HW결합도 + 0.1·HW유용성·시연안정성`, `적합도 = 100/(1+e^(−8(latent−0.72)))`, `환산점수 = 100·latent/latent_max`.
기본 프리셋은 노트북 가중치를 합 1로 정규화한 것이며 원본(합 0.92)·균등·HW 제외는 프리셋으로 남긴다.

### 6. 빌드와 게시
```bash
make build          # 내부용: dist/artifact.html + dist/site/ + dist/v2/ (원문 링크 포함)
make public         # 공개용: 원고 인용문(evidenceQuotes)을 빼고 드라이브 링크를 붙이지 않으며 robots noindex 를 단다 → dist/
make deploy         # 공개용을 저장소 루트(index.html, app.js, data/data.js)와 v2/ 에 배치. 커밋·푸시하면 Pages 가 갱신된다
```
- **claude.ai 아티팩트**(비공개): `dist/artifact.html` 을 기존 URL `https://claude.ai/artifact/L58PAzgKkDc6NZR6QSgbGz` 에 `url` 로 넘겨 다시 게시한다.
- **GitHub Pages** `caumil-admin/caumil` (`https://caumil-admin.github.io/caumil/`): `make deploy` 로 루트를 갱신하고 커밋·푸시한다. `.github/workflows/pages.yml` 이 main 푸시마다 저장소 전체를 배포한다(v1 은 `v1/` 에 보존됨). 루트에는 항상 공개판만 둔다.
- 푸시는 내장 브라우저의 `caumil-admin` 세션으로 GitHub 웹 업로드를 쓴다(클라우드 git 프록시가 이 저장소 쓰기를 막음).

## 사이트 구조(v3)
- 한 페이지 앱이며 해시로 화면을 나눈다: `#rank`(`#rank-<personal|people|team>[-<ee|it|dt>]`), `#categories`, `#method`, `#<원고 ID>`.
- 계산은 전부 브라우저에서 한다(`site/app.js` 의 latent·적합도·환산 점수·백분위·사분위는 `pipeline/score.py` 와 같다). 순위 범위·1위 확률은 프리셋 4종은 `data/results.json` 의 4,000회 값을 쓰고, 사용자 가중치나 학회 필터가 걸리면 브라우저에서 1,500회 다시 계산하거나 표시하지 않는다.
- 버전: v3 = 현재 디자인(루트), v2 = 캔버스 적용 전 다크 페이지(`v2/`, `site/legacy/`), v1 = 경진대회 전략 사이트(`v1/`). 헤더의 버전 전환과 푸터 링크로 오간다.
- 상위 2편 기준: 순위표는 1·2위를 왼쪽 띠로 강조하고, 범주 개요는 범주마다 1·2위 원고를 보여 주며, 안정성에는 1위 확률·2위 안 확률(`top2`)·3위 안 확률이 있다(`pipeline/score.py` 몬테카를로).
- 내부용 빌드(`make build`)에는 원고 프로필에 '투고 전 확인'(리스크·자동 점검·원문 링크) 패널이 있고, 공개판(`make public`/`deploy`)에는 없다. 아티팩트에서는 CSV 내려받기가 막혀 있어 'CSV 복사' 버튼이 된다.
- 디자인 원본은 Claude Design 캔버스 https://claude.ai/artifact/9tBbBaMpePcUWcuFiKSsCm 이고, 토큰(색·서체)은 `site/template.html` 의 `:root` 에 있다. 다크 테마는 같은 토큰을 재정의한다.
- 렌더링 확인은 이 머신의 Windows Chrome 을 헤드리스로 쓴다(`"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --screenshot=... file:///...`). 헤드리스 창은 500px 아래로 줄지 않으므로 모바일 폭은 390px iframe 으로 감싸 찍는다.

## 가중치·엑셀이 바뀌었을 때
- 엑셀이 갱신되면 파일을 `inputs/` 에 받고 `python3 pipeline/excel.py --compare data/projects.json` 으로 차이를 본 뒤 `-o data/projects.json` 으로 쓴다.
- 노트북 가중치가 바뀌면 `data/weights.json` 의 프리셋과 `fixes`·`validation` 을 함께 고친다. 상호작용 항은 노트북 주석 의도(독창성×HW결합도, HW유용성×시연안정성)를 따른다.

## 결정 사항(2026-09-23)
- 순위는 닫힌식 사전함수로 계산한다. 노트북 신경망은 이 함수를 근사하는 것일 뿐이다.
- 기본값은 가중치를 합 1로 정규화한 것. 원본(합 0.92)은 프리셋으로 남긴다.
- 계획서 점수와 원고 점수는 섞지 않는다. 리스크는 점수에 넣지 않고 따로 표시한다.
- 잠정 루브릭(군 적합성·독창성·검증·정량성·완성도 100점)은 폐기했다.
- 평가 원자료(`eval/`)는 공개 저장소에 올린다. 원고 원본·전문 텍스트·드라이브 목록은 올리지 않는다.
