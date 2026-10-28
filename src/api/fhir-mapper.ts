/**
 * Translation between the eMAR form and the FHIR R4 `MedicationAdministration` resource of the `emar` module.
 * Contract: `openmrs-module-emar/docs/API.md` §4.
 *
 * Concepts travel as `coding.code` = concept uuid, without `system` (fhir2 convention for concepts without a
 * reference mapping). `performer` is NOT sent: the performer is always the user's provider (422
 * EMAR_PERFORMER_MISMATCH).
 */
import dayjs from 'dayjs';
import { emarExtensions } from '../constants';
import type {
  AdministrationFormValues,
  AdministrationRecord,
  AdHocModality,
  AdministrationType,
  CodedValue,
  CorrectedField,
  CountersignStatus,
  DisplayStatus,
  DrugOrder,
  FhirAdministrationStatus,
  RegularizationStatus,
} from '../types';

type Coding = { system?: string; code?: string; display?: string };
type CodeableConcept = { coding?: Array<Coding>; text?: string };
type Reference = { reference?: string; display?: string };
export interface Extension {
  url: string;
  valueCode?: string;
  valueString?: string;
  valueBoolean?: boolean;
  valueDate?: string;
  valueDateTime?: string;
  valueReference?: Reference;
  valueCodeableConcept?: CodeableConcept;
}

export interface FhirMedicationAdministration {
  resourceType: 'MedicationAdministration';
  id?: string;
  meta?: { lastUpdated?: string; security?: Array<Coding> };
  extension?: Array<Extension>;
  status: FhirAdministrationStatus;
  statusReason?: Array<CodeableConcept>;
  reasonCode?: Array<CodeableConcept>;
  medicationReference?: Reference;
  medicationCodeableConcept?: CodeableConcept;
  subject: Reference;
  context?: Reference;
  effectiveDateTime?: string;
  performer?: Array<{ actor: Reference; function?: CodeableConcept }>;
  request?: Reference;
  note?: Array<{ text: string }>;
  dosage?: {
    text?: string;
    site?: CodeableConcept;
    route?: CodeableConcept;
    dose?: { value?: number; unit?: string; code?: string; system?: string };
  };
}

export interface BuildContext {
  patientUuid: string;
  locationUuid?: string;
  /** Late-entry window in minutes (GET /emar/configuration → parameters.lateEntryWindowMinutes). */
  lateEntryThresholdMinutes: number;
  now?: Date;
}

/** Is the administration time earlier than «now» by more than the window? */
export function isLateEntry(effective: Date, thresholdMinutes: number, now: Date = new Date()): boolean {
  return dayjs(now).diff(dayjs(effective), 'minute', true) > thresholdMinutes;
}

/** ISO 8601 date-time with offset (e.g. 2026-10-23T08:00:00-05:00), as the contract requires. */
export function toFhirDateTime(date: Date): string {
  return dayjs(date).format('YYYY-MM-DDTHH:mm:ssZ');
}

export function administrationTypeFor(order?: DrugOrder): AdministrationType {
  if (!order) {
    return 'ad-hoc';
  }
  return order.asNeeded ? 'prn' : 'scheduled';
}

const coding = (uuid: string): CodeableConcept => ({ coding: [{ code: uuid }] });

/** Resource to send in POST /ws/fhir2/R4/MedicationAdministration (§4.1). No `order` = ad hoc. */
export function buildMedicationAdministration(
  values: AdministrationFormValues,
  ctx: BuildContext,
  order?: DrugOrder,
): FhirMedicationAdministration {
  const extension: Array<Extension> = [
    { url: emarExtensions.administrationType, valueCode: administrationTypeFor(order) },
  ];

  if (!order) {
    if (values.adHocModality) {
      extension.push({ url: emarExtensions.adHocModality, valueCode: values.adHocModality });
    }
    if (values.orderingProviderUuid) {
      extension.push({
        url: emarExtensions.orderer,
        valueReference: { reference: `Practitioner/${values.orderingProviderUuid}` },
      });
    }
  }
  if (values.lotNumber?.trim()) {
    extension.push({ url: emarExtensions.lotNumber, valueString: values.lotNumber.trim() });
  }
  if (values.expirationDate) {
    extension.push({
      url: emarExtensions.expirationDate,
      valueDate: dayjs(values.expirationDate).format('YYYY-MM-DD'),
    });
  }
  if (ctx.locationUuid) {
    extension.push({ url: emarExtensions.location, valueReference: { reference: `Location/${ctx.locationUuid}` } });
  }
  if (isLateEntry(values.effectiveDateTime, ctx.lateEntryThresholdMinutes, ctx.now) && values.lateEntryReason?.trim()) {
    extension.push({ url: emarExtensions.lateEntryReason, valueString: values.lateEntryReason.trim() });
  }

  const resource: FhirMedicationAdministration = {
    resourceType: 'MedicationAdministration',
    status: values.given ? 'completed' : 'not-done',
    subject: { reference: `Patient/${ctx.patientUuid}` },
    effectiveDateTime: toFhirDateTime(values.effectiveDateTime),
    extension,
  };

  if (order) {
    resource.request = { reference: `MedicationRequest/${order.uuid}` };
  } else {
    if (values.drugUuid) {
      resource.medicationReference = { reference: `Medication/${values.drugUuid}` };
    }
    if (values.adHocReason?.trim()) {
      resource.reasonCode = [{ text: values.adHocReason.trim() }];
    }
  }

  if (!values.given && values.notGivenReasonUuid) {
    resource.statusReason = [
      {
        ...coding(values.notGivenReasonUuid),
        ...(values.notGivenReasonText?.trim() ? { text: values.notGivenReasonText.trim() } : {}),
      },
    ];
  }

  const dosage: FhirMedicationAdministration['dosage'] = {};
  if (values.given && values.dose != null && !Number.isNaN(values.dose)) {
    dosage.dose = { value: values.dose, ...(values.doseUnitUuid ? { code: values.doseUnitUuid } : {}) };
  }
  // Route and site only if it was given (they used to be sent for «not given» too).
  if (values.given && values.routeUuid) {
    dosage.route = coding(values.routeUuid);
  }
  if (values.given && values.siteUuid) {
    dosage.site = coding(values.siteUuid);
  }
  if (Object.keys(dosage).length) {
    resource.dosage = dosage;
  }
  if (values.note?.trim()) {
    resource.note = [{ text: values.note.trim() }];
  }
  return resource;
}

