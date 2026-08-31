import { Inject, Injectable } from '@nestjs/common';
import type { ObjectSetDef } from '../contract/mercek';
import { OBJECT_SET_ENGINE, type IObjectSetEngine } from '../ontology/object-set-engine';
import {
  COA_ENGINE,
  type CoaEngine,
  type CoaSonuc,
  type Hedef,
  type RoeConfig,
  type Varlik,
} from './coa-engine';
import { senkronizasyonKur, type GorevGirdi, type SenkMatris, type VarlikOzet } from './senk-matris';
import { TtlMemo } from './ttl-memo';

/** Poll tikinde tekrar eden ağır yüklerin ortak önbellek süresi (ms). */
const MEMO_TTL_MS = 2500;

/**
 * Akıl yürütme servisi — deterministik motorları (COA_ENGINE, ileride
 * THREAT_SCORER) OBJECT_SET_ENGINE portu üzerinden CANLI veriyle besler.
 * Backend-agnostik: dummy ve mim aynı port arkasından çalışır.
 *
 * Ontoloji köprüsü: v_iz `siniflandirma`yı display (Dost/Düşman) verir; motor
 * kod bekler — eşleme YALNIZ burada (ontoloji katmanı ile motor arası köprü),
 * pipeline'a sızmaz. Platform angajman menzili ontolojide yok; domain bazlı
 * varsayılan (config) — gerçek silah-menzili verisi geldiğinde buradan beslenir.
 */

const SINIF_KOD: Record<string, string> = {
  Dost: 'FR',
  Düşman: 'HO',
  Şüpheli: 'SUSPECT',
  Bilinmeyen: 'UNK',
};

/** Domain bazlı varsayılan angajman menzili (km) — silah-menzili verisi gelene dek */
const MENZIL_KM: Record<string, number> = { Hava: 150, Deniz: 80, Kara: 40 };

@Injectable()
export class ReasoningService {
  constructor(
    @Inject(OBJECT_SET_ENGINE) private readonly engine: IObjectSetEngine,
    @Inject(COA_ENGINE) private readonly coa: CoaEngine,
  ) {}

  // Poll tikinde 3 uç aynı yükü çekmesin diye kısa-TTL ortak memo (in-flight paylaşımı)
  private readonly memo = new TtlMemo();

  /** Skorlanmış (aktif) izler — 3 uç TEK memodan okur (count(*) atlanır). */
  private skorluIzler(): Promise<Array<Record<string, unknown>>> {
    return this.memo.get('skorluIzler', MEMO_TTL_MS, async () => {
      const res = await this.engine.load({
        def: this.skorluIzDef(),
        parameters: {},
        limit: 5000,
        includeTotal: false,
      });
      return res.objects;
    });
  }

  /**
   * Yalnız SKORLANMIŞ (aktif) izler — writeback'i olanlar. Filtre server-side
   * (tehdit_skoru >= 0 → null'lar SQL'de elenir), böylece binlerce eski seed izi
   * arasında kaybolmadan aktif operasyonel resim gelir (performans + doğru semantik).
   */
  private skorluIzDef(): ObjectSetDef {
    return {
      type: 'filter',
      base: { type: 'base', objectType: 'iz' },
      combinator: 'and',
      conditions: [
        {
          id: 'skorlu',
          column: 'tehdit_skoru',
          operator: 'gte',
          values: [{ kind: 'literal', value: 0 }],
        },
      ],
    };
  }

  /** En yüksek tehdit skorlu izler (writeback'ten; okuma indeksli/hızlı) */
  async enUstTehditler(limit = 20): Promise<Array<Record<string, unknown>>> {
    const objects = await this.skorluIzler();
    return objects
      .filter((o) => o.tehdit_skoru != null)
      .sort((a, b) => Number(b.tehdit_skoru) - Number(a.tehdit_skoru))
      .slice(0, limit)
      .map((o) => ({
        iz_no: o.iz_no,
        siniflandirma: o.siniflandirma,
        domain: o.domain,
        tehdit_skoru: o.tehdit_skoru,
        tehdit_onceligi: o.tehdit_onceligi,
        yaklasiyor: o.yaklasiyor,
        enlem: o.enlem,
        boylam: o.boylam,
      }));
  }

