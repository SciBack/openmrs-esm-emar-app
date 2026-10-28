import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';
import type { OpenmrsRef } from '../types';

export async function searchProviders(query: string, signal?: AbortSignal): Promise<Array<OpenmrsRef>> {
  if (!query || query.trim().length < 2) {
    return [];
  }
  const response = await openmrsFetch<{ results: Array<OpenmrsRef> }>(
    `${restBaseUrl}/provider?q=${encodeURIComponent(query.trim())}&v=custom:(uuid,display)`,
    { signal },
  );
  return response.data?.results ?? [];
}

export async function searchDrugs(query: string, signal?: AbortSignal) {
  if (!query || query.trim().length < 2) {
    return [];
  }
  const response = await openmrsFetch<{
    results: Array<{ uuid: string; display: string; strength?: string; concept: OpenmrsRef }>;
  }>(
    `${restBaseUrl}/drug?q=${encodeURIComponent(query.trim())}&v=custom:(uuid,display,strength,concept:(uuid,display))`,
    {
      signal,
    },
  );
  return response.data?.results ?? [];
}
