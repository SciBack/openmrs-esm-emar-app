import React from 'react';
import { useTranslation } from 'react-i18next';
import { Tag } from '@carbon/react';
import type { AdministrationRecord } from '../types';

/** Record status and flags (late entry, no order, countersignature, regularization). */
export const StatusTags: React.FC<{ record: AdministrationRecord }> = ({ record }) => {
  const { t } = useTranslation();
  const base =
    record.status === 'entered-in-error' ? (
      <Tag type="gray">{t('statusEnteredInError', 'Voided')}</Tag>
    ) : record.status === 'not-done' ? (
      <Tag type="red">{t('statusNotGiven', 'Not given')}</Tag>
    ) : record.status === 'completed' ? (
      <Tag type="green">{t('statusGiven', 'Given')}</Tag>
    ) : (
      <Tag type="cool-gray">{record.status}</Tag>
    );
  return (
    <>
      {base}
      {record.previousVersion && <Tag type="blue">{t('statusCorrected', 'Corrected')}</Tag>}
      {record.countersign?.status === 'pending' && (
        <Tag type="purple">{t('statusPendingCountersign', 'Pending countersignature')}</Tag>
      )}
      {record.countersign?.status === 'countersigned' && (
        <Tag type="teal">{t('countersignedTag', 'Countersigned')}</Tag>
      )}
      {record.lateEntryReason && <Tag type="warm-gray">{t('lateEntry', 'Late entry')}</Tag>}
      {record.type === 'ad-hoc' && <Tag type="magenta">{t('adHocTag', 'No order')}</Tag>}
      {record.regularization?.status === 'pending' && (
        <Tag type="magenta">{t('pendingRegularization', 'Pending regularization')}</Tag>
      )}
    </>
  );
};
