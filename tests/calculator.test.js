'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculateLoan, ceilMoney, formatMoney } = require('../script.js');
const base = { principal: 600000, periods: 72, annualRate: 5 };
function near(a, b, tolerance = 0.00001) { assert.ok(Math.abs(a - b) < tolerance, `${a} ≈ ${b}`); }
// Independent discounted-cash-flow reference: outstanding balance = PV of future monthly payments.
const r = 0.05 / 12;
const discountSum = count => Array.from({ length: count }, (_, i) => (1 + r) ** -(i + 1)).reduce((a, b) => a + b, 0);
const referenceMonthly = base.principal / discountSum(base.periods);
for (const paidPeriods of [0, 8, 12, 19, 20, 21, 72]) {
  test(`已繳 ${paidPeriods} 期：補款、剩餘本金、3% 與結清總額`, () => {
    const result = calculateLoan({ ...base, paidPeriods });
    const target = Math.max(paidPeriods, 20);
    const balance = referenceMonthly * discountSum(72 - target);
    const expected = referenceMonthly * Math.max(20 - paidPeriods, 0) + balance * 1.03;
    near(result.monthly, referenceMonthly);
    assert.equal(result.missing, Math.max(20 - paidPeriods, 0));
    near(result.remainingPrincipal, balance);
    near(result.fee, balance * 0.03);
    near(result.settlement, expected);
    assert.equal(ceilMoney(result.settlement), Math.ceil(expected));
  });
}
test('完整攤還表：72 期、每期恆等關係、本金總和與期末零餘額', () => {
  const result = calculateLoan({ ...base, paidPeriods: 12 });
  assert.equal(result.schedule.length, 72);
  let previous = base.principal;
  for (const row of result.schedule) {
    near(row.interest, previous * r);
    near(row.principal + row.interest, row.payment);
    near(previous - row.principal, row.balance);
    near(row.payment, referenceMonthly);
    assert.ok(row.balance >= 0 && row.balance <= previous);
    previous = row.balance;
  }
  near(result.schedule.reduce((sum, row) => sum + row.principal, 0), base.principal);
  assert.equal(result.schedule.at(-1).balance, 0);
});
test('零利率與延後進位：本金 100、總期數 3、已繳 0 期總額為 100 而非 102', () => {
  const result = calculateLoan({ principal: 100, periods: 3, annualRate: 0, paidPeriods: 0 });
  near(result.monthly, 100 / 3);
  assert.equal(ceilMoney(result.monthly), 34);
  assert.equal(ceilMoney(result.settlement), 100);
  assert.equal(result.missing, 3);
  assert.equal(result.fee, 0);
});
test('不足 20 期：補至期末，不收本金加計費用', () => {
  const result = calculateLoan({ ...base, periods: 12, paidPeriods: 8 });
  assert.equal(result.targetPeriod, 12);
  assert.equal(result.missing, 4);
  assert.equal(result.remainingPrincipal, 0);
  assert.equal(result.fee, 0);
  near(result.settlement, result.monthly * 4);
});
test('20 期合約、單期合約及全繳清', () => {
  for (const periods of [1, 12, 20, 72, 1200]) {
    const result = calculateLoan({ ...base, periods, paidPeriods: periods });
    assert.equal(result.settlement, 0);
    assert.equal(result.missing, 0);
    assert.equal(result.remainingPrincipal, 0);
  }
});
test('利率接近零仍保持穩定', () => {
  const result = calculateLoan({ ...base, annualRate: 1e-12, paidPeriods: 12 });
  near(result.monthly, base.principal / 72);
  assert.ok(Number.isFinite(result.settlement));
});
test('進位與千分位格式，消除浮點整數邊界雜訊', () => {
  assert.equal(ceilMoney(100.000001), 101);
  assert.equal(ceilMoney(100 + Number.EPSILON * 100), 100);
  assert.equal(ceilMoney(0), 0);
  assert.equal(formatMoney(1234567.01), '1,234,568');
});
test('拒絕超繳、負值、小數期數、非數字、無限值與超限數值', () => {
  for (const patch of [{ paidPeriods: 73 }, { paidPeriods: -1 }, { paidPeriods: 1.5 }, { principal: 0 }, { principal: 1.5 }, { principal: NaN }, { principal: Infinity }, { principal: 1e12 + 1 }, { periods: 0 }, { periods: 12.5 }, { periods: 1201 }, { annualRate: -1 }, { annualRate: 101 }, { annualRate: NaN }]) {
    assert.throws(() => calculateLoan({ ...base, paidPeriods: 12, ...patch }));
  }
});

test('年利率與月付款雙向換算：零利率、一般利率及上限', () => {
  const { inferAnnualRate, monthlyPayment } = require('../script.js');
  for (const annualRate of [0, 0.01, 5, 15, 100]) {
    const payment = monthlyPayment(600000, 72, annualRate);
    near(inferAnnualRate(600000, 72, payment), annualRate, 1e-9);
  }
});
test('月付款 12079 反推利率後維持原始月付款精度', () => {
  const result = calculateLoan({ principal: 600000, periods: 72, paidPeriods: 12, monthlyPayment: 12079 });
  assert.equal(result.monthly, 12079);
  assert.ok(result.annualRate > 0 && result.annualRate < 100);
  const rate = result.annualRate / 1200;
  const pv = Array.from({ length: 72 }, (_, i) => 12079 / (1 + rate) ** (i + 1)).reduce((a, b) => a + b, 0);
  near(pv, 600000);
  near(result.schedule.at(-1).payment, 12079);
});
test('月付款模式不因反推年利率顯示精度而改變結清金額', () => {
  const { monthlyPayment } = require('../script.js');
  for (const paidPeriods of [0, 8, 12, 19, 20, 21, 72]) {
    const expected = calculateLoan({ ...base, paidPeriods });
    const actual = calculateLoan({ principal: base.principal, periods: base.periods, paidPeriods, monthlyPayment: monthlyPayment(base.principal, base.periods, base.annualRate) });
    near(actual.settlement, expected.settlement);
    assert.equal(ceilMoney(actual.settlement), ceilMoney(expected.settlement));
  }
});
test('月付款反推拒絕不足攤還、零、負值、非數字及超過利率上限', () => {
  const { inferAnnualRate, monthlyPayment } = require('../script.js');
  for (const payment of [0, -1, NaN, Infinity, 1000, monthlyPayment(600000, 72, 100) + 1]) {
    assert.throws(() => inferAnnualRate(600000, 72, payment));
  }
});
