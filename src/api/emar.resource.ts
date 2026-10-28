/**
 * Contract with the `openmrs-module-emar` backend (docs/API.md):
 * - FHIR R4 `MedicationAdministration`: search and create (§4).
 * - REST `/ws/rest/v1/emar`: configuration, history, correction, countersignature, regularization and suspected
 *   adverse drug reaction (§5).
 */
import { useMemo } from 'react';
import useSWR from 'swr';
import { fhirBaseUrl, openmrsFetch } from '@openmrs/esm-framework';
import { emarErrorSystem, emarRestBase } from '../constants';
import { toAdministrationRecord, type CorrectionPayload, type FhirMedicationAdministration } from './fhir-mapper';
import type { AdministrationRecord, AdministrationRecordRest, AdrSeverity, EmarConfiguration } from '../types';

export const configurationUrl = `${emarRestBase}/configuration`;
/**
 * History search. fhir2 pages 10 by 10 by default (seen on a test server: total 25, 10 entries and a `next` link);
 * 100 per page are requested and the `next` links are followed (see fetchAllPages).
 */
export const administrationsUrl = (patientUuid: string) =>
  `${fhirBaseUrl}/MedicationAdministration?patient=${patientUuid}&_count=100`;

/** Catalogs, parameters and the current user's privileges (§5.1). A 403 means «no eMAR: View». */
export function useEmarConfiguration() {
  const { data, error, isLoading, mutate } = useSWR<{ data: EmarConfiguration }, Error>(
    configurationUrl,
    openmrsFetch,
    {
      revalidateOnFocus: false,
    },
  );
  return { configuration: data?.data, error, isLoading, mutate };
}

interface Bundle {
  resourceType: 'Bundle';
  total?: number;
  link?: Array<{ relation: string; url: string }>;
  entry?: Array<{ resource: FhirMedicationAdministration }>;
}

/** Current versions of the patient, newest first (§4.3). */
const maxPages = 20;

/**
 * Fetches every page of a Bundle following `link[next]`. The link is absolute with the host the server saw (behind a
 * proxy it may differ from the browser's), so it is rewritten relative to fhirBaseUrl.
 */
export async function fetchAllPages(url: string): Promise<{ data: Bundle }> {
  const first = await openmrsFetch<Bundle>(url);
  const entry = [...(first.data?.entry ?? [])];
  let next = first.data?.link?.find((l) => l.relation === 'next')?.url;
  for (let i = 0; next && i < maxPages; i++) {
    const idx = next.indexOf('/ws/fhir2/R4');
    const relative = idx >= 0 ? `${fhirBaseUrl}${next.slice(idx + '/ws/fhir2/R4'.length)}` : next;
    const page = await openmrsFetch<Bundle>(relative);
    entry.push(...(page.data?.entry ?? []));
    next = page.data?.link?.find((l) => l.relation === 'next')?.url;
  }
  return { data: { ...first.data, entry } };
}

export function useAdministrations(patientUuid: string, enabled = true) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<{ data: Bundle }, Error>(
    patientUuid && enabled ? administrationsUrl(patientUuid) : null,
    fetchAllPages,
  );
  const records: Array<AdministrationRecord> = useMemo(
    () =>
      (data?.data?.entry ?? [])
        .map((e) => e.resource)
        .filter((r) => r?.resourceType === 'MedicationAdministration')
        .map(toAdministrationRecord)
        .sort((a, b) => new Date(b.effectiveDateTime).getTime() - new Date(a.effectiveDateTime).getTime()),
    [data],
  );
  return { records, error, isLoading, isValidating, mutate };
}

export function saveAdministration(resource: FhirMedicationAdministration, signal?: AbortSignal) {
  return openmrsFetch<FhirMedicationAdministration>(`${fhirBaseUrl}/MedicationAdministration`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/fhir+json' },
    body: resource,
    signal,
  });
}

const postJson = <T = AdministrationRecordRest>(url: string, body: object, signal?: AbortSignal) =>
  openmrsFetch<T>(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal });

export const correctAdministration = (uuid: string, payload: CorrectionPayload, signal?: AbortSignal) =>
  postJson(`${emarRestBase}/administration/${uuid}/correction`, payload, signal);

export const countersignAdministration = (uuid: string, note?: string, signal?: AbortSignal) =>
  postJson(`${emarRestBase}/administration/${uuid}/countersign`, note?.trim() ? { note: note.trim() } : {}, signal);

export const regularizeAdministration = (uuid: string, orderUuid: string, signal?: AbortSignal) =>
  postJson(`${emarRestBase}/administration/${uuid}/regularization`, { order: orderUuid }, signal);

export interface SuspectedAdrPayload {
  description: string;
  onsetDate?: string;
  identifiedDate: string;
  severity: AdrSeverity;
  action?: string;
}

export const reportAdverseReaction = (uuid: string, payload: SuspectedAdrPayload, signal?: AbortSignal) =>
  postJson(`${emarRestBase}/administration/${uuid}/suspected-adr`, payload, signal);

/** Every version of a record, oldest first (§5.3). */
export function useAdministrationHistory(uuid?: string) {
  const { data, error, isLoading } = useSWR<
    { data: { encounter: string; current: string; versions: Array<AdministrationRecordRest> } },
    Error
  >(uuid ? `${emarRestBase}/administration/${uuid}/history` : null, openmrsFetch);
  return { versions: data?.data?.versions ?? [], error, isLoading };
}

/**
 * Readable backend error (§3): FHIR `OperationOutcome` (eMAR code in issue[0].details.coding[0].code and message in
 * diagnostics) or REST `{"error":{"code","message"}}` / `{"error":{"message"}}` from webservices.rest.
 */
export function backendErrorMessage(error: unknown): { status?: number; code?: string; message?: string } {
  const e = error as { response?: { status?: number }; responseBody?: any; message?: string };
  const status = e?.response?.status;
  const body = e?.responseBody;
  const issue = body?.issue?.[0];
  const fhirCode = issue?.details?.coding?.find((c: any) => !c.system || c.system === emarErrorSystem)?.code;
  const fhirMessage = body?.issue
    ?.map((i: any) => i?.diagnostics ?? i?.details?.text)
    .filter(Boolean)
    .join(' · ');
  const restCode = body?.error?.code;
  const restMessage = body?.error?.message;
  return { status, code: fhirCode ?? restCode, message: fhirMessage || restMessage || e?.message };
}
