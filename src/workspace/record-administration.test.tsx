import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { showModal } from '@openmrs/esm-framework';
import RecordAdministrationWorkspace from './record-administration.workspace';
import { correctAdministration, saveAdministration, useEmarConfiguration } from '../api/emar.resource';
import { allPrivileges, mockConfiguration, mockOrder, mockRecord, PATIENT } from '../../__mocks__/emar.mock';
import type { RecordAdministrationWorkspaceProps } from '../types';

vi.mock('../api/emar.resource', () => ({
  useEmarConfiguration: vi.fn(),
  saveAdministration: vi.fn(),
  correctAdministration: vi.fn(),
  administrationsUrl: (p: string) => `/ws/fhir2/R4/MedicationAdministration?patient=${p}`,
  backendErrorMessage: () => ({}),
}));

vi.mock('../api/concepts.resource', () => ({
  useOrderEntryConfig: () => ({
    routes: [
      { uuid: 'route-im', display: 'Intramuscular' },
      { uuid: 'route-iv', display: 'Intravenous' },
    ],
    dosingUnits: [{ uuid: 'unit-g', display: 'g' }],
  }),
  useCodedOptions: () => ({ options: [], configured: false }),
}));

const mockSave = vi.mocked(saveAdministration);
const mockCorrect = vi.mocked(correctAdministration);
const mockConfig = vi.mocked(useEmarConfiguration);

function renderWorkspace(props: RecordAdministrationWorkspaceProps, privileges = allPrivileges) {
  mockConfig.mockReturnValue({
    configuration: { ...mockConfiguration, user: { ...mockConfiguration.user, privileges } },
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  } as never);
  const closeWorkspace = vi.fn().mockResolvedValue(true);
  render(
    <RecordAdministrationWorkspace
      workspaceProps={props}
      windowProps={null}
      groupProps={{
        patientUuid: PATIENT,
        patient: { id: PATIENT } as never,
        visitContext: null,
        mutateVisitContext: vi.fn(),
      }}
      closeWorkspace={closeWorkspace}
      launchChildWorkspace={vi.fn()}
      workspaceName="emar-record-administration-workspace"
      windowName="emar-record-administration-window"
      isRootWorkspace
      showActionMenu={false}
    />,
  );
  return { closeWorkspace };
}

describe('«Record administration» workspace', () => {
  beforeEach(() => {
    mockSave.mockResolvedValue({ data: { id: 'ma-new', extension: [] } } as never);
    mockCorrect.mockResolvedValue({ data: { uuid: 'ma-v2' } } as never);
  });

  it('records against the order with dose and route prefilled', async () => {
    const { closeWorkspace } = renderWorkspace({ mode: 'order', order: mockOrder });
    expect(screen.getByText('Ceftriaxone 1 g powder for injection')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /Dose/ })).toHaveValue(1);
    expect(screen.getByRole('combobox', { name: 'Route' })).toHaveValue('route-im');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    const resource = mockSave.mock.calls[0][0];
    expect(resource.status).toBe('completed');
    expect(resource.request).toEqual({ reference: 'MedicationRequest/order-1' });
    expect(resource.dosage?.route).toEqual({ coding: [{ code: 'route-im' }] });
    expect(resource.performer).toBeUndefined();
    expect(closeWorkspace).toHaveBeenCalledWith({ discardUnsavedChanges: true });
  });

  it('«not given» without a reason is not saved; a refusal notifies the prescriber', async () => {
    renderWorkspace({ mode: 'order', order: mockOrder });
    await userEvent.click(screen.getByText('Not given'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Select the reason it was not given')).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Reason not given' }), 'reason-112');
    expect(screen.getByText(/refusal must be documented/)).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Reason details' }), 'Afraid of needles');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls[0][0].statusReason).toEqual([
      { coding: [{ code: 'reason-112' }], text: 'Afraid of needles' },
    ]);
  });

  it('ad hoc without orderer is not saved', async () => {
    renderWorkspace({ mode: 'adhoc' });
    expect(screen.getByText('Administration without a prior order')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Enter the clinician who gave the order')).toBeInTheDocument();
    expect(screen.getByText('Indicate whether it was a verbal order or an emergency')).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('without the privilege to record: notice and disabled button', () => {
    renderWorkspace(
      { mode: 'order', order: mockOrder },
      { ...allPrivileges, record: false, recordWithCountersign: false },
    );
    expect(screen.getByText('You cannot save this record')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('with «record with countersignature» it warns that the record will be pending', () => {
    renderWorkspace(
      { mode: 'order', order: mockOrder },
      { ...allPrivileges, record: false, recordWithCountersign: true },
    );
    expect(screen.getByText('Will be pending countersignature')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('correcting sends the reason, the derived corrected field and the changes', async () => {
    renderWorkspace({ mode: 'correction', record: mockRecord, order: mockOrder });
    expect(screen.getByText('Correct administration')).toBeInTheDocument();
    const dose = screen.getByRole('spinbutton', { name: /Dose/ });
    await userEvent.clear(dose);
    await userEvent.type(dose, '1');
    await userEvent.type(screen.getByRole('textbox', { name: 'Correction reason' }), 'Typed 2 g; 1 g was given');
    expect(screen.getByText('Corrected field: dose')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockCorrect).toHaveBeenCalledTimes(1));
    expect(mockCorrect).toHaveBeenCalledWith('ma-1', {
      reason: 'Typed 2 g; 1 g was given',
      correctedFields: ['dose'],
      changes: { dose: 1 },
    });
  });

  it('suspected ADR: saving opens the suspected-reaction form', async () => {
    renderWorkspace({ mode: 'order', order: mockOrder });
    await userEvent.click(screen.getByText('Suspected adverse reaction'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(showModal).toHaveBeenCalledWith(
        'emar-adverse-reaction-modal',
        expect.objectContaining({ administrationUuid: 'ma-new' }),
      ),
    );
  });
});
