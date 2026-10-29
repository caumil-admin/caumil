#!/usr/bin/env bash
# make 가 없는 환경용 실행기. Makefile 과 같은 대상 이름을 쓴다.
# 사용: ./run.sh <target> [추가 인자]   targets: fetch extract sync sync-apply lint score check build public deploy all · decks <sub>
set -euo pipefail
cd "$(dirname "$0")"
PY=${PY:-python3}
t=${1:-help}; shift || true
case "$t" in
  fetch)      $PY pipeline/fetch.py "$@" ;;
  extract)    $PY pipeline/extract.py --all "$@" ;;
  sync)       $PY pipeline/sync.py --text "$@" ;;
  sync-apply) $PY pipeline/sync.py --text --apply "$@" ;;
  lint)       $PY pipeline/lint.py -o data/lint.json "$@" ;;
  score)      $PY pipeline/score.py -o data/results.json "$@" ;;
  check)      $PY pipeline/check.py "$@" ;;
  build)      $PY pipeline/build.py "$@" ;;
  public)     $PY pipeline/build.py --public "$@" ;;
  deploy)     $PY pipeline/build.py --public --root "$@" ;;   # 공개판을 루트에 배치(2026-10-29 재개)
  decks)      $PY pipeline/decks.py "$@" ;;              # 발표자료 트랙(2026-10-23~): fetch render extract sync score check report
  all)        "$0" extract && "$0" lint && "$0" score && "$0" check && "$0" build "$@" ;;
  *) echo "usage: ./run.sh {fetch|extract|sync|sync-apply|lint|score|check|build|public|deploy|all} [args]" >&2; exit 2 ;;
esac
