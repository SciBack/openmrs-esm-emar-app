import { Type, validator } from '@openmrs/esm-framework';

/**
 * Frontend configuration of the eMAR.
 *
 * Clinical settings (coded reasons, types, modalities, correctable fields, ADR severities, late-entry window and the
 * user's privileges) come from the backend in GET /ws/rest/v1/emar/configuration (openmrs-module-emar,
 * docs/API.md §5.1): only screen settings live here.
 */
export const configSchema = {
  drugOrderTypeUuid: {
    _type: Type.UUID,
    _default: '131168f4-15f5-102d-96e4-000c29c2a5d7',
    _description: 'Order type «Drug Order» (the one used by esm-patient-medications-app).',
  },
  careSettingUuid: {
    _type: Type.UUID,
    _default: '6f0c9a92-6f24-11e3-af88-005056821db0',
    _description: 'Care setting of the listed orders (default: the Reference Application outpatient setting).',
  },
  lateEntryThresholdMinutes: {
    _type: Type.Number,
    _default: 30,
    _description:
      'Fallback late-entry window (minutes) if the backend does not report one; parameters.lateEntryWindowMinutes of /emar/configuration prevails.',
    _validators: [validator((v: unknown) => typeof v === 'number' && v >= 0, 'Must be ≥ 0')],
  },
  requireNoteIfNotGiven: {
    _type: Type.Boolean,
    _default: true,
    _description: 'In addition to the coded reason, require a detail or note when the medication was not given.',
  },
  askSite: {
    _type: Type.Boolean,
    _default: true,
    _description: 'Show the «administration site» field (requires sitesConceptSetUuid).',
  },
  sitesConceptSetUuid: {
    _type: Type.String,
    _default: '',
    _description: 'Set (or coded question) with the administration sites (deltoid, gluteus…). Empty = no field.',
  },
  askBatch: {
    _type: Type.Boolean,
    _default: true,
    _description: 'Show lot number and expiration date, always optional.',
  },
  allowAdHoc: {
    _type: Type.Boolean,
    _default: true,
    _description: 'Allow recording without an order (the «eMAR: Record Ad Hoc» privilege is also required).',
  },
  showUnsignedNotice: {
    _type: Type.Boolean,
    _default: true,
    _description:
      'Permanent «Record without digital signature» notice. Turn it off when records are digitally signed or the notice is not required.',
  },
  reservedConceptUuids: {
    _type: Type.Array,
    _elements: { _type: Type.String },
    _default: [],
    _description:
      'Drug concepts, or sets, with reinforced confidentiality. Applies to the ORDER list (from /order, which does not mask); the history already arrives masked by the backend.',
  },
};

export interface EmarConfig {
  drugOrderTypeUuid: string;
  careSettingUuid: string;
  lateEntryThresholdMinutes: number;
  requireNoteIfNotGiven: boolean;
  askSite: boolean;
  sitesConceptSetUuid: string;
  askBatch: boolean;
  allowAdHoc: boolean;
  showUnsignedNotice: boolean;
  reservedConceptUuids: Array<string>;
}
