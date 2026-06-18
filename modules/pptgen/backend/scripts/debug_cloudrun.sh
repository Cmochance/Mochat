#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
PAYLOAD_FILE="${ROOT_DIR}/modules/pptgen/backend/debug/minimal_ppt_payload.json"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "missing .env: ${ENV_FILE}" >&2
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

if [[ -z "${PPTGEN_CLOUDRUN_URL:-}" || "${PPTGEN_CLOUDRUN_URL}" == *"your-cloudrun-url"* ]]; then
  echo "PPTGEN_CLOUDRUN_URL is not configured in ${ENV_FILE}" >&2
  exit 1
fi

REQ_ID="local-debug-$(date +%s)"

echo "[debug=versions]"
curl -sS -i --max-time 20 \
  -H "X-Request-ID: ${REQ_ID}" \
  -H "X-Auth-Secret: ${PPTGEN_CLOUDRUN_SECRET:-}" \
  "${PPTGEN_CLOUDRUN_URL}?debug=versions" | sed -n '1,40p'

echo
echo "[debug=template]"
curl -sS -i --max-time 20 \
  -H "X-Request-ID: ${REQ_ID}" \
  -H "X-Auth-Secret: ${PPTGEN_CLOUDRUN_SECRET:-}" \
  "${PPTGEN_CLOUDRUN_URL}?debug=template" | sed -n '1,80p'

if [[ "${1:-}" == "--generate" ]]; then
  if [[ ! -f "${PAYLOAD_FILE}" ]]; then
    echo "missing payload file: ${PAYLOAD_FILE}" >&2
    exit 1
  fi

  echo
  echo "[POST generate]"
  curl -sS -i --max-time 120 \
    -H "Content-Type: application/json" \
    -H "X-Request-ID: ${REQ_ID}" \
    -H "X-Auth-Secret: ${PPTGEN_CLOUDRUN_SECRET:-}" \
    -X POST "${PPTGEN_CLOUDRUN_URL}" \
    --data-binary "@${PAYLOAD_FILE}" | sed -n '1,120p'
fi
