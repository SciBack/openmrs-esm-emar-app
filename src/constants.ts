export const moduleName = 'openmrs-esm-emar-app';

/** Workspace (workspaces2) registered in routes.json. */
export const recordAdministrationWorkspace = 'emar-record-administration-workspace';

/** Dashboard path inside the patient chart: /patient/:uuid/chart/medication-administration */
export const dashboardPath = 'medication-administration';

/** Own slot that groups the dashboard widgets (registered by the patient chart when it reads meta.slot). */
export const dashboardSlot = 'emar-dashboard-slot';

/** REST base of the `emar` backend module (docs/API.md §5). */
export const emarRestBase = '/ws/rest/v1/emar';

/** FHIR extensions of the `emar` backend module (docs/API.md §4; EmarConstants.EXT). */
const ext = 'http://fhir.openmrs.org/ext/emar/';
export const emarExtensions = {
  administrationType: `${ext}administration-type`,
  adHocModality: `${ext}ad-hoc-modality`,
  orderer: `${ext}orderer`,
  lotNumber: `${ext}lot-number`,
  expirationDate: `${ext}expiration-date`,
  location: `${ext}location`,
  lateEntryReason: `${ext}late-entry-reason`,
  countersignStatus: `${ext}countersign-status`,
  countersigner: `${ext}countersigner`,
  countersignDate: `${ext}countersign-date`,
  regularizationStatus: `${ext}regularization-status`,
  regularizingOrder: `${ext}regularizing-order`,
  previousVersion: `${ext}previous-version`,
  correctionReason: `${ext}correction-reason`,
  correctedField: `${ext}corrected-field`,
} as const;

/** System of the 422 error codes (issue[0].details.coding[0]). */
export const emarErrorSystem = 'http://fhir.openmrs.org/code-system/emar-error';
