# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

NestJS query/data service ("Verim") for the frontend at `apps/client` (same monorepo). It executes board chains (`BoardConfig[]`) and object-set queries over either deterministic dummy data or a real PostgreSQL/MIM staging backend. The API contract lives in `apps/client/docs/API_CONTRACT.md`; the types in `src/contract/` mirror `apps/client/src/types` — **when the contract changes, both sides must be updated together**.

Code comments, domain vocabulary, and the README are in **Turkish** (Harman = board/query system, Mercek = object-set analysis, iz = track, kademe = tier). Follow that convention in comments and domain naming.

## Commands

```bash
npm run start:dev          # dev server, http://localhost:3000, Swagger at /docs
npm run build              # nest build → dist/
npm run lint               # eslint --fix
npm test                   # unit tests (src/**/*.spec.ts)
npm test -- threat-scorer  # single unit test by name pattern
npm run test:e2e           # e2e tests (test/*.e2e-spec.ts, config: test/jest-e2e.json)
npx jest --config ./test/jest-e2e.json test/admission.e2e-spec.ts   # single e2e test
```

MIM backend (real-data path, needs PostgreSQL):

```bash
createdb verim_mip
DATABASE_URL=postgres://localhost/verim_mip npx ts-node src/mim/seed.ts   # seed 20k tracks (IZ_SCALE=1000000 for 1M)
DATA_BACKEND=mim DATABASE_URL=... npm run start:dev
DATABASE_URL=... npx ts-node src/mim/equivalence-check.ts                 # prove dummy ↔ mim give identical results
```

Full stack: `docker compose up -d --build` **from the repo root** (app on :8080 with TimescaleDB, Redpanda, sources, ingest, Neo4j, OpenSearch — compose + Dockerfile build context is the monorepo root). Root `deploy.sh` deploys to Cloud Run (builds frontend into `public/`, served same-origin); root `verim-demo-up.sh` runs the demo-tunnel setup.

## Architecture: ports & adapters (hexagonal)

Every data-facing capability is a port (DI token) with two adapters, selected by `DATA_BACKEND` env at module wiring time. **Both modes serve byte-identical contract responses — the frontend never sees the difference.** Dummy adapters double as docker-free dev fallbacks.

| Port token | dummy (default) | `DATA_BACKEND=mim` |
|---|---|---|
| `DATASET_PROVIDER` | **always `CompositeDatasetProvider`** (kernel ⊕ user-defined live datasets); the dummy/mim switch moved to `KERNEL_DATASET_PROVIDER`: DummyDatasetProvider (faker seed=4242) \| MimDatasetProvider (PostgreSQL `v_*` views) — same layering as `CompositeOntologyProvider` |
| `ONTOLOGY_PROVIDER` | DummyOntologyProvider (static) | MimOntologyProvider (derived from MIM mapping) |
| `OBJECT_SET_ENGINE` | ObjectSetEngine (in-memory) | SqlObjectSetEngine (full SQL pushdown) |
| `QUERY_ENGINE` | InMemoryQueryEngine | SqlPushdownQueryEngine (filter prefix → SQL WHERE, rest in-memory) |
| `GRAPH_PROVIDER` | DummyGraphProvider (adjacency in memory) | Neo4jGraphProvider |
| `SEARCH_PROVIDER` | InMemorySearchProvider | OpenSearch |
| `SCHEMA_INTROSPECTOR` | DummySchemaIntrospector | MimSchemaIntrospector (information_schema) |

Binding points: `src/datasets/datasets.module.ts`, `src/ontology/ontology.module.ts`, `src/query/query.module.ts`, `src/search/search.module.ts`. When adding a capability that touches data, follow this pattern: define a port token, provide both adapters, switch on `DATA_BACKEND`.

### Key subsystems

