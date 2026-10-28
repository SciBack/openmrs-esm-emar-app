# openmrs-esm-emar-app — Electronic Medication Administration Record (eMAR) for O3

OpenMRS 3 microfrontend (npm package `openmrs-esm-emar-app`) that records **which medication was administered, to
whom, when, how and by whom**, against the medication order. It is the UI of the backend module
`openmrs-module-emar` (module id `emar`), which stores each administration as **encounter + obs group** (no tables of
its own) and publishes it as FHIR `MedicationAdministration`. Backend contract: `openmrs-module-emar/docs/API.md`.

Nothing in O3 is modified: only existing slots and workspace groups are used (see «Hook points»).

> **Healthcare disclaimer.** Distributed under the MPL 2.0 with the OpenMRS Healthcare Disclaimer (see
> [LICENSE](LICENSE)). It is not a substitute for clinical judgement; each deployment is responsible for its own
> regulatory compliance.

## What it does

| Screen | Where | Content |
|---|---|---|
| **«Medication administration»** tab | left menu of the patient chart (`/patient/:uuid/chart/medication-administration`) | «Record without digital signature» notice (configurable); **active medication orders** with «Record administration» and «Record without order»; **history** (date and time, medication, status, dose/route/site/reason, who administered and when it was recorded) |
| **«Record administration»** workspace | chart side panel | Given / not given (**coded** reason from `/emar/configuration` + detail; for «patient refused» it asks to notify the prescriber); date and time (default now; earlier than the window → **«late entry»** with a required reason); dose and route **prefilled from the order**; site; optional lot number and expiration date; note; «suspected adverse reaction» |
| Same workspace, **without order** mode | «Record without order» button | Medication (search), **ordering clinician required** (provider search), modality (verbal / emergency), reason, dose with unit |
| Same workspace, **correction** mode | row menu of the history | Required reason; the **corrected field** is derived from what actually changed; «void (entered in error)» |
| Modals | row menu of the history | **Countersign** (with a note; not offered on one's own record), **Regularize** an ad hoc record with a later order, **Record suspected ADR** (description, severity with its reporting deadline, onset, identification, action taken), **Change history** (voided versions with author, reason and corrected field) |

Statuses in the history: given · not given · voided · corrected · pending countersignature · countersigned · late entry
· no order · pending regularization.

**Permissions.** Actions are shown according to the privileges reported by the backend in `GET /emar/configuration`
(`user.privileges`): `eMAR: View`, `eMAR: Record`, `eMAR: Record With Countersignature` (records are born pending),
`eMAR: Record Ad Hoc`, `eMAR: Correct`, `eMAR: Countersign`, `eMAR: Regularize`, `eMAR: View Restricted Medications`.
The tab and the widget also declare `"privileges": "eMAR: View"` in `routes.json`. The UI **only hides**; the backend
enforces (403 / 422).

**Confidentiality.** The history arrives masked by the backend («Restricted treatment», no `medicationReference`). The
**order** list comes from `/ws/rest/v1/order`, which does not mask: for it, configure `reservedConceptUuids` (concepts
or sets) and name and dose are hidden from users without `eMAR: View Restricted Medications`.

## Compatibility and hook points

Reference versions: **O3 Reference Application 3.7.1** (`coreVersion` 10.0.0, `@openmrs/esm-patient-chart-app`
12.3.4). Shared (peer) dependencies: `@openmrs/esm-framework` 10.x and `@openmrs/esm-patient-common-lib` 12.x. Backend:
`emar` ≥ 0.2.0, `fhir2` ≥ 4.3.0.

| Hook | Evidence in the 3.7.1 code (`openmrs-esm-patient-chart/packages/`) |
|---|---|
| Link in `patient-chart-dashboard-slot` with `meta.slot` / `meta.path` | The left menu is that slot: `esm-patient-chart-app/src/patient-chart/patient-chart.component.tsx:34`; the chart reads the dashboards from it and **registers the own slot** declared in `meta.slot`: `.../chart-review/chart-review.component.tsx:85-97`; `meta` + config are merged (including `hideDashboardTitle`, `layoutMode`): `chart-review.component.tsx:60-62` |
| Widget in the own slot `emar-dashboard-slot` | `DashboardView` mounts `dashboard.slot` and passes `patientUuid`, `patient`, `launchStartVisitPrompt`: `.../chart-review/dashboard-view.component.tsx:41-53,75-84` |
| Workspace in the `patient-chart` group (workspaces v2) | The group exists in `esm-patient-chart-app/src/routes.json:261-266` and the chart opens it with `patient`, `patientUuid`, `visitContext`: `patient-chart.resources.ts:126`; same pattern as `immunization-form-window` (`esm-patient-immunizations-app/src/routes.json`) |
| No active visit → offer to start one | `useLaunchWorkspaceRequiringVisit`: `esm-patient-common-lib/src/workspaces.ts:44-57`; the backend also answers 422 `EMAR_NO_ACTIVE_VISIT` and the notice offers «Start visit» |
| Active orders | Same query and rule as `esm-patient-medications-app/src/api/api.ts` (`/order?…&excludeDiscontinueOrders=true`, `bucketMedicationOrders`) |

When upgrading O3, check these names and the `esm-patient-chart` and `esm-core` changelogs.

**Styling.** Like the other O3 apps it uses Carbon (`@carbon/react`) with the `@openmrs/esm-styleguide` tokens and
the patient chart components (`CardHeader`, `EmptyState`, `ErrorState`, `PatientChartPagination`), so that it looks
and behaves like the rest of the chart.

## Development

Requirements: Node 20+ and Corepack (`corepack enable`). Generated with `@openmrs/create-o3-app` (standalone, Rspack).

```bash
corepack yarn install
corepack yarn start --backend http://localhost:8080      # openmrs develop against a backend with the emar module
```

Use a test server with fictitious data only.

| Task | Command |
|---|---|
| Unit tests (Vitest + Testing Library) | `corepack yarn test` |
| Lint, types and tests | `corepack yarn verify` |
| Production build (`dist/`, with `routes.json`) | `corepack yarn build` |
| Installable tarball | `corepack yarn build && npm pack` → `openmrs-esm-emar-app-<version>.tgz` |
| Translations | `corepack yarn extract-translations` regenerates **`en.json`** from the English defaults in the code; other locales (`es.json`) are maintained by hand with the same keys |
| End-to-end tests (Playwright) | `e2e/run-e2e.sh` (see below) |

Technical notes: `rspack.config.js` transpiles `@openmrs/esm-patient-common-lib` (published as TypeScript) only for the
fallback copy required by Module Federation; at runtime the patient chart's copy is used. In tests,
`__mocks__/esm-patient-common-lib.tsx` replaces that library.

## Configuration

Configured like any O3 app (JSON in `SPA_CONFIG_URLS` or the implementer tools), under the key
**`openmrs-esm-emar-app`**. Clinical settings (reasons, modalities, correctable fields, severities, late-entry
window, privileges) are **not** configured here: the backend provides them in `GET /ws/rest/v1/emar/configuration`.

| Key | Default | Purpose |
|---|---|---|
| `drugOrderTypeUuid` | `131168f4-…` (Drug Order) | Listed order type |
| `careSettingUuid` | `6f0c9a92-…` (outpatient) | Care setting of the orders |
| `lateEntryThresholdMinutes` | 30 | Fallback if the backend does not report `lateEntryWindowMinutes` |
| `requireNoteIfNotGiven` | true | Besides the coded reason, ask for a detail when not given |
| `askSite` + `sitesConceptSetUuid` | true + `''` | «Site» field; without a configured set it does not appear |
| `askBatch` | true | Lot number and expiration date (optional) |
| `allowAdHoc` | true | «Record without order» button (also requires `eMAR: Record Ad Hoc`) |
| `showUnsignedNotice` | true | «Record without digital signature» notice |
| `reservedConceptUuids` | `[]` | Medications with reinforced confidentiality in the order list |

Example:

```json
{
  "openmrs-esm-emar-app": {
    "sitesConceptSetUuid": "<administration sites set uuid>",
    "reservedConceptUuids": ["<antiretrovirals set uuid>", "<psychotropics set uuid>"]
  }
}
```

**Languages.** English is the default (texts in the code and `translations/en.json`); Spanish is in
`translations/es.json`. Any text can be changed per deployment with O3's reserved `"Translation overrides"`
configuration key, without touching this package.

## Including it in a distribution

`openmrs assemble` (CLI `openmrs` 10.0.0, `openmrs-esm-core/packages/tooling/openmrs/src/commands/assemble.ts`)
downloads a **npm tarball** for each `frontendModules` entry, unpacks it, adds its `routes.json` to the routes registry
and the bundle to the import map. The version of each entry can be:

| Form | Resolution |
|---|---|
| semver (`"0.2.0"`) | `pacote` against the npm registry, using the `.npmrc` configuration chain (also per-scope registries and tokens) |
| `"file:path/to/package.tgz"` | reads the tarball from disk, **relative to the working directory** of the process |
| `"https://…/package.tgz"` | plain `fetch`, **without authentication headers** |

The package name is unscoped; the O3 tooling supports it (`assemble.ts:256` only strips a leading `@`;
`rspack-config/src/index.ts:74-91,296` derives the bundle identifiers from the name).

```json
// distribution: spa-assemble-config.json
{
  "frontendModules": {
    "openmrs-esm-emar-app": "file:<relative path>/openmrs-esm-emar-app-0.2.0.tgz"
  }
}
```

Check after building: `importmap.json` contains `openmrs-esm-emar-app` and `routes.registry.json` contains
`emar-dashboard-link`; in the patient chart, «Medication administration» appears for a user with `eMAR: View`.
Metadata (privileges, roles, concepts) is loaded by the backend's Initializer configuration
(`openmrs-module-emar/initializer-config/`).

## Uninstall

1. Remove `openmrs-esm-emar-app` from the distribution's `spa-assemble-config.json` (or add it to
   `frontendModuleExcludes` if inherited), rebuild and redeploy the frontend.
