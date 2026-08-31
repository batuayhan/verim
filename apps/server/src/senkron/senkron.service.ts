import { Inject, Injectable } from '@nestjs/common';
import { OBJECT_SET_ENGINE, type IObjectSetEngine } from '../ontology/object-set-engine';
import type { StoredAnalysis } from '../analyses/analyses-store';
import { ReasoningService } from '../reasoning/reasoning.service';
import {
  bagimlilikSchema,
  gorevSchema,
  type Bagimlilik,
  type GorevDurum,
  type HarekatPlani,
  type PlanGorev,
} from './plan-model';
import { PlanStore } from './plan-store';
import { varsayilanPlan, type SeedVarlik } from './plan-seed';
import {
  bagimlilikDonguYaratir,
  hesaplaCpm,
  klampBaslangic,
  kaynakCakismalari,
  planBitisDk,
  planFarki,
  topluKaydir as engineTopluKaydir,
  yenidenPlanla,
} from './sync-engine';

const CANLI_ID = 'canli';

/**
 * SYNC MATRIX servisi — harekât planını yükler/kaydeder ve deterministik motoru
 * (sync-engine) canlı ontoloji verisiyle besler. Backend-agnostik: platformlar
 * OBJECT_SET_ENGINE portundan gelir. Sensör-to-shooter için COA'yı ReasoningService'ten alır.
 */
@Injectable()
export class SenkronService {
  constructor(
    @Inject(OBJECT_SET_ENGINE) private readonly engine: IObjectSetEngine,
    private readonly store: PlanStore,
    private readonly reasoning: ReasoningService,
  ) {}

  // GEÇMİŞ (undo/redo) — plan başına bellek-içi yığınlar (kap: 25). Her mutasyon
  // öncesi anlık görüntü alınır; yeni değişiklik ileri yığınını temizler.
  // Süreç yeniden başlarsa geçmiş sıfırlanır (demo için kabul edilmiş kısıt).
  private static readonly GECMIS_TAVAN = 25;
  private gecmis = new Map<string, { geri: HarekatPlani[]; ileri: HarekatPlani[] }>();

  private gecmiseYaz(plan: HarekatPlani): void {
    const g = this.gecmis.get(plan.id) ?? { geri: [], ileri: [] };
    g.geri.push(structuredClone(plan));
    if (g.geri.length > SenkronService.GECMIS_TAVAN) g.geri.shift();
    g.ileri = [];
    this.gecmis.set(plan.id, g);
  }

  async geriAl(planId: string) {
    const plan = await this.planCoz(planId);
    if (!plan) return { hata: `Plan bulunamadı: ${planId}` };
    const g = this.gecmis.get(plan.id);
    const onceki = g?.geri.pop();
    if (!onceki) return { hata: 'Geri alınacak değişiklik yok' };
    g!.ileri.push(structuredClone(plan));
    this.kaydet(onceki);
    return this.paket(onceki);
  }

  async ileriAl(planId: string) {
    const plan = await this.planCoz(planId);
    if (!plan) return { hata: `Plan bulunamadı: ${planId}` };
    const g = this.gecmis.get(plan.id);
    const sonraki = g?.ileri.pop();
    if (!sonraki) return { hata: 'İleri alınacak değişiklik yok' };
    g!.geri.push(structuredClone(plan));
    this.kaydet(sonraki);
    return this.paket(sonraki);
  }

  private kaydet(plan: HarekatPlani): void {
    this.store.upsert({ ...plan, name: plan.ad } as unknown as StoredAnalysis);
  }
  private oku(id: string): HarekatPlani | undefined {
    const d = this.store.get(id);
    return d ? (d as unknown as HarekatPlani) : undefined;
  }
  private paket(plan: HarekatPlani) {
    const g = this.gecmis.get(plan.id);
    return {
      plan,
      cpm: hesaplaCpm(plan),
      bitisDk: planBitisDk(plan),
      cakismalar: kaynakCakismalari(plan),
      gecmis: { geri: g?.geri.length ?? 0, ileri: g?.ileri.length ?? 0 },
    };
  }

