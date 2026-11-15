import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, PAYMENTS, localDate, normalizeEntry, parseAmount, summarize, getDemoEntries, safeParseBackup } from './ledger.js?v=purple';
import { icon } from './icons.js';

const DATA_KEY = 'chagok.ledger.v1';
const DEMO_KEY = 'chagok.welcomed.v1';
const money = new Intl.NumberFormat('ko-KR');
const allCategories = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
const escape = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const won = value => `${money.format(Math.round(value))}원`;
const shortMoney = value => value >= 100000000 ? `${(value / 100000000).toFixed(1)}억` : value >= 10000 ? `${money.format(Math.round(value / 1000) / 10)}만` : money.format(value);
const category = id => allCategories.find(item => item.id === id) || { label: '기타', color: '#aca0ba', icon: 'other' };
const categoryIcon = id => icon(['food','cafe','shopping','transport','living','health','culture','salary','bonus','side','allowance'].includes(id) ? id : 'other');
const today = () => localDate();
let entries = [];
let storageError = '';
let demo = false;
try {
  const saved = localStorage.getItem(DATA_KEY);
  if (saved) entries = safeParseBackup(saved).entries;
  demo = !saved && localStorage.getItem(DEMO_KEY) !== 'true';
} catch (error) {
  storageError = '저장된 기록을 불러오지 못했어요. 원래 데이터를 덮어쓰지 않도록 저장을 멈췄어요. 데이터 관리에서 백업 파일을 가져와 주세요.';
}
const state = { page: 'dashboard', mode: 'month', period: today().slice(0, 7), chartType: 'expense', selectedDay: '', search: '', type: 'all', category: 'all', pageNumber: 1 };
let demoEntries = getDemoEntries();
let modalTrigger = null;
let toastTimer;
let pendingImport = null;
const currentEntries = () => demo ? demoEntries : entries;
const currentSummary = () => summarize(currentEntries(), state.mode === 'year' ? state.period.slice(0, 4) : state.period, state.mode);

function persist(nextEntries) {
  if (storageError) throw new Error('기존 데이터 보호를 위해 저장이 중지되어 있어요. 데이터 관리에서 백업을 먼저 복구해 주세요.');
  const validated = safeParseBackup(JSON.stringify({ version: 1, entries: nextEntries }));
  localStorage.setItem(DATA_KEY, JSON.stringify(validated));
  entries = validated.entries;
  demo = false;
  try { localStorage.setItem(DEMO_KEY, 'true'); } catch { /* Records were already safely saved. */ }
}

function toast(message) {
  const node = document.querySelector('#toast');
  node.textContent = message;
  node.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('visible'), 3500);
}

const navItems = [
  ['dashboard', 'grid', '대시보드'], ['transactions', 'list', '전체 내역'], ['statistics', 'chart', '통계'], ['data', 'settings', '데이터 관리']
];

