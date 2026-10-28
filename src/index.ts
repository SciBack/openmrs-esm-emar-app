import { defineConfigSchema, getAsyncLifecycle, getSyncLifecycle } from '@openmrs/esm-framework';
import { createDashboardLink } from '@openmrs/esm-patient-common-lib';
import { configSchema } from './config-schema';
import { moduleName } from './constants';
import { dashboardMeta } from './dashboard.meta';

const options = {
  featureName: 'emar',
  moduleName,
};

export const importTranslation = require.context('../translations', false, /.json$/, 'lazy');

export function startupApp() {
  defineConfigSchema(moduleName, configSchema);
}

// t('medicationAdministration', 'Medication administration')
export const emarDashboardLink = getSyncLifecycle(createDashboardLink({ ...dashboardMeta, moduleName }), options);

export const emarDashboard = getAsyncLifecycle(() => import('./dashboard/emar-dashboard.component'), options);

// t('recordTitle', 'Record administration')
export const recordAdministrationWorkspace = getAsyncLifecycle(
  () => import('./workspace/record-administration.workspace'),
  options,
);

export const countersignModal = getAsyncLifecycle(() => import('./modals/countersign.modal'), options);
export const regularizeModal = getAsyncLifecycle(() => import('./modals/regularize.modal'), options);
export const adverseReactionModal = getAsyncLifecycle(() => import('./modals/adverse-reaction.modal'), options);
export const historyModal = getAsyncLifecycle(() => import('./modals/history.modal'), options);
