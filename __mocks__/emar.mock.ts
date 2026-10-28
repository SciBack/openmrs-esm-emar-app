/** Fictitious test data (no real patient data). */
import type { AdministrationRecord, DrugOrder, EmarConfiguration } from '../src/types';

export const NOW = new Date('2026-10-23T10:00:00-05:00');
export const PATIENT = 'patient-htest-99999901';

export const mockOrder: DrugOrder = {
  uuid: 'order-1',
  orderNumber: 'ORD-1',
  action: 'NEW',
  dateActivated: '2026-10-23T08:00:00-05:00',
  drug: {
    uuid: 'drug-cef',
    display: 'Ceftriaxone 1 g powder for injection',
    concept: { uuid: 'concept-cef', display: 'Ceftriaxone' },
  },
  dose: 1,
  doseUnits: { uuid: 'unit-g', display: 'g' },
  route: { uuid: 'route-im', display: 'Intramuscular' },
  frequency: { uuid: 'freq-1', display: 'Once daily' },
  asNeeded: false,
  orderer: { uuid: 'prov-phys', display: 'Dr. Fictitious', person: { display: 'Carlos Fictitious Test' } },
};

export const mockRecord: AdministrationRecord = {
  uuid: 'ma-1',
  status: 'completed',
  displayStatus: 'given',
  effectiveDateTime: '2026-10-23T09:00:00-05:00',
  recordedDateTime: '2026-10-23T09:02:00-05:00',
  medication: { uuid: 'drug-cef', display: 'Ceftriaxone 1 g powder for injection' },
  restricted: false,
  masked: false,
  orderUuid: 'order-1',
  performer: { uuid: 'prov-nurse', display: 'Fictitious Nurse' },
  dose: { value: 2, unit: 'g', unitUuid: 'unit-g' },
  route: { uuid: 'route-im', display: 'Intramuscular' },
};

export const allPrivileges = {
  view: true,
  record: true,
  recordWithCountersign: false,
  recordAdHoc: true,
  correct: true,
  countersign: true,
  regularize: true,
  managePharmacovigilance: false,
  viewRestricted: false,
};

export const mockConfiguration: EmarConfiguration = {
  encounterType: '5c1bac4d-4152-4000-8000-000000000201',
  encounterRoles: { performer: 'r211', orderer: 'r212', countersigner: 'r213' },
  parameters: {
    lateEntryWindowMinutes: 30,
    regularizationDeadlineHours: 24,
    requireActiveVisit: true,
    adrSevereReportingDeadlineHours: 24,
    adrNonSevereReportingDeadlineHours: 72,
  },
  reasonsNotGiven: [
    { uuid: 'reason-112', display: 'Patient refused', notifyPrescriber: true },
    { uuid: 'reason-113', display: 'Medication unavailable' },
  ],
  administrationTypes: [],
  adHocModalities: [
    { code: 'verbal', uuid: 'm124', display: 'Verbal order' },
    { code: 'emergency', uuid: 'm125', display: 'Emergency' },
  ],
  correctableFields: [{ code: 'dose', uuid: 'd140', display: 'Corrected field: dose' }],
  adrSeverities: [],
  user: { provider: { uuid: 'prov-nurse', display: 'Fictitious Nurse' }, privileges: allPrivileges },
};
