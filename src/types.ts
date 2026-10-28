/** Minimal reference to an OpenMRS REST resource. */
export interface OpenmrsRef {
  uuid: string;
  display: string;
}

/** Drug order as returned by /ws/rest/v1/order with the representation in drug-orders.resource.ts. */
export interface DrugOrder {
  uuid: string;
  orderNumber: string;
  action: 'NEW' | 'REVISE' | 'DISCONTINUE' | 'RENEW';
  dateActivated: string;
  scheduledDate?: string | null;
  dateStopped?: string | null;
  autoExpireDate?: string | null;
  drug: {
    uuid: string;
    display: string;
    strength?: string | null;
    concept: OpenmrsRef;
    dosageForm?: OpenmrsRef | null;
  } | null;
  concept?: OpenmrsRef | null;
  dose?: number | null;
  doseUnits?: OpenmrsRef | null;
  route?: OpenmrsRef | null;
  frequency?: OpenmrsRef | null;
  asNeeded?: boolean;
  dosingInstructions?: string | null;
  orderer?: { uuid: string; display: string; person?: { display: string } } | null;
  encounter?: { uuid: string } | null;
}

// ---------------------------------------------------------------- GET /emar/configuration (docs/API.md §5.1)
export interface EmarPrivileges {
  view: boolean;
  record: boolean;
  recordWithCountersign: boolean;
  recordAdHoc: boolean;
  correct: boolean;
  countersign: boolean;
  regularize: boolean;
  managePharmacovigilance: boolean;
  viewRestricted: boolean;
}

export interface CodedOption<C extends string> {
  code: C;
  uuid: string;
  display: string;
}

export interface EmarConfiguration {
  encounterType: string;
  encounterRoles: { performer: string; orderer: string; countersigner: string };
  parameters: {
    lateEntryWindowMinutes: number;
    regularizationDeadlineHours: number;
    requireActiveVisit: boolean;
    adrSevereReportingDeadlineHours: number;
    adrNonSevereReportingDeadlineHours: number;
  };
  reasonsNotGiven: Array<{ uuid: string; display: string; notifyPrescriber?: boolean }>;
  administrationTypes: Array<CodedOption<AdministrationType>>;
  adHocModalities: Array<CodedOption<AdHocModality>>;
  correctableFields: Array<CodedOption<CorrectedField>>;
  adrSeverities: Array<CodedOption<AdrSeverity> & { reportingDeadlineHours: number }>;
  user: {
    provider: { uuid: string; display: string } | null;
    /** true if the user's records will be pending countersignature. */
    recordsWithCountersign?: boolean;
    privileges: EmarPrivileges;
  };
}

export type AdministrationType = 'scheduled' | 'single-dose' | 'prn' | 'ad-hoc';
export type AdHocModality = 'verbal' | 'emergency';
export type CorrectedField = 'dose' | 'date-time' | 'route' | 'site' | 'medication' | 'status' | 'other';
export type AdrSeverity = 'mild' | 'moderate' | 'severe';
export type CountersignStatus = 'not-required' | 'pending' | 'countersigned';
export type RegularizationStatus = 'pending' | 'regularized';

export type FhirAdministrationStatus =
  'completed' | 'not-done' | 'entered-in-error' | 'in-progress' | 'stopped' | 'on-hold' | 'unknown';

/** Status as the nurse sees it in the history. */
export type DisplayStatus = 'given' | 'notGiven' | 'enteredInError' | 'corrected' | 'pendingCountersign' | 'other';

export interface CodedValue {
  uuid: string;
  display?: string;
}

/** Screen model of an administration record (translated from FHIR MedicationAdministration). */
export interface AdministrationRecord {
  uuid: string;
  encounterUuid?: string;
  status: FhirAdministrationStatus;
  displayStatus: DisplayStatus;
  effectiveDateTime: string;
  recordedDateTime?: string;
  medication: { uuid?: string; display: string };
  /** The backend flagged it as restricted (meta.security R) or masked it. */
  restricted: boolean;
  masked: boolean;
  orderUuid?: string;
  performer?: { uuid?: string; display: string };
  dose?: { value?: number; unit?: string; unitUuid?: string };
  route?: CodedValue;
  site?: CodedValue;
  note?: string;
  statusReason?: { coded?: CodedValue; text?: string };
  type?: AdministrationType;
  adHocModality?: AdHocModality;
  orderer?: { uuid?: string; display?: string };
  adHocReason?: string;
  lotNumber?: string;
  expirationDate?: string;
  lateEntryReason?: string;
  countersign?: { status: CountersignStatus; by?: string; date?: string };
  regularization?: { status: RegularizationStatus; order?: string };
  previousVersion?: string;
  correctionReason?: string;
  correctedFields?: Array<string>;
}

/** Form data of the record workspace. */
export interface AdministrationFormValues {
  given: boolean;
  effectiveDateTime: Date;
  dose?: number | null;
  doseUnitUuid?: string;
  doseUnitDisplay?: string;
  routeUuid?: string;
  siteUuid?: string;
  notGivenReasonUuid?: string;
  notGivenReasonText?: string;
  lateEntryReason?: string;
  note?: string;
  lotNumber?: string;
  expirationDate?: Date | null;
  adverseReactionSuspected?: boolean;
  // Ad hoc / verbal or emergency order
  drugUuid?: string;
  orderingProviderUuid?: string;
  adHocModality?: AdHocModality;
  adHocReason?: string;
  // Correction
  correctionReason?: string;
  enteredInError?: boolean;
}

export type WorkspaceMode = 'order' | 'adhoc' | 'correction';

export interface RecordAdministrationWorkspaceProps {
  mode: WorkspaceMode;
  order?: DrugOrder;
  /** Record to correct («correction» mode). */
  record?: AdministrationRecord;
}

// ---------------------------------------------------------------- REST record (docs/API.md §5.2), for the history
export interface AdministrationRecordRest {
  uuid: string;
  current: boolean;
  voidReason?: string | null;
  medication: { uuid: string | null; display: string };
  status: 'completed' | 'not-done' | 'entered-in-error';
  reasonNotGiven?: { uuid: string; display: string } | null;
  reasonDetail?: string | null;
  effectiveDateTime: string;
  recordedDateTime: string;
  recordedBy?: { uuid: string; display: string } | null;
  performer?: { uuid: string; display: string } | null;
  dose?: number | null;
  doseUnit?: { uuid: string; display: string } | null;
  route?: { uuid: string; display: string } | null;
  site?: { uuid: string; display: string } | null;
  note?: string | null;
  lateEntryReason?: string | null;
  countersign?: {
    status: CountersignStatus;
    by?: { uuid: string; display: string } | null;
    date?: string | null;
  } | null;
  previousVersion?: string | null;
  correctionReason?: string | null;
  correctedFields?: Array<string> | null;
}
