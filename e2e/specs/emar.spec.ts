/**
 * eMAR end-to-end flows against a DISPOSABLE server (see e2e/run-e2e.sh and e2e/env.example).
 * Fictitious data only: every note carries «HTEST e2e».
 * Users: nurse = a user whose role inherits «eMAR: Nurse»; technician = a user with «eMAR: Supervised Recorder»
 * (backend test-integration/01-prepare.sh creates one). The admin is only used to toggle the restricted-medication
 * global property (emar.restrictedMedicationConcepts).
 */
import { expect, test, type APIRequestContext, type Browser, type Locator, type Page } from '@playwright/test';

const env = (name: string) => {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing ${name} (see e2e/env.example)`);
  }
  return v;
};
const PATIENT = () => env('E2E_PATIENT');
const LOCATION = () => env('E2E_LOCATION');
const ORDER_DRUG = () => new RegExp(env('E2E_ORDER_DRUG'), 'i');
const EMAR_URL = () => `/openmrs/spa/patient/${PATIENT()}/chart/medication-administration`;
const FHIR = '/openmrs/ws/fhir2/R4';
const REST = '/openmrs/ws/rest/v1';
const EXT = 'http://fhir.openmrs.org/ext/emar/';
const OUT = process.env.E2E_OUT ?? '/tmp/emar-e2e';
const RUN = `HTEST e2e ${new Date().toISOString().slice(0, 16)}`;
const SAVE = /^Save$/;

const cred = (u?: string, p?: string) => {
  if (!u || !p) {
    throw new Error('Missing test credentials in the environment (see e2e/env.example)');
  }
  return 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');
};
const NURSE = () => cred(process.env.E2E_NURSE_USER, process.env.E2E_NURSE_PASS);
const TECH = () => cred(process.env.E2E_TECH_USER, process.env.E2E_TECH_PASS);
const ADMIN = () => cred(process.env.E2E_ADMIN_USER, process.env.E2E_ADMIN_PASS);

async function login(browser: Browser, auth: string): Promise<Page> {
  const context = await browser.newContext();
  const r = await context.request.post(`${REST}/session`, {
    headers: { Authorization: auth },
    data: { sessionLocation: LOCATION(), locale: 'en' },
  });
  expect(r.status()).toBe(200);
  return context.newPage();
}

async function openEmar(page: Page) {
  await page.goto(EMAR_URL());
  await expect(page.getByRole('heading', { name: 'Medication administration' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Administration history')).toBeVisible();
}

/** Value of the first <option> whose label matches, without waiting (undefined when none matches). */
const optionValue = (select: Locator, label: RegExp) =>
  select
    .locator('option')
    .evaluateAll(
      (options: Array<HTMLOptionElement>, source: string) =>
        options.find((o) => new RegExp(source, 'i').test(o.textContent?.trim() ?? ''))?.value,
      label.source,
    );

const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

/** Row of the order table with the record button. */
const orderRow = (page: Page, drug: RegExp) =>
  page
    .getByRole('row')
    .filter({ hasText: drug })
    .filter({ has: page.getByRole('button', { name: 'Record administration' }) });

async function searchByNote(request: APIRequestContext, auth: string, note: string) {
  const r = await request.get(`${FHIR}/MedicationAdministration?patient=${PATIENT()}&_count=100`, {
    headers: { Authorization: auth },
  });
  expect(r.status()).toBe(200);
  const bundle = await r.json();
  return (bundle.entry ?? []).map((e) => e.resource).filter((x) => x.note?.some((n) => n.text === note));
}

async function saveWorkspace(page: Page) {
  await page.getByRole('button', { name: SAVE }).click();
}

test.describe.serial('eMAR — end to end', () => {
  test('1. a nurse records «given» against the order (dose and route prefilled)', async ({ browser }) => {
    const page = await login(browser, NURSE());
    await openEmar(page);
    await shot(page, '01-dashboard');
    await orderRow(page, ORDER_DRUG()).getByRole('button', { name: 'Record administration' }).click();
    await expect(page.getByText('Outcome', { exact: true })).toBeVisible();
    const dose = page.getByRole('spinbutton', { name: /Dose/ });
    await expect(dose).toHaveValue('1');
    await expect(page.getByRole('combobox', { name: 'Route' })).not.toHaveValue('');
    await dose.fill('0.75');
    const note = `${RUN} given`;
    await page.getByRole('textbox', { name: 'Note' }).fill(note);
    await shot(page, '02-workspace-given');
    await saveWorkspace(page);
    await expect(page.getByText('Administration recorded').first()).toBeVisible();
    const [rec] = await searchByNote(page.request, NURSE(), note);
    expect(rec?.status).toBe('completed');
    expect(rec.request.reference).toMatch(/^MedicationRequest\//);
    expect(rec.dosage.dose.value).toBe(0.75);
    await expect(page.getByRole('row').filter({ hasText: '0.75' }).first()).toContainText('Given');
    await shot(page, '03-history-given');
  });

  test('2. «not given» requires a reason; «patient refused» asks to notify the prescriber', async ({ browser }) => {
    const page = await login(browser, NURSE());
    await openEmar(page);
    await orderRow(page, ORDER_DRUG()).getByRole('button', { name: 'Record administration' }).click();
    await expect(page.getByText('Outcome', { exact: true })).toBeVisible();
    await page.locator('label[for="emar-not-given"]').click();
    await saveWorkspace(page);
    await expect(page.getByText('Select the reason it was not given')).toBeVisible();
    await page.getByRole('combobox', { name: 'Reason not given' }).selectOption({ label: 'Patient refused' });
    await expect(page.getByText(/refusal must be documented/)).toBeVisible();
    const note = `${RUN} not given`;
    await page.getByRole('textbox', { name: 'Reason details' }).fill('Afraid of needles');
    await page.getByRole('textbox', { name: 'Note' }).fill(note);
    await shot(page, '04-workspace-not-given');
    await saveWorkspace(page);
    await expect(page.getByText('Administration recorded').first()).toBeVisible();
    const [rec] = await searchByNote(page.request, NURSE(), note);
    expect(rec?.status).toBe('not-done');
    expect(rec.statusReason[0].coding[0].code).toMatch(/^5c1bac4d-/);
    expect(rec.statusReason[0].text).toBe('Afraid of needles');
  });

  test('3. ad hoc (verbal order) with an ordering clinician', async ({ browser }) => {
    const page = await login(browser, NURSE());
    await openEmar(page);
    await page.getByRole('button', { name: /Record without order/ }).click();
    await expect(page.getByText('Administration without a prior order')).toBeVisible();
    await saveWorkspace(page);
    await expect(page.getByText('Enter the clinician who gave the order')).toBeVisible();

    await page.getByRole('combobox', { name: 'Medication' }).fill(env('E2E_ADHOC_DRUG_SEARCH'));
    await page.getByRole('listbox').getByRole('option').first().click();
    await page.getByRole('combobox', { name: 'Ordering clinician' }).fill(env('E2E_ORDERER_SEARCH'));
    await page.getByRole('listbox').getByRole('option').first().click();
    await page.locator('label[for="emar-modality-verbal"]').click();
    await page.getByRole('textbox', { name: 'Reason', exact: true }).fill('Acute episode (HTEST)');
    await page.getByRole('spinbutton', { name: /Dose/ }).fill('1');
    const unit = page.getByRole('combobox', { name: 'Unit' });
    const mlValue = await optionValue(unit, /^(ml|millilit(er|re)|mililitro)$/i);
    if (mlValue) {
      await unit.selectOption(mlValue);
    }
    const route = page.getByRole('combobox', { name: 'Route' });
    const imValue = await optionValue(route, /\bIM\b|intramuscular/i);
    if (imValue) {
      await route.selectOption(imValue);
    }
    const note = `${RUN} ad hoc`;
    await page.getByRole('textbox', { name: 'Note' }).fill(note);
    await shot(page, '05-workspace-adhoc');
    await saveWorkspace(page);
    await expect(page.getByText('Administration recorded').first()).toBeVisible();
    const [rec] = await searchByNote(page.request, NURSE(), note);
    expect(rec?.request).toBeUndefined();
    const ext = (name: string) => rec.extension.find((e) => e.url === EXT + name);
    expect(ext('administration-type').valueCode).toBe('ad-hoc');
    expect(ext('ad-hoc-modality').valueCode).toBe('verbal');
    expect(ext('orderer').valueReference.reference).toMatch(/^Practitioner\//);
    await page.reload();
    await openEmar(page);
    await shot(page, '06-history-adhoc');
  });

  test('4. correction with a reason: new version, the previous one is voided', async ({ browser }) => {
    const page = await login(browser, NURSE());
    await openEmar(page);
    const row = page.getByRole('row').filter({ hasText: '0.75' }).first();
    await row.getByRole('button', { name: 'Actions' }).click();
    await page.getByRole('menuitem', { name: 'Correct', exact: true }).click();
    await expect(page.getByText('Correct administration', { exact: true })).toBeVisible();
    await page.getByRole('spinbutton', { name: /Dose/ }).fill('0.5');
    await page.getByRole('textbox', { name: 'Correction reason' }).fill('HTEST typed 0.75; 0.5 was given');
    await expect(page.getByText('Corrected field: dose')).toBeVisible();
    await shot(page, '07-workspace-correction');
    await saveWorkspace(page);
    await expect(page.getByText('Correction recorded').first()).toBeVisible();
    const corrected = page.getByRole('row').filter({ hasText: 'Corrected' }).first();
    await expect(corrected).toContainText('0.5');
    await corrected.getByRole('button', { name: 'Actions' }).click();
    await page.getByRole('menuitem', { name: 'View change history' }).click();
    await expect(page.getByText(/Correction reason: HTEST typed/)).toBeVisible();
    await expect(page.getByText('Current', { exact: true })).toBeVisible();
    await shot(page, '08-change-history');
  });

  test('5. countersignature: the technician records (pending) and the nurse countersigns', async ({ browser }) => {
    const tech = await login(browser, TECH());
    await openEmar(tech);
    await expect(tech.getByRole('button', { name: /Record without order/ })).toHaveCount(0); // no «eMAR: Record Ad Hoc»
    await orderRow(tech, ORDER_DRUG()).getByRole('button', { name: 'Record administration' }).click();
    await expect(tech.getByText('Will be pending countersignature')).toBeVisible();
    await tech.getByRole('spinbutton', { name: /Dose/ }).fill('0.25');
    const note = `${RUN} technician`;
    await tech.getByRole('textbox', { name: 'Note' }).fill(note);
    await shot(tech, '09-technician-workspace');
    await saveWorkspace(tech);
    await expect(tech.getByText('Administration recorded, pending countersignature').first()).toBeVisible();
    const pendingRow = tech.getByRole('row').filter({ hasText: '0.25' }).first();
    await expect(pendingRow).toContainText('Pending countersignature');
    await pendingRow.getByRole('button', { name: 'Actions' }).click();
    await expect(tech.getByRole('menuitem', { name: 'Countersign' })).toHaveCount(0);
    await tech.keyboard.press('Escape');

    const nurse = await login(browser, NURSE());
    await openEmar(nurse);
    const row = nurse
      .getByRole('row')
      .filter({ hasText: '0.25' })
      .filter({ hasText: 'Pending countersignature' })
      .first();
    await row.getByRole('button', { name: 'Actions' }).click();
    await nurse.getByRole('menuitem', { name: 'Countersign' }).click();
    await nurse.getByRole('textbox', { name: 'Note (optional)' }).fill('HTEST checked with the technician');
    await shot(nurse, '10-countersign-modal');
    await nurse.getByRole('button', { name: 'Countersign' }).click();
    await expect(nurse.getByText('Record countersigned').first()).toBeVisible();
    const [rec] = await searchByNote(nurse.request, NURSE(), note);
    expect(rec.extension.find((e) => e.url === EXT + 'countersign-status').valueCode).toBe('countersigned');
    await expect(nurse.getByRole('row').filter({ hasText: '0.25' }).first()).toContainText('Countersigned');
    await shot(nurse, '11-history-countersigned');
  });

  test('6. suspected ADR from the record', async ({ browser }) => {
    const page = await login(browser, NURSE());
    await openEmar(page);
    await orderRow(page, ORDER_DRUG()).getByRole('button', { name: 'Record administration' }).click();
    await expect(page.getByText('Outcome', { exact: true })).toBeVisible();
    await page.locator('label[for="emar-adr"]').click();
    await page.getByRole('textbox', { name: 'Note' }).fill(`${RUN} with ADR`);
    await saveWorkspace(page);
    const modal = page.getByRole('dialog').filter({ hasText: 'Suspected adverse reaction' });
    await expect(modal).toBeVisible();
    await modal.getByRole('textbox', { name: 'Description' }).fill('HTEST urticaria on the forearm after 10 min');
    await modal.getByRole('combobox', { name: 'Severity' }).selectOption('mild');
    await expect(modal.getByText(/Reporting deadline: 72 h/)).toBeVisible();
    await modal.getByRole('textbox', { name: 'Action taken (optional)' }).fill('HTEST observation 30 min');
    await shot(page, '12-adr-modal');
    const resp = page.waitForResponse((r) => r.url().includes('/suspected-adr') && r.request().method() === 'POST');
    await modal.getByRole('button', { name: SAVE }).click();
    expect((await resp).status()).toBe(201);
    await expect(page.getByText('Suspected adverse reaction recorded').first()).toBeVisible();
  });

  test('7. restricted medication: not shown by name without «eMAR: View Restricted Medications»', async ({
    browser,
  }) => {
    const restrictedDrug = new RegExp(env('E2E_RESTRICTED_DRUG'), 'i');
    const admin = await browser.newContext();
    const set = await admin.request.post(`${REST}/systemsetting`, {
      headers: { Authorization: ADMIN() },
      data: { property: 'emar.restrictedMedicationConcepts', value: env('E2E_RESTRICTED_CONCEPT') },
    });
    expect([200, 201]).toContain(set.status());
    try {
      const page = await login(browser, NURSE());
      await openEmar(page);
      await expect(page.getByText('Restricted treatment').first()).toBeVisible();
      const main = page.locator('body');
      await expect(main.getByText(restrictedDrug)).toHaveCount(0);
      await shot(page, '13-restricted-masked');
      // The backend masks the history: no entry has the name and some entries are «Restricted treatment».
      const r = await page.request.get(`${FHIR}/MedicationAdministration?patient=${PATIENT()}&_count=100`, {
        headers: { Authorization: NURSE() },
      });
      const all = ((await r.json()).entry ?? []).map((e) => e.resource);
      expect(all.some((x) => x.medicationCodeableConcept?.text === 'Restricted treatment')).toBe(true);
      expect(all.some((x) => restrictedDrug.test(x.medicationReference?.display ?? ''))).toBe(false);
      // Nor does the UI show it on any page of the history.
      const next = page.getByRole('button', { name: /next page/i });
      for (let i = 0; i < 10 && (await next.isEnabled().catch(() => false)); i++) {
        await next.click();
        await expect(main.getByText(restrictedDrug)).toHaveCount(0);
      }
      await expect(main.getByText('Restricted treatment').first()).toBeVisible();
      await shot(page, '14-restricted-last-page');
    } finally {
      const del = await admin.request.delete(`${REST}/systemsetting/emar.restrictedMedicationConcepts?purge=true`, {
        headers: { Authorization: ADMIN() },
      });
      expect([200, 204]).toContain(del.status());
    }
  });
});
