import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import {
  Button,
  InlineLoading,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  TextArea,
  TextInput,
} from '@carbon/react';
import { getCoreTranslation, showSnackbar } from '@openmrs/esm-framework';
import { toFhirDateTime } from '../api/fhir-mapper';
import { backendErrorMessage, reportAdverseReaction, useEmarConfiguration } from '../api/emar.resource';
import type { AdrSeverity } from '../types';
import styles from './modals.scss';

interface AdverseReactionModalProps {
  administrationUuid: string;
  closeModal: () => void;
  onDone?: () => void;
}

const local = (d: Date) => dayjs(d).format('YYYY-MM-DDTHH:mm');

/**
 * Suspected adverse drug reaction linked to the administration (docs/API.md §5.7). The reporting deadline of each
 * severity comes from the backend configuration (adrSeverities[].reportingDeadlineHours).
 */
const AdverseReactionModal: React.FC<AdverseReactionModalProps> = ({ administrationUuid, closeModal, onDone }) => {
  const { t } = useTranslation();
  const { configuration } = useEmarConfiguration();
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<AdrSeverity | ''>('');
  const [onset, setOnset] = useState('');
  const [identified, setIdentified] = useState(() => local(new Date()));
  const [action, setAction] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const severities = useMemo(
    () =>
      configuration?.adrSeverities?.length
        ? configuration.adrSeverities
        : [
            { code: 'mild' as const, display: t('severityMild', 'Mild'), reportingDeadlineHours: 72 },
            { code: 'moderate' as const, display: t('severityModerate', 'Moderate'), reportingDeadlineHours: 72 },
            { code: 'severe' as const, display: t('severitySevere', 'Severe'), reportingDeadlineHours: 24 },
          ],
    [configuration, t],
  );
  const deadline = severities.find((s) => s.code === severity)?.reportingDeadlineHours;
  const valid = description.trim() && severity && identified;

  const submit = async () => {
    setSubmitted(true);
    if (!valid) {
      return;
    }
    setIsSubmitting(true);
    try {
      await reportAdverseReaction(administrationUuid, {
        description: description.trim(),
        severity: severity as AdrSeverity,
        identifiedDate: toFhirDateTime(new Date(identified)),
        ...(onset ? { onsetDate: toFhirDateTime(new Date(onset)) } : {}),
        ...(action.trim() ? { action: action.trim() } : {}),
      });
      showSnackbar({
        kind: 'success',
        isLowContrast: true,
        title: t('adrSaved', 'Suspected adverse reaction recorded'),
        subtitle: deadline ? t('adrDeadline', 'Reporting deadline: {{hours}} h', { hours: deadline }) : undefined,
      });
      onDone?.();
      closeModal();
    } catch (error) {
      const { message } = backendErrorMessage(error);
      showSnackbar({
        kind: 'error',
        title: t('adrError', 'Could not record the suspected reaction'),
        subtitle: message,
      });
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <ModalHeader closeModal={closeModal} title={t('adrTitle', 'Suspected adverse reaction')} />
      <ModalBody hasForm>
        <div className={styles.stack}>
          <TextArea
            id="emar-adr-description"
            labelText={t('adrDescription', 'Description')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            invalid={submitted && !description.trim()}
            invalidText={t('required', 'Required')}
          />
          <Select
            id="emar-adr-severity"
            labelText={t('adrSeverity', 'Severity')}
            value={severity}
            onChange={(e) => setSeverity(e.target.value as AdrSeverity)}
            invalid={submitted && !severity}
            invalidText={t('required', 'Required')}
            helperText={deadline ? t('adrDeadline', 'Reporting deadline: {{hours}} h', { hours: deadline }) : undefined}
          >
            <SelectItem value="" text={t('select', 'Select')} />
            {severities.map((s) => (
              <SelectItem key={s.code} value={s.code} text={s.display} />
            ))}
          </Select>
          <div className={styles.row}>
            <TextInput
              id="emar-adr-onset"
              type="datetime-local"
              labelText={t('adrOnset', 'Reaction onset (optional)')}
              value={onset}
              max={local(new Date())}
              onChange={(e) => setOnset(e.target.value)}
            />
            <TextInput
              id="emar-adr-identified"
              type="datetime-local"
              labelText={t('adrIdentified', 'Identified on')}
              value={identified}
              max={local(new Date())}
              onChange={(e) => setIdentified(e.target.value)}
              invalid={submitted && !identified}
              invalidText={t('required', 'Required')}
            />
          </div>
          <TextArea
            id="emar-adr-action"
            labelText={t('adrAction', 'Action taken (optional)')}
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
        </div>
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={closeModal}>
          {getCoreTranslation('cancel')}
        </Button>
        <Button kind="primary" onClick={submit} disabled={isSubmitting}>
          {isSubmitting ? <InlineLoading description={t('saving', 'Saving') + '…'} /> : getCoreTranslation('save')}
        </Button>
      </ModalFooter>
    </>
  );
};

export default AdverseReactionModal;