2. Check: `importmap.json` and `routes.registry.json` without `emar`; the patient chart without the tab.
3. Remove the `openmrs-esm-emar-app` key from the configuration JSON files (if left, O3 only warns about configuration
   for a missing module).
4. The frontend stores nothing of its own: clinical records are backend encounters and obs and are **not** touched.
   To remove the backend, see the uninstall procedure of `openmrs-module-emar`.

## Tests

- Unit: 36 tests in 5 files (`src/**/*.test.ts(x)`): FHIR mapping, validation, orders, history and workspace.
- End-to-end: `e2e/specs/emar.spec.ts` (7 flows) against a **disposable** server: copy `e2e/env.example` to
  `e2e/.env`, start the backend and `openmrs develop` of this repo on :8080, then `e2e/run-e2e.sh`. The same 7 flows
  passed on 26-Oct-2026 under the module's previous names and 7/7 again on 28-Oct-2026 with emar 0.2.0. Flow 7 needs
  `reservedConceptUuids` in the frontend config (order list), besides the backend global property (history).

## Open items

- Worklists of pending items (countersignature, regularization, ADR) have backend endpoints but no screen yet.
- Printable administration chart, hospital scope (grid, shifts, ward view), controlled substances.
- Digital signature: the «Record without digital signature» notice stays until records are signed.

## License

[Mozilla Public License 2.0 with Healthcare Disclaimer](LICENSE) (MPL 2.0 HD), the license of OpenMRS.
