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
  
  if (serviceAccountStr) {
    try {
      const serviceAccount = JSON.parse(serviceAccountStr);
      app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('Firebase Admin initialized via Service Account');
    } catch (e) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT, falling back to default credentials');
      app = admin.initializeApp({
        projectId: firebaseConfig.projectId
      });
    }
  } else if (firebaseConfig.projectId !== 'missing-config') {
    app = admin.initializeApp({
      projectId: firebaseConfig.projectId
    });
    console.log('Firebase Admin initialized with Application Default Credentials');
  } else {
    // Last resort mock app to prevent crash
    app = admin.initializeApp({ projectId: 'mock-id' });
    console.log('Firebase Admin initialized with mock ID (Check your configuration!)');
  }
} else {
  app = admin.app();
}

export const adminDb = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');
export default admin;
