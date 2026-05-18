export type EcgPolicy = 'included' | 'addon' | 'not-applicable';
export type PackageCategory = 'individual' | 'special' | 'family';
export type PackageBadge = 'MOST BOOKED' | 'DOCTOR REC.' | 'PREMIUM';
export type SupportedLanguage = 'en' | 'ml';

export interface PackageInfo {
  id: string;
  name_en: string;
  name_ml: string;
  tagline_en: string;
  tagline_ml: string;
  price: number;                  // 0 for family plans (not bookable in chat)
  mrp: number;
  tests: string;                  // English clinical terms, comma-separated
  ecgPolicy: EcgPolicy;
  homePickupMonths: 2 | 3 | 6 | null;
  badge?: PackageBadge;
  category: PackageCategory;
  members?: '2-3' | '3-4' | '4-5'; // family-plan only
  priceRange?: [number, number];   // family-plan only
}

export const ECG_ADDON_PRICE = 50;

export const PACKAGES: readonly PackageInfo[] = [
  // ─── Individual Packages ───
  {
    id: 'basic-health',
    name_en: 'Basic Health',
    name_ml: 'ബേസിക് ഹെൽത്ത്',
    tagline_en: '10–15 Tests · Routine Essential',
    tagline_ml: '10–15 ടെസ്റ്റുകൾ · റൂട്ടീൻ എസെൻഷ്യൽ',
    price: 299,
    mrp: 500,
    tests: 'Blood Sugar (Fasting), Lipid Profile, BP · Weight · BMI',
    ecgPolicy: 'addon',
    homePickupMonths: 2,
    category: 'individual',
  },
  {
    id: 'smart-care',
    name_en: 'Smart Care',
    name_ml: 'സ്മാർട്ട് കെയർ',
    tagline_en: '20–30 Tests · Active Lifestyle',
    tagline_ml: '20–30 ടെസ്റ്റുകൾ · ആക്ടീവ് ലൈഫ്സ്റ്റൈൽ',
    price: 999,
    mrp: 1300,
    tests: 'Blood Sugar (Fasting), HbA1c, Lipid Profile, CBC, Creatinine (KFT), SGPT (Liver Fn.), Physique Check',
    ecgPolicy: 'addon',
    homePickupMonths: 2,
    badge: 'MOST BOOKED',
    category: 'individual',
  },
  {
    id: 'pro-care',
    name_en: 'Pro Care',
    name_ml: 'പ്രോ കെയർ',
    tagline_en: '40–50 Tests · Preventive Screening',
    tagline_ml: '40–50 ടെസ്റ്റുകൾ · പ്രിവൻ്റീവ് സ്ക്രീനിംഗ്',
    price: 1549,
    mrp: 1949,
    tests: 'CBC + ESR, Thyroid (TSH), Liver & Kidney Function, Blood Sugar + HbA1c, Urine Routine, Physique Check',
    ecgPolicy: 'included',
    homePickupMonths: 3,
    badge: 'DOCTOR REC.',
    category: 'individual',
  },
  {
    id: 'elite-care',
    name_en: 'Elite Care',
    name_ml: 'എലൈറ്റ് കെയർ',
    tagline_en: '60+ Tests · Max Protection',
    tagline_ml: '60+ ടെസ്റ്റുകൾ · പരമാവധി സംരക്ഷണം',
    price: 2549,
    mrp: 3049,
    tests: 'All Pro Care tests + Thyroid Full Panel (TFT), Vitamin D · Calcium, Electrolytes',
    ecgPolicy: 'included',
    homePickupMonths: 6,
    badge: 'PREMIUM',
    category: 'individual',
  },

  // ─── Special Packages ───
  {
    id: 'women-wellness',
    name_en: 'Women Wellness',
    name_ml: 'വിമൻ വെൽനസ്',
    tagline_en: 'Hormones · Energy · Deficiencies',
    tagline_ml: 'ഹോർമോണുകൾ · എനർജി · കുറവുകൾ',
    price: 1299,
    mrp: 1599,
    tests: 'CBC, Thyroid (T3, T4, TSH), Vitamin D · Calcium, Urine Routine, Physique Check',
    ecgPolicy: 'addon',
    homePickupMonths: 2,
    category: 'special',
  },
  {
    id: 'diabetes-care',
    name_en: 'Diabetes Care',
    name_ml: 'ഡയബറ്റീസ് കെയർ',
    tagline_en: 'Monitor & Manage Sugar Levels',
    tagline_ml: 'ഷുഗർ ലെവൽ നിരീക്ഷിക്കുക & കൈകാര്യം ചെയ്യുക',
    price: 999,
    mrp: 1299,
    tests: 'Blood Sugar (F+PP), HbA1c, Lipid Profile, KFT, Urine Microalbumin, Physique Check',
    ecgPolicy: 'addon',
    homePickupMonths: 2,
    category: 'special',
  },

  // ─── Family Plans (info-only — phone consultation required) ───
  {
    id: 'family-basic',
    name_en: 'Family Basic',
    name_ml: 'ഫാമിലി ബേസിക്',
    tagline_en: '2–3 members · Basic Health',
    tagline_ml: '2–3 അംഗങ്ങൾ · ബേസിക് ഹെൽത്ത്',
    price: 0,
    mrp: 0,
    tests: 'Basic Health package for every family member',
    ecgPolicy: 'not-applicable',
    homePickupMonths: null,
    category: 'family',
    members: '2-3',
    priceRange: [999, 1499],
  },
  {
    id: 'family-smart',
    name_en: 'Family Smart',
    name_ml: 'ഫാമിലി സ്മാർട്ട്',
    tagline_en: '3–4 members · Smart Care',
    tagline_ml: '3–4 അംഗങ്ങൾ · സ്മാർട്ട് കെയർ',
    price: 0,
    mrp: 0,
    tests: 'Smart Care package for every family member',
    ecgPolicy: 'not-applicable',
    homePickupMonths: null,
    category: 'family',
    members: '3-4',
    priceRange: [1999, 2999],
  },
  {
    id: 'family-complete',
    name_en: 'Family Complete',
    name_ml: 'ഫാമിലി കംപ്ലീറ്റ്',
    tagline_en: '4–5 members · Pro Care / Mixed',
    tagline_ml: '4–5 അംഗങ്ങൾ · പ്രോ കെയർ / Mixed',
    price: 0,
    mrp: 0,
    tests: 'Pro Care or mixed packages for every family member',
    ecgPolicy: 'not-applicable',
    homePickupMonths: null,
    category: 'family',
    members: '4-5',
    priceRange: [3499, 4999],
  },
];

