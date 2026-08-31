import { getToken } from '../auth/auth';
import type { ObjectSetDef } from '../types/mercek';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface AlertChannels {
  webhook?: string;
  email?: string;
}

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  def: ObjectSetDef;
  windowMin?: number;
  operator: 'gt' | 'gte' | 'lt' | 'lte';
  threshold: number;
  cooldownSec: number;
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

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...init,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const fetchRules = () => req<{ rules: AlertRule[] }>('/alerts/rules');
export const fetchChannels = () => req<{ webhook: boolean; email: boolean }>('/alerts/channels');
export const saveRule = (rule: AlertRule) =>
  req<{ ok: true }>(`/alerts/rules/${encodeURIComponent(rule.id)}`, {
    method: 'PUT',
    body: JSON.stringify(rule),
  });
export const deleteRule = (id: string) =>
  req<void>(`/alerts/rules/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const fetchEvents = (limit = 50) =>
  req<{ events: AlertEvent[]; unacked: number }>(`/alerts/events?limit=${limit}`);
export const ackEvent = (id: string) =>
  req<{ ok: boolean }>(`/alerts/events/${encodeURIComponent(id)}/ack`, { method: 'POST' });
export const ackAll = () =>
  req<{ ok: true }>('/alerts/events/ack-all', { method: 'POST' });
