export const WRITE_EVENT = 'spendsmart-write-journal';
const prefix = uid => `spendsmart_writes_v1_${encodeURIComponent(uid)}:`;
const keyFor = intent => prefix(intent.uid) + encodeURIComponent(intent.path);
const notify = uid => window.dispatchEvent(new CustomEvent(WRITE_EVENT, { detail: uid }));

export function readWriteIntents(uid) {
  const records = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix(uid))) {
      const raw = localStorage.getItem(key);
      if (raw) records.push(JSON.parse(raw));
    }
  }
  return records;
}

export function createWriteIntents(uid, writes) {
  return writes.map(({ ref, type = 'set', data, merge = false }) => {
    const key = prefix(uid) + encodeURIComponent(ref.path);
    const old = JSON.parse(localStorage.getItem(key) || 'null');
    const intent = {
      id: window.crypto?.randomUUID?.() || `${Date.now()}_${Math.random()}`,
      uid, path: ref.path, type, merge, accepted: false, createdAt: Date.now(),
      ...(type !== 'delete' ? { data: (type === 'update' || merge) && old?.type !== 'delete' ? { ...(old?.data || {}), ...data } : data } : {}),
    };
    localStorage.setItem(key, JSON.stringify(intent));
    return intent;
  });
}

export function markWriteAccepted(intent) {
  const current = JSON.parse(localStorage.getItem(keyFor(intent)) || 'null');
  if (current?.id === intent.id) {
    localStorage.setItem(keyFor(intent), JSON.stringify({ ...current, accepted: true }));
    notify(intent.uid);
  }
}

export function acknowledgeWriteIntent(intent) {
  const current = JSON.parse(localStorage.getItem(keyFor(intent)) || 'null');
  if (current?.id === intent.id) { localStorage.removeItem(keyFor(intent)); notify(intent.uid); }
}

export function rejectWriteIntent(intent, error) {
  const current = JSON.parse(localStorage.getItem(keyFor(intent)) || 'null');
  if (current?.id !== intent.id || current.error) return false;
  localStorage.setItem(keyFor(intent), JSON.stringify({ ...current, accepted: true, error }));
  notify(intent.uid);
  return true;
}

export function inspectWrite(intent, snapshot) {
  if (snapshot.fromCache || snapshot.hasPendingWrites) return 'pending';
  if (intent.type === 'delete') return snapshot.exists ? 'conflict' : 'confirmed';
  if (!snapshot.exists) return 'conflict';
  return Object.entries(intent.data).every(([key, value]) => JSON.stringify(snapshot.data?.[key]) === JSON.stringify(value)) ? 'confirmed' : 'conflict';
}

export function hasRejectedWrite(uid, path) {
  const record = JSON.parse(localStorage.getItem(prefix(uid) + encodeURIComponent(path)) || 'null');
  return !!record?.error;
}
