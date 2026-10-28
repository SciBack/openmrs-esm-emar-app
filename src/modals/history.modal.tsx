import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InlineLoading, ModalBody, ModalFooter, ModalHeader, Tag } from '@carbon/react';
import { formatDatetime, getCoreTranslation, parseDate } from '@openmrs/esm-framework';
import { useAdministrationHistory, useEmarConfiguration } from '../api/emar.resource';
import styles from './modals.scss';

interface HistoryModalProps {
  administrationUuid: string;
  closeModal: () => void;
}

const statusKey = {
  completed: 'statusGiven',
  'not-done': 'statusNotGiven',
  'entered-in-error': 'statusEnteredInError',
} as const;

/** Change history of a record: voided versions with author, date, reason and corrected fields. */
const HistoryModal: React.FC<HistoryModalProps> = ({ administrationUuid, closeModal }) => {
  const { t } = useTranslation();
  const { versions, isLoading, error } = useAdministrationHistory(administrationUuid);
  const { configuration } = useEmarConfiguration();
  const fieldName = (code: string) =>
    configuration?.correctableFields?.find((f) => f.code === code || f.uuid === code)?.display ?? code;
  const statusLabel = (status: keyof typeof statusKey) =>
    ({
      statusGiven: t('statusGiven', 'Given'),
      statusNotGiven: t('statusNotGiven', 'Not given'),
      statusEnteredInError: t('statusEnteredInError', 'Voided'),
    })[statusKey[status]] ?? status;

  return (
    <>
      <ModalHeader closeModal={closeModal} title={t('changeHistory', 'Change history')} />
      <ModalBody>
        {isLoading && <InlineLoading description={t('loading', 'Loading') + '…'} />}
        {error && <p>{t('historyError', 'Could not load the history')}</p>}
        {[...versions].reverse().map((v) => (
          <div key={v.uuid} className={v.current ? `${styles.version} ${styles.current}` : styles.version}>
            <p>
              <Tag type={v.current ? 'blue' : 'gray'}>
                {v.current ? t('currentVersion', 'Current') : t('voidedVersion', 'Voided')}
              </Tag>
              {statusLabel(v.status)} · {v.medication?.display} ·{' '}
              {formatDatetime(parseDate(v.effectiveDateTime), { mode: 'standard' })}
            </p>
            <p className={styles.meta}>
              {[
                v.dose != null ? `${v.dose} ${v.doseUnit?.display ?? ''}`.trim() : null,
                v.route?.display,
                v.site?.display,
                v.reasonNotGiven?.display,
              ]
                .filter(Boolean)
                .join(' — ')}
            </p>
            <p className={styles.meta}>
              {t('recordedByOn', 'Recorded by {{name}} on {{date}}', {
                name: v.performer?.display ?? v.recordedBy?.display ?? '—',
                date: formatDatetime(parseDate(v.recordedDateTime), { mode: 'standard' }),
              })}
            </p>
            {v.correctionReason && (
              <p className={styles.meta}>
                {t('correctionReasonShown', 'Correction reason: {{reason}}', { reason: v.correctionReason })}
                {v.correctedFields?.length ? ` (${v.correctedFields.map(fieldName).join(', ')})` : ''}
              </p>
            )}
            {!v.current && v.voidReason && (
              <p className={styles.meta}>{t('voidReasonShown', 'Voided: {{reason}}', { reason: v.voidReason })}</p>
            )}
          </div>
        ))}
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={closeModal}>
          {getCoreTranslation('close')}
        </Button>
      </ModalFooter>
    </>
  );
};

export default HistoryModal;
