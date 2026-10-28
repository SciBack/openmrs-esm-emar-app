import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InlineLoading, ModalBody, ModalFooter, ModalHeader, TextArea } from '@carbon/react';
import { formatDatetime, getCoreTranslation, parseDate, showSnackbar } from '@openmrs/esm-framework';
import { backendErrorMessage, countersignAdministration } from '../api/emar.resource';
import type { AdministrationRecord } from '../types';
import styles from './modals.scss';

interface CountersignModalProps {
  record: AdministrationRecord;
  closeModal: () => void;
  onDone?: () => void;
}

/** Countersignature of a record by staff whose entries require it (docs/API.md §5.5). */
const CountersignModal: React.FC<CountersignModalProps> = ({ record, closeModal, onDone }) => {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    setIsSubmitting(true);
    try {
      await countersignAdministration(record.uuid, note);
      showSnackbar({ kind: 'success', isLowContrast: true, title: t('countersigned', 'Record countersigned') });
      onDone?.();
      closeModal();
    } catch (error) {
      const { status, code, message } = backendErrorMessage(error);
      showSnackbar({
        kind: 'error',
        title:
          status === 403
            ? t('forbidden', 'You do not have the required privilege')
            : code === 'EMAR_COUNTERSIGN_OWN_RECORD'
              ? t('ownCountersign', 'You cannot countersign your own record')
              : t('countersignError', 'Could not countersign'),
        subtitle: message,
      });
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <ModalHeader closeModal={closeModal} title={t('countersignTitle', 'Countersign administration')} />
      <ModalBody>
        <div className={styles.stack}>
          <p>
            {t(
              'countersignBody',
              'Confirm that you reviewed and countersign the administration recorded by {{performer}} on {{date}}.',
              {
                performer: record.performer?.display ?? '—',
                date: formatDatetime(parseDate(record.effectiveDateTime), { mode: 'standard' }),
              },
            )}
          </p>
          <TextArea
            id="emar-countersign-note"
            labelText={t('countersignNote', 'Note (optional)')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={closeModal}>
          {getCoreTranslation('cancel')}
        </Button>
        <Button kind="primary" onClick={submit} disabled={isSubmitting}>
          {isSubmitting ? <InlineLoading description={t('saving', 'Saving') + '…'} /> : t('countersign', 'Countersign')}
        </Button>
      </ModalFooter>
    </>
  );
};

export default CountersignModal;
