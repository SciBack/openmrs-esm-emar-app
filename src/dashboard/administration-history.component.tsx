import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DataTable,
  DataTableSkeleton,
  InlineLoading,
  OverflowMenu,
  OverflowMenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from '@carbon/react';
import { formatDatetime, parseDate, useLayoutType, usePagination } from '@openmrs/esm-framework';
import { CardHeader, EmptyState, ErrorState, PatientChartPagination } from '@openmrs/esm-patient-common-lib';
import type { AdministrationRecord, OpenmrsRef } from '../types';
import { canRecordAny, type EmarPermissions } from '../utils/privileges';
import { StatusTags } from '../components/status-tags.component';
import styles from './emar-dashboard.scss';

export interface HistoryActions {
  onViewHistory: (record: AdministrationRecord) => void;
  onCorrect: (record: AdministrationRecord) => void;
  onEnteredInError: (record: AdministrationRecord) => void;
  onCountersign: (record: AdministrationRecord) => void;
  onRegularize: (record: AdministrationRecord) => void;
  onAdverseReaction: (record: AdministrationRecord) => void;
}

interface AdministrationHistoryProps extends HistoryActions {
  records: Array<AdministrationRecord>;
  isLoading: boolean;
  isValidating?: boolean;
  error?: Error;
  permissions: EmarPermissions;
  /** The user's provider: cannot countersign their own record (EMAR_COUNTERSIGN_OWN_RECORD). */
  currentProviderUuid?: string;
  /** Routes from /orderentryconfig, to name the route when the resource only has its uuid. */
  routes?: Array<OpenmrsRef>;
}

const pageSize = 10;

/** Administration history (current versions, docs/API.md §4.3) with who and when. */
export const AdministrationHistory: React.FC<AdministrationHistoryProps> = ({
  records,
  isLoading,
  isValidating,
  error,
  permissions,
  currentProviderUuid,
  routes = [],
  ...actions
}) => {
  const { t } = useTranslation();
  const isTablet = useLayoutType() === 'tablet';
  const headerTitle = t('historyTitle', 'Administration history');

  const headers = useMemo(
    () => [
      { key: 'when', header: t('administeredAt', 'Date and time') },
      { key: 'medication', header: t('medication', 'Medication') },
      { key: 'status', header: t('status', 'Status') },
      { key: 'detail', header: t('detail', 'Dose, route, site and reason') },
      { key: 'performer', header: t('administeredBy', 'Administered by') },
      { key: 'actions', header: '' },
    ],
    [t],
  );

  const rows = useMemo(
    () =>
      records.map((record) => {
        const routeName =
          record.route?.display ??
          (record.route?.uuid ? routes.find((r) => r.uuid === record.route.uuid)?.display : undefined);
        // Dose, route and site only if it was given.
        const given = record.status === 'completed';
        const detail = [
          given && record.dose?.value != null ? `${record.dose.value} ${record.dose.unit ?? ''}`.trim() : null,
          given ? routeName : null,
          given ? record.site?.display : null,
          record.statusReason?.coded?.display ?? record.statusReason?.text,
          record.orderer?.display ? t('indicatedBy', 'Ordered by: {{name}}', { name: record.orderer.display }) : null,
          record.lateEntryReason ? t('lateReasonShown', 'Late: {{reason}}', { reason: record.lateEntryReason }) : null,
        ]
          .filter(Boolean)
          .join(' — ');

        const current = record.status !== 'entered-in-error';
        const can = {
          correct: permissions.correct && current,
          countersign:
            permissions.countersign &&
            record.countersign?.status === 'pending' &&
            (!currentProviderUuid || record.performer?.uuid !== currentProviderUuid),
          regularize: permissions.regularize && record.regularization?.status === 'pending',
          adr: canRecordAny(permissions) && current && record.status === 'completed',
        };

        return {
          id: record.uuid,
          when: (
            <div className={styles.cellStack}>
              <span>{formatDatetime(parseDate(record.effectiveDateTime), { mode: 'standard' })}</span>
              {record.recordedDateTime && (
                <span className={styles.secondary}>
                  {t('recordedOn', 'Recorded: {{date}}', {
                    date: formatDatetime(parseDate(record.recordedDateTime), { mode: 'standard' }),
                  })}
                </span>
              )}
            </div>
          ),
          medication: <span className={record.masked ? styles.masked : undefined}>{record.medication.display}</span>,
          status: (
            <div className={styles.tags}>
              <StatusTags record={record} />
            </div>
          ),
          detail: record.masked ? '—' : detail,
          performer: record.performer?.display ?? '',
          actions: (
            <OverflowMenu
              aria-label={t('actions', 'Actions')}
              iconDescription={t('actions', 'Actions')}
              flipped
              size={isTablet ? 'lg' : 'sm'}
            >
              <OverflowMenuItem
                itemText={t('viewChanges', 'View change history')}
                onClick={() => actions.onViewHistory(record)}
              />
              {can.countersign && (
                <OverflowMenuItem
                  itemText={t('countersign', 'Countersign')}
                  onClick={() => actions.onCountersign(record)}
                />
              )}
              {can.regularize && (
                <OverflowMenuItem
                  itemText={t('regularize', 'Regularize')}
                  onClick={() => actions.onRegularize(record)}
                />
              )}
              {can.adr && (
                <OverflowMenuItem
                  itemText={t('reportAdr', 'Record suspected ADR')}
                  onClick={() => actions.onAdverseReaction(record)}
                />
              )}
              {can.correct && (
                <OverflowMenuItem itemText={t('correct', 'Correct')} onClick={() => actions.onCorrect(record)} />
              )}
              {can.correct && (
                <OverflowMenuItem
                  isDelete
                  hasDivider
                  itemText={t('markEnteredInError', 'Void (entered in error)')}
                  onClick={() => actions.onEnteredInError(record)}
                />
              )}
            </OverflowMenu>
          ),
        };
      }),
    [records, routes, permissions, currentProviderUuid, isTablet, actions, t],
  );

  const { results: pageRows, goTo, currentPage } = usePagination(rows, pageSize);

  if (isLoading) {
    return <DataTableSkeleton role="progressbar" zebra />;
  }
  if (error) {
    return <ErrorState error={error} headerTitle={headerTitle} />;
  }
  if (!records.length) {
    return <EmptyState headerTitle={headerTitle} displayText={t('historyLower', 'recorded administrations')} />;
  }

  return (
    <div className={styles.widgetCard}>
      <CardHeader title={headerTitle}>
        <span>{isValidating ? <InlineLoading /> : null}</span>
      </CardHeader>
      <DataTable rows={pageRows} headers={headers} size={isTablet ? 'lg' : 'sm'} useZebraStyles>
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
      <PatientChartPagination
        pageNumber={currentPage}
        totalItems={rows.length}
        currentItems={pageRows.length}
        pageSize={pageSize}
        onPageNumberChange={({ page }) => goTo(page)}
      />
    </div>
  );
};
