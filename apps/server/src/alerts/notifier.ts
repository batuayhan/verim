import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import type { AlertEvent } from './alerts.service';

/**
 * Alarm bildirim kanalları — kural tetiklendiğinde olayı dış sistemlere
 * gerçek olarak iletir (zil UI'ı zaten var; bu katman "operasyonel"i
 * "entegre"ye taşır):
 *
 *   • Webhook  — HER ZAMAN gerçek: kural URL'sine JSON POST (Slack/Teams/
 *                Mattermost/n8n vb. incoming webhook uyumlu). Ek servis yok.
 *   • E-posta  — SMTP üzerinden (nodemailer). SMTP env verilmezse kanal
 *                KİBARCA devre dışıdır (OPENAI_API_KEY deseninin aynısı):
 *                sistemin geri kalanı etkilenmez, durum /alerts/channels'ta.
 *
 * Kanal yapılandırması kuralın içindedir; bir olay birden çok kanala gidebilir.
 */

export interface AlertChannels {
  /** JSON POST edilecek webhook adresi (https) */
  webhook?: string;
  /** Bildirimin gideceği e-posta adresi (SMTP yapılandırılmışsa) */
  email?: string;
}

@Injectable()
export class AlertNotifier {
  private readonly log = new Logger('AlertNotifier');
  private mailer: Transporter | null = null;
  private mailFrom = '';

  constructor() {
    // SMTP_URL örn: smtp://kullanici:parola@smtp.host:587
    const url = process.env.SMTP_URL;
    if (url) {
      try {
        this.mailer = createTransport(url);
        this.mailFrom = process.env.SMTP_FROM ?? 'verim-alarm@localhost';
        this.log.log('E-posta kanalı etkin (SMTP yapılandırıldı)');
      } catch (e) {
        this.log.warn(`SMTP yapılandırması geçersiz — e-posta devre dışı: ${(e as Error).message}`);
      }
    }
  }

  /** UI/durum için: hangi kanallar kullanılabilir */
  status(): { webhook: boolean; email: boolean } {
    return { webhook: true, email: this.mailer != null };
  }

  /** Bir olayı kuralın kanallarına ilet (hata bir kanalı diğerinden ayırmaz) */
  async dispatch(event: AlertEvent, channels: AlertChannels | undefined): Promise<void> {
    if (!channels) return;
    await Promise.allSettled([
      channels.webhook ? this.sendWebhook(channels.webhook, event) : Promise.resolve(),
      channels.email ? this.sendEmail(channels.email, event) : Promise.resolve(),
    ]);
  }

  private async sendWebhook(url: string, event: AlertEvent): Promise<void> {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Slack/Teams uyumu için hem `text` hem yapılandırılmış alanlar
        body: JSON.stringify({
          text: `🚨 VERİM ALARM — ${event.message}`,
          kural: event.ruleName,
          deger: event.value,
          esik: event.threshold,
          zaman: event.firedAt,
          olay_id: event.id,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) this.log.warn(`Webhook ${url} → HTTP ${res.status}`);
    } catch (e) {
      this.log.warn(`Webhook gönderilemedi (${url}): ${(e as Error).message}`);
    }
  }

  private async sendEmail(to: string, event: AlertEvent): Promise<void> {
    if (!this.mailer) return; // kanal devre dışı — sessizce atla
    try {
      await this.mailer.sendMail({
        from: this.mailFrom,
        to,
        subject: `VERİM Alarm: ${event.ruleName}`,
        text:
          `${event.message}\n\n` +
          `Kural: ${event.ruleName}\nDeğer: ${event.value}\nEşik: ${event.threshold}\n` +
          `Zaman: ${event.firedAt}\nOlay: ${event.id}`,
      });
    } catch (e) {
      this.log.warn(`E-posta gönderilemedi (${to}): ${(e as Error).message}`);
    }
  }
}