// ----------------------------------------------------------------------------------------------------------
// Correction (POST /emar/administration/{uuid}/correction, §5.4)
// ----------------------------------------------------------------------------------------------------------

export interface CorrectionPayload {
  reason: string;
  correctedFields: Array<CorrectedField>;
  changes: Record<string, unknown>;
}

const sameMinute = (a?: string | Date, b?: string | Date) =>
  Boolean(a) && Boolean(b) && dayjs(a).isSame(dayjs(b), 'minute');

/**
 * Compares the original record with the form and builds `changes` + `correctedFields` (the «corrected field» is
 * derived from what actually changed, not declared by hand).
 */
export function buildCorrectionPayload(
  original: AdministrationRecord,
  values: AdministrationFormValues,
): CorrectionPayload {
  const reason = values.correctionReason?.trim() ?? '';
  if (values.enteredInError) {
    return { reason, correctedFields: ['status'], changes: { status: 'entered-in-error' } };
  }
  const changes: Record<string, unknown> = {};
  const fields = new Set<CorrectedField>();
  const status = values.given ? 'completed' : 'not-done';

  if (status !== original.status) {
    changes.status = status;
    fields.add('status');
  }
  if (!sameMinute(values.effectiveDateTime, original.effectiveDateTime)) {
    changes.effectiveDateTime = toFhirDateTime(values.effectiveDateTime);
    fields.add('date-time');
  }
  if (values.given && values.dose != null && values.dose !== original.dose?.value) {
    changes.dose = values.dose;
    fields.add('dose');
  }
  if (values.given && values.doseUnitUuid && values.doseUnitUuid !== original.dose?.unitUuid) {
    changes.doseUnit = values.doseUnitUuid;
    fields.add('dose');
  }
  if ((values.routeUuid ?? '') !== (original.route?.uuid ?? '') && values.routeUuid) {
    changes.route = values.routeUuid;
    fields.add('route');
  }
  if ((values.siteUuid ?? '') !== (original.site?.uuid ?? '') && values.siteUuid) {
    changes.site = values.siteUuid;
    fields.add('site');
  }
  if (!values.given) {
    if (values.notGivenReasonUuid && values.notGivenReasonUuid !== original.statusReason?.coded?.uuid) {
      changes.reasonNotGiven = values.notGivenReasonUuid;
      fields.add('status');
    }
    if ((values.notGivenReasonText?.trim() ?? '') !== (original.statusReason?.text ?? '')) {
      changes.reasonDetail = values.notGivenReasonText?.trim() ?? '';
      fields.add('other');
    }
  }
  if ((values.lotNumber?.trim() ?? '') !== (original.lotNumber ?? '')) {
    changes.lotNumber = values.lotNumber?.trim() ?? '';
    fields.add('other');
  }
  const expiration = values.expirationDate ? dayjs(values.expirationDate).format('YYYY-MM-DD') : '';
  // Only a new expiration date is sent: the backend treats «null» as «no change» (EmarRestController.correct).
  if (expiration && expiration !== (original.expirationDate ?? '')) {
    changes.expirationDate = expiration;
    fields.add('other');
  }
  if ((values.note?.trim() ?? '') !== (original.note ?? '')) {
    changes.note = values.note?.trim() ?? '';
    fields.add('other');
  }
  return { reason, correctedFields: Array.from(fields), changes };
}

