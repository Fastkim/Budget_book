/** Browser-independent accounting rules. All money is stored as integer KRW. */
export const EXPENSE_CATEGORIES = Object.freeze([
  { id: 'food', label: '식비', color: '#7656a3', icon: 'utensils' },
  { id: 'cafe', label: '카페·간식', color: '#b58daf', icon: 'coffee' },
  { id: 'shopping', label: '쇼핑', color: '#8b83b8', icon: 'shopping-bag' },
  { id: 'transport', label: '교통', color: '#b3a0ce', icon: 'bus' },
  { id: 'living', label: '생활·주거', color: '#9475aa', icon: 'home' },
  { id: 'health', label: '건강', color: '#c492b0', icon: 'heart' },
  { id: 'culture', label: '문화·여가', color: '#a18dc6', icon: 'ticket' },
  { id: 'other', label: '기타', color: '#b8b0c2', icon: 'more-horizontal' },
]);

export const INCOME_CATEGORIES = Object.freeze([
  { id: 'salary', label: '월급', color: '#8571b0', icon: 'briefcase' },
  { id: 'bonus', label: '상여금', color: '#a18bbb', icon: 'gift' },
  { id: 'side', label: '부수입', color: '#b3a2cb', icon: 'coins' },
  { id: 'allowance', label: '용돈', color: '#bc9ab8', icon: 'wallet' },
  { id: 'other-income', label: '기타 수입', color: '#aaa0bd', icon: 'plus-circle' },
]);

export const PAYMENTS = Object.freeze([
  { id: 'card', label: '카드' },
  { id: 'cash', label: '현금' },
  { id: 'transfer', label: '계좌이체' },
]);

const MAX_AMOUNT = 999_999_999_999;
const MAX_BACKUP_ENTRIES = 100_000;
const pad = (value, size = 2) => String(value).padStart(size, '0');
const isLeapYear = (year) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
const daysInMonth = (year, month) => [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];

