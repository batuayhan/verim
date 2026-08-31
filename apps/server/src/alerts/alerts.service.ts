import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AnalysesStore, type StoredAnalysis } from '../analyses/analyses-store';
import type { ObjectSetDef } from '../contract/mercek';
import {
  OBJECT_SET_ENGINE,
  type IObjectSetEngine,
} from '../ontology/object-set-engine';
import { AlertNotifier, type AlertChannels } from './notifier';

/**
 * Alarm/kural motoru — canlı resmi "operasyonel" yapan parça.
 * Kural = bir ObjectSetDef + (opsiyonel) son-N-dk penceresi + sayı eşiği.
 * Değerlendirici periyodik koşar; sorgular OBJECT_SET_ENGINE portundan
 * geçtiği için dummy/mim ayrımı yoktur ve asistanın kurduğu kurallar da
 * aynı yoldan doğrulanır. Olaylar bellek-içi halkada tutulur (son 500);
 * kurallar dosya/GCS'de kalıcıdır.
 */

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  def: ObjectSetDef;
  /** verilirse def'e tespit_zamani >= now-windowMin filtresi eklenir */
  windowMin?: number;
  operator: 'gt' | 'gte' | 'lt' | 'lte';
  threshold: number;
  /** aynı kuralın yeniden tetiklenmesi için bekleme (sn) */
  cooldownSec: number;
  /** tetiklenince bildirim gönderilecek kanallar (zil her zaman çalışır) */
  channels?: AlertChannels;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  firedAt: string;
  value: number;
  threshold: number;
  operator: AlertRule['operator'];
  message: string;
  acknowledged: boolean;
}

const OPERATOR_TEXT: Record<AlertRule['operator'], string> = {
  gt: 'üstüne çıktı',
  gte: 'eşiğine ulaştı',
  lt: 'altına indi',
  lte: 'eşiğine indi',
};

/** Kurallar mercek analizleriyle aynı kalıcılık mekanizmasını kullanır */
@Injectable()
export class AlertRulesStore extends AnalysesStore {
  protected override readonly fileName = 'alert-rules.json';
  protected override countOf(): number {
    return 1;
  }
}

@Injectable()
export class AlertsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Alerts');
  private readonly events: AlertEvent[] = [];
  private readonly lastFired = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;
  private evaluating = false;
  private eventSeq = 0;

  constructor(
    private readonly store: AlertRulesStore,
    @Inject(OBJECT_SET_ENGINE) private readonly engine: IObjectSetEngine,
    private readonly notifier: AlertNotifier,
  ) {}

  /** UI: hangi bildirim kanalları kullanılabilir (e-posta SMTP'ye bağlı) */
  channelStatus() {
    return this.notifier.status();
  }

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return; // e2e'de zamanlayıcı olmasın
    const interval = Number(process.env.ALARM_INTERVAL_MS ?? 15_000);
    this.timer = setInterval(() => void this.evaluateAll(), interval);
    this.log.log(`Değerlendirici başladı (${interval}ms)`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // --- kurallar -------------------------------------------------------------

  listRules(): AlertRule[] {
    return this.store
      .list()
      .map((s) => this.store.get(s.id) as unknown as AlertRule)
      .filter(Boolean);
  }

  upsertRule(rule: AlertRule): void {
    this.store.upsert(rule as unknown as StoredAnalysis);
  }

  deleteRule(id: string): boolean {
    this.lastFired.delete(id);
    return this.store.delete(id);
  }

  // --- olaylar ----------------------------------------------------------------

  listEvents(limit = 100): { events: AlertEvent[]; unacked: number } {
    return {
      events: this.events.slice(0, limit),
      unacked: this.events.filter((e) => !e.acknowledged).length,
    };
  }

  acknowledge(id: string): boolean {
    const e = this.events.find((x) => x.id === id);
    if (!e) return false;
    e.acknowledged = true;
    return true;
  }

  acknowledgeAll(): void {
    for (const e of this.events) e.acknowledged = true;
  }

  // --- değerlendirme -----------------------------------------------------------

  /** Testler ve elle tetikleme için de kullanılabilir */
  async evaluateAll(): Promise<void> {
    if (this.evaluating) return; // üst üste binme
    this.evaluating = true;
    try {
      for (const rule of this.listRules()) {
        if (!rule.enabled) continue;
        try {
          await this.evaluateRule(rule);
        } catch (e) {
          this.log.warn(`Kural "${rule.name}" değerlendirilemedi: ${(e as Error).message}`);
        }
      }
    } finally {
      this.evaluating = false;
    }
  }

  private async evaluateRule(rule: AlertRule): Promise<void> {
    const now = Date.now();
    const last = this.lastFired.get(rule.id) ?? 0;
    if (now - last < rule.cooldownSec * 1000) return;

    let def = rule.def;
    if (rule.windowMin && rule.windowMin > 0) {
      def = {
        type: 'filter',
        base: def,
        combinator: 'and',
        conditions: [
          {
            id: '__pencere',
            column: 'tespit_zamani',
            operator: 'gte',
            values: [
              {
                kind: 'literal',
                value: new Date(now - rule.windowMin * 60_000).toISOString(),
              },
            ],
          },
        ],
      };
    }

    const r = await this.engine.aggregate({
      def,
      parameters: {},
      metric: { fn: 'count' },
    });
    const value = Number(r.rows[0]?.value ?? 0);
    const breached =
      rule.operator === 'gt'
        ? value > rule.threshold
        : rule.operator === 'gte'
          ? value >= rule.threshold
          : rule.operator === 'lt'
            ? value < rule.threshold
            : value <= rule.threshold;
    if (!breached) return;

    this.lastFired.set(rule.id, now);
    const pencere = rule.windowMin ? ` (son ${rule.windowMin} dk)` : '';
    const event: AlertEvent = {
      id: `evt-${++this.eventSeq}-${now.toString(36)}`,
      ruleId: rule.id,
      ruleName: rule.name,
      firedAt: new Date(now).toISOString(),
      value,
      threshold: rule.threshold,
      operator: rule.operator,
      message: `${rule.name}: değer ${value}, eşik ${rule.threshold} ${OPERATOR_TEXT[rule.operator]}${pencere}`,
      acknowledged: false,
    };
    this.events.unshift(event);
    if (this.events.length > 500) this.events.length = 500;
    this.log.warn(`ALARM — ${event.message}`);
    // Bildirim kanallarına ilet (webhook/e-posta); hata değerlendirmeyi bozmaz
    void this.notifier.dispatch(event, rule.channels);
  }
}
