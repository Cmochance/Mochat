#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
REGION="${REGION:-asia-east1}"
PROJECT="${PROJECT:-$(gcloud config get-value project 2>/dev/null)}"

if [[ -z "${PROJECT}" ]]; then
  echo "gcloud project is not configured" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "missing env file: ${ENV_FILE}" >&2
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

required_keys=(
  PPTGEN_CLOUDRUN_SECRET
  R2_ACCOUNT_ID
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY
  R2_BUCKET_NAME
)

for k in "${required_keys[@]}"; do
  if [[ -z "${!k:-}" ]]; then
    echo "missing required env: ${k}" >&2
    exit 1
  fi
done

gcloud functions deploy pptgen \
  --gen2 \
  --runtime=python311 \
  --region="${REGION}" \
  --project="${PROJECT}" \
  --source="${ROOT_DIR}/modules/pptgen/cloudrun" \
  --entry-point=pptgen \
  --trigger-http \
  --allow-unauthenticated \
  --timeout=300s \
  --memory=1Gi \
  --set-env-vars="AUTH_TOKEN=${PPTGEN_CLOUDRUN_SECRET},R2_ACCOUNT_ID=${R2_ACCOUNT_ID},R2_ACCESS_KEY_ID=${R2_ACCESS_KEY_ID},R2_SECRET_ACCESS_KEY=${R2_SECRET_ACCESS_KEY},R2_BUCKET_NAME=${R2_BUCKET_NAME},R2_PUBLIC_DOMAIN=${R2_PUBLIC_DOMAIN:-}" \
  --format='value(serviceConfig.uri)'
