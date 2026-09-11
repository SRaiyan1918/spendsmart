import {
  buildGraphData,
  calculateTotals,
  fromBaseAmount,
  getGoalAllocationAmount,
  isRecurringDue,
  normalizeTransaction,
  recurringOccurrenceKey,
  toBaseAmount,
  validatePositiveAmount,
} from './financeLogic';

test('legacy savings allocation is a transfer, not an expense', () => {
  const tx = normalizeTransaction({ type: 'expense', note: '💰 Savings Goal Allocation', amount: 500 });
  expect(tx.type).toBe('transfer');
  expect(tx.direction).toBe('out');
});

test('refunds reduce spending while transfers stay outside income/expense', () => {
  expect(calculateTotals([
    { type: 'income', amount: 5000 },
    { type: 'expense', amount: 1200 },
    { type: 'refund', amount: 200 },
    { type: 'transfer', direction: 'out', amount: 1000 },
    { type: 'transfer', direction: 'in', amount: 250 },
  ])).toEqual({
    income: 5000,
    grossExpense: 1200,
    refunds: 200,
    expense: 1000,
    transfers: 750,
    transferOut: 1000,
    transferIn: 250,
    balance: 4000,
    spendableBalance: 3250,
  });
});

test('refund restores cash even if matching expense is outside selected data', () => {
  const totals = calculateTotals([{ type: 'income', amount: 1000 }, { type: 'refund', amount: 100 }]);
  expect(totals.expense).toBe(0);
  expect(totals.balance).toBe(1100);
});

test('graph treats refunds as negative expense', () => {
  const row = buildGraphData([
    { type: 'expense', amount: 400, date: '2026-09-03' },
    { type: 'refund', amount: 50, date: '2026-09-04' },
  ], 'monthly')[0];
  expect(row.expense).toBe(350);
});

test('currency amounts round-trip through INR base storage', () => {
  const rates = { INR: 1, USD: 0.012 };
  const inr = toBaseAmount(12, 'USD', rates);
  expect(inr).toBe(1000);
  expect(fromBaseAmount(inr, 'USD', rates)).toBe(12);
});

test('invalid amounts are rejected', () => {
  expect(validatePositiveAmount('10').ok).toBe(true);
  expect(validatePositiveAmount('0').ok).toBe(false);
  expect(validatePositiveAmount('-1').ok).toBe(false);
  expect(validatePositiveAmount('abc').ok).toBe(false);
});

test('goal allocation cannot exceed remaining target', () => {
  expect(getGoalAllocationAmount(700, 2000, 1500)).toBe(500);
});

test('recurring checks do not depend on existing transaction count', () => {
  const rec = { id: 'rent', freq: 'monthly', startDate: '2026-08-01', lastAdded: '2026-08-01' };
  expect(isRecurringDue(rec, '2026-09-11')).toBe(true);
  expect(recurringOccurrenceKey(rec, '2026-09-11')).toBe('rent:monthly:2026-09');
});
