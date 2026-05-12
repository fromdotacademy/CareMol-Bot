import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let firebaseConfig: any = { projectId: 'missing-config' };
try {
  const configPath = path.resolve(process.cwd(), './firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } else {
    console.error('firebase-applet-config.json not found at', configPath);
  }
} catch (err) {
  console.error('Error reading firebase-applet-config.json:', err);
}

let app: admin.app.App;

if (!admin.apps.length) {
  const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
  const keyFilePath = process.env.FIREBASE_KEY_FILE || process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (serviceAccountStr) {
    try {
      const serviceAccount = JSON.parse(serviceAccountStr);
      app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      console.log('Firebase Admin initialized via FIREBASE_SERVICE_ACCOUNT');
    } catch (e) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT — use FIREBASE_KEY_FILE=/path/to/key.json instead');
      app = admin.initializeApp({ projectId: firebaseConfig.projectId });
    }
  } else if (keyFilePath) {
    // Accepts FIREBASE_KEY_FILE or GOOGLE_APPLICATION_CREDENTIALS pointing to the JSON key file.
    app = admin.initializeApp({ credential: admin.credential.cert(keyFilePath) });
    console.log('Firebase Admin initialized via key file:', keyFilePath);
  } else if (firebaseConfig.projectId !== 'missing-config') {
    app = admin.initializeApp({ projectId: firebaseConfig.projectId });
    console.log('Firebase Admin initialized with Application Default Credentials');
  } else {
    app = admin.initializeApp({ projectId: 'mock-id' });
    console.log('Firebase Admin initialized with mock ID (Check your configuration!)');
  }
} else {
  app = admin.app();
}

export const adminDb = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');
export default admin;
