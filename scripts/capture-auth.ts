// Standalone script: opens Chrome with the user's real profile (so Google
// session already exists), navigates to the app, and saves storageState.
// Run once before `npx playwright test`.
//
// Usage:
//   npx tsx scripts/capture-auth.ts

import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_OUT = path.join(__dirname, '../tests/auth/google-session.json');

// Point to the real Chrome profile so Google cookies are already present
const CHROME_USER_DATA = process.env.CHROME_USER_DATA
  ?? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\User Data`;

async function main() {
  console.log('Opening Chrome with your real profile...');
  console.log(`  Profile dir: ${CHROME_USER_DATA}`);

  // launchPersistentContext uses the real Chrome profile — Google session intact
  const context = await chromium.launchPersistentContext(CHROME_USER_DATA, {
    channel: 'chrome',
    headless: false,
    args: ['--profile-directory=Default'],
  });

  const page = context.pages()[0] ?? await context.newPage();
  await page.goto('http://localhost:3000');

  console.log('\nNavigated to http://localhost:3000');
  console.log('If not already logged in, please sign in with Google now.');
  console.log('Waiting up to 90 seconds for the dashboard to appear...\n');

  try {
    await page.waitForFunction(
      () => {
        const body = document.body.innerText;
        return (
          body.includes('Bookings') ||
          body.includes('Schedule') ||
          body.includes('WhatsApp') ||
          body.includes('simulator')
        );
      },
      { timeout: 90_000 }
    );
  } catch {
    console.error('Timed out waiting for login. Please run the script again.');
    await context.close();
    process.exit(1);
  }

  console.log('✓ Logged in. Saving session to', SESSION_OUT);
  await context.storageState({ path: SESSION_OUT });
  console.log('✓ Done. You can now run: npx playwright test');

  await context.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
