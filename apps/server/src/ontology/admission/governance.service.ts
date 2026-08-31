import { Injectable } from '@nestjs/common';
import { AnalysesStore } from '../../analyses/analyses-store';
import { AlertRulesStore } from '../../alerts/alerts.service';
import { DashboardsStore } from '../../dashboards/dashboards.controller';
import { MercekAnalysesStore } from '../mercek-analyses.controller';
import { OntologyAudit } from '../ontology-audit';
import { OntologyExtStore } from '../ontology-ext-store';
import { AdmissionService } from './admission.service';
import { kademe4Etki, type Artefakt, type EtkilenenArtefakt } from './etki';
import type { AdmissionRapor } from './types';

/**
 * Ontoloji uzantısı YAŞAM DÖNGÜSÜ + YÖNETİŞİM (Sprint 4).
 *
 * Durum makinesi: taslak → dogrulandi → onayli → aktif → arsiv.
 *  - yukle: kademe 1-4 koşar; geçerse 'dogrulandi', değilse 'taslak' + rapor
 *  - onayla: DÖRT-GÖZ (onaylayan ≠ yukleyen); dogrulandi → onayli
 *  - aktiflestir: onayli → aktif (önceki aktif arşive)
 *  - geriDon: bir önceki aktif sürüme tek çağrıda dönüş
 * Her eylem denetim izine yazılır. Kademe 4 (etki analizi) kayıtlı
 * Mercek/Harman/alarm/dashboard'ı referans için tarar.
 */
@Injectable()
export class GovernanceService {
  constructor(
    private readonly admission: AdmissionService,
    private readonly store: OntologyExtStore,
    private readonly audit: OntologyAudit,
    private readonly mercek: MercekAnalysesStore,
    private readonly harman: AnalysesStore,
    private readonly alarm: AlertRulesStore,
    private readonly dashboard: DashboardsStore,
  ) {}

  /** Kademe 1-4'ü SAKLAMADAN koştur (önizleme). */
  async onizle(ham: unknown): Promise<{ rapor: AdmissionRapor; etkilenen: EtkilenenArtefakt[] }> {
    return this.degerlendir(ham);
  }

  /** Kademe 1-4 koştur; geçerse doğrulanmış sürüm olarak sakla. */
  async yukle(ham: unknown, kim: string): Promise<{ surum?: number; rapor: AdmissionRapor; etkilenen: EtkilenenArtefakt[] }> {
    const { rapor, etkilenen } = await this.degerlendir(ham);

    // kademe 1 geçmediyse saklanacak geçerli bir uzantı yok
    if (!rapor.gecti && rapor.durduranKademe === 1) return { rapor, etkilenen };

    const v = this.store.ekle(ham as never, kim, rapor.gecti ? 'dogrulandi' : 'taslak');
    this.audit.yaz({
      kim, eylem: 'yukle', surum: v.surum, sha256: v.sha256,
      sonuc: rapor.gecti ? 'dogrulandi' : `reddedildi (kademe ${rapor.durduranKademe})`,
    });
    return { surum: v.surum, rapor, etkilenen };
  }

  /** Kademe 1-3 (admission) + kademe 4 (etki analizi) — saklama YOK. */
  private async degerlendir(ham: unknown): Promise<{ rapor: AdmissionRapor; etkilenen: EtkilenenArtefakt[] }> {
    const rapor = await this.admission.dogrula(ham);
    let etkilenen: EtkilenenArtefakt[] = [];
    if (rapor.gecti) {
      const parsed = ham as Parameters<typeof kademe4Etki>[0];
      const k4 = kademe4Etki(parsed, this.store.aktif()?.icerik, this.tumArtefaktlar());
      rapor.kademeler.push(k4.sonuc);
      etkilenen = k4.etkilenen;
      if (!k4.sonuc.gecti) {
        rapor.gecti = false;
        rapor.durduranKademe = 4;
      }
    }
    return { rapor, etkilenen };
  }

