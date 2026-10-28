/**
 * Test double of @openmrs/esm-patient-common-lib (shared dependency provided at runtime by the patient chart). Only
 * what the eMAR uses; aliased in vitest.config.ts.
 */
import React from 'react';
import { vi } from 'vitest';

export const CardHeader = ({ title, children }: { title: string; children?: React.ReactNode }) => (
  <div>
    <h4>{title}</h4>
    {children}
  </div>
);
export const EmptyState = ({ headerTitle, displayText }: { headerTitle: string; displayText: string }) => (
  <div>
    <h4>{headerTitle}</h4>
    <p>No {displayText}</p>
  </div>
);
export const ErrorState = ({ headerTitle }: { headerTitle: string }) => <div role="alert">{headerTitle}</div>;
export const PatientChartPagination = () => null;
export const createDashboardLink = vi.fn(() => () => null);
export const launchStartVisitPrompt = vi.fn();
export const mockLaunchWorkspaceRequiringVisit = vi.fn();
export const useLaunchWorkspaceRequiringVisit = vi.fn(() => mockLaunchWorkspaceRequiringVisit);
