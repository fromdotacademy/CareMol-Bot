import { test, expect, Page, Locator } from '@playwright/test';

// ─── helpers ──────────────────────────────────────────────────────────────────

async function navigateToDashboard(page: Page) {
  await page.goto('/');
  await page.waitForSelector('text=Total Revenue', { timeout: 15_000 });
  await page.waitForSelector('text=User Interface: WhatsApp Chatbot', { timeout: 10_000 });
}

// Reset the simulator chat to the language-selection screen. The simulator
// auto-starts; if the admin has a saved language it lands on MAIN_MENU. The
// 🌐 emoji in the language-change button is shared by both EN and ML labels.
async function ensureAtLanguageSelection(page: Page) {
  const changeLanguageBtn = page.getByRole('button', { name: /🌐/ });
  try {
    await changeLanguageBtn.waitFor({ timeout: 8_000 });
    await changeLanguageBtn.click();
    await page.waitForTimeout(700);
  } catch {
    // Already at language selection
  }
  await expect(page.getByRole('button', { name: 'English' }).first()).toBeVisible({ timeout: 5_000 });
}

// Pick English and wait for the main menu.
async function startInEnglish(page: Page) {
  await ensureAtLanguageSelection(page);
  await page.getByRole('button', { name: 'English' }).first().click();
  await expect(page.getByText(/View Packages/).first()).toBeVisible({ timeout: 5_000 });
}

// The simulator wraps its state machine in setTimeout(_, 500), so we wait
// 700ms after every button click to let the new bot bubble render.
async function clickLatestButton(page: Page, name: string | RegExp): Promise<void> {
  const btn = page.getByRole('button', { name }).last();
  await btn.click();
  await page.waitForTimeout(700);
}

// Last bot bubble in the chat. Bot bubbles live inside .mr-auto containers;
// the bubble text is in a <p class="whitespace-pre-wrap">.
function lastBotBubble(page: Page): Locator {
  return page.locator('div.mr-auto > div > p.whitespace-pre-wrap').last();
}

// ─── 1. Browse: all 9 new packages render ─────────────────────────────────────

test.describe('Package Browse (PACKAGE_VIEW)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await navigateToDashboard(page);
    await startInEnglish(page);
    await clickLatestButton(page, /View Packages/);
  });

  test('shows all 6 bookable packages from poster', async ({ page }) => {
    for (const name of ['Basic Health', 'Smart Care', 'Pro Care', 'Elite Care', 'Women Wellness', 'Diabetes Care']) {
      await expect(page.getByRole('button', { name, exact: true }).last()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('shows all 3 family plans in the browse list', async ({ page }) => {
    for (const name of ['Family Basic', 'Family Smart', 'Family Complete']) {
      await expect(page.getByRole('button', { name, exact: true }).last()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('does NOT show the old placeholder packages', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Basic Health Check' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Diabetes Profile' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Full Body Checkup' })).toHaveCount(0);
  });
});

// ─── 2. PACKAGE_DETAIL_VIEW: MRP, savings, included tests, ECG, home pickup ──

test.describe('Package Detail View', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await navigateToDashboard(page);
    await startInEnglish(page);
    await clickLatestButton(page, /View Packages/);
  });

  test('Basic Health: MRP, savings, tagline, included tests, ECG add-on, 2 months pickup', async ({ page }) => {
    await clickLatestButton(page, /^Basic Health$/);
    const bubble = lastBotBubble(page);
    await expect(bubble).toContainText('Basic Health', { timeout: 5_000 });
    await expect(bubble).toContainText('10–15 Tests');
    await expect(bubble).toContainText('Routine Essential');
    await expect(bubble).toContainText('₹500');      // MRP (strike-through)
    await expect(bubble).toContainText('₹299');      // price
    await expect(bubble).toContainText('Save ₹201');
    await expect(bubble).toContainText('Blood Sugar (Fasting)');
    await expect(bubble).toContainText('Lipid Profile');
    await expect(bubble).toContainText('ECG add-on');
    await expect(bubble).toContainText('2 months home pickup');
    await expect(page.getByRole('button', { name: 'Book Now' }).last()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to Packages' }).last()).toBeVisible();
  });

  test('Smart Care: shows MOST BOOKED badge', async ({ page }) => {
    await clickLatestButton(page, /^Smart Care$/);
    const bubble = lastBotBubble(page);
    await expect(bubble).toContainText('Smart Care', { timeout: 5_000 });
    await expect(bubble).toContainText('MOST BOOKED');
    await expect(bubble).toContainText('Save ₹301');
    await expect(bubble).toContainText('HbA1c');
  });

  test('Pro Care: ECG Included (not add-on), 3 months pickup, DOCTOR REC. badge', async ({ page }) => {
    await clickLatestButton(page, /^Pro Care$/);
    const bubble = lastBotBubble(page);
    await expect(bubble).toContainText('Pro Care', { timeout: 5_000 });
    await expect(bubble).toContainText('DOCTOR REC.');
    await expect(bubble).toContainText('ECG Included');
    await expect(bubble).not.toContainText('ECG add-on');
    await expect(bubble).toContainText('3 months home pickup');
    await expect(bubble).toContainText('Save ₹400');
  });

  test('Elite Care: ECG Included, 6 months pickup, PREMIUM badge', async ({ page }) => {
    await clickLatestButton(page, /^Elite Care$/);
    const bubble = lastBotBubble(page);
    await expect(bubble).toContainText('Elite Care', { timeout: 5_000 });
    await expect(bubble).toContainText('PREMIUM');
    await expect(bubble).toContainText('ECG Included');
    await expect(bubble).toContainText('6 months home pickup');
    await expect(bubble).toContainText('Save ₹500');
  });
});

// ─── 3. Family-plan branch: shows call-us prompt, not a bookable detail ──────

test.describe('Family Plan Branch', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await navigateToDashboard(page);
    await startInEnglish(page);
    await clickLatestButton(page, /View Packages/);
  });

  test('Family Basic shows phone-consultation prompt instead of Book Now', async ({ page }) => {
    await clickLatestButton(page, /^Family Basic$/);
    const bubble = lastBotBubble(page);
    await expect(bubble).toContainText('Family Basic', { timeout: 5_000 });
    await expect(bubble).toContainText(/family plan/i);
    await expect(bubble).toContainText(/phone consultation/i);
    await expect(page.getByRole('button', { name: /Call CareMol/ }).last()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to Packages' }).last()).toBeVisible();
  });

  test('Family Complete also routes to call-us', async ({ page }) => {
    await clickLatestButton(page, /^Family Complete$/);
    const bubble = lastBotBubble(page);
    await expect(bubble).toContainText('Family Complete', { timeout: 5_000 });
    await expect(bubble).toContainText(/phone consultation/i);
  });
});

// ─── 4. Malayalam translations show on the browse list ───────────────────────

test.describe('Malayalam Package Names', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('Malayalam browse list shows translated names', async ({ page }) => {
    await navigateToDashboard(page);
    await ensureAtLanguageSelection(page);
    await page.getByRole('button', { name: 'മലയാളം' }).first().click();
    await page.waitForTimeout(700);
    await clickLatestButton(page, /പാക്കേജുകൾ/);
    await expect(page.getByRole('button', { name: 'ബേസിക് ഹെൽത്ത്', exact: true }).last()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: 'സ്മാർട്ട് കെയർ', exact: true }).last()).toBeVisible();
    await expect(page.getByRole('button', { name: 'ഡയബറ്റീസ് കെയർ', exact: true }).last()).toBeVisible();
  });
});
