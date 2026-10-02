const prefixFor = uid => `spendsmart_commands_v1_${encodeURIComponent(uid)}:`;
export const QUEUE_EVENT = 'spendsmart-financial-queue';

export function readCommands(uid) {
  try {
    const commands = [];
    const prefix = prefixFor(uid);
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      const item = JSON.parse(raw);
      if (!item || !item.id || key !== prefix + item.id || !['goal', 'loan'].includes(item.type) || !item.targetId || !Number.isFinite(item.amount) || item.amount <= 0) throw new Error();
      commands.push(item);
    }
    return commands.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  } catch {
    throw new Error('Offline queue read nahi ho rahi. Browser data clear mat karo; backup/support se recover karo.');
  }
}

function changed(uid) {
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail: uid }));
}

export function enqueueCommand(uid, input) {
  const now = new Date();
  const command = {
    ...input,
    id: `offline_${window.crypto?.randomUUID?.() || `${now.getTime()}_${Math.random().toString(36).slice(2)}`}`,
    date: now.toISOString().slice(0, 10), createdAt: now.toISOString(),
  };
  readCommands(uid);
  if (!['goal', 'loan'].includes(command.type) || !command.targetId || !Number.isFinite(command.amount) || command.amount <= 0) throw new Error('Invalid financial command.');
  // One atomic key per command prevents another tab's append/ack from losing entries.
  localStorage.setItem(prefixFor(uid) + command.id, JSON.stringify(command));
  changed(uid);
  return command;
}

export function removeCommand(uid, id) {
  localStorage.removeItem(prefixFor(uid) + id);
  changed(uid);
}

export function cancelTargetCommands(uid, type, targetId) {
  for (const item of readCommands(uid)) {
    if (item.type === type && item.targetId === targetId) localStorage.removeItem(prefixFor(uid) + item.id);
  }
  changed(uid);
}
