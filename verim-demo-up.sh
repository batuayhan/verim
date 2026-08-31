#!/usr/bin/env bash
# =============================================================================
# Verim demo — SIFIRDAN kurulum + canlıya bağlama (tek komut)
# =============================================================================
# Yeni bir makinede verim-demo.web.app'i (ve verim-…run.app'i) BU makinenin
# localine bağlar. Bulut tarafına dokunmaz (verim-proxy + verim servisleri zaten
# canlı); yalnız yerel yığını çalıştırıp tünel adresini paylaşılan GCS'e yazar.
#
#   Akış:  tarayıcı → web.app / run.app → (bulut proxy) → GCS'teki tünel adresi
#          → cloudflared tüneli → BU makinenin localhost:8080'i
#
# KULLANIM (monorepo — frontend + server tek repoda):
#   git clone https://github.com/batuayhan/verim.git
#   cd verim
#   ./verim-demo-up.sh
#
# Ne yapar:
#   1) Araçları kontrol/kurar (brew: colima docker cloudflared google-cloud-sdk)
#   2) colima (docker VM) çalışmıyorsa başlatır
#   3) gcloud giriş + proje (gerekiyorsa interaktif login) + GCS erişim kontrolü
#   4) docker compose ile tüm yığını :8080'de derleyip başlatır
#   5) cloudflared tüneli açar, adresini GCS'e yazar → web.app/run.app localine akar
#   6) Ctrl+C: her şey temiz kapanır, GCS adresi silinir, adres prod fallback'ine döner
#
# Opsiyonel Asistan (OpenAI):  OPENAI_API_KEY'i ortamda ver ya da ~/.verim/openai.env
# dosyasına  export OPENAI_API_KEY=sk-...  yaz. Yoksa Asistan devre dışı, gerisi çalışır.
# =============================================================================
set -euo pipefail

# ---- ayarlar -----------------------------------------------------------------
PROJECT="atlas-demo-49588"
BUCKET="gs://verim-data-atlas-demo-49588"
OBJ="$BUCKET/tunnel-url.txt"
PORT="${APP_PORT:-8080}"
RUN_URL="https://verim-500812633451.europe-west1.run.app"
WEB_URL="https://verim-demo.web.app"
GCLOUD_BIN="/opt/homebrew/share/google-cloud-sdk/bin"
[[ -d "$GCLOUD_BIN" ]] && export PATH="$PATH:$GCLOUD_BIN"

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"   # repo kökü (compose burada)

say()  { printf "\033[1;36m==> %s\033[0m\n" "$*"; }
warn() { printf "\033[1;33m!!  %s\033[0m\n" "$*" >&2; }
die()  { printf "\033[1;31mHATA: %s\033[0m\n" "$*" >&2; exit 1; }

# ---- 1) araçlar (docker CLI + cloudflared + gcloud) --------------------------
# Not: 'docker' yalnız CLI'dir; arkasındaki daemon'u macOS'te Docker Desktop ya da
# colima sağlar. Backend seçimi 2. adımda — burada sadece CLI ve yardımcılar.
command -v brew >/dev/null 2>&1 || die "Homebrew gerekli — https://brew.sh"
for pkg in docker cloudflared; do
  command -v "$pkg" >/dev/null 2>&1 || { say "$pkg kuruluyor…"; brew install "$pkg"; }
done
if ! command -v gcloud >/dev/null 2>&1; then
  say "google-cloud-sdk kuruluyor…"
  brew install --cask google-cloud-sdk
  export PATH="$PATH:$GCLOUD_BIN"
fi
command -v gcloud >/dev/null 2>&1 || die "gcloud bulunamadı — kurulum sonrası PATH'i kontrol et ($GCLOUD_BIN)"

