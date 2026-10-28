import { useMemo } from 'react';
import useSWR from 'swr';
import { openmrsFetch, restBaseUrl, useConfig } from '@openmrs/esm-framework';
import type { EmarConfig } from '../config-schema';
import type { DrugOrder } from '../types';

/** Same representation as esm-patient-medications-app 12.3.4 (api/api.ts), reduced to what the eMAR shows. */
export const drugOrderRepresentation =
  'custom:(uuid,orderNumber,action,dateActivated,scheduledDate,dateStopped,autoExpireDate,' +
  'drug:(uuid,display,strength,dosageForm:(uuid,display),concept:(uuid,display)),concept:(uuid,display),' +
  'dose,doseUnits:(uuid,display),route:(uuid,display),frequency:(uuid,display),asNeeded,dosingInstructions,' +
  'orderer:(uuid,display,person:(display)),encounter:(uuid))';

/**
 * An order accepts records while it is active: not stopped, not expired and not scheduled in the future (same rule as
 * bucketMedicationOrders in esm-patient-medications-app). Stopped or expired → ad hoc only.
 */
export function isOrderActive(order: DrugOrder, now: Date = new Date()): boolean {
  const stopped = order.dateStopped ? new Date(order.dateStopped) : null;
  const expires = order.autoExpireDate ? new Date(order.autoExpireDate) : null;
  const scheduled = order.scheduledDate ? new Date(order.scheduledDate) : null;
  if (order.action === 'DISCONTINUE') {
    return false;
  }
  if (scheduled && scheduled > now && !stopped) {
    return false;
  }
  if ((expires && expires <= now) || (stopped && stopped <= now)) {
    return false;
  }
  return true;
}

export function useActiveDrugOrders(patientUuid: string) {
  const { drugOrderTypeUuid, careSettingUuid } = useConfig<EmarConfig>();
  const url = patientUuid
    ? `${restBaseUrl}/order?patient=${patientUuid}&careSetting=${careSettingUuid}&orderTypes=${drugOrderTypeUuid}` +
      `&excludeDiscontinueOrders=true&v=${drugOrderRepresentation}`
    : null;
  const { data, error, isLoading, isValidating, mutate } = useSWR<{ data: { results: Array<DrugOrder> } }, Error>(
    url,
    openmrsFetch,
  );
  const activeOrders = useMemo(
    () =>
      (data?.data?.results ?? [])
        .filter((order) => isOrderActive(order))
        .sort((a, b) => new Date(b.dateActivated).getTime() - new Date(a.dateActivated).getTime()),
    [data],
  );
  return { activeOrders, error, isLoading, isValidating, mutate };
}

/** Every drug order of the patient (active or not), to resolve concept and name in the history. */
export function useAllDrugOrders(patientUuid: string) {
  const { drugOrderTypeUuid, careSettingUuid } = useConfig<EmarConfig>();
  const url = patientUuid
    ? `${restBaseUrl}/order?patient=${patientUuid}&careSetting=${careSettingUuid}&orderTypes=${drugOrderTypeUuid}` +
      `&excludeDiscontinueOrders=true&v=${drugOrderRepresentation}`
    : null;
  const { data } = useSWR<{ data: { results: Array<DrugOrder> } }, Error>(url, openmrsFetch);
  return useMemo(() => new Map((data?.data?.results ?? []).map((o) => [o.uuid, o])), [data]);
}
