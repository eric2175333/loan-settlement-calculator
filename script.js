(function (root) {
  'use strict';
  const BINDING_PERIODS = 20;
  function validate({ principal, periods, annualRate, paidPeriods }) {
    if (!Number.isFinite(principal) || !Number.isInteger(principal) || principal < 1 || principal > 1e12) throw new Error('貸款本金請輸入 1 至 1,000,000,000,000 元的整數。');
    if (!Number.isInteger(periods) || periods < 1 || periods > 1200) throw new Error('貸款總期數請輸入 1 至 1,200 期的整數。');
    if (!Number.isFinite(annualRate) || annualRate < 0 || annualRate > 100) throw new Error('年利率請輸入 0 至 100 之間的數字。');
    if (!Number.isInteger(paidPeriods) || paidPeriods < 0 || paidPeriods > periods) throw new Error('已繳期數須為 0 至貸款總期數之間的整數。');
  }
  function monthlyPayment(principal, periods, annualRate) {
    const rate = annualRate / 1200;
    return rate === 0 ? principal / periods : principal * rate / -Math.expm1(-periods * Math.log1p(rate));
  }
  function inferAnnualRate(principal, periods, payment) {
    validate({ principal, periods, annualRate: 0, paidPeriods: 0 });
    if (!Number.isFinite(payment) || payment <= 0) throw new Error('月付款請輸入大於 0 的有效金額。');
    const minimum = principal / periods;
    if (payment < minimum) throw new Error('月付款低於本金 ÷ 總期數，無法以非負年利率攤還。');
    if (payment === minimum) return 0;
    if (payment > monthlyPayment(principal, periods, 100)) throw new Error('此月付款反推年利率超過 100%，請確認本金、期數與月付款。');
    let low = 0, high = 100;
    for (let i = 0; i < 100; i++) {
      const mid = (low + high) / 2;
      if (monthlyPayment(principal, periods, mid) < payment) low = mid;
      else high = mid;
    }
    return (low + high) / 2;
  }
  function calculateLoan(input) {
    if (input.monthlyPayment != null) input = { ...input, annualRate: inferAnnualRate(input.principal, input.periods, input.monthlyPayment) };
    validate(input);
    const { principal, periods, annualRate, paidPeriods } = input;
    const rate = annualRate / 1200;
    // log1p / expm1 avoid cancellation for very small nonzero interest rates.
    const monthly = input.monthlyPayment ?? monthlyPayment(principal, periods, annualRate);
    const schedule = [];
    let balance = principal;
    for (let period = 1; period <= periods; period++) {
      const interest = balance * rate;
      const principalPart = period === periods ? balance : Math.min(balance, Math.max(0, monthly - interest));
      balance = period === periods ? 0 : Math.max(0, balance - principalPart);
      schedule.push({ period, payment: principalPart + interest, principal: principalPart, interest, balance });
    }
    const targetPeriod = Math.max(paidPeriods, Math.min(BINDING_PERIODS, periods));
    const missing = targetPeriod - paidPeriods;
    const remainingPrincipal = targetPeriod === 0 ? principal : schedule[targetPeriod - 1].balance;
    const catchUp = monthly * missing;
    const fee = remainingPrincipal * 0.03;
    const settlement = paidPeriods === periods ? 0 : catchUp + remainingPrincipal * 1.03;
    return { ...input, monthly, schedule, targetPeriod, missing, remainingPrincipal, catchUp, fee, settlement };
  }
  function ceilMoney(value) {
    // Only normalize floating-point noise at an integer boundary; no intermediate monetary rounding.
    const nearest = Math.round(value);
    return Math.abs(value - nearest) <= Number.EPSILON * Math.max(1, Math.abs(value)) * 8 ? nearest : Math.ceil(value);
  }
  const formatMoney = value => new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 }).format(ceilMoney(value));
  const api = { calculateLoan, inferAnnualRate, monthlyPayment, ceilMoney, formatMoney };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LoanCalculator = api;
  if (typeof document === 'undefined') return;
  const $ = id => document.getElementById(id);
  const form = $('loan-form');
  const fields = ['principal', 'periods', 'annual-rate', 'monthly-payment', 'paid-periods'];
  let source = 'annual-rate';
  let current = null;
  const money = value => `NT$ ${formatMoney(value)}`;
  function summary(result) {
    return ['貸款結清試算工具', `貸款本金：${money(result.principal)}`, `貸款總期數：${result.periods} 期`, `年利率：${Number(result.annualRate.toFixed(8))}%${result.monthlyPayment != null ? '（依月付款反推）' : ''}`, `已繳期數：${result.paidPeriods} 期`, `每月應繳金額：${money(result.monthly)}`, `需補足期數：${result.missing} 期`, `第 ${result.targetPeriod} 期後剩餘本金：${money(result.remainingPrincipal)}`, `補足月付款合計：${money(result.catchUp)}`, `剩餘本金加計 3%：${money(result.fee)}`, `預估結清總金額：${money(result.settlement)}`, $('result-note').textContent, '各金額以未進位值計算，最後顯示時無條件進位。', '本工具僅供提前結清金額初步試算，不代表任何金融機構正式結清報價。實際金額仍應依貸款契約、繳款紀錄及金融機構結清明細為準。'].join('\n');
  }
  function clearResult() {
    current = null;
    $('results').hidden = true;
    $('empty-state').hidden = false;
    $('copy-status').textContent = '';
    $('copy-fallback').hidden = true;
    $('copy-text').value = '';
  }
  function syncTerms() {
    const derived = source === 'annual-rate' ? 'monthly-payment' : 'annual-rate';
    $(derived).value = '';
    $('rate-sync').textContent = '';
    if ($('principal').value === '' || $('periods').value === '' || $(source).value === '') return;
    try {
      const principal = Number($('principal').value), periods = Number($('periods').value);
      if (source === 'annual-rate') {
        const annualRate = Number($('annual-rate').value);
        validate({ principal, periods, annualRate, paidPeriods: 0 });
        $('monthly-payment').value = String(ceilMoney(monthlyPayment(principal, periods, annualRate)));
        $('rate-sync').textContent = '月付款由年利率自動計算並進位顯示；試算仍保留未進位精度。';
      } else {
        const annualRate = inferAnnualRate(principal, periods, Number($('monthly-payment').value));
        $('annual-rate').value = String(Number(annualRate.toFixed(8)));
        $('rate-sync').textContent = '年利率由月付款反推（顯示至小數第 8 位）；試算使用原始月付款與完整精度年利率。';
      }
    } catch (error) { $('rate-sync').textContent = error.message; }
  }
  form.addEventListener('input', event => {
    clearResult();
    $('form-error').hidden = true;
    fields.forEach(id => $(id).removeAttribute('aria-invalid'));
    if (['annual-rate', 'monthly-payment'].includes(event.target.id)) source = event.target.id;
    if (['principal', 'periods', 'annual-rate', 'monthly-payment'].includes(event.target.id)) syncTerms();
  });
  syncTerms();
  form.addEventListener('submit', event => {
    event.preventDefault();
    clearResult();
    try {
      for (const id of ['principal', 'periods', 'paid-periods']) {
        if ($(id).value.trim() === '') { $(id).setAttribute('aria-invalid', 'true'); $(id).focus(); throw new Error('本金、總期數及已繳期數不能留白。'); }
      }
      if ($(source).value.trim() === '') throw new Error('月付款或年利率請擇一填寫，不能留白。');
      const input = { principal: Number($('principal').value), periods: Number($('periods').value), paidPeriods: Number($('paid-periods').value) };
      if (source === 'monthly-payment') input.monthlyPayment = Number($('monthly-payment').value);
      else input.annualRate = Number($('annual-rate').value);
      current = calculateLoan(input);
      syncTerms();
      $('form-error').hidden = true;
      $('settlement').textContent = formatMoney(current.settlement);
      $('monthly').textContent = money(current.monthly);
      $('missing').textContent = `${current.missing} 期`;
      $('balance-label').textContent = `第 ${current.targetPeriod} 期後剩餘本金`;
      $('balance').textContent = money(current.remainingPrincipal);
      $('catch-up').textContent = money(current.catchUp);
      $('fee').textContent = money(current.fee);
      $('result-note').textContent = current.paidPeriods === current.periods ? '貸款已全部繳清，無需補足期數，預估結清金額為 0 元。' : current.periods < 20 ? `合約共 ${current.periods} 期，不足 20 期，僅補足至第 ${current.periods} 期；期末剩餘本金為 0，故不另加計 3%。` : current.missing > 0 ? `尚未滿 20 期：補足 ${current.missing} 期未進位月付款，再加上第 20 期後剩餘本金 × 1.03。` : `已達綁約期數：以第 ${current.paidPeriods} 期後剩餘本金 × 1.03 計算。`;
      const fragment = document.createDocumentFragment();
      for (const row of current.schedule) {
        const tr = document.createElement('tr');
        if (row.period <= current.paidPeriods) tr.className = 'paid';
        if (row.period === current.targetPeriod) tr.className = 'target';
        for (const value of [String(row.period), formatMoney(row.payment), formatMoney(row.principal), formatMoney(row.interest), formatMoney(row.balance)]) {
          const td = document.createElement('td'); td.textContent = value; tr.appendChild(td);
        }
        fragment.appendChild(tr);
      }
      $('schedule-body').replaceChildren(fragment);
      $('schedule-details').open = false;
      $('empty-state').hidden = true;
      $('results').hidden = false;
      $('result-title').focus({ preventScroll: true });
      $('result-title').scrollIntoView({ behavior: 'auto', block: 'start' });
    } catch (error) {
      $('form-error').textContent = error.message;
      $('form-error').hidden = false;
    }
  });
  $('copy-button').addEventListener('click', async () => {
    if (!current) return;
    const resultAtClick = current;
    const text = summary(current);
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      if (current === resultAtClick) $('copy-status').textContent = '已複製試算結果。';
    } catch (_) {
      if (current !== resultAtClick) return;
      $('copy-fallback').hidden = false;
      $('copy-text').value = text;
      $('copy-text').focus();
      $('copy-text').select();
      $('copy-status').textContent = '請手動複製下方結果。';
    }
  });
  $('reset-button').addEventListener('click', () => {
    clearResult();
    $('principal').focus();
    $('principal').scrollIntoView({ behavior: 'auto', block: 'center' });
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
