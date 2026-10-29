# 인수인계 프롬프트 — CAUMIL 논문 지표 일일 갱신

아래 내용을 새 세션의 첫 메시지로 붙여 넣으면 된다. (2026-09-28 ~ 09-30 세 차례 갱신에서 확인한 절차와 함정을 정리한 것. 절차의 정본은 `docs/WORKFLOW.md`, 규칙은 `CLAUDE.md`, 현재 상태는 `PLAN.md`.)

---

너는 `C:\Users\choi\Desktop\aice\caumil.io` (Windows, Git Bash 로 `./run.sh` 실행, `python` 3.14) 저장소에서 CAUMIL 논문 지표 사이트를 갱신하는 담당자다. 시작 전에 `CLAUDE.md`, `PLAN.md`, `docs/WORKFLOW.md` 를 읽어라. 오늘 할 일은 **구글 드라이브 제출 폴더 4곳을 다시 조회해 새 원고·수정본·삭제된 원고를 반영하고, 경진대회 엑셀의 6개 변수로 채점한 뒤 가중치 노트북 사전함수(`pipeline/score.py`)로 순위를 다시 계산해 GitHub Pages(`https://caumil-admin.github.io/caumil/`)와 내부용 아티팩트에 배포**하는 것이다. 마지막에 이번 작업의 토큰 사용량을 보고한다.

## 0. 전제 확인
- `inputs/drive_listing.json`, `raw/`, `source_text/`, `inputs/*.xlsx` 가 있어야 한다(gitignore 대상). 없으면 WSL Ubuntu 의 옛 사본 `//wsl.localhost/Ubuntu/home/choi/caumil.io/` 에서 복사하거나(9/23 상태) Drive 커넥터로 다시 만든다.
- 드라이브 폴더 4곳의 ID 는 `inputs/drive_listing.json` 의 `folders` 에만 있다. **파일·폴더 ID, 원문 링크, 소유자 메일은 절대 커밋하지 않는다.** 카탈로그에는 `driveKey`(sha256 앞 16자)만 둔다.
- 사용량 확인: `mcp__ccd_session_mgmt__get_usage`(session_id "self")를 시작과 끝에 한 번씩 호출해 차이를 보고한다.

## 1. 드라이브 조회 (세션의 Google Drive 커넥터)
- `search_files` 로 `parentId = '<폴더ID>'` 를 4곳 각각 조회한다(`excludeContentSnippets: true`, `pageSize: 50`). 자동 모드 분류기 오류로 실패하면 한 번 더 시도한다.
- 제출 폴더 안에 하위 폴더가 생겼으면(9/30 에 '핵심5' 폴더가 각 폴더에 생김, 당시엔 비어 있었음) 그 안도 조회한다. 파일이 있으면 사용자에게 채점 대상인지 확인한다.
- 결과를 이전 목록과 대조해 분류한다: **신규**(새 제목), **재업로드**(같은 제목·저자인데 파일 ID 가 바뀜), **수정**(같은 ID 인데 modifiedTime/fileSize 변화), **삭제**(목록에서 사라짐).

## 2. 목록 갱신과 카탈로그 동기화
- `inputs/drive_listing.json` 의 `files` 를 새 결과로 다시 쓴다. 파일마다 `id, parentId, title, ext, fileSize, createdTime, modifiedTime, owner`, 그리고 `syncedAt` 갱신. (지난 세션들은 파이썬 스크립트로 리스트를 직접 써 넣었다.)
- **재업로드된 원고는 `sync` 전에** `data/papers.json` 의 해당 원고 `driveKey` 를 새 ID 의 `common.drive_key()` 값으로 바꾼다. 그래야 new+removed 가 아니라 `updated` 로 잡힌다.
- 이전 텍스트를 스크래치패드에 복사해 둔다(`source_text/<ID>.txt` → `scratchpad/old_text/`). 나중에 diff 에 쓴다.
- `python pipeline/fetch.py` 로 내려받는다. 큰 파일의 '바이러스 검사 경고' 페이지는 fetch.py 가 확인 폼을 따라가 처리한다. 같은 ID 인데 내용이 바뀐 파일(크기가 같으면 캐시로 건너뜀)은 `fetch.py --force <id>` 로 받는다.
- `python pipeline/sync.py --text` 로 보고를 보고 `--apply` 로 반영한다. 신규는 `NEW-n` 임시 ID 로 들어온다.
- `python pipeline/extract.py --all` 로 텍스트를 뽑는다. hwp/hwpx 만 된다. **PDF** 는 Drive 커넥터 `read_file_content` 로 텍스트를 받아 `source_text/<ID>.txt` 에 직접 넣으면 extract 가 `KEEP` 으로 유지한다(2단 조판이 섞인 부분은 손으로 정리).

