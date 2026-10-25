// Optional browser verification: install Playwright separately; not required by the website.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 740 }, { width: 1440, height: 1000 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8000', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: '開始試算' }).click();
      await page.locator('#results').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#missing').textContent(), '8 期');
      assert.equal(await page.locator('#schedule-body tr').count(), 72);
      await page.locator('summary').click();
      assert.equal(await page.locator('#schedule-body tr').last().locator('td').last().textContent(), '0');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no page horizontal overflow');
      const expected = require('../script.js');
      for (const paid of [0, 8, 12, 19, 20, 21, 72]) {
        await page.locator('#paid-periods').fill(String(paid));
        assert.equal(await page.locator('#results').isVisible(), false, 'stale results hidden');
        await page.getByRole('button', { name: '開始試算' }).click();
        const result = expected.calculateLoan({ principal: 600000, periods: 72, annualRate: 5, paidPeriods: paid });
        assert.equal(await page.locator('#settlement').textContent(), expected.formatMoney(result.settlement));
      }
      // Bidirectional input, authoritative source, validation and stale-derived-field cleanup.
      await page.locator('#monthly-payment').fill('12079');
      const inferred = Number(await page.locator('#annual-rate').inputValue());
      assert.ok(inferred > 0 && inferred < 100);
      await page.locator('#paid-periods').fill('12');
      await page.getByRole('button', { name: '開始試算' }).click();
      assert.equal(await page.locator('#monthly').textContent(), 'NT$ 12,079');
      await page.locator('#principal').fill('700000');
      assert.equal(await page.locator('#monthly-payment').inputValue(), '12079');
      assert.notEqual(Number(await page.locator('#annual-rate').inputValue()), inferred);
      await page.locator('#monthly-payment').fill('1');
      assert.equal(await page.locator('#annual-rate').inputValue(), '');
      await page.getByRole('button', { name: '開始試算' }).click();
      assert.match(await page.locator('#form-error').textContent(), /月付款低於/);
      await page.locator('#monthly-payment').fill('');
      await page.getByRole('button', { name: '開始試算' }).click();
      assert.match(await page.locator('#form-error').textContent(), /擇一填寫/);
      await page.locator('#principal').fill('600000');
      await page.locator('#annual-rate').fill('5');
      assert.equal(await page.locator('#monthly-payment').inputValue(), '9663');
      await page.getByRole('button', { name: '開始試算' }).click();
      assert.equal(await page.locator('#settlement').textContent(), '541,758');
      await page.locator('#paid-periods').fill('72');
      await page.getByRole('button', { name: '開始試算' }).click();
      // Force denied Clipboard API to verify the manual-copy fallback.
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } }));
      await page.getByRole('button', { name: '複製試算結果' }).click();
      await page.locator('#copy-fallback').waitFor({ state: 'visible' });
      assert.match(await page.locator('#copy-text').inputValue(), /預估結清總金額：NT\$ 0/);
      await page.getByRole('button', { name: '重新計算' }).click();
      assert.equal(await page.locator('#results').isVisible(), false);
      assert.equal(await page.locator('#principal').inputValue(), '600000');
      await page.locator('#paid-periods').fill('73');
      await page.getByRole('button', { name: '開始試算' }).click();
      assert.match(await page.locator('#form-error').textContent(), /已繳期數/);
      await page.locator('#principal').fill('');
      await page.getByRole('button', { name: '開始試算' }).click();
      assert.match(await page.locator('#form-error').textContent(), /不能留白/);
      await page.locator('#principal').fill('100');
      await page.locator('#periods').fill('3');
      await page.locator('#annual-rate').fill('0');
      await page.locator('#paid-periods').fill('0');
      await page.getByRole('button', { name: '開始試算' }).click();
      assert.equal(await page.locator('#settlement').textContent(), '100');
      assert.match(await page.locator('#result-note').textContent(), /不足 20 期/);
      assert.deepEqual(errors, []);
      console.log(`PASS browser ${viewport.width}×${viewport.height}: calculation, table, validation, reset, copy fallback, layout`);
      await context.close();
    }
    // Clipboard success path via supported browser permission.
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8000');
    await page.getByRole('button', { name: '開始試算' }).click();
    await page.getByRole('button', { name: '複製試算結果' }).click();
    await page.waitForFunction(() => document.getElementById('copy-status').textContent === '已複製試算結果。');
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /貸款結清試算工具/);
    console.log('PASS clipboard write and read');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
