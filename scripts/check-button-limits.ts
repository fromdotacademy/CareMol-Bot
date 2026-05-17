/**
 * Verifies that every TRANSLATIONS button/list label fits within Meta's WhatsApp
 * interactive limits: 20 chars for reply buttons, 24 chars for list rows.
 * Counts both grapheme clusters (what users see) and UTF-16 code units (what
 * some APIs measure), and fails if either exceeds the limit.
 *
 * Run: npx tsx scripts/check-button-limits.ts
 * Exits with code 1 on any violation.
 */
import { TRANSLATIONS, PACKAGES } from '../src/constants';

const BUTTON_LIMIT = 20;
const LIST_ROW_LIMIT = 24;

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function graphemes(s: string): number {
  let n = 0;
  for (const _ of segmenter.segment(s)) n++;
  return n;
}

type Violation = {
  context: string;
  label: string;
  limit: number;
  graphemes: number;
  units: number;
};

const violations: Violation[] = [];
const warnings: Violation[] = [];

function check(label: string, limit: number, context: string) {
  const g = graphemes(label);
  const u = label.length;
  if (g > limit || u > limit) {
    violations.push({ context, label, limit, graphemes: g, units: u });
  } else if (g >= limit - 1 || u >= limit - 1) {
    warnings.push({ context, label, limit, graphemes: g, units: u });
  }
}

// Main menu option buttons (sent as reply buttons or list rows depending on count).
// Worst case is reply buttons (20-char limit), so enforce that.
for (const [lang, t] of Object.entries(TRANSLATIONS)) {
  for (const [key, val] of Object.entries((t as any).options ?? {})) {
    if (typeof val === 'string') {
      check(val, BUTTON_LIMIT, `TRANSLATIONS.${lang}.options.${key}`);
    }
  }
}

// Other top-level button-like strings used by the bot.
const buttonKeys: (keyof typeof TRANSLATIONS.en)[] = [
  'someoneElse', 'changeLanguage', 'yesFasting', 'noFasting',
  'confirmButton', 'editButton', 'endSession', 'mainMenu',
  'yesCorrect', 'noChange', 'cancelBooking', 'doneSelecting',
  'bookNow', 'backToPackages', 'backToMainMenu',
  'yesCancel', 'continueBooking', 'changeLocation', 'enterAnotherPin',
  'shareLocation', 'moreFaqs', 'ecgAddonYes', 'ecgAddonNo',
  'today', 'tomorrow',
];

for (const [lang, t] of Object.entries(TRANSLATIONS)) {
  for (const key of buttonKeys) {
    const val = (t as any)[key];
    if (typeof val === 'string') {
      check(val, BUTTON_LIMIT, `TRANSLATIONS.${lang}.${key}`);
    }
  }
  // gender + payment options are arrays of buttons.
  for (const g of (t as any).genderOptions ?? []) {
    check(g, BUTTON_LIMIT, `TRANSLATIONS.${lang}.genderOptions`);
  }
  for (const p of (t as any).paymentOptions ?? []) {
    check(p, BUTTON_LIMIT, `TRANSLATIONS.${lang}.paymentOptions`);
  }
  // FAQ topics are rendered as list rows (24-char limit).
  for (const topic of (t as any).faqTopics ?? []) {
    check(topic, LIST_ROW_LIMIT, `TRANSLATIONS.${lang}.faqTopics`);
  }
  // Weekday short labels are reused in date pickers — treat as buttons.
  for (const d of (t as any).weekdaysShort ?? []) {
    check(d, BUTTON_LIMIT, `TRANSLATIONS.${lang}.weekdaysShort`);
  }
}

// Package names are sent as list rows (>3 packages, hits list-message path).
for (const pkg of PACKAGES) {
  check(pkg.name_en, LIST_ROW_LIMIT, `PACKAGES["${pkg.id}"].name_en`);
  check(pkg.name_ml, LIST_ROW_LIMIT, `PACKAGES["${pkg.id}"].name_ml`);
}

if (warnings.length > 0) {
  console.warn(`\n⚠ ${warnings.length} label(s) within 1 char of the limit (consider shortening for safety):`);
  for (const w of warnings) {
    console.warn(`  - ${w.context}: "${w.label}" (${w.graphemes}g / ${w.units}u, limit ${w.limit})`);
  }
}

if (violations.length > 0) {
  console.error(`\n✗ ${violations.length} label(s) exceed WhatsApp limits:`);
  for (const v of violations) {
    console.error(`  - ${v.context} (limit ${v.limit}): "${v.label}" — ${v.graphemes} graphemes, ${v.units} UTF-16 units`);
  }
  process.exit(1);
}

console.log(`✓ All button/list labels fit within WhatsApp limits (${warnings.length} warnings).`);
