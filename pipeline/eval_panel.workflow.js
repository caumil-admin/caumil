// CAUMIL 3인 평가 워크플로 — 독립 평가 3인 → 반박 검증 2인 → 판정자. Claude Code 의 Workflow 도구로 실행한다(사용자가 워크플로를 요청했을 때만).
// 사용: REPO 와 PAPERS 를 채우고 `Workflow` 도구에 scriptPath 로 넘긴다. 원고당 ≈80만 토큰. 6개 변수 + 심사 기준 5항목(data/rubric.json)을 함께 매긴다.
export const meta = {
  name: 'caumil-eval-panel',
  description: '새 원고를 독립 평가자 3인이 6개 변수와 심사 기준 5항목으로 채점하고, 반박 검증 2인을 거쳐 판정자가 최종 eval JSON 을 쓴다',
  phases: [
    { title: 'Evaluate', detail: '원고마다 독립 평가 3회' },
    { title: 'Refute', detail: '평가마다 원문 대조·반박 2회' },
    { title: 'Judge', detail: '척도 보정 후 eval/<ID>.json 작성' },
  ],
}

const REPO = '/home/choi/caumil.io' // Windows 세션이면 'C:\\Users\\choi\\Desktop\\aice\\caumil.io'
const TODAY = '2026-10-01'

const RULES = `## 채점 규칙(docs/WORKFLOW.md 4단계 요약 — 파일을 직접 읽고 data/criteria.json·data/rubric.json 의 앵커도 확인할 것)
- 6개 변수(sota, orig, hwUse, hwFit, stability, delivery)는 엑셀 입력가이드 앵커(0 / 0.5 / 1)를 따르고 **0.05 단위**로 준다.
- **원고 텍스트에 적힌 근거만** 점수에 넣는다. 그림은 텍스트에 없으므로 그림에만 있는 내용은 근거로 쓰지 않는다.
- 계획서(data/projects.json)가 같은 과제(projectMatch same|related)면 계획서 점수에서 출발해 원고 근거로 올리고 내리며 근거마다 "계획서 a→b(±d)" 를 적는다. different 면 사전값을 쓰지 않는다.
- 전용 HW 가 없는 순수 SW 과제(시뮬레이션·공개 데이터셋 실험)는 hwUse 0.10~0.35, hwFit 0.05~0.30 안에서 준다. 실기기 end-to-end 시연이 텍스트에 있을 때만 두 값이 0.8 이상으로 간다.
- stability 는 반복 실행·seed·통제 환경·변수 상황 근거로(오프라인 실험 상한 약 0.75), delivery 는 초록·서론·결론에 문제–방법–수치가 짧고 일관되게 드러나는지로 본다. 결과 없는 설계 논문은 sota·stability 를 낮게.
- 리스크(flags)는 점수에 넣지 않는다. high = 투고 전 반드시 고쳐야 하는 것(중복게재 위험, 블라인드 위반, 템플릿 잔재로 인한 소속 오기재 등), mid = 심사에서 지적될 만한 것.
- **심사 기준 5항목(rubric)**: AI 적용의 창의성(applicability·problem·scoping), 논문 작성 완성도(logic·reliability·references), 혁신성(impact·novelty), 구현 가능성(commercial·rnd), 도전성(frontier·convergence). 세부 요소마다 0~1(0.05 단위, data/rubric.json 의 앵커), 항목 score = 세부 요소 평균(소수 둘째 자리), total = 5개 항목 평균×100(소수 첫째 자리), why 는 항목마다 한 문단. 6개 변수와 별개이며 순위 계산에 쓰지 않는다.
- 척도는 원고 간에 맞춘다: 기준선 평가 파일을 먼저 읽고 같은 변수·같은 항목을 나란히 놓고 매긴다.
- 개인 이메일 주소는 공개 저장소이므로 평가에 적지 않는다.`