  private async varliklariYukle(): Promise<SeedVarlik[]> {
    const res = await this.engine.load({
      def: { type: 'base', objectType: 'platform' },
      parameters: {},
      limit: 2000,
    });
    return res.objects
      .filter((p) => p.domain != null)
      .map((p) => ({
        pk: String(p.platform_no),
        ad: String(p.cagri_adi ?? p.platform_no),
        tip: String(p.tip ?? '—'),
        domain: String(p.domain),
        ...(p.enlem != null && p.boylam != null
          ? { enlem: Number(p.enlem), boylam: Number(p.boylam) }
          : {}),
      }));
  }

  /** Canlı planı getir; yoksa ontolojiden türet ve kaydet (H = şimdi). */
  async canliPlan(): Promise<HarekatPlani> {
    const mevcut = this.oku(CANLI_ID);
    if (mevcut) return mevcut;
    const varliklar = await this.varliklariYukle();
    const plan = varsayilanPlan(varliklar, CANLI_ID);
    plan.hEsRefISO = new Date().toISOString();
    this.kaydet(plan);
    return plan;
  }

  private async planCoz(id: string): Promise<HarekatPlani | undefined> {
    return id === CANLI_ID ? await this.canliPlan() : this.oku(id);
  }

  async planPaketi(id = CANLI_ID) {
    const plan = await this.planCoz(id);
    return plan ? this.paket(plan) : { hata: `Plan bulunamadı: ${id}` };
  }

  listele() {
    return this.store.list();
  }

  /** id ya da (kısmi) ad ile görev id'si çöz — AIP isim eşleme. */
  async gorevIdBul(planId: string, gorevId?: string, gorevAd?: string): Promise<string | null> {
    const plan = await this.planCoz(planId);
    if (!plan) return null;
    if (gorevId && plan.gorevler.some((g) => g.id === gorevId)) return gorevId;
    const ara = (gorevAd ?? gorevId ?? '').trim().toLocaleLowerCase('tr');
    if (!ara) return null;
    const tam = plan.gorevler.find((g) => g.ad.toLocaleLowerCase('tr') === ara);
    if (tam) return tam.id;
    return plan.gorevler.find((g) => g.ad.toLocaleLowerCase('tr').includes(ara))?.id ?? null;
  }

  /** Plan özeti (AIP 'oku') — LLM görev id/ad/zaman öğrensin diye. */
  async planOzeti(planId = CANLI_ID) {
    const plan = await this.planCoz(planId);
    if (!plan) return { hata: `Plan bulunamadı: ${planId}` };
    return {
      planId: plan.id,
      ad: plan.ad,
      tur: plan.tur,
      gorevler: plan.gorevler.map((g) => ({
        id: g.id,
        ad: g.ad,
        domain: g.domain,
        baslangicDk: g.baslangicDk,
        sureDk: g.sureDk,
        durum: g.durum,
      })),
    };
  }

  /** Dinamik zaman kaydırma — blok kayınca bağlılar zincirleme ileri kayar. */
  async kaydir(id: string, gorevId: string, baslangicDk: number) {
    const plan = await this.planCoz(id);
    if (!plan) return { hata: `Plan bulunamadı: ${id}` };
    this.gecmiseYaz(plan);
    const { plan: yeni, kaydirilanlar } = yenidenPlanla(plan, gorevId, baslangicDk);
    this.kaydet(yeni);
    return { ...this.paket(yeni), kaydirilanlar };
  }

  /** Görev durumu; 'onayli' → Ontology Action: sahaya icra emri (simüle). */
  async durumGuncelle(id: string, gorevId: string, durum: GorevDurum) {
    const plan = await this.planCoz(id);
    if (!plan) return { hata: `Plan bulunamadı: ${id}` };
    const g = plan.gorevler.find((x) => x.id === gorevId);
    if (!g) return { hata: `Görev bulunamadı: ${gorevId}` };
    this.gecmiseYaz(plan);
    g.durum = durum;
    this.kaydet(plan);
    const emir =
      durum === 'onayli'
        ? { hedef: g.varlikAd ?? g.ad, mesaj: `${g.ad} onaylandı — icra emri ilgili unsura iletildi` }
        : null;
    return { ...this.paket(plan), emir };
  }