// ─── Package helpers (single source of truth for both bot implementations) ───

export function getPackageByName(name: string, lang?: SupportedLanguage): PackageInfo | undefined {
  if (lang === 'en') {
    const hit = PACKAGES.find(p => p.name_en === name);
    if (hit) return hit;
  } else if (lang === 'ml') {
    const hit = PACKAGES.find(p => p.name_ml === name);
    if (hit) return hit;
  }
  return PACKAGES.find(p => p.name_en === name || p.name_ml === name);
}

export function getPackagePrice(name: string): number {
  return getPackageByName(name)?.price ?? 0;
}

export function isFamilyPlan(name: string): boolean {
  return getPackageByName(name)?.category === 'family';
}

export function eligibleForEcgAddon(testNames: string[]): boolean {
  return testNames.some(n => getPackageByName(n)?.ecgPolicy === 'addon');
}

export function computeBookingPrice(testNames: string[], ecgAddon: boolean): number {
  const base = testNames.reduce((sum, n) => sum + getPackagePrice(n), 0);
  return base + (ecgAddon ? ECG_ADDON_PRICE : 0);
}

// Sum of admin-added custom line items. Safe on undefined/null.
export function computeCustomTestsTotal(customTests: { name: string; price: number }[] | undefined | null): number {
  if (!customTests || customTests.length === 0) return 0;
  return customTests.reduce((sum, t) => sum + (Number(t.price) || 0), 0);
}

// Grand total for a booking: package prices + custom items + optional ECG add-on.
// Used by the New Booking modal and the phleb/admin dashboards so package, custom,
// and add-on contributions stay consistent across read sites.
export function computeBookingTotal(
  testNames: string[],
  customTests: { name: string; price: number }[] | undefined | null,
  ecgAddon: boolean
): number {
  return computeBookingPrice(testNames, ecgAddon) + computeCustomTestsTotal(customTests);
}

export function browserPackagesList(lang: SupportedLanguage): string[] {
  return PACKAGES.map(p => (lang === 'ml' ? p.name_ml : p.name_en));
}

export function cartPackagesList(lang: SupportedLanguage): string[] {
  return PACKAGES.filter(p => p.category !== 'family').map(p => (lang === 'ml' ? p.name_ml : p.name_en));
}

// Renders the WhatsApp body text for a package detail screen.
// Used by both botLogic.ts (server) and the WhatsAppSimulator (client) so the
// two implementations stay byte-identical.
export function formatPackageDetail(pkg: PackageInfo, lang: SupportedLanguage): string {
  const t = TRANSLATIONS[lang];
  const name = lang === 'ml' ? pkg.name_ml : pkg.name_en;
  const tagline = lang === 'ml' ? pkg.tagline_ml : pkg.tagline_en;
  const badgeLine =
    pkg.badge === 'MOST BOOKED' ? t.badgeMostBooked :
    pkg.badge === 'DOCTOR REC.' ? t.badgeDoctorRec :
    pkg.badge === 'PREMIUM'     ? t.badgePremium :
    null;
  const savings = pkg.mrp - pkg.price;
  const priceLine = savings > 0
    ? `~₹${pkg.mrp}~  *₹${pkg.price}*  (${t.savePrefix.replace('{amount}', String(savings))})`
    : `*₹${pkg.price}*`;
  const ecgLine = pkg.ecgPolicy === 'included' ? t.ecgIncludedLabel
                : pkg.ecgPolicy === 'addon'    ? t.ecgAddonAvailableLabel
                : null;
  const pickupLine = pkg.homePickupMonths
    ? t.homePickupLabel.replace('{n}', String(pkg.homePickupMonths))
    : null;
  const lines: (string | null)[] = [
    `*${name}*`,
    tagline,
    badgeLine,
    '',
    t.packageIncludes.replace('{details}', pkg.tests),
    '',
    priceLine,
    ecgLine,
    pickupLine,
  ];
  return lines.filter(line => line !== null).join('\n');
}

export function buildPackageCatalogFallback(lang: SupportedLanguage): string {
  const lines: string[] = [];
  lines.push(lang === 'ml' ? '*ഞങ്ങളുടെ ഹെൽത്ത് പാക്കേജുകൾ*' : '*Our Health Packages*');
  lines.push('');
  const individual = PACKAGES.filter(p => p.category === 'individual');
  const special = PACKAGES.filter(p => p.category === 'special');
  for (const p of [...individual, ...special]) {
    const name = lang === 'ml' ? p.name_ml : p.name_en;
    const savings = p.mrp - p.price;
    const price = savings > 0 ? `~₹${p.mrp}~ ₹${p.price}` : `₹${p.price}`;
    lines.push(`• *${name}* — ${price}`);
  }
  lines.push('');
  lines.push(lang === 'ml' ? 'തുടരാൻ ചുവടെ ടാപ്പ് ചെയ്യുക.' : 'Tap below to continue.');
  return lines.join('\n');
}

// ─── Backward-compat derived exports (TestPickerModal + legacy reduce sites) ───