// 원고마다 하나. brief 에는 ID·제목·저자·학회·계획서(점수·projectMatch)·척도 기준선 eval 파일·overlap 에 적을 관계·리스크 후보를 넣는다.
const PAPERS = [
  // {
  //   id: 'UF', text: 'source_text/UF.txt', sha: '0ac1bfe00cc663c0',
  //   brief: `원고 ID UF — 7조 팀논문, 국방기술학회, "UA-SAHI: … 프레임워크 설계", 저자 표기 최석철·이건희·김민규·조진혁(교신). 약 13,400자.
  // 계획서: data/projects.json 의 P107(…) 이 projectMatch same.
  // 척도 기준선(반드시 먼저 읽을 것): eval/US.json, eval/TU.json, eval/DR.json, eval/MP.json, eval/RM.json.
  // overlap 에는 … 리스크 후보: …`,
  // },
]

const SIX = ['sota', 'orig', 'hwUse', 'hwFit', 'stability', 'delivery']
const numObj = keys => ({ type: 'object', properties: Object.fromEntries(keys.map(k => [k, { type: 'number' }])), required: keys })
const RUBRIC_SUB = { creativity: ['applicability', 'problem', 'scoping'], completeness: ['logic', 'reliability', 'references'], innovation: ['impact', 'novelty'], feasibility: ['commercial', 'rnd'], challenge: ['frontier', 'convergence'] }
const RUBRIC_SCHEMA = {
  type: 'object',
  properties: Object.assign(
    Object.fromEntries(Object.entries(RUBRIC_SUB).map(([c, subs]) => [c, { type: 'object', properties: { sub: numObj(subs), score: { type: 'number' }, why: { type: 'string' } }, required: ['sub', 'score', 'why'] }])),
    { total: { type: 'number' } }),
  required: Object.keys(RUBRIC_SUB).concat(['total']),
}

const EVAL_SCHEMA = {
  type: 'object',
  properties: {
    paperTitle: { type: 'string' }, paperTitleEn: { type: 'string' },
    authorsInText: { type: 'array', items: { type: 'string' } }, venueHeader: { type: 'string' },
    scores: numObj(SIX),
    rationale: { type: 'object', properties: Object.fromEntries(SIX.map(k => [k, { type: 'string' }])), required: SIX },
    rubric: RUBRIC_SCHEMA,
    planDelta: { type: 'string' }, keyNumbers: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' }, strengths: { type: 'string' }, fixes: { type: 'array', items: { type: 'string' } },
    flags: { type: 'array', items: { type: 'object', properties: { level: { type: 'string', enum: ['high', 'mid'] }, text: { type: 'string' } }, required: ['level', 'text'] } },
    refCount: { type: 'integer' }, overlap: { type: 'string' }, evidenceQuotes: { type: 'array', items: { type: 'string' } },
  },
  required: ['paperTitle', 'paperTitleEn', 'authorsInText', 'venueHeader', 'scores', 'rationale', 'rubric', 'planDelta', 'keyNumbers', 'summary', 'strengths', 'fixes', 'flags', 'refCount', 'overlap', 'evidenceQuotes'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    quotesMissing: { type: 'array', items: { type: 'object', properties: { evaluator: { type: 'integer' }, quote: { type: 'string' } }, required: ['evaluator', 'quote'] } },
    refuted: { type: 'array', items: { type: 'object', properties: { evaluator: { type: 'integer' }, variable: { type: 'string' }, claim: { type: 'string' }, why: { type: 'string' } }, required: ['evaluator', 'variable', 'claim', 'why'] } },
    bandViolations: { type: 'array', items: { type: 'string' } },
    factualErrors: { type: 'array', items: { type: 'string' } },
    recommendedScores: numObj(SIX),
    recommendedRubric: { type: 'object', properties: Object.fromEntries(Object.entries(RUBRIC_SUB).map(([c, subs]) => [c, numObj(subs)])), required: Object.keys(RUBRIC_SUB) },
    notes: { type: 'string' },
  },
  required: ['quotesMissing', 'refuted', 'bandViolations', 'factualErrors', 'recommendedScores', 'recommendedRubric', 'notes'],
}

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    scores: numObj(SIX), rubricTotal: { type: 'number' },
    highFlags: { type: 'integer' }, midFlags: { type: 'integer' }, refCount: { type: 'integer' },
    quoteCheck: { type: 'string' }, disagreements: { type: 'string' }, summaryLine: { type: 'string' },
  },
  required: ['scores', 'rubricTotal', 'highFlags', 'midFlags', 'refCount', 'quoteCheck', 'disagreements', 'summaryLine'],
}

