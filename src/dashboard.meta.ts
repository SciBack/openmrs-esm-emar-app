import type { DashboardLinkConfig } from '@openmrs/esm-patient-common-lib';
import { dashboardPath, dashboardSlot } from './constants';

export const dashboardMeta: DashboardLinkConfig & { slot: string } = {
  slot: dashboardSlot,
  path: dashboardPath,
  // Translation key (resolved by DashboardExtension with the module's namespace).
  title: 'medicationAdministration',
  icon: 'omrs-icon-medication',
};
