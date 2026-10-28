import React, { type ComponentProps, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  DataTableSkeleton,
  InlineLoading,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from '@carbon/react';
import { AddIcon, formatDate, parseDate, useConfig, useLayoutType } from '@openmrs/esm-framework';
import { CardHeader, EmptyState, ErrorState } from '@openmrs/esm-patient-common-lib';
import type { EmarConfig } from '../config-schema';
import type { DrugOrder } from '../types';
import { canRecordAny, type EmarPermissions } from '../utils/privileges';
import { maskedName } from '../utils/confidentiality';
import styles from './emar-dashboard.scss';

interface ActiveOrdersProps {
  orders: Array<DrugOrder>;
  isLoading: boolean;
  isValidating?: boolean;
  error?: Error;
  permissions: EmarPermissions;
  restricted: Set<string>;
  onRecord: (order: DrugOrder) => void;
  onRecordAdHoc: () => void;
}

export function orderDosageSummary(order: DrugOrder): string {
  if (order.dosingInstructions && order.dose == null) {
    return order.dosingInstructions;
  }
  return [
    order.dose != null ? `${order.dose} ${order.doseUnits?.display ?? ''}`.trim() : null,
    order.route?.display,
    order.frequency?.display,
  ]
    .filter(Boolean)
    .join(' — ');
}

export const ActiveOrders: React.FC<ActiveOrdersProps> = ({
  orders,
  isLoading,
  isValidating,
  error,
  permissions,
  restricted,
  onRecord,
  onRecordAdHoc,
}) => {
  const { t } = useTranslation();
  const { allowAdHoc } = useConfig<EmarConfig>();
  const isTablet = useLayoutType() === 'tablet';
  const headerTitle = t('activeOrdersTitle', 'Active medication orders');
  const canRecord = canRecordAny(permissions);
  const canAdHoc = allowAdHoc && permissions.recordAdHoc && canRecord;

  const headers = useMemo(
    () => [
      { key: 'medication', header: t('medication', 'Medication') },
      { key: 'dosage', header: t('dosage', 'Dose, route and frequency') },
      { key: 'orderer', header: t('orderedBy', 'Ordered by') },
      { key: 'started', header: t('startDate', 'Start') },
      { key: 'actions', header: '' },
    ],
    [t],
  );

  const rows = useMemo(
    () =>
      orders.map((order) => {
        const name = maskedName(
          order.drug?.display ?? order.concept?.display ?? '',
          [order.drug?.concept?.uuid, order.concept?.uuid],
          restricted,
          permissions.viewRestricted,
          t('reservedTreatment', 'Restricted treatment'),
        );
        return {
          id: order.uuid,
          medication: (
            <div className={styles.cellStack}>
              <span className={name.masked ? styles.masked : undefined}>{name.text}</span>
              {order.asNeeded && <span className={styles.secondary}>{t('asNeeded', 'As needed (PRN)')}</span>}
            </div>
          ),
          dosage: name.masked ? '—' : orderDosageSummary(order),
          orderer: order.orderer?.person?.display ?? order.orderer?.display ?? '',
          started: formatDate(parseDate(order.dateActivated), { mode: 'standard', time: true }),
          actions: canRecord ? (
            <div className={styles.actions}>
              <Button kind="ghost" size="sm" onClick={() => onRecord(order)}>
                {t('recordAdministration', 'Record administration')}
              </Button>
            </div>
          ) : null,
        };
      }),
    [orders, restricted, permissions.viewRestricted, canRecord, onRecord, t],
  );

  if (isLoading) {
    return <DataTableSkeleton role="progressbar" zebra />;
  }
  if (error) {
    return <ErrorState error={error} headerTitle={headerTitle} />;
  }

  const adHocButton = canAdHoc ? (
    <Button
      kind="ghost"
      renderIcon={(props: ComponentProps<typeof AddIcon>) => <AddIcon size={16} {...props} />}
      onClick={onRecordAdHoc}
    >
      {t('recordWithoutOrder', 'Record without order')}
    </Button>
  ) : null;

  if (!orders.length) {
    return (
      <div className={styles.widgetCard}>
        <CardHeader title={headerTitle}>{adHocButton}</CardHeader>
        <EmptyState headerTitle={headerTitle} displayText={t('activeOrdersLower', 'active medication orders')} />
      </div>
    );
  }

  return (
    <div className={styles.widgetCard}>
      <CardHeader title={headerTitle}>
        <span>{isValidating ? <InlineLoading /> : null}</span>
        {adHocButton}
      </CardHeader>
      <DataTable rows={rows} headers={headers} size={isTablet ? 'lg' : 'sm'} useZebraStyles>
        {({ rows: tableRows, headers: tableHeaders, getHeaderProps, getTableProps }) => (
          <TableContainer>
            <Table aria-label={headerTitle} {...getTableProps()}>
              <TableHead>
                <TableRow>
                  {tableHeaders.map((header) => (
                    <TableHeader {...getHeaderProps({ header })} key={header.key}>
                      {header.header}
                    </TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {tableRows.map((row) => (
                  <TableRow key={row.id}>
                    {row.cells.map((cell) => (
                      <TableCell key={cell.id}>{cell.value}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>
    </div>
  );
};
