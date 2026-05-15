import { initializeApp } from 'firebase/app';
import {
  initializeAuth,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  browserPopupRedirectResolver,
  signInWithCustomToken,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// In dev/test use localStorage persistence so Playwright storageState captures
// the auth session. In production keep IndexedDB (service-worker compatible).
const isDev = typeof window !== 'undefined' && (import.meta as any).env?.DEV;

export const auth = initializeAuth(app, {
  persistence: isDev ? browserLocalPersistence : indexedDBLocalPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
});

// Expose auth handle for Playwright auth setup (dev only).
if (isDev) {
  (window as any).__pw_auth = { auth, signInWithCustomToken };
}
