#!/usr/bin/env bash
# Verim platformunu Google Cloud Run'a dağıtır (tek servis):
#   1) Frontend'i aynı-origin API ile build eder (VITE_API_URL boş)
#   2) Build'i server'ın public/ klasörüne kopyalar
#   3) gcloud run deploy --source ile Cloud Run'a gönderir
#
# Veri backend'i: PGPASS verilirse DATA_BACKEND=mim (Cloud SQL / MIM staging),
# verilmezse dummy (in-memory). MIM seed'i için bkz. README "MIM staging".
#
# Önkoşul: gcloud auth login + gcloud config set project <PROJE>
set -euo pipefail

export PATH="$PATH:/opt/homebrew/share/google-cloud-sdk/bin"

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$ROOT_DIR/apps/server"
WEB_DIR="$ROOT_DIR/apps/client"
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-verim}"
PROJECT="${PROJECT:-atlas-demo-49588}"
SQL_INSTANCE="${SQL_INSTANCE:-$PROJECT:$REGION:verim-mim}"

echo "==> Frontend build (same-origin API)"
cd "$WEB_DIR"
VITE_API_URL="" npm run build

echo "==> Build'i server/public'e kopyala"
rm -rf "$SERVER_DIR/public"
cp -r "$WEB_DIR/dist" "$SERVER_DIR/public"

echo "==> Cloud Run deploy: $SERVICE ($REGION)"
cd "$SERVER_DIR"

# docker compose'un Dockerfile'ı repo-kökü bağlamı ister ve gcloud'un
# buildpacks yolunu gölgeler — deploy süresince geçici kenara alınır
if [[ -f Dockerfile ]]; then
  mv Dockerfile .Dockerfile.compose
  [[ -f Dockerfile.dockerignore ]] && mv Dockerfile.dockerignore .Dockerfile.dockerignore.compose
  trap 'cd "$SERVER_DIR"; [[ -f .Dockerfile.compose ]] && mv .Dockerfile.compose Dockerfile; [[ -f .Dockerfile.dockerignore.compose ]] && mv .Dockerfile.dockerignore.compose Dockerfile.dockerignore' EXIT
fi
ENV_VARS="GCS_BUCKET=${GCS_BUCKET:-verim-data-atlas-demo-49588}"
SQL_ARGS=()
if [[ -n "${PGPASS:-}" ]]; then
  # MIM backend: Cloud SQL unix soketi üzerinden PostgreSQL
  ENV_VARS+=",DATA_BACKEND=mim,DATABASE_URL=postgres://postgres:${PGPASS}@/verim_mim?host=/cloudsql/${SQL_INSTANCE}"
  SQL_ARGS=(--add-cloudsql-instances "$SQL_INSTANCE")
fi
if [[ -z "${PGPASS:-}" ]]; then
  # Dummy modda eski Cloud SQL bağlantısı da temizlenir
  SQL_ARGS=(--clear-cloudsql-instances)
fi
if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  # Asistan: anahtar yalnız çalışma ortamından geçer, repoya asla yazılmaz
  ENV_VARS+=",OPENAI_API_KEY=${OPENAI_API_KEY}"
fi
# LOKALE PROXY: TUNNEL_BUCKET verilirse run.app istekleri GCS'teki tünel
# adresine (Batu'nun lokali) şeffaf proxy'lenir — 301 yönlendirme YOK, tünel
# kapalıysa bu servisin kendi statik sürümü sunulur. --set-env-vars tüm env
# kümesini değiştirdiğinden, listede olmayan eski CANONICAL_HOST otomatik silinir.
ENV_VARS+=",TUNNEL_BUCKET=${TUNNEL_BUCKET:-verim-data-atlas-demo-49588}"

gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --memory 1Gi \
  --set-env-vars "$ENV_VARS" \
  "${SQL_ARGS[@]}" \
  --quiet

echo "==> Tamam. URL:"
gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)'
