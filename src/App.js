import { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, sendPasswordResetEmail,
  GoogleAuthProvider, signInWithPopup,
} from "firebase/auth";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, orderBy, setDoc, getDoc,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD2d1xHmkhJbFzCAf_3UKGeVTdkCkPGk54",
  authDomain: "spend-smart-eb084.firebaseapp.com",
  projectId: "spend-smart-eb084",
  storageBucket: "spend-smart-eb084.firebasestorage.app",
  messagingSenderId: "291802030949",
  appId: "1:291802030949:web:f06326beaaffeb2672778c",
};
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const googleProvider = new GoogleAuthProvider();

const C = {
  bg:'#0A0A0A', cards:'#1A1A2E', purple:'#7C4DFF',
  green:'#00C853', red:'#FF1744', white:'#FFFFFF',
  grey:'#888888', orange:'#FFA500', dark:'#0F0F1A',
};
const DEF_IN = ['Salary','Freelance','Business','Investment','Other'];
const DEF_EX = ['Food','Transport','Entertainment','Utilities','Shopping','Health','Other'];
const CAT_CLR = ['#7C4DFF','#00C853','#FF1744','#FFA500','#00BCD4','#E91E63','#FF5722','#4CAF50','#2196F3','#9C27B0'];

const sc = (e={}) => ({ backgroundColor:C.cards, borderRadius:12, padding:16, marginBottom:12, ...e });
const sb = (bg, e={}) => ({ border:'none', borderRadius:8, cursor:'pointer', backgroundColor:bg, color:C.white, fontWeight:600, ...e });
const si = (e={}) => ({ backgroundColor:C.dark, border:'1px solid #2a2a4a', borderRadius:8, padding:12, color:C.white, fontSize:14, outline:'none', width:'100%', boxSizing:'border-box', ...e });

const CURRENCIES = [
  {code:'INR', symbol:'₹', name:'Indian Rupee'},
  {code:'USD', symbol:'$', name:'US Dollar'},
  {code:'EUR', symbol:'€', name:'Euro'},
  {code:'GBP', symbol:'£', name:'British Pound'},
  {code:'JPY', symbol:'¥', name:'Japanese Yen'},
  {code:'AED', symbol:'د.إ', name:'UAE Dirham'},
  {code:'SAR', symbol:'﷼', name:'Saudi Riyal'},
  {code:'CAD', symbol:'C$', name:'Canadian Dollar'},
  {code:'AUD', symbol:'A$', name:'Australian Dollar'},
];
const getCurrSymbol = (code) => CURRENCIES.find(c=>c.code===code)?.symbol || '₹';

// ⚠️ YAHAN APNI API KEY PASTE KARO (exchangerate-api.com se free mein milegi)
const EXCHANGE_API_KEY = 'YOUR_API_KEY_HERE';

const fetchRates = async () => {
  try {
    const cacheKey = 'spendsmart_rates';
    const cacheTime = 'spendsmart_rates_time';
    const now = Date.now();
    const lastFetch = parseInt(localStorage.getItem(cacheTime)||'0');
    // 24 ghante cache
    if (now - lastFetch < 24*60*60*1000) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) return JSON.parse(cached);
    }
    const res = await fetch(`https://v6.exchangerate-api.com/v6/${EXCHANGE_API_KEY}/latest/INR`);
    const data = await res.json();
    if (data.result === 'success') {
      localStorage.setItem(cacheKey, JSON.stringify(data.conversion_rates));
      localStorage.setItem(cacheTime, String(now));
      return data.conversion_rates;
    }
  } catch(e) {}
  return null;
};

// Service Worker register karo for external notifications
const registerSW = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/sw-budget.js');
      return reg;
    } catch(e) { return null; }
  }
  return null;
};

const sendExternalNotif = async (title, body) => {
  try {
    if (!('serviceWorker' in navigator)) return;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage({ type: 'BUDGET_ALERT', title, body });
  } catch(e) {}
};

const fmt = (n, curr) => {
  const sym = curr ? getCurrSymbol(curr) : '₹';
  return sym + parseFloat(n||0).toFixed(2);
};
const getMonth = d => d?.slice(0,7)||'';
const getYear  = d => d?.slice(0,4)||'';
const getWeekKey = d => {
  const dt = new Date(d), day = dt.getDay();
  const mon = new Date(dt); mon.setDate(dt.getDate()-(day===0?6:day-1));
  return mon.toISOString().slice(0,10);
};

function generatePDF(transactions, userName) {
  const win = window.open('','_blank');
  const inc = transactions.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const exp = transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const bal = inc - exp;
  const rows = transactions.map(t => `
    <tr>
      <td>${t.date||''}</td>
      <td>${t.type==='income'?'Income':'Expense'}</td>
      <td>${t.category}</td>
      <td>${t.note||'-'}</td>
      <td style="color:${t.type==='income'?'#00C853':'#FF1744'};font-weight:bold">
        ${t.type==='income'?'+':'-'}Rs${parseFloat(t.amount).toFixed(2)}
      </td>
    </tr>`).join('');
  const html = `<!DOCTYPE html><html><head><title>SpendSmart Report</title>
  <style>
    body{font-family:Arial,sans-serif;padding:30px}
    h1{color:#7C4DFF}
    .sum{display:flex;gap:16px;margin:16px 0}
    .sc{background:#f5f5f5;border-radius:8px;padding:14px;flex:1;text-align:center}
    .sl{font-size:11px;color:#888;margin-bottom:4px}
    .sv{font-size:20px;font-weight:bold}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#7C4DFF;color:#fff;padding:9px 7px;text-align:left}
    td{padding:8px 7px;border-bottom:1px solid #eee}
    tr:nth-child(even){background:#fafafa}
    @media print{body{padding:10px}}
  </style></head><body>
  <h1>SpendSmart</h1>
  <p style="color:#888;font-size:12px">Report - ${userName} - ${new Date().toLocaleDateString('en-IN')}</p>
  <div class="sum">
    <div class="sc"><div class="sl">Total Income</div><div class="sv" style="color:#00C853">+Rs${inc.toFixed(2)}</div></div>
    <div class="sc"><div class="sl">Total Expense</div><div class="sv" style="color:#FF1744">-Rs${exp.toFixed(2)}</div></div>
    <div class="sc"><div class="sl">Net Balance</div><div class="sv" style="color:${bal>=0?'#00C853':'#FF1744'}">Rs${bal.toFixed(2)}</div></div>
  </div>
  <table><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Note</th><th>Amount</th></tr></thead>
  <tbody>${rows}</tbody></table>
  </body></html>`;
  win.document.write(html);
  win.document.addEventListener('DOMContentLoaded', () => win.print());
  win.document.close();
}

function BarGraph({ data, title }) {
  if (!data||data.length===0) return <div style={{...sc({padding:20,textAlign:'center'})}}>
    <span style={{color:C.grey,fontSize:13}}>Is period mein koi data nahi</span></div>;
  const max = Math.max(...data.map(d=>d.income+d.expense),1);
  return (
    <div style={sc()}>
      <div style={{fontSize:14,fontWeight:600,marginBottom:12}}>{title}</div>
      <div style={{display:'flex',alignItems:'flex-end',gap:4,height:130,overflowX:'auto',paddingBottom:4}}>
        {data.map((d,i)=>(
          <div key={i} style={{display:'flex',flexDirection:'column',alignItems:'center',minWidth:32,flex:1}}>
            <div style={{display:'flex',gap:2,alignItems:'flex-end',height:100}}>
              <div style={{width:13,backgroundColor:C.green,borderRadius:'3px 3px 0 0',height:`${(d.income/max)*100}%`,minHeight:d.income>0?2:0}} />
              <div style={{width:13,backgroundColor:C.red,borderRadius:'3px 3px 0 0',height:`${(d.expense/max)*100}%`,minHeight:d.expense>0?2:0}} />
            </div>
            <div style={{fontSize:9,color:C.grey,marginTop:4,textAlign:'center',maxWidth:32,overflow:'hidden',whiteSpace:'nowrap'}}>{d.label}</div>
          </div>
        ))}
      </div>
      <div style={{display:'flex',gap:14,marginTop:8}}>
        <div style={{display:'flex',alignItems:'center',gap:5}}><div style={{width:10,height:10,backgroundColor:C.green,borderRadius:2}}/><span style={{fontSize:11,color:C.grey}}>Income</span></div>
        <div style={{display:'flex',alignItems:'center',gap:5}}><div style={{width:10,height:10,backgroundColor:C.red,borderRadius:2}}/><span style={{fontSize:11,color:C.grey}}>Expense</span></div>
      </div>
    </div>
  );
}