const LENS = [
  '당신은 SOTA·검증 엄밀성과 논문 작성 완성도(논리성·자료 신뢰성·참고자료 수준)를 가장 깐깐하게 보는 심사위원입니다. 기준선·반복·통계·데이터 규모·참고문헌을 원문에서 하나하나 확인하세요.',
  '당신은 HW 시연·라이브 안정성과 구현 가능성(사업화·R&D 구현) 관점의 심사위원입니다. 실기기·실환경·end-to-end 근거가 텍스트에 실제로 있는지, 시뮬레이션·오프라인·계획 단계인지 구분하세요.',
  '당신은 프레임워크 독창성·발표 전달력과 AI 적용의 창의성·혁신성·도전성 관점의 심사위원입니다. 기존 기법의 조합인지 새 구성인지, 문제 인식과 과제 선정이 적정한지, 파급효과와 융합 수준을 보세요.',
]

function evalPrompt(p, i) {
  return `${LENS[i]} 그래도 6개 변수와 5항목 전부를 같은 잣대로 채점해야 합니다.
저장소 ${REPO} 에서 작업합니다. 파일은 읽기만 하고 **아무 파일도 쓰지 마세요**. 결과는 StructuredOutput 으로만 돌려줍니다.

${p.brief}

절차: (1) docs/WORKFLOW.md 의 "4. 평가" 절과 data/criteria.json, data/rubric.json 을 읽는다. (2) 위에 적힌 척도 기준선 eval 파일을 읽는다(rubric 이 있는 파일은 5항목 척도로도 참고). (3) ${p.text} **전문**을 끝까지 읽는다. (4) 스키마 필드를 모두 채운다.
${RULES}
- evidenceQuotes 는 원문에서 **한 글자도 바꾸지 않고** 복사한 3~5문장(점수 근거가 되는 문장). refCount 는 참고문헌 항목 수를 직접 센 값.
- rationale 각 항목은 한 문단(수치·표 번호·원문 표현 인용 포함), rubric.*.why 도 한 문단, planDelta 는 계획서 대비 변화, fixes 는 보완 우선순위 3개.`
}

function refutePrompt(p, evals, k) {
  const focus = k === 0
    ? '특히 evidenceQuotes 가 원문에 그대로 있는지(python 으로 source_text 파일에서 substring 검색), rationale·rubric.why 의 수치·표 인용이 원문과 맞는지, refCount 가 맞는지 확인하세요.'
    : '특히 점수가 규칙(0.05 격자, 순수 SW 구간의 hwUse 0.10~0.35·hwFit 0.05~0.30, 오프라인 실험의 stability 상한, 계획서 출발점, rubric 앵커)과 척도 기준선 eval 파일들에 비추어 과대·과소 평가된 변수·세부 요소를 찾으세요.'
  return `당신은 반박 전문 검증자입니다. 저장소 ${REPO} 에서 파일은 읽기만 하고 **아무 파일도 쓰지 마세요**.
아래는 원고 ${p.id} 에 대한 독립 평가 3건(JSON, evaluator 0/1/2)입니다. 각 평가의 주장을 원문(${p.text})과 규칙, 기준선 eval 파일에 대조해 **틀린 것을 찾아내는 것**이 목표입니다. 확실하지 않으면 refuted 로 올리되 why 에 근거를 적으세요(variable 에는 6개 변수명 또는 rubric 의 "항목.세부요소"를 적는다).
${focus}

${p.brief}
${RULES}

평가 3건:
${JSON.stringify(evals, null, 1)}

마지막에 6개 변수(recommendedScores)와 5항목 세부 요소(recommendedRubric)에 대해 당신이 원문과 규칙만으로 권고하는 점수(0.05 단위)를 적고, notes 에 판정자가 알아야 할 점을 요약하세요.`
}

