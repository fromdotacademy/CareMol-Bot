import { initializeApp } from 'firebase/app';
import {
  initializeAuth,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  browserPopupRedirectResolver,
  signInWithCustomToken,
} from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
// ignoreUndefinedProperties strips undefined values from writes instead of
// throwing — keeps the manual-booking modal and any future Partial<...> writes
// safe without per-call sanitization.
export const db = initializeFirestore(
  app,
  { ignoreUndefinedProperties: true },
  firebaseConfig.firestoreDatabaseId
);

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
