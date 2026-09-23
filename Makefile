# CAUMIL 논문 순위 파이프라인. 절차는 docs/WORKFLOW.md 참고. make 가 없으면 ./run.sh <target>.
PY ?= python3
BUILD_FLAGS ?=

.PHONY: all fetch extract sync sync-apply lint score build public deploy check clean

all: extract lint score check build   ## 원고 텍스트 추출부터 사이트 빌드까지(평가는 사람이/에이전트가 eval/ 에 작성)

fetch:        ## inputs/drive_listing.json 의 원고를 raw/ 로 내려받기
	$(PY) pipeline/fetch.py

extract:      ## raw/ → source_text/<ID>.txt
	$(PY) pipeline/extract.py --all

sync:         ## 드라이브 목록·텍스트 해시와 카탈로그 비교(보고만)
	$(PY) pipeline/sync.py --text

sync-apply:   ## 비교 결과를 data/papers.json 에 반영
	$(PY) pipeline/sync.py --text --apply

lint:         ## 템플릿 잔재·참고문헌·그림·표 자동 점검 → data/lint.json
	$(PY) pipeline/lint.py -o data/lint.json

score:        ## 사전함수로 순위·안정성·레버 계산 → data/results.json
	$(PY) pipeline/score.py -o data/results.json

check:        ## 정합성 점검(평가 누락·텍스트 변경·격자 등)
	$(PY) pipeline/check.py

build:        ## 내부용 빌드 → dist/artifact.html, dist/site/
	$(PY) pipeline/build.py $(BUILD_FLAGS)

public:       ## 공개용 빌드(인용문·드라이브 ID·원문 링크 제거) → dist/
	$(PY) pipeline/build.py --public $(BUILD_FLAGS)

deploy:       ## 공개판을 저장소 루트(index.html, app.js, data/data.js)에 배치 → 커밋·푸시하면 Pages 반영
	$(PY) pipeline/build.py --public --root $(BUILD_FLAGS)

clean:
	rm -rf dist pipeline/__pycache__