  /** What-if: canlı planı bozmadan senaryo dalı türet (baz DONDURULUR). */
  async senaryoTuret(ad?: string) {
    const baz = await this.canliPlan();
    let id = `senaryo-${Date.now().toString(36)}`;
    for (let n = 1; this.oku(id); n++) id = `senaryo-${Date.now().toString(36)}-${n}`; // çakışma güvenli
    const senaryo: HarekatPlani = {
      ...structuredClone(baz),
      id,
      ad: ad?.trim() || `${baz.ad} — What-if`,
      tur: 'senaryo',
      temelPlanId: baz.id,
      // dallanma anındaki baz kopyası dondurulur
      bazGorevler: structuredClone(baz.gorevler),
      bazBagimliliklar: structuredClone(baz.bagimliliklar),
    };
    this.kaydet(senaryo);
    return this.paket(senaryo);
  }

  /** Senaryo ↔ DONDURULMUŞ baz farkı (kayan-baz yerine dallanma anı). */
  async senaryoFark(id: string) {
    const senaryo = this.oku(id);
    if (!senaryo || senaryo.tur !== 'senaryo') return { hata: 'Senaryo bulunamadı' };
    const baz: HarekatPlani = {
      ...senaryo,
      gorevler: senaryo.bazGorevler ?? [],
      bagimliliklar: senaryo.bazBagimliliklar ?? [],
    };
    return planFarki(baz, senaryo);
  }

  sil(id: string) {
    if (id === CANLI_ID) return { hata: 'Canlı plan silinemez' };
    return { silindi: this.store.delete(id) };
  }

  /** Ontoloji varlıkları — frontend'in görev-atama açılır listeleri için. */
  async varliklar(): Promise<SeedVarlik[]> {
    return this.varliklariYukle();
  }

  /** Plan mutasyonu için ortak sarmalayıcı: çöz → değiştir → kaydet → paketle. */
  private async guncelle(
    planId: string,
    mutate: (p: HarekatPlani) => void | { hata: string },
  ) {
    const plan = await this.planCoz(planId);
    if (!plan) return { hata: `Plan bulunamadı: ${planId}` };
    this.gecmiseYaz(plan); // mutasyondan ÖNCE anlık görüntü
    const r = mutate(plan);
    if (r && 'hata' in r) {
      this.gecmis.get(plan.id)?.geri.pop(); // mutasyon reddedildi → kaydı geri çek
      return r;
    }
    this.kaydet(plan);
    return this.paket(plan);
  }

  /** Görev numarası: tür önekli sıra (ATO mission-number deseni, deterministik). */
  private gorevNoUret(plan: HarekatPlani, tur: PlanGorev['tur']): string {
    const onek: Record<string, string> = {
      angajman: 'ANG',
      kesif: 'ISR',
      elektronik_harp: 'EW', // EH bir yetenek; SEAD bir görevdir — otomatik seri EW-x
      hareket: 'MOV',
      lojistik: 'LOG',
      kilometre_tasi: 'MST',
      gorev: 'MSN',
    };
    const p = onek[tur] ?? 'MSN';
    const enBuyuk = plan.gorevler
      .map((g) => (g.gorevNo?.startsWith(`${p}-`) ? Number(g.gorevNo.slice(p.length + 1)) : 0))
      .reduce((a, b) => (Number.isFinite(b) ? Math.max(a, b) : a), 100);
    return `${p}-${enBuyuk + 1}`;
  }

