// End-to-end smoke test of the main user journeys in Demo Mode.
// Usage: npm run build && npx vite preview --port 4173  (in another terminal)  then  node scripts/e2e.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.E2E_URL ?? 'http://localhost:4173/';
const out = process.argv[2] ?? 'e2e-shots';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
const step = async (name, fn) => {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (e) { console.log(`✗ ${name}\n   ${e.message.split('\n')[0]}`); await page.screenshot({ path: `${out}/FAIL-${name.replace(/\W+/g, '_')}.png` }); process.exitCode = 1; }
};
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const text = (t) => page.getByText(t, { exact: false }).first();

await step('splash → login screen', async () => { await page.goto(URL); await text('Explore Demo').waitFor(); await shot('01-login'); });
await step('demo login → dashboard stats', async () => {
  await page.getByRole('button', { name: 'Explore Demo' }).click();
  await text('Cities saved').waitFor();
  await page.waitForFunction(() => document.body.innerText.includes('Synced'), null, { timeout: 15000 });
  await shot('02-dashboard');
});
await step('cities list incl. city shared by colleague', async () => {
  await page.getByRole('link', { name: 'Cities' }).first().click();
  await text('Pune').waitFor();
  if ((await page.locator('a[href^="#/cities/"]').count()) !== 7) throw new Error('expected 7 cities');
  await shot('03-cities');
});
await step('search + filter', async () => {
  await page.getByPlaceholder('Search cities…').fill('dub');
  await page.waitForFunction(() => document.querySelectorAll('a[href^="#/cities/"]').length === 1);
  await page.getByPlaceholder('Search cities…').fill('');
  await page.getByLabel('Filter by country').selectOption('India');
  await page.waitForFunction(() => document.querySelectorAll('a[href^="#/cities/"]').length === 4);
  await page.getByLabel('Filter by country').selectOption('');
});
await step('city detail tabs', async () => {
  await page.locator('a[href="#/cities/demo-mumbai"]').click();
  await text('Financial capital').waitFor();
  await page.getByRole('button', { name: /^Food/ }).click();
  await text('Trishna').waitFor();
  await page.getByRole('button', { name: /^Visit History/ }).click();
  await text('Client meetings').waitFor();
  await shot('04-city-detail');
});
await step('create entry', async () => {
  await page.getByRole('button', { name: /^Business Leads/ }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByPlaceholder('e.g. Acme Corp, procurement head').fill('E2E Test Lead');
  await page.getByLabel('Email address').fill('not-an-email');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await text('Invalid email address').waitFor(); // validation
  await page.getByLabel('Email address').fill('lead@example.com');
  await page.getByLabel('Phone number').fill('+91 99999 00000');
  await page.locator('input[placeholder="client, follow-up…"]').fill('e2e,');
  await page.locator('input[type=file]').setInputFiles('public/icon-512.png');
  await text('New').waitFor();
  await shot('05-entry-form');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await page.getByRole('heading', { name: 'E2E Test Lead' }).waitFor();
  await shot('06-entry-detail');
});
await step('edit entry', async () => {
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByPlaceholder('e.g. Acme Corp, procurement head').fill('E2E Test Lead (edited)');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('heading', { name: 'E2E Test Lead (edited)' }).waitFor();
});
await step('delete entry', async () => {
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await text('Entry deleted').waitFor();
});
await step('add city (with duplicate warning)', async () => {
  await page.goto(`${URL}#/cities?new=1`);
  await page.getByPlaceholder('e.g. Mumbai').fill('Mumbai');
  await page.getByPlaceholder('Maharashtra').fill('Maharashtra');
  await page.getByPlaceholder('India').fill('India');
  await page.getByRole('button', { name: 'Add city' }).last().click();
  await text('Duplicate city').waitFor();
  await page.getByRole('button', { name: 'Cancel' }).last().click();
  await page.getByPlaceholder('e.g. Mumbai').fill('Jaipur');
  await page.getByPlaceholder('Maharashtra').fill('Rajasthan');
  await page.getByRole('button', { name: 'Add city' }).last().click();
  await text('City added').waitFor();
  await page.locator('a[href^="#/cities/"]', { hasText: 'Jaipur' }).waitFor();
});
await step('custom category', async () => {
  await page.goto(`${URL}#/categories`);
  await page.getByRole('button', { name: 'New category' }).click();
  await page.getByPlaceholder('e.g. Coworking Spaces').fill('Coworking Spaces');
  await page.getByLabel('coffee').click();
  await page.getByRole('button', { name: 'Save' }).click();
  await text('Category created').waitFor();
  await shot('07-categories');
});
await step('offline create → pending → online sync', async () => {
  await page.goto(`${URL}#/settings`);
  await page.getByRole('switch').nth(2).click(); // Simulate offline
  await text("You're offline").waitFor();
  await page.goto(`${URL}#/entry/new?city=demo-dubai&category=food`);
  await page.getByPlaceholder('e.g. Acme Corp, procurement head').fill('Offline Shawarma Spot');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await page.getByRole('heading', { name: 'Offline Shawarma Spot' }).waitFor();
  await text('Pending sync').waitFor();
  await shot('08-offline-pending');
  await page.goto(`${URL}#/settings`);
  await page.getByRole('switch').nth(2).click();
  await page.waitForFunction(() => !document.body.innerText.includes("You're offline"));
  await page.locator('aside').getByText('Synced', { exact: true }).waitFor({ timeout: 15000 });
  await shot('09-settings-synced');
});
await step('conflict from another device', async () => {
  // Edit an entry locally while offline, edit the same entry "on another device", then reconnect.
  await page.getByRole('switch').nth(2).click();
  await page.getByRole('button', { name: 'Simulate edit from another device' }).click();
  const toastText = await text('was edited on another device').innerText();
  const title = toastText.match(/"(.+)"/)[1];
  await page.goto(`${URL}#/cities`);
  // Find the edited entry by walking the city tabs.
  for (const href of await page.locator('a[href^="#/cities/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')))) {
    await page.goto(`${URL}${href}`);
    const tabs = ['Business Leads', 'Food', 'Shops', 'Must Visit', 'Contacts', 'Notes & More'];
    let found = false;
    for (const t of tabs) {
      await page.getByRole('button', { name: new RegExp(`^${t}`) }).first().click();
      if (await page.getByRole('heading', { name: title, exact: true }).count()) { await page.getByRole('heading', { name: title, exact: true }).click(); found = true; break; }
    }
    if (found) break;
  }
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByPlaceholder('What matters, next steps, personal observations…').fill('Local offline edit');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.goto(`${URL}#/settings`);
  await page.getByRole('switch').nth(2).click();
  await text('Needs your review').waitFor({ timeout: 15000 });
  await shot('10-conflict');
  await page.getByRole('button', { name: 'Keep mine' }).click();
  await page.waitForFunction(() => !document.body.innerText.includes('Needs your review'), null, { timeout: 15000 });
});
await step('share city', async () => {
  await page.goto(`${URL}#/cities/demo-london`);
  await page.getByLabel('More actions').click();
  await page.getByRole('button', { name: /^Share/ }).click();
  await page.getByPlaceholder('colleague@company.com').fill('rahul@tripvault.app');
  await page.getByRole('dialog').getByRole('button', { name: 'Share' }).click();
  await text('Shared with rahul@tripvault.app').waitFor({ timeout: 15000 });
  await page.keyboard.press('Escape');
});
await step('export PDF', async () => {
  await page.goto(`${URL}#/export?city=demo-mumbai`);
  await page.getByRole('button', { name: /Generate PDF/ }).click();
  await text('PDF ready').waitFor({ timeout: 30000 });
  await page.locator('iframe[title="PDF preview"]').waitFor();
  const size = await text('.pdf ·').innerText();
  console.log(`   ${size}`);
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  await (await dl).saveAs(`${out}/city.pdf`);
  await shot('11-export');
});
await step('reload keeps session + data', async () => {
  await page.goto(`${URL}#/cities`);
  await page.reload();
  await page.locator('a[href^="#/cities/"]', { hasText: 'Jaipur' }).waitFor();
});
await step('mobile + dark mode', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${URL}#/`);
  await text('Cities saved').waitFor();
  await shot('12-mobile-dashboard');
  await page.goto(`${URL}#/cities/demo-bengaluru`);
  await text('Tech hub').waitFor();
  await shot('13-mobile-city');
  await page.goto(`${URL}#/settings`);
  await page.getByRole('button', { name: 'Dark' }).click();
  await page.goto(`${URL}#/`);
  await shot('14-mobile-dark');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error('horizontal overflow on mobile');
});
await step('reset demo', async () => {
  await page.goto(`${URL}#/settings`);
  await page.getByRole('button', { name: 'Reset demo data' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset' }).click();
  await text('Demo data reset').waitFor({ timeout: 15000 });
  await page.goto(`${URL}#/cities`);
  await text('Mumbai').waitFor();
  if (await page.locator('a[href^="#/cities/"]', { hasText: 'Jaipur' }).count()) throw new Error('Jaipur should be gone after reset');
});
await step('logout', async () => {
  await page.goto(`${URL}#/settings`);
  await page.getByRole('button', { name: 'Log out' }).click();
  await text('Explore Demo').waitFor();
});

const relevant = errors.filter((e) => !/favicon|Failed to load resource/.test(e));
if (relevant.length) { console.log('Browser errors:\n  ' + relevant.join('\n  ')); process.exitCode = 1; }
await browser.close();