  /** DÖRT-GÖZ onay: onaylayan yukleyenden FARKLI olmalı. */
  onayla(surum: number, kim: string): { ok: boolean; hata?: string } {
    const v = this.store.surum(surum);
    if (!v) return { ok: false, hata: 'Sürüm yok' };
    if (v.durum !== 'dogrulandi') return { ok: false, hata: `Onay için durum 'dogrulandi' olmalı (şu an '${v.durum}')` };
    if (v.yukleyen === kim) {
      this.audit.yaz({ kim, eylem: 'reddet', surum, sonuc: 'dört-göz ihlali (yükleyen=onaylayan)' });
      return { ok: false, hata: 'Dört-göz kuralı: yükleyen kendi uzantısını onaylayamaz' };
    }
    this.store.durumDegistir(surum, 'onayli', { onaylayan: kim });
    this.audit.yaz({ kim, eylem: 'onayla', surum, sonuc: 'onaylandı' });
    return { ok: true };
  }

  aktiflestir(surum: number, kim: string): { ok: boolean; hata?: string; not?: string } {
    const v = this.store.surum(surum);
    if (!v) return { ok: false, hata: 'Sürüm yok' };
    if (v.durum !== 'onayli') return { ok: false, hata: `Aktivasyon için durum 'onayli' olmalı (şu an '${v.durum}')` };
    this.store.aktiflestir(surum);
    this.audit.yaz({ kim, eylem: 'aktiflestir', surum, sonuc: 'aktif' });
    // Yeni tip/link türev indekslerde (OpenSearch/Neo4j) görünmez; v1'de
    // elle tazeleme gerekir (v2 adayı: aktivasyon-sonrası otomatik iş).
    const yeni = v.icerik.objectTypes.length + v.icerik.linkTypes.length;
    return {
      ok: true,
      not: yeni
        ? 'Yeni tip/link araması ve grafta görünmesi için search-load/graph-load elle koşulmalı.'
        : undefined,
    };
  }

  /**
   * Bir önceki aktif sürüme dön. Önceki bir arşiv sürümü varsa onu aktifleştir;
   * yoksa (ilk uzantıysa) aktifi arşive alıp UZANTISIZ (saf çekirdek) duruma dön.
   */
  geriDon(kim: string): { ok: boolean; surum?: number; hata?: string } {
    const aktif = this.store.aktif();
    if (!aktif) return { ok: false, hata: 'Aktif uzantı yok — dönülecek bir şey yok' };

    const onceki = this.store
      .tumSurumler()
      .find((s) => s.durum === 'arsiv' && s.surum < aktif.surum); // sürüm-azalan sıralı

    if (onceki) {
      this.store.aktiflestir(onceki.surum);
      this.audit.yaz({ kim, eylem: 'rollback', surum: onceki.surum, sonuc: `v${onceki.surum} aktif` });
      return { ok: true, surum: onceki.surum };
    }
    // Önceki yok → ilk uzantıydı; devre dışı bırak (çekirdeğe dön)
    this.store.durumDegistir(aktif.surum, 'arsiv');
    this.audit.yaz({ kim, eylem: 'rollback', surum: aktif.surum, sonuc: 'uzantısız (çekirdek) duruma dönüldü' });
    return { ok: true };
  }

  private tumArtefaktlar(): Artefakt[] {
    const topla = (store: { list(): { id: string; name: string }[]; get(id: string): unknown }, tur: Artefakt['tur']): Artefakt[] =>
      store.list().map((s) => ({ id: s.id, ad: s.name, tur, belge: store.get(s.id) }));
    return [
      ...topla(this.mercek, 'mercek'),
      ...topla(this.harman, 'harman'),
      ...topla(this.alarm, 'alarm'),
      ...topla(this.dashboard, 'dashboard'),
    ];
  }
}