  /** Bir iz için ROE-uyumlu COA seçenekleri üret (varlık önerisiyle) */
  async coaUret(izNo: string, roe?: RoeConfig): Promise<CoaSonuc | { hata: string }> {
    const izDef: ObjectSetDef = {
      type: 'filter',
      base: { type: 'base', objectType: 'iz' },
      combinator: 'and',
      conditions: [
        { id: 'c', column: 'iz_no', operator: 'eq', values: [{ kind: 'literal', value: izNo }] },
      ],
    };
    const izRes = await this.engine.load({ def: izDef, parameters: {}, limit: 1, includeTotal: false });
    const row = izRes.objects[0];
    if (!row) return { hata: `İz bulunamadı: ${izNo}` };

    const hedef = this.izRowToHedef(row);
    const varliklar = await this.dostVarliklar();
    return this.coa.uret(hedef, { varliklar }, roe);
  }

  /** Dost varlıklar (konumu olan platformlar) — COA + senkronizasyon ortak yükü. */
  private async dostVarliklar(): Promise<Varlik[]> {
    return this.memo.get('dostVarliklar', MEMO_TTL_MS, async () => this.dostVarliklarYukle());
  }
  private async dostVarliklarYukle(): Promise<Varlik[]> {
    const platRes = await this.engine.load({
      def: { type: 'base', objectType: 'platform' },
      parameters: {},
      limit: 2000,
      includeTotal: false,
    });
    return platRes.objects
      .filter((p) => p.enlem != null && p.boylam != null)
      .map((p) => ({
        ad: String(p.cagri_adi ?? p.platform_no),
        pk: String(p.platform_no), // nesne detayına gezinme için (birincil anahtar)
        tip: String(p.tip ?? '—'),
        domain: String(p.domain),
        menzilKm: MENZIL_KM[String(p.domain)] ?? 60,
        hazir: p.durum == null || String(p.durum) !== 'Bakımda',
        yakitOrani: p.yakit_orani != null ? Number(p.yakit_orani) : undefined,
        enlem: Number(p.enlem),
        boylam: Number(p.boylam),
      }));
  }

  /** v_iz satırını COA motorunun beklediği Hedef'e çevir (ontoloji↔motor köprüsü). */
  private izRowToHedef(row: Record<string, unknown>): Hedef {
    return {
      izNo: String(row.iz_no),
      domain: String(row.domain),
      hostilityCode: SINIF_KOD[String(row.siniflandirma)] ?? 'UNK',
      tehditSkoru: Number(row.tehdit_skoru ?? 0),
      suratKnot: Number(row.surat_knot ?? 0),
      rotaDerece: Number(row.rota_derece ?? 0),
      enlem: Number(row.enlem),
      boylam: Number(row.boylam),
    };
  }

  /**
   * SENKRONİZASYON MATRİSİ — en yüksek N tehdidin önerilen COA'sını tek bir
   * varlık × zaman planlama tablosunda toplar. Verimli: 1 iz yükü + 1 platform
   * yükü + N saf (bellek-içi) COA çağrısı. Deterministik montaj `senkronizasyonKur`.
   */
  async senkronizasyonMatrisi(limit = 20): Promise<SenkMatris> {
    const enUst = (await this.skorluIzler())
      .filter((o) => o.tehdit_skoru != null)
      .sort((a, b) => Number(b.tehdit_skoru) - Number(a.tehdit_skoru))
      .slice(0, limit);

    const varliklar = await this.dostVarliklar();
    const varlikOzet: VarlikOzet[] = varliklar.map((v) => ({
      ad: v.ad,
      pk: v.pk,
      tip: v.tip,
      domain: v.domain,
      hazir: v.hazir,
    }));

    const gorevler: GorevGirdi[] = enUst.map((row) => {
      const coa = this.coa.uret(this.izRowToHedef(row), { varliklar });
      const o = coa.oneri;
      return {
        izNo: String(row.iz_no),
        oncelik: String(row.tehdit_onceligi ?? '—'),
        skor: Number(row.tehdit_skoru ?? 0),
        angajmanTipi: o?.angajmanTipi ?? 'İzle-Takip',
        roeDurumu: coa.roeDurumu,
        basariYuzde: o?.basariYuzde ?? 0,
        kesismeDk: o?.kesismeDk ?? null,
        varlikAd: o?.varlik ?? null,
        varlikPk: o?.varlikPk ?? null,
      };
    });

    return senkronizasyonKur(varlikOzet, gorevler);
  }

