import type {
  DatasetSchemaResponse,
  ListAnalysesResponse,
  ListDatasetsResponse,
  MaterializeRequest,
  MaterializeResponse,
  QueryError,
  QueryRequest,
  QueryResponse,
  SaveAnalysisResponse,
} from '../types/api';
import type { Analysis } from '../types/analysis';
import { getToken, handleUnauthorized } from '../auth/auth';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiRequestError extends Error {
  readonly error: QueryError;

  constructor(error: QueryError) {
    super(error.message);
    this.error = error;
  }
}

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
  return (await res.json()) as T;
}

export function fetchDatasets(): Promise<ListDatasetsResponse> {
  return request('/datasets');
}

export function fetchDatasetSchema(id: string): Promise<DatasetSchemaResponse> {
  return request(`/datasets/${encodeURIComponent(id)}/schema`);
}

export function runQuery(body: QueryRequest): Promise<QueryResponse> {
  return request('/query', { method: 'POST', body: JSON.stringify(body) });
}

export function materializePath(body: MaterializeRequest): Promise<MaterializeResponse> {
  return request('/query/materialize', { method: 'POST', body: JSON.stringify(body) });
}

export function fetchAnalyses(): Promise<ListAnalysesResponse> {
  return request('/analyses');
}

export function fetchAnalysis(id: string): Promise<Analysis> {
  return request(`/analyses/${encodeURIComponent(id)}`);
}

export function saveAnalysis(doc: Analysis): Promise<SaveAnalysisResponse> {
  return request(`/analyses/${encodeURIComponent(doc.id)}`, {
    method: 'PUT',
    body: JSON.stringify(doc),
  });
}

export function deleteAnalysis(id: string): Promise<void> {
  return request(`/analyses/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