- **`src/contract/`** — zod schemas + types kept in sync with the frontend. All request validation goes through `ZodValidationPipe` (`src/common/`); errors use the `ApiError` contract shape.
- **`src/query/in-memory/`** — the board executor (filter, expression, histogram, pivot, enrich, setMath, editColumns). `expression/` is a mini expression language: tokenizer + Pratt parser + evaluator. `SqlPushdownQueryEngine` (`src/mim/sql-query-engine.ts`) reuses this engine for non-pushable boards, so results are provably identical on both paths (`src/mim/equivalence-check.ts`).
- **`src/ontology/object-set-engine.ts`** — recursive `ObjectSetDef` resolver: `base` · `filter` · `searchAround` · `joinLinked` · `fromPrimaryKeys`. SQL twin in `src/mim/sql-object-set-engine.ts`.
- **`src/mim/mim-ontology.ts`** — the declarative MIM mapping is the single source of truth for the mim-mode ontology: each type/property/link declares which MIM entity/attribute/association it comes from. `db/schema.sql` is the MIM relational projection, `db/views.sql` maps it to Verim apiNames. When the real MIM feed arrives, only the mapping + views change; the Verim contract stays fixed.
- **`src/ingest/`** — Kafka (Redpanda) streaming path. Producers (`producer-*.ts`) simulate sources and know nothing about the DB; `ingest-service.ts` normalizes all formats and applies the MIM pattern: unknown track → create ObjectItem, observation → *append* to ReportingData (history), location/classification → *upsert*. New real source = new topic + parse function only. `intel-feed.ts` is shared between dummy seed and live streaming.
- **`src/ontology/admission/`** — ontology extension admission pipeline (tiers/kademe 1–3) + governance. The externally visible ontology is `CompositeOntologyProvider` = kernel ⊕ active extension. Local CLI validation: `node dist/ontology/admission/cli.js aday.json` (dummy kernel, no DB).
- **`src/assistant/`** — LLM assistant (OpenAI tool-calling). Every `ObjectSetDef` the LLM produces runs through the normal zod + engine path; invalid queries are rejected and the error is fed back to the LLM. Disabled gracefully when `OPENAI_API_KEY` is missing (`/assistant/status` → `{available:false}`). Tool schemas live in `src/capabilities/`.
- **`src/dashboards/`** — single dashboard system of gadgets (`dashboard-schema.ts`, 10 types, one member list drives both the assistant input and the document schema). `id='sistem'` is virtual: generated in code, PUT/DELETE rejected.
- **`src/reasoning/`** — fusion hardening, threat scoring, ROE/COA engines (has unit tests).
- **Live datasets (`/query/live`)** — a saved board chain re-resolved against current data on every read (user-level VIEW; sibling of materialize snapshots). Definitions are immutable (delete + recreate — makes cycles structurally impossible), candidate defs are smoke-executed before being stored, and resolution is **fail-closed**: a scan-cap-truncated result throws `RESULT_TOO_LARGE` instead of returning silent partial data (materialize also refuses truncated snapshots). Version composes def-content + all referenced dataset versions (+ a 30s wall-clock bucket for relative-time defs); same-version resolutions are cached and concurrent requests share one in-flight execution. Delete is governance-guarded: refused while any live dataset or saved analysis/alert/dashboard references the id. Files: `src/datasets/live-dataset-store.ts`, `src/datasets/composite-dataset-provider.ts`, `src/query/live-datasets.controller.ts`.
- **Persistence pattern** — saved analyses/dashboards use the AnalysesStore pattern: local `.data/` in dev, `GCS_BUCKET` on Cloud Run.

### main.ts gotchas

`bodyParser: false` is intentional: `local-proxy.ts` needs the raw request stream (on Cloud Run with `TUNNEL_BUCKET` set, requests are transparently proxied to a developer's local tunnel; locally the proxy is inert). JSON/urlencoded parsing is added manually after the proxy middleware. There is also SPA↔API route-collision handling: a browser refresh of `/datasets` (Accept: text/html) gets `index.html`, while fetch/XHR gets the API.

## Environment variables

`DATA_BACKEND` (dummy|mim) · `DATABASE_URL` · `MIP_SCAN_LIMIT` (board-engine table scan cap, default 100k) · `LIVE_DATASET_LIMIT` (live dataset resolution row cap, default 100k) · `LIVE_CACHE_MAX_ROWS` (live resolution cache total-row cap, default 200k) · `IZ_SCALE` (seed volume) · `OPENAI_API_KEY` + `ASSISTANT_MODEL` (assistant, optional) · `GCS_BUCKET` (persistence) · `TUNNEL_BUCKET` (Cloud Run proxy only) · `PORT` (default 3000).
