import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache, setLogLevel } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Suppress benign Firestore internal warnings/errors caused by minor client-server millisecond clock skew
setLogLevel('silent');

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(
  app,
  {
    localCache: memoryLocalCache(),
  },
  (firebaseConfig as any).firestoreDatabaseId
);

export const auth = getAuth(app);

