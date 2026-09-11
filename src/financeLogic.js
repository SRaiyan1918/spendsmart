const round2 = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const amountOf = tx => Number.isFinite(Number(tx?.amount)) ? Number(tx.amount) : 0;

export const isLegacyGoalAllocation = tx =>
  tx?.type === 'expense' && (
    tx?.note === '💰 Savings Goal Allocation' ||
    tx?.isSavingsAllocation === true ||
    tx?.source === 'savings-goal'
  );

export function normalizeTransaction(tx = {}) {
  const amount = Math.max(0, amountOf(tx));
  if (isLegacyGoalAllocation(tx)) {
    return { ...tx, type: 'transfer', transferKind: 'savings', direction: 'out', amount };
  }
  const validTypes = new Set(['income', 'expense', 'refund', 'transfer']);
  return {
    ...tx,
    type: validTypes.has(tx.type) ? tx.type : 'expense',
    amount,
  };
}

export function calculateTotals(transactions = []) {
  let income = 0;
  let grossExpense = 0;
  let refunds = 0;
  let transferOut = 0;
  let transferIn = 0;
  for (const raw of transactions) {
    const tx = normalizeTransaction(raw);
    if (tx.type === 'income') income += tx.amount;
    else if (tx.type === 'expense') grossExpense += tx.amount;
    else if (tx.type === 'refund') refunds += tx.amount;
    else if (tx.type === 'transfer') {
      if (tx.direction === 'in') transferIn += tx.amount;
      else transferOut += tx.amount;
    }
  }
  income = round2(income);
  grossExpense = round2(grossExpense);
  refunds = round2(refunds);
  transferOut = round2(transferOut);
  transferIn = round2(transferIn);
  const transfers = round2(transferOut - transferIn);
  const expense = round2(Math.max(0, grossExpense - refunds));
  const balance = round2(income - grossExpense + refunds);
  const spendableBalance = round2(balance - transfers);
  return { income, grossExpense, refunds, expense, transfers, transferOut, transferIn, balance, spendableBalance };
}

export function calculatePeriodTotals(transactions = [], predicate = () => true) {
  return calculateTotals(transactions.filter(predicate));
}

function localDateParts(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateString || ''));
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function weekKey(dateString) {
  const p = localDateParts(dateString);
  if (!p) return '';
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  const day = dt.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + offset);
  return dt.toISOString().slice(0, 10);
}

export function buildGraphData(transactions = [], period = 'monthly') {
  const map = new Map();
  for (const raw of transactions) {
    const tx = normalizeTransaction(raw);
    if (!tx.date) continue;
    let key;
    let label;
    if (period === 'weekly') {
      key = weekKey(tx.date);
      label = key.slice(5);
    } else if (period === 'yearly') {
      key = tx.date.slice(0, 4);
      label = key;
    } else {
      key = tx.date.slice(0, 7);
      label = key;
    }
    if (!key) continue;
    const row = map.get(key) || { key, label, income: 0, expense: 0, transfers: 0, refunds: 0 };
    if (tx.type === 'income') row.income += tx.amount;
    else if (tx.type === 'expense') row.expense += tx.amount;
    else if (tx.type === 'refund') { row.expense -= tx.amount; row.refunds += tx.amount; }
    else if (tx.type === 'transfer') row.transfers += tx.direction === 'in' ? -tx.amount : tx.amount;
    row.expense = Math.max(0, row.expense);
    map.set(key, row);
  }
  const rows = [...map.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(row => ({ ...row, income: round2(row.income), expense: round2(row.expense), transfers: round2(row.transfers), refunds: round2(row.refunds) }));
  if (period === 'weekly') return rows.slice(-8);
  if (period === 'monthly') return rows.slice(-12);
  return rows;
}

export function validatePositiveAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return { ok: false, amount: 0, message: 'Valid amount daalo.' };
  if (amount <= 0) return { ok: false, amount, message: 'Amount 0 se zyada hona chahiye.' };
  return { ok: true, amount: round2(amount), message: '' };
}

export function toBaseAmount(value, currency = 'INR', rates = null) {
  const parsed = validatePositiveAmount(value);
  if (!parsed.ok) return NaN;
  if (currency === 'INR') return parsed.amount;
  const rate = Number(rates?.[currency]);
  if (!Number.isFinite(rate) || rate <= 0) return NaN;
  return round2(parsed.amount / rate);
}

export function fromBaseAmount(value, currency = 'INR', rates = null) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  if (currency === 'INR') return round2(amount);
  const rate = Number(rates?.[currency]);
  if (!Number.isFinite(rate) || rate <= 0) return round2(amount);
  return round2(amount * rate);
}

export function getGoalAllocationAmount(requestedAmount, targetAmount, savedAmount = 0) {
  const requested = Math.max(0, Number(requestedAmount) || 0);
  const remaining = Math.max(0, (Number(targetAmount) || 0) - (Number(savedAmount) || 0));
  return round2(Math.min(requested, remaining));
}

function compareDateOnly(a, b) {
  return String(a || '').localeCompare(String(b || ''));
}

export function isRecurringDue(rec = {}, today) {
  if (!today || !rec.startDate || compareDateOnly(today, rec.startDate) < 0) return false;
  const last = rec.lastAdded || rec.startDate;
  if (compareDateOnly(today, last) <= 0) return false;
  if (rec.freq === 'yearly') return today.slice(0, 4) !== last.slice(0, 4);
  if (rec.freq === 'monthly') return today.slice(0, 7) !== last.slice(0, 7);
  if (rec.freq === 'weekly') return weekKey(today) !== weekKey(last);
  return false;
}

export function recurringOccurrenceKey(rec = {}, today) {
  const id = rec.id || 'recurring';
  if (rec.freq === 'yearly') return `${id}:yearly:${today.slice(0, 4)}`;
  if (rec.freq === 'weekly') return `${id}:weekly:${weekKey(today)}`;
  return `${id}:monthly:${today.slice(0, 7)}`;
}
