import { adminDb } from './firebaseAdmin';
import {
  TRANSLATIONS,
  computeBookingPrice,
  getPackageByName,
  isFamilyPlan,
  eligibleForEcgAddon,
  browserPackagesList,
  cartPackagesList,
  formatPackageDetail,
} from '../constants';
import { buildBookingConfirmation } from './confirmationMessage';
import { isCoordInServiceArea, isPinInServiceArea, toServiceAreaConfig } from './serviceAreaService';
import { generateId } from '../lib/utils';
import {
  ChatStep,
  Language,
  Booking,
  BookingConfig,
  PatientProfile,
  Staff,
  PhlebAvailability,
  isCancellable,
  isWithinCustomerActionWindow,
} from '../types';
import { parsePatientDetails } from './aiParserService';
import {
  defaultBookingConfig,
  rememberBookingConfig,
  getCachedBookingConfig,
  formatDateLabel,
  formatSlotLabel,
  slotsForDate,
  filterBookableSlots,
  bookableDates,
  canPhlebKeepBooking,
  phlebAvailabilityDocId,
} from './slotService';

export interface BotSession {
  userId: string; // Phone number
  step: ChatStep;
  language: Language | null;
  bookingData: Partial<Booking>;
  isOnlyChecking: boolean;
  lastActive: string;
  activeBookingId?: string;
  rescheduleDraft?: {
    bookingDate: string;
    slotStart: string;
    slotEnd: string;
    timeSlot: string;
  };
  cancelDraftReason?: string;
  myBookingsCache?: Array<{ bookingId: string; label: string }>;
}

export interface BotResponse {
  text: string;
  buttons?: string[];
}

// Loads config/booking via the Admin SDK, with the ~60s in-memory cache from
// slotService. Falls back to defaults if the doc is absent or read fails so the
// bot keeps working before the seed script runs.
async function loadBookingConfig(): Promise<BookingConfig> {
  const cached = getCachedBookingConfig();
  if (cached) return cached;
  try {
    const snap = await adminDb.collection('config').doc('booking').get();
    if (snap.exists) {
      const data = snap.data() as Partial<BookingConfig>;
      const merged: BookingConfig = { ...defaultBookingConfig(), ...data };
      rememberBookingConfig(merged);
      return merged;
    }
  } catch (e) {
    console.warn('[Bot] config/booking read failed; using defaults', e);
  }
  const fb = defaultBookingConfig();
  rememberBookingConfig(fb);
  return fb;
}

// Create or update a patient profile under users/{phone}/patients/{patientId}.
// Returns the patientId used. Whatever fields are provided are merged in.
async function upsertPatientProfile(
  phone: string,
  fields: Partial<PatientProfile>,
  existingId?: string
): Promise<string> {
  const patientId = existingId || generateId('PT');
  const now = new Date().toISOString();
  const ref = adminDb.collection('users').doc(phone).collection('patients').doc(patientId);

  const payload: Partial<PatientProfile> = {
    ...fields,
    id: patientId,
    userId: phone,
    updatedAt: now,
  };
  if (!existingId) payload.createdAt = now;

  await ref.set(payload, { merge: true });
  return patientId;
}

// Conservative name normalization for dedup matching. Must match the web SDK
// twin in src/services/patientService.ts so both layers identify duplicates
// identically.
function normalizePatientName(name: string): string {
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Dedup-aware patient upsert for the bot's lead-capture path. If a profile with
// the same normalized name already exists under this phone, merge fields into
// it instead of creating a duplicate. Callers that already have a patientId
// should use upsertPatientProfile(phone, fields, existingId) directly.
async function findOrCreatePatientProfile(
  phone: string,
  fields: Partial<PatientProfile> & { name: string }
): Promise<string> {
  const target = normalizePatientName(fields.name);
  const snap = await adminDb.collection('users').doc(phone).collection('patients').get();
  let matchId: string | undefined;
  snap.forEach(doc => {
    if (matchId) return;
    const data = doc.data() as PatientProfile;
    if (normalizePatientName(data.name || '') === target) {
      matchId = data.id || doc.id;
    }
  });
  return upsertPatientProfile(phone, fields, matchId);
}

// Shared post-tests router. Called after the user has picked one or more
// packages — decides whether to ask the ECG add-on question or proceed to the
// next missing patient field. Keeps the ECG step from being bypassed when a
// returning patient comes through PATIENT_SELECTION or AVAILABILITY_CHECK
// with tests already pre-loaded via PACKAGE_DETAIL_VIEW.
function routeAfterTestsKnown(
  session: BotSession,
  addResponse: (text: string, buttons?: string[]) => void,
  t: (typeof TRANSLATIONS)[Language]
): void {
  const testNames = session.bookingData.testNames || [];
  if (session.bookingData.ecgAddon === undefined && eligibleForEcgAddon(testNames)) {
    session.step = 'ECG_ADDON';
    addResponse(t.ecgAddonAsk, [t.ecgAddonYes, t.ecgAddonNo]);
    return;
  }
  // Lock ecgAddon (false if not eligible or skipped) and recompute total.
  if (session.bookingData.ecgAddon === undefined) {
    session.bookingData.ecgAddon = false;
  }
  session.bookingData.price = computeBookingPrice(testNames, session.bookingData.ecgAddon);

  if (session.bookingData.patientAddress) {
    session.step = 'PATIENT_ADDRESS_CONFIRM';
    addResponse(
      t.confirmAddressPrompt.replace('{address}', session.bookingData.patientAddress),
      [t.yesCorrect, t.noChange]
    );
  } else if (session.bookingData.patientGender) {
    session.step = 'PATIENT_ADDRESS';
    addResponse(t.patientAddress, [t.backToMainMenu]);
  } else {
    session.step = 'PATIENT_GENDER';
    addResponse(t.patientGender, [...t.genderOptions, t.backToMainMenu]);
  }
}

export interface IncomingLocation {
  latitude: number;
  longitude: number;
}

// ============================================================================
// My Bookings helpers
// ============================================================================

type BookingListEntry = { bookingId: string; label: string };

// Pulls the customer's bookings, drops Cancelled, hides Completed older than 30
// days, and sorts active-first (oldest bookingDate first), then Completed
// (latest first). Uses createdAt as a fallback for legacy completed rows that
// pre-date the bookingDate field.
async function fetchCustomerBookings(phone: string): Promise<Booking[]> {
  const snap = await adminDb.collection('bookings').where('userId', '==', phone).get();
  const all = snap.docs.map(d => ({ ...d.data(), bookingId: d.id } as Booking));
  const thirtyDaysAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  })();
  return all
    .filter(b => {
      if (b.status === 'Cancelled') return false;
      if (b.status !== 'Completed') return true;
      const refDate = b.bookingDate || (b.createdAt ? String(b.createdAt).slice(0, 10) : '');
      return refDate >= thirtyDaysAgo;
    })
    .sort((a, b) => {
      const aActive = a.status !== 'Completed';
      const bActive = b.status !== 'Completed';
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      if (aActive) {
        return (a.bookingDate || '').localeCompare(b.bookingDate || '');
      }
      return (b.bookingDate || '').localeCompare(a.bookingDate || '');
    });
}