function judgePrompt(p, evals, verdicts) {
  return `당신은 최종 판정자입니다. 저장소 ${REPO} 에서 원고 ${p.id} 의 최종 평가 파일 **eval/${p.id}.json** 을 작성합니다(이 파일 외에는 아무것도 수정하지 마세요. ./run.sh 도 실행하지 마세요).

${p.brief}
${RULES}

입력: 독립 평가 3건과 반박 검증 2건(JSON). 절차:
1. docs/WORKFLOW.md 4단계 스키마와 data/criteria.json, data/rubric.json, 위 척도 기준선 eval 파일들을 읽는다. ${p.text} 전문도 직접 읽어 최종 근거를 스스로 확인한다.
2. 변수·세부 요소마다 세 평가와 두 검증의 권고를 나란히 놓고, 반박이 성립한 주장은 버리고, 규칙·기준선과 가장 일치하는 값을 0.05 단위로 정한다(단순 평균이 아니라 근거의 타당성으로 결정. 세 평가가 갈리면 기준선 eval 과의 상대 위치를 잣대로 삼는다).
3. rationale 은 살아남은 근거를 합쳐 변수마다 한 문단으로 쓴다(계획서 a→b(±d) 표기 포함). rubric 은 항목마다 sub·score(세부 평균, 소수 둘째 자리)·why 를 쓰고 total(항목 평균×100, 소수 첫째 자리)과 evaluatedAt 을 넣는다. flags 는 중복을 합치고 level 을 정한다. summary·strengths·fixes·keyNumbers·planDelta·overlap·authorsInText·venueHeader·paperTitle·paperTitleEn·refCount 를 채운다.
4. evidenceQuotes 는 검증에서 원문 존재가 확인된 문장만 3~5개 쓴다. 파일을 쓴 뒤 python 으로 (a) JSON 파싱, (b) 6개 점수와 rubric 세부 요소의 0.05 격자, (c) rubric score·total 산술, (d) evidenceQuotes 각 문장이 ${p.text} 에 substring 으로 존재, (e) '@' 문자(이메일) 부재를 검사하고 문제가 있으면 고친다.
5. 파일 형식: UTF-8, 들여쓰기 1칸 JSON, 키 순서는 docs/WORKFLOW.md 스키마와 같게(rubric 은 evaluatedAt 앞). "id": "${p.id}", "evaluatedAt": "${TODAY}", "textSha": "${p.sha}".

독립 평가 3건:
${JSON.stringify(evals, null, 1)}

반박 검증 2건:
${JSON.stringify(verdicts, null, 1)}

StructuredOutput 에는 최종 6개 점수, rubric total, high/mid flag 수, refCount, 인용문 검사 결과, 평가자 간 불일치가 컸던 변수·세부 요소와 그 결정 이유, 한 줄 요약을 담으세요.`
}

const results = await pipeline(
  PAPERS,
  p => parallel([0, 1, 2].map(i => () => agent(evalPrompt(p, i), { label: `eval:${p.id}#${i}`, phase: 'Evaluate', schema: EVAL_SCHEMA, agentType: 'general-purpose' })))
        .then(evals => ({ p, evals: evals.filter(Boolean) })),
  ({ p, evals }) => parallel([0, 1].map(k => () => agent(refutePrompt(p, evals, k), { label: `refute:${p.id}#${k}`, phase: 'Refute', schema: VERDICT_SCHEMA, agentType: 'general-purpose' })))
        .then(verdicts => ({ p, evals, verdicts: verdicts.filter(Boolean) })),
  ({ p, evals, verdicts }) => agent(judgePrompt(p, evals, verdicts), { label: `judge:${p.id}`, phase: 'Judge', schema: JUDGE_SCHEMA, agentType: 'general-purpose' })
        .then(j => ({ id: p.id, evaluatorScores: evals.map(e => e.scores), evaluatorRubric: evals.map(e => e.rubric && e.rubric.total), verifierScores: verdicts.map(v => v.recommendedScores), refutedCount: verdicts.reduce((n, v) => n + v.refuted.length, 0), quotesMissing: verdicts.reduce((n, v) => n + v.quotesMissing.length, 0), judge: j })),
)
return results.filter(Boolean)
