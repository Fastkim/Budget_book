import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPENSE_CATEGORIES, INCOME_CATEGORIES, localDate, monthKey,
  validateEntry, normalizeEntry, parseAmount, summarize, getDemoEntries, safeParseBackup,
} from '../src/ledger.js';

const expense = (overrides = {}) => ({ id: 'entry-1', type: 'expense', amount: 10_000, date: '2024-02-01', category: 'food', note: '점심', payment: 'card', ...overrides });
const income = (overrides = {}) => expense({ id: 'income-1', type: 'income', category: 'salary', payment: 'transfer', amount: 3_000_000, ...overrides });

test('normalization generates an id, trims notes, and supplies payment defaults', () => {
  const { id: omitted, payment: omittedPayment, ...input } = expense({ note: '  점심  ' });
  const entry = normalizeEntry(input);
  assert.equal(entry.note, '점심');
  assert.equal(entry.payment, 'card');
  assert.equal(typeof entry.id, 'string');
  assert.ok(entry.id.length > 0);
  assert.equal(input.note, '  점심  ');
  assert.equal(normalizeEntry({ ...income(), payment: undefined }).payment, 'transfer');
});

test('amount validation rejects zero, negative, fractional, coerced, and unsafe money', () => {
  for (const amount of [0, -1, 1.5, '10000', NaN, Infinity, Number.MAX_SAFE_INTEGER, 1_000_000_000_000]) {
    assert.throws(() => validateEntry(expense({ amount })), /금액/);
  }
  assert.equal(validateEntry(expense({ amount: 999_999_999_999 })), true);
});

test('amount parsing accepts explicit integer won amounts with optional proper grouping', () => {
  for (const value of ['1000', '1,000', ' 1,000 ']) assert.equal(parseAmount(value), 1000);
  assert.equal(parseAmount('1'), 1);
  assert.equal(parseAmount('999,999,999,999'), 999_999_999_999);
  for (const value of ['-1000', '12.5', '1e3', 'alphabet', '1,00', '1,0000', '1,,000', '1 000', '+1000', '1000원', '0', '', ' ', '1,000,000,000,000', '999999999999999999999', null, undefined, 1000]) {
    assert.throws(() => parseAmount(value), /금액/);
  }
});

test('dates validate real calendar days including leap years', () => {
  assert.equal(validateEntry(expense({ date: '2024-02-29' })), true);
  assert.equal(validateEntry(expense({ date: '2000-02-29' })), true);
  for (const date of ['2023-02-29', '1900-02-29', '2024-04-31', '2024-00-10', '2024-13-01', '2024-1-01', '0000-01-01', '2024-02-00', 'invalid']) {
    assert.throws(() => validateEntry(expense({ date })), /날짜/);
  }
  assert.equal(monthKey('2024-02-29'), '2024-02');
  assert.throws(() => monthKey('2024-02-31'), /날짜/);
  const date = new Date(2024, 0, 1, 23, 30);
  assert.equal(localDate(date), '2024-01-01');
});

test('entry dates and summary periods share the UI range of 1900 through 9999', () => {
  for (const date of ['1900-01-01', '9999-12-31']) assert.equal(validateEntry(expense({ date })), true);
  for (const date of ['0001-01-01', '1899-12-31', '10000-01-01']) {
    assert.throws(() => validateEntry(expense({ date })), /날짜/);
    assert.throws(() => monthKey(date), /날짜/);
  }
  for (const period of ['1900', '9999']) assert.equal(summarize([], period, 'year').series.length, 12);
  for (const period of ['1900-01', '9999-12']) assert.equal(summarize([], period).series.length, 31);
  for (const period of ['0001', '1899', '10000']) assert.throws(() => summarize([], period, 'year'), /기간/);
  for (const period of ['0001-01', '1899-12', '10000-01']) assert.throws(() => summarize([], period), /기간/);
  assert.ok(getDemoEntries(new Date(1900, 0, 5)).every((entry) => entry.date >= '1900-01-01'));
  assert.throws(() => getDemoEntries(new Date(1899, 11, 31)), /날짜/);
});

test('entry validation enforces category type, ids, note limits, and payment values', () => {
  assert.throws(() => normalizeEntry(expense({ category: 'salary' })), /분류/);
  assert.throws(() => normalizeEntry(income({ category: 'food' })), /분류/);
  assert.throws(() => normalizeEntry(expense({ id: '<script>' })), /ID/);
  assert.throws(() => normalizeEntry(expense({ note: 'a'.repeat(201) })), /200자/);
  assert.throws(() => normalizeEntry(expense({ payment: 'unknown' })), /결제/);
  assert.equal(new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map((entry) => entry.id)).size, EXPENSE_CATEGORIES.length + INCOME_CATEGORIES.length);
});

