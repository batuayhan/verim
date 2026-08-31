import { Inject, Injectable, Optional } from '@nestjs/common';
import OpenAI from 'openai';
import type { z } from 'zod';
import { AlertsService, type AlertRule } from '../alerts/alerts.service';
import { AnalysesStore, type StoredAnalysis } from '../analyses/analyses-store';
import { ApiError } from '../common/api-error';
import { buildCapabilityPrompt } from '../capabilities/catalog';
import { SenkronService } from '../senkron/senkron.service';
import { lintColumn, lintObjectSetDef, resultTypeOf } from '../capabilities/def-lint';
import {
  alarmKuraliInput,
  dashboardOlusturInput,
  grafAcInput,
  nesneInceleInput,
  haritayaGitInput,
  harmanAnalizInput,
  injectRuntimeEnums,
  mercekAnalizInput,
  nesneGruplaInput,
  nesneYukleInput,
  senkronDuzenleInput,
  toToolJsonSchema,
  zamanSerisiInput,
} from '../capabilities/tool-schemas';
import { autoLayout, type DashboardDoc } from '../dashboards/dashboard-schema';
import { DashboardsStore } from '../dashboards/dashboards.controller';
import {
  DATASET_PROVIDER,
  type DatasetProvider,
} from '../datasets/dataset-provider';
import {
  OBJECT_SET_ENGINE,
  type IObjectSetEngine,
} from '../ontology/object-set-engine';
import { ONTOLOGY_PROVIDER, type OntologyProvider } from '../ontology/ontology-provider';
import { MercekAnalysesStore } from '../ontology/mercek-analyses.controller';
import { buildAnalysis } from './analysis-builder';

/**
 * Verim Asistanı — AIP karşılığı. Bilgisi ELLE YAZILMAZ:
 *  - Yetenek anlatımı capabilities/catalog.ts'ten üretilir (contract
 *    union'larına derleyici seviyesinde bağlı — bkz. o dosyanın başlığı),
 *  - Araç şemaları capabilities/tool-schemas.ts'teki zod'lardan türetilir
 *    ve AYNI zod çalışma zamanında girdiyi doğrular (LLM'in gördüğü şema =
 *    sunucunun doğruladığı şema; sapma imkânsız).
 * Yeni yetenek eklemek = kataloga açıklama + registry'ye araç. Drift
 * testi (test/capabilities.e2e-spec.ts) kapsamı ayrıca korur.
 */

const MODEL = process.env.ASSISTANT_MODEL ?? 'gpt-4o';
const MAX_TURNS = 6;

export interface AssistantStep {
  tool: string;
  input: unknown;
  summary: string;
}
export type AssistantAction =
  | { type: 'mercek_ac'; analysisId: string; label: string }
  | { type: 'harman_ac'; analysisId: string; label: string }
  | { type: 'harita_goster'; params: Record<string, string>; label: string }
  | { type: 'alarmlar_ac'; label: string }
  | { type: 'dashboard_ac'; dashboardId: string; label: string }
  | { type: 'graf_ac'; objectType: string; pk: string; label: string };

/**
 * INLINE PANEL — sorgu araçlarının sonuçları kullanıcıya SADECE metin olarak
 * değil, sohbetin içinde canlı tablo/grafik olarak da gösterilir. Panel,
 * üretildiği ObjectSetDef'i taşır ki "ilgili uygulamada aç" (Mercek/Harita)
 * tek tıkla mümkün olsun — asistan cevabı kara kutu/çıkmaz sokak değildir.
 */
export type AssistantPanel =
  | {
      tip: 'tablo';
      baslik: string;
      def: unknown;
      columns: string[];
      rows: Array<Record<string, unknown>>;
      totalCount: number;
      /** Satırlarda enlem+boylam varsa true — UI haritada açma sunar */
      konumlu: boolean;
    }
  | {
      tip: 'grafik';
      baslik: string;
      def: unknown;
      groupBy: string;
      segmentBy?: string;
      metric: { fn: string; property?: string };
      rows: Array<{ group: string | null; segment?: string | null; value: number }>;
    }
  | {
      tip: 'metrik';
      baslik: string;
      def: unknown;
      metric: { fn: string; property?: string };
      value: number;
    }
  | {
      tip: 'zaman';
      baslik: string;
      def: unknown;
      dateProperty: string;
      granularity: string;
      metric: { fn: string; property?: string };
      points: Array<{ t: string; value: number }>;
    };

const MAX_PANELS = 8;
const PANEL_ROW_LIMIT = 30;

export interface AssistantResult {
  answer: string;
  steps: AssistantStep[];
  actions: AssistantAction[];
  paneller: AssistantPanel[];
}
export interface ChatContext {
  path?: string;
  planId?: string; // aktif Sync Matrix planı — senkron bağlamı bunun üzerinden
}

/**
 * Araç kayıt defteri — TOOLS, doğrulama VE kullanıcı-yüzlü yetenek keşfi
 * tek kaynaktan. title/category/examples, /assistant/manifest üzerinden
 * arayüzdeki "Neler yapabilirim?" panelini besler; drift testi her aracın
 * örnekli belgelenmesini zorlar.
 */
export type ToolCategory =
  | 'sorgu'
  | 'mercek'
  | 'harman'
  | 'harita'
  | 'alarm'
  | 'dashboard'
  | 'graf'
  | 'senkron';

