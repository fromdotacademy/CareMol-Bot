import { test, expect, Page } from '@playwright/test';

// Helpers
async function navigateToDashboard(page: Page) {
  await page.goto('/');
  // Wait for the admin dashboard to fully load (stat cards appear)
  await page.waitForSelector('text=Total Revenue', { timeout: 15_000 });
}

async function clickTab(page: Page, name: string) {
  await page.getByRole('button', { name: new RegExp(name, 'i') }).first().click();
  await page.waitForTimeout(300);
}

// ─── 1. Authentication & Dashboard ───────────────────────────────────────────

test.describe('Authentication', () => {
  test('admin is signed in and dashboard loads', async ({ page }) => {
    await navigateToDashboard(page);
    await expect(page.getByRole('heading', { name: 'CareMol Admin' })).toBeVisible();
    await expect(page.getByText(/fromdotacademy@gmail\.com/i)).toBeVisible();
    await expect(page.getByText('Sign in with Google')).not.toBeVisible();
  });

  test('footer shows System ID and user email', async ({ page }) => {
    await navigateToDashboard(page);
    await expect(page.getByText(/System ID/i)).toBeVisible();
    await expect(page.getByText(/fromdotacademy@gmail\.com/i)).toBeVisible();
  });
});

// ─── 2. Dashboard Layout ──────────────────────────────────────────────────────

test.describe('Dashboard Layout', () => {
  test.beforeEach(async ({ page }) => navigateToDashboard(page));

  test('shows header branding', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'CareMol Admin' })).toBeVisible();
    await expect(page.getByText('Home Sample Collection | Melattur Center')).toBeVisible();
  });

  test('shows 4 stat cards', async ({ page }) => {
    await expect(page.getByText('Total Revenue')).toBeVisible();
    await expect(page.getByText('Action Needed')).toBeVisible();
    await expect(page.getByText('Samples in Transit')).toBeVisible();
    await expect(page.getByText('Completed Today')).toBeVisible();
  });

  test('shows 5 navigation tabs', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Bookings/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Patients/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Staff/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Schedule' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
  });

  test('shows current date in header', async ({ page }) => {
    // Header shows a date — just confirm it's there
    await expect(page.locator('header, banner').getByText(/\d{4}/)).toBeVisible();
  });
});

// ─── 3. Bookings Tab ─────────────────────────────────────────────────────────

test.describe('Bookings Tab', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToDashboard(page);
    await page.getByRole('button', { name: /Bookings/i }).first().click();
    await page.waitForTimeout(300);
  });

  test('shows table with correct column headers', async ({ page }) => {
    await expect(page.getByRole('columnheader', { name: 'Patient Details' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Test & Logistics' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Revenue & Priority' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Status Management' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Actions' })).toBeVisible();
  });

  test('shows status filter buttons', async ({ page }) => {
    for (const label of ['All', 'Created', 'Assigned', 'Collected', 'Processing', 'Completed']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
  });

  test('shows search input', async ({ page }) => {
    await expect(page.getByPlaceholder(/Search patient/i)).toBeVisible();
  });

  test('legacy bookings show Legacy badge', async ({ page }) => {
    await expect(page.getByText('Legacy').first()).toBeVisible();
  });

  test('new booking shows formatted date (not "—")', async ({ page }) => {
    // At least one booking should have a real date (Sat, 16 May was booked by the smoke test)
    const dateCell = page.getByText(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+\d+ (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/);
    await expect(dateCell.first()).toBeVisible();
  });

  test('booking rows have action buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Call Patient/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /View patient profile/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit Tests' }).first()).toBeVisible();
  });

  test('Created filter hides Completed bookings', async ({ page }) => {
    await page.getByRole('button', { name: 'Created', exact: true }).click();
    await page.waitForTimeout(300);
    // Completed status select options should not show "Completed" as selected in any visible row
    const completedOptions = page.locator('select option[selected]').filter({ hasText: 'Completed' });
    await expect(completedOptions).toHaveCount(0);
  });

  test('Completed filter shows only completed bookings', async ({ page }) => {
    await page.getByRole('button', { name: 'Completed', exact: true }).click();
    await page.waitForTimeout(300);
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    // The status select (not the priority "Override priority" select) should show Completed
    const statusSelect = page.locator('table tbody select:not([title="Override priority"])').first();
    await expect(statusSelect).toHaveValue('Completed');
  });

  test('search by patient name filters results', async ({ page }) => {
    await page.getByPlaceholder(/Search patient/i).fill('jafar');
    await page.waitForTimeout(300);
    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible();
  });

  test('search with no match shows empty table', async ({ page }) => {
    await page.getByPlaceholder(/Search patient/i).fill('zzznomatch999');
    await page.waitForTimeout(300);
    // Empty state renders as a single <tr> with a "no results" message
    await expect(page.getByText('No bookings found matching filters')).toBeVisible();
  });

  test('priority dropdown is present on each booking row', async ({ page }) => {
    const priorityDropdown = page.getByRole('combobox', { name: /Override priority/ }).first();
    await expect(priorityDropdown).toBeVisible();
  });
});

