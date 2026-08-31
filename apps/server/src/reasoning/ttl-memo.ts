/**
 * Küçük TTL memo — pahalı asenkron yükleri kısa süre (ms) önbelleğe alır ve
 * EŞZAMANLI çağrıları TEK uçuşta paylaştırır (thundering-herd önleme).
 *
 * Canlı-modda 3 reasoning ucu aynı anda aynı `skorluIz` yükünü çekiyordu; bu
 * memo ile poll tikinde bu yük ~1'e iner. TTL kısa (2-3 sn) → veri tazeliği
 * poll aralığı düzeyinde korunur. Yükleyici reddederse kayıt düşürülür
 * (bir sonraki çağrı yeniden dener, bayat hata cache'lenmez).
 */
export class TtlMemo {
  private store = new Map<string, { p: Promise<unknown>; at: number }>();

  get<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.store.get(key);
    if (hit && now - hit.at < ttlMs) return hit.p as Promise<T>;
    const p = loader();
    const kayit = { p: p as Promise<unknown>, at: now };
    this.store.set(key, kayit);
    p.catch(() => {
      if (this.store.get(key) === kayit) this.store.delete(key); // hatayı cache'leme
    });
    return p;
  }
}
