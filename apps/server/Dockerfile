# Verim — production-uyumlu imaj (Cloud Run'daki düzenin aynısı:
# tek container, statik SPA + API aynı origin'den servis edilir).
#
# Build bağlamı repo köküdür (frontend apps/client'ta):
#   docker compose  → build.context: .  (docker-compose.yml halleder)
#   elle            → docker build -f apps/server/Dockerfile .

# --- 1) Frontend build (Vite, same-origin API) --------------------------------
FROM node:22-slim AS web
WORKDIR /web
COPY apps/client/package*.json ./
RUN npm ci
COPY apps/client/ ./
ENV VITE_API_URL=""
RUN npm run build

# --- 2) Server build (NestJS) --------------------------------------------------
FROM node:22-slim AS server
WORKDIR /app
COPY apps/server/package*.json ./
RUN npm ci
COPY apps/server/ ./
RUN npm run build

# --- 3) Runtime -----------------------------------------------------------------
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app

COPY apps/server/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=server /app/dist ./dist
COPY apps/server/db ./db
COPY --from=web /web/dist ./public

# Kayıtlı analizler GCS_BUCKET yoksa .data/'ya yazılır — volume bağlanır
RUN mkdir -p .data && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "dist/main"]
