import { Storage } from '@google-cloud/storage';
import type { NextFunction, Request, Response } from 'express';
import http from 'node:http';
import https from 'node:https';

/**
 * LOKALE ŞEFFAF PROXY (Cloud Run → Batu'nun lokali)
 *
 * Amaç: `verim-…run.app` adresi 301 ile web.app'e YÖNLENMESİN; içerik doğrudan
 * Batu'nun lokal makinesinden gelsin (web.app'in verim-proxy üzerinden yaptığı
 * gibi, ama tek serviste, ayrı proxy servisi olmadan).
 *
 *   tarayıcı → verim-…run.app (bu app) → trycloudflare tüneli → lokal :8080
 *
 * Tünel adresi sabit değildir; lokaldeki verim-tunnel.sh güncel adresi GCS'e
 * yazar, buradan 30 sn önbellekle okunur. Tünel kapalı/ulaşılamaz ise istek
 * next()'e bırakılır → bu servisin KENDİ (statik) sürümü yanıt verir (fallback
 * ayrı bir servis DEĞİL, bu sürecin kendisi). Böylece run.app linki asla ölmez.
 *
 * Yalnız TUNNEL_BUCKET tanımlıyken (Cloud Run) devreye girer. Lokal docker'da
 * bu değişken tanımsızdır → middleware no-op'tur, hiç proxy yapmaz.
 */

const HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade',
  'proxy-authorization',
  'proxy-authenticate',
  'host',
]);

export function localProxyMiddleware() {
  const bucket = process.env.TUNNEL_BUCKET;
  const object = process.env.TUNNEL_OBJECT ?? 'tunnel-url.txt';
  const cacheMs = Number(process.env.TUNNEL_CACHE_MS ?? 30_000);

  // Devre dışı: TUNNEL_BUCKET yoksa (lokal docker) hiçbir şey yapma.
  if (!bucket) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  const storage = new Storage();
  let cached: { url: string | null; at: number } = { url: null, at: 0 };

  async function tunnelUrl(): Promise<string | null> {
    if (Date.now() - cached.at < cacheMs) return cached.url;
    try {
      const [buf] = await storage.bucket(bucket!).file(object).download();
      const url = buf.toString('utf8').trim().replace(/\/$/, '');
      cached = { url: /^https:\/\//.test(url) ? url : null, at: Date.now() };
    } catch {
      cached = { url: null, at: Date.now() };
    }
    return cached.url;
  }

  function forward(req: Request, res: Response, base: string, next: NextFunction) {
    const url = new URL(req.originalUrl, base);
    const headers: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (v !== undefined && !HOP.has(k.toLowerCase())) headers[k] = v;
    }
    // Döngü kalkanı: karşı uç (lokal) yanlışlıkla proxy modundaysa bizi es geçsin.
    headers['x-verim-fwd'] = '1';
    const agent = url.protocol === 'https:' ? https : http;
    const up = agent.request(
      url,
      { method: req.method, headers, timeout: 25_000 },
      (upRes) => {
        const out: Record<string, string | string[]> = {};
        for (const [k, v] of Object.entries(upRes.headers)) {
          if (v !== undefined && !HOP.has(k.toLowerCase())) out[k] = v;
        }
        res.writeHead(upRes.statusCode ?? 502, out);
        upRes.pipe(res);
      },
    );
    up.on('timeout', () => up.destroy(new Error('tünel zaman aşımı')));
    up.on('error', () => {
      cached = { url: null, at: Date.now() }; // önbelleği düşür, sonraki istek yeniden dener
      if (res.headersSent) {
        res.destroy();
      } else if (req.method === 'GET' || req.method === 'HEAD') {
        // Gövdesiz istekte güvenle yerel sürüme düş (fallback = bu süreç).
        next();
      } else {
        res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Verim lokal kaynağına ulaşılamadı (tünel kapalı).');
      }
    });
    req.pipe(up);
  }

  return (req: Request, res: Response, next: NextFunction) => {
    // Bu istek zaten bir proxy'den geldiyse (döngü) → yerel sun.
    if (req.headers['x-verim-fwd'] === '1' || req.headers['x-verim-proxy'] === '1') {
      next();
      return;
    }
    void tunnelUrl().then((t) => {
      if (t) forward(req, res, t, next);
      else next(); // tünel yok → yerel (statik) sürümü sun
    });
  };
}
