import { Inject, Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { ApiError } from '../common/api-error';
import type { DatasetSummary } from '../contract/api';
import { QUERY_ENGINE, type QueryEngine } from '../query/query-engine';
import { type DatasetProvider, type DatasetRecord } from './dataset-provider';
import {
  LiveDatasetsStore,
  referencedDatasetIds,
  type LiveDatasetDef,
} from './live-dataset-store';

/**
 * Çekirdek (dummy/mim) adapter'ın DI token'ı — ontoloji katmanındaki
 * KERNEL_ONTOLOGY_PROVIDER deseninin birebir karşılığı. DATASET_PROVIDER
 * artık CompositeDatasetProvider'ı gösterir; dummy/mim seçimi bu token'da
 * yapılır.
 */
export const KERNEL_DATASET_PROVIDER = Symbol('KERNEL_DATASET_PROVIDER');

/** Canlı dataset çözümünün satır tavanı — materialize ile aynı varsayılan. */
const LIVE_LIMIT = Number(process.env.LIVE_DATASET_LIMIT ?? 100_000);
/** kernel.list() memo süresi (mim'de view başına count(*) atar). */
const KERNEL_LIST_TTL_MS = 2_000;
/**
 * Çözüm önbelleğinin TOPLAM satır tavanı (girdi sayısı değil — kayıt başına
 * 100k satır olabilir; sayıyla sınırlamak Cloud Run'da OOM riskidir).
 */
const MAX_CACHED_ROWS = Number(process.env.LIVE_CACHE_MAX_ROWS ?? 200_000);
/**
 * Göreli zaman ("son N dk") içeren tarifler duvar saatine bağlıdır — sürüm
 * bu kova ile damgalanır ki önbellek en geç bu aralıkta tazelensin. Aksi
 * halde kaynak değişmeyen bir "son 1 saat" tarifi süresiz bayat kalırdı.
 */
const RELATIVE_BUCKET_MS = 30_000;

/** Tarif duvar saatine bağlı mı? (filter board'larında relative değer) */
function zamanaDuyarli(def: Pick<LiveDatasetDef, 'boards'>): boolean {
  return def.boards.some(
    (b) =>
      b.type === 'filter' &&
      b.conditions.some((c) => c.values.some((v) => v.kind === 'relative')),
  );
}

/**
 * ÇEKİRDEK ⊕ CANLI dataset sağlayıcısı.
 *
 * Kernel dataset'ler (ve materialize anlık görüntüleri) aynen çekirdekten
 * gelir; canlı dataset'ler ise okunma ANINDA, kayıtlı board zinciri gerçek
 * QUERY_ENGINE ile (mim'de SQL pushdown dahil) çalıştırılarak üretilir.
 * Hiç canlı tanım yokken sağlayıcı çekirdeğe SAF GEÇİRGENDİR (memo dahil
 * hiçbir ek katman devreye girmez) — ontoloji composite'inin bayrak-kapalı
 * bit-değişmezlik ilkesinin karşılığı.
 *
 * Tasarım kararları:
 *  - Motor, DI döngüsünü kırmak için ModuleRef ile TEMBEL alınır
 *    (QUERY_ENGINE → DATASET_PROVIDER → composite → QUERY_ENGINE). Gizli
 *    bağımlılık: QueryModule yüklü olmalı — değilse açık hata fırlatılır.
 *  - Sürüm dürüstlüğü: canlı sürüm; tarifin İÇERİĞİNDEN (aynı id'ye farklı
 *    tarif → farklı sürüm), başvurulan TÜM dataset'lerin sürümlerinden ve
 *    tarif göreli-zamanlıysa duvar saati kovasından türetilir. Kaynak
 *    watermark'ı ilerleyince canlı sürüm de değişir → frontend dürüstçe
 *    tazelenir.
 *  - Önbellek: aynı sürüm için zincir yeniden koşulmaz; toplam satır tavanı
 *    (LIVE_CACHE_MAX_ROWS) aşılınca en eski erişilen düşer.
 *  - FAIL-CLOSED: çözüm tavana takılırsa (kısmi sonuç) kayıt DÖNÜLMEZ,
 *    RESULT_TOO_LARGE fırlatılır. Askeri bağlamda kırpılmış veri üzerinden
 *    sessizce hesap yapılmaz — ya tam sonuç ya açık red.
 *  - Döngü kalkanı: tanımlar değişmez olduğundan döngü normalde kurulamaz;
 *    yine de AsyncLocalStorage ile çözüm-içi yeniden giriş yakalanır
 *    (savunma katmanı — eşzamanlı isteklerde birbirine karışmaz).
 */
@Injectable()
export class CompositeDatasetProvider implements DatasetProvider {
  private readonly log = new Logger('LiveDatasets');
  private readonly inFlight = new AsyncLocalStorage<ReadonlySet<string>>();
  private engineRef: QueryEngine | null = null;
  private readonly cache = new Map<
    string,
    { version: string; record: DatasetRecord }
  >();
  /** Uçuştaki çözümler — aynı sürüme eşzamanlı N istek TEK zincir koşturur */
  private readonly resolving = new Map<string, Promise<DatasetRecord>>();
  /**
   * Sürüm-anahtarlı hata memosu: tavana takılan (pahalı) bir çözüm, aynı
   * sürümde tekrar tekrar denenip veritabanını dövmesin — sürüm ilerleyince
   * otomatik affedilir.
   */
  private readonly failMemo = new Map<
    string,
    { version: string; error: unknown }
  >();
  private kernelListCache: { at: number; summaries: DatasetSummary[] } | null =
    null;
  private kernelListPending: Promise<DatasetSummary[]> | null = null;

  constructor(
    @Inject(KERNEL_DATASET_PROVIDER) private readonly kernel: DatasetProvider,
    private readonly store: LiveDatasetsStore,
    private readonly moduleRef: ModuleRef,
  ) {}

  private engine(): QueryEngine {
    if (!this.engineRef) {
      try {
        this.engineRef = this.moduleRef.get<QueryEngine>(QUERY_ENGINE, {
          strict: false,
        });
      } catch {
        throw new Error(
          'QUERY_ENGINE çözülemedi — canlı dataset çözümü QueryModule ister ' +
            '(DatasetsModule tek başına yüklendiyse canlı dataset kullanılamaz)',
        );
      }
    }
    return this.engineRef;
  }

  private listKernel(): Promise<DatasetSummary[]> {
    if (
      this.kernelListCache &&
      Date.now() - this.kernelListCache.at <= KERNEL_LIST_TTL_MS
    ) {
      return Promise.resolve(this.kernelListCache.summaries);
    }
    // Uçuşta bir list varsa ona bin — TTL sınırını aynı anda geçen N istek
    // N ayrı count(*) zinciri koşturmasın (mim'de view başına count atılır)
    if (!this.kernelListPending) {
      this.kernelListPending = this.kernel
        .list()
        .then((summaries) => {
          this.kernelListCache = { at: Date.now(), summaries };
          return summaries;
        })
        .finally(() => {
          this.kernelListPending = null;
        });
    }
    return this.kernelListPending;
  }

  async list(): Promise<DatasetSummary[]> {
    // Canlı tanım yokken saf geçirgenlik: memo dahil hiçbir katman girmez
    const defs = this.store.defs();
    if (defs.length === 0) return this.kernel.list();

    const kernel = await this.listKernel();
    const byId = new Map(kernel.map((s) => [s.id, s] as const));
    const live: DatasetSummary[] = [];
    for (const def of defs) {
      if (byId.has(def.id)) continue; // kernel gölgelenemez (3. bacak)
      try {
        const version = this.composedVersion(def, byId);
        const cached = this.cache.get(def.id);
        const fresh =
          cached && cached.version === version ? cached.record : null;
        live.push({
          id: def.id,
          label: def.name,
          // rowCount liste görünümünde bilgi amaçlıdır; taze çözüm yoksa son
          // bilinen değer gösterilir (get() her zaman güncel hesaplar).
          rowCount: fresh ? fresh.summary.rowCount : def.cachedRowCount,
          lastUpdated: fresh ? fresh.summary.lastUpdated : def.createdAt,
          version,
        });
      } catch (e) {
        // Bozuk tek tanım (elle bozulmuş live-datasets.json vb.) kernel
        // listesini rehin alamaz — logla ve o tanımı listeden düşür.
        this.log.error(
          `Canlı tanım '${def?.id ?? '?'}' listelenemedi: ${(e as Error).message}`,
        );
      }
    }
    return [...kernel, ...live];
  }

  async get(datasetId: string): Promise<DatasetRecord | undefined> {
    const kernelRecord = await this.kernel.get(datasetId);
    if (kernelRecord) return kernelRecord; // kernel gölgelenemez

    const def = this.store.def(datasetId);
    if (!def) return undefined;
    return this.resolveDef(def);
  }

  async add(record: DatasetRecord): Promise<void> {
    if (this.store.def(record.summary.id)) {
      throw ApiError.invalidBoard(
        `'${record.summary.id}' bir canlı dataset — üzerine anlık görüntü yazılamaz`,
      );
    }
    await this.kernel.add(record);
    this.kernelListCache = null; // yeni türev dataset listede hemen görünsün
  }

  /**
   * Bir tanımı GÜNCEL veriye karşı çözer. Tanımın store'da kayıtlı olması
   * gerekmez — oluşturma ucu, adayı ÖNCE burada doğrulayıp (motor hataları,
   * eksik parametre, tavan) ancak başarılıysa saklar (kabul hattı felsefesi:
   * çalışmayan tarif sisteme girmez).
   */
  async resolveDef(def: LiveDatasetDef): Promise<DatasetRecord> {
    const active = this.inFlight.getStore() ?? new Set<string>();
    if (active.has(def.id)) {
      throw ApiError.invalidBoard(
        `Canlı dataset döngüsü: '${def.id}' kendi zincirinin içinden yeniden çözülüyor`,
      );
    }

    const byId = new Map(
      (await this.listKernel()).map((s) => [s.id, s] as const),
    );
    const version = this.composedVersion(def, byId);

    const cached = this.cache.get(def.id);
    if (cached && cached.version === version) {
      // Gerçek recency: okunan girdi Map sırasının sonuna taşınır
      this.cache.delete(def.id);
      this.cache.set(def.id, cached);
      return cached.record;
    }

    // Bilinen başarısızlık aynı sürümde yeniden ödenmez (tavan aşımı gibi
    // pahalı hatalar sürüm içinde deterministiktir; sürüm ilerleyince
    // otomatik affedilir). Bozuk canlı dataset'i poll'layan istemci DB'yi
    // dövemez.
    const failed = this.failMemo.get(def.id);
    if (failed && failed.version === version) throw failed.error;

    // STAMPEDE ÖNLEMİ: aynı sürümün çözümü uçuştaysa ona bin — eşzamanlı N
    // istek (ör. 6 kartlı dashboard açılışı) tek zincir koşturur. (Paylaşılan
    // promise farklı çağıran bağlamlarında da güvenlidir: tanımlar değişmez
    // olduğundan sonuç bağlamdan bağımsızdır.)
    const key = `${def.id}@${version}`;
    const pending = this.resolving.get(key);
    if (pending) return pending;

    const run = this.executeDef(def, version, active)
      .catch((error: unknown) => {
        this.failMemo.set(def.id, { version, error });
        throw error;
      })
      .finally(() => {
        this.resolving.delete(key);
      });
    this.resolving.set(key, run);
    return run;
  }

  private async executeDef(
    def: LiveDatasetDef,
    version: string,
    active: ReadonlySet<string>,
  ): Promise<DatasetRecord> {
    const started = Date.now();
    const nextActive = new Set(active);
    nextActive.add(def.id);
    const result = await this.inFlight.run(nextActive, () =>
      this.engine().execute({
        datasetId: def.sourceDatasetId,
        boards: def.boards,
        targetBoardIndex:
          def.boards.length > 0 ? def.boards.length - 1 : undefined,
        parameters: def.parameters,
        limit: LIVE_LIMIT,
      }),
    );

    if (result.truncated || result.totalRows > result.rows.length) {
      throw new ApiError({
        code: 'RESULT_TOO_LARGE',
        message:
          `Canlı dataset '${def.id}' güncel veride tavana takıldı ` +
          `(${result.totalRows} satır; tavan ${LIVE_LIMIT}). Kısmi sonuç ` +
          `üzerinden hesap yapılmaz — zinciri daraltın veya anlık görüntü ` +
          `(materialize) kullanın.`,
      });
    }

    const record: DatasetRecord = {
      summary: {
        id: def.id,
        label: def.name,
        rowCount: result.rows.length,
        lastUpdated: new Date().toISOString(),
        version,
      },
      schema: result.schema,
      rows: result.rows,
    };

    this.cacheSet(def.id, version, record);
    this.failMemo.delete(def.id);
    this.log.debug(
      `'${def.id}' çözüldü: ${record.rows.length} satır, ${Date.now() - started}ms (${version})`,
    );
    return record;
  }

  /**
   * Satır-ağırlıklı önbellek yazımı: toplam satır tavanı aşılırsa en eski
   * ERİŞİLEN girdiler düşer (okumalar girdiyi sona taşıdığı için Map sırası
   * recency verir). Yeni yazılan girdi asla atılmaz — en güncel sonuç kalır.
   */
  private cacheSet(id: string, version: string, record: DatasetRecord): void {
    this.cache.delete(id);
    this.cache.set(id, { version, record });
    let toplamSatir = 0;
    for (const e of this.cache.values()) toplamSatir += e.record.rows.length;
    for (const [eski, girdi] of this.cache) {
      if (toplamSatir <= MAX_CACHED_ROWS || this.cache.size === 1) break;
      if (eski === id) continue;
      this.cache.delete(eski);
      toplamSatir -= girdi.record.rows.length;
    }
  }

  /** Silme sonrası çözüm önbelleğini ve hata memosunu düşürür (bellek hijyeni). */
  invalidate(datasetId: string): void {
    this.cache.delete(datasetId);
    this.failMemo.delete(datasetId);
  }

  /**
   * Canlı sürüm üç bileşenden türetilir:
   *  1. Tarifin içeriği (kaynak + board'lar + parametreler) — aynı id'yi
   *     kazara paylaşan iki farklı tarif aynı sürümü ASLA üretemez
   *     (önbellek zehirlenmesine karşı).
   *  2. Başvurulan tüm dataset'lerin sürümleri — canlı-üstüne-canlı
   *     referanslar yol-semantiğiyle özyinelemeli açılır; kayıp referans da
   *     sürüme yazılır ki kaynak silinip geri gelirse sürüm değişsin.
   *  3. Tarif göreli-zamanlıysa duvar saati kovası (RELATIVE_BUCKET_MS) —
   *     "son 1 saat" tarifi kaynak değişmese de en geç 30 sn'de tazelenir.
   */
  private composedVersion(
    def: LiveDatasetDef,
    kernelById: Map<string, DatasetSummary>,
    path: Set<string> = new Set(),
  ): string {
    path.add(def.id);
    const parts: string[] = [
      `def=${createHash('sha256')
        .update(
          JSON.stringify({
            s: def.sourceDatasetId,
            b: def.boards,
            p: def.parameters,
          }),
        )
        .digest('hex')
        .slice(0, 12)}`,
    ];
    if (zamanaDuyarli(def)) {
      parts.push(`t=${Math.floor(Date.now() / RELATIVE_BUCKET_MS)}`);
    }
    for (const ref of referencedDatasetIds(def)) {
      const kernel = kernelById.get(ref);
      if (kernel) {
        parts.push(`${ref}=${kernel.version}`);
        continue;
      }
      const liveRef = this.store.def(ref);
      if (!liveRef) parts.push(`${ref}=missing`);
      else if (path.has(ref)) parts.push(`${ref}=cycle`);
      else
        parts.push(`${ref}=${this.composedVersion(liveRef, kernelById, path)}`);
    }
    path.delete(def.id); // yol semantiği: elmas referans 'cycle' sayılmaz
    const hash = createHash('sha256')
      .update(parts.sort().join('|'))
      .digest('hex')
      .slice(0, 12);
    return `live-${hash}`;
  }
}