  async gorevEkle(planId: string, girdi: Partial<PlanGorev>) {
    return this.guncelle(planId, (plan) => {
      const id = girdi.id?.trim() || `g-${Date.now().toString(36)}`;
      if (plan.gorevler.some((g) => g.id === id)) return { hata: `Görev id çakışması: ${id}` };
      const tur = girdi.tur ?? 'gorev';
      const parsed = gorevSchema.safeParse({
        id,
        ad: girdi.ad?.trim() || 'Yeni görev',
        domain: girdi.domain || 'Hava',
        varlikId: girdi.varlikId,
        varlikAd: girdi.varlikAd,
        tur,
        baslangicDk: Math.round(girdi.baslangicDk ?? 0),
        sureDk: Math.max(0, Math.round(girdi.sureDk ?? 20)),
        durum: girdi.durum ?? 'planli',
        gerekce: girdi.gerekce,
        kaynak: girdi.kaynak ?? 'operator',
        // taktik alanlar (ATO görev kartı) — hepsi opsiyonel geçiş
        gorevNo: girdi.gorevNo ?? this.gorevNoUret(plan, tur),
        cagriAdi: girdi.cagriAdi,
        oncelik: girdi.oncelik,
        istenenEtki: girdi.istenenEtki,
        konum: girdi.konum,
        bolgeYaricapKm: girdi.bolgeYaricapKm,
        hedefKonum: girdi.hedefKonum,
        kontrolMakami: girdi.kontrolMakami,
        frekans: girdi.frekans,
        muhimmat: girdi.muhimmat,
        hedefIz: girdi.hedefIz,
      });
      if (!parsed.success) return { hata: `Geçersiz görev: ${parsed.error.issues[0]?.message}` };
      plan.gorevler.push(parsed.data);
    });
  }

  async gorevGuncelle(planId: string, gorevId: string, yama: Record<string, unknown>) {
    return this.guncelle(planId, (plan) => {
      const idx = plan.gorevler.findIndex((x) => x.id === gorevId);
      if (idx < 0) return { hata: `Görev bulunamadı: ${gorevId}` };
      const birlesik: Record<string, unknown> = { ...plan.gorevler[idx], ...yama, id: gorevId };
      // null = alanı SİL (taktik kart temizleme sözleşmesi) — bayat veri kalmaz
      for (const [k, v] of Object.entries(yama)) if (v === null) delete birlesik[k];
      const parsed = gorevSchema.safeParse(birlesik);
      if (!parsed.success) return { hata: `Geçersiz görev: ${parsed.error.issues[0]?.message}` };
      // Object.assign silinen anahtarı kaldırmaz → dizi elemanını DEĞİŞTİR
      plan.gorevler[idx] = parsed.data;
    });
  }

  async gorevSil(planId: string, gorevId: string) {
    return this.guncelle(planId, (plan) => {
      const vardi = plan.gorevler.length;
      plan.gorevler = plan.gorevler.filter((x) => x.id !== gorevId);
      if (plan.gorevler.length === vardi) return { hata: `Görev bulunamadı: ${gorevId}` };
      plan.bagimliliklar = plan.bagimliliklar.filter(
        (d) => d.oncekiId !== gorevId && d.sonrakiId !== gorevId,
      );
    });
  }

  async bagimlilikEkle(planId: string, dep: Bagimlilik) {
    return this.guncelle(planId, (plan) => {
      const parsed = bagimlilikSchema.safeParse(dep);
      if (!parsed.success) return { hata: 'Geçersiz bağımlılık' };
      const d = parsed.data;
      if (
        !plan.gorevler.some((g) => g.id === d.oncekiId) ||
        !plan.gorevler.some((g) => g.id === d.sonrakiId)
      )
        return { hata: 'Görev(ler) bulunamadı' };
      if (plan.bagimliliklar.some((x) => x.oncekiId === d.oncekiId && x.sonrakiId === d.sonrakiId))
        return { hata: 'Bu bağımlılık zaten var' };
      if (bagimlilikDonguYaratir(plan, d)) return { hata: 'Bu bağımlılık döngü yaratır' };
      plan.bagimliliklar.push(d);
    });
  }

  async bagimlilikSil(planId: string, oncekiId: string, sonrakiId: string) {
    return this.guncelle(planId, (plan) => {
      plan.bagimliliklar = plan.bagimliliklar.filter(
        (d) => !(d.oncekiId === oncekiId && d.sonrakiId === sonrakiId),
      );
    });
  }