/** @deprecated use getPackagePrice() */
export const TEST_PRICES: Record<string, number> = Object.fromEntries(
  PACKAGES.flatMap(p => [
    [p.name_en, p.price],
    [p.name_ml, p.price],
  ])
);

/** @deprecated use getPackageByName(name)?.tests */
export const PACKAGE_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  PACKAGES.flatMap(p => [
    [p.name_en, p.tests],
    [p.name_ml, p.tests],
  ])
);

export const TRANSLATIONS = {
  en: {
    welcome: "Welcome to CareMol – Care Close to You",
    selectLabel: "Please select your language",
    languageSelectPrompt: "👋 Welcome to CareMol – Care Close to You\nPlease select your language / നിങ്ങളുടെ ഭാഷ തിരഞ്ഞെടുക്കുക:",
    menuHeader: "We provide home sample collection within 5 km of Melattur 🏠\nHow can I help you?",
    packageCatalogBody: "Here are our health packages — choose the right one for you. Tap *Continue* to proceed.",
    packageCatalogContinue: "Continue",
    options: {
      book: "🏠 Home Sample Test",
      medicine: "💊 Medicine",
      packages: "📋 View Packages",
      support: "👨‍⚕️ Support",
      faq: "❓ FAQ",
      call: "📞 Call CareMol",
      myBookings: "📋 My Bookings"
    },
    askLocation: "Please share your location or enter your PIN code",
    greetName: "👋 Welcome back, {name}!",
    returningHeader: "How can I help you today?",
    selectPatient: "Who are you booking for?",
    someoneElse: "Someone else",
    changeLanguage: "🌐 Change Language",
    available: "Service available in your area ✅",
    unavailable: "Currently we serve only within 5 km of Melattur",
    askTest: "What test do you want to book?",
    patientName: "Enter patient name",
    patientAge: "Enter age",
    patientGender: "Select gender",
    genderOptions: ["Male", "Female", "Other"],
    patientPhone: "Enter contact number",
    patientAddress: "Enter full address with landmark",
    timeSlot: "Choose preferred time:",
    slots: ["08:00 AM – 10:00 AM", "10:00 AM – 12:00 PM", "02:00 PM – 04:00 PM", "04:00 PM – 06:00 PM"],
    fastingCheck: "This test requires fasting for 8–12 hours. Are you prepared?",
    yesFasting: "Yes",
    noFasting: "No",
    confirmHeader: "Confirm booking?",
    confirmButton: "Confirm",
    editButton: "Edit Details",
    summaryLabels: {
      tests: "Tests",
      additionalItems: "Additional",
      price: "Price",
      patient: "Patient",
      gender: "Gender",
      address: "Address",
      date: "Date",
      slot: "Slot",
      fasting: "Fasting",
      notes: "Notes",
      payment: "Payment"
    },
    summaryNoneNotes: "None",
    fastingYesLabel: "Yes",
    fastingNoLabel: "No",
    paymentHeader: "Select payment method:",
    paymentOptions: ["UPI", "Cash on Collection"],
    success: "Booking Confirmed ✅",
    bookingId: "Booking ID",
    phlebMsg: "Phlebotomist will arrive at selected time",
    shareToWhatsApp: "Share to WhatsApp",
    endSession: "🚪 End Chat",
    sessionEnded: "Chat session ended. Type anything to start again.",
    mainMenu: "Main Menu",
    interestedInBooking: "Are you interested in booking a test?",
    confirmNamePrompt: "Is the patient's name **{name}**?",
    yesCorrect: "Yes, it's correct",
    noChange: "No, let me change",
    invalidNameError: "That doesn't look like a valid name. Please use only letters and avoid generic greetings.",
    confirmAddressPrompt: "Is this your full address?\n\n**{address}**",
    confirmPhonePrompt: "Is this the correct contact number?\n\n**{phone}**",
    cancelBooking: "Cancel Booking",
    doneSelecting: "✅ Done Selecting",
    selectedTestsPrefix: "Selected tests",
    selectAtLeastOneTest: "Please select at least one test to continue.",
    anyAdditionalTests: "Any additional tests needed?",
    packageIncludes: "Included tests: {details}",
    bookNow: "Book Now",
    backToPackages: "Back to Packages",
    selectPackageToView: "Select a package to view details:",
    backToMainMenu: "⬅️ Main Menu",
    confirmCancelHeader: "Are you sure you want to cancel this booking?",
    yesCancel: "Yes, Cancel",
    continueBooking: "No, Continue",
    patientDetailsEntry: "Please enter patient details:\n\n*Format:* Name, Age, Phone Number\n*Example:* John Doe, 32, 9876543210",
    patientBasicDetailsPrompt: "Please enter patient details:\n\nName:\nAge:\nPhone Number:",
    changeLocation: "📍 Change Location",
    enterAnotherPin: "🔢 Enter PIN Code",
    shareLocation: "📍 Share Location",
    gpsOutsideArea: "📍 We couldn't confirm your area from the location you shared. Please type your 6-digit PIN code instead.",
    locationUnavailableBrowser: "📍 Couldn't get your location. Please type your PIN code instead.",
    serviceUnavailable: "Currently service is not available in this area.",
    askNotes: "Any specific instructions or notes for the phlebotomist? (Optional - type 'None' or skip)",
    none: "None",
    supportResponse: "👨‍⚕️ Opening support channel... One of our agents will contact you shortly.",
    bookingDetailsMissing: "❌ Patient details are missing. Please start the booking again.",
    bookingFailed: "❌ Failed to save booking. Please try again later.",
    medicineComingSoon: "💊 Medicine Delivery will be available soon. Stay tuned for updates from CareMol.",
    callCaremolMessage: "📞 Tap the number below to call CareMol:\n\n+{phone}\n\nOr message us on WhatsApp: https://wa.me/{phone}",
    faqHeader: "❓ Frequently Asked Questions\n\nPick a topic:",
    moreFaqs: "❓ More FAQs",
    // NOTE: "Available Locations" answer below hardcodes "PIN 679326 / 5 km of Melattur".
    // Keep in sync with config/booking.servicePins + serviceRadiusKm if coverage expands.
    faqTopics: [
      "Available Locations",
      "Working Hours",
      "Collection Timing",
      "Payment Methods",
      "Doctor Consultation",
      "Medicine Delivery",
      "Contact Support"
    ],
    faqAnswers: {
      "Available Locations": "📍 *Available Locations*\n\nWe currently serve homes within 5 km of Melattur (PIN 679326). More locations coming soon!",
      "Working Hours": "🕐 *Working Hours*\n\n• Mon–Sat: 6:00 AM – 8:00 PM\n• Sun: 8:00 AM – 1:00 PM",
      "Collection Timing": "🧪 *Sample Collection Timing*\n\nMorning slots are recommended for fasting tests. Available time slots:\n• 08:00 AM – 10:00 AM\n• 10:00 AM – 12:00 PM\n• 02:00 PM – 04:00 PM\n• 04:00 PM – 06:00 PM",
      "Payment Methods": "💳 *Payment Methods*\n\nWe accept:\n• UPI (at booking)\n• Cash on Collection",
      "Doctor Consultation": "👨‍⚕️ *Doctor Consultation*\n\nDoctor Consultation will be available soon. Stay tuned for updates from CareMol.",
      "Medicine Delivery": "💊 *Medicine Delivery*\n\nMedicine Delivery will be available soon. Stay tuned for updates from CareMol.",
      "Contact Support": "📞 *Contact Support*\n\nUse the “Support” or “Call CareMol” option from the main menu, and our team will reach out shortly."
    },
    chooseDate: "Choose a date for the home visit:",
    today: "Today",
    tomorrow: "Tomorrow",
    weekdaysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    advanceLimitError: "Please choose a date within the next {n} days.",
    legacyTimeSlotMissing: "Time slot not set — please pick from the options.",
    ecgAddonAsk: "💓 Would you like to add an ECG test for just ₹50?",
    ecgAddonYes: "Yes, add ECG",
    ecgAddonNo: "No, skip",
    familyPlanCallPrompt: "*{plan}* is a family plan and needs a phone consultation. Please call us to book — we'll work out the details together.",
    ecgIncludedLabel: "💓 ECG Included",
    ecgAddonAvailableLabel: "💓 ECG add-on available (+₹50)",
    homePickupLabel: "🏠 {n} months home pickup",
    savePrefix: "Save ₹{amount}",
    badgeMostBooked: "⭐ MOST BOOKED",
    badgeDoctorRec: "👨‍⚕️ DOCTOR REC.",
    badgePremium: "🏆 PREMIUM",
    // My Bookings (customer) flow
    myBookingsHeader: "Here are your bookings. Tap one to view or manage it.",
    noBookings: "You don't have any bookings yet.",
    bookingDetailHeader: "📋 *Booking Details*\n\n*Patient:* {patientName}\n*Tests:* {testNames}\n*Date:* {date}\n*Slot:* {slot}\n*Status:* {status}\n*Address:* {address}",
    bookingActionCancel: "❌ Cancel Booking",
    bookingActionReschedule: "📅 Reschedule",
    bookingActionBack: "⬅️ Back",
    bookingActionDisabled: "⚠️ This booking can no longer be cancelled or rescheduled from WhatsApp (within 3 hours of the slot, or sample already collected). Please call CareMol to make changes.",
    cancelReasonPrompt: "Why are you cancelling? (Optional — type 'skip' to continue without a reason.)",
    cancelReasonSkip: "skip",
    cancelConfirmPrompt: "Are you sure you want to cancel this booking?\n\n*{patientName}* — *{date}* at *{slot}*",
    cancelConfirmYes: "Yes, cancel it",
    cancelConfirmNo: "No, keep booking",
    cancelSuccess: "✅ Your booking has been cancelled.\n\nIf you paid online, the refund will be processed within 5 working days.",
    cancelTooLate: "⚠️ This booking is now within 3 hours of its slot. Please call CareMol to make changes.",
    cancelStatusBlocked: "⚠️ This booking can no longer be cancelled (sample already collected or processed). Please call CareMol.",
    rescheduleDatePrompt: "Choose a new date:",
    rescheduleSlotPrompt: "Choose a new time slot:",
    rescheduleConfirmPrompt: "Reschedule this booking?\n\n*From:* {oldDate} at {oldSlot}\n*To:* {newDate} at {newSlot}",
    rescheduleConfirmYes: "Confirm reschedule",
    rescheduleConfirmNo: "Cancel",
    rescheduleSuccess: "✅ Booking rescheduled to *{newDate}* at *{newSlot}*.\n\nIf needed we'll reassign a phlebotomist for the new slot.",
    rescheduleLegacyBlocked: "⚠️ This booking has no date set. Please call CareMol to reschedule.",
    // WhatsApp outbound (sent from admin actions)
    notifyCancelledByAdmin: "Your CareMol booking for *{date}* at *{slot}* has been cancelled.{reasonClause}\n\nIf you paid online, the refund will be processed within 5 working days.",
    notifyCancelledByPhleb: "Your CareMol booking for *{date}* at *{slot}* has been cancelled.{reasonClause}\n\nIf you paid online, the refund will be processed within 5 working days.",
    notifyRescheduledByAdmin: "Your CareMol booking has been rescheduled.\n\n*From:* {oldDate} at {oldSlot}\n*To:* {newDate} at {newSlot}",
    reasonClausePrefix: "\n\n*Reason:* {reason}",
    genderMap: {
      "Male": "Male",
      "Female": "Female",
      "Other": "Other"
    }
  },
  ml: {
    welcome: "CareMol ലേക്ക് സ്വാഗതം – Care Close to You",
    selectLabel: "നിങ്ങളുടെ ഭാഷ തിരഞ്ഞെടുക്കുക",
    languageSelectPrompt: "👋 Welcome to CareMol – Care Close to You\nPlease select your language / നിങ്ങളുടെ ഭാഷ തിരഞ്ഞെടുക്കുക:",
    menuHeader: "Melattur ചുറ്റുമുള്ള 5 km പരിധിയിൽ home sample collection ലഭ്യമാണ് 🏠\nനിങ്ങളെ എങ്ങനെ സഹായിക്കാം?",
    packageCatalogBody: "ഞങ്ങളുടെ ഹെൽത്ത് പാക്കേജുകൾ ഇതാ — നിങ്ങൾക്ക് അനുയോജ്യമായത് തിരഞ്ഞെടുക്കൂ. തുടരാൻ *തുടരുക* ടാപ്പ് ചെയ്യുക.",
    packageCatalogContinue: "തുടരുക",
    options: {
      book: "🏠 സാമ്പിൾ ബുക്ക്",
      medicine: "💊 മരുന്ന് ഡെലിവറി",
      packages: "📋 പാക്കേജുകൾ",
      support: "👨‍⚕️ സപ്പോർട്ട്",
      faq: "❓ പതിവ് ചോദ്യങ്ങൾ",
      call: "📞 വിളിക്കുക",
      myBookings: "📋 എന്റെ ബുക്കിംഗ്"
    },
    askLocation: "ലൊക്കേഷൻ അയക്കുക അല്ലെങ്കിൽ പിൻകോഡ് നൽകുക",
    greetName: "👋 വീണ്ടും സ്വാഗതം, {name}!",
    returningHeader: "ഇന്ന് നിങ്ങളെ എങ്ങനെ സഹായിക്കാം?",
    selectPatient: "ആർക്ക് വേണ്ടിയാണ് മെഡിക്കൽ ടെസ്റ്റ് ബുക്ക് ചെയ്യുന്നത്?",
    someoneElse: "മറ്റൊരാൾക്ക്",
    changeLanguage: "🌐 ഭാഷ മാറ്റുക",
    available: "നിങ്ങളുടെ പ്രദേശത്ത് സേവനം ലഭ്യമാണ് ✅",
    unavailable: "ഇപ്പോൾ Melattur ചുറ്റുമുള്ള 5 km പരിധിയിൽ മാത്രം സേവനം ലഭ്യമാണ്",
    askTest: "ഏത് ടെസ്റ്റ് ആണ് ബുക്ക് ചെയ്യേണ്ടത്?",
    patientName: "രോഗിയുടെ പേര് നൽകുക",
    patientAge: "പ്രായം നൽകുക",
    patientGender: "ലിംഗം തിരഞ്ഞെടുക്കുക",
    genderOptions: ["പുരുഷൻ", "സ്ത്രീ", "മറ്റ്"],
    patientPhone: "ഫോൺ നമ്പർ നൽകുക",
    patientAddress: "വിലാസം (ലാൻഡ് മാർക്ക് ഉൾപ്പെടെ) നൽകുക",
    timeSlot: "സമയം തിരഞ്ഞെടുക്കുക:",
    slots: ["08:00 AM – 10:00 AM", "10:00 AM – 12:00 PM", "02:00 PM – 04:00 PM", "04:00 PM – 06:00 PM"],
    fastingCheck: "ഈ ടെസ്റ്റിന് 8–12 മണിക്കൂർ ഉപവാസം ആവശ്യമാണ്. തയ്യാറാണോ?",
    yesFasting: "അതെ",
    noFasting: "ഇല്ല",
    confirmHeader: "ബുക്കിംഗ് സ്ഥിരീകരിക്കണോ?",
    confirmButton: "സ്ഥിരീകരിക്കുക",
    editButton: "തിരുത്തുക",
    summaryLabels: {
      tests: "ടെസ്റ്റുകൾ",
      additionalItems: "അധിക ഇനങ്ങൾ",
      price: "വില",
      patient: "രോഗി",
      gender: "ലിംഗം",
      address: "വിലാസം",
      date: "തീയതി",
      slot: "സമയം",
      fasting: "ഉപവാസം",
      notes: "കുറിപ്പുകൾ",
      payment: "പേയ്‌മെന്റ്"
    },
    summaryNoneNotes: "ഇല്ല",
    fastingYesLabel: "അതെ",
    fastingNoLabel: "ഇല്ല",
    paymentHeader: "പേയ്‌മെന്റ് രീതി തിരഞ്ഞെടുക്കുക:",
    paymentOptions: ["UPI", "Cash on Collection"],
    success: "ബുക്കിംഗ് സ്ഥിരീകരിച്ചു ✅",
    bookingId: "ബുക്കിംഗ് ഐഡി",
    phlebMsg: "നിശ്ചിത സമയത്ത് സ്റ്റാഫ് എത്തും",
    shareToWhatsApp: "വാട്സാപ്പിൽ അയക്കുക",
    endSession: "🚪 ചാറ്റ് അവസാനം",
    sessionEnded: "ചാറ്റ് അവസാനിച്ചു. വീണ്ടും തുടങ്ങാൻ സന്ദേശം അയക്കുക.",
    mainMenu: "പ്രധാന മെനു",
    interestedInBooking: "ടെസ്റ്റ് ബുക്ക് ചെയ്യാൻ നിങ്ങൾക്ക് താൽപ്പര്യമുണ്ടോ?",
    confirmNamePrompt: "രോഗിയുടെ പേര് **{name}** എന്നത് ശരിയാണോ?",
    yesCorrect: "അതെ, ശരിയാണ്",
    noChange: "അല്ല, മാറ്റണം",
    invalidNameError: "ദയവായി ശരിയായ പേര് നൽകുക. അക്ഷരങ്ങൾ മാത്രം ഉപയോഗിക്കുക.",
    confirmAddressPrompt: "ഇതാണ് നിങ്ങളുടെ പൂർണ്ണ വിലാസം എന്നത് ശരിയാണോ?\n\n**{address}**",
    confirmPhonePrompt: "ഈ ഫോൺ നമ്പർ ശരിയാണോ?\n\n**{phone}**",
    cancelBooking: "റദ്ദാക്കുക",
    doneSelecting: "✅ കഴിഞ്ഞു",
    selectedTestsPrefix: "തിരഞ്ഞെടുത്ത ടെസ്റ്റുകൾ",
    selectAtLeastOneTest: "തുടരുന്നതിന് ദയവായി കുറഞ്ഞത് ഒരു ടെസ്റ്റ് എങ്കിലും തിരഞ്ഞെടുക്കുക.",
    anyAdditionalTests: "കൂടുതൽ ടെസ്റ്റുകൾ വേണോ?",
    packageIncludes: "ഉൾപ്പെടുത്തിയിരിക്കുന്ന ടെസ്റ്റുകൾ: {details}",
    bookNow: "ഇപ്പോൾ ബുക്ക്",
    backToPackages: "മറ്റ് പാക്കേജുകൾ",
    selectPackageToView: "വിശദാംശങ്ങൾ കാണാൻ ഒരു പാക്കേജ് തിരഞ്ഞെടുക്കുക:",
    backToMainMenu: "⬅️ പ്രധാന മെനു",
    confirmCancelHeader: "ഈ ബുക്കിംഗ് റദ്ദാക്കണമെന്ന് നിങ്ങൾക്ക് ഉറപ്പാണോ?",
    yesCancel: "അതെ, റദ്ദാക്കുക",
    continueBooking: "അല്ല, തുടരുക",
    patientDetailsEntry: "രോഗിയുടെ വിവരങ്ങൾ താഴെ പറയുന്ന രീതിയിൽ നൽകുക:\n\n*Format:* പേര്, പ്രായം, ഫോൺ നമ്പർ\n*Example:* സുരേഷ്, 35, 9876543210",
    patientBasicDetailsPrompt: "രോഗിയുടെ വിവരങ്ങൾ താഴെ പറയുന്ന രീതിയിൽ നൽകുക:\n\nപേര്:\nപ്രായം:\nഫോൺ നമ്പർ:",
    changeLocation: "📍 ലൊക്കേഷൻ",
    enterAnotherPin: "🔢 പിൻകോഡ് നൽകുക",
    shareLocation: "📍 പങ്കിടുക",
    gpsOutsideArea: "📍 പങ്കിട്ട ലൊക്കേഷനിൽ നിന്ന് നിങ്ങളുടെ പ്രദേശം സ്ഥിരീകരിക്കാൻ കഴിഞ്ഞില്ല. ദയവായി 6 അക്ക പിൻകോഡ് ടൈപ്പ് ചെയ്യുക.",
    locationUnavailableBrowser: "📍 നിങ്ങളുടെ ലൊക്കേഷൻ ലഭിക്കാൻ കഴിഞ്ഞില്ല. ദയവായി പിൻകോഡ് ടൈപ്പ് ചെയ്യുക.",
    serviceUnavailable: "നിലവിൽ ഈ പ്രദേശത്ത് സേവനം ലഭ്യമല്ല.",
    askNotes: "സ്റ്റാഫിന് പ്രത്യേക നിർദ്ദേശങ്ങൾ വല്ലതും ഉണ്ടോ? (നിർബന്ധമില്ല - 'ഇല്ല' എന്ന് ടൈപ്പ് ചെയ്യുകയോ ഒഴിവാക്കുകയോ ചെയ്യാം)",
    none: "ഇല്ല",
    supportResponse: "👨‍⚕️ സപ്പോർട്ട് ചാനൽ തുറക്കുന്നു... ഞങ്ങളുടെ ഏജന്റ് ഉടൻ ബന്ധപ്പെടും.",
    bookingDetailsMissing: "❌ രോഗിയുടെ വിവരങ്ങൾ ലഭ്യമല്ല. ദയവായി ബുക്കിംഗ് വീണ്ടും ആരംഭിക്കുക.",
    bookingFailed: "❌ ബുക്കിംഗ് സേവ് ചെയ്യാൻ കഴിഞ്ഞില്ല. ദയവായി പിന്നീട് വീണ്ടും ശ്രമിക്കുക.",
    medicineComingSoon: "💊 മരുന്ന് ഡെലിവറി ഉടൻ ലഭ്യമാകും. CareMol-ൽ നിന്നുള്ള അപ്ഡേറ്റുകൾക്കായി കാത്തിരിക്കുക.",
    callCaremolMessage: "📞 CareMol-ന് വിളിക്കാൻ താഴെയുള്ള നമ്പറിൽ ടാപ്പ് ചെയ്യുക:\n\n+{phone}\n\nഅല്ലെങ്കിൽ വാട്സാപ്പിൽ സന്ദേശം അയക്കുക: https://wa.me/{phone}",
    faqHeader: "❓ പതിവ് ചോദ്യങ്ങൾ\n\nഒരു വിഷയം തിരഞ്ഞെടുക്കുക:",
    moreFaqs: "❓ കൂടുതൽ ചോദ്യങ്ങൾ",
    faqTopics: [
      "ലഭ്യമായ സ്ഥലങ്ങൾ",
      "പ്രവൃത്തി സമയം",
      "സാമ്പിൾ കളക്ഷൻ സമയം",
      "പേയ്‌മെന്റ് രീതികൾ",
      "ഡോക്ടർ കൺസൾട്ടേഷൻ",
      "മരുന്ന് ഡെലിവറി",
      "സപ്പോർട്ട് ബന്ധപ്പെടുക"
    ],
    faqAnswers: {
      "ലഭ്യമായ സ്ഥലങ്ങൾ": "📍 *സർവീസ് ലഭ്യമായ സ്ഥലങ്ങൾ*\n\nനിലവിൽ Melattur ചുറ്റും 5 km പരിധിയിൽ (PIN 679326) സേവനം ലഭ്യമാണ്. കൂടുതൽ സ്ഥലങ്ങൾ ഉടൻ ചേർക്കും!",
      "പ്രവൃത്തി സമയം": "🕐 *പ്രവൃത്തി സമയം*\n\n• തിങ്കൾ–ശനി: 6:00 AM – 8:00 PM\n• ഞായർ: 8:00 AM – 1:00 PM",
      "സാമ്പിൾ കളക്ഷൻ സമയം": "🧪 *സാമ്പിൾ കളക്ഷൻ സമയം*\n\nഫാസ്റ്റിംഗ് ടെസ്റ്റുകൾക്ക് രാവിലത്തെ സ്ലോട്ടുകൾ ശുപാർശ ചെയ്യുന്നു. ലഭ്യമായ സമയങ്ങൾ:\n• 08:00 AM – 10:00 AM\n• 10:00 AM – 12:00 PM\n• 02:00 PM – 04:00 PM\n• 04:00 PM – 06:00 PM",
      "പേയ്‌മെന്റ് രീതികൾ": "💳 *പേയ്‌മെന്റ് രീതികൾ*\n\nഞങ്ങൾ സ്വീകരിക്കുന്നത്:\n• UPI (ബുക്കിംഗിൽ)\n• കളക്ഷനിൽ പണം",
      "ഡോക്ടർ കൺസൾട്ടേഷൻ": "👨‍⚕️ *ഡോക്ടർ കൺസൾട്ടേഷൻ*\n\nഡോക്ടർ കൺസൾട്ടേഷൻ ഉടൻ ലഭ്യമാകും. CareMol-ൽ നിന്നുള്ള അപ്ഡേറ്റുകൾക്കായി കാത്തിരിക്കുക.",
      "മരുന്ന് ഡെലിവറി": "💊 *മരുന്ന് ഡെലിവറി*\n\nമരുന്ന് ഡെലിവറി ഉടൻ ലഭ്യമാകും. CareMol-ൽ നിന്നുള്ള അപ്ഡേറ്റുകൾക്കായി കാത്തിരിക്കുക.",
      "സപ്പോർട്ട് ബന്ധപ്പെടുക": "📞 *സപ്പോർട്ട് ബന്ധപ്പെടുക*\n\nപ്രധാന മെനുവിൽ നിന്ന് “സപ്പോർട്ട്” അല്ലെങ്കിൽ “വിളിക്കുക” ഓപ്ഷൻ ഉപയോഗിക്കുക, ഞങ്ങളുടെ ടീം ഉടൻ ബന്ധപ്പെടും."
    },
    chooseDate: "സന്ദർശനത്തിന് ഒരു തീയതി തിരഞ്ഞെടുക്കുക:",
    today: "ഇന്ന്",
    tomorrow: "നാളെ",
    weekdaysShort: ["ഞായർ", "തിങ്കൾ", "ചൊവ്വ", "ബുധൻ", "വ്യാഴം", "വെള്ളി", "ശനി"],
    monthsShort: ["ജനു", "ഫെബ്രു", "മാർ", "ഏപ്രി", "മേയ്", "ജൂൺ", "ജൂലൈ", "ഓഗ", "സെപ്റ്റം", "ഒക്ടോ", "നവം", "ഡിസം"],
    advanceLimitError: "ദയവായി അടുത്ത {n} ദിവസത്തിനുള്ളിലെ തീയതി തിരഞ്ഞെടുക്കുക.",
    legacyTimeSlotMissing: "സമയം സജ്ജമല്ല — ദയവായി ലിസ്റ്റിൽ നിന്ന് തിരഞ്ഞെടുക്കുക.",
    ecgAddonAsk: "💓 ₹50-ന് ഒരു ECG ടെസ്റ്റ് കൂടി ചേർക്കണോ?",
    ecgAddonYes: "അതെ, ECG ചേർക്കുക",
    ecgAddonNo: "വേണ്ട, ഒഴിവാക്കുക",
    familyPlanCallPrompt: "*{plan}* ഒരു ഫാമിലി പ്ലാൻ ആണ്, ബുക്കിംഗിന് ഫോൺ കൺസൾട്ടേഷൻ ആവശ്യമാണ്. ദയവായി ഞങ്ങളെ വിളിക്കുക — ഒരുമിച്ച് വിശദാംശങ്ങൾ ക്രമീകരിക്കാം.",
    ecgIncludedLabel: "💓 ECG ഉൾപ്പെടുത്തിയിരിക്കുന്നു",
    ecgAddonAvailableLabel: "💓 ECG ആഡ്-ഓൺ ലഭ്യം (+₹50)",
    homePickupLabel: "🏠 {n} മാസം ഹോം പിക്കപ്പ്",
    savePrefix: "₹{amount} ലാഭിക്കുക",
    badgeMostBooked: "⭐ ഏറ്റവും കൂടുതൽ ബുക്ക് ചെയ്തത്",
    badgeDoctorRec: "👨‍⚕️ ഡോക്ടർ ശുപാർശ",
    badgePremium: "🏆 പ്രീമിയം",
    // My Bookings (customer) flow
    myBookingsHeader: "നിങ്ങളുടെ ബുക്കിംഗുകൾ ഇതാ. വിശദാംശങ്ങൾ കാണാനോ മാനേജ് ചെയ്യാനോ ഒന്ന് തിരഞ്ഞെടുക്കുക.",
    noBookings: "ഇതുവരെ ബുക്കിംഗുകൾ ഒന്നുമില്ല.",
    bookingDetailHeader: "📋 *ബുക്കിംഗ് വിശദാംശങ്ങൾ*\n\n*രോഗി:* {patientName}\n*ടെസ്റ്റുകൾ:* {testNames}\n*തീയതി:* {date}\n*സമയം:* {slot}\n*സ്ഥിതി:* {status}\n*വിലാസം:* {address}",
    bookingActionCancel: "❌ റദ്ദാക്കുക",
    bookingActionReschedule: "📅 പുനഃക്രമീകരണം",
    bookingActionBack: "⬅️ തിരികെ",
    bookingActionDisabled: "⚠️ ഈ ബുക്കിംഗ് ഇനി WhatsApp വഴി റദ്ദാക്കാനോ പുനഃക്രമീകരിക്കാനോ കഴിയില്ല (3 മണിക്കൂറിനുള്ളിൽ, അല്ലെങ്കിൽ സാമ്പിൾ ശേഖരിച്ചു). മാറ്റങ്ങൾക്കായി CareMol-നെ വിളിക്കുക.",
    cancelReasonPrompt: "എന്തുകൊണ്ടാണ് റദ്ദാക്കുന്നത്? (നിർബന്ധമില്ല — കാരണം ഇല്ലാതെ തുടരാൻ 'skip' ടൈപ്പ് ചെയ്യുക.)",
    cancelReasonSkip: "skip",
    cancelConfirmPrompt: "ഈ ബുക്കിംഗ് റദ്ദാക്കണമെന്ന് ഉറപ്പാണോ?\n\n*{patientName}* — *{date}* ന് *{slot}*",
    cancelConfirmYes: "അതെ, റദ്ദാക്കുക",
    cancelConfirmNo: "വേണ്ട, തുടരുക",
    cancelSuccess: "✅ നിങ്ങളുടെ ബുക്കിംഗ് റദ്ദാക്കിയിരിക്കുന്നു.\n\nഓൺലൈൻ പേയ്‌മെന്റ് ചെയ്തിട്ടുണ്ടെങ്കിൽ, 5 പ്രവൃത്തി ദിവസത്തിനുള്ളിൽ റീഫണ്ട് നൽകും.",
    cancelTooLate: "⚠️ സ്ലോട്ടിന് 3 മണിക്കൂറിനുള്ളിലാണ് ഈ ബുക്കിംഗ്. മാറ്റങ്ങൾക്കായി CareMol-നെ വിളിക്കുക.",
    cancelStatusBlocked: "⚠️ ഈ ബുക്കിംഗ് ഇനി റദ്ദാക്കാൻ കഴിയില്ല (സാമ്പിൾ ശേഖരിച്ചതോ പ്രോസസ് ചെയ്തതോ ആണ്). CareMol-നെ വിളിക്കുക.",
    rescheduleDatePrompt: "പുതിയ തീയതി തിരഞ്ഞെടുക്കുക:",
    rescheduleSlotPrompt: "പുതിയ സമയം തിരഞ്ഞെടുക്കുക:",
    rescheduleConfirmPrompt: "ഈ ബുക്കിംഗ് പുനഃക്രമീകരിക്കണോ?\n\n*From:* {oldDate} ന് {oldSlot}\n*To:* {newDate} ന് {newSlot}",
    rescheduleConfirmYes: "സ്ഥിരീകരിക്കുക",
    rescheduleConfirmNo: "റദ്ദാക്കുക",
    rescheduleSuccess: "✅ ബുക്കിംഗ് *{newDate}* ന് *{newSlot}* ലേക്ക് പുനഃക്രമീകരിച്ചു.\n\nആവശ്യമെങ്കിൽ പുതിയ സ്ലോട്ടിന് സ്റ്റാഫിനെ വീണ്ടും അസൈൻ ചെയ്യും.",
    rescheduleLegacyBlocked: "⚠️ ഈ ബുക്കിംഗിന് തീയതി സജ്ജമല്ല. പുനഃക്രമീകരണത്തിന് CareMol-നെ വിളിക്കുക.",
    // WhatsApp outbound (sent from admin actions)
    notifyCancelledByAdmin: "നിങ്ങളുടെ CareMol ബുക്കിംഗ് *{date}* ന് *{slot}* റദ്ദാക്കിയിരിക്കുന്നു.{reasonClause}\n\nഓൺലൈൻ പേയ്‌മെന്റ് ചെയ്തിട്ടുണ്ടെങ്കിൽ, 5 പ്രവൃത്തി ദിവസത്തിനുള്ളിൽ റീഫണ്ട് നൽകും.",
    notifyCancelledByPhleb: "നിങ്ങളുടെ CareMol ബുക്കിംഗ് *{date}* ന് *{slot}* റദ്ദാക്കിയിരിക്കുന്നു.{reasonClause}\n\nഓൺലൈൻ പേയ്‌മെന്റ് ചെയ്തിട്ടുണ്ടെങ്കിൽ, 5 പ്രവൃത്തി ദിവസത്തിനുള്ളിൽ റീഫണ്ട് നൽകും.",
    notifyRescheduledByAdmin: "നിങ്ങളുടെ CareMol ബുക്കിംഗ് പുനഃക്രമീകരിച്ചു.\n\n*From:* {oldDate} ന് {oldSlot}\n*To:* {newDate} ന് {newSlot}",
    reasonClausePrefix: "\n\n*കാരണം:* {reason}",
    genderMap: {
      "പുരുഷൻ": "Male",
      "സ്ത്രീ": "Female",
      "മറ്റ്": "Other"
    }
  }
};
