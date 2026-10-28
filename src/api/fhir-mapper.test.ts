import { describe, expect, it, vi } from 'vitest';
import {
  buildCorrectionPayload,
  buildMedicationAdministration,
  isLateEntry,
  toAdministrationRecord,
  type FhirMedicationAdministration,
} from './fhir-mapper';
import { emarExtensions } from '../constants';
import { mockOrder, mockRecord, NOW, PATIENT } from '../../__mocks__/emar.mock';

const ctx = { patientUuid: PATIENT, locationUuid: 'loc-1', lateEntryThresholdMinutes: 30, now: NOW };
const extValue = (r: FhirMedicationAdministration, url: string) => r.extension?.find((e) => e.url === url);

describe('buildMedicationAdministration (docs/API.md §4.1)', () => {
  it('builds a scheduled administration against the order, without performer', () => {
    const r = buildMedicationAdministration(
      { given: true, effectiveDateTime: NOW, dose: 1, routeUuid: 'route-im', note: ' no incidents ' },
      ctx,
      mockOrder,
    );
    expect(r.status).toBe('completed');
    expect(r.request).toEqual({ reference: `MedicationRequest/${mockOrder.uuid}` });
    expect(r.subject).toEqual({ reference: `Patient/${PATIENT}` });
    expect(r.performer).toBeUndefined();
    expect(r.medicationReference).toBeUndefined();
    expect(r.dosage).toEqual({ dose: { value: 1 }, route: { coding: [{ code: 'route-im' }] } });
    expect(r.note).toEqual([{ text: 'no incidents' }]);
    expect(extValue(r, emarExtensions.administrationType)?.valueCode).toBe('scheduled');
    expect(extValue(r, emarExtensions.location)?.valueReference?.reference).toBe('Location/loc-1');
    // ISO 8601 with offset (not «Z»), same instant
    expect(r.effectiveDateTime).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
    expect(new Date(r.effectiveDateTime).getTime()).toBe(NOW.getTime());
  });

  it('not given carries the reason uuid in statusReason and sends no dose', () => {
    const r = buildMedicationAdministration(
      {
        given: false,
        effectiveDateTime: NOW,
        dose: 1,
        notGivenReasonUuid: 'reason-112',
        notGivenReasonText: 'Afraid of needles',
      },
      ctx,
      mockOrder,
    );
    expect(r.status).toBe('not-done');
    expect(r.statusReason).toEqual([{ coding: [{ code: 'reason-112' }], text: 'Afraid of needles' }]);
    expect(r.dosage).toBeUndefined();
  });

  it('not given sends neither route nor site even if prefilled from the order', () => {
    const r = buildMedicationAdministration(
      { given: false, effectiveDateTime: NOW, routeUuid: 'route-im', siteUuid: 'site-1', notGivenReasonUuid: 'm' },
      ctx,
      mockOrder,
    );
    expect(r.dosage).toBeUndefined();
  });

  it('ad hoc: no request, with medication, reason, modality and orderer', () => {
    const r = buildMedicationAdministration(
      {
        given: true,
        effectiveDateTime: NOW,
        drugUuid: 'drug-1',
        orderingProviderUuid: 'prov-med',
        adHocModality: 'verbal',
        adHocReason: 'Asthma attack',
        dose: 2,
        doseUnitUuid: 'unit-puff',
      },
      ctx,
    );
    expect(r.request).toBeUndefined();
    expect(r.medicationReference).toEqual({ reference: 'Medication/drug-1' });
    expect(r.reasonCode).toEqual([{ text: 'Asthma attack' }]);
    expect(extValue(r, emarExtensions.administrationType)?.valueCode).toBe('ad-hoc');
    expect(extValue(r, emarExtensions.adHocModality)?.valueCode).toBe('verbal');
    expect(extValue(r, emarExtensions.orderer)?.valueReference?.reference).toBe('Practitioner/prov-med');
    expect(r.dosage?.dose).toEqual({ value: 2, code: 'unit-puff' });
  });

  it('late entry: the extension is only added outside the window', () => {
    const late = new Date(NOW.getTime() - 45 * 60_000);
    expect(isLateEntry(late, 30, NOW)).toBe(true);
    expect(isLateEntry(new Date(NOW.getTime() - 10 * 60_000), 30, NOW)).toBe(false);
    const r = buildMedicationAdministration(
      { given: true, effectiveDateTime: late, lateEntryReason: 'Simultaneous emergency' },
      ctx,
      mockOrder,
    );
    expect(extValue(r, emarExtensions.lateEntryReason)?.valueString).toBe('Simultaneous emergency');
  });

  it('PRN according to the order', () => {
    const r = buildMedicationAdministration({ given: true, effectiveDateTime: NOW }, ctx, {
      ...mockOrder,
      asNeeded: true,
    });
    expect(extValue(r, emarExtensions.administrationType)?.valueCode).toBe('prn');
  });
});

