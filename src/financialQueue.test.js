import { enqueueCommand, readCommands, removeCommand, cancelTargetCommands } from './financialQueue';

beforeEach(() => localStorage.clear());

test('commands survive module reads and are isolated per account', () => {
  const command = enqueueCommand('alice', { type: 'goal', targetId: 'g1', amount: 200 });
  expect(readCommands('alice')).toEqual([command]);
  expect(readCommands('bob')).toEqual([]);
  expect(command.id).toBeTruthy();
});

test('removing a receipt leaves other commands intact', () => {
  const first = enqueueCommand('alice', { type: 'goal', targetId: 'g1', amount: 200 });
  const second = enqueueCommand('alice', { type: 'goal', targetId: 'g1', amount: 300 });
  removeCommand('alice', first.id);
  expect(readCommands('alice')).toEqual([second]);
});

test('deleting a target cancels only its pending commands', () => {
  enqueueCommand('alice', { type: 'goal', targetId: 'same', amount: 200 });
  const loan = enqueueCommand('alice', { type: 'loan', targetId: 'same', amount: 300 });
  cancelTargetCommands('alice', 'goal', 'same');
  expect(readCommands('alice')).toEqual([loan]);
});

test('corrupt persisted commands are reported rather than overwritten', () => {
  localStorage.setItem('spendsmart_commands_v1_alice:broken', '{broken');
  expect(() => readCommands('alice')).toThrow(/queue/i);
  expect(() => enqueueCommand('alice', { type: 'goal', targetId: 'g1', amount: 10 })).toThrow();
  expect(localStorage.getItem('spendsmart_commands_v1_alice:broken')).toBe('{broken');
});
