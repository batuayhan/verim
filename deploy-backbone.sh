#!/usr/bin/env bash
# Bulut omurgasını bir GCE VM'inde ayağa kaldırır: Redpanda + kaynaklar +
# ingest → prod'un Cloud SQL'ine canlı gözlem/istihbarat akıtır. Böylece
# Cloud Run prod haritası/canlı pencereleri BOŞ kalmaz (bkz. ROADMAP sınırları).
#
# Önkoşullar:
#   - gcloud auth login + gcloud config set project <PROJE>
#   - Artifact Registry'de app imajı (deploy.sh push eder ya da compose build+push)
#   - Cloud SQL instance (verim-mim) ve şema seed'i kurulmuş
#
# Kullanım:
#   PROJECT=... REGION=europe-west1 SQL_INSTANCE=proje:region:verim-mim \
#   IMAGE=europe-west1-docker.pkg.dev/proje/verim/app:latest \
#   DB_PASS=... ./deploy-backbone.sh
set -euo pipefail
export PATH="$PATH:/opt/homebrew/share/google-cloud-sdk/bin"

PROJECT="${PROJECT:?PROJECT gerekli}"
REGION="${REGION:-europe-west1}"
ZONE="${ZONE:-${REGION}-b}"
VM="${VM:-verim-backbone}"
SQL_INSTANCE="${SQL_INSTANCE:?SQL_INSTANCE gerekli (proje:region:verim-mim)}"
IMAGE="${IMAGE:?IMAGE gerekli (Artifact Registry app imajı)}"
DB_PASS="${DB_PASS:?DB_PASS gerekli}"
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> VM oluştur (yoksa): $VM ($ZONE)"
gcloud compute instances create "$VM" \
  --project="$PROJECT" --zone="$ZONE" \
  --machine-type=e2-small \
  --image-family=cos-stable --image-project=cos-cloud \
  --scopes=cloud-platform 2>/dev/null || echo "   (VM zaten var)"

echo "==> Dosyaları ve cloud-sql-proxy'yi VM'e kopyala + başlat"
gcloud compute scp --project="$PROJECT" --zone="$ZONE" \
  "$DIR/docker-compose.backbone.yml" "$VM:/tmp/backbone.yml"

# VM'de: cloud-sql-proxy (Cloud SQL'e 127.0.0.1:5432) + backbone compose
gcloud compute ssh "$VM" --project="$PROJECT" --zone="$ZONE" --command "
  set -e
  docker rm -f cloud-sql-proxy 2>/dev/null || true
  docker run -d --name cloud-sql-proxy --network host \
    gcr.io/cloud-sql-connectors/cloud-sql-proxy:latest \
    --address 0.0.0.0 --port 5432 '$SQL_INSTANCE'
  export IMAGE='$IMAGE'
  export DATABASE_URL='postgres://postgres:$DB_PASS@localhost:5432/verim_mim'
  docker compose -f /tmp/backbone.yml pull
  docker compose -f /tmp/backbone.yml up -d
  echo 'Omurga çalışıyor — ingest Cloud SQL yazıyor.'
"
echo "==> Tamam. Prod haritası birkaç dakika içinde canlı izlerle dolar."
echo "    Kaynak eklemek için docker-compose.backbone.yml'e yeni servis ekleyin."
