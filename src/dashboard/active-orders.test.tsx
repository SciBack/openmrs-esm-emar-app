import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActiveOrders } from './active-orders.component';
import { allPrivileges, mockOrder } from '../../__mocks__/emar.mock';

const base = {
  orders: [mockOrder],
  isLoading: false,
  restricted: new Set<string>(),
  onRecord: vi.fn(),
  onRecordAdHoc: vi.fn(),
};

describe('ActiveOrders', () => {
  it('lists the active order and launches the record', async () => {
    const onRecord = vi.fn();
    render(<ActiveOrders {...base} onRecord={onRecord} permissions={{ ...allPrivileges, isLoading: false }} />);
    expect(screen.getByText('Ceftriaxone 1 g powder for injection')).toBeInTheDocument();
    expect(screen.getByText('1 g — Intramuscular — Once daily')).toBeInTheDocument();
    expect(screen.getByText('Carlos Fictitious Test')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Record administration' }));
    expect(onRecord).toHaveBeenCalledWith(mockOrder);
    expect(screen.getByRole('button', { name: /Record without order/ })).toBeInTheDocument();
  });

  it('hides record and ad hoc without privileges', () => {
    render(
      <ActiveOrders
        {...base}
        permissions={{
          ...allPrivileges,
          record: false,
          recordWithCountersign: false,
          recordAdHoc: false,
          isLoading: false,
        }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Record administration' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Record without order/ })).not.toBeInTheDocument();
  });

  it('masks the restricted drug without «eMAR: View Restricted Medications»', () => {
    render(
      <ActiveOrders
        {...base}
        restricted={new Set(['concept-cef'])}
        permissions={{ ...allPrivileges, isLoading: false }}
      />,
    );
    expect(screen.getByText('Restricted treatment')).toBeInTheDocument();
    expect(screen.queryByText(/Ceftriaxone/)).not.toBeInTheDocument();
  });

  it('with «eMAR: View Restricted Medications» shows the name', () => {
    render(
      <ActiveOrders
        {...base}
        restricted={new Set(['concept-cef'])}
        permissions={{ ...allPrivileges, viewRestricted: true, isLoading: false }}
      />,
    );
    expect(screen.getByText('Ceftriaxone 1 g powder for injection')).toBeInTheDocument();
  });
});