  /**
   * ASİSTAN BAĞLAMI — LLM'in aksiyon üretmek için ihtiyacı olan HER ŞEY:
   * aktif planın tam hâli (görevler + bağımlılıklar), CPM/ihlal/çakışma,
   * atanabilir varlıklar, plan listesi (senaryolar), geçmiş sayaçları.
   */
  async asistanBaglami(planId = CANLI_ID) {
    const plan = await this.planCoz(planId);
    if (!plan) return { hata: `Plan bulunamadı: ${planId}` };
    const p = this.paket(plan);
    const varliklar = await this.varliklariYukle();
    return {
      plan: {
        id: plan.id,
        ad: plan.ad,
        tur: plan.tur,
        temelPlanId: plan.temelPlanId,
        bitisDk: p.bitisDk,
        gorevler: plan.gorevler.slice(0, 80).map((g) => ({
          id: g.id, ad: g.ad, domain: g.domain, tur: g.tur,
          baslangicDk: g.baslangicDk, sureDk: g.sureDk, durum: g.durum,
          varlikAd: g.varlikAd, hedefIz: g.hedefIz,
        })),
        bagimliliklar: plan.bagimliliklar,
      },
      kritikYol: p.cpm.kritikYol,
      ihlaller: p.cpm.ihlaller.map((i) => i.mesaj),
      kaynakCakismalari: p.cakismalar.map((c) => c.mesaj),
      gecmis: p.gecmis,
      varliklar: varliklar.slice(0, 80).map((v) => ({ pk: v.pk, ad: v.ad, domain: v.domain, tip: v.tip })),
      planlar: this.listele().map((x) => ({ id: x.id, ad: x.name })),
    };
  }

  /** H-SAATİ AYARI — harekât başlangıcının mutlak zamanı (tüm H± bu ana göre). */
  async hSaatiAyarla(planId: string, iso: string) {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return { hata: `Geçersiz tarih: ${iso}` };
    return this.guncelle(planId, (plan) => {
      plan.hEsRefISO = new Date(t).toISOString();
    });
  }

  /** Satır (varlık) sıralaması — Gantt'ta sürükle-bırak sonucu kalıcılaşır. */
  async satirSirala(planId: string, sira: string[]) {
    return this.guncelle(planId, (plan) => {
      plan.satirSirasi = sira.filter((s) => typeof s === 'string').slice(0, 600);
    });
  }

  /** Toplu kaydırma (opsiyonel domain) — "tüm birimleri 15 dk geri çek". */
  async topluKaydir(planId: string, deltaDk: number, domain?: string) {
    const plan = await this.planCoz(planId);
    if (!plan) return { hata: `Plan bulunamadı: ${planId}` };
    this.gecmiseYaz(plan);
    const yeni = engineTopluKaydir(plan, deltaDk, domain);
    this.kaydet(yeni);
    return this.paket(yeni);
  }

  /** Senaryoyu CANLI plana TERFİ ettir (görev + bağımlılıkları canlıya yazar). */
  async promote(senaryoId: string) {
    const senaryo = this.oku(senaryoId);
    if (!senaryo || senaryo.tur !== 'senaryo') return { hata: 'Terfi için geçerli senaryo gerekir' };
    const canli = await this.canliPlan();
    this.gecmiseYaz(canli); // yanlış terfi tek tuşla GERİ ALINABİLİR
    canli.gorevler = structuredClone(senaryo.gorevler);
    canli.bagimliliklar = structuredClone(senaryo.bagimliliklar);
    this.kaydet(canli);
    return this.paket(canli);
  }

