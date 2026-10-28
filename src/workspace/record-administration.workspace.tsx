import React, { useCallback, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { mutate as globalMutate } from 'swr';
import {
  Button,
  ButtonSet,
  Checkbox,
  Form,
  InlineLoading,
  InlineNotification,
  NumberInput,
  RadioButton,
  RadioButtonGroup,
  Select,
  SelectItem,
  Stack,
  Tag,
  TextArea,
  TextInput,
  TimePicker,
} from '@carbon/react';
import {
  getCoreTranslation,
  OpenmrsDatePicker,
  ResponsiveWrapper,
  showModal,
  showSnackbar,
  useConfig,
  useLayoutType,
  useSession,
  Workspace2,
} from '@openmrs/esm-framework';
import { launchStartVisitPrompt, type PatientWorkspace2DefinitionProps } from '@openmrs/esm-patient-common-lib';
import type { EmarConfig } from '../config-schema';
import type { AdministrationFormValues, RecordAdministrationWorkspaceProps } from '../types';
import { buildCorrectionPayload, buildMedicationAdministration, isLateEntry } from '../api/fhir-mapper';
import { emarExtensions } from '../constants';
import {
  administrationsUrl,
  backendErrorMessage,
  correctAdministration,
  saveAdministration,
  useEmarConfiguration,
} from '../api/emar.resource';
import { useCodedOptions, useOrderEntryConfig } from '../api/concepts.resource';
import { searchDrugs, searchProviders } from '../api/providers.resource';
import { orderDosageSummary } from '../dashboard/active-orders.component';
import { canRecordAny, useEmarPermissions, willBePending } from '../utils/privileges';
import { validateAdministration } from '../utils/validation';
import { AsyncSearch, type SearchItem } from '../components/async-search.component';
import { UnsignedNotice } from '../components/unsigned-notice.component';
import styles from './record-administration.scss';

const timePattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export function initialValues(
  props: RecordAdministrationWorkspaceProps | null,
  now = new Date(),
): AdministrationFormValues {
  const order = props?.order;
  const record = props?.record;
  if (props?.mode === 'correction' && record) {
    return {
      given: record.status !== 'not-done',
      effectiveDateTime: new Date(record.effectiveDateTime),
      dose: record.dose?.value ?? null,
      doseUnitUuid: record.dose?.unitUuid,
      doseUnitDisplay: record.dose?.unit,
      routeUuid: record.route?.uuid || undefined,
      siteUuid: record.site?.uuid || undefined,
      notGivenReasonUuid: record.statusReason?.coded?.uuid,
      notGivenReasonText: record.statusReason?.text ?? '',
      note: record.note ?? '',
      lotNumber: record.lotNumber ?? '',
      expirationDate: record.expirationDate ? dayjs(record.expirationDate).toDate() : null,
      enteredInError: record.displayStatus === 'enteredInError',
    };
  }
  return {
    given: true,
    effectiveDateTime: now,
    dose: order?.dose ?? null,
    doseUnitUuid: order?.doseUnits?.uuid,
    doseUnitDisplay: order?.doseUnits?.display,
    routeUuid: order?.route?.uuid,
    note: '',
  };
}

const withTime = (date: Date, time: string) => {
  const [h, m] = time.split(':').map(Number);
  return Number.isNaN(h) || Number.isNaN(m) ? date : dayjs(date).hour(h).minute(m).second(0).millisecond(0).toDate();
};

/**
 * «Record administration» workspace: against an order, without an order (ad hoc: verbal or emergency order) or as a
 * correction of a record (new version with a reason; the previous one is voided, not deleted).
 */
const RecordAdministrationWorkspace: React.FC<
  PatientWorkspace2DefinitionProps<RecordAdministrationWorkspaceProps, object>
> = ({ workspaceProps, groupProps, closeWorkspace }) => {
  const { t } = useTranslation();
  const config = useConfig<EmarConfig>();
  const session = useSession();
  const isTablet = useLayoutType() === 'tablet';
  const { configuration } = useEmarConfiguration();
  const permissions = useEmarPermissions();
  const mode = workspaceProps?.mode ?? 'order';
  const order = workspaceProps?.order;
  const record = workspaceProps?.record;
  const patientUuid = groupProps?.patientUuid;

  const [values, setValues] = useState<AdministrationFormValues>(() => initialValues(workspaceProps));
  const [timeText, setTimeText] = useState(() => dayjs(values.effectiveDateTime).format('HH:mm'));
  const [drug, setDrug] = useState<SearchItem | null>(null);
  const [orderingProvider, setOrderingProvider] = useState<SearchItem | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const { routes, dosingUnits } = useOrderEntryConfig();
  const sites = useCodedOptions(config.askSite ? config.sitesConceptSetUuid : undefined);
  const notGivenReasons = configuration?.reasonsNotGiven ?? [];
  const modalities = configuration?.adHocModalities ?? [];
  const lateWindow = configuration?.parameters?.lateEntryWindowMinutes ?? config.lateEntryThresholdMinutes;
  const hasProvider = Boolean(configuration?.user?.provider ?? session?.currentProvider);

  const authority = useMemo(() => {
    if (mode === 'correction') {
      return { allowed: permissions.correct, pending: false };
    }
    const base = canRecordAny(permissions) && (mode !== 'adhoc' || permissions.recordAdHoc);
    return {
      allowed: base,
      pending: base && (configuration?.user?.recordsWithCountersign ?? willBePending(permissions)),
    };
  }, [mode, permissions, configuration]);

  const set = useCallback(<K extends keyof AdministrationFormValues>(key: K, value: AdministrationFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }, []);

  const late = mode !== 'correction' && isLateEntry(values.effectiveDateTime, lateWindow);
  const errors = useMemo(
    () =>
      validateAdministration(
        values,
        { mode, lateEntryThresholdMinutes: lateWindow, requireNoteIfNotGiven: config.requireNoteIfNotGiven },
        t,
      ),
    [values, mode, lateWindow, config.requireNoteIfNotGiven, t],
  );
  const correction = useMemo(
    () => (mode === 'correction' && record ? buildCorrectionPayload(record, values) : null),
    [mode, record, values],
  );
  const noChanges = Boolean(correction && !values.enteredInError && Object.keys(correction.changes).length === 0);
  const showError = (key: keyof AdministrationFormValues) => (submitted ? errors[key] : undefined);
  const selectedReason = notGivenReasons.find((m) => m.uuid === values.notGivenReasonUuid);

  const afterSave = (saved: { uuid?: string; pending?: boolean }) => {
    showSnackbar({
      kind: 'success',
      isLowContrast: true,
      title:
        mode === 'correction'
          ? t('correctionSaved', 'Correction recorded')
          : saved.pending
            ? t('savedPendingCountersign', 'Administration recorded, pending countersignature')
            : t('administrationSaved', 'Administration recorded'),
    });
    if (values.adverseReactionSuspected && saved.uuid) {
      const dispose = showModal('emar-adverse-reaction-modal', {
        administrationUuid: saved.uuid,
        closeModal: () => dispose(),
      });
    }
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length || noChanges || !authority.allowed || !patientUuid) {
      return;
    }
    setIsSubmitting(true);
    try {
      let saved: { uuid?: string; pending?: boolean };
      if (mode === 'correction' && record) {
        const response = await correctAdministration(record.uuid, correction);
        saved = { uuid: response.data?.uuid };
      } else {
        const resource = buildMedicationAdministration(
          values,
          { patientUuid, locationUuid: session?.sessionLocation?.uuid, lateEntryThresholdMinutes: lateWindow },
          mode === 'adhoc' ? undefined : order,
        );
        const response = await saveAdministration(resource);
        const countersign = response.data?.extension?.find(
          (e) => e.url === emarExtensions.countersignStatus,
        )?.valueCode;
        saved = { uuid: response.data?.id, pending: countersign === 'pending' || authority.pending };
      }
      await globalMutate(administrationsUrl(patientUuid));
      closeWorkspace({ discardUnsavedChanges: true });
      afterSave(saved);
    } catch (error) {
      const { status, code, message } = backendErrorMessage(error);
      showSnackbar({
        kind: 'error',
        title:
          status === 403
            ? t('forbidden', 'You do not have the required privilege')
            : code === 'EMAR_NO_ACTIVE_VISIT'
              ? t('noActiveVisit', 'The patient has no active visit')
              : t('saveError', 'Could not save the administration'),
        subtitle: message,
        ...(code === 'EMAR_NO_ACTIVE_VISIT'
          ? {
              actionButtonLabel: t('startVisit', 'Start visit'),
              onActionButtonClick: () => launchStartVisitPrompt(),
            }
          : {}),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const title =
    mode === 'correction'
      ? values.enteredInError
        ? t('enteredInErrorTitle', 'Void record')
        : t('correctionTitle', 'Correct administration')
      : mode === 'adhoc'
        ? t('adHocTitle', 'Administration without an order')
        : t('recordTitle', 'Record administration');

  const medicationName = order?.drug?.display ?? record?.medication.display ?? order?.concept?.display;
  const voiding = mode === 'correction' && values.enteredInError;

  return (
    <Workspace2 title={title} hasUnsavedChanges={isDirty}>
      <Form className={styles.form} onSubmit={onSubmit}>
        <Stack gap={5} className={styles.container}>
          <UnsignedNotice />

          {!permissions.isLoading && !authority.allowed && (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title={t('cannotRecord', 'You cannot save this record')}
              subtitle={t('missingPrivilege', 'Your user does not have the required privilege.')}
            />
          )}
          {authority.allowed && authority.pending && (
            <InlineNotification
              kind="info"
              lowContrast
              hideCloseButton
              title={t('willBePending', 'Will be pending countersignature')}
              subtitle={t('willBePendingDetail', 'A nurse or physician must countersign this record.')}
            />
          )}
          {configuration && !hasProvider && (
            <InlineNotification
              kind="warning"
              lowContrast
              hideCloseButton
              title={t('noProvider', 'Your user is not linked to a provider')}
            />
          )}

          {mode !== 'adhoc' && medicationName && (
            <div className={styles.orderSummary}>
              <p className={styles.orderTitle}>{medicationName}</p>
              {order && <p className={styles.orderDetail}>{orderDosageSummary(order)}</p>}
              {order?.orderer && (
                <p className={styles.orderDetail}>
                  {t('orderedByName', 'Ordered by {{name}}', {
                    name: order.orderer.person?.display ?? order.orderer.display,
                  })}
                </p>
              )}
            </div>
          )}

          {mode === 'adhoc' && (
            <>
              <InlineNotification
                kind="warning"
                lowContrast
                hideCloseButton
                title={t('adHocWarning', 'Administration without a prior order')}
                subtitle={t(
                  'adHocWarningDetail',
                  'The ordering clinician must regularize the order. Stopped or expired orders can only be recorded here.',
                )}
              />
              <ResponsiveWrapper>
                <AsyncSearch
                  id="emar-drug"
                  titleText={t('medication', 'Medication')}
                  placeholder={t('searchDrug', 'Search medication')}
                  search={searchDrugs}
                  selected={drug}
                  onSelect={(item) => {
                    setDrug(item);
                    set('drugUuid', item?.uuid);
                  }}
                  invalid={Boolean(showError('drugUuid'))}
                  invalidText={showError('drugUuid')}
                />
              </ResponsiveWrapper>
              <ResponsiveWrapper>
                <AsyncSearch
                  id="emar-ordering-provider"
                  titleText={t('orderingProvider', 'Ordering clinician')}
                  placeholder={t('searchProvider', 'Search clinician')}
                  search={searchProviders}
                  selected={orderingProvider}
                  onSelect={(item) => {
                    setOrderingProvider(item);
                    set('orderingProviderUuid', item?.uuid);
                  }}
                  invalid={Boolean(showError('orderingProviderUuid'))}
                  invalidText={showError('orderingProviderUuid')}
                />
              </ResponsiveWrapper>
              <RadioButtonGroup
                legendText={t('adHocModality', 'Modality')}
                name="emar-modality"
                valueSelected={values.adHocModality ?? ''}
                onChange={(value) => set('adHocModality', value as AdministrationFormValues['adHocModality'])}
                invalid={Boolean(showError('adHocModality'))}
                invalidText={showError('adHocModality')}
              >
                {(modalities.length
                  ? modalities
                  : [
                      { code: 'verbal', display: t('modalityVerbal', 'Verbal order') },
                      { code: 'emergency', display: t('modalityEmergency', 'Emergency') },
                    ]
                ).map((m) => (
                  <RadioButton key={m.code} id={`emar-modality-${m.code}`} labelText={m.display} value={m.code} />
                ))}
              </RadioButtonGroup>
              <ResponsiveWrapper>
                <TextInput
                  id="emar-adhoc-reason"
                  labelText={t('adHocReason', 'Reason')}
                  value={values.adHocReason ?? ''}
                  onChange={(e) => set('adHocReason', e.target.value)}
                  invalid={Boolean(showError('adHocReason'))}
                  invalidText={showError('adHocReason')}
                />
              </ResponsiveWrapper>
            </>
          )}

          {mode === 'correction' && (
            <Checkbox
              id="emar-entered-in-error"
              labelText={t('enteredInErrorCheck', 'The record was entered in error (void without replacement)')}
              checked={Boolean(values.enteredInError)}
              onChange={(_, { checked }) => set('enteredInError', checked)}
            />
          )}

          {!voiding && (
            <RadioButtonGroup
              legendText={t('outcome', 'Outcome')}
              name="emar-outcome"
              valueSelected={values.given ? 'given' : 'notGiven'}
              onChange={(value) => set('given', value === 'given')}
            >
              <RadioButton id="emar-given" labelText={t('statusGiven', 'Given')} value="given" />
              <RadioButton id="emar-not-given" labelText={t('statusNotGiven', 'Not given')} value="notGiven" />
            </RadioButtonGroup>
          )}

          {!voiding && (
            <div className={styles.dateTime}>
              <OpenmrsDatePicker
                id="emar-date"
                labelText={t('administrationDate', 'Date')}
                value={values.effectiveDateTime}
                maxDate={new Date()}
                onChange={(date: Date) => date && set('effectiveDateTime', withTime(date, timeText))}
                invalid={Boolean(showError('effectiveDateTime'))}
                invalidText={showError('effectiveDateTime')}
              />
              <TimePicker
                id="emar-time"
                labelText={t('administrationTime', 'Time (24 h)')}
                pattern={timePattern.source}
                value={timeText}
                onChange={(e) => {
                  setTimeText(e.target.value);
                  if (timePattern.test(e.target.value)) {
                    set('effectiveDateTime', withTime(values.effectiveDateTime, e.target.value));
                  }
                }}
              />
            </div>
          )}

          {late && (
            <>
              <InlineNotification
                kind="warning"
                lowContrast
                hideCloseButton
                title={t('lateEntry', 'Late entry')}
                subtitle={t('lateEntryDetail', 'The time is more than {{minutes}} min before now. Enter the reason.', {
                  minutes: lateWindow,
                })}
              />
              <ResponsiveWrapper>
                <TextInput
                  id="emar-late-reason"
                  labelText={t('lateEntryReason', 'Late entry reason')}
                  value={values.lateEntryReason ?? ''}
                  onChange={(e) => set('lateEntryReason', e.target.value)}
                  invalid={Boolean(showError('lateEntryReason'))}
                  invalidText={showError('lateEntryReason')}
                />
              </ResponsiveWrapper>
            </>
          )}

          {!voiding && values.given && (
            <>
              <div className={styles.dose}>
                <NumberInput
                  id="emar-dose"
                  label={t('dose', 'Dose')}
                  min={0}
                  step={0.25}
                  allowEmpty
                  hideSteppers
                  value={values.dose ?? ''}
                  onChange={(_, { value }) => set('dose', value === '' || value === undefined ? null : Number(value))}
                  invalid={Boolean(showError('dose'))}
                  invalidText={showError('dose')}
                />
                {mode === 'adhoc' ? (
                  <Select
                    id="emar-dose-unit"
                    labelText={t('doseUnit', 'Unit')}
                    value={values.doseUnitUuid ?? ''}
                    onChange={(e) => set('doseUnitUuid', e.target.value || undefined)}
                  >
                    <SelectItem value="" text={t('select', 'Select')} />
                    {dosingUnits.map((u) => (
                      <SelectItem key={u.uuid} value={u.uuid} text={u.display} />
                    ))}
                  </Select>
                ) : (
                  <span className={styles.unit}>{values.doseUnitDisplay ?? ''}</span>
                )}
              </div>
              <ResponsiveWrapper>
                <Select
                  id="emar-route"
                  labelText={t('route', 'Route')}
                  value={values.routeUuid ?? ''}
                  onChange={(e) => set('routeUuid', e.target.value || undefined)}
                >
                  <SelectItem value="" text={t('select', 'Select')} />
                  {routes.map((r) => (
                    <SelectItem key={r.uuid} value={r.uuid} text={r.display} />
                  ))}
                </Select>
              </ResponsiveWrapper>
              {config.askSite && sites.configured && (
                <ResponsiveWrapper>
                  <Select
                    id="emar-site"
                    labelText={t('site', 'Administration site')}
                    value={values.siteUuid ?? ''}
                    onChange={(e) => set('siteUuid', e.target.value || undefined)}
                  >
                    <SelectItem value="" text={t('select', 'Select')} />
                    {sites.options.map((o) => (
                      <SelectItem key={o.uuid} value={o.uuid} text={o.display} />
                    ))}
                  </Select>
                </ResponsiveWrapper>
              )}
              {config.askBatch && (
                <div className={styles.batch}>
                  <TextInput
                    id="emar-lot"
                    labelText={t('lotNumber', 'Lot (optional)')}
                    value={values.lotNumber ?? ''}
                    onChange={(e) => set('lotNumber', e.target.value)}
                  />
                  <OpenmrsDatePicker
                    id="emar-expiration"
                    labelText={t('expirationDate', 'Expiration date (optional)')}
                    value={values.expirationDate ?? null}
                    onChange={(date: Date) => set('expirationDate', date ?? null)}
                    invalid={Boolean(showError('expirationDate'))}
                    invalidText={showError('expirationDate')}
                  />
                </div>
              )}
            </>
          )}

          {!voiding && !values.given && (
            <>
              <ResponsiveWrapper>
                <Select
                  id="emar-not-given-reason"
                  labelText={t('notGivenReason', 'Reason not given')}
                  value={values.notGivenReasonUuid ?? ''}
                  onChange={(e) => set('notGivenReasonUuid', e.target.value || undefined)}
                  invalid={Boolean(showError('notGivenReasonUuid'))}
                  invalidText={showError('notGivenReasonUuid')}
                >
                  <SelectItem value="" text={t('select', 'Select')} />
                  {notGivenReasons.map((r) => (
                    <SelectItem key={r.uuid} value={r.uuid} text={r.display} />
                  ))}
                </Select>
              </ResponsiveWrapper>
              <ResponsiveWrapper>
                <TextInput
                  id="emar-not-given-detail"
                  labelText={t('notGivenDetail', 'Reason details')}
                  value={values.notGivenReasonText ?? ''}
                  onChange={(e) => set('notGivenReasonText', e.target.value)}
                  invalid={Boolean(showError('notGivenReasonText'))}
                  invalidText={showError('notGivenReasonText')}
                />
              </ResponsiveWrapper>
              {selectedReason?.notifyPrescriber && (
                <InlineNotification
                  kind="warning"
                  lowContrast
                  hideCloseButton
                  title={selectedReason.display}
                  subtitle={t(
                    'refusalDetail',
                    "Notify the treating clinician: the patient's refusal must be documented.",
                  )}
                />
              )}
            </>
          )}

          {mode === 'correction' && (
            <>
              <ResponsiveWrapper>
                <TextInput
                  id="emar-correction-reason"
                  labelText={t('correctionReason', 'Correction reason')}
                  value={values.correctionReason ?? ''}
                  onChange={(e) => set('correctionReason', e.target.value)}
                  invalid={Boolean(showError('correctionReason'))}
                  invalidText={showError('correctionReason')}
                />
              </ResponsiveWrapper>
              <div>
                <p className={styles.orderDetail}>{t('correctedFields', 'Corrected data')}</p>
                <div className={styles.tags}>
                  {correction?.correctedFields.length ? (
                    correction.correctedFields.map((code) => (
                      <Tag key={code} type="blue">
                        {configuration?.correctableFields?.find((f) => f.code === code)?.display ?? code}
                      </Tag>
                    ))
                  ) : (
                    <span className={submitted ? styles.errorText : styles.orderDetail}>
                      {t('noChanges', 'No data has been changed yet')}
                    </span>
                  )}
                </div>
              </div>
            </>
          )}

          {!voiding && (
            <>
              <ResponsiveWrapper>
                <TextArea
                  id="emar-note"
                  labelText={t('note', 'Note')}
                  enableCounter
                  maxCount={1000}
                  value={values.note ?? ''}
                  onChange={(e) => set('note', e.target.value)}
                />
              </ResponsiveWrapper>
              {mode !== 'correction' && (
                <Checkbox
                  id="emar-adr"
                  labelText={t('suspectedAdrCheck', 'Suspected adverse reaction')}
                  helperText={t(
                    'suspectedAdrHelp',
                    'On save, the suspected-reaction form opens (whoever administers must report it).',
                  )}
                  checked={Boolean(values.adverseReactionSuspected)}
                  onChange={(_, { checked }) => set('adverseReactionSuspected', checked)}
                />
              )}
            </>
          )}
        </Stack>

        <ButtonSet className={isTablet ? styles.tablet : styles.desktop}>
          <Button className={styles.button} kind="secondary" onClick={() => closeWorkspace()}>
            {getCoreTranslation('cancel')}
          </Button>
          <Button className={styles.button} kind="primary" type="submit" disabled={isSubmitting || !authority.allowed}>
            {isSubmitting ? (
              <InlineLoading description={t('saving', 'Saving') + '…'} />
            ) : (
              <span>{getCoreTranslation('save')}</span>
            )}
          </Button>
        </ButtonSet>
      </Form>
    </Workspace2>
  );
};

export default RecordAdministrationWorkspace;
