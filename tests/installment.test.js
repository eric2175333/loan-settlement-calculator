const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculateInstallment, ceilMoney } = require('../script.js');
for (const [principal, expected] of [[750000, 12079], [600000, 9663]]) {
  test(`月付款：本金 ${principal}、72 期、5% → ${expected}`, () => {
    const result = calculateInstallment({ principal, periods: 72, annualRate: 5 });
    assert.equal(ceilMoney(result.monthly), expected);
    assert.equal(result.schedule.length, 72);
    assert.ok(Math.abs(result.schedule.at(-1).balance) < 1e-8);
    assert.ok(Math.abs(result.totalPayment - principal - result.totalInterest) < 1e-6);
    assert.ok(Math.abs(result.totalPayment - result.monthly * 72) < 1e-6);
  });
}
test('零利率保留精度，總額不以進位月付款累加', () => {
  const result = calculateInstallment({ principal: 100, periods: 3, annualRate: 0 });
  assert.equal(ceilMoney(result.monthly), 34);
  assert.equal(ceilMoney(result.totalPayment), 100);
  assert.equal(result.totalInterest, 0);
});
test('期數及利率影響月付款', () => {
  const run = (periods, annualRate) => calculateInstallment({ principal: 600000, periods, annualRate }).monthly;
  assert.ok(run(36, 5) > run(72, 5));
  assert.ok(run(72, 6) > run(72, 5));
});
test('拒絕零本金與不合法期數、利率', () => {
  for (const invalid of [{principal:0}, {periods:0}, {periods:1.5}, {periods:1201}, {annualRate:-1}, {annualRate:NaN}]) {
    assert.throws(() => calculateInstallment({principal:600000,periods:72,annualRate:5,...invalid}));
  }
});
