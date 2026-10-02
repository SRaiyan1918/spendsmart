import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, GoogleAuthProvider, browserPopupRedirectResolver, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, enableMultiTabIndexedDbPersistence, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyD2d1xHmkhJbFzCAf_3UKGeVTdkCkPGk54',
  authDomain: 'spend-smart-eb084.firebaseapp.com',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || 'spend-smart-eb084',
  storageBucket: 'spend-smart-eb084.firebasestorage.app',
  messagingSenderId: '291802030949',
  appId: '1:291802030949:web:f06326beaaffeb2672778c',
};

const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  popupRedirectResolver: browserPopupRedirectResolver,
});
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Explicit opt-in for local integration tests; production defaults to the existing project.
if (process.env.REACT_APP_FIREBASE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

// Explicit readiness is required: persistentLocalCache can silently fall back to memory.
export const persistenceReady = enableMultiTabIndexedDbPersistence(db).then(
  () => true,
  error => { console.warn('SpendSmart persistent storage unavailable', error); return false; },
);
