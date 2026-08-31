import { useQuery } from '@tanstack/react-query';
import { useLiveMode } from '../api/live';
import { ApiRequestError } from '../api/client';
import { getToken, handleUnauthorized } from '../auth/auth';
import type { QueryError } from '../types/api';
import type {
  ObjectSetAggregateRequest,
  ObjectSetAggregateResponse,
  ObjectSetDef,
  ObjectSetLoadResponse,
  ObjectSetTimeseriesRequest,
  ObjectSetTimeseriesResponse,
  OntologyResponse,
  MercekAnalysis,
  MercekAnalysisSummary,
} from '../types/mercek';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...init,
  });
  if (res.status === 401) {
    handleUnauthorized();
  }
  if (!res.ok) {
    let error: QueryError;
    try {
      error = (await res.json()) as QueryError;
    } catch {
      error = { code: 'INTERNAL', message: `HTTP ${res.status}` };
    }
    throw new ApiRequestError(error);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// --- Ontoloji ---------------------------------------------------------------

export function useOntology() {
  return useQuery({
    queryKey: ['ontology'],
    queryFn: () => request<OntologyResponse>('/ontology'),
    staleTime: Infinity,
  });
}

// --- Object set sorguları -----------------------------------------------------

type Params = Record<string, string | number | boolean | null>;

export function useObjectSet(def: ObjectSetDef | null, params: Params = {}, limit = 100) {
  const { refetchInterval } = useLiveMode();
  return useQuery({
    refetchInterval,
    queryKey: ['objectset', 'load', def, params, limit],
    queryFn: () =>
      request<ObjectSetLoadResponse>('/objectsets/load', {
        method: 'POST',
        body: JSON.stringify({ def, parameters: params, limit }),
      }),
    enabled: def !== null,
    placeholderData: (prev) => prev,
  });
}

export function useObjectSetAggregate(
  req: Omit<ObjectSetAggregateRequest, 'parameters' | 'def'> & { def: ObjectSetDef | null },
  params: Params = {},
) {
  const { refetchInterval } = useLiveMode();
  return useQuery({
    refetchInterval,
    queryKey: ['objectset', 'aggregate', req, params],
    queryFn: () =>
      request<ObjectSetAggregateResponse>('/objectsets/aggregate', {
        method: 'POST',
        body: JSON.stringify({ ...req, parameters: params }),
      }),
    enabled: req.def !== null,
    placeholderData: (prev) => prev,
  });
}

export function useObjectSetTimeseries(
  req: Omit<ObjectSetTimeseriesRequest, 'parameters' | 'def'> & { def: ObjectSetDef | null },
  params: Params = {},
) {
  const { refetchInterval } = useLiveMode();
  return useQuery({
    refetchInterval,
    queryKey: ['objectset', 'timeseries', req, params],
    queryFn: () =>
      request<ObjectSetTimeseriesResponse>('/objectsets/timeseries', {
        method: 'POST',
        body: JSON.stringify({ ...req, parameters: params }),
      }),
    enabled: req.def !== null,
    placeholderData: (prev) => prev,
  });
}

// --- Mercek analiz CRUD --------------------------------------------------------

export function fetchMercekAnalyses() {
  return request<{ analyses: MercekAnalysisSummary[] }>('/mercek/analyses');
}

export function fetchMercekAnalysis(id: string) {
  return request<MercekAnalysis>(`/mercek/analyses/${encodeURIComponent(id)}`);
}

export function saveMercekAnalysis(doc: MercekAnalysis) {
  return request<{ id: string; updatedAt: string }>(
    `/mercek/analyses/${encodeURIComponent(doc.id)}`,
    { method: 'PUT', body: JSON.stringify(doc) },
  );
}

export function deleteMercekAnalysis(id: string) {
  return request<void>(`/mercek/analyses/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