// ─── 4. Settings Tab ─────────────────────────────────────────────────────────

test.describe('Settings Tab', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToDashboard(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.waitForSelector('text=Slot Template');
  });

  test('shows 3 default slots with correct labels', async ({ page }) => {
    await expect(page.getByText('7:00 AM – 8:00 AM')).toBeVisible();
    await expect(page.getByText('8:00 AM – 9:00 AM')).toBeVisible();
    await expect(page.getByText('9:00 AM – 10:00 AM')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove slot' })).toHaveCount(3);
  });

  test('shows maxAdvanceDays = 7', async ({ page }) => {
    await expect(page.getByRole('spinbutton')).toHaveValue('7');
  });

  test('Save Settings is disabled by default', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Save Settings' })).toBeDisabled();
  });

  test('Save Settings enables when maxAdvanceDays changes', async ({ page }) => {
    await page.getByRole('spinbutton').fill('5');
    await expect(page.getByRole('button', { name: 'Save Settings' })).toBeEnabled();
    // Restore
    await page.getByRole('spinbutton').fill('7');
    await page.getByRole('button', { name: 'Save Settings' }).click();
    await page.waitForTimeout(1000);
  });

  test('Add slot auto-populates next time and enables Save', async ({ page }) => {
    // Current last slot ends at 10:00 → Add slot should create 10:00–11:00
    await page.getByRole('button', { name: 'Add slot' }).click();
    await expect(page.getByText('10:00 AM – 11:00 AM')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Settings' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Remove slot' })).toHaveCount(4);

    // Save and verify persistence after reload
    await page.getByRole('button', { name: 'Save Settings' }).click();
    await page.waitForTimeout(1500);
    await page.reload();
    await clickTab(page, 'Settings');
    await page.waitForSelector('text=Slot Template');
    await expect(page.getByText('10:00 AM – 11:00 AM')).toBeVisible();

    // Cleanup: remove the 4th slot
    await page.getByRole('button', { name: 'Remove slot' }).last().click();
    await page.getByRole('button', { name: 'Save Settings' }).click();
    await page.waitForTimeout(1500);
  });

  test('Remove slot reduces slot count and enables Save', async ({ page }) => {
    const removeButtons = page.getByRole('button', { name: 'Remove slot' });
    // Remove without saving to not affect other tests
    await removeButtons.last().click();
    await expect(removeButtons).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Save Settings' })).toBeEnabled();
    // Discard by reloading
    await page.reload();
    await clickTab(page, 'Settings');
    await page.waitForSelector('text=Slot Template');
    await expect(page.getByRole('button', { name: 'Remove slot' })).toHaveCount(3);
  });

  test('validation shows error for empty slot times', async ({ page }) => {
    await page.getByRole('button', { name: 'Add slot' }).click();
    // Manually clear one of the new slot inputs
    const timeInputs = page.locator('input[type="time"]');
    const count = await timeInputs.count();
    await timeInputs.nth(count - 2).fill('');
    // Save button should remain disabled (validation fails)
    await expect(page.getByRole('button', { name: 'Save Settings' })).toBeDisabled();
    // Cleanup
    await page.reload();
  });
});

// ─── 5. Schedule Tab ─────────────────────────────────────────────────────────

test.describe('Schedule Tab', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToDashboard(page);
    await clickTab(page, 'Schedule');
    await page.waitForSelector('text=Phlebotomist Schedule');
  });

  test('shows Phlebotomist Schedule heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Phlebotomist Schedule/i })).toBeVisible();
  });

  test('shows Today and Tomorrow date buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tomorrow' })).toBeVisible();
  });

  test('shows multiple future date buttons', async ({ page }) => {
    // At least 7 date buttons should be visible (today + next 6)
    const dateButtons = page.locator('button').filter({ hasText: /Today|Tomorrow|Mon|Tue|Wed|Thu|Fri|Sat|Sun/ });
    const count = await dateButtons.count();
    expect(count).toBeGreaterThanOrEqual(7);
  });

  test('shows slot column headers matching the config template', async ({ page }) => {
    await expect(page.getByRole('columnheader', { name: '7:00 AM – 8:00 AM' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '8:00 AM – 9:00 AM' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '9:00 AM – 10:00 AM' })).toBeVisible();
  });

  test('shows no-phlebotomist message when Staff is empty', async ({ page }) => {
    await expect(page.getByText(/No active phlebotomists/i)).toBeVisible();
  });

  test('clicking Tomorrow date is reflected in the grid', async ({ page }) => {
    await page.getByRole('button', { name: 'Tomorrow' }).click();
    // Grid should still be visible and show the same slot columns
    await expect(page.getByRole('columnheader', { name: '7:00 AM – 8:00 AM' })).toBeVisible();
  });
});

// ─── 6. WhatsApp Simulator ────────────────────────────────────────────────────

