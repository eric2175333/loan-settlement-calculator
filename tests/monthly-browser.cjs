const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    for (const width of [320, 390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8000');
      assert.equal(await page.title(), 'LoanCalc｜貸款試算工具');
      assert.equal(await page.locator('#monthly-tab').getAttribute('aria-pressed'), 'true');
      for (const id of ['mp-principal','mp-periods','mp-rate']) assert.equal(await page.locator('#'+id).inputValue(), '');
      for (const [id, value] of Object.entries({'mp-principal':'750000','mp-periods':'72','mp-rate':'5'})) await page.locator('#'+id).fill(value);
      assert.equal(await page.locator('#mp-principal').inputValue(), '750,000');
      assert.equal(await page.locator('#mp-monthly').textContent(), '12,079');
      await page.locator('#mp-principal').fill('600000');
      assert.equal(await page.locator('#mp-monthly').textContent(), '9,663');
      await page.locator('#mp-details summary').click();
      assert.equal(await page.locator('#mp-schedule tr').count(), 72);
      assert.equal(await page.locator('#mp-schedule tr').last().locator('td').last().textContent(), '0');
      await page.locator('#mp-periods').fill('36');
      assert.notEqual(await page.locator('#mp-monthly').textContent(), '9,663');
      const shorter = await page.locator('#mp-monthly').textContent();
      await page.locator('#mp-rate').fill('6');
      assert.notEqual(await page.locator('#mp-monthly').textContent(), shorter);
      await page.locator('#mp-rate').fill('0');
      assert.equal(await page.locator('#mp-interest').textContent(), 'NT$ 0');
      await page.locator('#mp-copy').click();
      await page.waitForFunction(() => document.getElementById('mp-copy-status').textContent === '已複製試算結果。');
      assert.match(await page.evaluate(() => navigator.clipboard.readText()), /分期月付款試算/);
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw Error('denied'); } } }));
      await page.locator('#mp-copy').click();
      await page.locator('#mp-fallback').waitFor({ state:'visible' });
      assert.match(await page.locator('#mp-copy-text').inputValue(), /預估總利息：NT\$ 0/);
      await page.locator('#mp-principal').fill('0');
      assert.equal(await page.locator('#mp-results').isVisible(), false);
      assert.match(await page.locator('#mp-error').textContent(), /本金/);
      await page.locator('#mp-principal').fill('600000');
      for (const periods of ['0', '1.5', '1201']) {
        await page.locator('#mp-periods').fill(periods);
        assert.match(await page.locator('#mp-error').textContent(), /總期數/);
        assert.equal(await page.locator('#mp-results').isVisible(), false);
      }
      await page.locator('#mp-periods').fill('72');
      await page.locator('#settlement-tab').click();
      for (const id of ['principal','periods','annual-rate','monthly-payment','paid-periods']) assert.equal(await page.locator('#'+id).inputValue(), '');
      assert.equal(await page.locator('#monthly-payment').getAttribute('placeholder'), null);
      await page.locator('#monthly-tab').click();
      assert.equal(await page.locator('#mp-periods').inputValue(), '72');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator('#mp-clear').click();
      for (const id of ['mp-principal','mp-periods','mp-rate']) assert.equal(await page.locator('#'+id).inputValue(), '');
      assert.equal(await page.locator('#mp-results').isVisible(), false);
      assert.deepEqual(errors, []);
      console.log(`PASS monthly browser ${width}: live updates, validation, schedule, copy, clear, mode switching, layout`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
