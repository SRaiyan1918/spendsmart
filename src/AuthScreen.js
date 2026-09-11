import { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import { C, btn, card, inp } from './ui';

const DEF_IN = ['Salary', 'Freelance', 'Business', 'Investment', 'Other'];
const DEF_EX = ['Food', 'Transport', 'Entertainment', 'Utilities', 'Shopping', 'Health', 'Other'];

const userDefaults = (name, email) => ({
  name,
  email,
  monthlyBudget: 10000,
  incomeCategories: DEF_IN,
  expenseCategories: DEF_EX,
  currency: 'INR',
  createdAt: new Date().toISOString(),
});

export default function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setMessage('');
    if (!email.trim() || (mode !== 'forgot' && !password) || (mode === 'signup' && !name.trim())) {
      setMessage('Required fields fill karo.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await setDoc(doc(db, 'users', cred.user.uid), userDefaults(name.trim(), email.trim()));
      } else {
        await sendPasswordResetEmail(auth, email.trim());
        setMessage('Reset link bhej diya. Email check karo.');
      }
    } catch (error) {
      const code = error?.code || '';
      const friendly = {
        'auth/invalid-credential': 'Email ya password galat hai.',
        'auth/email-already-in-use': 'Ye email already registered hai.',
        'auth/weak-password': 'Password kam se kam 6 characters ka rakho.',
        'auth/invalid-email': 'Valid email daalo.',
        'auth/too-many-requests': 'Bahut attempts hue. Thodi der baad try karo.',
      };
      setMessage(friendly[code] || error?.message || 'Login error.');
    } finally {
      setLoading(false);
    }
  };

  const googleLogin = async () => {
    setLoading(true);
    setMessage('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const ref = doc(db, 'users', result.user.uid);
      if (!(await getDoc(ref)).exists()) {
        await setDoc(ref, userDefaults(result.user.displayName || 'User', result.user.email || ''));
      }
    } catch (error) {
      setMessage(error?.message || 'Google login error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, display: 'grid', placeItems: 'center', padding: 18, fontFamily: 'Segoe UI, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 50 }}>💸</div>
          <h1 style={{ margin: 5 }}>SpendSmart</h1>
          <div style={{ color: C.grey }}>Paise ka clear, correct hisaab.</div>
        </div>
        <div style={card({ padding: 20 })}>
          {mode !== 'forgot' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button style={btn(mode === 'login' ? C.purple : C.card2, { flex: 1 })} onClick={() => { setMode('login'); setMessage(''); }}>Login</button>
              <button style={btn(mode === 'signup' ? C.purple : C.card2, { flex: 1 })} onClick={() => { setMode('signup'); setMessage(''); }}>Sign up</button>
            </div>
          )}
          {mode === 'signup' && <input style={inp({ marginBottom: 10 })} placeholder="Name" value={name} onChange={e => setName(e.target.value)} />}
          <input style={inp({ marginBottom: 10 })} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          {mode !== 'forgot' && <input style={inp({ marginBottom: 10 })} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />}
          {message && <div style={{ color: message.startsWith('Reset') ? C.green : C.orange, fontSize: 12, marginBottom: 10 }}>{message}</div>}
          <button disabled={loading} style={btn(C.purple, { width: '100%', opacity: loading ? .6 : 1 })} onClick={submit}>
            {loading ? 'Please wait…' : mode === 'forgot' ? 'Send reset link' : mode === 'signup' ? 'Create account' : 'Login'}
          </button>
          {mode !== 'forgot' ? (
            <>
              <div style={{ textAlign: 'center', color: C.grey, fontSize: 11, margin: '12px 0' }}>or</div>
              <button disabled={loading} style={btn('#fff', { width: '100%', color: '#222' })} onClick={googleLogin}>Continue with Google</button>
              <button style={{ background: 'none', border: 0, color: C.purple, width: '100%', marginTop: 12, cursor: 'pointer' }} onClick={() => { setMode('forgot'); setMessage(''); }}>Forgot password?</button>
            </>
          ) : (
            <button style={{ background: 'none', border: 0, color: C.grey, width: '100%', marginTop: 12, cursor: 'pointer' }} onClick={() => { setMode('login'); setMessage(''); }}>← Back to login</button>
          )}
        </div>
      </div>
    </div>
  );
}
