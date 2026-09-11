import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyD2d1xHmkhJbFzCAf_3UKGeVTdkCkPGk54',
  authDomain: 'spend-smart-eb084.firebaseapp.com',
  projectId: 'spend-smart-eb084',
  storageBucket: 'spend-smart-eb084.firebasestorage.app',
  messagingSenderId: '291802030949',
  appId: '1:291802030949:web:f06326beaaffeb2672778c',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