// ----------------------------------------------------------------------------------------------------------
// Reading (§4.2)
// ----------------------------------------------------------------------------------------------------------

const idFromReference = (ref?: Reference) => ref?.reference?.split('/').pop();
const extOf = (list: Array<Extension> | undefined, url: string) => list?.find((e) => e.url === url);
const coded = (cc?: CodeableConcept): CodedValue | undefined =>
  cc?.coding?.[0]?.code ? { uuid: cc.coding[0].code, display: cc.coding[0].display ?? cc.text } : undefined;

export function displayStatusOf(
  record: Pick<AdministrationRecord, 'status' | 'countersign' | 'previousVersion'>,
): DisplayStatus {
  if (record.status === 'entered-in-error') {
    return 'enteredInError';
  }
  if (record.countersign?.status === 'pending') {
    return 'pendingCountersign';
  }
  if (record.previousVersion) {
    return 'corrected';
  }
  if (record.status === 'completed') {
    return 'given';
  }
  if (record.status === 'not-done') {
    return 'notGiven';
  }
  return 'other';
}

export function toAdministrationRecord(resource: FhirMedicationAdministration): AdministrationRecord {
  const e = resource.extension;
  const reason = resource.statusReason?.[0];
  const restricted = Boolean(resource.meta?.security?.some((s) => s.code === 'R'));
  const masked = !resource.medicationReference && Boolean(resource.medicationCodeableConcept?.text);
  const performer = resource.performer?.[0];
  const orderer = extOf(e, emarExtensions.orderer)?.valueReference;
  const regularization = extOf(e, emarExtensions.regularizationStatus)?.valueCode as RegularizationStatus | undefined;

  const record: AdministrationRecord = {
    uuid: resource.id,
    encounterUuid: idFromReference(resource.context),
    status: resource.status,
    displayStatus: 'other',
    effectiveDateTime: resource.effectiveDateTime,
    recordedDateTime: resource.meta?.lastUpdated,
    medication: masked
      ? { display: resource.medicationCodeableConcept.text }
      : { uuid: idFromReference(resource.medicationReference), display: resource.medicationReference?.display ?? '' },
    restricted: restricted || masked,
    masked,
    orderUuid: idFromReference(resource.request),
    performer: performer
      ? { uuid: idFromReference(performer.actor), display: performer.actor?.display ?? '' }
      : undefined,
    dose: resource.dosage?.dose
      ? {
          value: resource.dosage.dose.value,
          unit: resource.dosage.dose.unit,
          // With the UCUM system, `code` is the UCUM code (e.g. «mL»), not the concept uuid (docs/API.md §4.2).
          unitUuid: resource.dosage.dose.system === 'http://unitsofmeasure.org' ? undefined : resource.dosage.dose.code,
        }
      : undefined,
    route:
      coded(resource.dosage?.route) ??
      (resource.dosage?.route?.text ? { uuid: '', display: resource.dosage.route.text } : undefined),
    site:
      coded(resource.dosage?.site) ??
      (resource.dosage?.site?.text ? { uuid: '', display: resource.dosage.site.text } : undefined),
    note: resource.note?.map((n) => n.text).join(' · ') || undefined,
    statusReason: reason ? { coded: coded(reason), text: reason.text } : undefined,
    type: extOf(e, emarExtensions.administrationType)?.valueCode as AdministrationType | undefined,
    adHocModality: extOf(e, emarExtensions.adHocModality)?.valueCode as AdHocModality | undefined,
    orderer: orderer ? { uuid: idFromReference(orderer), display: orderer.display } : undefined,
    adHocReason:
      resource.reasonCode
        ?.map((r) => r.text)
        .filter(Boolean)
        .join(' · ') || undefined,
    lotNumber: extOf(e, emarExtensions.lotNumber)?.valueString,
    expirationDate: extOf(e, emarExtensions.expirationDate)?.valueDate,
    lateEntryReason: extOf(e, emarExtensions.lateEntryReason)?.valueString,
    countersign: extOf(e, emarExtensions.countersignStatus)
      ? {
          status: extOf(e, emarExtensions.countersignStatus).valueCode as CountersignStatus,
          by: extOf(e, emarExtensions.countersigner)?.valueReference?.display,
          date: extOf(e, emarExtensions.countersignDate)?.valueDateTime,
        }
      : undefined,
    regularization: regularization
      ? { status: regularization, order: idFromReference(extOf(e, emarExtensions.regularizingOrder)?.valueReference) }
      : undefined,
    previousVersion: idFromReference(extOf(e, emarExtensions.previousVersion)?.valueReference),
    correctionReason:
      extOf(e, emarExtensions.correctionReason)?.valueString ??
      extOf(e, emarExtensions.correctionReason)?.valueCodeableConcept?.text,
    correctedFields: e
      ?.filter((x) => x.url === emarExtensions.correctedField)
      .map((x) => x.valueCode)
      .filter(Boolean),
  };
  record.displayStatus = displayStatusOf(record);
  return record;
}