# ---- 2) docker daemon (backend-agnostik) ------------------------------------
# Zaten ayakta bir daemon varsa (Docker Desktop / colima / OrbStack) ona dokunma.
# Yoksa: önce kurulu Docker Desktop'ı aç, o da yoksa colima'ya düş (CLI-only, lisanssız).
if ! docker info >/dev/null 2>&1; then
  if [[ -d /Applications/Docker.app ]]; then
    say "Docker Desktop başlatılıyor…"
    open -a Docker
    for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 2; done
  else
    command -v colima >/dev/null 2>&1 || { say "colima kuruluyor (docker backend)…"; brew install colima; }
    say "colima başlatılıyor (docker VM: 4 cpu / 8 GB)…"
    colima start --cpu 4 --memory 8 --disk 60 || die "colima başlatılamadı"
  fi
  docker info >/dev/null 2>&1 || die "docker daemon ayağa kalkmadı (Docker Desktop veya colima gerekli)"
fi

# ---- 3) gcloud auth + proje + GCS erişim ------------------------------------
if [[ -z "$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null)" ]]; then
  say "gcloud girişi gerekli — tarayıcı açılacak (GCS'e yazma yetkili hesapla gir)"
  gcloud auth login
fi
gcloud config set project "$PROJECT" >/dev/null 2>&1 || true
gsutil ls "$BUCKET" >/dev/null 2>&1 \
  || die "GCS bucket'a erişilemiyor ($BUCKET). Yetkili hesapla giriş yaptığından emin ol (batuhanayhan98@gmail.com)."

# ---- opsiyonel: OPENAI (Asistan) --------------------------------------------
if [[ -z "${OPENAI_API_KEY:-}" && -f "$HOME/.verim/openai.env" ]]; then
  set -a; . "$HOME/.verim/openai.env"; set +a
fi
if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  export OPENAI_API_KEY
  say "OPENAI anahtarı yüklü — Asistan aktif olacak"
else
  warn "OPENAI_API_KEY yok — Asistan devre dışı olur, gerisi normal çalışır"
fi

# ---- 4) yığını derle + başlat -----------------------------------------------
cd "$ROOT_DIR"
say "docker imajı derleniyor (ilk sefer birkaç dakika sürebilir)…"
docker compose build seed
say "yığın başlatılıyor (db, redpanda, ingest, graphdb, opensearch, app)…"
docker compose up -d
say "localhost:$PORT sağlığı bekleniyor…"
ok=0
for _ in $(seq 1 90); do
  if curl -sf "http://localhost:$PORT/" >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
[[ "$ok" == 1 ]] || die "localhost:$PORT ayağa kalkmadı — 'docker compose logs app' ile bak"
say "yerel yığın hazır: http://localhost:$PORT   (giriş: hvlamd / hvlamd)"

# ---- 5) cloudflared tüneli + GCS yayını -------------------------------------
LOG="$HOME/.verim-tunnel.log"; : >"$LOG"
TPID=""
cleanup() {
  echo
  say "kapanıyor — GCS adresi siliniyor, web.app/run.app prod fallback'ine dönüyor…"
  gsutil -q rm "$OBJ" 2>/dev/null || true
  [[ -n "$TPID" ]] && kill "$TPID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

say "tünel açılıyor…"
cloudflared tunnel --url "http://localhost:$PORT" >"$LOG" 2>&1 &
TPID=$!
URL=""
for _ in $(seq 1 30); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)
  [[ -n "$URL" ]] && break
  sleep 1
done
[[ -n "$URL" ]] || die "tünel URL'i alınamadı — log: $LOG"
printf '%s' "$URL" | gsutil -q cp - "$OBJ"

echo
say "CANLI ✅  (adresler ~30 sn içinde bu makineye akar)"
echo "   yerel    : http://localhost:$PORT"
echo "   tünel    : $URL"
echo "   web.app  : $WEB_URL"
echo "   run.app  : $RUN_URL"
echo
say "Durdurmak için Ctrl+C — adres otomatik prod fallback'ine döner."

# Mac uyumasın diye caffeinate ile tünel sürecini bekle (yoksa düz wait)
if command -v caffeinate >/dev/null 2>&1; then
  caffeinate -s -w "$TPID"
else
  wait "$TPID"
fi
