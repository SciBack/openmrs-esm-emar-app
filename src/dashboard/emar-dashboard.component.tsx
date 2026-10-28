import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { InlineLoading, InlineNotification } from '@carbon/react';
import { showModal, useConfig } from '@openmrs/esm-framework';
import { useLaunchWorkspaceRequiringVisit } from '@openmrs/esm-patient-common-lib';
import { recordAdministrationWorkspace } from '../constants';
import type { EmarConfig } from '../config-schema';
import type { AdministrationRecord, DrugOrder, RecordAdministrationWorkspaceProps } from '../types';
import { useActiveDrugOrders, useAllDrugOrders } from '../api/drug-orders.resource';
import { backendErrorMessage, useAdministrations, useEmarConfiguration } from '../api/emar.resource';
import { useOrderEntryConfig, useReservedConceptUuids } from '../api/concepts.resource';
import { useEmarPermissions } from '../utils/privileges';
import { UnsignedNotice } from '../components/unsigned-notice.component';
import { ActiveOrders } from './active-orders.component';
import { AdministrationHistory, type HistoryActions } from './administration-history.component';
import styles from './emar-dashboard.scss';

interface EmarDashboardProps {
  patientUuid: string;
}

/**
 * «Medication administration» tab of the patient chart (own slot `emar-dashboard-slot`, linked from
 * `patient-chart-dashboard-slot`): active orders + history.
 */
const EmarDashboard: React.FC<EmarDashboardProps> = ({ patientUuid }) => {
  const { t } = useTranslation();
  const config = useConfig<EmarConfig>();
  const { configuration, error: configError } = useEmarConfiguration();
  const permissions = useEmarPermissions();
  const {
    activeOrders,
    isLoading: loadingOrders,
    isValidating: validatingOrders,
    error: ordersError,
  } = useActiveDrugOrders(patientUuid);
  const ordersByUuid = useAllDrugOrders(patientUuid);
  const {
    records,
    isLoading: loadingRecords,
    isValidating: validatingRecords,
    error: recordsError,
    mutate,
  } = useAdministrations(patientUuid, permissions.view);
  const { restricted } = useReservedConceptUuids(config.reservedConceptUuids);
  const { routes } = useOrderEntryConfig();

  // Without an active visit the chart offers to start one (the backend requires a visit: EMAR_NO_ACTIVE_VISIT).
  const launchRecordWorkspace = useLaunchWorkspaceRequiringVisit<RecordAdministrationWorkspaceProps>(
    patientUuid,
    recordAdministrationWorkspace,
  );

  const onRecord = useCallback(
    (order: DrugOrder) => launchRecordWorkspace({ mode: 'order', order }),
    [launchRecordWorkspace],
  );
  const onRecordAdHoc = useCallback(() => launchRecordWorkspace({ mode: 'adhoc' }), [launchRecordWorkspace]);

  const open = useCallback(
    (name: string, props: object) => {
      const dispose = showModal(name, { ...props, closeModal: () => dispose(), onDone: () => mutate() });
    },
    [mutate],
  );

  const actions: HistoryActions = useMemo(
    () => ({
      onViewHistory: (record) => open('emar-history-modal', { administrationUuid: record.uuid }),
      onCountersign: (record) => open('emar-countersign-modal', { record }),
      onRegularize: (record) => open('emar-regularize-modal', { record, orders: Array.from(ordersByUuid.values()) }),
      onAdverseReaction: (record) => open('emar-adverse-reaction-modal', { administrationUuid: record.uuid }),
      onCorrect: (record: AdministrationRecord) =>
        launchRecordWorkspace({
          mode: 'correction',
          record,
          order: record.orderUuid ? ordersByUuid.get(record.orderUuid) : undefined,
        }),
      onEnteredInError: (record: AdministrationRecord) =>
        launchRecordWorkspace({
          mode: 'correction',
          record: { ...record, displayStatus: 'enteredInError' },
          order: record.orderUuid ? ordersByUuid.get(record.orderUuid) : undefined,
        }),
    }),
    [open, launchRecordWorkspace, ordersByUuid],
  );

  if (permissions.isLoading) {
    return <InlineLoading description={t('loading', 'Loading') + '…'} />;
  }

  if (configError) {
    const { status, message } = backendErrorMessage(configError);
    return (
      <InlineNotification
        kind={status === 403 ? 'warning' : 'error'}
        lowContrast
        hideCloseButton
        title={
          status === 403
            ? t('noViewPrivilege', 'You are not allowed to view medication administration')
            : t('backendUnavailable', 'The medication administration module is not responding')
        }
        subtitle={status === 403 ? undefined : message}
      />
    );
  }

  if (!permissions.view) {
    return (
      <InlineNotification
        kind="warning"
        lowContrast
        hideCloseButton
        title={t('noViewPrivilege', 'You are not allowed to view medication administration')}
      />
    );
  }

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>{t('medicationAdministration', 'Medication administration')}</h2>
      <UnsignedNotice className={styles.notice} />
      <ActiveOrders
        orders={activeOrders}
        isLoading={loadingOrders}
        isValidating={validatingOrders}
        error={ordersError}
        permissions={permissions}
        restricted={restricted}
        onRecord={onRecord}
        onRecordAdHoc={onRecordAdHoc}
      />
      <AdministrationHistory
        records={records}
        isLoading={loadingRecords}
        isValidating={validatingRecords}
        error={recordsError}
        permissions={permissions}
        currentProviderUuid={configuration?.user?.provider?.uuid}
        routes={routes}
        {...actions}
      />
    </div>
  );
};

export default EmarDashboard;
