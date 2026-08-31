# Verim — Kubernetes

Düz manifest + kustomize. Compose'daki tüm yığının k8s karşılığı:
StatefulSet'ler (db/graphdb/opensearch — PVC'li), Deployment'lar (redpanda,
3 source, ingest, reasoning, app), tek seferlik Job'lar (seed, graph-load,
search-load). `depends_on` karşılığı initContainer'lardır (db/seed/port bekleme).

## Kurulum

```bash
# 1) İmajı derle ve cluster'ın erişebileceği bir registry'ye it
docker build -f apps/server/Dockerfile -t <REGISTRY>/verim/app:latest .
docker push <REGISTRY>/verim/app:latest

# 2) kustomization.yaml'daki images: bölümüne registry adresini yaz
#    (newName: <REGISTRY>/verim/app)

# 3) secrets.yaml'daki örnek şifreleri değiştir (ya da kubectl create secret)

# 4) Uygula
kubectl apply -k k8s/

# 5) İzle — seed Job'u bitince ingest/reasoning/app kendiliğinden kalkar
kubectl -n verim get pods -w
```

Ingress yoksa hızlı erişim: `kubectl -n verim port-forward svc/app 8080:80`
→ http://localhost:8080

## Notlar

- **Yeniden seed**: `kubectl -n verim delete job seed && kubectl apply -k k8s/`
  (graph-load / search-load için aynı desen).
- **Redpanda ephemeral'dır** (compose'daki gibi): pod yeniden başlarsa
  topic'ler auto-create ile döner, kaynak simülatörleri akışı doldurur.
- **app replicas: 1** — kayıtlı analizler RWO PVC'de (`.data`). Ölçeklemek
  için önce GCS_BUCKET benzeri paylaşımlı kalıcılığa geçilmeli.
- **minikube/k3s**: varsayılan storage class yeterli; imajı registry'siz
  kullanmak için `minikube image load verim-app` / `k3s ctr images import`.
- OpenSearch düğümde `vm.max_map_count` hatası verirse
  `k8s/opensearch.yaml` içindeki yorumlu sysctl init'ini aç.

## Kaynak bütçesi (requests → limits)

| Bileşen | CPU | Bellek |
|---|---|---|
| db (TimescaleDB) | 250m → 2 | 1Gi → 2.5Gi |
| redpanda | 250m → 1 | 512Mi → 700Mi |
| graphdb (Neo4j) | 100m → 1 | 512Mi → 768Mi |
| opensearch | 250m → 1 | 768Mi → 960Mi |
| app | 500m → 2 | 512Mi → 1Gi |
| source ×3 | 50m → 500m | 64Mi → 256Mi |
| ingest | 100m → 1 | 128Mi → 320Mi |
| reasoning | 100m → 1 | 128Mi → 384Mi |
| **Toplam (requests)** | **~1.85 cpu** | **~3.7Gi** |

Tek düğümde rahat çalışma için ~4 vCPU / 8GB düğüm önerilir.
