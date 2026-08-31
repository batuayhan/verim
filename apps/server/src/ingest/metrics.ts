/**
 * Ingest gözlemlenebilirliği — omurga sessiz çalışmasın. Ayrı süreç olan
 * ingest'e küçük bir HTTP yüzeyi ekler:
 *   GET /saglik  → canlılık + özet
 *   GET /metrik  → sayaçlar (tüketilen/yazılan/karantina/…) + kırılımlar
 *
 * Prometheus'a gerek yok; JSON yeter (demo + on-prem). INGEST_HTTP_PORT ile
 * kapatılabilir (0 → sunucu açılmaz).
 */

import http from 'node:http';

export class IngestMetrikleri {
  readonly baslangic = Date.now();
  tuketilen = 0; // topic'ten okunan mesaj (gözlem+intel ham)
  yazilanGozlem = 0;
  yaratilanIz = 0;
  yazilanIstihbarat = 0;
  yinelenenAtlanan = 0; // dedup ile düşen (ON CONFLICT)
  karantina = 0;
  sonBatchMs = 0;
  sonHata: string | null = null;
  readonly karantinaSebep = new Map<string, number>();
  readonly bolgeSayac = new Map<string, number>();

  karantinaEkle(sebep: string, adet = 1): void {
    this.karantina += adet;
    this.karantinaSebep.set(sebep, (this.karantinaSebep.get(sebep) ?? 0) + adet);
  }

  bolgeEkle(bolge: string): void {
    this.bolgeSayac.set(bolge, (this.bolgeSayac.get(bolge) ?? 0) + 1);
  }

  private ozet() {
    const enUst = (m: Map<string, number>, n: number) =>
      Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n));
    return {
      durum: 'ayakta',
      calismaSaniye: Math.floor((Date.now() - this.baslangic) / 1000),
      tuketilen: this.tuketilen,
      yazilanGozlem: this.yazilanGozlem,
      yaratilanIz: this.yaratilanIz,
      yazilanIstihbarat: this.yazilanIstihbarat,
      yinelenenAtlanan: this.yinelenenAtlanan,
      karantina: this.karantina,
      karantinaOrani: this.tuketilen ? +(this.karantina / this.tuketilen).toFixed(4) : 0,
      sonBatchMs: this.sonBatchMs,
      sonHata: this.sonHata,
      karantinaSebepleri: enUst(this.karantinaSebep, 10),
      enYogunBolgeler: enUst(this.bolgeSayac, 10),
    };
  }

  /** HTTP sunucusunu başlat (port 0/geçersizse açmaz). unref → süreç kapanışını engellemez. */
  sunucuBaslat(port = Number(process.env.INGEST_HTTP_PORT ?? 9464)): http.Server | null {
    if (!port) return null;
    const srv = http.createServer((req, res) => {
      const govde =
        req.url === '/metrik'
          ? this.ozet()
          : { durum: 'ayakta', calismaSaniye: Math.floor((Date.now() - this.baslangic) / 1000) };
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(govde));
    });
    srv.listen(port, () => console.log(`ingest metrik/sağlık HTTP :${port}`));
    srv.unref();
    return srv;
  }
}
