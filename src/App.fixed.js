import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import AuthScreen from './AuthScreen';
import SpendSmart from './SpendSmart';
import { C, Loader } from './ui';

function Splash({ done }) {
  const [muted, setMuted] = useState(true);
  useEffect(() => {
    const timer = setTimeout(done, 7000);
    return () => clearTimeout(timer);
  }, [done]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: C.bg, zIndex: 9999 }} onClick={done}>
      <video
        src="/splash.mp4"
        autoPlay
        muted={muted}
        playsInline
        onEnded={done}
        onError={done}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
      <button
        aria-label={muted ? 'Unmute splash' : 'Mute splash'}
        onClick={event => { event.stopPropagation(); setMuted(value => !value); }}
        style={{ position: 'absolute', top: 16, right: 16, border: 0, borderRadius: 20, padding: '7px 12px', background: 'rgba(0,0,0,.55)', color: '#fff', cursor: 'pointer' }}
      >
        {muted ? '🔇' : '🔊'}
      </button>
      <div style={{ position: 'absolute', bottom: 25, width: '100%', textAlign: 'center', color: '#ffffff55', fontSize: 11 }}>tap to skip</div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [splash, setSplash] = useState(() => !sessionStorage.getItem('spendsmart_splash_seen'));

  useEffect(() => onAuthStateChanged(auth, nextUser => {
    setUser(nextUser);
    setLoading(false);
  }), []);

  const finishSplash = () => {
    sessionStorage.setItem('spendsmart_splash_seen', '1');
    setSplash(false);
  };

  if (splash) return <Splash done={finishSplash} />;
  if (loading) return <Loader />;
  return user ? <SpendSmart user={user} /> : <AuthScreen />;
}