export const TOOL_REGISTRY: Array<{
  name: string;
  title: string;
  category: ToolCategory;
  description: string;
  examples: string[];
  /** Örneklerin vaat ettiği yeteneğin ÇALIŞTIRILABİLİR kanıtı — drift
      testi her fikstürü şemadan geçirir ve dummy motorda koşturur.
      Örnek, sistemin yapamadığı bir şeyi vaat edemez. */
  fixtures: unknown[];
  input: z.ZodType;
}> = [
  {
    name: 'nesne_yukle',
    title: 'Nesneleri sorgula',
    category: 'sorgu',
    description:
      'ObjectSetDef tarifini çözüp nesneleri ve toplam sayıyı döner. Sadece sayı gerekiyorsa limit=1.',
    examples: [
      'Kaç tane düşman iz var?',
      'Pasif durumdaki sensörleri listele',
      'PLT-0199 platformuna takılı sensörler hangileri?',
    ],
    fixtures: [
      {
        def: {
          type: 'filter',
          base: { type: 'base', objectType: 'iz' },
          combinator: 'and',
          conditions: [
            { id: 'c', column: 'siniflandirma', operator: 'eq', values: [{ kind: 'literal', value: 'Düşman' }] },
          ],
        },
        limit: 1,
      },
    ],
    input: nesneYukleInput,
  },
  {
    name: 'nesne_grupla',
    title: 'Grupla ve say/topla',
    category: 'sorgu',
    description:
      'ObjectSetDef üzerinde grupla + metrik; segmentBy ile ikinci boyut ' +
      '(örn. sınıflandırma × domain). "Kaç tane / en çok / ortalama / X\'e göre Y segmentli" için.',
    examples: [
      'İzleri sınıflandırmalarına göre domain ile segmentleyerek grupla',
      'En çok hangi domainde platform var?',
      'Birlik başına ortalama personel sayısı nedir?',
    ],
    fixtures: [
      { def: { type: 'base', objectType: 'platform' }, groupBy: 'domain', metric: { fn: 'count' } },
      // segment yeteneğinin çalıştırılabilir kanıtı
      {
        def: { type: 'base', objectType: 'iz' },
        groupBy: 'siniflandirma',
        segmentBy: 'domain',
        metric: { fn: 'count' },
      },
    ],
    input: nesneGruplaInput,
  },
  {
    name: 'zaman_serisi',
    title: 'Zaman içinde trend',
    category: 'sorgu',
    description: 'Tarih kolonuna göre gün/hafta/ay zaman serisi (trend).',
    examples: [
      'Düşman iz tespitleri aylara göre nasıl değişmiş?',
      'Son gözlemlerin saatlik trendini çıkar',
    ],
    fixtures: [
      // "saatlik" örneğinin kanıtı: iz_gozlem + hour — bu fikstür, saat
      // granülaritesi/gözlem tipi olmadan CI'dan geçemezdi
      {
        def: { type: 'base', objectType: 'iz_gozlem' },
        dateProperty: 'tespit_zamani',
        metric: { fn: 'count' },
        granularity: 'hour',
      },
    ],
    input: zamanSerisiInput,
  },
  {
    name: 'mercek_analiz_olustur',
    title: 'Mercek analizi / dashboard kur',
    category: 'mercek',
    description:
      "Mercek'te kalıcı analiz (ve istenirse dashboard) kurar; kümeler kart zincirine açılır. " +
      '"Analiz kur / dashboard yap / veriyi harmanla" için. Önce sorguları doğrula.',
    examples: [
      'Domain bazında iz dağılımını gösteren bir dashboard kur',
      'Pasif sensörleri platform bilgileriyle harmanlayan bir analiz oluştur',
      'Düşman izlerini sensör bilgisiyle birleştirip tehdit grafiği olan analiz yap',
    ],
    fixtures: [
      {
        isim: 'Fikstür Analizi',
        kumeler: [
          {
            def: {
              type: 'joinLinked',
              base: { type: 'base', objectType: 'sensor' },
              linkType: 'sensor-platform',
              columns: ['tip'],
            },
          },
        ],
        gorseller: [
          { tip: 'metrik', kume: 0, metricFn: 'count' },
          {
            tip: 'grafik',
            kume: 0,
            groupBy: 'tip',
            segmentBy: 'durum',
            metricFn: 'count',
            grafikTuru: 'bar',
          },
        ],
        dashboard: true,
      },
    ],
    input: mercekAnalizInput,
  },
  {
    name: 'harman_analiz_olustur',
    title: 'Harman pipeline analizi kur',
    category: 'harman',
    description:
      "Harman'da board zincirli pipeline analizi kurar (dataset → boards sırayla akar). " +
      "Board şekilleri sistem prompttaki HARMAN BOARD TÜRLERİ kataloğundadır; her board'a benzersiz id ver. " +
      "dashboard=true ise görsel board'lar (table/chart/histogram/pivot) widget olur.",
    examples: [
      'Platformlar üzerinde Arızalıları atıp domain histogramı olan bir pipeline kur',
      'Görevler datasetinde tip bazında ortalama süreyi gösteren analiz yap',
      'İz gözlem geçmişinde günlük tespit sayısı grafiği olan bir Harman analizi kur',
    ],
    fixtures: [
      {
        isim: 'Fikstür Pipeline',
        datasetId: 'platformlar',
        boards: [
          {
            type: 'filter',
            id: 'b1',
            action: 'remove',
            combinator: 'and',
            conditions: [
              { id: 'c', column: 'durum', operator: 'eq', values: [{ kind: 'literal', value: 'Arızalı' }] },
            ],
          },
          {
            type: 'histogram',
            id: 'b2',
            groupColumn: 'domain',
            aggregate: { alias: 'adet', fn: 'count' },
            sort: { by: 'value', direction: 'desc' },
            pivoted: false,
          },
        ],
        dashboard: true,
      },
    ],
    input: harmanAnalizInput,
  },
  {
    name: 'dashboard_olustur',
    title: 'Birleşik dashboard kur',
    category: 'dashboard',
    description:
      'Platformun TEK dashboard sisteminde yeni dashboard kurar; gadget listesi verilir ' +
      '(tipler sistem prompttaki DASHBOARD GADGET TÜRLERİ kataloğunda), yerleşim otomatik. ' +
      '"Ana ekran / izleme paneli / kokpit kur" için. Sorgu gadget\'larının def\'lerini önce doğrula.',
    examples: [
      'Düşman iz sayısı, sınıflandırma grafiği ve canlı harita olan bir izleme paneli kur',
      'Hava izlerine odaklı, saatlik gözlem trendli bir kokpit dashboard\'u oluştur',
    ],
    fixtures: [
      {
        isim: 'Fikstür Paneli',
        gadgets: [
          {
            tip: 'stat',
            baslik: 'Düşman iz',
            def: {
              type: 'filter',
              base: { type: 'base', objectType: 'iz' },
              combinator: 'and',
              conditions: [
                { id: 'c', column: 'siniflandirma', operator: 'eq', values: [{ kind: 'literal', value: 'Düşman' }] },
              ],
            },
            metric: { fn: 'count' },
            renk: 'error',
          },
          {
            tip: 'grafik',
            def: { type: 'base', objectType: 'iz' },
            groupBy: 'siniflandirma',
            segmentBy: 'domain',
            metric: { fn: 'count' },
          },
          { tip: 'harita', siniflandirmalar: ['Düşman'], pencereDk: 15 },
          {
            tip: 'zaman',
            def: { type: 'base', objectType: 'iz_gozlem' },
            dateProperty: 'tespit_zamani',
            granularity: 'hour',
            metric: { fn: 'count' },
            pencereDk: 1440,
            pencereKolon: 'tespit_zamani',
          },
          { tip: 'alarmlar', limit: 6 },
        ],
      },
    ],
    input: dashboardOlusturInput,
  },
  {
    name: 'alarm_kurali_olustur',
    title: 'Alarm kuralı kur',
    category: 'alarm',
    description:
      "Kalıcı alarm kuralı: def üzerindeki sayı eşiği aşılınca sistem alarm üretir (15sn'de bir). " +
      '"Olursa haber ver / alarm kur" için; canlı izlemede windowMin ver.',
    examples: [
      "Son 5 dakikadaki düşman iz sayısı 100'ü aşarsa haber ver",
      'Şüpheli hava izleri 50 üstüne çıkarsa alarm kur',
    ],
    fixtures: [
      {
        isim: 'Fikstür Alarmı',
        def: {
          type: 'filter',
          base: { type: 'base', objectType: 'iz' },
          combinator: 'and',
          conditions: [
            { id: 'c', column: 'siniflandirma', operator: 'eq', values: [{ kind: 'literal', value: 'Düşman' }] },
          ],
        },
        windowMin: 5,
        operator: 'gt',
        threshold: 100,
      },
    ],
    input: alarmKuraliInput,
  },
  {
    name: 'nesne_incele',
    title: 'Nesneyi incele (istihbarat brifingi)',
    category: 'sorgu',
    description:
      'Bir nesneyi TÜM ilişkileriyle birlikte inceler ve yapılandırılmış özet döner ' +
      '(özellikleri + her ilişkinin sayısı + örnek bağlı nesneler). "Bunu açıkla / X hakkında ' +
      'brifing ver / X kime bağlı, neyi var" için. Cevabı akıcı bir brifing gibi yaz; kullanıcıya ' +
      'ayrıca bağlantı grafiği düğmesi sunulur. objectType + pk verilir.',
    examples: [
      'BRL-001 birliği hakkında brifing ver',
      'IZ-000042 izini tüm ilişkileriyle açıkla',
    ],
    fixtures: [{ objectType: 'birlik', pk: 'BRL-001' }],
    input: nesneInceleInput,
  },
  {
    name: 'graf_ac',
    title: 'Bağlantı grafiğinde aç',
    category: 'graf',
    description:
      'Bir nesneyi bağlantı analizi grafiğinde odak alarak açar (ilişkileri düğüm-kenar ağı olarak gezilir). ' +
      '"X\'in bağlantılarını göster / ilişki ağını çıkar / kime bağlı" için. objectType + pk (nesnenin birincil anahtarı) verilir.',
    examples: [
      'BRL-001 biriminin bağlantı ağını göster',
      'PLT-0208 platformunun ilişkilerini grafta aç',
    ],
    fixtures: [{ objectType: 'birlik', pk: 'BRL-001' }],
    input: grafAcInput,
  },
  {
    name: 'haritaya_git',
    title: 'Haritada göster',
    category: 'harita',
    description:
      'Harita (canlı COP) sayfasını filtrelerle açan düğme sunar. "Haritada göster" için. ' +
      'Cevap belirli bir KONUMA işaret ediyorsa (bir izin/nesnenin enlem-boylamı) merkez ver — harita oraya odaklanıp işaretler. ' +
      'katmanlar ile iz izleri (hareket yolları), istihbarat, menzil halkaları ve senkron (Sync Matrix planı: görev/rota + mini matris) açılır/kapanır; gosterim "isi" ile ısı haritası.',
    examples: [
      'Düşman izleri haritada göster',
      'Son 1 saatteki şüpheli ve düşman izleri haritada aç',
      'Düşman izlerini hareket yollarıyla (iz izleri) haritada göster',
      'Harekât planını haritada göster (senkronizasyon katmanı)',
    ],
    fixtures: [
      { siniflandirmalar: ['Düşman', 'Şüpheli'], pencereDk: 60 },
      // konum odaklama yeteneğinin çalıştırılabilir kanıtı
      {
        siniflandirmalar: ['Düşman'],
        merkez: { lat: 39.92, lon: 32.85, zoom: 9, etiket: 'IZ-0042' },
      },
      // katman kontrolü yeteneğinin kanıtı
      { katmanlar: { izIzleri: true, istihbarat: true }, gosterim: 'isi' },
    ],
    input: haritayaGitInput,
  },
  {
    name: 'senkron_plani_duzenle',
    title: 'Sync Matrix planını düzenle',
    category: 'senkron',
    description:
      'Harekât senkronizasyon planını doğal dille değiştir. islem: "oku" (plan özeti — id öğren), "topluKaydir" (deltaDk; opsiyonel domain), "gorevKaydir" (gorevId|gorevAd + baslangicDk; bağlılar zincirlenir), "gorevDurum" (+durum; onayli→sahaya emir), "gorevEkle" (ad+sureDk+tur?+domain?+baslangicDk?), "gorevGuncelle" (gorevId|gorevAd + yeniAd?/sureDk?/baslangicDk?/tur?/varlikAd? — varlık atama dahil; TAKTİK kart: cagriAdi/oncelik 1-5/istenenEtki/enlem+boylam görev konumu/hedefEnlem+hedefBoylam hedef koordinatı/bolgeYaricapKm görev bölgesi çemberi/kontrolMakami/frekans/muhimmat), "gorevSil", "bagimlilikEkle"/"bagimlilikSil" (oncekiAd+sonrakiAd, bagTur FS|SS, gecikmeDk), "senaryoTuret", "terfi", "sensorToShooter" (izNo). Görevlere ADIYLA hitap edilebilir. planId: sistem bağlamındaki aktif planı kullan. Zaman H-saatine göre DAKİKA. ' +
      'AGENTIC DOĞRULAMA: her işlem sonucu DOGRULAMA.{kaynakCakismalari, ihlaller, temiz} döner — bir sorunu çözdüğünü ' +
      'söylemeden önce temiz=true olduğunu GÖR; değilse listedeki soruna göre yeni düzeltme dene (birkaç deneme yap), ' +
      'yine çözülmezse dürüstçe çözülmediğini ve nedenini söyle. Çakışma çözümü: aynı varlığın görevlerini zamanda ayır ' +
      '(birini diğerinin bitişinden SONRAYA kaydır) ya da birini başka varlığa ata (gorevGuncelle varlikAd).',
    examples: [
      'Tüm birimleri 15 dakika geri çek',
      'B planı diye bir what-if senaryosu oluştur',
      'SEAD görevini H+10\'a al',
      'IZ-A-42 tehdidi için angajman görevi ekle',
    ],
    fixtures: [
      { islem: 'topluKaydir', deltaDk: -15 },
      { islem: 'senaryoTuret', ad: 'B Planı' },
    ],
    input: senkronDuzenleInput,
  },
];

