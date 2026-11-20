import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [output, screenshotDirectory, playwrightModule, chrome] = process.argv.slice(2);
assert.ok(output && screenshotDirectory && playwrightModule && chrome,
  'Usage: node tools/capture-screenshots.mjs <output> <screenshots> <playwright-module> <chrome-executable>');

const require = createRequire(import.meta.url);
const { chromium } = require(resolve(playwrightModule));
const { rows } = JSON.parse(await readFile(join(output, 'board.json'), 'utf8'));
const pageURL = pathToFileURL(resolve(output, 'dashboard', 'index.html')).href;
const directory = resolve(screenshotDirectory);
assert.ok((await stat(directory)).isDirectory());

const browser = await chromium.launch({ executablePath: resolve(chrome), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 960 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(8000);
  const rejectedRequests = [];
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route(/^https?:/, route => {
    rejectedRequests.push(route.request().url());
    return route.abort();
  });

  await page.goto(pageURL);
  const table = page.getByRole('table');
  await table.waitFor();
  assert.equal(await table.locator('tbody tr').count(), rows.length);
  await page.screenshot({ path: join(directory, '1-board.png') });

  // Exercise the rendered detail calculations and compare their values and plans to board.json.
  const mismatches = await page.evaluate(expected => {
    const tableRows = document.querySelectorAll('table tbody tr');
    const number = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });
    const mismatches = [];
    for (const [index, row] of expected.entries()) {
      tableRows[index].click();
      const dialog = document.querySelector('dialog[open]');
      const explanation = Array.from(dialog.querySelectorAll('p'))
        .find(p => p.textContent.includes('The page recomputes this row'));
      const steps = Array.from(dialog.querySelectorAll('ol li'), item => item.textContent);
      const shownValue = number.format(row.implied_value_usd);
      const parity = explanation?.textContent.includes(shownValue)
        && explanation.textContent.includes('the same number board.json carries');
      if (!parity || JSON.stringify(steps) !== JSON.stringify(row.farm_steps)) {
        mismatches.push(row.slug);
      }
      dialog.close();
    }
    return mismatches;
  }, rows);
  assert.deepEqual(mismatches, [], 'Every detail must match the exported score and participation steps');

  await page.goto('about:blank');
  await page.goto(pageURL);
  await page.getByRole('row', { name: /Gauntlet/ }).first().click();
  const detail = page.getByRole('dialog', { name: 'Gauntlet', exact: true });
  await detail.getByText(/gtUSDa represents the Gauntlet USD Alpha strategy/).waitFor();
  await detail.getByText(/USDC on Base/).waitFor();
  await page.screenshot({ path: join(directory, '2-detail.png') });

  await detail.getByRole('button', { name: 'Close details' }).click();
  const category = page.getByRole('combobox', { name: 'Filter by category' });
  const selected = rows.find(row => row.slug === 'onre').category;
  await category.selectOption({ label: selected });
  const filtered = rows.filter(row => row.category === selected);
  assert.ok(filtered.length > 0 && filtered.length < rows.length);
  assert.equal(await table.locator('tbody tr').count(), filtered.length);
  await page.screenshot({ path: join(directory, '3-filtered.png') });

  assert.deepEqual(rejectedRequests, []);
  assert.deepEqual(pageErrors, []);
  console.log(`Offline dashboard verified for ${rows.length} detail rows and ${filtered.length} filtered ${selected} rows.`);
} finally {
  await browser.close();
}
