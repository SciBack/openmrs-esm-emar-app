import { describe, expect, it } from 'vitest';
import { validateAdministration } from './validation';
import { isOrderActive } from '../api/drug-orders.resource';
import { mockOrder, NOW } from '../../__mocks__/emar.mock';

const t = (_k: string, fallback: string) => fallback;
const rules = { mode: 'order' as const, lateEntryThresholdMinutes: 30, requireNoteIfNotGiven: true, now: NOW };

describe('validateAdministration', () => {
  it('given now against an order is valid', () => {
    expect(validateAdministration({ given: true, effectiveDateTime: NOW, dose: 1 }, rules, t)).toEqual({});
  });

  it('not given without a coded reason or detail is not saved', () => {
    const e = validateAdministration({ given: false, effectiveDateTime: NOW }, rules, t);
    expect(e.notGivenReasonUuid).toBeTruthy();
    expect(e.notGivenReasonText).toBeTruthy();
  });

  it('late entry requires a reason', () => {
    const late = new Date(NOW.getTime() - 60 * 60_000);
    expect(validateAdministration({ given: true, effectiveDateTime: late }, rules, t).lateEntryReason).toBeTruthy();
    expect(
      validateAdministration({ given: true, effectiveDateTime: late, lateEntryReason: 'Emergency' }, rules, t),
    ).toEqual({});
  });

  it('a future time (more than 2 min) is not accepted', () => {
    const future = new Date(NOW.getTime() + 5 * 60_000);
    expect(validateAdministration({ given: true, effectiveDateTime: future }, rules, t).effectiveDateTime).toBeTruthy();
  });

  it('ad hoc requires medication, orderer, modality and reason', () => {
    const e = validateAdministration({ given: true, effectiveDateTime: NOW }, { ...rules, mode: 'adhoc' }, t);
    expect(Object.keys(e).sort()).toEqual(['adHocModality', 'adHocReason', 'drugUuid', 'orderingProviderUuid']);
  });

  it('a correction requires a reason', () => {
    const e = validateAdministration({ given: true, effectiveDateTime: NOW }, { ...rules, mode: 'correction' }, t);
    expect(e.correctionReason).toBeTruthy();
  });

  it('lot expired before the administration', () => {
    const e = validateAdministration(
      { given: true, effectiveDateTime: NOW, expirationDate: new Date('2026-01-01') },
      rules,
      t,
    );
    expect(e.expirationDate).toBeTruthy();
  });
});

describe('isOrderActive', () => {
  it('active, stopped, expired and future', () => {
    expect(isOrderActive(mockOrder, NOW)).toBe(true);
    expect(isOrderActive({ ...mockOrder, dateStopped: '2026-10-23T09:00:00-05:00' }, NOW)).toBe(false);
    expect(isOrderActive({ ...mockOrder, autoExpireDate: '2026-10-22T09:00:00-05:00' }, NOW)).toBe(false);
    expect(isOrderActive({ ...mockOrder, scheduledDate: '2026-10-24T09:00:00-05:00' }, NOW)).toBe(false);
    expect(isOrderActive({ ...mockOrder, action: 'DISCONTINUE' }, NOW)).toBe(false);
  });
});
