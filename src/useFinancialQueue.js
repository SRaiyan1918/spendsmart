import { useEffect, useState } from 'react';
import { doc, runTransaction, waitForPendingWrites } from 'firebase/firestore';
import { auth, db } from './firebase';
import { applyFinancialCommand } from './financialCommands';
import { QUEUE_EVENT, readCommands, removeCommand } from './financialQueue';
import { confirmLocalWrites } from './localWrites';

// The transfer document is the replay receipt, so retries need no new Firestore rules.
export async function replayFinancialCommand(uid, command) {
  const targetRef = doc(db, 'users', uid, command.type === 'goal' ? 'savings' : 'udhar', command.targetId);
  const receiptRef = doc(db, 'users', uid, 'transactions', command.id);
  return runTransaction(db, async transaction => {
    const receipt = await transaction.get(receiptRef);
    if (receipt.exists()) return { actual: receipt.data().amount };
    const target = await transaction.get(targetRef);
    const result = applyFinancialCommand(command, target.exists() ? target.data() : null);
    const { id, ...data } = result.transaction;
    transaction.update(targetRef, result.patch);
    transaction.set(receiptRef, data);
    return { actual: result.actual };
  });
}

export default function useFinancialQueue(uid, transactions) {
  const [commands, setCommands] = useState([]);
  useEffect(() => {
    let stopped = false;
    let busy = false;
    const reported = new Set();
    const refresh = () => {
      try { const items = readCommands(uid); if (!stopped) setCommands(items); return items; }
      catch (error) {
        if (!reported.has('storage')) { reported.add('storage'); window.alert(error.message); }
        return [];
      }
    };
    const flush = async () => {
      if (busy || stopped || !navigator.onLine || auth.currentUser?.uid !== uid) return;
      busy = true;
      try {
        // Newly created goals/loans may still be in Firestore's ordinary write queue.
        // Drain those writes before deciding a server target has been deleted.
        await waitForPendingWrites(db);
        if (stopped || !navigator.onLine || auth.currentUser?.uid !== uid) return;
        await confirmLocalWrites(uid);
        for (const command of refresh()) {
          if (stopped || !navigator.onLine || auth.currentUser?.uid !== uid) break;
          if (!readCommands(uid).some(item => item.id === command.id)) continue;
          try {
            const result = await replayFinancialCommand(uid, command);
            // Keep the projection durable until the live/cache listener has the receipt.
            if (result.actual < command.amount && !reported.has(`adjusted_${command.id}`)) {
              reported.add(`adjusted_${command.id}`);
              window.alert(`Savings sync: goal mein sirf remaining ₹${Number(result.actual).toFixed(2)} allocate hua.`);
            }
          } catch (error) {
            const transient = ['unavailable', 'deadline-exceeded', 'aborted', 'cancelled'].includes(error.code);
            if (!transient && navigator.onLine && !reported.has(command.id)) {
              reported.add(command.id);
              if (['target-missing', 'goal-complete', 'loan-overpayment'].includes(error.code)) {
                if (window.confirm(`Offline entry sync nahi hui: ${error.message}\nIs pending entry ko cancel karna hai? Cancel dabane par entry phone par retained rahegi.`)) removeCommand(uid, command.id);
              } else {
                window.alert(`Offline entry abhi sync nahi hui: ${error.message}. Entry phone par retained hai; account permissions check karo.`);
              }
            }
            // Network failures preserve order; a permanently invalid target must not block others.
            if (transient || !navigator.onLine) break;
          }
        }
      } catch (error) {
        if (!stopped && navigator.onLine && error.code !== 'cancelled') console.warn('Pending writes not yet synchronized', error);
      } finally { busy = false; refresh(); }
    };
    const changed = () => { refresh(); void flush(); };
    refresh(); void flush();
    window.addEventListener(QUEUE_EVENT, changed);
    window.addEventListener('storage', changed);
    window.addEventListener('online', changed);
    const timer = setInterval(flush, 10000);
    return () => {
      stopped = true; clearInterval(timer);
      window.removeEventListener(QUEUE_EVENT, changed);
      window.removeEventListener('storage', changed);
      window.removeEventListener('online', changed);
    };
  }, [uid]);
  useEffect(() => {
    try {
      const receipts = new Set(transactions.map(item => item.id));
      for (const command of readCommands(uid)) {
        if (receipts.has(command.id)) removeCommand(uid, command.id);
      }
    } catch (error) { window.alert(`Offline queue acknowledgement failed: ${error.message}`); }
  }, [uid, transactions, commands]);
  return commands;
}
