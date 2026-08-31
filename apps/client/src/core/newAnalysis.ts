import { nanoid } from '@reduxjs/toolkit';
import type { Analysis } from '../types/analysis';

/** Boş bir analiz dokümanı — id'si çağırana lazım (navigasyon için). */
export function buildNewAnalysis(name = 'Yeni Analiz'): Analysis {
  return {
    id: nanoid(),
    name,
    paths: [],
    parameters: [],
    dashboard: {
      title: name,
      tabs: [{ id: nanoid(), name: 'Sekme 1', widgets: [] }],
    },
  };
}
