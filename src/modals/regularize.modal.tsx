import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InlineLoading, ModalBody, ModalFooter, ModalHeader, Select, SelectItem } from '@carbon/react';
import { formatDatetime, getCoreTranslation, parseDate, showSnackbar } from '@openmrs/esm-framework';
import { backendErrorMessage, regularizeAdministration } from '../api/emar.resource';
import type { AdministrationRecord, DrugOrder } from '../types';
import styles from './modals.scss';

interface RegularizeModalProps {
  record: AdministrationRecord;
  orders: Array<DrugOrder>;
  closeModal: () => void;
  onDone?: () => void;
}

/**
 * Links the order that regularizes an ad hoc administration (docs/API.md §5.6). Only orders activated at the same
 * time or later are offered (the order cannot be retroactive).
 */
const RegularizeModal: React.FC<RegularizeModalProps> = ({ record, orders, closeModal, onDone }) => {
  const { t } = useTranslation();
  const candidates = orders.filter(
    (o) => new Date(o.dateActivated).getTime() >= new Date(record.effectiveDateTime).getTime() - 60_000,
  );
  const [orderUuid, setOrderUuid] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    setIsSubmitting(true);
    try {
      await regularizeAdministration(record.uuid, orderUuid);
      showSnackbar({ kind: 'success', isLowContrast: true, title: t('regularized', 'Administration regularized') });
      onDone?.();
      closeModal();
    } catch (error) {
      const { message } = backendErrorMessage(error);
      showSnackbar({ kind: 'error', title: t('regularizeError', 'Could not regularize'), subtitle: message });
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <ModalHeader closeModal={closeModal} title={t('regularizeTitle', 'Regularize with the medical order')} />
      <ModalBody>
        <div className={styles.stack}>
          <p className={styles.meta}>
            {t('regularizeHelp', 'Administration without order on {{date}}. Choose the order that supports it.', {
              date: formatDatetime(parseDate(record.effectiveDateTime), { mode: 'standard' }),
            })}
          </p>
          <Select
            id="emar-regularize-order"
            labelText={t('order', 'Order')}
            value={orderUuid}
            onChange={(e) => setOrderUuid(e.target.value)}
            helperText={candidates.length ? undefined : t('noCandidateOrders', 'No orders after the administration')}
          >
            <SelectItem value="" text={t('select', 'Select')} />
            {candidates.map((o) => (
              <SelectItem
                key={o.uuid}
                value={o.uuid}
                text={`${o.drug?.display ?? o.concept?.display ?? o.orderNumber} — ${formatDatetime(parseDate(o.dateActivated), { mode: 'standard' })}`}
              />
            ))}
          </Select>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={closeModal}>
          {getCoreTranslation('cancel')}
        </Button>
        <Button kind="primary" onClick={submit} disabled={isSubmitting || !orderUuid}>
          {isSubmitting ? <InlineLoading description={t('saving', 'Saving') + '…'} /> : t('regularize', 'Regularize')}
        </Button>
      </ModalFooter>
    </>
  );
};

export default RegularizeModal;
