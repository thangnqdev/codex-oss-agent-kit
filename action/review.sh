#!/usr/bin/env bash
set -euo pipefail

approved_out() {
  echo "approved=${1}" >> "${GITHUB_OUTPUT}"
  echo "score=${2}" >> "${GITHUB_OUTPUT}"
  echo "findings=${3}" >> "${GITHUB_OUTPUT}"
}

if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "AI review: SKIPPED"
  echo "OPENAI_API_KEY is not available (common on fork PRs). This is not a pass."
  approved_out "false" "" "AI review skipped: missing OpenAI API key"
  exit 0
fi

if [ -z "${ACTION_PATH:-}" ]; then
  echo "ACTION_PATH is not set" >&2
  exit 1
fi

(
  cd "${ACTION_PATH}"
  if [ ! -d node_modules ]; then
    npm ci
  fi
  if [ ! -f dist/cli/index.js ]; then
    npm run build
  fi
)

DIFF_FILE="${RUNNER_TEMP:-/tmp}/codex-pr.diff"
if [ -n "${GITHUB_BASE_REF:-}" ]; then
  git fetch origin "${GITHUB_BASE_REF}" --depth=1 >/dev/null 2>&1 || true
  git diff "origin/${GITHUB_BASE_REF}...HEAD" > "${DIFF_FILE}"
else
  git diff HEAD > "${DIFF_FILE}"
fi

AGENTS_FILE="${AGENTS_FILE:-AGENTS.md}"
REVIEW_MODEL="${REVIEW_MODEL:-gpt-5.6}"
MAX_DIFF_SIZE="${MAX_DIFF_SIZE:-1000}"

set +e
JSON_OUT="$(node "${ACTION_PATH}/bin/codex-oss.js" \
  --api-key "${OPENAI_API_KEY}" \
  --model "${REVIEW_MODEL}" \
  --max-diff-lines "${MAX_DIFF_SIZE}" \
  --format json \
  review --diff "${DIFF_FILE}" --agents "${AGENTS_FILE}")"
STATUS=$?
set -e

echo "${JSON_OUT}"

parse_field() {
  node --input-type=module -e "const o=JSON.parse(process.argv[1]); const v=o[process.argv[2]]; process.stdout.write(v==null?'':String(v));" "${JSON_OUT}" "${1}"
}

if [ "${STATUS}" -ne 0 ]; then
  FINDINGS="review failed"
  if [ -n "${JSON_OUT}" ]; then
    FINDINGS="$(parse_field summary || echo review failed)"
  fi
  approved_out "false" "" "${FINDINGS}"
  exit "${STATUS}"
fi

APPROVED="$(parse_field approved)"
SCORE="$(parse_field score)"
VIOLATIONS="$(node --input-type=module -e "const o=JSON.parse(process.argv[1]); process.stdout.write([...(o.ruleViolations||[]),...(o.suggestions||[])].join('; '));" "${JSON_OUT}")"
approved_out "${APPROVED}" "${SCORE}" "${VIOLATIONS}"
