import { waitForLocalCommit, writeLocal } from './localWrites';

// These tests exercise promise acknowledgement; browser tests exercise the SDK/IndexedDB.
jest.mock('./firebase', () => ({ db: {}, persistenceReady: Promise.resolve(false) }));

test('local persistence finishes the UI flow even while the server is offline', async () => {
  const neverAcknowledged = new Promise(() => {});
  await expect(waitForLocalCommit(neverAcknowledged, Promise.resolve('persisted'), jest.fn())).resolves.toBe('persisted');
});

test('a local storage failure is not reported as a successful save', async () => {
  await expect(waitForLocalCommit(new Promise(() => {}), Promise.reject(new Error('disk full')), jest.fn())).rejects.toThrow('disk full');
});

test('a later server rejection is reported after local acceptance', async () => {
  let rejectServer;
  const server = new Promise((resolve, reject) => { rejectServer = reject; });
  const report = jest.fn();
  await waitForLocalCommit(server, Promise.resolve(), report);
  rejectServer(new Error('permission denied'));
  await Promise.resolve();
  expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'permission denied' }));
});

test('an immediate server rejection prevents a success response', async () => {
  await expect(waitForLocalCommit(Promise.reject(new Error('denied')), new Promise(() => {}), jest.fn())).rejects.toThrow('denied');
});

test('memory fallback refuses a save instead of promising durable offline storage', async () => {
  const alert = jest.spyOn(window, 'alert').mockImplementation(() => {});
  await expect(writeLocal([{ ref: { path: 'users/alice/transactions/t1' }, data: { amount: 100 } }])).rejects.toThrow('Persistent offline storage unavailable');
  expect(alert).toHaveBeenCalledWith(expect.stringContaining('Entry save nahi hui'));
  alert.mockRestore();
});