function sidebar() {
  return `<aside class="sidebar" aria-label="주 메뉴">
    <a class="brand" href="#dashboard" aria-label="차곡 대시보드"><span class="brand-mark"><i></i><i></i><i></i><i></i></span><span>차곡<span class="brand-caption">나를 위한 작은 가계부</span></span></a>
    <div class="nav-label">MY WORKSPACE</div>
    <nav>${navItems.map(([id, glyph, label]) => `<a href="#${id}" class="nav-item ${state.page === id ? 'active' : ''}" ${state.page === id ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span>${state.page === id ? '<span class="nav-dot"></span>' : ''}</a>`).join('')}</nav>
    <div class="sidebar-note"><div class="plant-illustration"><svg viewBox="0 0 160 100" fill="none" aria-hidden="true"><path d="M78 87V30m0 35C47 64 43 44 46 39c19-2 32 11 32 26Zm1-15c-3-22 11-35 27-36 4 19-8 35-27 36Zm0-16C60 33 52 19 56 9c17 0 25 11 23 25Zm1 39c22 1 35-10 37-24-20-5-35 6-37 24Z" stroke="currentColor" stroke-width="1.5"/><path d="m64 82 3 16h25l3-16H64Z" fill="currentColor" opacity=".15" stroke="currentColor" stroke-width="1.5"/></svg></div><p>작은 기록이 모여<br>더 단단한 일상이 돼요.</p><span>ONE DAY AT A TIME</span></div>
    <div class="sidebar-bottom">${icon('lock')}<span>나의 기록은 이 기기에</span><span class="status-dot"></span></div>
  </aside>`;
}

function periodControls() {
  const [year, month] = state.period.split('-');
  return `<div class="period-controls"><div class="segmented" aria-label="통계 기간"><button data-action="mode" data-value="month" class="${state.mode === 'month' ? 'selected' : ''}" aria-pressed="${state.mode === 'month'}">월별</button><button data-action="mode" data-value="year" class="${state.mode === 'year' ? 'selected' : ''}" aria-pressed="${state.mode === 'year'}">연별</button></div><div class="period-picker"><button class="icon-button" data-action="period" data-value="-1" aria-label="이전 ${state.mode === 'month' ? '달' : '해'}">${icon('chevronLeft')}</button><label class="period-label"><span>${year}년${state.mode === 'month' ? ` ${Number(month)}월` : ''}</span><input type="${state.mode === 'month' ? 'month' : 'number'}" aria-label="${state.mode === 'month' ? '조회할 월' : '조회할 연도'}" id="period-input" value="${state.mode === 'month' ? state.period : year}" min="${state.mode === 'month' ? '1900-01' : '1900'}" max="${state.mode === 'month' ? '9999-12' : '9999'}"></label><button class="icon-button" data-action="period" data-value="1" aria-label="다음 ${state.mode === 'month' ? '달' : '해'}">${icon('chevronRight')}</button></div><button class="today-button" data-action="today">오늘</button></div>`;
}

function demoBanner() {
  if (storageError) return `<div class="notice error-notice">${icon('info')}<span>${escape(storageError)}</span><a href="#data">데이터 관리 ${icon('arrowRight')}</a></div>`;
  if (!demo) return '';
  return `<div class="notice demo-notice"><span class="demo-tag">미리보기</span><span>예시 기록으로 차곡을 둘러보고 있어요. 첫 기록을 남겨 나의 가계부를 시작하세요.</span><button data-action="add">기록 시작하기 ${icon('arrowRight')}</button><button class="icon-button" data-action="dismiss-demo" aria-label="예시 기록 닫기">${icon('close')}</button></div>`;
}

function statsCards(summary) {
  const interval = state.mode === 'month' ? `${Number(state.period.slice(5))}월` : `${state.period.slice(0, 4)}년`;
  const previous = state.mode === 'month' ? '전월' : '전년';
  const change = summary.previousExpense > 0 ? `${previous} 대비 ${Math.abs(summary.changePercent).toFixed(1)}% ${summary.changePercent > 0 ? '늘었어요' : summary.changePercent < 0 ? '줄었어요' : '같아요'}` : `${previous} 지출과 차곡차곡 비교해요`;
  return `<section class="stats-grid" aria-label="기간별 요약">
    <article class="stat-card expense-card"><div class="stat-label">${interval} 지출<span class="stat-icon">${icon('arrowUp')}</span></div><div class="stat-amount">${money.format(summary.expense)}<span>원</span></div><div class="stat-foot">${icon(summary.changePercent > 0 ? 'arrowUp' : 'arrowDown')} ${change}</div></article>
    <article class="stat-card"><div class="stat-label">${interval} 수입<span class="stat-icon income-icon">${icon('arrowDown')}</span></div><div class="stat-amount">${money.format(summary.income)}<span>원</span></div><div class="stat-foot"><span class="tiny-dot income-marker"></span>월급부터 작은 부수입까지</div></article>
    <article class="stat-card"><div class="stat-label">${interval} 수입 − 지출<span class="stat-icon">${icon('wallet')}</span></div><div class="stat-amount ${summary.balance < 0 ? 'negative' : ''}">${money.format(summary.balance)}<span>원</span></div><div class="stat-foot">${summary.balance >= 0 ? '차곡차곡 남긴 나의 여유' : '이번 기간에는 지출이 더 많아요'}</div></article>
    <article class="stat-card"><div class="stat-label">하루 평균 지출<span class="stat-icon">${icon('calendar')}</span></div><div class="stat-amount">${money.format(summary.dailyAverage)}<span>원</span></div><div class="stat-foot">${money.format(summary.days)}일을 기준으로 계산했어요</div></article>
  </section>`;
}

function spendingChart(summary, expanded = false) {
  const series = summary.series;
  const values = series.map(row => row[state.chartType]);
  const max = Math.max(...values, 1);
  const roundTo = max > 1000000 ? 500000 : max > 100000 ? 50000 : max > 10000 ? 10000 : max > 1000 ? 1000 : 100;
  const ceiling = Math.max(roundTo, Math.ceil(max * 1.18 / roundTo) * roundTo);
  const width = 790, height = 226, left = 56, right = 16, top = 17, bottom = 34;
  const chartWidth = width - left - right, chartHeight = height - top - bottom;
  const gap = chartWidth / series.length;
  const ticks = Array.from({ length: 5 }, (_, i) => {
    const y = top + chartHeight * i / 4;
    const label = ceiling * (1 - i / 4);
    return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="#ece5f2" stroke-dasharray="3 5"/><text x="${left - 12}" y="${y + 4}" text-anchor="end" class="chart-axis">${label ? shortMoney(Math.round(label)) : '0'}</text>`;
  }).join('');
  const bars = series.map((row, i) => {
    const x = left + i * gap + gap * .22;
    const barHeight = row[state.chartType] / ceiling * chartHeight;
    const active = row.key === today() || state.selectedDay === row.key;
    return `<g class="chart-column" tabindex="0" data-chart-key="${row.key}" role="img" aria-label="${escape(row.label)} ${state.chartType === 'expense' ? '지출' : '수입'} ${won(row[state.chartType])}"><title>${escape(row.key)} · ${state.chartType === 'expense' ? '지출' : '수입'} ${won(row[state.chartType])}</title><rect x="${x}" y="${top + chartHeight - barHeight}" width="${gap * .56}" height="${Math.max(barHeight, 1.5)}" rx="${Math.min(gap * .15, 4)}" fill="${active ? '#7656a3' : state.chartType === 'income' ? '#9688c2' : '#bba5d5'}"/>${(state.mode === 'year' || i === 0 || (i + 1) % 5 === 0 || i === series.length - 1) ? `<text x="${left + i * gap + gap / 2}" y="${height - 9}" text-anchor="middle" class="chart-axis">${state.mode === 'year' ? `${i + 1}월` : `${i + 1}일`}</text>` : ''}</g>`;
  }).join('');
  const most = values.indexOf(Math.max(...values));
  return `<section class="panel chart-panel ${expanded ? 'expanded-chart' : ''}"><div class="panel-heading"><div><h2>${state.mode === 'month' ? '일별' : '월별'} ${state.chartType === 'expense' ? '지출' : '수입'} 흐름</h2><p>${state.mode === 'month' ? '하루하루의' : '한 해 동안의'} 기록을 한눈에 살펴보세요.</p></div><div class="sub-segmented"><button class="${state.chartType === 'expense' ? 'active' : ''}" data-action="chart-type" data-value="expense" aria-pressed="${state.chartType === 'expense'}">지출</button><button class="${state.chartType === 'income' ? 'active' : ''}" data-action="chart-type" data-value="income" aria-pressed="${state.chartType === 'income'}">수입</button></div></div><div class="chart-legend"><span class="tiny-dot chart-marker"></span>${state.chartType === 'expense' ? '지출 금액' : '수입 금액'}<span class="chart-unit">단위: 원</span></div><div class="bar-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${state.mode === 'month' ? '일별' : '월별'} ${state.chartType === 'expense' ? '지출' : '수입'} 막대 그래프">${ticks}${bars}</svg></div><div class="chart-insight">${icon('sparkle')}<span>${max > 1 ? `<strong>${state.mode === 'month' ? `${Number(series[most].key.slice(-2))}일` : `${most + 1}월`}</strong>에 가장 ${state.chartType === 'expense' ? '많이 지출' : '많은 수입을 기록'}했어요.<span class="insight-amount">${won(values[most])}</span>` : '첫 기록이 쌓이면 나의 흐름이 보여요.'}</span></div></section>`;
}

function categoryPanel(summary, detailed = false) {
  const populated = summary.byCategory.filter(item => item.amount > 0);
  let total = 0;
  const gradient = populated.length ? populated.map(item => { const start = total; total += item.percent; return `${item.color} ${start}% ${total}%`; }).join(', ') : '#f0eaf6 0% 100%';
  return `<section class="panel category-panel"><div class="panel-heading"><div><h2>어디에 썼을까요?</h2><p>카테고리별 지출 비중</p></div>${icon('chart', 'muted')}</div><div class="donut-wrap"><div class="donut" style="background:conic-gradient(${gradient})" role="img" aria-label="${populated.map(row => `${row.label} ${Math.round(row.percent)}%`).join(', ') || '지출 기록 없음'}"><div class="donut-center"><span>총 지출</span><strong>${money.format(summary.expense)}<small>원</small></strong><span class="donut-caption">${populated.length}개 카테고리</span></div></div></div><div class="category-legend">${(detailed ? populated : populated.slice(0, 4)).map(row => `<div class="category-legend-row"><span class="legend-name"><i style="background:${row.color}"></i>${escape(row.label)}</span><strong>${won(row.amount)}</strong><span>${Math.round(row.percent)}%</span></div>`).join('') || '<p class="small-empty">아직 지출 기록이 없어요.</p>'}${!detailed && populated.length > 4 ? `<button class="text-button category-more" data-action="go-stats">그 외 ${populated.length - 4}개 카테고리 ${icon('chevronRight')}</button>` : ''}</div></section>`;
}

function calendarPanel(summary) {
  const [year, month] = state.period.split('-').map(Number);
  const days = new Date(year, month, 0).getDate();
  const offset = new Date(year, month - 1, 1).getDay();
  const dayTotals = new Map();
  summary.transactions.forEach(row => { const current = dayTotals.get(row.date) || { expense: 0, income: 0 }; current[row.type] += row.amount; dayTotals.set(row.date, current); });
  return `<section class="panel calendar-panel"><div class="panel-heading"><div><h2>하루하루 기록</h2><p>날짜를 눌러 그날의 기록을 확인하세요.</p></div><span class="calendar-month">${month}월</span></div><div class="calendar-grid"><div class="weekday sunday">일</div><div class="weekday">월</div><div class="weekday">화</div><div class="weekday">수</div><div class="weekday">목</div><div class="weekday">금</div><div class="weekday saturday">토</div>${'<span class="calendar-blank"></span>'.repeat(offset)}${Array.from({ length: days }, (_, i) => {
    const day = i + 1, key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const amount = dayTotals.get(key);
    return `<button class="calendar-day ${key === today() ? 'is-today' : ''} ${state.selectedDay === key ? 'is-selected' : ''} ${!amount ? 'no-spend' : ''}" data-action="select-day" data-value="${key}" aria-pressed="${state.selectedDay === key}" aria-label="${month}월 ${day}일, 지출 ${won(amount?.expense || 0)}, 수입 ${won(amount?.income || 0)}"><span>${day}</span>${amount?.expense ? `<small>${shortMoney(amount.expense)}</small>` : '<small class="day-dash">·</small>'}${amount?.income ? '<i class="income-dot"></i>' : ''}</button>`;
  }).join('')}</div><div class="calendar-footer"><span><i class="tiny-dot income-marker"></i> 수입이 있는 날</span><span>지출 단위: 원</span></div></section>`;
}

function transactionRow(row, table = false) {
  const cat = category(row.category);
  const amount = `<span class="transaction-amount ${row.type === 'income' ? 'income-text' : ''}">${row.type === 'income' ? '+' : '−'}${won(row.amount)}</span>`;
  const description = `<span class="category-icon" style="--category-color:${cat.color}">${categoryIcon(row.category)}</span><span class="transaction-description"><strong>${escape(row.note || cat.label)}</strong><small>${escape(cat.label)}<i>·</i>${escape(PAYMENTS.find(item => item.id === row.payment)?.label || '기타')}</small></span>`;
  if (table) return `<tr><td class="date-cell">${row.date.replaceAll('-', '.')}</td><td><div class="transaction-info">${description}</div></td><td class="category-cell"><span class="category-chip">${escape(cat.label)}</span></td><td class="payment-cell">${escape(PAYMENTS.find(item => item.id === row.payment)?.label || '기타')}</td><td class="amount-cell">${amount}</td><td><div class="row-actions"><button class="icon-button" data-action="edit" data-id="${escape(row.id)}" aria-label="${escape(row.note || cat.label)} 수정">${icon('edit')}</button><button class="icon-button delete-button" data-action="delete" data-id="${escape(row.id)}" aria-label="${escape(row.note || cat.label)} 삭제">${icon('trash')}</button></div></td></tr>`;
  return `<button class="transaction-row" data-action="edit" data-id="${escape(row.id)}"><span class="transaction-info">${description}</span><span class="transaction-right">${amount}<small>${Number(row.date.slice(5, 7))}.${Number(row.date.slice(-2))}</small></span></button>`;
}

function emptyState(message = '아직 기록이 없어요', detail = '오늘의 작은 소비부터 차곡차곡 남겨 보세요.', action = true) {
  return `<div class="empty-state"><span class="empty-icon">${icon('leaf')}</span><h3>${message}</h3><p>${detail}</p>${action ? `<button class="button primary small" data-action="add">${icon('plus')}첫 기록 남기기</button>` : ''}</div>`;
}

function recentPanel(summary) {
  const rows = summary.transactions.filter(row => !state.selectedDay || row.date === state.selectedDay).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 5);
  return `<section class="panel recent-panel"><div class="panel-heading"><div><h2>${state.selectedDay ? `${Number(state.selectedDay.slice(5, 7))}월 ${Number(state.selectedDay.slice(-2))}일의 기록` : '최근 기록'}</h2><p>${state.selectedDay ? '그날의 소비와 수입을 살펴보세요.' : '일상에 남겨진 작은 돈의 발자국'}</p></div><button class="text-button" data-action="go-transactions">전체 보기 ${icon('arrowRight')}</button></div>${state.selectedDay ? `<div class="selected-day-bar">${icon('calendar')}${state.selectedDay.replaceAll('-', '.')}<button data-action="clear-day" class="text-button">선택 해제 ${icon('close')}</button></div>` : ''}<div class="recent-list">${rows.map(row => transactionRow(row)).join('') || emptyState(state.selectedDay ? '이날은 아직 기록이 없어요' : undefined, undefined, true)}</div><div class="recent-footer">${icon('leaf')}기록하는 습관이 나의 내일을 바꿔요.</div></section>`;
}

function dashboard() {
  const summary = currentSummary();
  return `<div class="page-intro"><div><div class="eyebrow">A LITTLE RECORD, A BETTER DAY</div><h1>나의 일상을, <span>차곡.</span></h1><p>돈의 흐름을 알면, 일상이 조금 더 가벼워져요.</p></div>${periodControls()}</div>${demoBanner()}${statsCards(summary)}<div class="dashboard-grid">${spendingChart(summary)}${categoryPanel(summary)}</div><div class="bottom-grid">${state.mode === 'month' ? calendarPanel(summary) : annualOverview(summary)}${recentPanel(summary)}</div>`;
}

function filteredTransactions() {
  return currentSummary().transactions.filter(row => (state.type === 'all' || row.type === state.type) && (state.category === 'all' || row.category === state.category) && (!state.selectedDay || row.date === state.selectedDay) && (!state.search || `${row.note} ${category(row.category).label} ${row.amount} ${row.date}`.toLowerCase().includes(state.search.toLowerCase()))).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

function transactionTable() {
  const rows = filteredTransactions();
  const pageCount = Math.max(1, Math.ceil(rows.length / 12));
  state.pageNumber = Math.min(state.pageNumber, pageCount);
  const visible = rows.slice((state.pageNumber - 1) * 12, state.pageNumber * 12);
  return `<div class="table-summary"><span>총 <strong>${rows.length}</strong>건의 기록</span><span>지출 <strong>${won(rows.filter(row => row.type === 'expense').reduce((sum, row) => sum + row.amount, 0))}</strong><i>·</i>수입 <strong class="income-text">${won(rows.filter(row => row.type === 'income').reduce((sum, row) => sum + row.amount, 0))}</strong></span></div>${visible.length ? `<div class="table-wrap"><table class="transaction-table"><thead><tr><th scope="col">날짜</th><th scope="col">내역</th><th scope="col" class="category-cell">카테고리</th><th scope="col" class="payment-cell">결제 수단</th><th scope="col" class="amount-cell">금액</th><th scope="col"><span class="sr-only">관리</span></th></tr></thead><tbody>${visible.map(row => transactionRow(row, true)).join('')}</tbody></table></div><div class="pagination"><span>${rows.length}건 중 ${(state.pageNumber - 1) * 12 + 1}–${Math.min(state.pageNumber * 12, rows.length)}건</span><div><button class="icon-button" data-action="list-page" data-value="-1" ${state.pageNumber <= 1 ? 'disabled' : ''} aria-label="이전 페이지">${icon('chevronLeft')}</button><span>${state.pageNumber} / ${pageCount}</span><button class="icon-button" data-action="list-page" data-value="1" ${state.pageNumber >= pageCount ? 'disabled' : ''} aria-label="다음 페이지">${icon('chevronRight')}</button></div></div>` : emptyState('조건에 맞는 기록이 없어요', '기간이나 검색 조건을 바꾸거나 새 기록을 남겨 보세요.')}`;
}

function transactionsPage() {
  return `<div class="page-intro"><div><div class="eyebrow">EVERY RECORD MATTERS</div><h1>하나하나, <span>나의 기록.</span></h1><p>작은 커피 한 잔부터 월급까지, 모두 이곳에.</p></div>${periodControls()}</div>${demoBanner()}<section class="panel transactions-panel"><div class="filters"><div class="search-field">${icon('search')}<input type="search" id="search-input" placeholder="내역 또는 금액 검색" aria-label="내역 검색" value="${escape(state.search)}"></div><div class="filter-selects"><label><span class="sr-only">수입·지출 구분</span><select id="type-filter"><option value="all" ${state.type === 'all' ? 'selected' : ''}>수입·지출 전체</option><option value="expense" ${state.type === 'expense' ? 'selected' : ''}>지출</option><option value="income" ${state.type === 'income' ? 'selected' : ''}>수입</option></select></label><label><span class="sr-only">카테고리</span><select id="category-filter"><option value="all">모든 카테고리</option>${allCategories.map(item => `<option value="${item.id}" ${state.category === item.id ? 'selected' : ''}>${item.label}</option>`).join('')}</select></label><button class="button secondary small" data-action="export-csv">${icon('download')}CSV</button></div></div>${state.selectedDay ? `<div class="selected-day-bar">${icon('calendar')}${state.selectedDay.replaceAll('-', '.')}<button data-action="clear-day" class="text-button">날짜 필터 해제 ${icon('close')}</button></div>` : ''}<div id="transactions-content">${transactionTable()}</div></section>`;
}

function annualOverview(summary) {
  return `<section class="panel annual-panel"><div class="panel-heading"><div><h2>매달 쌓인 기록</h2><p>월을 누르면 자세히 볼 수 있어요.</p></div>${icon('calendar', 'muted')}</div><div class="month-overview">${summary.series.map((month, i) => `<button class="month-tile" data-action="open-month" data-value="${month.key}"><span>${i + 1}월</span><strong>${won(month.expense)}</strong><small class="income-text">+${won(month.income)}</small></button>`).join('')}</div></section>`;
}

function statisticsPage() {
  const summary = currentSummary();
  const max = Math.max(...summary.byCategory.map(row => row.amount), 1);
  return `<div class="page-intro"><div><div class="eyebrow">KNOW YOUR MONEY, KNOW YOURSELF</div><h1>기록이 만드는 <span>발견.</span></h1><p>나의 소비 패턴을 알아가는 가장 쉬운 방법.</p></div>${periodControls()}</div>${demoBanner()}${statsCards(summary)}${spendingChart(summary, true)}<div class="dashboard-grid stats-detail-grid"><section class="panel category-detail-panel"><div class="panel-heading"><div><h2>카테고리별 자세히 보기</h2><p>어떤 일상에 가장 많이 쓰고 있나요?</p></div><span class="label-tag">지출 분석</span></div>${summary.byCategory.filter(row => row.amount > 0).map(row => `<div class="category-detail-row"><span class="category-icon" style="--category-color:${row.color}">${categoryIcon(row.id)}</span><div class="category-bar-wrap"><div><span>${escape(row.label)}</span><strong>${won(row.amount)}<small>${Math.round(row.percent)}%</small></strong></div><div class="category-bar"><i style="width:${row.amount / max * 100}%;background:${row.color}"></i></div></div></div>`).join('') || emptyState('아직 분석할 지출이 없어요', '지출을 기록하면 카테고리별 통계를 보여 드려요.', false)}</section>${categoryPanel(summary, true)}</div>${state.mode === 'year' ? annualOverview(summary) : ''}`;
}

function dataPage() {
  return `<div class="page-intro"><div><div class="eyebrow">YOUR RECORDS, IN YOUR HANDS</div><h1>소중한 기록, <span>안전하게.</span></h1><p>나의 기록을 보관하고 다른 기기로 옮길 수 있어요.</p></div></div>${demoBanner()}<div class="data-grid"><section class="panel storage-panel"><span class="data-feature-icon">${icon('lock')}</span><h2>나만의 가계부</h2><p>기록은 지금 사용하는 브라우저에 저장돼요.<br>입력한 내역이 GitHub나 외부 서버로 전송되지 않아요.</p><div class="storage-facts"><div><span>저장된 나의 기록</span><strong>${entries.length}건</strong></div><div><span>저장 방식</span><strong>이 브라우저의 로컬 저장소</strong></div><div><span>자동 기기 동기화</span><strong>지원하지 않음</strong></div></div><div class="soft-note">${icon('info')}<span>브라우저 데이터를 지우면 기록도 사라져요. 주기적으로 JSON 백업을 내려받아 주세요. 다른 기기에서는 백업 파일을 가져오면 이어서 쓸 수 있어요.</span></div></section><section class="panel backup-panel"><div class="panel-heading"><div><h2>기록 백업과 복원</h2><p>내 기록을 오래 간직하는 방법</p></div>${icon('download', 'muted')}</div><div class="data-action"><span class="data-action-icon">${icon('download')}</span><div><h3>전체 기록 백업</h3><p>모든 수입·지출을 JSON 파일로 보관해요.</p></div><button class="button secondary small" data-action="export-json">내보내기</button></div><div class="data-action"><span class="data-action-icon">${icon('upload')}</span><div><h3>백업 파일 가져오기</h3><p>파일을 확인한 뒤 현재 기록에 합쳐요.</p></div><button class="button secondary small" data-action="import">가져오기</button></div><div class="data-action"><span class="data-action-icon">${icon('list')}</span><div><h3>스프레드시트로 보기</h3><p>전체 기록을 CSV 파일로 내려받아요.</p></div><button class="button secondary small" data-action="export-all-csv">CSV 저장</button></div><input class="sr-only" type="file" id="import-file" accept=".json,application/json" tabindex="-1"><div class="backup-note">백업 파일에는 금액과 메모가 담겨요. 나만 접근할 수 있는 곳에 보관해 주세요.</div></section></div><section class="panel demo-panel"><div><h2>차곡이 처음이라면</h2><p>예시 기록으로 화면을 둘러보세요. 내 기록에는 영향을 주지 않아요.</p></div><button class="button secondary" data-action="toggle-demo">${icon(demo ? 'close' : 'sparkle')}${demo ? '내 기록으로 돌아가기' : '예시 둘러보기'}</button></section>`;
}

function render() {
  const page = navItems.find(item => item[0] === state.page) || navItems[0];
  document.title = `${page[2]} · 차곡`;
  document.querySelector('#app').innerHTML = `${sidebar()}<div class="workspace"><header class="topbar"><div class="topbar-breadcrumb"><span class="mobile-logo">차곡</span><span class="desktop-crumb">나의 가계부</span><span class="breadcrumb-slash">/</span><span>${page[2]}</span></div><div class="topbar-actions"><span class="save-status">${icon('check')}이 기기에 저장${demo ? ' · 예시 모드' : ''}</span><button class="button primary" data-action="add">${icon('plus')}<span>내역 추가</span></button></div></header><main id="main-content" tabindex="-1">${state.page === 'transactions' ? transactionsPage() : state.page === 'statistics' ? statisticsPage() : state.page === 'data' ? dataPage() : dashboard()}<footer class="main-footer"><span>차곡 <i>·</i> 오늘의 기록이 내일의 여유로.</span><span>MADE FOR YOUR EVERYDAY</span></footer></main></div>`;
}

function setPage(page) {
  if (!navItems.some(item => item[0] === page)) page = 'dashboard';
  state.page = page;
  state.pageNumber = 1;
  render();
  window.scrollTo({ top: 0 });
}

function closeModal() {
  document.querySelector('#modal-root').innerHTML = '';
  document.body.classList.remove('modal-open');
  pendingImport = null;
  if (modalTrigger?.isConnected) modalTrigger.focus();
}

function renderAfterModal() {
  closeModal();
  render();
  document.querySelector('#main-content')?.focus({ preventScroll: true });
}

function openModal(content) {
  modalTrigger = document.activeElement;
  document.querySelector('#modal-root').innerHTML = `<div class="modal-overlay"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1">${content}</section></div>`;
  document.body.classList.add('modal-open');
  const target = document.querySelector('.modal [autofocus]') || document.querySelector('.modal input, .modal button');
  target?.focus();
}

function entryModal(id) {
  if (demo && id) { toast('예시 기록이에요. 내역 추가로 나만의 기록을 시작해 보세요.'); return; }
  const row = entries.find(item => item.id === id);
  const type = row?.type || 'expense';
  openModal(`<div class="modal-heading"><div><div class="eyebrow">A MOMENT TO RECORD</div><h2 id="modal-title">${row ? '기록 수정하기' : '오늘의 기록 남기기'}</h2></div><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('close')}</button></div><form id="entry-form" data-id="${escape(row?.id || '')}"><div class="entry-type-toggle"><button type="button" data-action="entry-type" data-value="expense" class="${type === 'expense' ? 'selected' : ''}" aria-pressed="${type === 'expense'}">${icon('arrowUp')}지출</button><button type="button" data-action="entry-type" data-value="income" class="${type === 'income' ? 'selected' : ''}" aria-pressed="${type === 'income'}">${icon('arrowDown')}수입</button><input type="hidden" name="type" value="${type}"></div><label class="amount-input-label">금액<div class="amount-input"><input name="amount" id="amount-input" type="text" inputmode="numeric" autocomplete="off" placeholder="0" value="${row ? money.format(row.amount) : ''}" required autofocus aria-describedby="amount-help"><span>원</span></div><span id="amount-help" class="field-hint">${type === 'income' ? '들어온 수입' : '사용한 금액'}을 입력해 주세요.</span></label><div class="form-row"><label>날짜<input type="date" name="date" value="${row?.date || state.selectedDay || today()}" min="1900-01-01" max="9999-12-31" required></label><label>카테고리<select name="category" required>${(type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES).map(item => `<option value="${item.id}" ${row?.category === item.id ? 'selected' : ''}>${item.label}</option>`).join('')}</select></label></div><label class="form-field">${type === 'income' ? '입금' : '결제'} 수단<select name="payment">${PAYMENTS.map(item => `<option value="${item.id}" ${row?.payment === item.id ? 'selected' : ''}>${item.label}</option>`).join('')}</select></label><label class="form-field">메모 <span class="optional">선택</span><input type="text" name="note" maxlength="120" placeholder="${type === 'income' ? '어떤 수입인가요? 예: 11월 월급' : '어디에 사용했나요? 예: 친구와 점심'}" value="${escape(row?.note || '')}"></label>${demo ? '<p class="form-note">첫 기록을 저장하면 예시가 사라지고 나만의 가계부가 시작돼요.</p>' : ''}<div id="form-error" class="form-error" role="alert"></div><div class="modal-footer"><button type="button" class="button secondary" data-action="close-modal">취소</button><button type="submit" class="button primary">${icon('check')}${row ? '수정 저장하기' : '기록 저장하기'}</button></div></form>`);
}

function download(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCSV(all = false) {
  const rows = all ? currentEntries() : filteredTransactions();
  if (!rows.length) { toast('내보낼 기록이 없어요.'); return; }
  const cell = value => `"${String(value).replace(/^[=+\-@\t\r]/, "'$&").replaceAll('"', '""')}"`;
  const csv = [['날짜', '구분', '카테고리', '금액(원)', '결제 수단', '메모'], ...rows.map(row => [row.date, row.type === 'income' ? '수입' : '지출', category(row.category).label, row.amount, PAYMENTS.find(item => item.id === row.payment)?.label, row.note])].map(row => row.map(cell).join(',')).join('\r\n');
  download('\uFEFF' + csv, `차곡_${demo ? '예시_' : ''}${all ? '전체기록' : state.mode === 'year' ? state.period.slice(0, 4) : state.period}_${today()}.csv`, 'text/csv;charset=utf-8');
  toast(`${demo ? '예시 ' : ''}기록을 CSV로 내보냈어요.`);
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const { action, value, id } = button.dataset;
  if (action === 'add') return entryModal();
  if (action === 'edit') return entryModal(id);
  if (action === 'close-modal') return closeModal();
  if (action === 'entry-type') {
    const form = document.querySelector('#entry-form');
    form.elements.type.value = value;
    form.querySelectorAll('[data-action="entry-type"]').forEach(node => { node.classList.toggle('selected', node.dataset.value === value); node.setAttribute('aria-pressed', String(node.dataset.value === value)); });
    form.elements.category.innerHTML = (value === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(item => `<option value="${item.id}">${item.label}</option>`).join('');
    form.querySelector('#amount-help').textContent = `${value === 'income' ? '들어온 수입' : '사용한 금액'}을 입력해 주세요.`;
    return;
  }
  if (action === 'mode') { state.mode = value; state.selectedDay = ''; }
  if (action === 'period') {
    const [year, month] = state.period.split('-').map(Number);
    const date = new Date(year, month - 1 + (state.mode === 'month' ? Number(value) : 0), 1);
    if (state.mode === 'year') date.setFullYear(year + Number(value));
    if (date.getFullYear() < 1900 || date.getFullYear() > 9999) return;
    state.period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    state.selectedDay = ''; state.pageNumber = 1;
  }
  if (action === 'today') { state.period = today().slice(0, 7); state.selectedDay = ''; state.pageNumber = 1; }
  if (action === 'chart-type') state.chartType = value;
  if (action === 'select-day') state.selectedDay = state.selectedDay === value ? '' : value;
  if (action === 'clear-day') state.selectedDay = '';
  if (action === 'list-page') state.pageNumber += Number(value);
  if (action === 'go-transactions') { location.hash = 'transactions'; return; }
  if (action === 'go-stats') { location.hash = 'statistics'; return; }
  if (action === 'open-month') { state.period = value; state.mode = 'month'; state.selectedDay = ''; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (action === 'dismiss-demo') { demo = false; try { localStorage.setItem(DEMO_KEY, 'true'); } catch { toast('이 브라우저에서 저장소를 사용할 수 없어요.'); } }
  if (action === 'toggle-demo') { demo = !demo; if (demo) demoEntries = getDemoEntries(); }
  if (action === 'export-csv') return exportCSV();
  if (action === 'export-all-csv') return exportCSV(true);
  if (action === 'export-json') {
    if (!entries.length) { toast('아직 저장된 나의 기록이 없어요.'); return; }
    download(JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries }, null, 2), `차곡_백업_${today()}.json`, 'application/json');
    return toast('나의 전체 기록을 백업했어요.');
  }
  if (action === 'import') return document.querySelector('#import-file').click();
  if (action === 'confirm-import') {
    if (!pendingImport) return;
    try {
      const byId = new Map(entries.map(row => [row.id, row]));
      pendingImport.forEach(row => byId.set(row.id, row));
      const next = [...byId.values()];
      const originalError = storageError;
      storageError = '';
      try { persist(next); } catch (error) { storageError = originalError; throw error; }
      renderAfterModal(); toast('백업 기록을 가져왔어요.');
    } catch (error) { document.querySelector('#import-error').textContent = `가져오지 못했어요. ${error.message}`; }
    return;
  }
  if (action === 'delete') {
    if (demo) return toast('예시 기록은 수정하거나 삭제할 수 없어요.');
    const row = entries.find(item => item.id === id);
    if (!row) return;
    openModal(`<div class="modal-heading"><h2 id="modal-title">이 기록을 삭제할까요?</h2><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('close')}</button></div><p class="confirm-description">${escape(row.note || category(row.category).label)} · ${won(row.amount)}<br>삭제한 기록은 되돌릴 수 없어요.</p><div id="delete-error" class="form-error" role="alert"></div><div class="modal-footer"><button class="button secondary" data-action="close-modal">취소</button><button class="button danger" data-action="confirm-delete" data-id="${escape(id)}">삭제하기</button></div>`);
    return;
  }
  if (action === 'confirm-delete') {
    try { persist(entries.filter(row => row.id !== id)); renderAfterModal(); toast('기록을 삭제했어요.'); }
    catch { document.querySelector('#delete-error').textContent = '삭제 내용을 저장하지 못했어요. 브라우저 저장소를 확인해 주세요.'; }
    return;
  }
  render();
});

document.addEventListener('input', event => {
  if (event.target.id === 'amount-input') {
    const help = document.querySelector('#amount-help');
    try { help.textContent = won(parseAmount(event.target.value)); }
    catch { help.textContent = '금액을 1원 이상의 정수로 입력해 주세요.'; }
  }
  if (event.target.id === 'search-input') {
    state.search = event.target.value;
    state.pageNumber = 1;
    document.querySelector('#transactions-content').innerHTML = transactionTable();
  }
});

document.addEventListener('focusin', event => {
  if (event.target.id !== 'amount-input') return;
  try { event.target.value = String(parseAmount(event.target.value)); }
  catch { /* Preserve invalid text so it cannot become a different amount. */ }
});

document.addEventListener('focusout', event => {
  if (event.target.id !== 'amount-input') return;
  try { event.target.value = money.format(parseAmount(event.target.value)); }
  catch { /* Validation on submit explains the original input. */ }
});

document.addEventListener('change', async event => {
  if (event.target.id === 'period-input') {
    const value = event.target.value;
    const valid = state.mode === 'month' ? /^\d{4}-(0[1-9]|1[0-2])$/.test(value) : /^\d{4}$/.test(value);
    if (valid && Number(value.slice(0, 4)) >= 1900) {
      state.period = state.mode === 'month' ? value : `${value}-${state.period.slice(5)}`;
      state.selectedDay = ''; state.pageNumber = 1; render();
    }
  }
  if (event.target.id === 'type-filter' || event.target.id === 'category-filter') {
    state[event.target.id === 'type-filter' ? 'type' : 'category'] = event.target.value;
    state.pageNumber = 1;
    document.querySelector('#transactions-content').innerHTML = transactionTable();
  }
  if (event.target.id === 'import-file') {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast('10MB 이하의 백업 파일을 선택해 주세요.');
    try {
      const parsed = safeParseBackup(await file.text());
      const existingIds = new Set(entries.map(row => row.id));
      const duplicateCount = parsed.entries.filter(row => existingIds.has(row.id)).length;
      openModal(`<div class="modal-heading"><h2 id="modal-title">백업 기록을 가져올까요?</h2><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('close')}</button></div><div class="import-preview"><span>${escape(file.name)}</span><strong>${parsed.entries.length}건의 기록</strong><p>새 기록 ${parsed.entries.length - duplicateCount}건을 추가해요.${duplicateCount ? `<br>같은 ID의 기록 ${duplicateCount}건은 백업 파일의 내용으로 업데이트해요.` : ''}<br>현재의 다른 기록은 그대로 유지돼요.</p></div>${storageError ? '<p class="form-note">읽지 못한 기존 저장 자료는 가져온 백업으로 교체돼요.</p>' : ''}<div id="import-error" class="form-error" role="alert"></div><div class="modal-footer"><button class="button secondary" data-action="close-modal">취소</button><button class="button primary" data-action="confirm-import">${icon('upload')}가져오기</button></div>`);
      pendingImport = parsed.entries;
    } catch (error) { toast(`가져올 수 없는 파일이에요. ${error.message}`); }
  }
});

document.addEventListener('submit', event => {
  if (event.target.id !== 'entry-form') return;
  event.preventDefault();
  const form = event.target;
  try {
    const input = Object.fromEntries(new FormData(form));
    input.amount = parseAmount(input.amount);
    if (form.dataset.id) input.id = form.dataset.id;
    const row = normalizeEntry(input);
    const next = entries.filter(item => item.id !== row.id).concat(row);
    persist(next);
    state.period = row.date.slice(0, 7);
    state.selectedDay = ''; state.pageNumber = 1;
    renderAfterModal(); toast(form.dataset.id ? '기록을 수정했어요.' : '오늘의 기록이 차곡 쌓였어요.');
  } catch (error) {
    document.querySelector('#form-error').textContent = error.name === 'QuotaExceededError' ? '저장 공간이 부족해요. 백업 후 브라우저 공간을 확보해 주세요.' : error.message || '기록을 저장하지 못했어요.';
  }
});

document.addEventListener('keydown', event => {
  const modal = document.querySelector('.modal');
  if (!modal) return;
  if (event.key === 'Escape') { closeModal(); return; }
  if (event.key === 'Tab') {
    const nodes = [...modal.querySelectorAll('button, input, select, [tabindex="0"]')].filter(node => !node.disabled && node.type !== 'hidden' && node.getClientRects().length);
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
  }
});

window.addEventListener('hashchange', () => setPage(location.hash.slice(1)));
window.addEventListener('storage', event => {
  if (event.key !== DATA_KEY) return;
  try {
    entries = event.newValue ? safeParseBackup(event.newValue).entries : [];
    demo = false; storageError = ''; render(); toast('다른 탭의 기록을 반영했어요.');
  } catch { toast('다른 탭의 기록을 불러오지 못했어요. 새로고침해 주세요.'); }
});
setPage(location.hash.slice(1) || 'dashboard');
