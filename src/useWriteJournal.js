import { useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, persistenceReady } from './firebase';
import { WRITE_EVENT, readWriteIntents, markWriteAccepted, inspectWrite, acknowledgeWriteIntent, rejectWriteIntent } from './writeJournal';

export default function useWriteJournal(uid) {
  useEffect(() => {
    let stopped = false;
    const listeners = new Map();
    const storageStatus = { reported: false };
    const report = (record, message) => {
      if (rejectWriteIntent(record, message)) window.alert(`Offline change server par confirm nahi hua: ${message}. Entry ka backup is phone par retained hai; account permissions check karo.`);
    };
    const refresh = async () => {
      if (!(await persistenceReady) || stopped) return;
      try {
        const records = readWriteIntents(uid);
        const paths = new Set(records.filter(item => !item.error).map(item => item.path));
        for (const [path, unsubscribe] of listeners) {
          if (!paths.has(path)) { unsubscribe(); listeners.delete(path); }
        }
        for (const record of records) {
          if (record.error || listeners.has(record.path) || (!record.accepted && Date.now() - record.createdAt < 10000)) continue;
          const unsubscribe = onSnapshot(doc(db, record.path), { includeMetadataChanges: true }, snapshot => {
            try {
              const current = readWriteIntents(uid).find(item => item.path === record.path);
              if (!current || current.error) return;
              if (snapshot.metadata.hasPendingWrites && !current.accepted) { markWriteAccepted(current); return; }
              const outcome = inspectWrite(current, { ...snapshot.metadata, exists: snapshot.exists(), data: snapshot.data() });
              if (outcome === 'confirmed') acknowledgeWriteIntent(current);
              else if (outcome === 'conflict') report(current, 'Write reject hua ya doosre device se replace hua.');
            } catch (error) { if (!storageStatus.reported) { storageStatus.reported = true; window.alert(`Offline backup read nahi ho raha: ${error.message}`); } }
          }, error => report(record, error.message));
          listeners.set(record.path, unsubscribe);
        }
      } catch (error) { if (!storageStatus.reported) { storageStatus.reported = true; window.alert(`Offline backup read nahi ho raha: ${error.message}`); } }
    };
    void refresh();
    window.addEventListener(WRITE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    const timer = setInterval(refresh, 10000);
    return () => {
      stopped = true; clearInterval(timer);
      window.removeEventListener(WRITE_EVENT, refresh);
      window.removeEventListener('storage', refresh);
      for (const unsubscribe of listeners.values()) unsubscribe();
    };
  }, [uid]);
}