describe('toAdministrationRecord (docs/API.md §4.2)', () => {
  it('reads a record', () => {
    const rec = toAdministrationRecord({
      resourceType: 'MedicationAdministration',
      id: 'ma-1',
      meta: { lastUpdated: '2026-10-23T09:11:44.000-05:00' },
      status: 'completed',
      medicationReference: { reference: 'Medication/drug-1', display: 'Enalapril maleate 10 mg tablet' },
      subject: { reference: 'Patient/p' },
      context: { reference: 'Encounter/enc-1' },
      effectiveDateTime: '2026-10-23T08:00:00-05:00',
      performer: [{ actor: { reference: 'Practitioner/prov-1', display: 'Fictitious Nurse' } }],
      request: { reference: 'MedicationRequest/order-1' },
      dosage: { dose: { value: 1, unit: 'Tablet', code: 'unit-1' } },
    });
    expect(rec).toMatchObject({
      uuid: 'ma-1',
      encounterUuid: 'enc-1',
      displayStatus: 'given',
      orderUuid: 'order-1',
      performer: { uuid: 'prov-1', display: 'Fictitious Nurse' },
      medication: { uuid: 'drug-1', display: 'Enalapril maleate 10 mg tablet' },
      dose: { value: 1, unit: 'Tablet', unitUuid: 'unit-1' },
      masked: false,
    });
  });

  it('keeps the backend masking and the countersignature and correction states', () => {
    const rec = toAdministrationRecord({
      resourceType: 'MedicationAdministration',
      id: 'ma-2',
      meta: { security: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-Confidentiality', code: 'R' }] },
      status: 'completed',
      medicationCodeableConcept: { text: 'Restricted treatment' },
      subject: { reference: 'Patient/p' },
      effectiveDateTime: '2026-10-23T08:00:00-05:00',
      extension: [
        { url: emarExtensions.countersignStatus, valueCode: 'pending' },
        { url: emarExtensions.previousVersion, valueReference: { reference: 'MedicationAdministration/ma-0' } },
        { url: emarExtensions.correctedField, valueCode: 'uuid-dose' },
      ],
    });
    expect(rec.masked).toBe(true);
    expect(rec.restricted).toBe(true);
    expect(rec.medication.display).toBe('Restricted treatment');
    expect(rec.displayStatus).toBe('pendingCountersign');
    expect(rec.previousVersion).toBe('ma-0');
    expect(rec.correctedFields).toEqual(['uuid-dose']);
  });
});

describe('buildCorrectionPayload (docs/API.md §5.4)', () => {
  it('derives changes and corrected fields from what actually changed', () => {
    const p = buildCorrectionPayload(mockRecord, {
      given: true,
      effectiveDateTime: new Date(mockRecord.effectiveDateTime),
      dose: 1,
      doseUnitUuid: mockRecord.dose.unitUuid,
      routeUuid: mockRecord.route.uuid,
      note: '',
      lotNumber: '',
      correctionReason: ' Typed 2 mL; 1 mL was given ',
    });
    expect(p).toEqual({
      reason: 'Typed 2 mL; 1 mL was given',
      correctedFields: ['dose'],
      changes: { dose: 1 },
    });
  });

  it('entered in error', () => {
    const p = buildCorrectionPayload(mockRecord, {
      given: true,
      effectiveDateTime: new Date(),
      enteredInError: true,
      correctionReason: 'Wrong patient',
    });
    expect(p).toEqual({
      reason: 'Wrong patient',
      correctedFields: ['status'],
      changes: { status: 'entered-in-error' },
    });
  });

  it('no changes means no corrected fields', () => {
    const p = buildCorrectionPayload(mockRecord, {
      given: true,
      effectiveDateTime: new Date(mockRecord.effectiveDateTime),
      dose: mockRecord.dose.value,
      doseUnitUuid: mockRecord.dose.unitUuid,
      routeUuid: mockRecord.route.uuid,
      correctionReason: 'x',
    });
    expect(p.correctedFields).toEqual([]);
    expect(p.changes).toEqual({});
  });
});

describe('fetchAllPages', () => {
  it('follows the next links rewriting them relative to fhirBaseUrl', async () => {
    const { openmrsFetch } = await import('@openmrs/esm-framework');
    const { fetchAllPages } = await import('./emar.resource');
    const mocked = vi.mocked(openmrsFetch);
    const ma = (id: string) => ({ resource: { resourceType: 'MedicationAdministration', id } });
    mocked
      .mockResolvedValueOnce({
        data: {
          entry: [ma('a')],
          link: [{ relation: 'next', url: 'http://other-host:8097/openmrs/ws/fhir2/R4?_getpages=x&_getpagesoffset=1' }],
        },
      } as never)
      .mockResolvedValueOnce({ data: { entry: [ma('b')], link: [] } } as never);
    const res = await fetchAllPages('/ws/fhir2/R4/MedicationAdministration?patient=p&_count=100');
    expect(res.data.entry.map((e) => e.resource.id)).toEqual(['a', 'b']);
    expect(mocked.mock.calls[1][0]).toBe('/ws/fhir2/R4?_getpages=x&_getpagesoffset=1');
  });
});