// WhatsApp list rows are capped at 24 chars; we try to fit inside that here so
// whatsappService doesn't silently truncate the date/status tail.
function formatBookingListLabel(b: Booking, lang: Language): string {
  const test = (b.testNames && b.testNames[0]) || 'Booking';
  const date = b.bookingDate ? formatDateLabel(b.bookingDate, lang) : '—';
  const label = `${test} • ${date} • ${b.status}`;
  if (label.length <= 24) return label;
  const tail = ` • ${date} • ${b.status}`;
  const maxTest = 24 - tail.length;
  if (maxTest > 1) return `${test.slice(0, maxTest - 1)}…${tail}`;
  return label.slice(0, 24);
}

// Lists up to 9 bookings + the Back button (WhatsApp lists max 10 rows). On
// empty result, drops the user back to MAIN_MENU with t.noBookings.
async function renderMyBookings(
  phone: string,
  session: BotSession,
  addResponse: (text: string, buttons?: string[]) => void,
  t: (typeof TRANSLATIONS)[Language],
): Promise<void> {
  const lang = session.language || 'en';
  const bookings = await fetchCustomerBookings(phone);
  if (bookings.length === 0) {
    session.step = 'MAIN_MENU';
    session.myBookingsCache = [];
    addResponse(t.noBookings, [t.backToMainMenu]);
    return;
  }
  const entries: BookingListEntry[] = bookings.slice(0, 9).map(b => ({
    bookingId: b.bookingId,
    label: formatBookingListLabel(b, lang),
  }));
  session.myBookingsCache = entries;
  addResponse(t.myBookingsHeader, [...entries.map(e => e.label), t.backToMainMenu]);
}

// Re-fetches the booking the customer drilled into, builds the detail message,
// and decides which actions to expose based on status + 3-hour rule.
async function renderBookingDetail(
  session: BotSession,
  addResponse: (text: string, buttons?: string[]) => void,
  t: (typeof TRANSLATIONS)[Language],
): Promise<void> {
  const lang = session.language || 'en';
  if (!session.activeBookingId) {
    // Nothing to show — re-render the list instead.
    session.step = 'MY_BOOKINGS_LIST';
    return;
  }
  const snap = await adminDb.collection('bookings').doc(session.activeBookingId).get();
  if (!snap.exists) {
    session.activeBookingId = undefined;
    session.step = 'MY_BOOKINGS_LIST';
    addResponse(t.noBookings, [t.backToMainMenu]);
    return;
  }
  const booking = { ...(snap.data() as Booking), bookingId: snap.id };
  const dateLabel = booking.bookingDate ? formatDateLabel(booking.bookingDate, lang) : '—';
  const detail = t.bookingDetailHeader
    .replace('{patientName}', booking.patientName || '—')
    .replace('{testNames}', (booking.testNames || []).join(', '))
    .replace('{date}', dateLabel)
    .replace('{slot}', booking.timeSlot || '—')
    .replace('{status}', booking.status)
    .replace('{address}', booking.patientAddress || '—');

  const cancellable = isCancellable(booking);
  const inWindow = isWithinCustomerActionWindow(booking);

  if (cancellable && inWindow) {
    addResponse(detail, [t.bookingActionCancel, t.bookingActionReschedule, t.bookingActionBack]);
    return;
  }
  // Reason for blocking — show the more relevant message.
  if (!cancellable) {
    addResponse(detail, [t.bookingActionBack]);
    addResponse(t.cancelStatusBlocked, [t.bookingActionBack]);
  } else {
    addResponse(detail, [t.bookingActionBack]);
    addResponse(t.cancelTooLate, [t.bookingActionBack]);
  }
}