  /**
   * PLAN GEO — görevlerin coğrafi izdüşümü (Kairos↔Gaia deseni): varlıklı her
   * görev varlığının GÜNCEL konumunda bir nokta; hedefIz'li angajman görevleri
   * atıcı→hedef rotası (çizgi) + hedef noktası. Harita "Senkronizasyon" katmanı
   * bu GeoJSON'u çizer; konumlar her çağrıda ontolojiden taze okunur.
   */
  async planGeo(planId = CANLI_ID) {
    const plan = await this.planCoz(planId);
    if (!plan) return { hata: `Plan bulunamadı: ${planId}` };

    const platRes = await this.engine.load({
      def: { type: 'base', objectType: 'platform' },
      parameters: {},
      limit: 2000,
    });
    const konum = new Map(
      platRes.objects
        .filter((p) => p.enlem != null && p.boylam != null)
        .map((p) => [String(p.platform_no), { enlem: Number(p.enlem), boylam: Number(p.boylam) }]),
    );

    // Hedef izlerin güncel konumları (yalnız plandaki hedefler)
    const hedefler = [...new Set(plan.gorevler.map((g) => g.hedefIz).filter(Boolean))] as string[];
    const izKonum = new Map<string, { enlem: number; boylam: number }>();
    if (hedefler.length) {
      const izRes = await this.engine.load({
        def: {
          type: 'filter',
          base: { type: 'base', objectType: 'iz' },
          combinator: 'and',
          conditions: [
            {
              id: 'h',
              column: 'iz_no',
              operator: 'in',
              values: hedefler.map((v) => ({ kind: 'literal' as const, value: v })),
            },
          ],
        },
        parameters: {},
        limit: hedefler.length + 10,
      });
      for (const o of izRes.objects)
        if (o.enlem != null)
          izKonum.set(String(o.iz_no), { enlem: Number(o.enlem), boylam: Number(o.boylam) });
    }

    type Feature = {
      type: 'Feature';
      geometry:
        | { type: 'Point'; coordinates: [number, number] }
        | { type: 'LineString'; coordinates: [number, number][] }
        | { type: 'Polygon'; coordinates: [number, number][][] };
      properties: Record<string, unknown>;
    };
    // Coğrafi daire → Polygon (görev bölgesi / killbox çemberi; ~enlem düzeltmeli)
    const daire = (m: { enlem: number; boylam: number }, km: number, n = 48): [number, number][][] => {
      const dLat = km / 110.574;
      const dLon = km / (111.32 * Math.cos((m.enlem * Math.PI) / 180));
      const ring: [number, number][] = [];
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * 2 * Math.PI;
        ring.push([m.boylam + dLon * Math.cos(a), m.enlem + dLat * Math.sin(a)]);
      }
      return [ring];
    };
    const features: Feature[] = [];
    for (const g of plan.gorevler) {
      if (g.durum === 'iptal') continue;
      const ozellik = {
        gorevId: g.id,
        ad: g.ad,
        // harita etiketi: görev no varsa "SEAD-301 · ad" (ATO okunuşu)
        etiket: g.gorevNo ? `${g.gorevNo} · ${g.ad}` : g.ad,
        tur: g.tur,
        durum: g.durum,
        baslangicDk: g.baslangicDk,
        sureDk: g.sureDk,
        varlikId: g.varlikId ?? null,
        varlikAd: g.varlikAd ?? null,
        gorevNo: g.gorevNo ?? null,
        cagriAdi: g.cagriAdi ?? null,
        oncelik: g.oncelik ?? null,
        istenenEtki: g.istenenEtki ?? null,
      };
      // Görev noktası: açıkça verilen taktik konum > varlığın canlı konumu
      const vk = g.konum ?? (g.varlikId ? konum.get(g.varlikId) : undefined);
      if (vk) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [vk.boylam, vk.enlem] },
          properties: { ...ozellik, rol: 'gorev' },
        });
        // Görev bölgesi çemberi (ROZ/killbox benzeri)
        if (g.bolgeYaricapKm) {
          features.push({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: daire(vk, g.bolgeYaricapKm) },
            properties: {
              ...ozellik,
              rol: 'bolge',
              yaricapKm: g.bolgeYaricapKm,
              // Ateş destek koordinasyon anlamı (tam FSCM/ACM #94'te) — asgari ibare
              koordinasyon: `Görev koordinasyon alanı · r=${g.bolgeYaricapKm} km`,
            },
          });
        }
      }
      // Hedef önceliği hedefleme türüne bağlı:
      //  • angajman (dinamik hedefleme) → hareketli hedefin CANLI izi esas
      //  • diğer görevler (deliberate) → sabit koordinat (DMPI) esas
      const izK = g.hedefIz ? izKonum.get(g.hedefIz) : undefined;
      const hk = g.tur === 'angajman' ? (izK ?? g.hedefKonum) : (g.hedefKonum ?? izK);
      if (hk) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [hk.boylam, hk.enlem] },
          properties: { ...ozellik, rol: 'hedef', hedefIz: g.hedefIz ?? null },
        });
        if (vk) {
          features.push({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [vk.boylam, vk.enlem],
                [hk.boylam, hk.enlem],
              ],
            },
            properties: { ...ozellik, rol: 'rota', hedefIz: g.hedefIz ?? null },
          });
        }
      }
    }
    return { type: 'FeatureCollection' as const, features };
  }

  /** SENSÖRDEN ATICIYA — tehdit → COA → plana otomatik angajman görevi ekle. */
  async sensorToShooter(izNo: string, planId = CANLI_ID) {
    const coa = await this.reasoning.coaUret(izNo);
    if ('hata' in coa) return coa;
    const plan = await this.planCoz(planId);
    if (!plan) return { hata: `Plan bulunamadı: ${planId}` };
    this.gecmiseYaz(plan);
    const o = coa.oneri;
    const varliklar = await this.varliklariYukle();
    const domain = varliklar.find((v) => v.pk === o?.varlikPk)?.domain ?? 'Hava';
    const nowDk = plan.hEsRefISO
      ? klampBaslangic(Math.round((Date.now() - Date.parse(plan.hEsRefISO)) / 60000))
      : 0;
    const sure = Math.min(240, Math.max(1, Math.round(Number(o?.kesismeDk ?? 15) || 15)));
    // İSTENEN ETKİ + ÖNCELİK: ROE hiyerarşisi ve COA angajman tipinden türetilir
    // (JP 3-60 etki-tabanlı hedefleme; koşulsuz imha ROE'yi ihlal eder).
    const tip = o?.angajmanTipi;
    let istenenEtki: PlanGorev['istenenEtki'];
    let oncelik: number;
    if (coa.roeDurumu === 'yasak' || tip === 'İzle-Takip' || tip === 'Uyar') {
      istenenEtki = 'tespit'; // yalnız takip/gölgeleme — kinetik yetki yok
      oncelik = 3;
    } else if (coa.roeDurumu === 'kısıtlı' || tip === 'Önle/Durdur') {
      istenenEtki = 'etkisizlestirme'; // önle/durdur — imha değil
      oncelik = 2;
    } else {
      istenenEtki = 'imha'; // serbest ROE + Etkisiz Hale Getir
      oncelik = 1;
    }
    const gid = `angaj-${izNo}`.replace(/[^a-zA-Z0-9-]/g, '');
    const yeni: PlanGorev = {
      id: gid,
      ad: `Angajman: ${izNo}${o?.varlik ? ` ← ${o.varlik}` : ''}`,
      domain, // atıcının gerçek domaini (sahte 'Angajman' domaini değil)
      varlikId: o?.varlikPk ?? undefined,
      varlikAd: o?.varlik ?? undefined,
      tur: 'angajman',
      baslangicDk: nowDk, // "şimdi" (H-saatine göre), sabit H+0 değil
      sureDk: sure,
      durum: 'planli',
      gerekce: `ROE ${coa.roeDurumu} · ${o?.angajmanTipi ?? '—'} · başarı %${o?.basariYuzde ?? 0}`,
      kaynak: 'sensor-to-shooter',
      hedefIz: izNo, // harita: atıcı → hedef rotası bu bağla çizilir
      // taktik kart: sensörden-atıcıya görevleri doğuştan zengin gelir
      gorevNo: this.gorevNoUret(plan, 'angajman'),
      cagriAdi: o?.varlik ?? undefined,
      oncelik, // ROE + angajman tipinden türetildi (koşulsuz P1 değil)
      istenenEtki, // ROE hiyerarşisine saygılı istenen etki
      muhimmat: o?.angajmanTipi ?? undefined,
    };
    plan.gorevler = [...plan.gorevler.filter((g) => g.id !== gid), yeni];
    this.kaydet(plan);
    return { ...this.paket(plan), yeniGorev: yeni };
  }
}
