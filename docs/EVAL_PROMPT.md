# EVAL_PROMPT.md — 단일 에이전트 평가 프롬프트 템플릿

새 원고나 본문이 바뀐 원고를 하위 에이전트 1개(≈10만 토큰)로 평가할 때 아래를 채워 보낸다. `{…}` 는 세션이 채우는 자리다. 3인 평가 워크플로가 필요하면 `pipeline/eval_panel.workflow.js` 를 쓴다.

```
당신은 /home/choi/caumil.io 저장소에서 논문 원고 한 편을 경진대회 6개 변수와 심사 기준 5항목으로 채점하는 평가자입니다.
결과물은 파일 하나, eval/{ID}.json 뿐입니다. 다른 파일은 절대 수정하지 말고, ./run.sh 나 pipeline 스크립트를 실행하지 마세요. 파이썬은 JSON 검증용으로만 쓰세요.

## 먼저 읽을 것
1. docs/WORKFLOW.md 의 "### 4. 평가" 절 — 스키마와 채점 규칙(6개 변수 + 심사 기준 5항목).
2. data/criteria.json(6개 변수 앵커), data/rubric.json(5항목·세부 요소 앵커).
3. 척도 기준선 평가 파일 3~5개: {같은 저자·같은 학회·비슷한 성격의 eval/<ID>.json 목록}. 점수 감각을 여기에 맞추세요.
4. 원고 전문 source_text/{ID}.txt ({글자 수}자). 끝까지 읽으세요. 그림은 텍스트에 없으므로 근거로 쓰지 않습니다.

## 원고 정보(그대로 쓰세요)
- id "{ID}", paperTitle "{제목}", paperTitleEn "{영문 제목}", 학회 {학회} {개인|팀}논문{, N조}. authorsInText 는 원고 첫머리 표기 그대로. venueHeader 는 머리글 문구.
- 계획서: {P### 과제명, HW, 계획서 점수 6개} / projectMatch {same|related|different|none}. same·related 면 rationale 마다 "계획서 a→b(±d)" 로 시작.
- 이력·관계: {같은 저자의 다른 원고, 재업로드·삭제 이력 등 overlap 에 적을 내용}
- textSha "{data/papers.json 의 textSha}", evaluatedAt "{YYYY-MM-DD}"

## 채점 규칙 요약
- 6개 변수(sota·orig·hwUse·hwFit·stability·delivery)와 5항목 세부 요소 모두 0~1, 0.05 단위. 원고 텍스트 근거만.
- 전용 HW 없는 순수 SW 과제는 hwUse 0.10~0.35, hwFit 0.05~0.30. 오프라인 실험만 있으면 stability 상한 약 0.75. 결과가 없는 설계 논문은 sota·stability 를 낮게.
- 리스크(flags)는 점수 밖. high = 투고 전 반드시 고칠 것, mid = 심사에서 지적될 것.
- 5항목: 항목 score = 세부 요소 평균(소수 둘째 자리), total = 5개 항목 평균×100(소수 첫째 자리), why 는 항목마다 한 문단. 순위 계산에는 쓰지 않는 별도 점수.
- evidenceQuotes 는 원문 그대로 3~5문장. 개인 이메일 주소는 어떤 필드에도 적지 않습니다.

## 확인할 리스크 후보
템플릿 잔재(권호·소속·자리표시자), 실명·소속·사사 노출(블라인드), 참고문헌 수, 초록 수치와 본문 수치 일치, 다른 원고·계획서와의 중복, 표·그림 참조 실재 여부{, 추가 후보}.

## 출력
eval/{ID}.json 을 eval/VT.json 과 같은 필드 순서로 쓰되, textSha 앞에 rubric 블록을 둡니다. UTF-8, ensure_ascii 없이, 들여쓰기 1. 저장 뒤 파이썬으로 JSON 파싱, 0.05 격자, rubric 평균·합계, evidenceQuotes 의 원문 존재(substring), '@' 부재를 검사하고 고치세요.
마지막 보고는 짧게: 6개 점수와 한 줄 이유, 5항목 점수와 total, high 리스크.
```

## 받은 뒤 할 일
1. 전 원고 점수를 한 표로 놓고 척도를 본다(`python3 -c` 로 eval/*.json 을 모아 출력).
2. `grep -l '@' eval/*.json` 으로 이메일이 없는지 본다(P@3 같은 지표 이름은 괜찮다).
3. `./run.sh lint && ./run.sh score && ./run.sh check` 가 0 errors 인지 확인한 뒤 빌드한다.
