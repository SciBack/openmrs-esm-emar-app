import { useMemo } from 'react';
import { useEmarConfiguration } from '../api/emar.resource';
import type { EmarPrivileges } from '../types';

export type EmarPermissions = EmarPrivileges & { isLoading: boolean; error?: Error };

const none: EmarPrivileges = {
  view: false,
  record: false,
  recordWithCountersign: false,
  recordAdHoc: false,
  correct: false,
  countersign: false,
  regularize: false,
  managePharmacovigilance: false,
  viewRestricted: false,
};

/**
 * eMAR privileges of the current user, as reported by the backend in GET /emar/configuration (docs/API.md §2 and
 * §5.1). The UI only HIDES actions; the backend enforces permissions (403).
 */
export function useEmarPermissions(): EmarPermissions {
  const { configuration, isLoading, error } = useEmarConfiguration();
  return useMemo(
    () => ({ ...none, ...(configuration?.user?.privileges ?? {}), isLoading, error }),
    [configuration, isLoading, error],
  );
}

/** Can record against an order (with or without countersignature). */
export const canRecordAny = (p: EmarPrivileges) => p.record || p.recordWithCountersign;

/** The record will be pending countersignature: the user only has «record with countersignature». */
export const willBePending = (p: EmarPrivileges) => !p.record && p.recordWithCountersign;
