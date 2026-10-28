import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdministrationHistory } from './administration-history.component';
import { allPrivileges, mockRecord } from '../../__mocks__/emar.mock';
import type { AdministrationRecord } from '../types';

const actions = () => ({
  onViewHistory: vi.fn(),
  onCorrect: vi.fn(),
  onEnteredInError: vi.fn(),
  onCountersign: vi.fn(),
  onRegularize: vi.fn(),
  onAdverseReaction: vi.fn(),
});

const pending: AdministrationRecord = {
  ...mockRecord,
  uuid: 'ma-2',
  displayStatus: 'pendingCountersign',
  performer: { uuid: 'prov-tech', display: 'Fictitious Technician' },
  countersign: { status: 'pending' },
};

describe('AdministrationHistory', () => {
  it('shows status, who and when', () => {
    render(
      <AdministrationHistory
        records={[mockRecord, { ...pending, status: 'not-done', lateEntryReason: 'Emergency' }]}
        isLoading={false}
        permissions={{ ...allPrivileges, isLoading: false }}
        {...actions()}
      />,
    );
    expect(screen.getByText('Given')).toBeInTheDocument();
    expect(screen.getByText('Not given')).toBeInTheDocument();
    expect(screen.getByText('Pending countersignature')).toBeInTheDocument();
    expect(screen.getByText('Late entry')).toBeInTheDocument();
    expect(screen.getByText('Fictitious Nurse')).toBeInTheDocument();
  });

  it('countersign appears for pending records of another provider', async () => {
    const a = actions();
    render(
      <AdministrationHistory
        records={[pending]}
        isLoading={false}
        permissions={{ ...allPrivileges, isLoading: false }}
        currentProviderUuid="prov-nurse"
        {...a}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    await userEvent.click(screen.getByText('Countersign'));
    expect(a.onCountersign).toHaveBeenCalledWith(pending);
  });

  it('does not offer to countersign an own record (EMAR_COUNTERSIGN_OWN_RECORD) nor to correct without privilege', async () => {
    render(
      <AdministrationHistory
        records={[pending]}
        isLoading={false}
        permissions={{ ...allPrivileges, correct: false, isLoading: false }}
        currentProviderUuid="prov-tech"
        {...actions()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    expect(screen.queryByText('Countersign')).not.toBeInTheDocument();
    expect(screen.queryByText('Correct')).not.toBeInTheDocument();
    expect(screen.getByText('View change history')).toBeInTheDocument();
  });

  it('a record masked by the backend shows no detail', () => {
    render(
      <AdministrationHistory
        records={[{ ...mockRecord, masked: true, restricted: true, medication: { display: 'Restricted treatment' } }]}
        isLoading={false}
        permissions={{ ...allPrivileges, isLoading: false }}
        {...actions()}
      />,
    );
    expect(screen.getByText('Restricted treatment')).toBeInTheDocument();
    expect(screen.queryByText(/Intramuscular/)).not.toBeInTheDocument();
  });

  it('empty state', () => {
    render(
      <AdministrationHistory
        records={[]}
        isLoading={false}
        permissions={{ ...allPrivileges, isLoading: false }}
        {...actions()}
      />,
    );
    expect(screen.getByText('No recorded administrations')).toBeInTheDocument();
  });
});
