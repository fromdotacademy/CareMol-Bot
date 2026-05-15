import { test as setup, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessionFile = path.join(__dirname, 'google-session.json');

setup('authenticate as admin via custom token', async ({ page }) => {
  setup.setTimeout(60_000);

  // 1. Navigate to the app so Firebase initialises and exposes __pw_auth
  await page.goto('/');

  // 2. Wait for Firebase to expose the auth handle (injected by firebase.ts in dev mode)
  await page.waitForFunction(() => !!(window as any).__pw_auth, { timeout: 15_000 });

  // 3. Fetch a custom token for the hardcoded admin from the dev endpoint
  const tokenRes = await page.evaluate(async () => {
    const r = await fetch('/api/dev-token');
    return r.json() as Promise<{ token: string; uid: string } | { error: string }>;
  });

  if ('error' in tokenRes) {
    throw new Error(`/api/dev-token failed: ${tokenRes.error}`);
  }

  // 4. Sign in with the custom token inside the browser context
  await page.evaluate(async (customToken: string) => {
    const { auth, signInWithCustomToken } = (window as any).__pw_auth;
    await signInWithCustomToken(auth, customToken);
  }, tokenRes.token);

  // 5. Reload so Firebase re-reads the session from localStorage (auth is now
  //    persisted there). After reload onAuthStateChanged fires with the user.
  await page.reload({ waitUntil: 'domcontentloaded' });

  // 6. Wait for any post-login content (dashboard for admin, simulator for customer)
  await page.waitForFunction(
    () => {
      const body = document.body.innerText;
      // Login page shows "Sign in with Google" — wait until it's gone
      return !body.includes('Sign in with Google') && body.trim().length > 50;
    },
    { timeout: 30_000 }
  );

  // 6. Save the authenticated session (localStorage-based, captured by storageState)
  await page.context().storageState({ path: sessionFile });
  console.log(`✓ Auth session saved to ${sessionFile}`);
});
