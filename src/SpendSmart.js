import { useEffect, useMemo, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query,
  runTransaction, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import {
  buildGraphData, calculatePeriodTotals, calculateTotals, fromBaseAmount,
  getGoalAllocationAmount, isRecurringDue, normalizeTransaction,
  recurringOccurrenceKey, toBaseAmount, validatePositiveAmount,
} from './financeLogic';
import { CURRENCIES, fetchRates, symbolOf } from './currency';
import { C, Empty, Field, Modal, ModalHeader, SectionTitle, TxRow, btn, card, inp } from './ui';

const DEF_IN = ['Salary', 'Freelance', 'Business', 'Investment', 'Other'];
const DEF_EX = ['Food', 'Transport', 'Entertainment', 'Utilities', 'Shopping', 'Health', 'Other'];
const today = () => new Date().toISOString().slice(0, 10);
const monthNow = () => today().slice(0, 7);
const safeNum = value => Number.isFinite(Number(value)) ? Number(value) : 0;

function printReport(rows, title, fmt) {
  const popup = window.open('', '_blank');
  if (!popup) return alert('PDF/print report ke liye popup allow karo.');
  const clean = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  const totals = calculateTotals(rows);
  const body = rows.map(raw => {
    const tx = normalizeTransaction(raw);
    const incoming = tx.type === 'income' || (tx.type === 'transfer' && tx.direction === 'in');
    const sign = tx.type === 'refund' ? '↩ ' : incoming ? '+' : '-';
    return `<tr><td>${clean(tx.date)}</td><td>${clean(tx.type)}</td><td>${clean(tx.category)}</td><td>${clean(tx.note)}</td><td>${sign}${clean(fmt(tx.amount))}</td></tr>`;
  }).join('');
  popup.document.write(`<!doctype html><html><head><title>SpendSmart Report</title><style>body{font-family:Arial;padding:24px;color:#111}h1{color:#6d45e8}.summary{display:flex;gap:12px;flex-wrap:wrap}.box{background:#f4f4f6;border-radius:8px;padding:10px 14px}table{width:100%;border-collapse:collapse;margin-top:18px;font-size:12px}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}th{background:#6d45e8;color:white}</style></head><body><h1>SpendSmart</h1><p>${clean(title)}</p><div class="summary"><div class="box">Income<br><b>${clean(fmt(totals.income))}</b></div><div class="box">Net expense<br><b>${clean(fmt(totals.expense))}</b></div><div class="box">Transfers out<br><b>${clean(fmt(totals.transferOut))}</b></div><div class="box">Spendable<br><b>${clean(fmt(totals.spendableBalance))}</b></div></div><table><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Note</th><th>Amount</th></tr></thead><tbody>${body}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
  popup.document.close();
}

export default function SpendSmart({ user }) {
  const uid = user.uid;
  const [screen, setScreen] = useState('home');
  const [loaded, setLoaded] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [goals, setGoals] = useState([]);
  const [loans, setLoans] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [settings, setSettings] = useState({ name: '', monthlyBudget: 10000, currency: 'INR', incomeCategories: DEF_IN, expenseCategories: DEF_EX });
  const [rates, setRates] = useState(null);
  const [ratesLoading, setRatesLoading] = useState(false);
  const recurringBusy = useRef(new Set());

  const [txModal, setTxModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [txType, setTxType] = useState('expense');
  const [txAmount, setTxAmount] = useState('');
  const [txCategory, setTxCategory] = useState('');
  const [txNote, setTxNote] = useState('');
  const [txDate, setTxDate] = useState(today());
  const [newCategory, setNewCategory] = useState('');

  const [goalModal, setGoalModal] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalEmoji, setGoalEmoji] = useState('🎯');
  const [goalDeadline, setGoalDeadline] = useState('');
  const [goalPrompt, setGoalPrompt] = useState(false);
  const [goalPick, setGoalPick] = useState('');
  const [goalAmount, setGoalAmount] = useState('');

  const [loanModal, setLoanModal] = useState(false);
  const [loanType, setLoanType] = useState('gave');
  const [loanName, setLoanName] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [loanDate, setLoanDate] = useState(today());
  const [loanDue, setLoanDue] = useState('');
  const [loanNote, setLoanNote] = useState('');
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [returnAmount, setReturnAmount] = useState('');

  const [recModal, setRecModal] = useState(false);
  const [recType, setRecType] = useState('expense');
  const [recAmount, setRecAmount] = useState('');
  const [recCategory, setRecCategory] = useState('');
  const [recFreq, setRecFreq] = useState('monthly');
  const [recNote, setRecNote] = useState('');
  const [recStart, setRecStart] = useState(today());

  const [budgetModal, setBudgetModal] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [currencyModal, setCurrencyModal] = useState(false);
  const [historyType, setHistoryType] = useState('all');
  const [historyMonth, setHistoryMonth] = useState(monthNow());
  const [search, setSearch] = useState('');
  const [graphPeriod, setGraphPeriod] = useState('monthly');

  const currency = settings.currency || 'INR';
  const toBase = value => toBaseAmount(value, currency, rates);
  const fromBase = value => fromBaseAmount(value, currency, rates);
  const fmt = value => `${symbolOf(currency)}${fromBase(value).toFixed(2)}`;
  const txCategories = txType === 'income' ? settings.incomeCategories : settings.expenseCategories;

  useEffect(() => onSnapshot(doc(db, 'users', uid), snap => {
    const data = snap.data() || {};
    setSettings({
      name: data.name || '', monthlyBudget: data.monthlyBudget ?? 10000,
      currency: data.currency || 'INR',
      incomeCategories: Array.isArray(data.incomeCategories) ? data.incomeCategories : DEF_IN,
      expenseCategories: Array.isArray(data.expenseCategories) ? data.expenseCategories : DEF_EX,
    });
  }), [uid]);

  useEffect(() => onSnapshot(collection(db, 'users', uid, 'transactions'), snap => {
    const rows = snap.docs
      .map(item => normalizeTransaction({ id: item.id, ...item.data() }))
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
    setTransactions(rows);
    setLoaded(true);
  }), [uid]);

  useEffect(() => onSnapshot(collection(db, 'users', uid, 'savings'), snap => {
    setGoals(snap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
  }), [uid]);

  useEffect(() => onSnapshot(collection(db, 'users', uid, 'udhar'), snap => {
    setLoans(snap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
  }), [uid]);

  useEffect(() => onSnapshot(collection(db, 'users', uid, 'recurring'), snap => {
    setRecurring(snap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
  }), [uid]);

  useEffect(() => {
    if (currency === 'INR') { setRates(null); setRatesLoading(false); return; }
    setRatesLoading(true);
    fetchRates().then(value => { setRates(value); setRatesLoading(false); });
  }, [currency]);

  useEffect(() => {
    const current = today();
    recurring.forEach(async item => {
      if (!isRecurringDue(item, current)) return;
      const occurrence = recurringOccurrenceKey(item, current);
      if (recurringBusy.current.has(occurrence)) return;
      recurringBusy.current.add(occurrence);
      try {
        const id = `recurring_${occurrence.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        await setDoc(doc(db, 'users', uid, 'transactions', id), {
          type: item.type, category: item.category, amount: safeNum(item.amount), date: current,
          note: item.note || '🔄 Recurring', recurringId: item.id, occurrence,
          createdAt: new Date().toISOString(),
        });
        await updateDoc(doc(db, 'users', uid, 'recurring', item.id), { lastAdded: current });
      } catch (error) {
        console.error('Recurring transaction failed', error);
      } finally {
        recurringBusy.current.delete(occurrence);
      }
    });
  }, [recurring, uid]);

  const totals = useMemo(() => calculateTotals(transactions), [transactions]);
  const currentMonthTotals = useMemo(() => calculatePeriodTotals(transactions, tx => (tx.date || '').startsWith(monthNow())), [transactions]);
  const graphData = useMemo(() => buildGraphData(transactions, graphPeriod), [transactions, graphPeriod]);
  const totalSaved = goals.reduce((sum, goal) => sum + safeNum(goal.savedAmount), 0);
  const budgetPct = settings.monthlyBudget > 0 ? currentMonthTotals.expense / settings.monthlyBudget * 100 : 0;

  const baseAmountOrAlert = value => {
    const validation = validatePositiveAmount(value);
    if (!validation.ok) { alert(validation.message); return null; }
    const amount = toBase(value);
    if (!Number.isFinite(amount)) { alert('Currency rate load nahi hua. INR select karo ya dobara try karo.'); return null; }
    return amount;
  };

  const resetTx = () => {
    setEditing(null); setTxType('expense'); setTxAmount(''); setTxCategory('');
    setTxNote(''); setTxDate(today()); setNewCategory(''); setTxModal(false);
  };

  const openEdit = tx => {
    if (tx.type === 'transfer') return alert('Linked transfer ko Savings/Udhar section se manage karo.');
    setEditing(tx); setTxType(tx.type); setTxAmount(String(fromBase(tx.amount)));
    setTxCategory(tx.category || ''); setTxNote(tx.note || ''); setTxDate(tx.date || today()); setTxModal(true);
  };

  const saveTransaction = async () => {
    if (!txCategory) return alert('Category select karo.');
    const amount = baseAmountOrAlert(txAmount); if (amount == null) return;
    const data = { type: txType, category: txCategory, amount, date: txDate || today(), note: txNote.trim() };
    if (editing) {
      await updateDoc(doc(db, 'users', uid, 'transactions', editing.id), data);
    } else {
      await addDoc(collection(db, 'users', uid, 'transactions'), { ...data, createdAt: new Date().toISOString() });
      const activeGoals = goals.filter(goal => !goal.archived && safeNum(goal.savedAmount) < safeNum(goal.targetAmount));
      if (txType === 'income' && activeGoals.length) {
        setGoalAmount(txAmount); setGoalPick(''); setGoalPrompt(true);
      }
    }
    resetTx();
  };

  const deleteTransaction = async tx => {
    if (tx.type === 'transfer' || tx.udharId || tx.goalId || tx.recurringId) return alert('Linked item ko source section se delete/manage karo.');
    if (window.confirm('Transaction delete karna hai?')) await deleteDoc(doc(db, 'users', uid, 'transactions', tx.id));
  };

  const addCategory = async () => {
    const value = newCategory.trim(); if (!value) return;
    const key = txType === 'income' ? 'incomeCategories' : 'expenseCategories';
    const current = settings[key] || [];
    if (!current.includes(value)) await setDoc(doc(db, 'users', uid), { [key]: [...current, value] }, { merge: true });
    setTxCategory(value); setNewCategory('');
  };

  const createGoal = async () => {
    if (!goalTitle.trim()) return alert('Goal title daalo.');
    const targetAmount = baseAmountOrAlert(goalTarget); if (targetAmount == null) return;
    await addDoc(collection(db, 'users', uid, 'savings'), {
      title: goalTitle.trim(), targetAmount, savedAmount: 0, emoji: goalEmoji,
      deadline: goalDeadline || '', archived: false, createdAt: new Date().toISOString(),
    });
    setGoalTitle(''); setGoalTarget(''); setGoalDeadline(''); setGoalEmoji('🎯'); setGoalModal(false);
  };

  const allocateGoal = async () => {
    if (!goalPick) return alert('Goal choose karo.');
    const requested = baseAmountOrAlert(goalAmount); if (requested == null) return;
    const goalRef = doc(db, 'users', uid, 'savings', goalPick);
    const txRef = doc(collection(db, 'users', uid, 'transactions'));
    let actual = 0;
    try {
      await runTransaction(db, async transaction => {
        const snap = await transaction.get(goalRef);
        if (!snap.exists()) throw new Error('Goal not found');
        const goal = snap.data();
        actual = getGoalAllocationAmount(requested, goal.targetAmount, goal.savedAmount || 0);
        if (actual <= 0) throw new Error('Goal already complete');
        const savedAmount = safeNum(goal.savedAmount) + actual;
        const complete = savedAmount >= safeNum(goal.targetAmount);
        transaction.update(goalRef, { savedAmount, archived: complete, ...(complete ? { completedAt: today() } : {}) });
        transaction.set(txRef, {
          type: 'transfer', direction: 'out', transferKind: 'savings', isSavingsAllocation: true,
          goalId: goalPick, category: `🏦 ${goal.emoji || '🎯'} ${goal.title}`, amount: actual,
          date: today(), note: 'Savings Goal Allocation', createdAt: new Date().toISOString(),
        });
      });
      if (actual < requested) alert(`Goal me sirf remaining ${fmt(actual)} allocate hua.`);
      setGoalPrompt(false); setGoalPick(''); setGoalAmount('');
    } catch (error) {
      alert(error?.message || 'Goal allocation failed.');
    }
  };

  const deleteGoal = async goal => {
    if (!window.confirm(`Goal “${goal.title}” delete karna hai? Linked allocations bhi remove honge.`)) return;
    const linked = await getDocs(query(collection(db, 'users', uid, 'transactions'), where('goalId', '==', goal.id)));
    const legacy = transactions.filter(tx => tx.transferKind === 'savings' && !tx.goalId && tx.note === '💰 Savings Goal Allocation' && String(tx.category || '').endsWith(goal.title));
    const batch = writeBatch(db);
    linked.docs.forEach(item => batch.delete(item.ref));
    legacy.forEach(tx => batch.delete(doc(db, 'users', uid, 'transactions', tx.id)));
    batch.delete(doc(db, 'users', uid, 'savings', goal.id));
    await batch.commit();
  };

  const saveLoan = async () => {
    if (!loanName.trim()) return alert('Naam daalo.');
    const amount = baseAmountOrAlert(loanAmount); if (amount == null) return;
    const loanRef = await addDoc(collection(db, 'users', uid, 'udhar'), {
      type: loanType, name: loanName.trim(), amount, returned: 0, dueDate: loanDue || '',
      note: loanNote.trim(), date: loanDate || today(), status: 'active', returns: [],
      createdAt: new Date().toISOString(),
    });
    await addDoc(collection(db, 'users', uid, 'transactions'), {
      type: 'transfer', direction: loanType === 'gave' ? 'out' : 'in',
      transferKind: loanType === 'gave' ? 'loan_given' : 'loan_taken',
      category: loanType === 'gave' ? '🤝 Udhar Diya' : '🤝 Udhar Liya', amount,
      date: loanDate || today(), note: `${loanType === 'gave' ? 'Udhar diya' : 'Udhar liya'}: ${loanName.trim()}`,
      udharId: loanRef.id, createdAt: new Date().toISOString(),
    });
    setLoanName(''); setLoanAmount(''); setLoanDate(today()); setLoanDue(''); setLoanNote(''); setLoanType('gave'); setLoanModal(false);
  };

  const addLoanReturn = async () => {
    if (!selectedLoan) return;
    const amount = baseAmountOrAlert(returnAmount); if (amount == null) return;
    const remaining = Math.max(0, safeNum(selectedLoan.amount) - safeNum(selectedLoan.returned));
    if (amount > remaining) {
      return alert(selectedLoan.type === 'gave' ? 'Original remaining amount se zyada record nahi kar sakte. Riba se bacho.' : `Remaining sirf ${fmt(remaining)} hai.`);
    }
    const returned = safeNum(selectedLoan.returned) + amount;
    const complete = returned >= safeNum(selectedLoan.amount);
    await updateDoc(doc(db, 'users', uid, 'udhar', selectedLoan.id), {
      returned, status: complete ? 'completed' : 'active', completedAt: complete ? today() : null,
      returns: [...(selectedLoan.returns || []), { amount, date: today() }],
    });
    await addDoc(collection(db, 'users', uid, 'transactions'), {
      type: 'transfer', direction: selectedLoan.type === 'gave' ? 'in' : 'out',
      transferKind: selectedLoan.type === 'gave' ? 'loan_returned' : 'loan_repaid',
      category: selectedLoan.type === 'gave' ? '🤝 Udhar Wapas' : '🤝 Udhar Chukaya',
      amount, date: today(), note: selectedLoan.type === 'gave' ? `Udhar wapas mila: ${selectedLoan.name}` : `Udhar chukaya: ${selectedLoan.name}`,
      udharId: selectedLoan.id, createdAt: new Date().toISOString(),
    });
    setSelectedLoan(null); setReturnAmount('');
  };

  const deleteLoan = async loan => {
    if (!window.confirm(`${loan.name} ka udhar delete karna hai? Linked transfers bhi remove honge.`)) return;
    const linked = await getDocs(query(collection(db, 'users', uid, 'transactions'), where('udharId', '==', loan.id)));
    const batch = writeBatch(db);
    linked.docs.forEach(item => batch.delete(item.ref));
    batch.delete(doc(db, 'users', uid, 'udhar', loan.id));
    await batch.commit();
  };

  const saveRecurring = async () => {
    if (!recCategory) return alert('Category choose karo.');
    const amount = baseAmountOrAlert(recAmount); if (amount == null) return;
    await addDoc(collection(db, 'users', uid, 'recurring'), {
      type: recType, category: recCategory, amount, note: recNote.trim(), freq: recFreq,
      startDate: recStart, lastAdded: recStart, createdAt: new Date().toISOString(),
    });
    setRecType('expense'); setRecAmount(''); setRecCategory(''); setRecFreq('monthly'); setRecNote(''); setRecStart(today()); setRecModal(false);
  };

  const saveBudget = async () => {
    const parsed = Number(budgetInput);
    if (!Number.isFinite(parsed) || parsed < 0) return alert('Budget 0 ya positive amount hona chahiye.');
    const base = parsed === 0 ? 0 : toBase(parsed);
    if (!Number.isFinite(base)) return alert('Currency rate load nahi hua.');
    await setDoc(doc(db, 'users', uid), { monthlyBudget: base }, { merge: true });
    setBudgetModal(false);
  };

  const filteredHistory = useMemo(() => transactions.filter(tx => {
    if (historyType !== 'all' && tx.type !== historyType) return false;
    if (historyMonth && !(tx.date || '').startsWith(historyMonth)) return false;
    const needle = search.trim().toLowerCase();
    return !needle || String(tx.category || '').toLowerCase().includes(needle) || String(tx.note || '').toLowerCase().includes(needle);
  }), [transactions, historyType, historyMonth, search]);
  const historyTotals = useMemo(() => calculateTotals(filteredHistory), [filteredHistory]);

  const categorySpend = category => {
    let value = 0;
    transactions.filter(tx => (tx.date || '').startsWith(monthNow()) && tx.category === category).forEach(tx => {
      if (tx.type === 'expense') value += tx.amount;
      if (tx.type === 'refund') value -= tx.amount;
    });
    return Math.max(0, value);
  };

  if (!loaded) return null;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: 'Segoe UI, sans-serif', maxWidth: 520, margin: '0 auto', paddingBottom: 78 }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 30, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(23,23,40,.97)', borderBottom: `1px solid ${C.line}`, padding: '11px 14px' }}>
        <div><b>💸 SpendSmart</b><div style={{ color: C.grey, fontSize: 10 }}>{settings.name || user.email}</div></div>
        <div style={{ display: 'flex', gap: 7 }}>
          <button style={btn(C.card2, { color: C.purple, padding: '7px 9px', border: `1px solid ${C.line}` })} onClick={() => setCurrencyModal(true)}>{ratesLoading ? '⏳' : symbolOf(currency)} {currency}</button>
          <button title="Recurring" style={btn(C.card2, { padding: '7px 9px', border: `1px solid ${C.line}` })} onClick={() => setRecModal(true)}>🔄</button>
          <button title="Logout" style={btn('#32131a', { color: C.red, padding: '7px 9px' })} onClick={() => signOut(auth)}>🚪</button>
        </div>
      </header>

      <main style={{ padding: 13 }}>
        {screen === 'home' && <>
          <div style={card({ background: 'linear-gradient(135deg,#171728,#18233d)', marginBottom: 11, textAlign: 'center', padding: 20 })}>
            <div style={{ color: C.grey, fontSize: 11 }}>Available / Spendable Balance</div>
            <div style={{ fontSize: 37, fontWeight: 800, color: totals.spendableBalance >= 0 ? C.green : C.red }}>{fmt(totals.spendableBalance)}</div>
            <div style={{ color: C.grey, fontSize: 10, marginTop: 5 }}>Savings aur udhar expense analytics ko distort nahi karte.</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 11 }}>
            <Stat label="This month income" value={`+${fmt(currentMonthTotals.income)}`} color={C.green} />
            <Stat label="This month net expense" value={`-${fmt(currentMonthTotals.expense)}`} color={C.red} />
            <Stat label="Saved in goals" value={fmt(totalSaved)} color={C.purple} />
            <Stat label="Refunds" value={`↩ ${fmt(totals.refunds)}`} color={C.orange} />
          </div>
          <SectionTitle title="🏦 Savings Goals" action="+ Goal" onAction={() => setGoalModal(true)} />
          {goals.length === 0 && <Empty text="Koi savings goal nahi. Pehla goal banao." />}
          {goals.map(goal => <GoalCard key={goal.id} goal={goal} fmt={fmt} onDelete={() => deleteGoal(goal)} onAdd={() => { setGoalPick(goal.id); setGoalAmount(''); setGoalPrompt(true); }} />)}
          <SectionTitle title="Recent Activity" />
          {transactions.length === 0 ? <Empty text="Abhi koi transaction nahi." /> : transactions.slice(0, 6).map(tx => <TxRow key={tx.id} tx={tx} fmt={fmt} onEdit={() => openEdit(tx)} />)}
        </>}

        {screen === 'history' && <>
          <h2 style={{ fontSize: 19, marginTop: 2 }}>History</h2>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 8 }}>
            {[['all','All'],['income','Income'],['expense','Expense'],['refund','Refund'],['transfer','Transfers']].map(([value,label]) => <button key={value} style={btn(historyType === value ? C.purple : C.card, { whiteSpace: 'nowrap', padding: '7px 10px', fontSize: 11 })} onClick={() => setHistoryType(value)}>{label}</button>)}
          </div>
          <input type="month" value={historyMonth} onChange={e => setHistoryMonth(e.target.value)} style={inp({ marginBottom: 7, colorScheme: 'dark' })} />
          <input placeholder="Search category/note" value={search} onChange={e => setSearch(e.target.value)} style={inp({ marginBottom: 9 })} />
          <div style={{ display: 'flex', gap: 8, marginBottom: 9 }}><Stat label="Income" value={fmt(historyTotals.income)} color={C.green} /><Stat label="Net expense" value={fmt(historyTotals.expense)} color={C.red} /></div>
          <button style={btn(C.card, { width: '100%', border: `1px solid ${C.purple}`, color: C.purple, marginBottom: 10 })} onClick={() => printReport(filteredHistory, `${settings.name || user.email} • ${historyMonth || 'All time'}`, fmt)}>📄 Print / PDF Report</button>
          {filteredHistory.length === 0 ? <Empty text="No matching transactions." /> : filteredHistory.map(tx => <TxRow key={tx.id} tx={tx} fmt={fmt} onEdit={() => openEdit(tx)} onDelete={() => deleteTransaction(tx)} />)}
        </>}

        {screen === 'analytics' && <>
          <h2 style={{ fontSize: 19, marginTop: 2 }}>Analytics</h2>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>{['weekly','monthly','yearly'].map(period => <button key={period} style={btn(graphPeriod === period ? C.purple : C.card, { flex: 1, fontSize: 11 })} onClick={() => setGraphPeriod(period)}>{period}</button>)}</div>
          <div style={card({ marginBottom: 12 })}>
            <b>Income vs Expense</b>
            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              {graphData.length === 0 ? <span style={{ color: C.grey }}>No data</span> : graphData.map(row => <GraphRow key={row.key} row={row} fmt={fmt} />)}
            </div>
          </div>
          <div style={card()}><b>This Month Category Spend</b><div style={{ marginTop: 9 }}>{settings.expenseCategories.map(category => { const value = categorySpend(category); return value > 0 ? <div key={category} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.line}` }}><span style={{ fontSize: 12 }}>{category}</span><b style={{ color: C.red, fontSize: 12 }}>{fmt(value)}</b></div> : null; })}</div></div>
        </>}

        {screen === 'budget' && <>
          <h2 style={{ fontSize: 19, marginTop: 2 }}>Budget</h2>
          <div style={card({ textAlign: 'center', marginBottom: 11 })}><div style={{ color: C.grey, fontSize: 11 }}>Monthly Budget</div><div style={{ fontSize: 31, color: C.purple, fontWeight: 800 }}>{fmt(settings.monthlyBudget)}</div><button style={btn(C.purple, { marginTop: 9 })} onClick={() => { setBudgetInput(String(fromBase(settings.monthlyBudget))); setBudgetModal(true); }}>Edit Budget</button></div>
          <div style={card()}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>Net spending</span><b>{fmt(currentMonthTotals.expense)}</b></div>{settings.monthlyBudget > 0 ? <><div style={{ height: 13, background: '#09090f', borderRadius: 9, overflow: 'hidden', margin: '11px 0 6px' }}><div style={{ height: '100%', width: `${Math.min(100, budgetPct)}%`, background: budgetPct >= 100 ? C.red : budgetPct >= 80 ? C.orange : C.green }} /></div><div style={{ fontSize: 11, color: budgetPct >= 80 ? C.orange : C.grey }}>{budgetPct.toFixed(1)}% used • {fmt(Math.max(0, settings.monthlyBudget - currentMonthTotals.expense))} remaining</div>{budgetPct >= 100 && <div style={{ color: C.red, marginTop: 9, fontSize: 11 }}>🚨 Monthly budget cross ho gaya.</div>}{budgetPct >= 80 && budgetPct < 100 && <div style={{ color: C.orange, marginTop: 9, fontSize: 11 }}>⚠️ Budget ka 80%+ use ho gaya.</div>}</> : <div style={{ color: C.grey, marginTop: 10, fontSize: 11 }}>Budget disabled hai.</div>}</div>
        </>}

        {screen === 'udhar' && <>
          <SectionTitle title="🤝 Udhar" action="+ Add" onAction={() => setLoanModal(true)} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <Stat label="Mujhe wapas milna" value={fmt(loans.filter(x => x.type === 'gave' && x.status === 'active').reduce((s,x) => s + safeNum(x.amount) - safeNum(x.returned), 0))} color={C.orange} />
            <Stat label="Mujhe chukana" value={fmt(loans.filter(x => x.type === 'took' && x.status === 'active').reduce((s,x) => s + safeNum(x.amount) - safeNum(x.returned), 0))} color={C.purple} />
          </div>
          {loans.length === 0 ? <Empty text="Koi udhar record nahi." /> : loans.map(loan => <LoanCard key={loan.id} loan={loan} fmt={fmt} onDelete={() => deleteLoan(loan)} onReturn={() => { setSelectedLoan(loan); setReturnAmount(''); }} />)}
        </>}
      </main>

      <button aria-label="Add transaction" style={{ position: 'fixed', right: 18, bottom: 70, zIndex: 50, width: 52, height: 52, borderRadius: '50%', border: 0, background: C.purple, color: C.white, fontSize: 22, boxShadow: '0 6px 20px #7c4dff88', cursor: 'pointer' }} onClick={() => { resetTx(); setTxModal(true); }}>＋</button>
      <nav style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 520, display: 'flex', background: C.card, borderTop: `1px solid ${C.line}`, zIndex: 40 }}>
        {[['home','🏠','Home'],['history','📜','History'],['analytics','📈','Graphs'],['budget','💰','Budget'],['udhar','🤝','Udhar']].map(([value,icon,label]) => <button key={value} style={{ flex: 1, background: 'none', border: 0, color: screen === value ? C.purple : C.grey, padding: '9px 2px', cursor: 'pointer', fontSize: 9 }} onClick={() => setScreen(value)}><div style={{ fontSize: 16 }}>{icon}</div>{label}</button>)}
      </nav>

      {txModal && <Modal bottom onClose={resetTx}><ModalHeader title={editing ? 'Edit Transaction' : 'Add Transaction'} close={resetTx} /><div style={{ display: 'flex', gap: 6, marginBottom: 11 }}>{[['income','Income',C.green],['expense','Expense',C.red],['refund','Refund',C.orange]].map(([value,label,color]) => <button key={value} style={btn(txType === value ? color : C.card, { flex: 1, fontSize: 11 })} onClick={() => { setTxType(value); setTxCategory(''); }}>{label}</button>)}</div><Field label={`Amount (${currency})`}><input type="number" value={txAmount} onChange={e => setTxAmount(e.target.value)} style={inp({ fontSize: 20, fontWeight: 800 })} /></Field><Field label="Category"><div style={{ display: 'flex', gap: 5, overflowX: 'auto' }}>{txCategories.map(category => <button key={category} style={btn(txCategory === category ? C.purple : C.card2, { whiteSpace: 'nowrap', fontSize: 10, padding: '6px 9px' })} onClick={() => setTxCategory(category)}>{category}</button>)}</div></Field><Field label="Custom category"><div style={{ display: 'flex', gap: 6 }}><input value={newCategory} onChange={e => setNewCategory(e.target.value)} style={inp()} /><button style={btn()} onClick={addCategory}>+</button></div></Field><Field label="Note"><input value={txNote} onChange={e => setTxNote(e.target.value)} style={inp()} /></Field><Field label="Date"><input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} style={inp({ colorScheme: 'dark' })} /></Field><button style={btn(C.purple, { width: '100%' })} onClick={saveTransaction}>Save</button></Modal>}

      {goalModal && <Modal bottom onClose={() => setGoalModal(false)}><ModalHeader title="New Savings Goal" close={() => setGoalModal(false)} /><Field label="Emoji"><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{['🎯','📱','🚗','🏠','✈️','💻','📚','💍'].map(emoji => <button key={emoji} style={btn(goalEmoji === emoji ? C.purple : C.card2, { fontSize: 18, padding: 7 })} onClick={() => setGoalEmoji(emoji)}>{emoji}</button>)}</div></Field><Field label="Title"><input value={goalTitle} onChange={e => setGoalTitle(e.target.value)} style={inp()} /></Field><Field label={`Target (${currency})`}><input type="number" value={goalTarget} onChange={e => setGoalTarget(e.target.value)} style={inp()} /></Field><Field label="Deadline"><input type="date" value={goalDeadline} onChange={e => setGoalDeadline(e.target.value)} style={inp({ colorScheme: 'dark' })} /></Field><button style={btn(C.purple, { width: '100%' })} onClick={createGoal}>Create Goal</button></Modal>}

      {goalPrompt && <Modal onClose={() => setGoalPrompt(false)}><ModalHeader title="Allocate to Savings" close={() => setGoalPrompt(false)} /><div style={{ color: C.grey, fontSize: 11, marginBottom: 10 }}>Ye expense nahi hoga; savings transfer ke roop me track hoga.</div><Field label="Goal"><select value={goalPick} onChange={e => setGoalPick(e.target.value)} style={inp()}><option value="">Choose goal</option>{goals.filter(goal => !goal.archived && safeNum(goal.savedAmount) < safeNum(goal.targetAmount)).map(goal => <option key={goal.id} value={goal.id}>{goal.emoji} {goal.title} • {fmt(safeNum(goal.targetAmount) - safeNum(goal.savedAmount))} left</option>)}</select></Field><Field label={`Amount (${currency})`}><input type="number" value={goalAmount} onChange={e => setGoalAmount(e.target.value)} style={inp()} /></Field><button style={btn(C.purple, { width: '100%' })} onClick={allocateGoal}>Save to Goal</button></Modal>}

      {loanModal && <Modal bottom onClose={() => setLoanModal(false)}><ModalHeader title="Add Udhar" close={() => setLoanModal(false)} /><div style={{ display: 'flex', gap: 7, marginBottom: 10 }}><button style={btn(loanType === 'gave' ? C.orange : C.card, { flex: 1 })} onClick={() => setLoanType('gave')}>Maine diya</button><button style={btn(loanType === 'took' ? C.purple : C.card, { flex: 1 })} onClick={() => setLoanType('took')}>Maine liya</button></div><Field label="Name"><input value={loanName} onChange={e => setLoanName(e.target.value)} style={inp()} /></Field><Field label={`Amount (${currency})`}><input type="number" value={loanAmount} onChange={e => setLoanAmount(e.target.value)} style={inp()} /></Field><Field label="Date"><input type="date" value={loanDate} onChange={e => setLoanDate(e.target.value)} style={inp({ colorScheme: 'dark' })} /></Field><Field label="Due date"><input type="date" value={loanDue} onChange={e => setLoanDue(e.target.value)} style={inp({ colorScheme: 'dark' })} /></Field><Field label="Note"><input value={loanNote} onChange={e => setLoanNote(e.target.value)} style={inp()} /></Field><div style={{ fontSize: 10, color: C.orange, marginBottom: 10 }}>Udhar principal income/expense nahi hai; transfer ke roop me track hoga.</div><button style={btn(C.orange, { width: '100%' })} onClick={saveLoan}>Save Udhar</button></Modal>}

      {selectedLoan && <Modal onClose={() => setSelectedLoan(null)}><ModalHeader title={selectedLoan.type === 'gave' ? 'Wapas mila' : 'Maine chukaya'} close={() => setSelectedLoan(null)} /><div style={{ color: C.grey, fontSize: 11, marginBottom: 10 }}>Remaining: {fmt(safeNum(selectedLoan.amount) - safeNum(selectedLoan.returned))}</div><Field label={`Amount (${currency})`}><input type="number" value={returnAmount} onChange={e => setReturnAmount(e.target.value)} style={inp()} /></Field><button style={btn(C.orange, { width: '100%' })} onClick={addLoanReturn}>Confirm</button></Modal>}

      {recModal && <Modal bottom onClose={() => setRecModal(false)}><ModalHeader title="Recurring Transactions" close={() => setRecModal(false)} />{recurring.map(item => <div key={item.id} style={card({ marginBottom: 7, padding: 10, display: 'flex', justifyContent: 'space-between' })}><div><b style={{ fontSize: 12 }}>{item.category} • {fmt(item.amount)}</b><div style={{ color: C.grey, fontSize: 10 }}>{item.freq} • {item.note}</div></div><button style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={() => deleteDoc(doc(db, 'users', uid, 'recurring', item.id))}>🗑️</button></div>)}<hr style={{ borderColor: C.line, margin: '14px 0' }} /><div style={{ display: 'flex', gap: 7, marginBottom: 10 }}><button style={btn(recType === 'income' ? C.green : C.card, { flex: 1 })} onClick={() => { setRecType('income'); setRecCategory(''); }}>Income</button><button style={btn(recType === 'expense' ? C.red : C.card, { flex: 1 })} onClick={() => { setRecType('expense'); setRecCategory(''); }}>Expense</button></div><Field label={`Amount (${currency})`}><input type="number" value={recAmount} onChange={e => setRecAmount(e.target.value)} style={inp()} /></Field><Field label="Category"><div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>{(recType === 'income' ? settings.incomeCategories : settings.expenseCategories).map(category => <button key={category} style={btn(recCategory === category ? C.purple : C.card2, { whiteSpace: 'nowrap', fontSize: 10, padding: '6px 9px' })} onClick={() => setRecCategory(category)}>{category}</button>)}</div></Field><Field label="Frequency"><select value={recFreq} onChange={e => setRecFreq(e.target.value)} style={inp()}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></Field><Field label="Start date"><input type="date" value={recStart} onChange={e => setRecStart(e.target.value)} style={inp({ colorScheme: 'dark' })} /></Field><Field label="Note"><input value={recNote} onChange={e => setRecNote(e.target.value)} style={inp()} /></Field><button style={btn(C.orange, { width: '100%' })} onClick={saveRecurring}>Save recurring</button></Modal>}

      {budgetModal && <Modal onClose={() => setBudgetModal(false)}><ModalHeader title="Monthly Budget" close={() => setBudgetModal(false)} /><Field label={`Budget (${currency}) — 0 disables budget`}><input type="number" min="0" value={budgetInput} onChange={e => setBudgetInput(e.target.value)} style={inp()} /></Field><button style={btn(C.purple, { width: '100%' })} onClick={saveBudget}>Save</button></Modal>}

      {currencyModal && <Modal onClose={() => setCurrencyModal(false)}><ModalHeader title="Currency" close={() => setCurrencyModal(false)} /><div style={{ display: 'grid', gap: 7 }}>{CURRENCIES.map(([code, symbol, label]) => <button key={code} style={btn(currency === code ? C.purple : C.card2, { textAlign: 'left', border: `1px solid ${C.line}` })} onClick={async () => { await setDoc(doc(db, 'users', uid), { currency: code }, { merge: true }); setCurrencyModal(false); }}>{symbol} {label}<span style={{ float: 'right' }}>{code}</span></button>)}</div></Modal>}
    </div>
  );
}

function Stat({ label, value, color }) {
  return <div style={card({ flex: 1 })}><div style={{ color: C.grey, fontSize: 10 }}>{label}</div><b style={{ color }}>{value}</b></div>;
}

function GoalCard({ goal, fmt, onDelete, onAdd }) {
  const target = safeNum(goal.targetAmount);
  const saved = safeNum(goal.savedAmount);
  const pct = target > 0 ? Math.min(100, saved / target * 100) : 0;
  return <div style={card({ marginBottom: 9, borderLeft: `4px solid ${goal.archived ? C.green : C.purple}` })}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><div><b>{goal.emoji || '🎯'} {goal.title}</b><div style={{ color: C.grey, fontSize: 10, marginTop: 3 }}>{fmt(saved)} / {fmt(target)} {goal.deadline ? `• ${goal.deadline}` : ''}</div></div><button style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={onDelete}>🗑️</button></div><div style={{ height: 7, background: '#0b0b12', borderRadius: 9, marginTop: 9, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: goal.archived ? C.green : C.purple }} /></div><div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 10, color: C.grey }}><span>{pct.toFixed(0)}%</span>{!goal.archived && <button style={btn(C.purple, { padding: '4px 9px', fontSize: 10 })} onClick={onAdd}>Add money</button>}</div></div>;
}

function LoanCard({ loan, fmt, onDelete, onReturn }) {
  const remaining = Math.max(0, safeNum(loan.amount) - safeNum(loan.returned));
  return <div style={card({ marginBottom: 8, borderLeft: `4px solid ${loan.status === 'completed' ? C.green : loan.type === 'gave' ? C.orange : C.purple}` })}><div style={{ display: 'flex', justifyContent: 'space-between' }}><div><b>{loan.type === 'gave' ? '💸' : '💰'} {loan.name}</b><div style={{ color: C.grey, fontSize: 10 }}>{loan.type === 'gave' ? 'Maine diya' : 'Maine liya'} • {loan.date || ''}{loan.dueDate ? ` • due ${loan.dueDate}` : ''}</div></div><button style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={onDelete}>🗑️</button></div><div style={{ marginTop: 7, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 11, color: C.grey }}>{fmt(remaining)} remaining</span>{loan.status !== 'completed' && <button style={btn(loan.type === 'gave' ? C.orange : C.purple, { padding: '5px 9px', fontSize: 10 })} onClick={onReturn}>{loan.type === 'gave' ? 'Wapas mila?' : 'Chukaya?'}</button>}</div></div>;
}

function GraphRow({ row, fmt }) {
  const max = Math.max(row.income, row.expense, 1);
  return <div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.grey }}><span>{row.label}</span><span>+{fmt(row.income)} / -{fmt(row.expense)}</span></div><div style={{ display: 'flex', gap: 3, height: 8, marginTop: 4 }}><div style={{ width: `${row.income / max * 50}%`, background: C.green, borderRadius: 5 }} /><div style={{ width: `${row.expense / max * 50}%`, background: C.red, borderRadius: 5 }} /></div></div>;
}
