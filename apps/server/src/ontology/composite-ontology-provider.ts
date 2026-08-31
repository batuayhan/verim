import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OntologyResponse } from '../contract/mercek';
import { mergeExtension } from '../contract/ontology-ext';
import { OntologyExtStore } from './ontology-ext-store';
import { ONTOLOGY_PROVIDER, type OntologyProvider } from './ontology-provider';

/**
 * ÇEKİRDEK ⊕ UZANTI ontoloji sağlayıcısı (Sprint 2, iki katmanlı model).
 *
 * Çekirdek ontoloji (koddaki Mim/Dummy provider) her zaman esastır. Uzantı
 * katmanı YALNIZCA şu iki koşul birlikte sağlanırsa uygulanır:
 *   1. ONTOLOGY_EXTENSIONS ortam bayrağı 'on',
 *   2. Depoda 'aktif' bir uzantı sürümü var.
 * Aksi halde bu sağlayıcı, çekirdeğin çıktısını AYNEN döndürür — yani bayrak
 * kapalıyken sistem bit-değişmez (parite snapshot testiyle güvence altında).
 *
 * Çekirdek provider ayrı bir token'dan (KERNEL_ONTOLOGY_PROVIDER) gelir;
 * ONTOLOGY_PROVIDER artık bu composite'i işaret eder.
 */

export const KERNEL_ONTOLOGY_PROVIDER = Symbol('KERNEL_ONTOLOGY_PROVIDER');

@Injectable()
export class CompositeOntologyProvider implements OntologyProvider {
  private readonly log = new Logger('CompositeOntology');
  private readonly aktif = process.env.ONTOLOGY_EXTENSIONS === 'on';

  constructor(
    @Inject(KERNEL_ONTOLOGY_PROVIDER) private readonly kernel: OntologyProvider,
    private readonly store: OntologyExtStore,
  ) {}

  async getOntology(): Promise<OntologyResponse> {
    const kernel = await this.kernel.getOntology();
    if (!this.aktif) return kernel;

    const aktifSurum = this.store.aktif();
    if (!aktifSurum) return kernel;

    try {
      return mergeExtension(kernel, aktifSurum.icerik);
    } catch (e) {
      // Aktif uzantı bir şekilde geçersizse (ör. bağlı olduğu kernel tipi
      // sonradan değiştiyse) çekirdeğe güvenli düşülür — sistem çökmemeli.
      this.log.error(
        `Aktif uzantı (v${aktifSurum.surum}) birleştirilemedi, çekirdeğe düşülüyor: ${(e as Error).message}`,
      );
      return kernel;
    }
  }
}
