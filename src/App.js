import { useState, useEffect, useCallback } from "react";

const COLORS = {
  background: '#0A0A0A',
  cards: '#1A1A2E',
  purple: '#7C4DFF',
  green: '#00C853',
  red: '#FF1744',
  white: '#FFFFFF',
  grey: '#888888',
};

const DEFAULT_INCOME_CATEGORIES = ['Salary', 'Freelance', 'Business', 'Investment', 'Other'];
const DEFAULT_EXPENSE_CATEGORIES = ['Food', 'Transport', 'Entertainment', 'Utilities', 'Shopping', 'Health', 'Other'];

// ─── Storage Helpers ──────────────────────────────────────────────────────────
const LS_KEY = 'spendsmart_data';

function saveToLocalStorage(data) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (e) {}
}
function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
async function saveToCloud(data) {
  try { await window.storage.set('spendsmart_data', JSON.stringify(data)); } catch (e) {}
}
async function loadFromCloud() {
  try {
    const result = await window.storage.get('spendsmart_data');
    return result?.value ? JSON.parse(result.value) : null;
  } catch (e) { return null; }
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function SpendSmart() {
  const [screen, setScreen] = useState('dashboard');
  const [transactions, setTransactions] = useState([]);
  const [incomeCategories, setIncomeCategories] = useState(DEFAULT_INCOME_CATEGORIES);
  const [expenseCategories, setExpenseCategories] = useState(DEFAULT_EXPENSE_CATEGORIES);
  const [monthlyBudget, setMonthlyBudget] = useState(10000);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [loaded, setLoaded] = useState(false);

  const [txType, setTxType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [selCategory, setSelCategory] = useState('');
  const [selDate, setSelDate] = useState(new Date().toISOString().split('T')[0]);
  const [newCat, setNewCat] = useState('');
  const [budgetInput, setBudgetInput] = useState('10000');

  // Load: cloud first, then localStorage fallback
  useEffect(() => {
    (async () => {
      let data = await loadFromCloud();
      if (!data) data = loadFromLocalStorage();
      if (data) {
        setTransactions(data.transactions || []);
        setIncomeCategories(data.incomeCategories || DEFAULT_INCOME_CATEGORIES);
        setExpenseCategories(data.expenseCategories || DEFAULT_EXPENSE_CATEGORIES);
        setMonthlyBudget(data.monthlyBudget || 10000);
        setBudgetInput(String(data.monthlyBudget || 10000));
      }
      setLoaded(true);
    })();
  }, []);

  // Auto-save on every change (after load)
  const persist = useCallback(async (txns, inCats, exCats, budget) => {
    const data = { transactions: txns, incomeCategories: inCats, expenseCategories: exCats, monthlyBudget: budget, lastSaved: new Date().toISOString() };
    setSaveStatus('saving');
    saveToLocalStorage(data);         // instant
    await saveToCloud(data);          // cloud backup
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus(''), 2500);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    persist(transactions, incomeCategories, expenseCategories, monthlyBudget);
  }, [transactions, incomeCategories, expenseCategories, monthlyBudget, loaded]);

  // Computed
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = totalIncome - totalExpense;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlySpend = transactions.filter(t => t.type === 'expense' && t.date.startsWith(currentMonth)).reduce((s, t) => s + t.amount, 0);
  const budgetPct = monthlyBudget > 0 ? (monthlySpend / monthlyBudget) * 100 : 0;
  const budgetWarn = budgetPct >= 80;
  const progColor = budgetPct > 100 ? COLORS.red : budgetPct > 80 ? '#FFA500' : COLORS.green;

  const cats = txType === 'income' ? incomeCategories : expenseCategories;

  const filtered = transactions.filter(t => {
    const okType = filterType === 'all' || t.type === filterType;
    const q = searchText.toLowerCase();
    const okSearch = (t.note || '').toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
    return okType && okSearch;
  });

  const addTransaction = () => {
    if (!amount || !selCategory) { alert('Amount aur Category zaroori hai!'); return; }
    setTransactions(p => [{ id: Date.now(), type: txType, category: selCategory, amount: parseFloat(amount), date: selDate, note }, ...p]);
    setAmount(''); setNote(''); setSelCategory(''); setNewCat('');
    setTxType('expense'); setSelDate(new Date().toISOString().split('T')[0]);
    setShowAddModal(false);
  };

  const addCustomCat = () => {
    if (!newCat.trim()) return;
    if (txType === 'income') { if (!incomeCategories.includes(newCat)) { setIncomeCategories(p => [...p, newCat]); setSelCategory(newCat); } }
    else { if (!expenseCategories.includes(newCat)) { setExpenseCategories(p => [...p, newCat]); setSelCategory(newCat); } }
    setNewCat('');
  };

  const deleteTx = id => { if (window.confirm('Delete karna chahte ho?')) setTransactions(p => p.filter(t => t.id !== id)); };

  // Style helpers
  const card = (extra = {}) => ({ backgroundColor: COLORS.cards, borderRadius: 12, padding: 16, marginBottom: 12, ...extra });
  const btn = (bg, extra = {}) => ({ border: 'none', borderRadius: 8, cursor: 'pointer', backgroundColor: bg, color: COLORS.white, fontWeight: 600, ...extra });

  if (!loaded) return (
    <div style={{ backgroundColor: COLORS.background, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 48 }}>💸</div>
      <div style={{ color: COLORS.purple, fontSize: 22, fontWeight: 'bold' }}>SpendSmart</div>
      <div style={{ color: COLORS.grey, fontSize: 13 }}>Loading your data...</div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif", backgroundColor: COLORS.background, minHeight: '100vh', color: COLORS.white, display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid #222` }}>
        <span style={{ fontSize: 24, fontWeight: 'bold' }}>💸 SpendSmart</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {saveStatus === 'saving' && <span style={{ fontSize: 11, color: COLORS.grey }}>🔄 Saving...</span>}
          {saveStatus === 'saved'  && <span style={{ fontSize: 11, color: COLORS.green }}>✅ Saved!</span>}
          <button onClick={() => setScreen('budget')} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer' }}>⚙️</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, paddingBottom: 90 }}>

        {/* DASHBOARD */}
        {screen === 'dashboard' && <>
          <div style={{ ...card({ textAlign: 'center', padding: 24, borderLeftWidth: 0 }) }}>
            <div style={{ fontSize: 13, color: COLORS.grey, marginBottom: 6 }}>Total Balance</div>
            <div style={{ fontSize: 46, fontWeight: 'bold', color: balance >= 0 ? COLORS.green : COLORS.red }}>₹{balance.toFixed(2)}</div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ ...card({ flex: 1, marginBottom: 0, borderLeft: `4px solid ${COLORS.green}` }) }}>
              <div style={{ fontSize: 12, color: COLORS.grey, marginBottom: 4 }}>Income</div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: COLORS.green }}>+₹{totalIncome.toFixed(2)}</div>
            </div>
            <div style={{ ...card({ flex: 1, marginBottom: 0, borderLeft: `4px solid ${COLORS.red}` }) }}>
              <div style={{ fontSize: 12, color: COLORS.grey, marginBottom: 4 }}>Expense</div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: COLORS.red }}>-₹{totalExpense.toFixed(2)}</div>
            </div>
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 10, marginTop: 4 }}>Recent Transactions</div>
          {transactions.length === 0
            ? <div style={{ ...card({ textAlign: 'center', padding: 30 }) }}><div style={{ fontSize: 30, marginBottom: 6 }}>📭</div><div style={{ color: COLORS.grey }}>Koi transaction nahi abhi</div></div>
            : transactions.slice(0, 5).map(t => (
              <div key={t.id} style={{ ...card({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12 }) }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{t.category}</div>
                  <div style={{ fontSize: 11, color: COLORS.grey }}>{t.date}{t.note ? ` • ${t.note}` : ''}</div>
                </div>
                <div style={{ fontWeight: 'bold', color: t.type === 'income' ? COLORS.green : COLORS.red }}>{t.type === 'income' ? '+' : '-'}₹{t.amount.toFixed(2)}</div>
              </div>
            ))
          }
        </>}

        {/* HISTORY */}
        {screen === 'history' && <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
            {['all','income','expense'].map(f => (
              <button key={f} onClick={() => setFilterType(f)}
                style={{ ...btn(filterType === f ? COLORS.purple : COLORS.cards, { padding: '8px 16px', borderRadius: 20, whiteSpace: 'nowrap', fontSize: 13 }) }}>
                {f === 'all' ? 'All' : f === 'income' ? '📈 Income' : '📉 Expense'}
              </button>
            ))}
          </div>
          <input placeholder="🔍 Search..." value={searchText} onChange={e => setSearchText(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', backgroundColor: COLORS.cards, border: 'none', borderRadius: 8, padding: 12, color: COLORS.white, marginBottom: 12, fontSize: 14, outline: 'none' }} />
          {filtered.length === 0
            ? <div style={{ ...card({ textAlign: 'center', padding: 30 }) }}><div style={{ fontSize: 30, marginBottom: 6 }}>🔍</div><div style={{ color: COLORS.grey }}>Kuch nahi mila</div></div>
            : filtered.map(t => (
              <div key={t.id} style={{ ...card({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12 }) }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{t.category}</div>
                  <div style={{ fontSize: 11, color: COLORS.grey }}>{t.date}{t.note ? ` • ${t.note}` : ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontWeight: 'bold', color: t.type === 'income' ? COLORS.green : COLORS.red }}>{t.type === 'income' ? '+' : '-'}₹{t.amount.toFixed(2)}</div>
                  <button onClick={() => deleteTx(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>🗑️</button>
                </div>
              </div>
            ))
          }
        </>}

        {/* BUDGET */}
        {screen === 'budget' && <>
          <div style={{ ...card({ textAlign: 'center', padding: 24 }) }}>
            <div style={{ fontSize: 13, color: COLORS.grey, marginBottom: 6 }}>Monthly Budget</div>
            <div style={{ fontSize: 44, fontWeight: 'bold', color: COLORS.purple, marginBottom: 12 }}>₹{monthlyBudget.toFixed(2)}</div>
            <button onClick={() => { setShowBudgetModal(true); setBudgetInput(String(monthlyBudget)); }}
              style={{ ...btn(COLORS.purple, { padding: '8px 20px' }) }}>Edit Budget</button>
          </div>
          <div style={{ ...card({ borderLeft: `4px solid ${COLORS.purple}` }) }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: COLORS.grey }}>Monthly Spending</span>
              <span style={{ fontWeight: 'bold', color: budgetWarn ? COLORS.red : COLORS.green }}>₹{monthlySpend.toFixed(2)}</span>
            </div>
            <div style={{ height: 18, backgroundColor: '#111', borderRadius: 9, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', width: `${Math.min(budgetPct, 100)}%`, backgroundColor: progColor, borderRadius: 9, transition: 'width 0.5s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: COLORS.grey }}>{budgetPct.toFixed(1)}% used</span>
              <span style={{ fontSize: 11, color: budgetWarn ? COLORS.red : COLORS.green }}>₹{(monthlyBudget - monthlySpend).toFixed(2)} remaining</span>
            </div>
            {budgetWarn && <div style={{ backgroundColor: '#FF174422', borderRadius: 8, padding: 10, marginTop: 10, border: '1px solid #FF174444' }}>
              <span style={{ color: COLORS.red, fontSize: 13 }}>⚠️ {budgetPct.toFixed(1)}% budget use ho gaya!</span>
            </div>}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Top Expenses This Month</div>
          {expenseCategories.map(cat => {
            const tot = transactions.filter(t => t.type === 'expense' && t.category === cat && t.date.startsWith(currentMonth)).reduce((s, t) => s + t.amount, 0);
            return tot > 0 ? (
              <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #222' }}>
                <span style={{ fontSize: 14 }}>{cat}</span>
                <span style={{ color: COLORS.red, fontWeight: 'bold' }}>₹{tot.toFixed(2)}</span>
              </div>
            ) : null;
          })}
        </>}
      </div>

      {/* Bottom Nav */}
      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, backgroundColor: COLORS.cards, display: 'flex', borderTop: '1px solid #222', zIndex: 50 }}>
        {[['dashboard','📊','Dashboard'],['history','📜','History'],['budget','💰','Budget']].map(([s,ic,lb]) => (
          <button key={s} onClick={() => setScreen(s)}
            style={{ flex: 1, padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer', color: screen === s ? COLORS.purple : COLORS.grey, fontWeight: 500, fontSize: 11 }}>
            <div style={{ fontSize: 20 }}>{ic}</div>{lb}
          </button>
        ))}
      </div>

      {/* FAB */}
      <button onClick={() => setShowAddModal(true)}
        style={{ position: 'fixed', bottom: 72, right: 16, width: 54, height: 54, borderRadius: 27, backgroundColor: COLORS.purple, border: 'none', cursor: 'pointer', fontSize: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 18px rgba(124,77,255,0.7)', zIndex: 51 }}>
        ➕
      </button>

      {/* ADD MODAL */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.88)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ backgroundColor: COLORS.background, width: '100%', maxWidth: 480, borderRadius: '16px 16px 0 0', maxHeight: '92vh', overflowY: 'auto', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <span style={{ fontSize: 20, fontWeight: 'bold' }}>Add Transaction</span>
              <button onClick={() => { setShowAddModal(false); setAmount(''); setNote(''); setSelCategory(''); setNewCat(''); }} style={{ background: 'none', border: 'none', color: COLORS.white, fontSize: 24, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
              <button onClick={() => { setTxType('income'); setSelCategory(''); }}
                style={{ ...btn(txType === 'income' ? COLORS.green : COLORS.cards, { flex: 1, padding: 12 }) }}>📈 Income</button>
              <button onClick={() => { setTxType('expense'); setSelCategory(''); }}
                style={{ ...btn(txType === 'expense' ? COLORS.red : COLORS.cards, { flex: 1, padding: 12 }) }}>📉 Expense</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Amount *</div>
              <input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', backgroundColor: COLORS.cards, border: 'none', borderRadius: 8, padding: 14, fontSize: 26, fontWeight: 'bold', color: COLORS.white, textAlign: 'center', outline: 'none' }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Note (Optional)</div>
              <textarea placeholder="Kuch likhna hai?" value={note} onChange={e => setNote(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', backgroundColor: COLORS.cards, border: 'none', borderRadius: 8, padding: 10, color: COLORS.white, minHeight: 60, resize: 'vertical', fontSize: 13, outline: 'none' }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Category *</div>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                {cats.map(c => (
                  <button key={c} onClick={() => setSelCategory(c)}
                    style={{ ...btn(selCategory === c ? COLORS.purple : COLORS.cards, { padding: '7px 14px', borderRadius: 20, fontSize: 12, whiteSpace: 'nowrap', border: selCategory === c ? `2px solid ${COLORS.purple}` : '2px solid transparent' }) }}>{c}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Custom Category</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input placeholder="Naya category..." value={newCat} onChange={e => setNewCat(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustomCat()}
                  style={{ flex: 1, backgroundColor: COLORS.cards, border: 'none', borderRadius: 8, padding: '0 12px', color: COLORS.white, fontSize: 13, height: 42, outline: 'none' }} />
                <button onClick={addCustomCat} style={{ ...btn(COLORS.purple, { width: 42, height: 42, fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }) }}>+</button>
              </div>
            </div>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Date</div>
              <input type="date" value={selDate} onChange={e => setSelDate(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', backgroundColor: COLORS.cards, border: 'none', borderRadius: 8, padding: 10, color: COLORS.white, fontSize: 13, outline: 'none', colorScheme: 'dark' }} />
            </div>
            <button onClick={addTransaction} style={{ ...btn(COLORS.purple, { width: '100%', padding: 14, fontSize: 15, marginBottom: 20 }) }}>💾 Save Transaction</button>
          </div>
        </div>
      )}

      {/* BUDGET MODAL */}
      {showBudgetModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...card({ width: '78%', maxWidth: 290, marginBottom: 0 }) }}>
            <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 14 }}>💰 Budget Set Karo</div>
            <input type="number" value={budgetInput} onChange={e => setBudgetInput(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', backgroundColor: COLORS.background, border: 'none', borderRadius: 8, padding: 12, color: COLORS.white, fontSize: 16, outline: 'none', marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowBudgetModal(false)} style={{ ...btn(COLORS.grey, { flex: 1, padding: 12 }) }}>Cancel</button>
              <button onClick={() => { setMonthlyBudget(parseFloat(budgetInput) || 10000); setShowBudgetModal(false); }} style={{ ...btn(COLORS.purple, { flex: 1, padding: 12 }) }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
