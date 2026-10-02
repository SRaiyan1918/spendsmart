import { createWriteIntents, readWriteIntents, markWriteAccepted, inspectWrite, rejectWriteIntent, acknowledgeWriteIntent } from './writeJournal';

beforeEach(() => localStorage.clear());

test('a durable write intent survives reopening and retains data after rejection', () => {
  const [intent] = createWriteIntents('alice', [{ ref: { path: 'users/alice/transactions/t1' }, data: { amount: 100, note: 'offline' } }]);
  markWriteAccepted(intent);
  const reopened = readWriteIntents('alice')[0];
  expect(reopened.accepted).toBe(true);
  expect(inspectWrite(reopened, { fromCache: false, hasPendingWrites: false, exists: false })).toBe('conflict');
  expect(rejectWriteIntent(reopened, 'denied')).toBe(true);
  expect(readWriteIntents('alice')[0]).toMatchObject({ data: { amount: 100 }, error: 'denied' });
  expect(rejectWriteIntent(reopened, 'denied')).toBe(false);
});

test('cached or still-pending data cannot confirm or reject a write', () => {
  const [intent] = createWriteIntents('alice', [{ ref: { path: 'users/alice' }, data: { monthlyBudget: 100 } }]);
  expect(inspectWrite(intent, { fromCache: true, hasPendingWrites: false, exists: false })).toBe('pending');
  expect(inspectWrite(intent, { fromCache: false, hasPendingWrites: true, exists: false })).toBe('pending');
});

test('sequential offline patches preserve both intended fields', () => {
  createWriteIntents('alice', [{ ref: { path: 'users/alice' }, type: 'update', data: { monthlyBudget: 100 } }]);
  const [intent] = createWriteIntents('alice', [{ ref: { path: 'users/alice' }, type: 'update', data: { currency: 'USD' } }]);
  expect(intent.data).toEqual({ monthlyBudget: 100, currency: 'USD' });
  expect(inspectWrite(intent, { fromCache: false, hasPendingWrites: false, exists: true, data: { monthlyBudget: 100, currency: 'USD', name: 'Ali' } })).toBe('confirmed');
});

test('an older acknowledgement cannot remove a newer write to the same document', () => {
  const [old] = createWriteIntents('alice', [{ ref: { path: 'users/alice' }, data: { currency: 'INR' } }]);
  const [next] = createWriteIntents('alice', [{ ref: { path: 'users/alice' }, data: { currency: 'USD' } }]);
  acknowledgeWriteIntent(old);
  expect(readWriteIntents('alice')[0].id).toBe(next.id);
});

test('a server-confirmed deletion can clear its intent', () => {
  const [intent] = createWriteIntents('alice', [{ ref: { path: 'users/alice/transactions/t1' }, type: 'delete' }]);
  expect(inspectWrite(intent, { fromCache: false, hasPendingWrites: false, exists: false })).toBe('confirmed');
  acknowledgeWriteIntent(intent);
  expect(readWriteIntents('alice')).toEqual([]);
});
