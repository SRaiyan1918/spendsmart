import { doc, getDocFromCache, writeBatch } from 'firebase/firestore';
import { db, persistenceReady } from './firebase';
import { createWriteIntents, readWriteIntents, inspectWrite, markWriteAccepted, acknowledgeWriteIntent, rejectWriteIntent } from './writeJournal';

// Call only after waitForPendingWrites: cached mutations have now received a server
// decision. Settle their journals before a financial transaction changes the same doc.
export async function confirmLocalWrites(uid) {
  for (const intent of readWriteIntents(uid)) {
    if (intent.error) continue;
    const snapshot = await getDocFromCache(doc(db, intent.path));
    const outcome = inspectWrite(intent, { fromCache: false, hasPendingWrites: snapshot.metadata.hasPendingWrites, exists: snapshot.exists(), data: snapshot.data() });
    if (outcome === 'confirmed') acknowledgeWriteIntent(intent);
    else if (outcome === 'conflict' && rejectWriteIntent(intent, 'Write reject hua ya doosre device se replace hua.')) {
      window.alert('Offline change server par confirm nahi hua. Entry ka backup phone par retained hai; account permissions check karo.');
    }
  }
}

export async function waitForLocalCommit(serverPromise, localPromise, reportError) {
  let locallyAccepted = false;
  const server = serverPromise.catch(error => {
    if (locallyAccepted) { reportError(error); return; }
    throw error;
  });
  const result = await Promise.race([localPromise, server]);
  locallyAccepted = true;
  return result;
}

export async function writeLocal(writes) {
  if (!writes.length) return;
  if (!(await persistenceReady)) {
    window.alert('Phone par permanent offline storage available nahi hai. Normal browser mode mein app reopen karo. Entry save nahi hui.');
    throw new Error('Persistent offline storage unavailable');
  }
  let intents = [];
  const batch = writeBatch(db);
  for (const { ref, type = 'set', data, merge = false } of writes) {
    if (type === 'delete') batch.delete(ref);
    else if (type === 'update') batch.update(ref, data);
    else if (merge) batch.set(ref, data, { merge: true });
    else batch.set(ref, data);
  }
  const reportError = error => {
    const newlyReported = intents.map(intent => rejectWriteIntent(intent, error.message)).some(Boolean);
    if (newlyReported) window.alert(`Data server par sync nahi hua: ${error.message}. Entry ka backup phone par retained hai; account permissions check karo.`);
  };
  try {
    const uid = writes[0].ref.path.split('/')[1];
    intents = createWriteIntents(uid, writes);
    // Firestore serializes these cache reads after the batch's local IndexedDB commit.
    // Its normal commit promise waits for the server and cannot finish an offline UI flow.
    const server = batch.commit();
    const local = Promise.all(writes.map(({ ref }) => getDocFromCache(ref)));
    await waitForLocalCommit(server, local, reportError);
    for (const intent of intents) markWriteAccepted(intent);
    server.then(() => { for (const intent of intents) acknowledgeWriteIntent(intent); }, reportError);
  } catch (error) {
    reportError(error);
    window.alert(`Save nahi hua: ${error.message}`);
    throw error;
  }
}

export async function addLocal(collectionRef, data) {
  const ref = doc(collectionRef);
  await writeLocal([{ ref, data }]);
  return ref;
}

export const updateLocal = (ref, data) => writeLocal([{ ref, type: 'update', data }]);
export const setLocal = (ref, data, options = {}) => writeLocal([{ ref, data, merge: options.merge }]);
export const deleteLocal = ref => writeLocal([{ ref, type: 'delete' }]);