## 3. 신규 원고 ID 부여
- 텍스트 앞부분(제목·저자·초록)을 읽고 `data/papers.json` 의 `NEW-n` 항목에 주제를 딴 대문자 2글자 `id`, `authors`(팀이면 `team` 도), `projectId`·`projectMatch`(same|related|different|none — `data/projects.json` 의 계획서와 대조)를 채운다. 기존 ID 와 겹치지 않게 한다.
- `source_text/NEW-n.txt`(또는 해시 이름 파일)를 지우고 `extract.py --all` 을 다시 돌린 뒤 `sync.py --text --apply` 로 `textSha` 를 기록한다.
- **함정:** `sync --apply` 를 두 번째 돌리면 status 가 전부 `unchanged` 로 돌아간다. 빌드 전에 `status` 를 손으로 되돌린다(new / updated / removed). 사이트 머리글의 "신규·수정" 수와 원고 배지가 여기서 나온다.
- 드라이브에서 사라진 원고는 `status: removed` 로 두면 `common.load_papers()` 가 순위·사이트·점검에서 뺀다. `eval/`·`source_text/` 는 기록으로 남긴다.

## 4. 평가
- 재업로드·수정본은 먼저 diff 한다(`diff <(tr -s ' \n' '\n' < old) <(tr -s ' \n' '\n' < new)`). 사사·저자 표기·이메일·공백만 바뀌었으면 점수를 유지하고 `eval/<ID>.json` 의 `textSha`·`evaluatedAt` 만 갱신하며 `planDelta` 끝에 변경 요지 한 문장을 덧붙인다. 블라인드 관련 표시가 지워졌으면 해당 flag 문구를 갱신한다. 본문이 바뀌었으면 재평가한다.
- 신규 원고와 본문이 바뀐 원고는 `docs/WORKFLOW.md` 4단계 규칙으로 `eval/<ID>.json` 을 쓴다: 0.05 단위, 원고 텍스트 근거만(그림 제외), 계획서 same/related 면 `계획서 a→b(±d)` 표기, 순수 SW 과제는 hwUse 0.10~0.35·hwFit 0.05~0.30, 오프라인 실험의 stability 상한 약 0.75, 리스크는 점수 밖, `evidenceQuotes` 는 원문 그대로 3~5문장, 개인 이메일은 적지 않는다.
- 평가는 하위 에이전트에게 맡긴다. 프롬프트에는 원고 ID·제목·저자·학회·계획서 항목과 점수·projectMatch, 척도 기준선으로 읽을 기존 eval 파일 3~5개(같은 저자·같은 학회·비슷한 성격), 확인할 리스크 후보(템플릿 잔재, 실명 노출, 참고문헌 수, 초록–본문 수치 일치, 다른 원고와의 overlap), `textSha`·`evaluatedAt` 값을 넣는다. 파일 외에는 수정하지 말고 `./run.sh` 를 돌리지 말라고 못박는다.
  - 비용 기준: 원고당 에이전트 1개 ≈ 10만 토큰. 워크플로(독립 평가 3인 → 반박 검증 2인 → 판정자, 원고당 6개) ≈ 원고당 80만 토큰이며 9/30 에 2편에 157만 토큰(주간 Fable 한도 약 13%p)이 들었다. 점수는 두 방식이 거의 같았으므로 평소에는 1개, 중요한 원고나 사용자가 "최적"을 요구할 때만 워크플로를 쓴다. 워크플로 스크립트는 `~/.claude/projects/.../workflows/scripts/caumil-eval-panel-*.js` 에 남아 있다.