/** Parse only explicit integer won amounts; never reinterpret invalid symbols. */
export function parseAmount(value) {
  const message = '금액은 1원부터 999,999,999,999원까지 정수로 입력해 주세요.';
  if (typeof value !== 'string') throw new Error(message);
  const text = value.trim();
  if (!/^(?:[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/.test(text)) throw new Error(message);
  const amount = Number(text.replaceAll(',', ''));
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) throw new Error(message);
  return amount;
}

export function localDate(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error('날짜를 확인해 주세요.');
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function monthKey(dateString) {
  if (!validDate(dateString)) throw new Error('올바른 날짜를 입력해 주세요.');
  return dateString.slice(0, 7);
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return year >= 1900 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function validId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}

/** Validate without coercion, so malformed backup values cannot silently change. */
export function validateEntry(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('기록 형식을 확인해 주세요.');
  if (input.id !== undefined && !validId(input.id)) throw new Error('기록 ID가 올바르지 않습니다.');
  if (input.type !== 'expense' && input.type !== 'income') throw new Error('수입 또는 지출을 선택해 주세요.');
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > MAX_AMOUNT) {
    throw new Error('금액은 1원부터 999,999,999,999원까지 정수로 입력해 주세요.');
  }
  if (!validDate(input.date)) throw new Error('올바른 날짜를 입력해 주세요.');
  const categories = input.type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  if (!categories.some((category) => category.id === input.category)) throw new Error('분류를 다시 선택해 주세요.');
  if (input.note !== undefined && (typeof input.note !== 'string' || input.note.length > 200)) {
    throw new Error('내용은 200자 이내로 입력해 주세요.');
  }
  if (input.payment !== undefined && !PAYMENTS.some((payment) => payment.id === input.payment)) {
    throw new Error('결제 수단을 다시 선택해 주세요.');
  }
  return true;
}

export function normalizeEntry(input) {
  validateEntry(input);
  return {
    id: input.id ?? globalThis.crypto?.randomUUID?.() ?? `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    type: input.type,
    amount: input.amount,
    date: input.date,
    category: input.category,
    note: (input.note ?? '').trim(),
    payment: input.payment ?? (input.type === 'income' ? 'transfer' : 'card'),
  };
}

function safeAdd(first, second) {
  const result = first + second;
  if (!Number.isSafeInteger(result)) throw new Error('합계가 계산 가능한 금액 범위를 초과했습니다.');
  return result;
}

function validatePeriod(period, mode) {
  if (mode !== 'month' && mode !== 'year') throw new Error('월별 또는 연별을 선택해 주세요.');
  const expression = mode === 'month' ? /^\d{4}-(0[1-9]|1[0-2])$/ : /^\d{4}$/;
  if (typeof period !== 'string' || !expression.test(period) || Number(period.slice(0, 4)) < 1900 || Number(period.slice(0, 4)) > 9999) {
    throw new Error('조회 기간을 확인해 주세요.');
  }
}

/** Include zero-spend days/months, and compare complete matching calendar periods. */
export function summarize(entries, period, mode = 'month') {
  validatePeriod(period, mode);
  if (!Array.isArray(entries)) throw new Error('기록 목록을 확인해 주세요.');
  const year = Number(period.slice(0, 4));
  const month = mode === 'month' ? Number(period.slice(5, 7)) : null;
  const now = new Date();
  const currentDate = localDate(now);
  const currentPeriod = mode === 'month' ? currentDate.slice(0, 7) : currentDate.slice(0, 4);
  const fullDays = mode === 'month' ? daysInMonth(year, month) : (isLeapYear(year) ? 366 : 365);
  let days = fullDays;
  if (period === currentPeriod) {
    days = mode === 'month'
      ? now.getDate()
      : Math.round((Date.parse(`${currentDate}T00:00:00Z`) - Date.parse(`${pad(year, 4)}-01-01T00:00:00Z`)) / 86_400_000) + 1;
  }
  const previousPeriod = mode === 'year'
    ? pad(year - 1, 4)
    : month === 1 ? `${pad(year - 1, 4)}-12` : `${pad(year, 4)}-${pad(month - 1)}`;
  const matches = (entry, key) => mode === 'month' ? entry.date.slice(0, 7) === key : entry.date.slice(0, 4) === key;
  const transactions = entries.filter((entry) => matches(entry, period)).slice().sort((a, b) => b.date.localeCompare(a.date));
  const series = Array.from({ length: mode === 'month' ? fullDays : 12 }, (_, index) => ({
    label: mode === 'month' ? `${index + 1}일` : `${index + 1}월`,
    key: mode === 'month' ? `${period}-${pad(index + 1)}` : `${period}-${pad(index + 1)}`,
    income: 0,
    expense: 0,
  }));
  const seriesMap = new Map(series.map((item) => [item.key, item]));
  const categoryTotals = new Map();
  let income = 0;
  let expense = 0;
  let previousExpense = 0;
  for (const entry of entries) {
    if (entry.type === 'expense' && matches(entry, previousPeriod)) previousExpense = safeAdd(previousExpense, entry.amount);
  }
  for (const entry of transactions) {
    if (entry.type === 'income') income = safeAdd(income, entry.amount);
    else {
      expense = safeAdd(expense, entry.amount);
      categoryTotals.set(entry.category, safeAdd(categoryTotals.get(entry.category) ?? 0, entry.amount));
    }
    const key = mode === 'month' ? entry.date : entry.date.slice(0, 7);
    const point = seriesMap.get(key);
    if (point) point[entry.type] = safeAdd(point[entry.type], entry.amount);
  }
  const byCategory = EXPENSE_CATEGORIES
    .map(({ id, label, color }) => ({ id, label, color, amount: categoryTotals.get(id) ?? 0, percent: expense ? ((categoryTotals.get(id) ?? 0) / expense) * 100 : 0 }))
    .filter((category) => category.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const dailyAverage = Math.round(expense / days);
  return {
    income,
    expense,
    balance: income - expense,
    average: dailyAverage,
    dailyAverage,
    transactions,
    days,
    byCategory,
    series,
    previousExpense,
    changePercent: previousExpense ? ((expense - previousExpense) / previousExpense) * 100 : null,
  };
}

/** Preview-only records. Callers must keep these separate from personal storage. */
export function getDemoEntries(anchorDate = new Date()) {
  if (!(anchorDate instanceof Date) || Number.isNaN(anchorDate.getTime())) throw new Error('날짜를 확인해 주세요.');
  const year = anchorDate.getFullYear();
  if (year < 1900 || year > 9999) throw new Error('날짜는 1900년부터 9999년까지 선택해 주세요.');
  const currentMonth = anchorDate.getMonth() + 1;
  const currentDay = anchorDate.getDate();
  const rows = [];
  const add = (targetYear, month, day, type, amount, category, note, payment = type === 'income' ? 'transfer' : 'card') => {
    rows.push(normalizeEntry({
      id: `demo-${targetYear}-${month}-${rows.length}`,
      date: `${pad(targetYear, 4)}-${pad(month)}-${pad(day)}`,
      type,
      amount,
      category,
      note,
      payment,
    }));
  };
  const months = Array.from({ length: currentMonth }, (_, index) => ({ year, month: index + 1 }));
  if (currentMonth === 1 && year > 1900) months.unshift({ year: year - 1, month: 12 });
  const foodNotes = ['점심 식사', '퇴근길 저녁', '주말 브런치', '집밥 장보기', '동료와 점심'];
  for (const target of months) {
    const active = target.year === year && target.month === currentMonth;
    const lastDay = active ? currentDay : daysInMonth(target.year, target.month);
    add(target.year, target.month, 1, 'income', 3_200_000, 'salary', '이번 달 월급');
    add(target.year, target.month, 1, 'expense', 450_000, 'living', '월세·관리비', 'transfer');
    for (let day = 1; day <= lastDay; day++) {
      if (day % 7 !== 0) add(target.year, target.month, day, 'expense', 8_500 + ((day * 1700 + target.month * 300) % 12_000), 'food', foodNotes[day % foodNotes.length]);
      if (day % 2 === 1) add(target.year, target.month, day, 'expense', 4_500 + (day % 3) * 500, 'cafe', day % 3 === 0 ? '따뜻한 라테' : '오후의 아메리카노');
      if (day % 5 === 0) add(target.year, target.month, day, 'expense', 15_000, 'transport', '교통카드 충전');
      if (day === 4) add(target.year, target.month, day, 'expense', 79_000 + (target.month % 3) * 10_000, 'shopping', '계절 옷 구매');
      if (day === 8) add(target.year, target.month, day, 'income', 180_000, 'side', '프리랜서 작업 정산');
      if (day === 10) add(target.year, target.month, day, 'expense', 24_000, 'culture', '주말 영화 관람');
      if (day === 12) add(target.year, target.month, day, 'expense', 18_500, 'health', '약국·영양제');
      if (day === 18) add(target.year, target.month, day, 'expense', 38_000, 'living', '생활용품 구매');
      if (day === 23) add(target.year, target.month, day, 'expense', 32_000, 'culture', '친구와 전시 관람');
      if (day === 25) add(target.year, target.month, day, 'income', 50_000, 'other-income', '중고 물품 판매');
    }
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

/** Parse and validate the whole file before returning anything to the caller. */
export function safeParseBackup(text) {
  if (typeof text !== 'string' || text.length > 30_000_000) throw new Error('백업 파일의 크기나 형식을 확인해 주세요.');
  let backup;
  try { backup = JSON.parse(text); }
  catch { throw new Error('올바른 JSON 백업 파일이 아닙니다.'); }
  if (!backup || typeof backup !== 'object' || Array.isArray(backup) || backup.version !== 1 || !Array.isArray(backup.entries)) {
    throw new Error('지원하지 않는 백업 형식입니다. 차곡에서 내보낸 JSON 파일을 선택해 주세요.');
  }
  if (backup.entries.length > MAX_BACKUP_ENTRIES) throw new Error('백업 기록은 100,000개까지 가져올 수 있습니다.');
  const ids = new Set();
  const entries = backup.entries.map((entry, index) => {
    try {
      if (!entry || !validId(entry.id)) throw new Error('기록 ID가 올바르지 않습니다.');
      const normalized = normalizeEntry(entry);
      if (ids.has(normalized.id)) throw new Error('중복된 기록 ID가 있습니다.');
      ids.add(normalized.id);
      return normalized;
    } catch (error) {
      throw new Error(`${index + 1}번째 기록: ${error.message}`);
    }
  });
  // Verify totals also remain exact after import, including across periods.
  entries.reduce((total, entry) => safeAdd(total, entry.amount), 0);
  return { version: 1, entries };
}