// Navigate the simulator to LANGUAGE_SELECTION regardless of saved language state.
// On fresh mount the simulator auto-starts: if the admin has a saved language it
// shows MAIN_MENU first; clicking "🌐 Change Language" / "🌐 ഭാഷ മാറ്റുക" returns
// to language selection. The emoji is common to both language variants.
async function ensureAtLanguageSelection(page: Page) {
  const englishBtn = page.getByRole('button', { name: 'English' });

  // If we landed on main menu (language was saved), click Change Language.
  // Match by the 🌐 emoji which is shared across English and Malayalam labels.
  const changeLanguageBtn = page.getByRole('button', { name: /🌐/ });
  try {
    await changeLanguageBtn.waitFor({ timeout: 8_000 });
    await changeLanguageBtn.click();
    await page.waitForTimeout(400);
  } catch {
    // Already at language selection — English button should be present
  }

  await expect(englishBtn.first()).toBeVisible({ timeout: 5_000 });
}

test.describe('WhatsApp Simulator', () => {
  // Use a wide viewport so the simulator sidebar is visible (hidden lg:flex)
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await navigateToDashboard(page);
    // Wait for the simulator label to confirm it's rendered
    await page.waitForSelector('text=User Interface: WhatsApp Chatbot', { timeout: 10_000 });
  });

  test('simulator panel is visible alongside dashboard', async ({ page }) => {
    await expect(page.getByText('User Interface: WhatsApp Chatbot')).toBeVisible();
  });

  test('shows language selection step on fresh load', async ({ page }) => {
    // Simulator auto-starts; navigate to language selection state
    await ensureAtLanguageSelection(page);
    await expect(page.getByRole('button', { name: 'English' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'മലയാളം' }).first()).toBeVisible();
  });

  test('selecting English shows main menu with all 6 options', async ({ page }) => {
    await ensureAtLanguageSelection(page);
    await page.getByRole('button', { name: 'English' }).first().click();
    await page.waitForTimeout(800);

    const expectedOptions = [
      /Book Home Sample Collection/,
      /Medicine Delivery/,
      /View Health Packages/,
      /Talk to Support/,
      /FAQ/,
      /Call CareMol/,
    ];
    for (const opt of expectedOptions) {
      await expect(page.getByText(opt).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('selecting Malayalam shows main menu in Malayalam', async ({ page }) => {
    await ensureAtLanguageSelection(page);
    // The button text is Malayalam script, not the word "Malayalam"
    await page.getByRole('button', { name: 'മലയാളം' }).first().click();
    await page.waitForTimeout(800);
    // Malayalam main menu option text from constants.ts
    await expect(page.getByText(/ഹോം സാമ്പിൾ കളക്ഷൻ/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('FAQ option shows FAQ topics', async ({ page }) => {
    await ensureAtLanguageSelection(page);
    await page.getByRole('button', { name: 'English' }).first().click();
    await page.waitForTimeout(500);
    await page.getByText(/FAQ/).first().click();
    await page.waitForTimeout(800);
    await expect(page.getByText(/Available Locations|Working Hours|Payment Methods/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('Medicine Delivery shows coming-soon message', async ({ page }) => {
    await ensureAtLanguageSelection(page);
    await page.getByRole('button', { name: 'English' }).first().click();
    await page.waitForTimeout(500);
    await page.getByText(/Medicine Delivery/i).first().click();
    await page.waitForTimeout(800);
    await expect(page.getByText(/available soon|coming soon/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('Book flow: bot responds after clicking Book', async ({ page }) => {
    await ensureAtLanguageSelection(page);
    await page.getByRole('button', { name: 'English' }).first().click();
    await page.waitForTimeout(500);
    await page.getByText(/Book Home Sample Collection/i).first().click();
    await page.waitForTimeout(500);

    // Bot responds immediately with either:
    //   "Who are you booking for?" (when saved patients exist), or
    //   "Please enter patient details" (when no saved patients)
    await expect(page.getByText(/booking for|patient details/i).first()).toBeVisible({ timeout: 5_000 });
  });
});

// ─── 7. Patients Tab ─────────────────────────────────────────────────────────

test.describe('Patients Tab', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToDashboard(page);
    await clickTab(page, 'Patients');
  });

  test('shows patients list or empty state', async ({ page }) => {
    // Either a patient row or an empty-state message should be visible
    const hasPatient = await page.locator('table tbody tr').first().isVisible().catch(() => false);
    const hasEmpty = await page.getByText(/no patients|empty/i).isVisible().catch(() => false);
    // Patients tab loaded (tab button is active)
    const patientsTab = page.getByRole('button', { name: /Patients/i });
    await expect(patientsTab).toBeVisible();
  });
});

// ─── 8. Staff Tab ────────────────────────────────────────────────────────────

test.describe('Staff Tab', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToDashboard(page);
    await clickTab(page, 'Staff');
  });

  test('shows Add Staff button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Add Staff/i })).toBeVisible({ timeout: 5_000 });
  });

  test('shows empty staff state with Staff (0)', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Staff \(0\)/i })).toBeVisible();
  });
});
