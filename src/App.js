import { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  getDoc,
  setDoc,
} from "firebase/firestore";

// ─── Firebase Config ──────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyD2d1xHmkhJbFzCAf_3UKGeVTdkCkPGk54",
  authDomain: "spend-smart-eb084.firebaseapp.com",
  projectId: "spend-smart-eb084",
  storageBucket: "spend-smart-eb084.firebasestorage.app",
  messagingSenderId: "291802030949",
  appId: "1:291802030949:web:f06326beaaffeb2672778c",
  measurementId: "G-3MRWHZ3JCF",
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// ─── Constants ────────────────────────────────────────────────────────────────
const C = {
  bg: '#0A0A0A', cards: '#1A1A2E', purple: '#7C4DFF',
  green: '#00C853', red: '#FF1744', white: '#FFFFFF', grey: '#888888',
};
const DEF_IN = ['Salary','Freelance','Business','Investment','Other'];
const DEF_EX = ['Food','Transport','Entertainment','Utilities','Shopping','Health','Other'];

// ─── Reusable styles ──────────────────────────────────────────────────────────
const s = {
  card: (extra={}) => ({ backgroundColor: C.cards, borderRadius: 12, padding: 16, marginBottom: 12, ...extra }),
  btn: (bg, extra={}) => ({ border: 'none', borderRadius: 8, cursor: 'pointer', backgroundColor: bg, color: C.white, fontWeight: 600, ...extra }),
  input: (extra={}) => ({ backgroundColor: C.cards, border: 'none', borderRadius: 8, padding: 12, color: C.white, fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box', ...extra }),
};

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  if (authLoading) return <Loader text="Loading..." />;
  return user ? <SpendSmart user={user} /> : <AuthScreen />;
}

// ─── Loader ───────────────────────────────────────────────────────────────────
function Loader({ text }) {
  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 48 }}>💸</div>
      <div style={{ color: C.purple, fontSize: 22, fontWeight: 'bold' }}>SpendSmart</div>
      <div style={{ color: C.grey, fontSize: 13 }}>{text}</div>
    </div>
  );
}

