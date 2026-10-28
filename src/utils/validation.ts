import dayjs from 'dayjs';
import { isLateEntry } from '../api/fhir-mapper';
import type { AdministrationFormValues, WorkspaceMode } from '../types';

export interface ValidationRules {
  mode: WorkspaceMode;
  lateEntryThresholdMinutes: number;
  requireNoteIfNotGiven: boolean;
  now?: Date;
}

type T = (key: string, fallback: string) => string;

/**
 * Form rules, named after the backend 422 codes (docs/API.md §3). Returns field → message; empty = valid. The backend
 * validates again.
 */
export function validateAdministration(values: AdministrationFormValues, rules: ValidationRules, t: T) {
  const errors: Partial<Record<keyof AdministrationFormValues, string>> = {};
  const now = rules.now ?? new Date();
  const voiding = rules.mode === 'correction' && values.enteredInError;

  if (!values.effectiveDateTime || Number.isNaN(values.effectiveDateTime.getTime())) {
    errors.effectiveDateTime = t('dateTimeRequired', 'Enter the date and time');
  } else if (dayjs(values.effectiveDateTime).isAfter(dayjs(now).add(2, 'minute'))) {
    // EMAR_FUTURE_DATETIME (2 min tolerance, EmarConstants.FUTURE_TOLERANCE_MINUTES)
    errors.effectiveDateTime = t('dateTimeInFuture', 'The administration time cannot be in the future');
  } else if (
    rules.mode !== 'correction' &&
    isLateEntry(values.effectiveDateTime, rules.lateEntryThresholdMinutes, now) &&
    !values.lateEntryReason?.trim()
  ) {
    // EMAR_LATE_ENTRY_REASON_REQUIRED
    errors.lateEntryReason = t('lateEntryReasonRequired', 'Late entry: enter the reason');
  }

  if (!values.given && !voiding) {
    if (!values.notGivenReasonUuid) {
      // EMAR_NOT_DONE_REASON_REQUIRED
      errors.notGivenReasonUuid = t('notGivenReasonRequired', 'Select the reason it was not given');
    }
    if (rules.requireNoteIfNotGiven && !values.note?.trim() && !values.notGivenReasonText?.trim()) {
      errors.notGivenReasonText = t('noteRequiredIfNotGiven', 'Explain why it was not given');
    }
  }

  if (values.given && !voiding && values.dose != null && (Number.isNaN(values.dose) || values.dose <= 0)) {
    errors.dose = t('doseInvalid', 'The dose must be greater than zero');
  }

  if (
    values.expirationDate &&
    values.effectiveDateTime &&
    dayjs(values.expirationDate).isBefore(dayjs(values.effectiveDateTime), 'day')
  ) {
    errors.expirationDate = t('expiredBatch', 'The batch was expired on the administration date');
  }

  if (rules.mode === 'adhoc') {
    if (!values.drugUuid) {
      errors.drugUuid = t('drugRequired', 'Select the medication'); // EMAR_MEDICATION_REQUIRED
    }
    if (!values.orderingProviderUuid) {
      errors.orderingProviderUuid = t('orderingProviderRequired', 'Enter the clinician who gave the order'); // EMAR_AD_HOC_ORDERER_REQUIRED
    }
    if (!values.adHocModality) {
      errors.adHocModality = t('modalityRequired', 'Indicate whether it was a verbal order or an emergency'); // EMAR_AD_HOC_MODALITY_REQUIRED
    }
    if (!values.adHocReason?.trim()) {
      errors.adHocReason = t('adHocReasonRequired', 'Enter the reason for administering without an order'); // EMAR_AD_HOC_REASON_REQUIRED
    }
  }

  if (rules.mode === 'correction' && !values.correctionReason?.trim()) {
    errors.correctionReason = t('correctionReasonRequired', 'Enter the correction reason'); // EMAR_CORRECTION_REASON_REQUIRED
  }

  return errors;
}
