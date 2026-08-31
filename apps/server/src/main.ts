import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { localProxyMiddleware } from './local-proxy';

async function bootstrap(): Promise<void> {
  // Body parser'ı KAPALI kur: proxy middleware'i ham istek akışına ihtiyaç
  // duyar (gövdeyi tüketmeden lokale iletmek için). Proxy'lenmeyen istekler
  // için gövde ayrıştırma aşağıda elle eklenir.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.enableCors({ origin: [/^http:\/\/localhost:\d+$/] });

  // LOKALE PROXY: TUNNEL_BUCKET tanımlıysa (yalnız Cloud Run'da) gelen istekler
  // GCS'teki güncel tünel adresine (Batu'nun lokali) ŞEFFAF proxy'lenir —
  // 301 YÖNLENDİRME YOK, run.app adresi olduğu gibi kalır, içerik lokalden
  // gelir. Tünel kapalı/ulaşılamaz ise buranın kendi (statik) sürümü sunulur.
  // Lokal docker'da TUNNEL_BUCKET tanımsızdır → proxy hiç devreye girmez.
  app.use(localProxyMiddleware());

  // YANIT SIKIŞTIRMA (gzip): büyük JSON'lar (ör. 5000-iz object-set ~2MB) tel
  // üstünde ~10× küçülür — eş-zamanlı çok-kullanıcıda en büyük bant genişliği
  // kazancı. Proxy'den SONRA: yalnız yerel/fallback sunulan yanıtları sıkıştırır.
  app.use(compression({ threshold: 1024 }));

  // Proxy'lenmeyen (fallback/yerel) istekler için gövde ayrıştırma
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  // SPA rotası ↔ API ucu çakışması: /datasets hem frontend sayfası hem
  // korumalı API'dir. Tarayıcı YENİLEMESİ (Accept: text/html) SPA'yı
  // istiyordur — index.html'e düşülür; fetch/XHR (Accept: */* veya json)
  // normal API'ye gider. Aksi halde yenileme 401 JSON gösterir.
  const spaIndex = join(process.cwd(), 'public', 'index.html');
  if (existsSync(spaIndex)) {
    const spaCollisions = new Set(['/datasets']);
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (
        req.method === 'GET' &&
        spaCollisions.has(req.path) &&
        (req.headers.accept ?? '').includes('text/html')
      ) {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(spaIndex);
        return;
      }
      next();
    });
  }

  const config = new DocumentBuilder()
    .setTitle('Verim — Veri Servisi')
    .setDescription(
      'Verim platformunun (Harman + Mercek) dummy veri servisi. ' +
        'Sözleşme: apps/client/docs/API_CONTRACT.md',
    )
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