// ─── Auth Screen ──────────────────────────────────────────────────────────────
function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    if (!email || !password) { setError('Email aur Password zaroori hai!'); return; }
    if (!isLogin && !name) { setError('Naam zaroori hai!'); return; }
    setLoading(true); setError('');
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        // Save user settings in Firestore
        await setDoc(doc(db, 'users', cred.user.uid), {
          name, email,
          monthlyBudget: 10000,
          incomeCategories: DEF_IN,
          expenseCategories: DEF_EX,
          createdAt: new Date().toISOString(),
        });
        // Migrate localStorage data if any
        try {
          const raw = localStorage.getItem('spendsmart_data');
          if (raw) {
            const old = JSON.parse(raw);
            if (old.transactions && old.transactions.length > 0) {
              for (const tx of old.transactions) {
                await addDoc(collection(db, 'users', cred.user.uid, 'transactions'), tx);
              }
              localStorage.removeItem('spendsmart_data');
            }
          }
        } catch (e) {}
      }
    } catch (e) {
      const msgs = {
        'auth/user-not-found': 'Email nahi mila!',
        'auth/wrong-password': 'Password galat hai!',
        'auth/email-already-in-use': 'Email already registered hai!',
        'auth/weak-password': 'Password kam se kam 6 characters ka hona chahiye!',
        'auth/invalid-email': 'Valid email daalo!',
        'auth/invalid-credential': 'Email ya Password galat hai!',
      };
      setError(msgs[e.code] || e.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Segoe UI', sans-serif", padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: 56, marginBottom: 8 }}>💸</div>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: C.white }}>SpendSmart</div>
          <div style={{ fontSize: 13, color: C.grey, marginTop: 4 }}>Apne paise ko smart banao</div>
        </div>

        {/* Card */}
        <div style={{ ...s.card({ padding: 24 }) }}>
          {/* Tabs */}
          <div style={{ display: 'flex', backgroundColor: C.bg, borderRadius: 8, padding: 4, marginBottom: 24 }}>
            {['Login','Sign Up'].map((t, i) => (
              <button key={t} onClick={() => { setIsLogin(i === 0); setError(''); }}
                style={{ ...s.btn(isLogin === (i===0) ? C.purple : 'transparent', { flex: 1, padding: '10px', borderRadius: 6, fontSize: 14 }) }}>
                {t}
              </button>
            ))}
          </div>

          {/* Fields */}
          {!isLogin && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: C.grey, marginBottom: 6 }}>Aapka Naam</div>
              <input placeholder="Jaise: Raiyan" value={name} onChange={e => setName(e.target.value)}
                style={s.input()} />
            </div>
          )}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: C.grey, marginBottom: 6 }}>Email</div>
            <input type="email" placeholder="example@gmail.com" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handle()}
              style={s.input()} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: C.grey, marginBottom: 6 }}>Password</div>
            <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handle()}
              style={s.input()} />
          </div>

          {error && <div style={{ backgroundColor: '#FF174422', border: '1px solid #FF174455', borderRadius: 8, padding: 10, marginBottom: 16, color: C.red, fontSize: 13 }}>⚠️ {error}</div>}

          <button onClick={handle} disabled={loading}
            style={{ ...s.btn(C.purple, { width: '100%', padding: 14, fontSize: 15 }), opacity: loading ? 0.7 : 1 }}>
            {loading ? '⏳ Please wait...' : isLogin ? '🔑 Login' : '🚀 Create Account'}
          </button>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, color: C.grey, fontSize: 13 }}>
          {isLogin ? "Account nahi hai? " : "Already account hai? "}
          <span onClick={() => { setIsLogin(!isLogin); setError(''); }} style={{ color: C.purple, cursor: 'pointer', fontWeight: 600 }}>
            {isLogin ? 'Sign Up karo' : 'Login karo'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main SpendSmart App ───────────────────────────────────────────────────────
function SpendSmart({ user }) {
  const [screen, setScreen] = useState('dashboard');
  const [transactions, setTransactions] = useState([]);
  const [userSettings, setUserSettings] = useState({ monthlyBudget: 10000, incomeCategories: DEF_IN, expenseCategories: DEF_EX, name: '' });
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [editingTx, setEditingTx] = useState(null); // transaction being edited

  // Form state
  const [txType, setTxType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [selCat, setSelCat] = useState('');
  const [selDate, setSelDate] = useState(new Date().toISOString().split('T')[0]);
  const [newCat, setNewCat] = useState('');
  const [budgetInput, setBudgetInput] = useState('10000');
  const [filterType, setFilterType] = useState('all');
  const [searchText, setSearchText] = useState('');

  const uid = user.uid;

  // ─── Load user settings ───
  useEffect(() => {
    const ref = doc(db, 'users', uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setUserSettings({ monthlyBudget: d.monthlyBudget || 10000, incomeCategories: d.incomeCategories || DEF_IN, expenseCategories: d.expenseCategories || DEF_EX, name: d.name || '' });
        setBudgetInput(String(d.monthlyBudget || 10000));
      }
    });
    return unsub;
  }, [uid]);

  // ─── Load transactions real-time ───
  useEffect(() => {
    const q = query(collection(db, 'users', uid, 'transactions'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const txns = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTransactions(txns);
      setLoaded(true);
    });
    return unsub;
  }, [uid]);

  // ─── Save user settings ───
  const saveSettings = async (updates) => {
    setSaveStatus('saving');
    await setDoc(doc(db, 'users', uid), updates, { merge: true });
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus(''), 2000);
  };

  // ─── Add / Edit transaction ───
  const handleSaveTx = async () => {
    if (!amount || !selCat) { alert('Amount aur Category zaroori hai!'); return; }
    setSaveStatus('saving');
    const data = { type: txType, category: selCat, amount: parseFloat(amount), date: selDate, note: note || '' };
    if (editingTx) {
      await updateDoc(doc(db, 'users', uid, 'transactions', editingTx.id), data);
    } else {
      await addDoc(collection(db, 'users', uid, 'transactions'), { ...data, createdAt: new Date().toISOString() });
    }
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus(''), 2000);
    closeModal();
  };

  const openEdit = (tx) => {
    setEditingTx(tx);
    setTxType(tx.type);
    setAmount(String(tx.amount));
    setNote(tx.note || '');
    setSelCat(tx.category);
    setSelDate(tx.date);
    setShowAddModal(true);
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingTx(null);
    setAmount(''); setNote(''); setSelCat(''); setNewCat('');
    setTxType('expense');
    setSelDate(new Date().toISOString().split('T')[0]);
  };

  const deleteTx = async (id) => {
    if (window.confirm('Delete karna chahte ho?')) {
      await deleteDoc(doc(db, 'users', uid, 'transactions', id));
    }
  };

  const addCustomCat = async () => {
    if (!newCat.trim()) return;
    const key = txType === 'income' ? 'incomeCategories' : 'expenseCategories';
    const current = txType === 'income' ? userSettings.incomeCategories : userSettings.expenseCategories;
    if (!current.includes(newCat)) {
      const updated = [...current, newCat];
      await saveSettings({ [key]: updated });
      setSelCat(newCat);
    }
    setNewCat('');
  };

  // ─── Computed ───
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = totalIncome - totalExpense;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlySpend = transactions.filter(t => t.type === 'expense' && t.date?.startsWith(currentMonth)).reduce((s, t) => s + t.amount, 0);
  const { monthlyBudget, incomeCategories, expenseCategories, name } = userSettings;
  const budgetPct = monthlyBudget > 0 ? (monthlySpend / monthlyBudget) * 100 : 0;
  const budgetWarn = budgetPct >= 80;
  const progColor = budgetPct > 100 ? C.red : budgetPct > 80 ? '#FFA500' : C.green;
  const cats = txType === 'income' ? incomeCategories : expenseCategories;
  const filtered = transactions.filter(t => {
    const okType = filterType === 'all' || t.type === filterType;
    const q = searchText.toLowerCase();
    return okType && ((t.note || '').toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
  });

  if (!loaded) return <Loader text="Aapka data load ho raha hai..." />;

  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif", backgroundColor: C.bg, minHeight: '100vh', color: C.white, display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #222' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 'bold' }}>💸 SpendSmart</div>
          {name && <div style={{ fontSize: 11, color: C.grey }}>👋 {name}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {saveStatus === 'saving' && <span style={{ fontSize: 11, color: C.grey }}>🔄 Saving...</span>}
          {saveStatus === 'saved' && <span style={{ fontSize: 11, color: C.green }}>✅ Saved!</span>}
          <button onClick={() => setScreen('budget')} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>⚙️</button>
          <button onClick={() => signOut(auth)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }} title="Logout">🚪</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, paddingBottom: 90 }}>

        {/* DASHBOARD */}
        {screen === 'dashboard' && <>
          <div style={{ ...s.card({ textAlign: 'center', padding: 24, borderLeftWidth: 0 }) }}>
            <div style={{ fontSize: 13, color: C.grey, marginBottom: 6 }}>Total Balance</div>
            <div style={{ fontSize: 44, fontWeight: 'bold', color: balance >= 0 ? C.green : C.red }}>₹{balance.toFixed(2)}</div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ ...s.card({ flex: 1, marginBottom: 0, borderLeft: `4px solid ${C.green}` }) }}>
              <div style={{ fontSize: 12, color: C.grey, marginBottom: 4 }}>Income</div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: C.green }}>+₹{totalIncome.toFixed(2)}</div>
            </div>
            <div style={{ ...s.card({ flex: 1, marginBottom: 0, borderLeft: `4px solid ${C.red}` }) }}>
              <div style={{ fontSize: 12, color: C.grey, marginBottom: 4 }}>Expense</div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: C.red }}>-₹{totalExpense.toFixed(2)}</div>
            </div>
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Recent Transactions</div>
          {transactions.length === 0
            ? <div style={{ ...s.card({ textAlign: 'center', padding: 30 }) }}><div style={{ fontSize: 30, marginBottom: 6 }}>📭</div><div style={{ color: C.grey }}>Koi transaction nahi abhi</div></div>
            : transactions.slice(0, 5).map(t => (
              <div key={t.id} style={{ ...s.card({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12 }) }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{t.category}</div>
                  <div style={{ fontSize: 11, color: C.grey }}>{t.date}{t.note ? ` • ${t.note}` : ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontWeight: 'bold', color: t.type === 'income' ? C.green : C.red }}>{t.type === 'income' ? '+' : '-'}₹{t.amount.toFixed(2)}</div>
                  <button onClick={() => openEdit(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>✏️</button>
                </div>
              </div>
            ))
          }
        </>}

        {/* HISTORY */}
        {screen === 'history' && <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
            {['all','income','expense'].map(f => (
              <button key={f} onClick={() => setFilterType(f)}
                style={{ ...s.btn(filterType === f ? C.purple : C.cards, { padding: '8px 16px', borderRadius: 20, whiteSpace: 'nowrap', fontSize: 13 }) }}>
                {f === 'all' ? 'All' : f === 'income' ? '📈 Income' : '📉 Expense'}
              </button>
            ))}
          </div>
          <input placeholder="🔍 Search..." value={searchText} onChange={e => setSearchText(e.target.value)} style={s.input({ marginBottom: 12 })} />
          {filtered.length === 0
            ? <div style={{ ...s.card({ textAlign: 'center', padding: 30 }) }}><div style={{ fontSize: 30, marginBottom: 6 }}>🔍</div><div style={{ color: C.grey }}>Kuch nahi mila</div></div>
            : filtered.map(t => (
              <div key={t.id} style={{ ...s.card({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12 }) }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{t.category}</div>
                  <div style={{ fontSize: 11, color: C.grey }}>{t.date}{t.note ? ` • ${t.note}` : ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontWeight: 'bold', color: t.type === 'income' ? C.green : C.red }}>{t.type === 'income' ? '+' : '-'}₹{t.amount.toFixed(2)}</div>
                  <button onClick={() => openEdit(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15 }}>✏️</button>
                  <button onClick={() => deleteTx(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15 }}>🗑️</button>
                </div>
              </div>
            ))
          }
        </>}

        {/* BUDGET */}
        {screen === 'budget' && <>
          <div style={{ ...s.card({ textAlign: 'center', padding: 24 }) }}>
            <div style={{ fontSize: 13, color: C.grey, marginBottom: 6 }}>Monthly Budget</div>
            <div style={{ fontSize: 44, fontWeight: 'bold', color: C.purple, marginBottom: 12 }}>₹{monthlyBudget.toFixed(2)}</div>
            <button onClick={() => setShowBudgetModal(true)} style={{ ...s.btn(C.purple, { padding: '8px 20px' }) }}>Edit Budget</button>
          </div>
          <div style={{ ...s.card({ borderLeft: `4px solid ${C.purple}` }) }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: C.grey }}>Monthly Spending</span>
              <span style={{ fontWeight: 'bold', color: budgetWarn ? C.red : C.green }}>₹{monthlySpend.toFixed(2)}</span>
            </div>
            <div style={{ height: 18, backgroundColor: '#111', borderRadius: 9, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', width: `${Math.min(budgetPct, 100)}%`, backgroundColor: progColor, borderRadius: 9, transition: 'width 0.5s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: C.grey }}>{budgetPct.toFixed(1)}% used</span>
              <span style={{ fontSize: 11, color: budgetWarn ? C.red : C.green }}>₹{(monthlyBudget - monthlySpend).toFixed(2)} remaining</span>
            </div>
            {budgetWarn && <div style={{ backgroundColor: '#FF174422', borderRadius: 8, padding: 10, marginTop: 10, border: '1px solid #FF174444' }}>
              <span style={{ color: C.red, fontSize: 13 }}>⚠️ {budgetPct.toFixed(1)}% budget use ho gaya!</span>
            </div>}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Top Expenses This Month</div>
          {expenseCategories.map(cat => {
            const tot = transactions.filter(t => t.type === 'expense' && t.category === cat && t.date?.startsWith(currentMonth)).reduce((s, t) => s + t.amount, 0);
            return tot > 0 ? (
              <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #222' }}>
                <span style={{ fontSize: 14 }}>{cat}</span>
                <span style={{ color: C.red, fontWeight: 'bold' }}>₹{tot.toFixed(2)}</span>
              </div>
            ) : null;
          })}
        </>}
      </div>

      {/* Bottom Nav */}
      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, backgroundColor: C.cards, display: 'flex', borderTop: '1px solid #222', zIndex: 50 }}>
        {[['dashboard','📊','Dashboard'],['history','📜','History'],['budget','💰','Budget']].map(([sc,ic,lb]) => (
          <button key={sc} onClick={() => setScreen(sc)}
            style={{ flex: 1, padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer', color: screen === sc ? C.purple : C.grey, fontWeight: 500, fontSize: 11 }}>
            <div style={{ fontSize: 20 }}>{ic}</div>{lb}
          </button>
        ))}
      </div>

      {/* FAB */}
      <button onClick={() => { setEditingTx(null); setShowAddModal(true); }}
        style={{ position: 'fixed', bottom: 72, right: 16, width: 54, height: 54, borderRadius: 27, backgroundColor: C.purple, border: 'none', cursor: 'pointer', fontSize: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 18px rgba(124,77,255,0.7)', zIndex: 51 }}>
        ➕
      </button>

      {/* ── ADD / EDIT MODAL ── */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.88)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ backgroundColor: C.bg, width: '100%', maxWidth: 480, borderRadius: '16px 16px 0 0', maxHeight: '92vh', overflowY: 'auto', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <span style={{ fontSize: 20, fontWeight: 'bold' }}>{editingTx ? '✏️ Edit Transaction' : '➕ Add Transaction'}</span>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', color: C.white, fontSize: 24, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
              <button onClick={() => { setTxType('income'); setSelCat(''); }} style={{ ...s.btn(txType === 'income' ? C.green : C.cards, { flex: 1, padding: 12 }) }}>📈 Income</button>
              <button onClick={() => { setTxType('expense'); setSelCat(''); }} style={{ ...s.btn(txType === 'expense' ? C.red : C.cards, { flex: 1, padding: 12 }) }}>📉 Expense</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Amount *</div>
              <input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)}
                style={s.input({ fontSize: 26, fontWeight: 'bold', textAlign: 'center', padding: 14 })} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Note (Optional)</div>
              <textarea placeholder="Kuch likhna hai?" value={note} onChange={e => setNote(e.target.value)}
                style={{ ...s.input({ minHeight: 60, resize: 'vertical' }) }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Category *</div>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                {cats.map(c => (
                  <button key={c} onClick={() => setSelCat(c)}
                    style={{ ...s.btn(selCat === c ? C.purple : C.cards, { padding: '7px 14px', borderRadius: 20, fontSize: 12, whiteSpace: 'nowrap', border: selCat === c ? `2px solid ${C.purple}` : '2px solid transparent' }) }}>{c}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Custom Category</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input placeholder="Naya category..." value={newCat} onChange={e => setNewCat(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCustomCat()}
                  style={s.input({ height: 42, padding: '0 12px' })} />
                <button onClick={addCustomCat} style={{ ...s.btn(C.purple, { width: 42, height: 42, fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }) }}>+</button>
              </div>
            </div>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Date</div>
              <input type="date" value={selDate} onChange={e => setSelDate(e.target.value)}
                style={s.input({ colorScheme: 'dark' })} />
            </div>
            <button onClick={handleSaveTx} style={{ ...s.btn(C.purple, { width: '100%', padding: 14, fontSize: 15, marginBottom: 20 }) }}>
              {editingTx ? '💾 Update Transaction' : '💾 Save Transaction'}
            </button>
          </div>
        </div>
      )}

      {/* BUDGET MODAL */}
      {showBudgetModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...s.card({ width: '78%', maxWidth: 290, marginBottom: 0 }) }}>
            <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 14 }}>💰 Budget Set Karo</div>
            <input type="number" value={budgetInput} onChange={e => setBudgetInput(e.target.value)}
              style={s.input({ backgroundColor: C.bg, fontSize: 16, marginBottom: 14 })} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowBudgetModal(false)} style={{ ...s.btn(C.grey, { flex: 1, padding: 12 }) }}>Cancel</button>
              <button onClick={() => { saveSettings({ monthlyBudget: parseFloat(budgetInput) || 10000 }); setShowBudgetModal(false); }}
                style={{ ...s.btn(C.purple, { flex: 1, padding: 12 }) }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