function DonutChart({ data, title }) {
  if (!data||data.length===0||data.every(d=>d.value===0)) return null;
  const total = data.reduce((s,d)=>s+d.value,0);
  let cum = 0;
  const size=120,r=44,cx=60,cy=60;
  const slices = data.filter(d=>d.value>0).map((d,i)=>{
    const pct=d.value/total, start=cum*2*Math.PI-Math.PI/2;
    cum+=pct;
    const end=cum*2*Math.PI-Math.PI/2;
    const x1=cx+r*Math.cos(start),y1=cy+r*Math.sin(start);
    const x2=cx+r*Math.cos(end),y2=cy+r*Math.sin(end);
    return {...d,path:`M${cx} ${cy}L${x1} ${y1}A${r} ${r} 0 ${pct>0.5?1:0} 1 ${x2} ${y2}Z`,color:CAT_CLR[i%CAT_CLR.length],pct:(pct*100).toFixed(1)};
  });
  return (
    <div style={sc()}>
      <div style={{fontSize:14,fontWeight:600,marginBottom:12}}>{title}</div>
      <div style={{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
        <svg width={size} height={size} style={{flexShrink:0}}>
          {slices.map((sl,i)=><path key={i} d={sl.path} fill={sl.color}/>)}
          <circle cx={cx} cy={cy} r={26} fill={C.cards}/>
          <text x={cx} y={cy+4} textAnchor="middle" fill={C.white} fontSize={9} fontWeight="bold">{fmt(total)}</text>
        </svg>
        <div style={{flex:1,display:'flex',flexDirection:'column',gap:6}}>
          {slices.map((sl,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',gap:7}}>
              <div style={{width:9,height:9,backgroundColor:sl.color,borderRadius:2,flexShrink:0}}/>
              <div style={{flex:1,fontSize:12}}>{sl.label}</div>
              <div style={{fontSize:11,color:C.grey}}>{sl.pct}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Loader({text}) {
  return <div style={{backgroundColor:C.bg,minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12}}>
    <div style={{fontSize:48}}>💸</div>
    <div style={{color:C.purple,fontSize:22,fontWeight:'bold'}}>SpendSmart</div>
    <div style={{color:C.grey,fontSize:13}}>{text}</div>
  </div>;
}

function AuthScreen() {
  const [mode,setMode]=useState('login');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [name,setName]=useState('');
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [loading,setLoading]=useState(false);

  const errMsg = {
    'auth/user-not-found':'Email nahi mila!',
    'auth/wrong-password':'Password galat hai!',
    'auth/email-already-in-use':'Email already registered hai!',
    'auth/weak-password':'Password 6+ characters ka hona chahiye!',
    'auth/invalid-email':'Valid email daalo!',
    'auth/invalid-credential':'Email ya Password galat hai!',
    'auth/popup-closed-by-user':'Google login cancel ho gaya.',
    'auth/too-many-requests':'Bahut zyada try kiya. Thodi der baad try karo.',
  };

  const handle = async () => {
    setError(''); setSuccess('');
    if (!email||(mode!=='forgot'&&!password)){setError('Sab fields zaroori hain!');return;}
    if (mode==='signup'&&!name){setError('Naam zaroori hai!');return;}
    setLoading(true);
    try {
      if (mode==='login') {
        await signInWithEmailAndPassword(auth,email,password);
      } else if (mode==='signup') {
        const cred = await createUserWithEmailAndPassword(auth,email,password);
        await setDoc(doc(db,'users',cred.user.uid),{name,email,monthlyBudget:10000,incomeCategories:DEF_IN,expenseCategories:DEF_EX,createdAt:new Date().toISOString()});
        try {
          const raw=localStorage.getItem('spendsmart_data');
          if(raw){const old=JSON.parse(raw);for(const tx of(old.transactions||[]))await addDoc(collection(db,'users',cred.user.uid,'transactions'),tx);localStorage.removeItem('spendsmart_data');}
        }catch(e){}
      } else {
        await sendPasswordResetEmail(auth,email);
        setSuccess('✅ Reset link bhej diya! Email check karo (spam bhi dekho).');
        setLoading(false);return;
      }
    } catch(e){setError(errMsg[e.code]||e.message);}
    setLoading(false);
  };

  const handleGoogle = async () => {
    setError('');setLoading(true);
    try {
      const result = await signInWithPopup(auth,googleProvider);
      const u=result.user;
      const ref=doc(db,'users',u.uid);
      const snap=await getDoc(ref);
      if(!snap.exists()) await setDoc(ref,{name:u.displayName||'User',email:u.email,monthlyBudget:10000,incomeCategories:DEF_IN,expenseCategories:DEF_EX,createdAt:new Date().toISOString()});
    }catch(e){setError(errMsg[e.code]||e.message);}
    setLoading(false);
  };

  return (
    <div style={{backgroundColor:C.bg,minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Segoe UI',sans-serif",padding:20}}>
      <div style={{width:'100%',maxWidth:380}}>
        <div style={{textAlign:'center',marginBottom:30}}>
          <div style={{fontSize:52,marginBottom:8}}>💸</div>
          <div style={{fontSize:26,fontWeight:'bold',color:C.white}}>SpendSmart</div>
          <div style={{fontSize:12,color:C.grey,marginTop:4}}>Apne paise ko smart banao</div>
        </div>
        <div style={sc({padding:24})}>
          {mode!=='forgot' && (
            <div style={{display:'flex',backgroundColor:C.bg,borderRadius:8,padding:4,marginBottom:20}}>
              {[['login','🔑 Login'],['signup','🚀 Sign Up']].map(([m,lb])=>(
                <button key={m} onClick={()=>{setMode(m);setError('');setSuccess('');}}
                  style={sb(mode===m?C.purple:'transparent',{flex:1,padding:'10px',borderRadius:6,fontSize:13})}>{lb}</button>
              ))}
            </div>
          )}
          {mode==='forgot' && (
            <div style={{marginBottom:18}}>
              <button onClick={()=>{setMode('login');setError('');setSuccess('');}} style={{background:'none',border:'none',color:C.grey,cursor:'pointer',fontSize:13,padding:0}}>← Wapas Login</button>
              <div style={{fontSize:17,fontWeight:'bold',marginTop:8,color:C.white}}>🔑 Password Reset</div>
              <div style={{fontSize:12,color:C.grey,marginTop:3}}>Email daalo, reset link bhejte hain</div>
            </div>
          )}
          {mode!=='forgot' && (
            <>
              <button onClick={handleGoogle} disabled={loading}
                style={{...sb('#fff',{width:'100%',padding:11,fontSize:13,color:'#333',display:'flex',alignItems:'center',justifyContent:'center',gap:10,marginBottom:14}),opacity:loading?0.7:1}}>
                <svg width="17" height="17" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Google se {mode==='login'?'Login':'Sign Up'} karo
              </button>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                <div style={{flex:1,height:1,backgroundColor:'#2a2a4a'}}/>
                <span style={{color:C.grey,fontSize:11}}>ya email se</span>
                <div style={{flex:1,height:1,backgroundColor:'#2a2a4a'}}/>
              </div>
            </>
          )}
          {mode==='signup'&&<div style={{marginBottom:12}}><div style={{fontSize:12,color:C.grey,marginBottom:5}}>Aapka Naam</div><input placeholder="Jaise: Raiyan" value={name} onChange={e=>setName(e.target.value)} style={si()}/></div>}
          <div style={{marginBottom:12}}><div style={{fontSize:12,color:C.grey,marginBottom:5}}>Email</div><input type="email" placeholder="example@gmail.com" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handle()} style={si()}/></div>
          {mode!=='forgot'&&<div style={{marginBottom:mode==='login'?6:18}}><div style={{fontSize:12,color:C.grey,marginBottom:5}}>Password</div><input type="password" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handle()} style={si()}/></div>}
          {mode==='login'&&<div style={{textAlign:'right',marginBottom:16}}><span onClick={()=>{setMode('forgot');setError('');setSuccess('');}} style={{color:C.purple,fontSize:12,cursor:'pointer'}}>Password bhool gaye? 🔑</span></div>}
          {error&&<div style={{backgroundColor:'#FF174420',border:'1px solid #FF174450',borderRadius:8,padding:10,marginBottom:12,color:C.red,fontSize:13}}>⚠️ {error}</div>}
          {success&&<div style={{backgroundColor:'#00C85320',border:'1px solid #00C85350',borderRadius:8,padding:10,marginBottom:12,color:C.green,fontSize:13}}>{success}</div>}
          <button onClick={handle} disabled={loading} style={{...sb(C.purple,{width:'100%',padding:13,fontSize:14}),opacity:loading?0.7:1}}>
            {loading?'⏳ Please wait...':mode==='login'?'🔑 Login':mode==='signup'?'🚀 Account Banao':'📧 Reset Link Bhejo'}
          </button>
        </div>
        {mode!=='forgot'&&<div style={{textAlign:'center',marginTop:14,color:C.grey,fontSize:13}}>
          {mode==='login'?'Account nahi hai? ':'Already account hai? '}
          <span onClick={()=>{setMode(mode==='login'?'signup':'login');setError('');setSuccess('');}} style={{color:C.purple,cursor:'pointer',fontWeight:600}}>{mode==='login'?'Sign Up karo':'Login karo'}</span>
        </div>}
      </div>
    </div>
  );
}

function SpendSmart({user}) {
  const [screen,setScreen]=useState('dashboard');
  const [transactions,setTransactions]=useState([]);
  const [settings,setSettings]=useState({monthlyBudget:10000,incomeCategories:DEF_IN,expenseCategories:DEF_EX,name:'',currency:'INR'});
  const [recurringList,setRecurringList]=useState([]);
  const [showRecurring,setShowRecurring]=useState(false);
  const [showCurrency,setShowCurrency]=useState(false);
  const [recType,setRecType]=useState('expense');
  const [recAmount,setRecAmount]=useState('');
  const [recCat,setRecCat]=useState('');
  const [recNote,setRecNote]=useState('');
  const [recFreq,setRecFreq]=useState('monthly');
  const [recStartDate,setRecStartDate]=useState(new Date().toISOString().split('T')[0]);
  const [loaded,setLoaded]=useState(false);
  const [notifSent,setNotifSent]=useState({80:false,100:false});
  const [saveStatus,setSaveStatus]=useState('');
  const [showAdd,setShowAdd]=useState(false);
  const [showBudget,setShowBudget]=useState(false);
  const [budgetAlert,setBudgetAlert]=useState(null);
  const [editingTx,setEditingTx]=useState(null);
  const [txType,setTxType]=useState('expense');
  const [amount,setAmount]=useState('');
  const [note,setNote]=useState('');
  const [selCat,setSelCat]=useState('');
  const [selDate,setSelDate]=useState(new Date().toISOString().split('T')[0]);
  const [newCat,setNewCat]=useState('');
  const [budgetInput,setBudgetInput]=useState('10000');
  const [filterType,setFilterType]=useState('all');
  const [filterPeriod,setFilterPeriod]=useState('all');
  const [searchText,setSearchText]=useState('');
  const [filterMonth,setFilterMonth]=useState(new Date().toISOString().slice(0,7));
  const [filterYear,setFilterYear]=useState(new Date().getFullYear().toString());
  const [graphPeriod,setGraphPeriod]=useState('monthly');
  // Savings states
  const [savingsGoals,setSavingsGoals]=useState([]);
  const [showSavePrompt,setShowSavePrompt]=useState(false);
  const [exchangeRates,setExchangeRates]=useState(null);
  const [ratesLoading,setRatesLoading]=useState(false);
  const [saveToGoalId,setSaveToGoalId]=useState('');
  const [saveToGoalAmt,setSaveToGoalAmt]=useState('');
  const [showSavingsModal,setShowSavingsModal]=useState(false);
  const [newGoalTitle,setNewGoalTitle]=useState('');
  const [newGoalTarget,setNewGoalTarget]=useState('');
  const [newGoalEmoji,setNewGoalEmoji]=useState('🎯');
  const [newGoalDeadline,setNewGoalDeadline]=useState('');
  const uid=user.uid;

  // Register service worker on load
  useEffect(()=>{ registerSW(); },[]);

  useEffect(()=>{
    const unsub=onSnapshot(doc(db,'users',uid),snap=>{
      if(snap.exists()){const d=snap.data();setSettings({monthlyBudget:d.monthlyBudget||10000,incomeCategories:d.incomeCategories||DEF_IN,expenseCategories:d.expenseCategories||DEF_EX,name:d.name||'',currency:d.currency||'INR'});setBudgetInput(String(d.monthlyBudget||10000));}
    });return unsub;
  },[uid]);

  useEffect(()=>{
    const q=query(collection(db,'users',uid,'transactions'),orderBy('createdAt','desc'));
    const unsub=onSnapshot(q,snap=>{const txs=snap.docs.map(d=>({id:d.id,...d.data()}));txs.sort((a,b)=>{if(b.date!==a.date)return b.date?.localeCompare(a.date);return (b.createdAt||'').localeCompare(a.createdAt||'');});setTransactions(txs);setLoaded(true);});
    return unsub;
  },[uid]);

  useEffect(()=>{
    const q=query(collection(db,'users',uid,'recurring'),orderBy('createdAt','desc'));
    const unsub=onSnapshot(q,snap=>{setRecurringList(snap.docs.map(d=>({id:d.id,...d.data()})));});
    return unsub;
  },[uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch exchange rates jab currency change ho
  useEffect(()=>{
    const curr=settings.currency;
    if(curr==='INR'){setExchangeRates(null);return;}
    setRatesLoading(true);
    fetchRates().then(rates=>{
      setExchangeRates(rates);
      setRatesLoading(false);
    });
  },[settings.currency]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(()=>{
    const q=query(collection(db,'users',uid,'savings'),orderBy('createdAt','desc'));
    const unsub=onSnapshot(q,snap=>{setSavingsGoals(snap.docs.map(d=>({id:d.id,...d.data()})));});
    return unsub;
  },[uid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{
    if(recurringList.length===0||transactions.length===0) return;
    const today=new Date().toISOString().split('T')[0];
    recurringList.forEach(async(rec)=>{
      const lastAdded=rec.lastAdded||rec.startDate;
      const last=new Date(lastAdded);
      const now=new Date(today);
      let shouldAdd=false;
      if(rec.freq==='weekly'&&(now-last)>=(7*24*60*60*1000)) shouldAdd=true;
      else if(rec.freq==='monthly'&&(now.getMonth()!==last.getMonth()||now.getFullYear()!==last.getFullYear())) shouldAdd=true;
      else if(rec.freq==='yearly'&&now.getFullYear()!==last.getFullYear()) shouldAdd=true;
      if(shouldAdd){
        await addDoc(collection(db,'users',uid,'transactions'),{type:rec.type,category:rec.category,amount:rec.amount,date:today,note:rec.note||'🔄 Recurring',createdAt:new Date().toISOString()});
        await updateDoc(doc(db,'users',uid,'recurring',rec.id),{lastAdded:today});
      }
    });
  },[recurringList]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveSet=async(upd)=>{setSaveStatus('saving');await setDoc(doc(db,'users',uid),upd,{merge:true});setSaveStatus('saved');setTimeout(()=>setSaveStatus(''),2000);};

  const saveRecurring=async()=>{
    if(!recAmount||!recCat){alert('Amount aur Category zaroori hai!');return;}
    await addDoc(collection(db,'users',uid,'recurring'),{type:recType,category:recCat,amount:parseFloat(recAmount),note:recNote||'',freq:recFreq,startDate:recStartDate,lastAdded:recStartDate,createdAt:new Date().toISOString()});
    setRecAmount('');setRecCat('');setRecNote('');setRecFreq('monthly');setRecType('expense');
    setRecStartDate(new Date().toISOString().split('T')[0]);
    setShowRecurring(false);
  };
  const deleteRecurring=async id=>{if(window.confirm('Ye recurring transaction delete karna chahte ho?'))await deleteDoc(doc(db,'users',uid,'recurring',id));};

  const handleSaveTx=async()=>{
    if(!amount||!selCat){alert('Amount aur Category zaroori hai!');return;}
    setSaveStatus('saving');
    const enteredAmt=parseFloat(amount);
    // User ne jo currency mein enter kiya, use INR mein convert karke save karo
    let amountInINR=enteredAmt;
    if(currency!=='INR'&&exchangeRates&&exchangeRates[currency]){
      amountInINR=enteredAmt/exchangeRates[currency];
    }
    const data={type:txType,category:selCat,amount:parseFloat(amountInINR.toFixed(2)),date:selDate,note:note||''};
    if(editingTx) {
      await updateDoc(doc(db,'users',uid,'transactions',editingTx.id),data);
    } else {
      await addDoc(collection(db,'users',uid,'transactions'),{...data,createdAt:new Date().toISOString()});
      if(txType==='income'&&savingsGoals.filter(g=>(g.savedAmount||0)<g.targetAmount).length>0){
        setSaveToGoalAmt(String(enteredAmt));
        setSaveToGoalId('');
        closeModal();
        setSaveStatus('saved');setTimeout(()=>setSaveStatus(''),2000);
        setShowSavePrompt(true);
        return;
      }
    }
    setSaveStatus('saved');setTimeout(()=>setSaveStatus(''),2000);closeModal();
  };

  const allocateToGoal=async()=>{
    if(!saveToGoalId||!saveToGoalAmt){alert('Goal aur amount zaroori hai!');return;}
    const goal=savingsGoals.find(g=>g.id===saveToGoalId);
    if(!goal)return;
    const enteredAmt=parseFloat(saveToGoalAmt);
    // User ki currency se INR mein convert karo
    let enteredInINR=enteredAmt;
    if(currency!=='INR'&&exchangeRates&&exchangeRates[currency]){
      enteredInINR=enteredAmt/exchangeRates[currency];
    }
    const alreadySaved=goal.savedAmount||0;
    const remaining=goal.targetAmount-alreadySaved;
    // Sirf remaining amount tak hi expense karo, zyada nahi
    const actualAmt=Math.min(parseFloat(enteredInINR.toFixed(2)),remaining);
    const newSaved=alreadySaved+actualAmt;
    const today=new Date().toISOString().split('T')[0];
    // Balance se minus karo — sirf actual amount
    await addDoc(collection(db,'users',uid,'transactions'),{
      type:'expense',
      category:'🏦 '+goal.emoji+' '+goal.title,
      amount:actualAmt,
      date:today,
      note:'💰 Savings Goal Allocation',
      createdAt:new Date().toISOString()
    });
    // Goal update karo
    const isComplete=newSaved>=goal.targetAmount;
    await updateDoc(doc(db,'users',uid,'savings',saveToGoalId),{
      savedAmount:newSaved,
      ...(isComplete&&{completedAt:today,archived:true})
    });
    // Goal complete hone pe — sirf ek info note, no extra expense
    if(isComplete){
      alert('🎉 Goal "'+goal.title+'" poora ho gaya! Total saved: ₹'+goal.targetAmount);
    }
    setShowSavePrompt(false);setSaveToGoalId('');setSaveToGoalAmt('');
  };

  const createGoal=async()=>{
    if(!newGoalTitle||!newGoalTarget){alert('Title aur Target zaroori hai!');return;}
    await addDoc(collection(db,'users',uid,'savings'),{title:newGoalTitle,targetAmount:parseFloat(newGoalTarget),savedAmount:0,emoji:newGoalEmoji,deadline:newGoalDeadline||'',createdAt:new Date().toISOString()});
    setNewGoalTitle('');setNewGoalTarget('');setNewGoalEmoji('🎯');setNewGoalDeadline('');setShowSavingsModal(false);
  };

  const deleteGoal=async id=>{if(window.confirm('Goal delete karna chahte ho?'))await deleteDoc(doc(db,'users',uid,'savings',id));};

  const openEdit=tx=>{setEditingTx(tx);setTxType(tx.type);setAmount(String(tx.amount));setNote(tx.note||'');setSelCat(tx.category);setSelDate(tx.date);setShowAdd(true);};
  const closeModal=()=>{setShowAdd(false);setEditingTx(null);setAmount('');setNote('');setSelCat('');setNewCat('');setTxType('expense');setSelDate(new Date().toISOString().split('T')[0]);};
  const deleteTx=async id=>{if(window.confirm('Delete karna chahte ho?'))await deleteDoc(doc(db,'users',uid,'transactions',id));};
  const addCustomCat=async()=>{
    if(!newCat.trim())return;
    const key=txType==='income'?'incomeCategories':'expenseCategories';
    const curr=txType==='income'?settings.incomeCategories:settings.expenseCategories;
    if(!curr.includes(newCat)){await saveSet({[key]:[...curr,newCat]});setSelCat(newCat);}
    setNewCat('');
  };

  const totalIncome=transactions.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const totalExpense=transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const balance=totalIncome-totalExpense;
  const curMonth=new Date().toISOString().slice(0,7);
  const monthlySpend=transactions.filter(t=>t.type==='expense'&&t.date?.startsWith(curMonth)).reduce((s,t)=>s+t.amount,0);
  const {monthlyBudget,incomeCategories,expenseCategories,name,currency}=settings;
  const convertAmt=(n)=>{
    const num=parseFloat(n||0);
    if(currency==='INR'||!exchangeRates)return num;
    const rate=exchangeRates[currency];
    return rate?num*rate:num;
  };
  const fmtC=(n)=>{
    const sym=getCurrSymbol(currency);
    return sym+convertAmt(n).toFixed(2);
  };
  const budgetPct=monthlyBudget>0?(monthlySpend/monthlyBudget)*100:0;
  const budgetWarn=budgetPct>=80;
  const progColor=budgetPct>100?C.red:budgetPct>80?C.orange:C.green;

  // Budget Alert useEffect — in-app banner (PWA safe)
  useEffect(()=>{
    if(!loaded||monthlyBudget<=0)return;
    if(budgetPct>=100&&!notifSent[100]){
      const msg=`🚨 Budget khatam! ${budgetPct.toFixed(0)}% use ho gaya!`;
      const sub=`Spent: ${fmtC(monthlySpend)} / ${fmtC(monthlyBudget)}`;
      setBudgetAlert({type:'danger',msg,sub});
      sendExternalNotif('🚨 SpendSmart — Budget Alert',`${msg} ${sub}`);
      setNotifSent(p=>({...p,100:true,80:true}));
    } else if(budgetPct>=80&&!notifSent[80]){
      const msg='⚠️ Budget 80% use ho gaya!';
      const sub=`Sirf ${fmtC(monthlyBudget-monthlySpend)} bacha hai`;
      setBudgetAlert({type:'warn',msg,sub});
      sendExternalNotif('⚠️ SpendSmart — Budget Alert',`${msg} ${sub}`);
      setNotifSent(p=>({...p,80:true}));
    }
    // Reset sirf tab karo jab bilkul fresh start ho (budget change ya naya month)
  },[budgetPct,loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Jab budget change ho toh reset karo
  useEffect(()=>{
    setNotifSent({80:false,100:false});
  },[monthlyBudget]); // eslint-disable-line react-hooks/exhaustive-deps
  const cats=txType==='income'?incomeCategories:expenseCategories;

  const filtered=transactions.filter(t=>{
    const okT=filterType==='all'||t.type===filterType;
    const okS=(t.note||'').toLowerCase().includes(searchText.toLowerCase())||t.category.toLowerCase().includes(searchText.toLowerCase());
    let okP=true;
    if(filterPeriod==='month') okP=t.date?.startsWith(filterMonth);
    else if(filterPeriod==='year') okP=t.date?.startsWith(filterYear);
    else if(filterPeriod==='week'){
      const now=new Date(),day=now.getDay();
      const mon=new Date(now);mon.setDate(now.getDate()-(day===0?6:day-1));mon.setHours(0,0,0,0);
      const sun=new Date(mon);sun.setDate(mon.getDate()+6);sun.setHours(23,59,59,999);
      const td=new Date(t.date);okP=td>=mon&&td<=sun;
    }
    return okT&&okS&&okP;
  });

  const buildGraph=()=>{
    const map={};
    transactions.forEach(t=>{
      let key,label;
      if(graphPeriod==='weekly'){key=getWeekKey(t.date);label=key.slice(5);}
      else if(graphPeriod==='monthly'){key=getMonth(t.date);label=new Date(key+'-01').toLocaleString('default',{month:'short'});}
      else if(graphPeriod==='yearly'){key=getYear(t.date);label=key;}
      else{key=getMonth(t.date);label=key.slice(2);}
      if(!map[key])map[key]={income:0,expense:0,label};
      if(t.type==='income')map[key].income+=t.amount;else map[key].expense+=t.amount;
    });
    const sorted=Object.entries(map).sort(([a],[b])=>a.localeCompare(b));
    return graphPeriod==='weekly'?sorted.slice(-8).map(([,v])=>v):graphPeriod==='monthly'?sorted.slice(-12).map(([,v])=>v):sorted.map(([,v])=>v);
  };

  const graphData=buildGraph();
  const donutData=expenseCategories.map((cat,i)=>({label:cat,value:transactions.filter(t=>t.type==='expense'&&t.category===cat&&t.date?.startsWith(curMonth)).reduce((s,t)=>s+t.amount,0),color:CAT_CLR[i%CAT_CLR.length]})).filter(d=>d.value>0);

  if(!loaded)return<Loader text="Aapka data load ho raha hai..."/>;

  return(
    <div style={{fontFamily:"'Segoe UI',sans-serif",backgroundColor:C.bg,minHeight:'100vh',color:C.white,display:'flex',flexDirection:'column',maxWidth:480,margin:'0 auto'}}>

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 16px',borderBottom:'1px solid #1e1e3a',backgroundColor:C.cards}}>
        <div>
          <div style={{fontSize:19,fontWeight:'bold'}}>💸 SpendSmart</div>
          {name&&<div style={{fontSize:11,color:C.grey}}>👋 {name}</div>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          {saveStatus==='saving'&&<span style={{fontSize:11,color:C.grey}}>🔄</span>}
          {saveStatus==='saved'&&<span style={{fontSize:11,color:C.green}}>✅</span>}
          <button onClick={()=>setShowCurrency(true)} style={sb('#7C4DFF22',{padding:'6px 8px',borderRadius:6,fontSize:11,color:C.purple,border:'1px solid #7C4DFF44'})}>
            {ratesLoading?'⏳':getCurrSymbol(currency)} {currency}
          </button>
          <button onClick={()=>setShowRecurring(true)} style={sb('#FFA50022',{padding:'6px 8px',borderRadius:6,fontSize:11,color:C.orange,border:'1px solid #FFA50044'})}>🔄</button>
          <button onClick={()=>signOut(auth)} style={sb('#FF174420',{padding:'6px 8px',borderRadius:6,fontSize:12,color:C.red,border:'1px solid #FF174444'})}>🚪</button>
        </div>
      </div>

      {/* BUDGET ALERT BANNER */}
      {budgetAlert&&(
        <div style={{backgroundColor:budgetAlert.type==='danger'?'#FF174420':'#FFA50020',borderBottom:`2px solid ${budgetAlert.type==='danger'?C.red:C.orange}`,padding:'10px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontSize:13,fontWeight:'bold',color:budgetAlert.type==='danger'?C.red:C.orange}}>{budgetAlert.msg}</div>
            <div style={{fontSize:11,color:C.grey,marginTop:2}}>{budgetAlert.sub}</div>
          </div>
          <button onClick={()=>setBudgetAlert(null)} style={{background:'none',border:'none',color:C.grey,fontSize:18,cursor:'pointer'}}>✕</button>
        </div>
      )}
      <div style={{flex:1,overflowY:'auto',padding:14,paddingBottom:90}}>

        {/* DASHBOARD */}
        {screen==='dashboard'&&<>
          <div style={sc({textAlign:'center',padding:22,borderLeftWidth:0,background:'linear-gradient(135deg,#1A1A2E,#16213E)'})}>
            <div style={{fontSize:12,color:C.grey,marginBottom:5}}>Total Balance</div>
            <div style={{fontSize:40,fontWeight:'bold',color:balance>=0?C.green:C.red}}>{fmtC(balance)}</div>
          </div>
          <div style={{display:'flex',gap:10,marginBottom:12}}>
            <div style={sc({flex:1,marginBottom:0,borderLeft:`4px solid ${C.green}`})}><div style={{fontSize:11,color:C.grey,marginBottom:3}}>Income</div><div style={{fontSize:17,fontWeight:'bold',color:C.green}}>+{fmtC(totalIncome)}</div></div>
            <div style={sc({flex:1,marginBottom:0,borderLeft:`4px solid ${C.red}`})}><div style={{fontSize:11,color:C.grey,marginBottom:3}}>Expense</div><div style={{fontSize:17,fontWeight:'bold',color:C.red}}>-{fmtC(totalExpense)}</div></div>
          </div>

          <div style={{fontSize:15,fontWeight:600,marginBottom:10}}>Recent Transactions</div>
          {transactions.length===0
            ?<div style={sc({textAlign:'center',padding:28})}><div style={{fontSize:28,marginBottom:6}}>📭</div><div style={{color:C.grey,fontSize:13}}>Koi transaction nahi abhi</div></div>
            :transactions.slice(0,5).map(t=>(
              <div key={t.id} style={sc({display:'flex',justifyContent:'space-between',alignItems:'center',padding:11})}>
                <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{t.category}</div><div style={{fontSize:11,color:C.grey}}>{t.date}{t.note?` • ${t.note}`:''}</div></div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{fontWeight:'bold',fontSize:13,color:t.type==='income'?C.green:C.red}}>{t.type==='income'?'+':'-'}{fmtC(t.amount)}</div>
                  <button onClick={()=>openEdit(t)} style={{background:'none',border:'none',cursor:'pointer',fontSize:14}}>✏️</button>
                </div>
              </div>
            ))
          }

          {/* SAVINGS GOALS */}
          <div style={{marginTop:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
              <div style={{fontSize:15,fontWeight:600}}>🏦 Savings Goals</div>
              <button onClick={()=>setShowSavingsModal(true)} style={sb(C.purple,{padding:'5px 12px',fontSize:11,borderRadius:20})}>+ New Goal</button>
            </div>
            {savingsGoals.filter(g=>!g.archived).length===0&&savingsGoals.filter(g=>g.archived).length===0
              ?<button onClick={()=>setShowSavingsModal(true)} style={sb(C.dark,{width:'100%',padding:12,border:`1px dashed ${C.purple}`,color:C.purple,fontSize:13,borderRadius:10})}>🎯 Pehla Goal Banao</button>
              :null
            }
            {savingsGoals.filter(g=>!g.archived).map(g=>{
              const pct=g.targetAmount>0?Math.min((g.savedAmount||0)/g.targetAmount*100,100):0;
              return(
                <div key={g.id} style={sc({borderLeft:`4px solid ${C.purple}`,padding:12})}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                    <div style={{fontSize:14,fontWeight:600}}>{g.emoji} {g.title}</div>
                    <button onClick={()=>deleteGoal(g.id)} style={{background:'none',border:'none',cursor:'pointer',fontSize:13}}>🗑️</button>
                  </div>
                  <div style={{height:8,backgroundColor:'#111',borderRadius:4,overflow:'hidden',marginBottom:6}}>
                    <div style={{height:'100%',width:`${pct}%`,backgroundColor:C.purple,borderRadius:4,transition:'width 0.5s'}}/>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between'}}>
                    <span style={{fontSize:11,color:C.grey}}>{fmtC(g.savedAmount||0)} / {fmtC(g.targetAmount)}</span>
                    <span style={{fontSize:11,color:C.purple,fontWeight:'bold'}}>{pct.toFixed(0)}%</span>
                  </div>
                  {g.deadline&&<div style={{fontSize:10,color:C.grey,marginTop:3}}>📅 {g.deadline}</div>}
                </div>
              );
            })}
            {savingsGoals.filter(g=>g.archived).length>0&&(
              <div style={{marginTop:14}}>
                <div style={{fontSize:13,fontWeight:600,color:C.green,marginBottom:8}}>✅ Completed Goals</div>
                {savingsGoals.filter(g=>g.archived).map(g=>(
                  <div key={g.id} style={sc({borderLeft:`4px solid ${C.green}`,padding:12,opacity:0.85})}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                      <div style={{fontSize:14,fontWeight:600}}>{g.emoji} {g.title} ✅</div>
                      <button onClick={()=>deleteGoal(g.id)} style={{background:'none',border:'none',cursor:'pointer',fontSize:13}}>🗑️</button>
                    </div>
                    <div style={{height:8,backgroundColor:'#111',borderRadius:4,overflow:'hidden',marginBottom:6}}>
                      <div style={{height:'100%',width:'100%',backgroundColor:C.green,borderRadius:4}}/>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between'}}>
                      <span style={{fontSize:11,color:C.grey}}>{fmtC(g.targetAmount)} saved 🎉</span>
                      <span style={{fontSize:11,color:C.green,fontWeight:'bold'}}>100%</span>
                    </div>
                    {g.completedAt&&<div style={{fontSize:10,color:C.green,marginTop:3}}>📅 Completed: {g.completedAt}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>}

        {/* HISTORY */}
        {screen==='history'&&<>
          <div style={{display:'flex',gap:6,marginBottom:8,overflowX:'auto',paddingBottom:2}}>
            {[['all','All'],['income','📈 Income'],['expense','📉 Expense']].map(([f,lb])=>(
              <button key={f} onClick={()=>setFilterType(f)} style={sb(filterType===f?C.purple:C.cards,{padding:'7px 13px',borderRadius:20,whiteSpace:'nowrap',fontSize:12})}>{lb}</button>
            ))}
          </div>
          <div style={{display:'flex',gap:6,marginBottom:8,overflowX:'auto',paddingBottom:2}}>
            {[['all','All Time'],['week','This Week'],['month','Month'],['year','Year']].map(([f,lb])=>(
              <button key={f} onClick={()=>setFilterPeriod(f)} style={sb(filterPeriod===f?C.orange:C.cards,{padding:'7px 13px',borderRadius:20,whiteSpace:'nowrap',fontSize:12})}>{lb}</button>
            ))}
          </div>
          {filterPeriod==='month'&&<input type="month" value={filterMonth} onChange={e=>setFilterMonth(e.target.value)} style={si({marginBottom:8,colorScheme:'dark'})}/>}
          {filterPeriod==='year'&&<select value={filterYear} onChange={e=>setFilterYear(e.target.value)} style={si({marginBottom:8})}>
            {[...new Set(transactions.map(t=>t.date?.slice(0,4)).filter(Boolean))].sort((a,b)=>b-a).map(y=><option key={y} value={y}>{y}</option>)}
          </select>}
          <input placeholder="🔍 Search..." value={searchText} onChange={e=>setSearchText(e.target.value)} style={si({marginBottom:8})}/>
          <button onClick={()=>generatePDF(filtered,name||user.email)} style={sb(C.dark,{width:'100%',padding:'10px',fontSize:13,marginBottom:10,border:`1px solid ${C.purple}`,color:C.purple})}>
            📄 PDF Export ({filtered.length} transactions)
          </button>
          {filtered.length>0&&<div style={{display:'flex',gap:8,marginBottom:10}}>
            <div style={sc({flex:1,marginBottom:0,padding:10,textAlign:'center'})}><div style={{fontSize:10,color:C.grey}}>Income</div><div style={{fontSize:13,fontWeight:'bold',color:C.green}}>+{fmt(filtered.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0))}</div></div>
            <div style={sc({flex:1,marginBottom:0,padding:10,textAlign:'center'})}><div style={{fontSize:10,color:C.grey}}>Expense</div><div style={{fontSize:13,fontWeight:'bold',color:C.red}}>-{fmt(filtered.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0))}</div></div>
          </div>}
          {filtered.length===0
            ?<div style={sc({textAlign:'center',padding:28})}><div style={{fontSize:28,marginBottom:6}}>🔍</div><div style={{color:C.grey,fontSize:13}}>Kuch nahi mila</div></div>
            :filtered.map(t=>(
              <div key={t.id} style={sc({display:'flex',justifyContent:'space-between',alignItems:'center',padding:11})}>
                <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{t.category}</div><div style={{fontSize:11,color:C.grey}}>{t.date}{t.note?` • ${t.note}`:''}</div></div>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <div style={{fontWeight:'bold',fontSize:13,color:t.type==='income'?C.green:C.red}}>{t.type==='income'?'+':'-'}{fmtC(t.amount)}</div>
                  <button onClick={()=>openEdit(t)} style={{background:'none',border:'none',cursor:'pointer',fontSize:14}}>✏️</button>
                  <button onClick={()=>deleteTx(t.id)} style={{background:'none',border:'none',cursor:'pointer',fontSize:14}}>🗑️</button>
                </div>
              </div>
            ))
          }
        </>}

        {/* GRAPHS */}
        {screen==='graphs'&&<>
          <div style={{display:'flex',gap:6,marginBottom:14,overflowX:'auto',paddingBottom:2}}>
            {[['weekly','Weekly'],['monthly','Monthly'],['yearly','Yearly'],['lifetime','Lifetime']].map(([p,lb])=>(
              <button key={p} onClick={()=>setGraphPeriod(p)} style={sb(graphPeriod===p?C.purple:C.cards,{padding:'8px 14px',borderRadius:20,whiteSpace:'nowrap',fontSize:12})}>{lb}</button>
            ))}
          </div>
          <div style={{display:'flex',gap:10,marginBottom:14}}>
            <div style={sc({flex:1,marginBottom:0,textAlign:'center',borderLeft:`4px solid ${C.green}`})}><div style={{fontSize:10,color:C.grey}}>Total Income</div><div style={{fontSize:15,fontWeight:'bold',color:C.green}}>+{fmtC(totalIncome)}</div></div>
            <div style={sc({flex:1,marginBottom:0,textAlign:'center',borderLeft:`4px solid ${C.red}`})}><div style={{fontSize:10,color:C.grey}}>Total Expense</div><div style={{fontSize:15,fontWeight:'bold',color:C.red}}>-{fmtC(totalExpense)}</div></div>
          </div>
          <BarGraph data={graphData} title={`${graphPeriod.charAt(0).toUpperCase()+graphPeriod.slice(1)} Overview`}/>
          <DonutChart data={donutData} title="This Month's Expense Breakdown"/>
          <div style={sc()}>
            <div style={{fontSize:14,fontWeight:600,marginBottom:12}}>Category Summary (This Month)</div>
            {expenseCategories.map((cat,i)=>{
              const tot=transactions.filter(t=>t.type==='expense'&&t.category===cat&&t.date?.startsWith(curMonth)).reduce((s,t)=>s+t.amount,0);
              const pct=totalExpense>0?(tot/totalExpense*100).toFixed(0):0;
              return tot>0?(
                <div key={cat} style={{marginBottom:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                    <span style={{fontSize:12}}>{cat}</span>
                    <span style={{fontSize:12,color:C.red,fontWeight:'bold'}}>{fmtC(tot)} ({pct}%)</span>
                  </div>
                  <div style={{height:6,backgroundColor:'#111',borderRadius:3,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${pct}%`,backgroundColor:CAT_CLR[i%CAT_CLR.length],borderRadius:3}}/>
                  </div>
                </div>
              ):null;
            })}
          </div>
        </>}

        {/* BUDGET */}
        {screen==='budget'&&<>
          <div style={sc({textAlign:'center',padding:22})}>
            <div style={{fontSize:12,color:C.grey,marginBottom:5}}>Monthly Budget</div>
            <div style={{fontSize:40,fontWeight:'bold',color:C.purple,marginBottom:12}}>{fmtC(monthlyBudget)}</div>
            <div style={{display:'flex',gap:8,justifyContent:'center',flexWrap:'wrap'}}>
              <button onClick={()=>setShowBudget(true)} style={sb(C.purple,{padding:'8px 20px'})}>✏️ Edit Budget</button>
              <div style={{fontSize:11,color:C.green,padding:'8px 12px',backgroundColor:'#00C85315',borderRadius:8}}>🔔 Auto Alerts ON ✅</div>
            </div>
          </div>
          <div style={sc({borderLeft:`4px solid ${C.purple}`})}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
              <span style={{fontSize:12,color:C.grey}}>Monthly Spending</span>
              <span style={{fontWeight:'bold',color:budgetWarn?C.red:C.green}}>{fmtC(monthlySpend)}</span>
            </div>
            <div style={{height:18,backgroundColor:'#111',borderRadius:9,overflow:'hidden',marginBottom:8}}>
              <div style={{height:'100%',width:`${Math.min(budgetPct,100)}%`,backgroundColor:progColor,borderRadius:9,transition:'width 0.5s'}}/>
            </div>
            <div style={{display:'flex',justifyContent:'space-between'}}>
              <span style={{fontSize:11,color:C.grey}}>{budgetPct.toFixed(1)}% used</span>
              <span style={{fontSize:11,color:budgetWarn?C.red:C.green}}>{fmtC(monthlyBudget-monthlySpend)} remaining</span>
            </div>
            {budgetWarn&&<div style={{backgroundColor:'#FF174420',borderRadius:8,padding:10,marginTop:10,border:'1px solid #FF174444'}}><span style={{color:C.red,fontSize:12}}>⚠️ {budgetPct.toFixed(1)}% budget use ho gaya!</span></div>}
          </div>
          <div style={{fontSize:15,fontWeight:600,marginBottom:10}}>Top Expenses This Month</div>
          {expenseCategories.map(cat=>{const tot=transactions.filter(t=>t.type==='expense'&&t.category===cat&&t.date?.startsWith(curMonth)).reduce((s,t)=>s+t.amount,0);return tot>0?(<div key={cat} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid #1e1e3a'}}><span style={{fontSize:13}}>{cat}</span><span style={{color:C.red,fontWeight:'bold',fontSize:13}}>{fmtC(tot)}</span></div>):null;})}
        </>}
      </div>

      {/* Bottom Nav - 4 tabs */}
      <div style={{position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:480,backgroundColor:C.cards,display:'flex',borderTop:'1px solid #1e1e3a',zIndex:50}}>
        {[['dashboard','📊','Home'],['history','📜','History'],['graphs','📈','Graphs'],['budget','💰','Budget']].map(([s,ic,lb])=>(
          <button key={s} onClick={()=>setScreen(s)} style={{flex:1,padding:'10px 0',background:'none',border:'none',cursor:'pointer',color:screen===s?C.purple:C.grey,fontWeight:500,fontSize:10}}>
            <div style={{fontSize:18}}>{ic}</div>{lb}
          </button>
        ))}
      </div>

      {/* FAB */}
      <button onClick={()=>{setEditingTx(null);setShowAdd(true);}} style={{position:'fixed',bottom:68,right:16,width:52,height:52,borderRadius:26,backgroundColor:C.purple,border:'none',cursor:'pointer',fontSize:22,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 18px rgba(124,77,255,0.7)',zIndex:51}}>
        ➕
      </button>

      {/* ADD/EDIT MODAL */}
      {showAdd&&(
        <div style={{position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,0.9)',zIndex:100,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
          <div style={{backgroundColor:C.bg,width:'100%',maxWidth:480,borderRadius:'16px 16px 0 0',maxHeight:'92vh',overflowY:'auto',padding:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <span style={{fontSize:17,fontWeight:'bold'}}>{editingTx?'✏️ Edit Transaction':'➕ Add Transaction'}</span>
              <button onClick={closeModal} style={{background:'none',border:'none',color:C.white,fontSize:22,cursor:'pointer'}}>✕</button>
            </div>
            <div style={{display:'flex',gap:10,marginBottom:14}}>
              <button onClick={()=>{setTxType('income');setSelCat('');}} style={sb(txType==='income'?C.green:C.cards,{flex:1,padding:11})}>📈 Income</button>
              <button onClick={()=>{setTxType('expense');setSelCat('');}} style={sb(txType==='expense'?C.red:C.cards,{flex:1,padding:11})}>📉 Expense</button>
            </div>
            <div style={{marginBottom:13}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}>
                <div style={{fontSize:12,fontWeight:600}}>Amount *</div>
                <div style={{fontSize:11,color:C.purple,fontWeight:600}}>{getCurrSymbol(currency)} {currency} mein enter karo</div>
              </div>
              <input type="number" placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)} style={si({fontSize:24,fontWeight:'bold',textAlign:'center',padding:12})}/>
              {currency!=='INR'&&amount&&exchangeRates&&exchangeRates[currency]&&(
                <div style={{fontSize:11,color:C.grey,marginTop:4,textAlign:'center'}}>
                  = ₹{(parseFloat(amount||0)/exchangeRates[currency]).toFixed(2)} INR mein save hoga
                </div>
              )}
            </div>
            <div style={{marginBottom:13}}><div style={{fontSize:12,fontWeight:600,marginBottom:5}}>Note (Optional)</div><textarea placeholder="Kuch likhna hai?" value={note} onChange={e=>setNote(e.target.value)} style={si({minHeight:55,resize:'vertical'})}/></div>
            <div style={{marginBottom:13}}>
              <div style={{fontSize:12,fontWeight:600,marginBottom:5}}>Category *</div>
              <div style={{display:'flex',gap:6,overflowX:'auto',paddingBottom:4}}>
                {cats.map(c=><button key={c} onClick={()=>setSelCat(c)} style={sb(selCat===c?C.purple:C.cards,{padding:'6px 12px',borderRadius:20,fontSize:12,whiteSpace:'nowrap',border:selCat===c?`2px solid ${C.purple}`:'2px solid transparent'})}>{c}</button>)}
              </div>
            </div>
            <div style={{marginBottom:13}}><div style={{fontSize:12,fontWeight:600,marginBottom:5}}>Custom Category</div><div style={{display:'flex',gap:8}}><input placeholder="Naya category..." value={newCat} onChange={e=>setNewCat(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addCustomCat()} style={si({height:40,padding:'0 10px'})}/><button onClick={addCustomCat} style={sb(C.purple,{width:40,height:40,fontSize:20,display:'flex',alignItems:'center',justifyContent:'center'})}>+</button></div></div>
            <div style={{marginBottom:14}}><div style={{fontSize:12,fontWeight:600,marginBottom:5}}>Date</div><input type="date" value={selDate} onChange={e=>setSelDate(e.target.value)} style={si({colorScheme:'dark'})}/></div>
            <button onClick={handleSaveTx} style={sb(C.purple,{width:'100%',padding:13,fontSize:14,marginBottom:14})}>{editingTx?'💾 Update Transaction':'💾 Save Transaction'}</button>
          </div>
        </div>
      )}

      {/* BUDGET MODAL */}
      {showBudget&&(
        <div style={{position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,0.8)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={sc({width:'80%',maxWidth:300,marginBottom:0})}>
            <div style={{fontSize:16,fontWeight:'bold',marginBottom:12}}>💰 Budget Set Karo</div>
            <input type="number" value={budgetInput} onChange={e=>setBudgetInput(e.target.value)} style={si({fontSize:16,marginBottom:14})}/>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setShowBudget(false)} style={sb(C.grey,{flex:1,padding:11})}>Cancel</button>
              <button onClick={()=>{saveSet({monthlyBudget:parseFloat(budgetInput)||10000});setShowBudget(false);}} style={sb(C.purple,{flex:1,padding:11})}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* SAVE TO GOAL PROMPT */}
      {showSavePrompt&&(
        <div style={{position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,0.88)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={sc({width:'100%',maxWidth:340,marginBottom:0,padding:20})}>
            <div style={{fontSize:22,textAlign:'center',marginBottom:6}}>🏦</div>
            <div style={{fontSize:17,fontWeight:'bold',marginBottom:4,textAlign:'center'}}>Savings mein daalna hai?</div>
            <div style={{fontSize:12,color:C.grey,marginBottom:16,textAlign:'center'}}>Is income ka kuch hissa goal mein allocate karo</div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12,color:C.grey,marginBottom:5}}>Goal Choose Karo *</div>
              <select value={saveToGoalId} onChange={e=>setSaveToGoalId(e.target.value)} style={si()}>
                <option value="">-- Goal chunno --</option>
                {savingsGoals.filter(g=>(g.savedAmount||0)<g.targetAmount).map(g=>(
                  <option key={g.id} value={g.id}>{g.emoji} {g.title} ({fmtC(g.targetAmount-(g.savedAmount||0))} baki)</option>
                ))}
              </select>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,color:C.grey,marginBottom:5}}>Amount *</div>
              <input type="number" value={saveToGoalAmt} onChange={e=>setSaveToGoalAmt(e.target.value)} style={si({fontSize:18,fontWeight:'bold',textAlign:'center'})}/>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setShowSavePrompt(false)} style={sb(C.grey,{flex:1,padding:11,fontSize:13})}>⏭️ Skip</button>
              <button onClick={allocateToGoal} style={sb(C.purple,{flex:1,padding:11,fontSize:13})}>💾 Save to Goal</button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE GOAL MODAL */}
      {showSavingsModal&&(
        <div style={{position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,0.9)',zIndex:100,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
          <div style={{backgroundColor:C.bg,width:'100%',maxWidth:480,borderRadius:'16px 16px 0 0',maxHeight:'92vh',overflowY:'auto',padding:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <span style={{fontSize:17,fontWeight:'bold'}}>🏦 Naya Goal Banao</span>
              <button onClick={()=>setShowSavingsModal(false)} style={{background:'none',border:'none',color:C.white,fontSize:22,cursor:'pointer'}}>✕</button>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12,color:C.grey,marginBottom:8}}>Emoji Chunno</div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {['🎯','📱','🚗','🏠','✈️','💻','👗','💍','🎮','📚','🏖️','💪'].map(em=>(
                  <button key={em} onClick={()=>setNewGoalEmoji(em)} style={sb(newGoalEmoji===em?C.purple:C.cards,{padding:'6px 10px',borderRadius:8,fontSize:18,border:newGoalEmoji===em?`2px solid ${C.purple}`:'2px solid transparent'})}>{em}</button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:12}}><div style={{fontSize:12,color:C.grey,marginBottom:5}}>Goal Title *</div><input placeholder="Jaise: New Phone" value={newGoalTitle} onChange={e=>setNewGoalTitle(e.target.value)} style={si()}/></div>
            <div style={{marginBottom:12}}><div style={{fontSize:12,color:C.grey,marginBottom:5}}>Target Amount *</div><input type="number" placeholder="50000" value={newGoalTarget} onChange={e=>setNewGoalTarget(e.target.value)} style={si({fontSize:18,fontWeight:'bold',textAlign:'center'})}/></div>
            <div style={{marginBottom:16}}><div style={{fontSize:12,color:C.grey,marginBottom:5}}>Deadline (Optional)</div><input type="date" value={newGoalDeadline} onChange={e=>setNewGoalDeadline(e.target.value)} style={si({colorScheme:'dark'})}/></div>
            <button onClick={createGoal} style={sb(C.purple,{width:'100%',padding:13,fontSize:14,marginBottom:14})}>🏦 Goal Save Karo</button>
          </div>
        </div>
      )}

      {/* CURRENCY MODAL */}
      {showCurrency&&(
        <div style={{position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,0.85)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={sc({width:'100%',maxWidth:360,marginBottom:0,padding:20})}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <span style={{fontSize:17,fontWeight:'bold'}}>💱 Currency Chunno</span>
              <button onClick={()=>setShowCurrency(false)} style={{background:'none',border:'none',color:C.white,fontSize:22,cursor:'pointer'}}>✕</button>
            </div>
            {exchangeRates&&currency!=='INR'&&(
              <div style={{backgroundColor:'#00C85315',border:'1px solid #00C85330',borderRadius:8,padding:'8px 12px',marginBottom:12,fontSize:12,color:C.green}}>
                📡 Live Rate: 1 INR = {exchangeRates[currency]?.toFixed(4)} {currency}
              </div>
            )}
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {CURRENCIES.map(cur=>{
                const rate=exchangeRates?exchangeRates[cur.code]:null;
                return(
                  <button key={cur.code} onClick={()=>{saveSet({currency:cur.code});setShowCurrency(false);}}
                    style={sb(currency===cur.code?C.purple:C.dark,{padding:'12px 14px',textAlign:'left',display:'flex',justifyContent:'space-between',alignItems:'center',border:currency===cur.code?`2px solid ${C.purple}`:'2px solid #2a2a4a',borderRadius:10})}>
                    <div>
                      <div style={{fontSize:13}}>{cur.symbol} {cur.name}</div>
                      {rate&&cur.code!=='INR'&&<div style={{fontSize:10,color:currency===cur.code?'#ffffff99':C.grey,marginTop:2}}>1 ₹ = {rate.toFixed(4)} {cur.code}</div>}
                    </div>
                    <span style={{fontSize:12,color:currency===cur.code?C.white:C.grey}}>{cur.code} {currency===cur.code?'✓':''}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* RECURRING MODAL */}
      {showRecurring&&(
        <div style={{position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,0.9)',zIndex:100,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
          <div style={{backgroundColor:C.bg,width:'100%',maxWidth:480,borderRadius:'16px 16px 0 0',maxHeight:'92vh',overflowY:'auto',padding:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <span style={{fontSize:17,fontWeight:'bold'}}>🔄 Recurring Transactions</span>
              <button onClick={()=>setShowRecurring(false)} style={{background:'none',border:'none',color:C.white,fontSize:22,cursor:'pointer'}}>✕</button>
            </div>

            {/* Existing recurring list */}
            {recurringList.length>0&&(
              <div style={{marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:600,color:C.grey,marginBottom:8}}>Active Recurring</div>
                {recurringList.map(rec=>(
                  <div key={rec.id} style={sc({display:'flex',justifyContent:'space-between',alignItems:'center',padding:11,marginBottom:8,borderLeft:`4px solid ${rec.type==='income'?C.green:C.orange}`})}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:600}}>{rec.category} — {fmtC(rec.amount)}</div>
                      <div style={{fontSize:11,color:C.grey}}>{rec.freq} • {rec.note||''}</div>
                    </div>
                    <button onClick={()=>deleteRecurring(rec.id)} style={{background:'none',border:'none',cursor:'pointer',fontSize:16}}>🗑️</button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new recurring */}
            <div style={{fontSize:13,fontWeight:600,color:C.grey,marginBottom:10}}>Naya Recurring Add Karo</div>
            <div style={{display:'flex',gap:10,marginBottom:12}}>
              <button onClick={()=>{setRecType('income');setRecCat('');}} style={sb(recType==='income'?C.green:C.cards,{flex:1,padding:10,fontSize:13})}>📈 Income</button>
              <button onClick={()=>{setRecType('expense');setRecCat('');}} style={sb(recType==='expense'?C.red:C.cards,{flex:1,padding:10,fontSize:13})}>📉 Expense</button>
            </div>
            <div style={{marginBottom:11}}><div style={{fontSize:12,color:C.grey,marginBottom:5}}>Amount *</div><input type="number" placeholder="0.00" value={recAmount} onChange={e=>setRecAmount(e.target.value)} style={si({fontSize:20,fontWeight:'bold',textAlign:'center'})}/></div>
            <div style={{marginBottom:11}}>
              <div style={{fontSize:12,color:C.grey,marginBottom:5}}>Category *</div>
              <div style={{display:'flex',gap:6,overflowX:'auto',paddingBottom:4}}>
                {(recType==='income'?incomeCategories:expenseCategories).map(c=>(
                  <button key={c} onClick={()=>setRecCat(c)} style={sb(recCat===c?C.purple:C.cards,{padding:'6px 12px',borderRadius:20,fontSize:12,whiteSpace:'nowrap',border:recCat===c?`2px solid ${C.purple}`:'2px solid transparent'})}>{c}</button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:11}}>
              <div style={{fontSize:12,color:C.grey,marginBottom:5}}>Frequency (Kitni baar?)</div>
              <div style={{display:'flex',gap:8}}>
                {[['weekly','Weekly'],['monthly','Monthly'],['yearly','Yearly']].map(([f,lb])=>(
                  <button key={f} onClick={()=>setRecFreq(f)} style={sb(recFreq===f?C.orange:C.cards,{flex:1,padding:9,fontSize:12,borderRadius:8})}>{lb}</button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:11}}><div style={{fontSize:12,color:C.grey,marginBottom:5}}>Note</div><input placeholder="Jaise: Monthly rent" value={recNote} onChange={e=>setRecNote(e.target.value)} style={si()}/></div>
            <div style={{marginBottom:14}}><div style={{fontSize:12,color:C.grey,marginBottom:5}}>Start Date</div><input type="date" value={recStartDate} onChange={e=>setRecStartDate(e.target.value)} style={si({colorScheme:'dark'})}/></div>
            <button onClick={saveRecurring} style={sb(C.orange,{width:'100%',padding:13,fontSize:14,marginBottom:14})}>🔄 Recurring Save Karo</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [user,setUser]=useState(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{const u=onAuthStateChanged(auth,u=>{setUser(u);setLoading(false);});return u;},[]);
  if(loading)return<Loader text="Loading..."/>;
  return user?<SpendSmart user={user}/>:<AuthScreen/>;
}