- 에이전트 결과를 받으면 전 원고 점수를 한 표로 놓고 척도가 맞는지 본다. `eval/*.json` 에 `@`(이메일)가 없는지 grep 한다.

## 5. 계산·점검·빌드
```bash
./run.sh lint && ./run.sh score && ./run.sh check      # check 가 0 errors 여야 함
./run.sh deploy                                          # 공개판 → 루트 index.html, app.js, data/data.js, v2/
./run.sh build                                           # 내부용 → dist/artifact.html (반드시 deploy 뒤에 실행해 dist 가 내부용으로 남게)
./run.sh check
```
- 누출 검사: `inputs/drive_listing.json` 의 파일·폴더 ID·소유자 메일이 추적 파일에 없는지 스크립트로 확인한다(지난 세션은 스크래치패드의 `leakcheck.py` — git ls-files + untracked 파일 전체 grep). 공개판에 `evidenceQuotes` 가 0건, `robots noindex` 가 있는지 확인한다.
- 렌더링 확인: `"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --screenshot=<scratchpad>/rank.png --window-size=1440,1500 "file:///C:/Users/choi/Desktop/aice/caumil.io/index.html#rank-team"` 로 찍어서 본다(`#rank-personal`, `#<ID>` 도).

## 6. 배포
- `PLAN.md` 의 기준일과 "끝난 것" 에 오늘 변화(신규·삭제·재업로드, 편수, 순위)를 한 줄 추가한다.
- 커밋 대상: `data eval index.html app.js v2 pipeline docs PLAN.md`. 루트 `AGENTS.md` 는 사용자 파일이라 손대지 않는다. 메시지는 한국어, 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- 푸시: `git push https://caumil-admin@github.com/caumil-admin/caumil.io.git main` (사용자명 없이 푸시하면 개인 계정 자격 증명이 잡혀 403). 푸시하면 Pages 워크플로가 돌며 1~2분 뒤 `https://caumil-admin.github.io/caumil/data/data.js` 의 `basisDate` 가 바뀐다. 확인은 `until curl … | grep -q '"basisDate":"<오늘>"'; do sleep 15; done` 을 백그라운드로.
- 아티팩트: `dist/artifact.html` 을 `https://claude.ai/artifact/L58PAzgKkDc6NZR6QSgbGz` 에 `url` 로 재게시한다. **새 세션에서는 먼저 `Artifact read` 로 현재 게시본을 한 번 읽어야** 게시가 거부되지 않는다(게시본은 자동 생성 페이지라 병합할 내용은 없음). 'CSV 내려받기' 경고는 알려진 것(PLAN 4번)이라 무시한다.

## 7. 보고
- 드라이브 변화(신규·재업로드·수정·삭제와 처리), 새 점수와 순위 변화(노트북 가중치 기준 개인·팀·사람별), 투고 전 확인할 high 리스크, 토큰 사용량(세션 컨텍스트 증가분, 하위 에이전트 토큰, 5시간·주간 한도 전후 %)을 짧게 정리한다.

## 지난 갱신 요약(맥락)
- 9/28: 15→17편. 7조 팀논문 US·TO 신규, MM·PK·ON·DR 재업로드.
- 9/29: US·TO 삭제, 7조 설계본 TU 와 이건희 PDF UB 신규, TE·TC·MP·NM·NH 는 사사·저자 문구만 변경. 17편.
- 9/30: UB·TU 삭제, 1조 팀논문 RM 과 최석철 정보기술학회 GC 신규(워크플로 채점), VT·NM·NH 재업로드(점수 유지). 17편(개인 13·팀 4). 팀 DR > RM > MP > ON, 개인 VT > HS > TE > MM > LR > GC …, 사람별 최석철 > 이건희 > 서보윤.
- 알려진 미결: '핵심5' 폴더 용도, 삭제된 원고(US·TO·UB·TU)의 eval 파일 처리 방침, 아티팩트 CSV 내려받기 경고, 노트북 재학습용 시트 내보내기.
