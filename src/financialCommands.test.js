import { applyFinancialCommand, projectFinancialCommands } from './financialCommands';

const goal = { id: 'goal1', title: 'Trip', targetAmount: 1000, savedAmount: 200, emoji: '🎯' };
const allocation = { id: 'transfer1', type: 'goal', targetId: 'goal1', amount: 600, date: '2026-10-02', createdAt: '2026-10-02T12:00:00Z' };

test('offline allocations cap at the remaining goal and create linked transfers', () => {
  const result = applyFinancialCommand({ ...allocation, amount: 900 }, goal);
  expect(result.actual).toBe(800);
  expect(result.patch).toMatchObject({ savedAmount: 1000, archived: true });
  expect(result.transaction).toMatchObject({ id: 'transfer1', amount: 800, goalId: 'goal1', type: 'transfer', direction: 'out' });
});

test('multiple offline allocations use the projected balance', () => {
  const result = projectFinancialCommands([goal], [], [], [allocation, { ...allocation, id: 'transfer2' }]);
  expect(result.goals[0].savedAmount).toBe(1000);
  expect(result.transactions.map(tx => tx.amount)).toEqual([600, 200]);
});

test('a server receipt prevents duplicate allocation projection after replay', () => {
  const synced = { ...goal, savedAmount: 800 };
  const tx = { id: allocation.id, amount: 600, goalId: goal.id };
  const result = projectFinancialCommands([synced], [], [tx], [allocation]);
  expect(result.goals[0].savedAmount).toBe(800);
  expect(result.transactions).toHaveLength(1);
});

test('loan returns preserve linked cash direction and history', () => {
  const result = applyFinancialCommand({ ...allocation, type: 'loan', amount: 300 }, { id: 'goal1', name: 'Ali', type: 'gave', amount: 500, returned: 200, returns: [] });
  expect(result.patch).toMatchObject({ returned: 500, status: 'completed', returns: [{ amount: 300, date: '2026-10-02' }] });
  expect(result.transaction).toMatchObject({ udharId: 'goal1', direction: 'in', transferKind: 'loan_returned' });
});

test('loan replay refuses an overpayment instead of silently reducing it', () => {
  expect(() => applyFinancialCommand({ ...allocation, type: 'loan', amount: 400 }, { amount: 500, returned: 200 })).toThrow(/Remaining/);
});

test('missing targets and zero amounts cannot create money transfers', () => {
  expect(() => applyFinancialCommand(allocation, null)).toThrow();
  expect(() => applyFinancialCommand({ ...allocation, amount: 0 }, goal)).toThrow();
});