test('monthly aggregation includes zero days, filters dates, and keeps income separate', () => {
  const rows = [expense(), expense({ id: 'entry-2', amount: 20_000, date: '2024-02-29', category: 'cafe' }), income(), expense({ id: 'previous', date: '2024-01-31', amount: 60_000 }), expense({ id: 'next', date: '2024-03-01', amount: 900 })];
  const result = summarize(rows, '2024-02');
  assert.equal(result.expense, 30_000);
  assert.equal(result.income, 3_000_000);
  assert.equal(result.balance, 2_970_000);
  assert.equal(result.days, 29);
  assert.equal(result.dailyAverage, Math.round(30_000 / 29));
  assert.equal(result.transactions.length, 3);
  assert.equal(result.series.length, 29);
  assert.equal(result.series[1].expense, 0);
  assert.equal(result.series[28].expense, 20_000);
  assert.equal(result.series[0].income, 3_000_000);
  assert.equal(result.previousExpense, 60_000);
  assert.equal(result.changePercent, -50);
  assert.equal(result.byCategory[0].id, 'cafe');
  assert.equal(result.byCategory[0].amount, 20_000);
  assert.ok(Math.abs(result.byCategory.reduce((total, category) => total + category.percent, 0) - 100) < 0.000001);
  assert.equal(rows[0].id, 'entry-1');
});

test('January comparisons cross year boundaries', () => {
  const result = summarize([expense({ date: '2024-12-31', amount: 20_000 }), expense({ id: 'january', date: '2025-01-01', amount: 30_000 })], '2025-01');
  assert.equal(result.expense, 30_000);
  assert.equal(result.previousExpense, 20_000);
  assert.equal(result.changePercent, 50);
});

test('annual aggregation has 12 complete buckets and compares the previous calendar year', () => {
  const result = summarize([expense({ date: '2024-01-01' }), expense({ id: 'dec', date: '2024-12-31', amount: 20_000 }), income({ date: '2024-05-01' }), expense({ id: 'prev', date: '2023-12-31', amount: 15_000 }), expense({ id: 'later', date: '2025-01-01' })], '2024', 'year');
  assert.equal(result.days, 366);
  assert.equal(result.expense, 30_000);
  assert.equal(result.series.length, 12);
  assert.equal(result.series[0].key, '2024-01');
  assert.equal(result.series[11].expense, 20_000);
  assert.equal(result.series[4].income, 3_000_000);
  assert.equal(result.previousExpense, 15_000);
  assert.equal(result.changePercent, 100);
});

test('current-month and current-year averages use elapsed local calendar days', () => {
  const today = new Date();
  const key = localDate(today);
  const monthResult = summarize([expense({ date: key, amount: 30_000 })], key.slice(0, 7));
  assert.equal(monthResult.days, today.getDate());
  assert.equal(monthResult.average, Math.round(30_000 / today.getDate()));
  const yearResult = summarize([], key.slice(0, 4), 'year');
  const ordinal = Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${key.slice(0, 4)}-01-01T00:00:00Z`)) / 86_400_000) + 1;
  assert.equal(yearResult.days, ordinal);
});

test('empty periods remain usable and malformed periods are rejected', () => {
  const result = summarize([], '2024-02');
  assert.equal(result.expense, 0);
  assert.equal(result.dailyAverage, 0);
  assert.equal(result.changePercent, null);
  assert.deepEqual(result.byCategory, []);
  for (const [period, mode] of [['2024-13', 'month'], ['2024-00', 'month'], ['2024-1', 'month'], ['2024-02', 'week'], ['0000', 'year']]) {
    assert.throws(() => summarize([], period, mode));
  }
});

test('demo data is valid, deterministic, includes prior December, and has no future records', () => {
  const anchor = new Date(2026, 0, 5);
  const rows = getDemoEntries(anchor);
  assert.ok(rows.length > 0);
  assert.ok(rows.some((entry) => entry.date.startsWith('2025-12')));
  assert.ok(rows.some((entry) => entry.type === 'income'));
  assert.ok(rows.every((entry) => entry.date <= '2026-01-05'));
  for (const row of rows) validateEntry(row);
  assert.deepEqual(rows, getDemoEntries(anchor));
  assert.equal(new Set(rows.map((entry) => entry.id)).size, rows.length);
});

test('backup import accepts the exact supported schema without keeping foreign fields', () => {
  const result = safeParseBackup(JSON.stringify({ version: 1, exportedAt: '2024-03-01', entries: [expense({ extra: 'ignored' }), income()] }));
  assert.equal(result.version, 1);
  assert.equal(result.entries.length, 2);
  assert.equal(result.entries[0].amount, 10_000);
  assert.equal('extra' in result.entries[0], false);
});

test('backup import rejects unsupported, invalid, duplicate, and partial data atomically', () => {
  for (const text of ['invalid JSON', 'null', '[]', JSON.stringify({ version: 2, entries: [] }), JSON.stringify({ version: 1, entries: [expense(), expense()] }), JSON.stringify({ version: 1, entries: [expense(), income({ amount: -50 })] }), JSON.stringify({ version: 1, entries: [{ ...expense(), id: undefined }] })]) {
    assert.throws(() => safeParseBackup(text));
  }
  const original = [expense()];
  assert.throws(() => safeParseBackup(JSON.stringify({ version: 1, entries: [...original, income({ date: '2023-02-29' })] })));
  assert.equal(original.length, 1);
  assert.equal(original[0].amount, 10_000);
});
