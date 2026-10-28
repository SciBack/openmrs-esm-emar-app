import { useMemo } from 'react';
import useSWRImmutable from 'swr/immutable';
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';
import type { OpenmrsRef } from '../types';

interface ConceptWithMembers extends OpenmrsRef {
  setMembers?: Array<OpenmrsRef>;
  answers?: Array<OpenmrsRef>;
}

const conceptRep = 'custom:(uuid,display,setMembers:(uuid,display),answers:(uuid,display))';

/**
 * Coded options from a configured concept: its members if it is a set, or its answers if it is a coded question (the
 * two usual patterns in CIEL and in Initializer).
 */
export function useCodedOptions(conceptUuid?: string) {
  const { data, error, isLoading } = useSWRImmutable<{ data: ConceptWithMembers }, Error>(
    conceptUuid ? `${restBaseUrl}/concept/${conceptUuid}?v=${conceptRep}` : null,
    openmrsFetch,
  );
  const options = useMemo(() => {
    const concept = data?.data;
    if (!concept) {
      return [];
    }
    return concept.setMembers?.length ? concept.setMembers : (concept.answers ?? []);
  }, [data]);
  return { options, error, isLoading, configured: Boolean(conceptUuid) };
}

/** Routes and dose units from the order entry configuration (/orderentryconfig), the same as the order basket. */
export function useOrderEntryConfig() {
  const { data, error, isLoading } = useSWRImmutable<
    { data: { drugRoutes: Array<OpenmrsRef>; drugDosingUnits: Array<OpenmrsRef> } },
    Error
  >(`${restBaseUrl}/orderentryconfig`, openmrsFetch);
  return {
    routes: data?.data?.drugRoutes ?? [],
    dosingUnits: data?.data?.drugDosingUnits ?? [],
    error,
    isLoading,
  };
}

/**
 * Restricted concepts: the configured ones plus the members of those that are sets.
 */
export function useReservedConceptUuids(configured: Array<string>) {
  const key = configured?.length ? ['emar-reserved', ...configured] : null;
  const { data, isLoading } = useSWRImmutable<Set<string>>(key, async () => {
    const result = new Set<string>(configured);
    await Promise.all(
      configured.map(async (uuid) => {
        try {
          const response = await openmrsFetch<ConceptWithMembers>(
            `${restBaseUrl}/concept/${uuid}?v=custom:(uuid,setMembers:(uuid))`,
          );
          response.data?.setMembers?.forEach((member) => result.add(member.uuid));
        } catch {
          // Missing concept: the uuid is kept as is, not expanded.
        }
      }),
    );
    return result;
  });
  return { restricted: data ?? new Set<string>(configured ?? []), isLoading };
}