export async function handleWhatsAppMessage(
  from: string,
  incomingBody: string,
  location?: IncomingLocation | null,
): Promise<BotResponse[]> {
  const sessionRef = adminDb.collection('whatsapp_sessions').doc(from);
  const sessionDoc = await sessionRef.get();
  
  let session: BotSession;
  if (!sessionDoc.exists) {
    session = {
      userId: from,
      step: 'LANGUAGE_SELECTION',
      language: null,
      bookingData: { status: 'Created' },
      isOnlyChecking: false,
      lastActive: new Date().toISOString()
    };
  } else {
    session = sessionDoc.data() as BotSession;
  }

  const responses: BotResponse[] = [];
  const addResponse = (text: string, buttons?: string[]) => {
    responses.push({ text, buttons });
  };

  const t = session.language ? TRANSLATIONS[session.language] : TRANSLATIONS.en;
  const value = incomingBody.trim();
  const normalizedVal = value.toLowerCase();

  // Handle Global Actions
  const isGlobalMenuAction = ['menu', 'home', 'restart', 'my bookings', 'bookings'].includes(normalizedVal) ||
                             value === t.mainMenu ||
                             value === t.backToMainMenu ||
                             value === t.options.book ||
                             value === t.options.packages ||
                             value === t.options.medicine ||
                             value === t.options.faq ||
                             value === t.options.call ||
                             value === t.options.support ||
                             value === t.options.myBookings;

  if (isGlobalMenuAction) {
    if (value === t.options.book) {
      session.isOnlyChecking = false;
      session.bookingData = { status: 'Created' }; // Start fresh
      const patients = await adminDb.collection('users').doc(from).collection('patients').get();
      if (!patients.empty) {
        session.step = 'PATIENT_SELECTION';
        const patientNames = patients.docs.map(d => d.data().name);
        addResponse(t.selectPatient, [...patientNames, t.someoneElse, t.backToMainMenu]);
      } else {
        session.step = 'PATIENT_DETAILS_ENTRY';
        addResponse(t.patientDetailsEntry, [t.backToMainMenu]);
      }
    } else if (value === t.options.packages) {
      session.step = 'PACKAGE_VIEW';
      addResponse(t.selectPackageToView, [...browserPackagesList(session.language || 'en'), t.backToMainMenu]);
    } else if (value === t.options.medicine) {
      session.step = 'MEDICINE_DELIVERY';
      addResponse(t.medicineComingSoon, [t.backToMainMenu, t.options.support]);
    } else if (value === t.options.faq) {
      session.step = 'FAQ';
      addResponse(t.faqHeader, [...t.faqTopics, t.backToMainMenu]);
    } else if (value === t.options.call) {
      const phone = process.env.CAREMOL_PHONE || '919000000000';
      session.step = 'MAIN_MENU';
      addResponse(t.callCaremolMessage.replace(/\{phone\}/g, phone), [t.backToMainMenu]);
    } else if (value === t.options.support) {
      session.step = 'MAIN_MENU';
      addResponse(t.supportResponse, [t.backToMainMenu]);
    } else if (value === t.options.myBookings || normalizedVal === 'my bookings' || normalizedVal === 'bookings') {
      session.step = 'MY_BOOKINGS_LIST';
      await renderMyBookings(from, session, addResponse, t);
    } else {
      session.step = 'MAIN_MENU';
      session.isOnlyChecking = false;
      session.bookingData = { status: 'Created' };
      addResponse(t.returningHeader, (Object.values(t.options) as string[]).concat([t.changeLanguage, t.endSession]));
    }
    await sessionRef.set(session);
    return responses;
  }

  if (value === t.cancelBooking || normalizedVal === 'cancel') {
    session.step = 'CONFIRM_CANCEL';
    addResponse(t.confirmCancelHeader, [t.yesCancel, t.continueBooking]);
    await sessionRef.set(session);
    return responses;
  }

  if (['exit', 'stop', 'bye', 'end'].includes(normalizedVal) || value === t.endSession) {
    session.step = 'LANGUAGE_SELECTION';
    session.language = null;
    session.bookingData = { status: 'Created' };
    addResponse(t.languageSelectPrompt, ['English', 'മലയാളം']);
    await sessionRef.set(session);
    return responses;
  }

  // State Machine
  switch (session.step) {
    case 'CONFIRM_CANCEL':
      if (value === t.yesCancel) {
        session.step = 'MAIN_MENU';
        session.bookingData = { status: 'Created' };
        addResponse(t.returningHeader, (Object.values(t.options) as string[]).concat([t.changeLanguage, t.endSession]));
      } else {
        // Go back to previous step logic would be nice, but for now we just return to Main Menu as a safe fallback or stay?
        // Actually, if they say "No, Continue", we just show the prompt for the step we were in.
        // But we lost the previous step. We'll add a 'previousStep' to session later.
        // For now, back to Main Menu.
        session.step = 'MAIN_MENU';
        addResponse(t.menuHeader, (Object.values(t.options) as string[]).concat([t.changeLanguage, t.endSession]));
      }
      break;

    case 'LANGUAGE_SELECTION':
      if (value === 'English' || value === 'മലയാളം') {
        const lang: Language = value === 'English' ? 'en' : 'ml';
        session.language = lang;
        session.step = 'MAIN_MENU';
        const langT = TRANSLATIONS[lang];
        addResponse(`👋 ${langT.welcome}\n${langT.menuHeader}`, (Object.values(langT.options) as string[]).concat([langT.changeLanguage, langT.endSession]));
      } else {
        addResponse(t.languageSelectPrompt, ['English', 'മലയാളം']);
      }
      break;

    case 'MAIN_MENU':
      if (value === t.options.book) {
        session.isOnlyChecking = false;
        session.bookingData = { status: 'Created' }; // Reset for new booking
        // Point 8: Capture Lead Data Early - Check for existing patients
        const patients = await adminDb.collection('users').doc(from).collection('patients').get();
        if (!patients.empty) {
          session.step = 'PATIENT_SELECTION';
          const patientNames = patients.docs.map(d => d.data().name);
          addResponse(t.selectPatient, [...patientNames, t.someoneElse, t.backToMainMenu]);
        } else {
          session.step = 'PATIENT_DETAILS_ENTRY';
          addResponse(t.patientDetailsEntry, [t.backToMainMenu]);
        }
      } else if (value === t.options.packages) {
        session.step = 'PACKAGE_VIEW';
        addResponse(t.selectPackageToView, [...browserPackagesList(session.language || 'en'), t.backToMainMenu]);
      } else if (value === t.options.medicine) {
        session.step = 'MEDICINE_DELIVERY';
        addResponse(t.medicineComingSoon, [t.backToMainMenu, t.options.support]);
      } else if (value === t.options.faq) {
        session.step = 'FAQ';
        addResponse(t.faqHeader, [...t.faqTopics, t.backToMainMenu]);
      } else if (value === t.options.call) {
        const phone = process.env.CAREMOL_PHONE || '919000000000';
        addResponse(t.callCaremolMessage.replace(/\{phone\}/g, phone), [t.backToMainMenu]);
      } else if (value === t.options.support) {
        addResponse(t.supportResponse, [t.backToMainMenu]);
      } else if (value === t.options.myBookings) {
        session.step = 'MY_BOOKINGS_LIST';
        await renderMyBookings(from, session, addResponse, t);
      } else if (value === t.changeLanguage) {
        session.step = 'LANGUAGE_SELECTION';
        addResponse(t.selectLabel, ['English', 'മലയാളം']);
      }
      break;

    case 'PATIENT_DETAILS_ENTRY':
      // Primary path: DeepSeek structured parse (handles free text, Malayalam, gender, etc.).
      const parsed = await parsePatientDetails(value);

      // Fallback path: if Gemini fails for any reason (missing/invalid key, quota
      // exhausted, network blocked, model deprecated, parse error), try a strict
      // "Name, Age, Phone" comma split so the user isn't trapped in a re-ask loop.
      // Matches the simulator's behavior in App.tsx for parity. Same shape as
      // ExtractedPatientDetails so the downstream code below is unchanged.
      let details = parsed;
      if (!details) {
        const parts = value.split(',').map(s => s.trim()).filter(Boolean);
        const ageNum = parts[1] !== undefined ? parseInt(parts[1], 10) : NaN;
        if (parts.length >= 2 && parts[0] && !Number.isNaN(ageNum)) {
          console.warn('[botLogic] AI parse failed — using comma-split fallback');
          details = {
            name: parts[0],
            age: ageNum,
            phone: parts[2] || '',
            isMale: false,
            isFemale: false,
          };
        }
      }

      if (details) {
        const patientName = details.name;
        const patientAge = details.age || 30; // Default age if not found
        const patientPhone = details.phone || from; // Use sender's phone if not provided
        let patientGender: 'Male' | 'Female' | 'Other' | undefined;
        if (details.isMale) patientGender = 'Male';
        else if (details.isFemale) patientGender = 'Female';

        // Create patient profile immediately (lead capture).
        // If we already have a patientId on this session (rare retry case),
        // update that record. Otherwise dedup by normalized name so repeated
        // entries of the same patient on the same phone don't fork profiles.
        const patientFields = {
          name: patientName,
          age: patientAge,
          phone: patientPhone,
          ...(patientGender ? { gender: patientGender } : {}),
        };
        const patientId = session.bookingData.patientId
          ? await upsertPatientProfile(from, patientFields, session.bookingData.patientId)
          : await findOrCreatePatientProfile(from, patientFields);

        session.bookingData = {
          ...session.bookingData,
          patientId,
          patientName,
          patientAge,
          patientPhone,
          ...(patientGender ? { patientGender } : {}),
        };

        session.step = 'AVAILABILITY_CHECK';
        addResponse(t.askLocation, [t.backToMainMenu]);
      } else {
        addResponse(t.patientDetailsEntry, [t.backToMainMenu]);
      }
      break;

    case 'PACKAGE_VIEW': {
      const lang = session.language || 'en';
      if (value === t.backToPackages) {
        addResponse(t.selectPackageToView, [...browserPackagesList(lang), t.backToMainMenu]);
        break;
      }
      const browserList = browserPackagesList(lang);
      if (!browserList.includes(value)) {
        session.step = 'MAIN_MENU';
        addResponse(t.menuHeader, Object.values(t.options));
        break;
      }
      if (isFamilyPlan(value)) {
        // Family plans are info-only — route customer to call CareMol.
        addResponse(
          t.familyPlanCallPrompt.replace('{plan}', value),
          [t.options.call, t.backToPackages, t.backToMainMenu]
        );
        // Stay in PACKAGE_VIEW so the local backToPackages handler above works.
        break;
      }
      const pkg = getPackageByName(value, lang);
      if (!pkg) {
        session.step = 'MAIN_MENU';
        addResponse(t.menuHeader, Object.values(t.options));
        break;
      }
      session.bookingData = {
        ...session.bookingData,
        testNames: [value],
        price: pkg.price,
      };
      delete session.bookingData.ecgAddon; // re-prompt at routeAfterTestsKnown
      session.step = 'PACKAGE_DETAIL_VIEW';
      addResponse(
        formatPackageDetail(pkg, lang),
        [t.bookNow, t.backToPackages, t.backToMainMenu]
      );
      break;
    }

    case 'PACKAGE_DETAIL_VIEW':
      if (value === t.bookNow) {
        session.isOnlyChecking = false;
        // Early lead/patient capture
        const p2 = await adminDb.collection('users').doc(from).collection('patients').get();
        if (!p2.empty) {
          session.step = 'PATIENT_SELECTION';
          const pNames = p2.docs.map(d => d.data().name);
          addResponse(t.selectPatient, [...pNames, t.someoneElse, t.backToMainMenu]);
        } else {
          session.step = 'PATIENT_DETAILS_ENTRY';
          addResponse(t.patientDetailsEntry, [t.backToMainMenu]);
        }
      } else if (value === t.backToPackages) {
        session.step = 'PACKAGE_VIEW';
        addResponse(t.selectPackageToView, [...browserPackagesList(session.language || 'en'), t.backToMainMenu]);
      } else {
        session.step = 'MAIN_MENU';
        addResponse(t.menuHeader, Object.values(t.options));
      }
      break;

    case 'PATIENT_SELECTION':
      if (value === t.someoneElse) {
        session.bookingData = { ...session.bookingData, patientId: undefined };
        session.step = 'PATIENT_DETAILS_ENTRY';
        addResponse(t.patientDetailsEntry, [t.backToMainMenu]);
      } else {
        const pQuery = await adminDb.collection('users').doc(from).collection('patients').where('name', '==', value).get();
        if (!pQuery.empty) {
          const pData = pQuery.docs[0].data() as PatientProfile;
          session.bookingData = {
            ...session.bookingData,
            patientId: pData.id,
            patientName: pData.name,
            patientAge: pData.age,
            patientGender: pData.gender,
            patientPhone: pData.phone,
            patientAddress: pData.address || ''
          };
          // Existing patient — skip location check; address is reconfirmed at the end.
          if (session.bookingData.testNames && session.bookingData.testNames.length > 0) {
            routeAfterTestsKnown(session, addResponse, t);
          } else {
            session.step = 'TEST_SELECTION';
            addResponse(t.askTest, [...cartPackagesList(session.language || 'en'), t.cancelBooking]);
          }
        } else {
          session.step = 'PATIENT_DETAILS_ENTRY';
          addResponse(t.patientDetailsEntry, [t.backToMainMenu]);
        }
      }
      break;

    case 'AVAILABILITY_CHECK': {
      const cfg = toServiceAreaConfig(await loadBookingConfig());

      // GPS path: customer shared a live WhatsApp location pin. If it lands
      // inside the service-area radius, proceed as if the PIN check passed.
      // If not, ask for a PIN as the fallback and stay in AVAILABILITY_CHECK.
      if (location) {
        if (isCoordInServiceArea(location.latitude, location.longitude, cfg)) {
          addResponse(t.available);
          if (session.isOnlyChecking) {
            addResponse(t.interestedInBooking, [t.options.book, t.backToMainMenu]);
          } else if (session.bookingData.testNames && session.bookingData.testNames.length > 0) {
            routeAfterTestsKnown(session, addResponse, t);
          } else {
            session.step = 'TEST_SELECTION';
            addResponse(t.askTest, [...cartPackagesList(session.language || 'en'), t.cancelBooking]);
          }
        } else {
          addResponse(t.gpsOutsideArea, [t.changeLocation, t.enterAnotherPin, t.backToMainMenu]);
        }
        break;
      }

      if (value === t.changeLocation || value === t.enterAnotherPin) {
        addResponse(t.askLocation, [t.backToMainMenu]);
        break;
      }

      if (isPinInServiceArea(value, cfg)) {
        addResponse(t.available);
        if (session.isOnlyChecking) {
          addResponse(t.interestedInBooking, [t.options.book, t.backToMainMenu]);
        } else if (session.bookingData.testNames && session.bookingData.testNames.length > 0) {
          routeAfterTestsKnown(session, addResponse, t);
        } else {
          session.step = 'TEST_SELECTION';
          addResponse(t.askTest, [...cartPackagesList(session.language || 'en'), t.cancelBooking]);
        }
      } else {
        addResponse(t.serviceUnavailable, [t.changeLocation, t.enterAnotherPin, t.backToMainMenu]);
      }
      break;
    }

    case 'TEST_SELECTION': {
      const lang = session.language || 'en';
      const cart = cartPackagesList(lang);
      const currentTests = session.bookingData.testNames || [];
      if (value === t.doneSelecting) {
        if (currentTests.length === 0) {
          addResponse(t.selectAtLeastOneTest, [...cart, t.cancelBooking]);
        } else {
          routeAfterTestsKnown(session, addResponse, t);
        }
      } else if (cart.includes(value)) {
        const newTests = currentTests.includes(value)
          ? currentTests.filter(v => v !== value)
          : [...currentTests, value];
        session.bookingData.testNames = newTests;
        // Reset ecgAddon when cart changes so eligibility re-evaluates at Done.
        delete session.bookingData.ecgAddon;
        const newPrice = computeBookingPrice(newTests, false);
        session.bookingData.price = newPrice;

        const statusMsg = newTests.length > 0
          ? `${t.selectedTestsPrefix}: ${newTests.join(', ')}\nTotal: ₹${newPrice}\n\n${t.anyAdditionalTests}`
          : t.askTest;
        const remaining = cart.filter(p => !newTests.includes(p));
        addResponse(statusMsg, [...remaining, t.doneSelecting, t.cancelBooking]);
      }
      break;
    }

    case 'ECG_ADDON':
      if (value === t.ecgAddonYes) {
        session.bookingData.ecgAddon = true;
      } else if (value === t.ecgAddonNo) {
        session.bookingData.ecgAddon = false;
      } else {
        addResponse(t.ecgAddonAsk, [t.ecgAddonYes, t.ecgAddonNo]);
        break;
      }
      routeAfterTestsKnown(session, addResponse, t);
      break;

    case 'PATIENT_GENDER':
      const newGender = t.genderMap[value] || 'Other';
      session.bookingData.patientGender = newGender;
      if (session.bookingData.patientId) {
        await upsertPatientProfile(from, { gender: newGender }, session.bookingData.patientId);
      }
      session.step = 'PATIENT_ADDRESS';
      addResponse(t.patientAddress, [t.backToMainMenu]);
      break;

    case 'PATIENT_ADDRESS':
      session.bookingData.patientAddress = value;
      session.step = 'PATIENT_ADDRESS_CONFIRM';
      addResponse(t.confirmAddressPrompt.replace('{address}', value), [t.yesCorrect, t.noChange]);
      break;

    case 'PATIENT_ADDRESS_CONFIRM':
      if (value === t.yesCorrect) {
        if (session.bookingData.patientId && session.bookingData.patientAddress) {
          await upsertPatientProfile(
            from,
            { address: session.bookingData.patientAddress },
            session.bookingData.patientId
          );
        }
        const cfgForDate = await loadBookingConfig();
        const datesForPrompt = bookableDates(cfgForDate);
        const dateLabels = datesForPrompt.map(d => formatDateLabel(d, session.language || 'en'));
        session.step = 'DATE_SELECTION';
        addResponse(t.chooseDate, [...dateLabels, t.cancelBooking]);
      } else {
        session.step = 'PATIENT_ADDRESS';
        addResponse(t.patientAddress, [t.cancelBooking]);
      }
      break;

    case 'DATE_SELECTION': {
      const cfg = await loadBookingConfig();
      const dates = bookableDates(cfg);
      const dateLabels = dates.map(d => formatDateLabel(d, session.language || 'en'));
      const idx = dateLabels.indexOf(value);
      if (idx >= 0) {
        const chosenDate = dates[idx];
        session.bookingData.bookingDate = chosenDate;
        session.step = 'TIME_SLOT';
        const bookable = filterBookableSlots(slotsForDate(cfg, chosenDate), chosenDate);
        const slotLabels = bookable.map(s => formatSlotLabel(s, session.language || 'en'));
        addResponse(t.timeSlot, [...slotLabels, t.cancelBooking]);
      } else {
        const advanceMsg = t.advanceLimitError.replace('{n}', String(cfg.maxAdvanceDays));
        addResponse(`${advanceMsg}\n\n${t.chooseDate}`, [...dateLabels, t.cancelBooking]);
      }
      break;
    }

    case 'TIME_SLOT': {
      const cfg = await loadBookingConfig();
      const chosenDate = session.bookingData.bookingDate || '';
      const bookable = filterBookableSlots(slotsForDate(cfg, chosenDate), chosenDate);
      const slotLabels = bookable.map(s => formatSlotLabel(s, session.language || 'en'));
      const idx = slotLabels.indexOf(value);
      if (idx >= 0) {
        const slot = bookable[idx];
        session.bookingData.slotStart = slot.start;
        session.bookingData.slotEnd = slot.end;
        session.bookingData.timeSlot = value;
        session.step = 'FASTING_CHECK';
        addResponse(t.fastingCheck, [t.yesFasting, t.noFasting]);
      } else {
        addResponse(t.timeSlot, [...slotLabels, t.cancelBooking]);
      }
      break;
    }

    case 'FASTING_CHECK':
      session.bookingData.isFastingConfirmed = value === t.yesFasting;
      session.step = 'NOTES';
      addResponse(t.askNotes, [t.none, t.backToMainMenu]);
      break;

    case 'NOTES':
      const notesText = (value === t.none || value.toLowerCase() === 'none') ? '' : value;
      session.bookingData.notes = notesText;
      session.step = 'CONFIRMATION';
      const fPrice = computeBookingPrice(session.bookingData.testNames || [], session.bookingData.ecgAddon || false);
      const sl = t.summaryLabels;
      const confirmDateLabel = session.bookingData.bookingDate
        ? formatDateLabel(session.bookingData.bookingDate, session.language || 'en')
        : '—';
      const summary = `*${t.confirmHeader}*\n\n${sl.tests}: ${(session.bookingData.testNames || []).join(', ')}\n${sl.price}: ₹${fPrice}\n${sl.patient}: ${session.bookingData.patientName} (${session.bookingData.patientAge})\n${sl.address}: ${session.bookingData.patientAddress}\n${sl.date}: ${confirmDateLabel}\n${sl.slot}: ${session.bookingData.timeSlot || '—'}\n${sl.notes}: ${notesText || t.summaryNoneNotes}`;
      addResponse(summary, [t.confirmButton, t.editButton]);
      break;

    case 'CONFIRMATION':
      if (value === t.confirmButton) {
        session.step = 'PAYMENT';
        addResponse(t.paymentHeader, t.paymentOptions);
      } else {
        session.step = 'MAIN_MENU';
        addResponse(t.menuHeader, (Object.values(t.options) as string[]).concat([t.changeLanguage, t.endSession]));
      }
      break;

    case 'PAYMENT':
      const method = value.includes('UPI') ? 'UPI' : 'Cash';
      const bId = generateId();

      // Invariant: patientId is set by PATIENT_DETAILS_ENTRY or PATIENT_SELECTION.
      // Reject the booking attempt rather than silently writing an orphan.
      if (!session.bookingData.patientId) {
        console.error('[Bot] PAYMENT step reached without patientId in session', from);
        addResponse(t.bookingDetailsMissing, [t.mainMenu]);
        session.step = 'MAIN_MENU';
        break;
      }

      const finalBooking = {
        ...session.bookingData,
        userId: from,
        paymentMethod: method,
        bookingId: bId,
        status: 'Created',
        createdAt: new Date().toISOString(),
        language: session.language || 'en',
        bookingSource: 'whatsapp' as const,
      };

      try {
        await adminDb.collection('bookings').doc(bId).set(finalBooking);

        // Refresh user profile metadata
        await adminDb.collection('users').doc(from).set({
          userId: from,
          language: session.language,
          lastActive: new Date().toISOString()
        }, { merge: true });

        // Patient profile was already created/updated during the booking flow.
        // Touch updatedAt so the patient surfaces as recently active.
        await upsertPatientProfile(from, {}, session.bookingData.patientId);

        session.step = 'COMPLETED';
        const receipt = buildBookingConfirmation(finalBooking as Booking, session.language || 'en');
        addResponse(receipt, [t.mainMenu, t.endSession]);
      } catch (err) {
        console.error('Save error:', err);
        addResponse(t.bookingFailed);
      }
      break;

    case 'COMPLETED':
      session.step = 'MAIN_MENU';
      addResponse(t.returningHeader, (Object.values(t.options) as string[]).concat([t.changeLanguage, t.endSession]));
      break;

    case 'MEDICINE_DELIVERY':
      if (value === t.options.support) {
        session.step = 'MAIN_MENU';
        addResponse(t.supportResponse, [t.backToMainMenu]);
      } else {
        // Anything else (including t.backToMainMenu) returns to main menu
        session.step = 'MAIN_MENU';
        addResponse(t.returningHeader, (Object.values(t.options) as string[]).concat([t.changeLanguage, t.endSession]));
      }
      break;

    case 'FAQ':
      if (t.faqTopics.includes(value)) {
        const answer = t.faqAnswers[value as keyof typeof t.faqAnswers];
        addResponse(answer, [t.moreFaqs, t.options.support, t.backToMainMenu]);
      } else if (value === t.moreFaqs || value === t.options.faq) {
        addResponse(t.faqHeader, [...t.faqTopics, t.backToMainMenu]);
      } else if (value === t.options.support) {
        session.step = 'MAIN_MENU';
        addResponse(t.supportResponse, [t.backToMainMenu]);
      } else {
        session.step = 'MAIN_MENU';
        addResponse(t.returningHeader, (Object.values(t.options) as string[]).concat([t.changeLanguage, t.endSession]));
      }
      break;

    case 'MY_BOOKINGS_LIST': {
      const cache = session.myBookingsCache || [];
      const match = cache.find(e => e.label === value);
      if (match) {
        session.activeBookingId = match.bookingId;
        session.step = 'BOOKING_DETAIL';
        await renderBookingDetail(session, addResponse, t);
      } else {
        // Cache miss or user typed something off-menu — re-render the list.
        await renderMyBookings(from, session, addResponse, t);
      }
      break;
    }

    case 'BOOKING_DETAIL': {
      if (value === t.bookingActionBack) {
        session.step = 'MY_BOOKINGS_LIST';
        await renderMyBookings(from, session, addResponse, t);
        break;
      }
      if (!session.activeBookingId) {
        session.step = 'MY_BOOKINGS_LIST';
        await renderMyBookings(from, session, addResponse, t);
        break;
      }

      if (value === t.bookingActionCancel) {
        // Re-check at the moment of action to catch races (admin moved status
        // forward while the customer sat on the screen).
        const snap = await adminDb.collection('bookings').doc(session.activeBookingId).get();
        if (!snap.exists) {
          session.activeBookingId = undefined;
          session.step = 'MY_BOOKINGS_LIST';
          await renderMyBookings(from, session, addResponse, t);
          break;
        }
        const booking = { ...(snap.data() as Booking), bookingId: snap.id };
        if (!isCancellable(booking)) {
          addResponse(t.cancelStatusBlocked, [t.bookingActionBack]);
          break;
        }
        if (!isWithinCustomerActionWindow(booking)) {
          addResponse(t.cancelTooLate, [t.bookingActionBack]);
          break;
        }
        session.step = 'BOOKING_CANCEL_REASON';
        addResponse(t.cancelReasonPrompt, [t.bookingActionBack]);
        break;
      }

      if (value === t.bookingActionReschedule) {
        const snap = await adminDb.collection('bookings').doc(session.activeBookingId).get();
        if (!snap.exists) {
          session.activeBookingId = undefined;
          session.step = 'MY_BOOKINGS_LIST';
          await renderMyBookings(from, session, addResponse, t);
          break;
        }
        const booking = { ...(snap.data() as Booking), bookingId: snap.id };
        if (!booking.bookingDate) {
          addResponse(t.rescheduleLegacyBlocked, [t.bookingActionBack]);
          break;
        }
        if (!isCancellable(booking)) {
          addResponse(t.cancelStatusBlocked, [t.bookingActionBack]);
          break;
        }
        if (!isWithinCustomerActionWindow(booking)) {
          addResponse(t.cancelTooLate, [t.bookingActionBack]);
          break;
        }
        const cfg = await loadBookingConfig();
        const dates = bookableDates(cfg);
        const dateLabels = dates.map(d => formatDateLabel(d, session.language || 'en'));
        session.step = 'BOOKING_RESCHEDULE_DATE';
        addResponse(t.rescheduleDatePrompt, [...dateLabels, t.bookingActionBack]);
        break;
      }

      // Anything else → re-render the detail.
      await renderBookingDetail(session, addResponse, t);
      break;
    }

    case 'BOOKING_CANCEL_REASON': {
      if (value === t.bookingActionBack) {
        session.step = 'BOOKING_DETAIL';
        await renderBookingDetail(session, addResponse, t);
        break;
      }
      if (normalizedVal === 'skip' || value === t.cancelReasonSkip) {
        session.cancelDraftReason = '';
      } else {
        session.cancelDraftReason = value.trim();
      }
      if (!session.activeBookingId) {
        session.step = 'MY_BOOKINGS_LIST';
        await renderMyBookings(from, session, addResponse, t);
        break;
      }
      const snap = await adminDb.collection('bookings').doc(session.activeBookingId).get();
      if (!snap.exists) {
        session.activeBookingId = undefined;
        session.step = 'MY_BOOKINGS_LIST';
        await renderMyBookings(from, session, addResponse, t);
        break;
      }
      const booking = { ...(snap.data() as Booking), bookingId: snap.id };
      const lang = session.language || 'en';
      const dateLabel = booking.bookingDate ? formatDateLabel(booking.bookingDate, lang) : '—';
      const prompt = t.cancelConfirmPrompt
        .replace('{patientName}', booking.patientName || '—')
        .replace('{date}', dateLabel)
        .replace('{slot}', booking.timeSlot || '—');
      session.step = 'BOOKING_CANCEL_CONFIRM';
      addResponse(prompt, [t.cancelConfirmYes, t.cancelConfirmNo]);
      break;
    }

    case 'BOOKING_CANCEL_CONFIRM': {
      if (value === t.cancelConfirmNo) {
        session.step = 'BOOKING_DETAIL';
        session.cancelDraftReason = undefined;
        await renderBookingDetail(session, addResponse, t);
        break;
      }
      if (value === t.cancelConfirmYes) {
        if (!session.activeBookingId) {
          session.step = 'MY_BOOKINGS_LIST';
          await renderMyBookings(from, session, addResponse, t);
          break;
        }
        const snap = await adminDb.collection('bookings').doc(session.activeBookingId).get();
        if (!snap.exists) {
          session.activeBookingId = undefined;
          session.step = 'MY_BOOKINGS_LIST';
          await renderMyBookings(from, session, addResponse, t);
          break;
        }
        const booking = { ...(snap.data() as Booking), bookingId: snap.id };
        if (!isCancellable(booking)) {
          session.step = 'BOOKING_DETAIL';
          addResponse(t.cancelStatusBlocked, [t.bookingActionBack]);
          break;
        }
        if (!isWithinCustomerActionWindow(booking)) {
          session.step = 'BOOKING_DETAIL';
          addResponse(t.cancelTooLate, [t.bookingActionBack]);
          break;
        }
        try {
          await adminDb.collection('bookings').doc(session.activeBookingId).update({
            status: 'Cancelled',
            cancelledBy: `customer:${from}`,
            cancelledByRole: 'customer',
            cancelledAt: new Date().toISOString(),
            cancellationReason: session.cancelDraftReason || null,
          });
        } catch (err) {
          console.error('[Bot] cancel write failed', err);
          addResponse(t.bookingFailed, [t.backToMainMenu]);
          session.step = 'MAIN_MENU';
          break;
        }
        session.activeBookingId = undefined;
        session.cancelDraftReason = undefined;
        session.step = 'MAIN_MENU';
        addResponse(t.cancelSuccess, [t.backToMainMenu]);
        break;
      }
      // Anything else → re-prompt with the same confirm message.
      if (session.activeBookingId) {
        const snap = await adminDb.collection('bookings').doc(session.activeBookingId).get();
        if (snap.exists) {
          const booking = { ...(snap.data() as Booking), bookingId: snap.id };
          const lang = session.language || 'en';
          const dateLabel = booking.bookingDate ? formatDateLabel(booking.bookingDate, lang) : '—';
          const prompt = t.cancelConfirmPrompt
            .replace('{patientName}', booking.patientName || '—')
            .replace('{date}', dateLabel)
            .replace('{slot}', booking.timeSlot || '—');
          addResponse(prompt, [t.cancelConfirmYes, t.cancelConfirmNo]);
        }
      }
      break;
    }

    case 'BOOKING_RESCHEDULE_DATE': {
      if (value === t.bookingActionBack) {
        session.step = 'BOOKING_DETAIL';
        await renderBookingDetail(session, addResponse, t);
        break;
      }
      const cfg = await loadBookingConfig();
      const dates = bookableDates(cfg);
      const dateLabels = dates.map(d => formatDateLabel(d, session.language || 'en'));
      const idx = dateLabels.indexOf(value);
      if (idx >= 0) {
        const chosenDate = dates[idx];
        session.rescheduleDraft = {
          bookingDate: chosenDate,
          slotStart: '',
          slotEnd: '',
          timeSlot: '',
        };
        session.step = 'BOOKING_RESCHEDULE_SLOT';
        const bookable = filterBookableSlots(slotsForDate(cfg, chosenDate), chosenDate);
        const slotLabels = bookable.map(s => formatSlotLabel(s, session.language || 'en'));
        addResponse(t.rescheduleSlotPrompt, [...slotLabels, t.bookingActionBack]);
      } else {
        addResponse(t.rescheduleDatePrompt, [...dateLabels, t.bookingActionBack]);
      }
      break;
    }

    case 'BOOKING_RESCHEDULE_SLOT': {
      if (value === t.bookingActionBack) {
        const cfg = await loadBookingConfig();
        const dates = bookableDates(cfg);
        const dateLabels = dates.map(d => formatDateLabel(d, session.language || 'en'));
        session.step = 'BOOKING_RESCHEDULE_DATE';
        addResponse(t.rescheduleDatePrompt, [...dateLabels, t.bookingActionBack]);
        break;
      }
      if (!session.rescheduleDraft || !session.activeBookingId) {
        session.step = 'MY_BOOKINGS_LIST';
        await renderMyBookings(from, session, addResponse, t);
        break;
      }
      const cfg = await loadBookingConfig();
      const chosenDate = session.rescheduleDraft.bookingDate;
      const bookable = filterBookableSlots(slotsForDate(cfg, chosenDate), chosenDate);
      const slotLabels = bookable.map(s => formatSlotLabel(s, session.language || 'en'));
      const idx = slotLabels.indexOf(value);
      if (idx >= 0) {
        const slot = bookable[idx];
        session.rescheduleDraft = {
          bookingDate: chosenDate,
          slotStart: slot.start,
          slotEnd: slot.end,
          timeSlot: value,
        };
        const snap = await adminDb.collection('bookings').doc(session.activeBookingId).get();
        if (!snap.exists) {
          session.activeBookingId = undefined;
          session.rescheduleDraft = undefined;
          session.step = 'MY_BOOKINGS_LIST';
          await renderMyBookings(from, session, addResponse, t);
          break;
        }
        const booking = { ...(snap.data() as Booking), bookingId: snap.id };
        const lang = session.language || 'en';
        const oldDateLabel = booking.bookingDate ? formatDateLabel(booking.bookingDate, lang) : '—';
        const newDateLabel = formatDateLabel(chosenDate, lang);
        const prompt = t.rescheduleConfirmPrompt
          .replace('{oldDate}', oldDateLabel)
          .replace('{oldSlot}', booking.timeSlot || '—')
          .replace('{newDate}', newDateLabel)
          .replace('{newSlot}', value);
        session.step = 'BOOKING_RESCHEDULE_CONFIRM';
        addResponse(prompt, [t.rescheduleConfirmYes, t.rescheduleConfirmNo]);
      } else {
        addResponse(t.rescheduleSlotPrompt, [...slotLabels, t.bookingActionBack]);
      }
      break;
    }

    case 'BOOKING_RESCHEDULE_CONFIRM': {
      if (value === t.rescheduleConfirmNo) {
        session.rescheduleDraft = undefined;
        session.step = 'BOOKING_DETAIL';
        await renderBookingDetail(session, addResponse, t);
        break;
      }
      if (value === t.rescheduleConfirmYes) {
        if (!session.activeBookingId || !session.rescheduleDraft) {
          session.step = 'MY_BOOKINGS_LIST';
          await renderMyBookings(from, session, addResponse, t);
          break;
        }
        const draft = session.rescheduleDraft;
        const snap = await adminDb.collection('bookings').doc(session.activeBookingId).get();
        if (!snap.exists) {
          session.activeBookingId = undefined;
          session.rescheduleDraft = undefined;
          session.step = 'MY_BOOKINGS_LIST';
          await renderMyBookings(from, session, addResponse, t);
          break;
        }
        const booking = { ...(snap.data() as Booking), bookingId: snap.id };
        if (!isCancellable(booking)) {
          session.step = 'BOOKING_DETAIL';
          addResponse(t.cancelStatusBlocked, [t.bookingActionBack]);
          break;
        }
        if (!isWithinCustomerActionWindow(booking)) {
          session.step = 'BOOKING_DETAIL';
          addResponse(t.cancelTooLate, [t.bookingActionBack]);
          break;
        }

        // Compute whether the currently-assigned phleb can keep this booking.
        // Default to false on any read error so we never silently double-book.
        let keepPhleb = false;
        try {
          const [phlebsSnap, availSnap, dateBookingsSnap] = await Promise.all([
            adminDb.collection('staff').where('role', '==', 'phlebotomist').where('active', '==', true).get(),
            adminDb.collection('phlebAvailability').where('date', '==', draft.bookingDate).get(),
            adminDb.collection('bookings').where('bookingDate', '==', draft.bookingDate).get(),
          ]);
          const phlebs = phlebsSnap.docs.map(d => ({ ...(d.data() as Staff), uid: d.id }));
          const phlebAvailMap: Record<string, PhlebAvailability | null> = {};
          availSnap.docs.forEach(d => {
            const data = d.data() as PhlebAvailability;
            if (data.phlebotomistUid) {
              phlebAvailMap[phlebAvailabilityDocId(draft.bookingDate, data.phlebotomistUid)] = data;
            }
          });
          const otherBookings = dateBookingsSnap.docs.map(d => ({
            ...(d.data() as Booking),
            bookingId: d.id,
          }));
          keepPhleb = canPhlebKeepBooking(
            booking.bookingId,
            booking.assignedTo,
            draft.bookingDate,
            draft.slotStart,
            phlebs,
            phlebAvailMap,
            otherBookings,
          );
        } catch (err) {
          console.warn('[Bot] keep-phleb check failed; defaulting to unassign', err);
          keepPhleb = false;
        }

        const patch: Record<string, unknown> = {
          bookingDate: draft.bookingDate,
          slotStart: draft.slotStart,
          slotEnd: draft.slotEnd,
          timeSlot: draft.timeSlot,
          rescheduledAt: new Date().toISOString(),
          rescheduledBy: `customer:${from}`,
          rescheduledByRole: 'customer',
          previousBookingDate: booking.bookingDate ?? null,
          previousSlotStart: booking.slotStart ?? null,
          previousSlotEnd: booking.slotEnd ?? null,
          previousTimeSlot: booking.timeSlot ?? null,
        };
        if (!keepPhleb && booking.assignedTo) {
          patch.assignedTo = null;
          patch.assignedToName = null;
          patch.status = 'Created';
        }

        try {
          await adminDb.collection('bookings').doc(session.activeBookingId).update(patch);
        } catch (err) {
          console.error('[Bot] reschedule write failed', err);
          addResponse(t.bookingFailed, [t.backToMainMenu]);
          session.step = 'MAIN_MENU';
          break;
        }

        const lang = session.language || 'en';
        const newDateLabel = formatDateLabel(draft.bookingDate, lang);
        const newSlotLabel = draft.timeSlot;
        session.activeBookingId = undefined;
        session.rescheduleDraft = undefined;
        session.step = 'MAIN_MENU';
        addResponse(
          t.rescheduleSuccess.replace('{newDate}', newDateLabel).replace('{newSlot}', newSlotLabel),
          [t.backToMainMenu],
        );
        break;
      }
      // Anything else → re-render the confirm prompt.
      if (session.activeBookingId && session.rescheduleDraft) {
        const snap = await adminDb.collection('bookings').doc(session.activeBookingId).get();
        if (snap.exists) {
          const booking = { ...(snap.data() as Booking), bookingId: snap.id };
          const lang = session.language || 'en';
          const oldDateLabel = booking.bookingDate ? formatDateLabel(booking.bookingDate, lang) : '—';
          const newDateLabel = formatDateLabel(session.rescheduleDraft.bookingDate, lang);
          const prompt = t.rescheduleConfirmPrompt
            .replace('{oldDate}', oldDateLabel)
            .replace('{oldSlot}', booking.timeSlot || '—')
            .replace('{newDate}', newDateLabel)
            .replace('{newSlot}', session.rescheduleDraft.timeSlot);
          addResponse(prompt, [t.rescheduleConfirmYes, t.rescheduleConfirmNo]);
        }
      }
      break;
    }
  }

  session.lastActive = new Date().toISOString();
  await sessionRef.set(session);
  return responses;
}