  /**
   * DURUM ÖZETİ (Sprint 4) — çok-kaynak füzyonu: izler + tehdit skorları +
   * istihbarat, önceliklendirilmiş yapısal özet. Deterministik (LLM değil);
   * Asistan bu yapıyı okuyup insana anlatabilir. Opsiyonel domain filtresi.
   */
  async durumOzeti(domain?: string): Promise<Record<string, unknown>> {
    // Aktif (skorlanmış) izler üzerinden — operasyonel resim, eski seed değil
    let izler = await this.skorluIzler();
    if (domain) izler = izler.filter((o) => String(o.domain) === domain);

    const say = (f: (o: Record<string, unknown>) => boolean) => izler.filter(f).length;
    const dusman = say((o) => o.siniflandirma === 'Düşman');
    const supheli = say((o) => o.siniflandirma === 'Şüpheli');
    const yaklasan = say((o) => o.yaklasiyor === true && o.siniflandirma !== 'Dost');
    const kritik = say((o) => o.tehdit_onceligi === 'Kritik');
    const yuksek = say((o) => o.tehdit_onceligi === 'Yüksek');

    const enYuksek = [...izler]
      .filter((o) => o.tehdit_skoru != null)
      .sort((a, b) => Number(b.tehdit_skoru) - Number(a.tehdit_skoru))
      .slice(0, 5)
      .map((o) => ({
        iz_no: o.iz_no,
        siniflandirma: o.siniflandirma,
        domain: o.domain,
        skor: o.tehdit_skoru,
        oncelik: o.tehdit_onceligi,
        yaklasiyor: o.yaklasiyor,
      }));

    // İstihbarat teyidi (çok-kaynak) — en öncelikli birkaç rapor (memo'lu)
    const intelRes = await this.memo.get('intel', MEMO_TTL_MS, () =>
      this.engine.load({
        def: { type: 'base', objectType: 'istihbarat_raporu' },
        parameters: {},
        limit: 2000,
        includeTotal: false,
      }),
    );
    const oncelikSira: Record<string, number> = { Acil: 3, Yüksek: 2, Rutin: 1 };
    const enOnemliIntel = [...intelRes.objects]
      .sort(
        (a, b) =>
          (oncelikSira[String(b.oncelik)] ?? 0) - (oncelikSira[String(a.oncelik)] ?? 0) ||
          Number(b.guven_yuzde ?? 0) - Number(a.guven_yuzde ?? 0),
      )
      .slice(0, 5)
      .map((o) => ({
        rapor_no: o.rapor_no,
        tur: o.tur,
        baslik: o.baslik,
        oncelik: o.oncelik,
        kaynak_guvenilirligi: o.kaynak_guvenilirligi,
      }));

    const metin =
      `${izler.length} aktif iz${domain ? ` (${domain})` : ''}: ${dusman} düşman, ` +
      `${supheli} şüpheli. ${kritik} kritik / ${yuksek} yüksek öncelikli tehdit; ` +
      `${yaklasan} iz dost varlığa yaklaşıyor. ` +
      `${intelRes.objects.length} korelasyonlu istihbarat raporu değerlendirildi.`;

    return {
      ozet: metin,
      toplam_iz: izler.length,
      dagilim: { dusman, supheli, kritik_tehdit: kritik, yuksek_tehdit: yuksek, yaklasan },
      en_yuksek_tehditler: enYuksek,
      oncelikli_istihbarat: enOnemliIntel,
      uretim_zamani_alan: 'scored_at (writeback)',
    };
  }
}