@Injectable()
export class AssistantService {
  constructor(
    @Inject(ONTOLOGY_PROVIDER) private readonly ontology: OntologyProvider,
    @Inject(OBJECT_SET_ENGINE) private readonly engine: IObjectSetEngine,
    @Inject(DATASET_PROVIDER) private readonly datasets: DatasetProvider,
    private readonly mercekAnalyses: MercekAnalysesStore,
    private readonly harmanAnalyses: AnalysesStore,
    private readonly alerts: AlertsService,
    private readonly dashboards: DashboardsStore,
    @Optional() private readonly senkron?: SenkronService,
  ) {}

  available(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  buildTools(enums: {
    objectTypes: string[];
    linkTypes: string[];
    datasetIds: string[];
  }): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return TOOL_REGISTRY.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        // objectType/linkType/datasetId LLM için KAPALI LİSTE — halüsinasyon
        // şema seviyesinde engellenir
        parameters: injectRuntimeEnums(toToolJsonSchema(t.input), enums),
      },
    }));
  }

  async chat(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    nowIso: string,
    context: ChatContext = {},
  ): Promise<AssistantResult> {
    if (!this.available()) {
      throw ApiError.invalidBoard('Asistan devre dışı — OPENAI_API_KEY tanımlı değil.');
    }
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const ontology = await this.ontology.getOntology();
    const datasets = await this.datasets.list();
    let system = this.systemPrompt(nowIso, context, ontology, datasets);
    // BAĞLAM FARKINDALIĞI: Sync Matrix sayfasındayken güncel planın özeti
    // prompta eklenir — asistan önerilerini (çakışma çöz, gecikmeyi planla,
    // kritik yolu koru) CANLI plan verisine dayandırır; körlemesine konuşmaz.
    if (context.path?.startsWith('/senkron') && this.senkron) {
      try {
        const aktifPlan = context.planId || 'canli';
        const baglam = await this.senkron.asistanBaglami(aktifPlan);
        if (!('hata' in baglam)) {
          system +=
            `\n\nAKTİF SYNC MATRIX BAĞLAMI (planId="${aktifPlan}" — senkron_plani_duzenle çağrılarında bu planId'yi kullan; ` +
            `görev/varlık adlarını ve id'leri buradan al, tahmin etme; sorun görürsen — çakışma, ihlal, gecikme — ` +
            `proaktif çözüm öner; cevaplarını Markdown ile yapılandır):\n${JSON.stringify(baglam)}`;
        }
      } catch {
        /* plan okunamazsa bağlamsız devam */
      }
    }
    const tools = this.buildTools({
      objectTypes: ontology.objectTypes.map((o) => o.apiName),
      linkTypes: ontology.linkTypes.map((l) => l.apiName),
      datasetIds: datasets.map((d) => d.id),
    });

    const convo: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: system },
      ...messages.map((m) => ({ role: m.role, content: m.content }) as const),
    ];
    const steps: AssistantStep[] = [];
    const actions: AssistantAction[] = [];
    const paneller: AssistantPanel[] = [];

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res = await client.chat.completions.create({
        model: MODEL,
        messages: convo,
        tools,
        temperature: 0,
      });
      const msg = res.choices[0].message;

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return { answer: (msg.content ?? '(boş yanıt)').trim(), steps, actions, paneller };
      }

      convo.push(msg);
      for (const call of msg.tool_calls) {
        if (call.type !== 'function') continue;
        let raw: unknown = {};
        try {
          raw = JSON.parse(call.function.arguments);
        } catch {
          /* boş → şema hatası dönecek */
        }
        const { output, summary } = await this.runTool(
          call.function.name,
          raw,
          actions,
          paneller,
        );
        steps.push({ tool: call.function.name, input: raw, summary });
        convo.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(output).slice(0, 12_000),
        });
      }
    }

    return {
      answer: 'Soruyu birkaç adımda yanıtlayamadım — lütfen daha dar bir soru sor.',
      steps,
      actions,
      paneller,
    };
  }

  /** Test edilebilirlik: tek aracı doğrudan çalıştır (chat döngüsüyle aynı yol) */
  async runTool(
    name: string,
    raw: unknown,
    actions: AssistantAction[],
    paneller: AssistantPanel[] = [],
  ): Promise<{ output: unknown; summary: string }> {
    // Girdi, LLM'e gösterilen şemanın KENDİSİYLE doğrulanır
    const entry = TOOL_REGISTRY.find((t) => t.name === name);
    if (!entry) {
      return { output: { error: `Bilinmeyen araç: ${name}` }, summary: `hata: ${name}` };
    }
    const parsed = entry.input.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const msg = `${issue?.path.join('.') || 'girdi'}: ${issue?.message}`;
      return {
        output: { error: `Şema hatası — ${msg}` },
        summary: `şema hatası: ${msg.slice(0, 60)}`,
      };
    }

    // Def taşıyan araçlarda motora gitmeden TOPLU ön-doğrulama — tüm
    // sorunlar önerilerle tek seferde LLM'e döner (tek denemede düzeltme)
    const lintIssues: string[] = [];
    const data = parsed.data as Record<string, unknown>;
    if (['nesne_yukle', 'nesne_grupla', 'zaman_serisi', 'alarm_kurali_olustur'].includes(name)) {
      const ontology = await this.ontology.getOntology();
      lintIssues.push(...lintObjectSetDef(data.def as never, ontology));
      if (name === 'nesne_grupla' && data.groupBy) {
        lintIssues.push(...lintColumn(data.def as never, String(data.groupBy), ontology));
      }
      if (name === 'nesne_grupla' && data.segmentBy) {
        lintIssues.push(...lintColumn(data.def as never, String(data.segmentBy), ontology));
      }
      if (name === 'zaman_serisi') {
        lintIssues.push(...lintColumn(data.def as never, String(data.dateProperty), ontology));
      }
    }
    if (name === 'mercek_analiz_olustur') {
      const ontology = await this.ontology.getOntology();
      for (const [i, k] of (data.kumeler as Array<{ def: unknown }>).entries()) {
        for (const issue of lintObjectSetDef(k.def as never, ontology)) {
          lintIssues.push(`kumeler[${i}]: ${issue}`);
        }
      }
    }
    if (name === 'dashboard_olustur') {
      const ontology = await this.ontology.getOntology();
      for (const [i, g] of (data.gadgets as Array<{ def?: unknown }>).entries()) {
        if (g.def) {
          for (const issue of lintObjectSetDef(g.def as never, ontology)) {
            lintIssues.push(`gadgets[${i}]: ${issue}`);
          }
        }
      }
    }
    if (lintIssues.length > 0) {
      return {
        output: { error: `Ontoloji doğrulaması: ${lintIssues.join(' | ')}` },
        summary: `lint: ${lintIssues[0].slice(0, 60)}`,
      };
    }

    try {
      switch (name) {
        case 'nesne_yukle': {
          const args = parsed.data as z.infer<typeof nesneYukleInput>;
          const limit = args.limit ?? 20;
          const r = await this.engine.load({ def: args.def, parameters: {}, limit });
          const ontology = await this.ontology.getOntology();
          const tipAdi = resultTypeOf(args.def as never, ontology) ?? 'nesne';
          const cols = r.properties.map((p) => p.apiName);
          if (r.objects.length > 0) {
            this.pushPanel(paneller, {
              tip: 'tablo',
              baslik: `${tipAdi} — ${r.totalCount} sonuç`,
              def: args.def,
              columns: cols,
              rows: r.objects.slice(0, PANEL_ROW_LIMIT) as Array<Record<string, unknown>>,
              totalCount: r.totalCount,
              konumlu: cols.includes('enlem') && cols.includes('boylam'),
            });
          }
          return {
            output: {
              totalCount: r.totalCount,
              properties: cols,
              objects: r.objects.slice(0, limit),
            },
            summary: `nesne yükle → ${r.totalCount} sonuç`,
          };
        }
        case 'nesne_grupla': {
          const args = parsed.data as z.infer<typeof nesneGruplaInput>;
          const r = await this.engine.aggregate({
            def: args.def,
            parameters: {},
            groupBy: args.groupBy || undefined,
            segmentBy: args.segmentBy || undefined,
            metric: args.metric,
            limit: args.limit ?? 50,
          });
          const ontology = await this.ontology.getOntology();
          const tipAdi = resultTypeOf(args.def as never, ontology) ?? 'nesne';
          if (args.groupBy) {
            this.pushPanel(paneller, {
              tip: 'grafik',
              baslik: `${tipAdi} · ${args.groupBy}${args.segmentBy ? ` × ${args.segmentBy}` : ''}`,
              def: args.def,
              groupBy: args.groupBy,
              segmentBy: args.segmentBy || undefined,
              metric: args.metric,
              rows: r.rows,
            });
          } else {
            this.pushPanel(paneller, {
              tip: 'metrik',
              baslik: `${tipAdi} · ${args.metric.fn}${args.metric.property ? `(${args.metric.property})` : ''}`,
              def: args.def,
              metric: args.metric,
              value: r.rows[0]?.value ?? 0,
            });
          }
          return {
            output: r,
            summary: `grupla (${args.groupBy ?? 'toplam'}${args.segmentBy ? ` × ${args.segmentBy}` : ''}) → ${r.rows.length} satır`,
          };
        }
        case 'zaman_serisi': {
          const args = parsed.data as z.infer<typeof zamanSerisiInput>;
          const r = await this.engine.timeseries({
            def: args.def,
            parameters: {},
            dateProperty: args.dateProperty,
            metric: args.metric,
            granularity: args.granularity,
          });
          const ontology = await this.ontology.getOntology();
          const tipAdi = resultTypeOf(args.def as never, ontology) ?? 'nesne';
          if (r.points.length > 0) {
            this.pushPanel(paneller, {
              tip: 'zaman',
              baslik: `${tipAdi} · ${args.dateProperty} (${args.granularity})`,
              def: args.def,
              dateProperty: args.dateProperty,
              granularity: args.granularity,
              metric: args.metric,
              points: r.points,
            });
          }
          return { output: r, summary: `zaman serisi → ${r.points.length} nokta` };
        }
        case 'mercek_analiz_olustur': {
          const args = parsed.data as z.infer<typeof mercekAnalizInput>;
          const created = await this.createMercekAnalysis(args);
          actions.push({
            type: 'mercek_ac',
            analysisId: created.id,
            label: `"${created.name}" analizini Mercek'te aç`,
          });
          return {
            output: {
              id: created.id,
              url: `/mercek/${created.id}`,
              kartSayisi: created.kartSayisi,
              dashboard: created.dashboard,
            },
            summary: `Mercek analizi oluşturuldu: ${created.name} (${created.kartSayisi} kart)`,
          };
        }
        case 'harman_analiz_olustur': {
          const args = parsed.data as z.infer<typeof harmanAnalizInput>;
          // Yalnız etiket gerekiyor — get() canlı dataset'te tam zincir
          // çözümü tetiklerdi; list() özeti yeterli ve ucuz.
          const ds = (await this.datasets.list()).find(
            (s) => s.id === args.datasetId,
          );
          if (!ds) {
            return {
              output: { error: `Dataset bulunamadı: ${args.datasetId}` },
              summary: 'hata: dataset yok',
            };
          }
          const id = `asistan-h-${Date.now().toString(36)}`;
          const gorselBoards = args.boards.filter((b) =>
            ['table', 'chart', 'histogram', 'pivot'].includes(b.type),
          );
          const doc = {
            id,
            name: args.isim,
            paths: [
              {
                id: 'p1',
                name: ds.label,
                source: { kind: 'dataset', datasetId: args.datasetId },
                boards: args.boards,
              },
            ],
            parameters: [],
            dashboard: {
              title: args.isim,
              tabs: [
                {
                  id: 'tab1',
                  name: 'Genel',
                  widgets: args.dashboard
                    ? gorselBoards.map((b, i) => ({
                        id: `w${i + 1}`,
                        kind: 'board',
                        pathId: 'p1',
                        boardId: b.id,
                        title: `${args.isim} — ${b.type}`,
                      }))
                    : [],
                },
              ],
            },
          };
          this.harmanAnalyses.upsert(doc as unknown as StoredAnalysis);
          actions.push({
            type: 'harman_ac',
            analysisId: id,
            label: `"${args.isim}" analizini Harman'da aç`,
          });
          return {
            output: {
              id,
              url: `/harman/${id}`,
              boardSayisi: args.boards.length,
              dashboard: Boolean(args.dashboard),
            },
            summary: `Harman analizi oluşturuldu: ${args.isim} (${args.boards.length} board)`,
          };
        }
        case 'dashboard_olustur': {
          const args = parsed.data as z.infer<typeof dashboardOlusturInput>;
          const doc: DashboardDoc = {
            id: `pano-${Date.now().toString(36)}`,
            name: args.isim,
            gadgets: autoLayout(args.gadgets),
          };
          this.dashboards.upsert(doc as unknown as StoredAnalysis);
          actions.push({
            type: 'dashboard_ac',
            dashboardId: doc.id,
            label: `"${doc.name}" dashboard'unu aç`,
          });
          return {
            output: { id: doc.id, url: `/?d=${doc.id}`, gadgetSayisi: doc.gadgets.length },
            summary: `dashboard kuruldu: ${doc.name} (${doc.gadgets.length} gadget)`,
          };
        }
        case 'alarm_kurali_olustur': {
          const args = parsed.data as z.infer<typeof alarmKuraliInput>;
          const rule: AlertRule = {
            id: `asistan-alarm-${Date.now().toString(36)}`,
            name: args.isim,
            enabled: true,
            def: args.def,
            windowMin: args.windowMin,
            operator: args.operator,
            threshold: args.threshold,
            cooldownSec: args.cooldownSec ?? 300,
          };
          this.alerts.upsertRule(rule);
          actions.push({ type: 'alarmlar_ac', label: 'Alarm kurallarını aç' });
          return {
            output: { ok: true, ruleId: rule.id, name: rule.name },
            summary: `alarm kuruldu: ${rule.name}`,
          };
        }
        case 'nesne_incele': {
          const args = parsed.data as z.infer<typeof nesneInceleInput>;
          const ontology = await this.ontology.getOntology();
          const tip = ontology.objectTypes.find((t) => t.apiName === args.objectType);
          if (!tip) {
            return {
              output: { error: `Bilinmeyen nesne tipi: ${args.objectType}` },
              summary: 'hata: tip yok',
            };
          }
          const base = {
            type: 'fromPrimaryKeys' as const,
            objectType: args.objectType,
            keys: [args.pk],
          };
          const focusRes = await this.engine.load({ def: base, parameters: {}, limit: 1 });
          const nesne = focusRes.objects[0];
          if (!nesne) {
            return {
              output: { error: `${tip.displayName} bulunamadı: ${args.pk}` },
              summary: 'hata: nesne yok',
            };
          }
          // Her giden ilişki için sayı + örnekler
          const iliskiler: Array<{
            iliski: string;
            hedefTip: string;
            toplam: number;
            ornekler: string[];
          }> = [];
          for (const link of ontology.linkTypes.filter((l) => l.fromObjectType === args.objectType)) {
            const hedef = ontology.objectTypes.find((t) => t.apiName === link.toObjectType);
            if (!hedef) continue;
            const r = await this.engine.load({
              def: { type: 'searchAround', base, linkType: link.apiName },
              parameters: {},
              limit: 5,
            });
            if (r.totalCount === 0) continue;
            iliskiler.push({
              iliski: link.displayName,
              hedefTip: hedef.displayName,
              toplam: r.totalCount,
              ornekler: r.objects.map((o) => {
                const ad = ['ad', 'ad_soyad', 'cagri_adi'].map((k) => o[k]).find(Boolean);
                return String(ad ?? o[hedef.primaryKey] ?? '');
              }),
            });
          }
          actions.push({
            type: 'graf_ac',
            objectType: args.objectType,
            pk: args.pk,
            label: `${tip.displayName} ${args.pk} — bağlantı grafiğinde aç`,
          });
          return {
            output: {
              tip: tip.displayName,
              pk: args.pk,
              ozellikler: nesne,
              iliskiler,
            },
            summary: `incele: ${tip.displayName} ${args.pk} (${iliskiler.length} ilişki türü)`,
          };
        }
        case 'graf_ac': {
          const args = parsed.data as z.infer<typeof grafAcInput>;
          const ontology = await this.ontology.getOntology();
          const tip = ontology.objectTypes.find((t) => t.apiName === args.objectType);
          if (!tip) {
            return {
              output: { error: `Bilinmeyen nesne tipi: ${args.objectType}` },
              summary: 'hata: tip yok',
            };
          }
          actions.push({
            type: 'graf_ac',
            objectType: args.objectType,
            pk: args.pk,
            label: `${tip.displayName} ${args.pk} — bağlantı grafiğinde aç`,
          });
          return {
            output: { ok: true, not: 'Kullanıcıya bağlantı grafiği düğmesi sunuldu' },
            summary: `graf düğmesi: ${args.objectType} ${args.pk}`,
          };
        }
        case 'haritaya_git': {
          const args = parsed.data as z.infer<typeof haritayaGitInput>;
          const params: Record<string, string> = {};
          if (args.siniflandirmalar?.length) params.sinif = args.siniflandirmalar.join(',');
          if (args.pencereDk) params.pencere = String(args.pencereDk);
          if (args.merkez) {
            params.lat = String(args.merkez.lat);
            params.lon = String(args.merkez.lon);
            if (args.merkez.zoom) params.zoom = String(args.merkez.zoom);
            if (args.merkez.etiket) params.etiket = args.merkez.etiket;
          }
          // Katman kontrolü → URL parametreleri (HaritaPage açılışta okur)
          if (args.katmanlar?.izIzleri != null) params.izler = args.katmanlar.izIzleri ? '1' : '0';
          if (args.katmanlar?.istihbarat != null) params.intel = args.katmanlar.istihbarat ? '1' : '0';
          if (args.katmanlar?.menzil != null) params.menzil = args.katmanlar.menzil ? '1' : '0';
          if (args.katmanlar?.senkron != null) params.senkron = args.katmanlar.senkron ? '1' : '0';
          if (args.gosterim) params.gosterim = args.gosterim;
          actions.push({
            type: 'harita_goster',
            params,
            label: args.merkez
              ? `Haritada aç${args.merkez.etiket ? ` — ${args.merkez.etiket}` : ' (konuma odaklı)'}`
              : args.siniflandirmalar?.length
                ? `Haritada göster (${args.siniflandirmalar.join(', ')})`
                : 'Haritada göster',
          });
          return {
            output: { ok: true, not: 'Kullanıcıya harita düğmesi sunuldu' },
            summary: 'harita düğmesi eklendi',
          };
        }
        case 'senkron_plani_duzenle': {
          if (!this.senkron)
            return { output: { error: 'Sync Matrix servisi bağlı değil' }, summary: 'senkron yok' };
          const a = parsed.data as z.infer<typeof senkronDuzenleInput>;
          const planId = a.planId || 'canli';
          // gorevId yoksa ad'dan çöz (isim eşleme) — id gerektiren işlemlerde
          const gerekliId =
            a.islem === 'gorevKaydir' ||
            a.islem === 'gorevDurum' ||
            a.islem === 'gorevSil' ||
            a.islem === 'gorevGuncelle';
          const gid = gerekliId ? await this.senkron.gorevIdBul(planId, a.gorevId, a.gorevAd) : null;
          if (gerekliId && !gid) {
            return {
              output: { error: `Görev bulunamadı: ${a.gorevAd ?? a.gorevId ?? '(belirtilmedi)'}` },
              summary: 'senkron: görev çözülemedi',
            };
          }
          let sonuc: unknown;
          switch (a.islem) {
            case 'oku':
              sonuc = await this.senkron.planOzeti(planId);
              break;
            case 'topluKaydir':
              sonuc = await this.senkron.topluKaydir(planId, a.deltaDk ?? 0, a.domain);
              break;
            case 'gorevKaydir':
              sonuc = await this.senkron.kaydir(planId, gid!, a.baslangicDk ?? 0);
              break;
            case 'gorevDurum':
              sonuc = await this.senkron.durumGuncelle(planId, gid!, (a.durum ?? 'planli') as never);
              break;
            case 'gorevSil':
              sonuc = await this.senkron.gorevSil(planId, gid!);
              break;
            case 'gorevGuncelle': {
              const yama: Record<string, unknown> = {};
              if (a.yeniAd) yama.ad = a.yeniAd;
              if (a.sureDk != null) yama.sureDk = a.sureDk;
              if (a.baslangicDk != null) yama.baslangicDk = a.baslangicDk;
              if (a.tur) yama.tur = a.tur;
              // taktik kart alanları — doğal dille düzenlenebilir
              if (a.cagriAdi) yama.cagriAdi = a.cagriAdi;
              if (a.oncelik != null) yama.oncelik = a.oncelik;
              if (a.istenenEtki) yama.istenenEtki = a.istenenEtki;
              if (a.enlem != null && a.boylam != null) yama.konum = { enlem: a.enlem, boylam: a.boylam };
              if (a.hedefEnlem != null && a.hedefBoylam != null)
                yama.hedefKonum = { enlem: a.hedefEnlem, boylam: a.hedefBoylam };
              if (a.bolgeYaricapKm != null) yama.bolgeYaricapKm = a.bolgeYaricapKm;
              if (a.kontrolMakami) yama.kontrolMakami = a.kontrolMakami;
              if (a.frekans) yama.frekans = a.frekans;
              if (a.muhimmat) yama.muhimmat = a.muhimmat;
              if (a.varlikAd) {
                const vs = await this.senkron.varliklar();
                const ara = a.varlikAd.toLocaleLowerCase('tr');
                const v = vs.find((x) => x.ad.toLocaleLowerCase('tr').includes(ara));
                if (!v) {
                  return { output: { error: `Varlık bulunamadı: ${a.varlikAd}` }, summary: 'senkron: varlık yok' };
                }
                yama.varlikId = v.pk;
                yama.varlikAd = v.ad;
                yama.domain = v.domain;
              }
              sonuc = await this.senkron.gorevGuncelle(planId, gid!, yama as never);
              break;
            }
            case 'bagimlilikEkle':
            case 'bagimlilikSil': {
              const onceki = await this.senkron.gorevIdBul(planId, a.oncekiId, a.oncekiAd);
              const sonraki = await this.senkron.gorevIdBul(planId, a.sonrakiId, a.sonrakiAd);
              if (!onceki || !sonraki) {
                return {
                  output: { error: `Görev(ler) çözülemedi: ${a.oncekiAd ?? a.oncekiId} → ${a.sonrakiAd ?? a.sonrakiId}` },
                  summary: 'senkron: bağımlılık ucu yok',
                };
              }
              sonuc =
                a.islem === 'bagimlilikEkle'
                  ? await this.senkron.bagimlilikEkle(planId, {
                      oncekiId: onceki,
                      sonrakiId: sonraki,
                      tur: a.bagTur ?? 'FS',
                      gecikmeDk: a.gecikmeDk ?? 0,
                    })
                  : await this.senkron.bagimlilikSil(planId, onceki, sonraki);
              break;
            }
            case 'gorevEkle':
              sonuc = await this.senkron.gorevEkle(planId, {
                ad: a.ad,
                sureDk: a.sureDk,
                baslangicDk: a.baslangicDk,
                tur: a.tur as never,
                domain: a.domain,
                kaynak: 'aip',
                cagriAdi: a.cagriAdi,
                oncelik: a.oncelik,
                istenenEtki: a.istenenEtki as never,
                konum: a.enlem != null && a.boylam != null ? { enlem: a.enlem, boylam: a.boylam } : undefined,
                hedefKonum:
                  a.hedefEnlem != null && a.hedefBoylam != null
                    ? { enlem: a.hedefEnlem, boylam: a.hedefBoylam }
                    : undefined,
                bolgeYaricapKm: a.bolgeYaricapKm,
                kontrolMakami: a.kontrolMakami,
                frekans: a.frekans,
                muhimmat: a.muhimmat,
              });
              break;
            case 'hSaatiAyarla':
              sonuc = await this.senkron.hSaatiAyarla(planId, a.hSaatiISO ?? '');
              break;
            case 'senaryoTuret':
              sonuc = await this.senkron.senaryoTuret(a.ad);
              break;
            case 'terfi':
              sonuc = await this.senkron.promote(planId);
              break;
            case 'sensorToShooter':
              sonuc = await this.senkron.sensorToShooter(a.izNo ?? '', planId);
              break;
          }
          if (sonuc && typeof sonuc === 'object' && 'hata' in sonuc) {
            const h = (sonuc as { hata: string }).hata;
            return { output: { error: h }, summary: `senkron hata: ${h}` };
          }
          if (a.islem === 'oku') {
            return { output: sonuc, summary: 'senkron: plan okundu (görev listesi döndü)' };
          }
          const p = sonuc as {
            plan?: { id: string; ad: string; gorevler: Array<{ ad?: unknown; baslangicDk?: unknown; sureDk?: unknown; varlikAd?: unknown }> };
            bitisDk?: number;
            cpm?: { kritikYol?: unknown[]; ihlaller?: Array<{ mesaj: string }> };
            cakismalar?: Array<{ mesaj: string }>;
            kaydirilanlar?: unknown[];
            yeniGorev?: { ad: string };
          };
          // DOĞRULAMA GERİ BESLEMESİ (agentic): işlem SONRASI çakışma/ihlal durumu
          // ve güncel görev zamanları döner — LLM "çözüldü" demeden önce kontrol
          // eder, sorun sürüyorsa yeni düzeltme dener.
          const kalanCakisma = p.cakismalar?.map((c) => c.mesaj) ?? [];
          const kalanIhlal = p.cpm?.ihlaller?.map((i) => i.mesaj) ?? [];
          const ozet = {
            ok: true,
            islem: a.islem,
            plan: p.plan ? { id: p.plan.id, ad: p.plan.ad, gorev: p.plan.gorevler.length } : undefined,
            bitisDk: p.bitisDk,
            kritikAdim: p.cpm?.kritikYol?.length,
            kaydirilan: p.kaydirilanlar?.length,
            yeniGorev: p.yeniGorev?.ad,
            gorevZamanlari: p.plan?.gorevler.map((g) => ({
              ad: g.ad, baslangicDk: g.baslangicDk, sureDk: g.sureDk, varlikAd: g.varlikAd,
            })),
            DOGRULAMA: {
              kaynakCakismalari: kalanCakisma,
              ihlaller: kalanIhlal,
              temiz: kalanCakisma.length === 0 && kalanIhlal.length === 0,
              uyari:
                kalanCakisma.length || kalanIhlal.length
                  ? 'SORUN HÂLÂ SÜRÜYOR — "çözüldü" DEME; yukarıdaki listeye göre yeni bir düzeltme dene.'
                  : undefined,
            },
          };
          return {
            output: ozet,
            summary: `senkron ${a.islem}: bitiş ${p.bitisDk ?? '—'} dk · çakışma ${kalanCakisma.length} · ihlal ${kalanIhlal.length}`,
          };
        }
        default:
          return { output: { error: `İşleyici yok: ${name}` }, summary: `hata: ${name}` };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { output: { error: msg }, summary: `hata: ${msg.slice(0, 60)}` };
    }
  }

  private pushPanel(paneller: AssistantPanel[], panel: AssistantPanel): void {
    if (paneller.length < MAX_PANELS) paneller.push(panel);
  }

  /**
   * Mercek analizi kurulumunun TEK yolu — hem asistan aracı hem
   * POST /assistant/mercege-ac (paneldeki "Mercek'te aç") buradan geçer.
   */
  async createMercekAnalysis(
    args: z.infer<typeof mercekAnalizInput>,
  ): Promise<{ id: string; name: string; kartSayisi: number; dashboard: boolean }> {
    const ontology = await this.ontology.getOntology();
    const lintIssues: string[] = [];
    for (const [i, k] of args.kumeler.entries()) {
      for (const issue of lintObjectSetDef(k.def as never, ontology)) {
        lintIssues.push(`kumeler[${i}]: ${issue}`);
      }
    }
    if (lintIssues.length > 0) {
      throw ApiError.invalidBoard(`Ontoloji doğrulaması: ${lintIssues.join(' | ')}`);
    }
    const analysis = buildAnalysis(args, ontology);
    this.mercekAnalyses.upsert(analysis as unknown as StoredAnalysis);
    return {
      id: analysis.id,
      name: analysis.name,
      kartSayisi: analysis.cards.length,
      dashboard: Boolean(analysis.dashboard),
    };
  }

  /** Şeffaflık + UI yetenek keşfi: asistanın o an bildiği her şey */
  async manifest(): Promise<{
    tools: Array<{
      name: string;
      title: string;
      category: ToolCategory;
      description: string;
      examples: string[];
    }>;
    prompt: string;
  }> {
    return {
      tools: TOOL_REGISTRY.map(({ input: _input, ...t }) => t),
      prompt: buildCapabilityPrompt(
        await this.ontology.getOntology(),
        await this.datasets.list(),
      ),
    };
  }

  private systemPrompt(
    nowIso: string,
    context: ChatContext,
    ontology: Awaited<ReturnType<OntologyProvider['getOntology']>>,
    datasets: Awaited<ReturnType<DatasetProvider['list']>>,
  ): string {
    const capabilities = buildCapabilityPrompt(ontology, datasets);
    return `Sen Verim platformunun asistanısın. Kullanıcı Türkçe sorar; sen \
verilen ARAÇLARLA veriyi sorgular, analiz/dashboard/alarm kurar ve Türkçe, \
kısa, net cevap verirsin. Tahmin etme — her sayısal iddia için araç çağır.

Şu an: ${nowIso}${context.path ? `\nKullanıcı şu an ${context.path} sayfasında.` : ''}

${capabilities}

GÖREV KURALLARI:
- objectType/linkType/datasetId şemalarda SAYILIDIR; dataset kimliğini tip
  adı sanma ('izler' dataset'tir, tip 'iz'; gözlem geçmişinin tipi 'iz_gozlem').
- Gözlem/tespit GEÇMİŞİ soruları için 'iz_gozlem' tipini kullan ('iz' yalnız
  son durumu taşır). Saatlik trend için granularity 'hour' vardır.
- ZAMAN PENCERELERİ — "son N dakika/saat/gün" için ASLA sabit ISO tarih
  yazma; GÖRELİ zaman değeri kullan (çalışma anında hesaplanır, canlıda ve
  kayıtlı analizde her zaman doğru kalır):
    { "column":"tespit_zamani", "operator":"gte",
      "values":[{ "kind":"relative", "unit":"hour"|"minute"|"day", "amount":N }] }
  (Örn. "son 1 saat" → unit:"hour", amount:1). Yalnız belirli bir tarih
  aralığı istenirse literal ISO kullan (${nowIso} referans).
- siniflandirma değerleri: Dost, Düşman, Şüpheli, Bilinmeyen. İz domain: Hava, Deniz, Kara.
- Araç hata dönerse (şema hatası dahil) mesajı oku, girdiyi düzelt, tekrar dene.
- Analiz/harmanlama → mercek_analiz_olustur; pipeline/dataset işleme,
  expression/pivot/enrich gerektiren işler → harman_analiz_olustur;
  "izleme paneli / kokpit / ana ekran dashboard'u" → dashboard_olustur
  (platformun TEK dashboard sistemi; gadget'lar DASHBOARD GADGET TÜRLERİ
  kataloğundan); "olursa haber ver" → alarm_kurali_olustur;
  "haritada göster" → haritaya_git.
  Bu araçlar kullanıcıya tıklanabilir düğme sunar — cevabında belirt.
- Sorgu araçlarının sonuçları kullanıcıya sohbetin İÇİNDE canlı tablo/grafik
  paneli olarak otomatik gösterilir — cevabında ham veriyi/uzun listeyi
  TEKRARLAMA; kısa yorumla ve "aşağıdaki tabloda/grafikte" diye işaret et.
- Cevabın belirli bir KONUMA işaret ediyorsa (bir nesnenin enlem/boylamı
  biliniyorsa) haritaya_git'i merkez={lat,lon,zoom,etiket} ile çağır —
  kullanıcı tek tıkla o noktaya odaklanmış haritayı açar.
- Gerçek sayıları ver; gerekiyorsa madde işaretle.

ANALİTİK DAVRANIŞ (Palantir AIP tarzı — pasif değil, proaktif ol):
- "Bunu açıkla / brifing ver / X kime bağlı" → nesne_incele; sonucu akıcı bir
  istihbarat brifingi gibi yaz (özellikleri özetle, ilişkileri anlat, dikkat
  çeken şeyi vurgula). "X'in bağlantı ağını göster" → graf_ac.
- Karşılaştırma isteklerinde ("A ile B'yi kıyasla") her ikisi için ilgili
  metrikleri ayrı ayrı çek, sonra yan yana yorumla.
- Bir bulgu ilgi çekiciyse (ani artış, aykırı değer, düşük hazırlık) bunu
  kendiliğinden belirt ve olası bir sonraki adımı öner (dashboard/alarm/graf).
- Sadece ham veriyi tekrarlama; ne anlama geldiğini kısaca yorumla.`;
  }
}
