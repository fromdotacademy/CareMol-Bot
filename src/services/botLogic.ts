import { adminDb } from './firebaseAdmin';
import { TRANSLATIONS, TEST_PRICES, PACKAGE_DESCRIPTIONS } from '../constants';
import { geocodeLocation, isWithinRange } from './mapsService';
import { generateId } from '../lib/utils';
import { ChatStep, Language, Booking, PatientProfile } from '../types';
import { parsePatientDetails } from './geminiService';

export interface BotSession {
  userId: string; // Phone number
  step: ChatStep;
  language: Language | null;
  bookingData: Partial<Booking>;
  isOnlyChecking: boolean;
  lastActive: string;
}

export interface BotResponse {
  text: string;
  buttons?: string[];
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

export async function handleWhatsAppMessage(from: string, incomingBody: string): Promise<BotResponse[]> {
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
  const isGlobalMenuAction = ['menu', 'home', 'restart'].includes(normalizedVal) || 
                             value === t.mainMenu || 
                             value === t.backToMainMenu ||
                             value === t.options.book ||
                             value === t.options.packages ||
                             value === t.options.availability;

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
      addResponse(t.selectPackageToView, [...t.packagesList, t.backToMainMenu]);
    } else if (value === t.options.availability) {
      session.isOnlyChecking = true;
      session.step = 'AVAILABILITY_CHECK';
      addResponse(t.askLocation, [t.backToMainMenu]);
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
    addResponse("👋 Welcome back! Select your language / നിങ്ങളുടെ ഭാഷ തിരഞ്ഞെടുക്കുക:", ['English', 'മലയാളം']);
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
        addResponse(`👋 ${langT.welcome}\n${langT.menuHeader}`, (Object.values(langT.options) as string[]).concat([langT.endSession]));
      } else {
        addResponse("Please select your language / നിങ്ങളുടെ ഭാഷ തിരഞ്ഞെടുക്കുക:", ['English', 'മലയാളം']);
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
        addResponse(t.selectPackageToView, [...t.packagesList, t.backToMainMenu]);
      } else if (value === t.options.availability) {
        session.isOnlyChecking = true;
        session.step = 'AVAILABILITY_CHECK';
        addResponse(t.askLocation, [t.backToMainMenu]);
      } else if (value === t.options.support) {
        addResponse("Opening support channel... One of our agents will contact you shortly.", [t.backToMainMenu]);
      } else if (value === t.changeLanguage) {
        session.step = 'LANGUAGE_SELECTION';
        addResponse(t.selectLabel, ['English', 'മലയാളം']);
      }
      break;

    case 'PATIENT_DETAILS_ENTRY':
      // Use Gemini to parse lead details
      const parsed = await parsePatientDetails(value);
      if (parsed) {
        const patientName = parsed.name;
        const patientAge = parsed.age || 30; // Default age if not found
        const patientPhone = parsed.phone || from; // Use sender's phone if not provided
        let patientGender: 'Male' | 'Female' | 'Other' | undefined;
        if (parsed.isMale) patientGender = 'Male';
        else if (parsed.isFemale) patientGender = 'Female';

        // Create patient profile immediately (lead capture).
        // If we already have a patientId on this session (rare retry case), update it instead.
        const patientId = await upsertPatientProfile(
          from,
          {
            name: patientName,
            age: patientAge,
            phone: patientPhone,
            ...(patientGender ? { gender: patientGender } : {}),
          },
          session.bookingData.patientId
        );

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

    case 'PACKAGE_VIEW':
      if (t.packagesList.includes(value)) {
        const desc = PACKAGE_DESCRIPTIONS[value] || "";
        session.bookingData = { 
          ...session.bookingData,
          testNames: [value], 
          price: TEST_PRICES[value] || 0 
        };
        session.step = 'PACKAGE_DETAIL_VIEW';
        addResponse(
          `*${value}*\n\n${t.packageIncludes.replace('{details}', desc)}\n\nPrice: ₹${TEST_PRICES[value]}`,
          [t.bookNow, t.backToPackages, t.backToMainMenu]
        );
      } else {
        session.step = 'MAIN_MENU';
        addResponse(t.menuHeader, Object.values(t.options));
      }
      break;

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
        addResponse(t.selectPackageToView, [...t.packagesList, t.backToMainMenu]);
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
          session.step = 'AVAILABILITY_CHECK';
          addResponse(t.askLocation, [t.backToMainMenu]);
        } else {
          session.step = 'PATIENT_DETAILS_ENTRY';
          addResponse(t.patientDetailsEntry, [t.backToMainMenu]);
        }
      }
      break;

    case 'AVAILABILITY_CHECK':
      if (value === t.changeLocation || value === t.enterAnotherPin) {
        addResponse(t.askLocation, [t.backToMainMenu]);
        break;
      }
      const melatturPin = '679326';
      const isAvailable = value.includes(melatturPin);

      if (isAvailable) {
        addResponse(t.available);
        if (session.isOnlyChecking) {
          addResponse(t.interestedInBooking, [t.options.book, t.backToMainMenu]);
        } else {
          session.step = 'TEST_SELECTION';
          // Avoid duplicate selection if tests already selected via Package View
          if (session.bookingData.testNames && session.bookingData.testNames.length > 0) {
            if (session.bookingData.patientAddress) {
              session.step = 'PATIENT_ADDRESS_CONFIRM';
              addResponse(t.confirmAddressPrompt.replace('{address}', session.bookingData.patientAddress), [t.yesCorrect, t.noChange]);
            } else if (session.bookingData.patientGender) {
              session.step = 'PATIENT_ADDRESS';
              addResponse(t.patientAddress, [t.backToMainMenu]);
            } else {
              session.step = 'PATIENT_GENDER';
              addResponse(t.patientGender, [...t.genderOptions, t.backToMainMenu]);
            }
          } else {
            addResponse(t.askTest, [...t.packagesList, t.cancelBooking]);
          }
        }
      } else {
        // Point 5: Handle unavailability with options
        addResponse(t.serviceUnavailable, [t.changeLocation, t.enterAnotherPin, t.backToMainMenu]);
      }
      break;

    case 'TEST_SELECTION':
      const currentTests = session.bookingData.testNames || [];
      if (value === t.doneSelecting) {
        if (currentTests.length === 0) {
          addResponse(t.selectAtLeastOneTest, [...t.packagesList, t.cancelBooking]);
        } else {
          if (session.bookingData.patientAddress) {
            session.step = 'PATIENT_ADDRESS_CONFIRM';
            addResponse(t.confirmAddressPrompt.replace('{address}', session.bookingData.patientAddress), [t.yesCorrect, t.noChange]);
          } else if (session.bookingData.patientGender) {
            session.step = 'PATIENT_ADDRESS';
            addResponse(t.patientAddress, [t.backToMainMenu]);
          } else {
            session.step = 'PATIENT_GENDER';
            addResponse(t.patientGender, [...t.genderOptions, t.backToMainMenu]);
          }
        }
      } else if (t.packagesList.includes(value)) {
        const newTests = currentTests.includes(value) 
          ? currentTests.filter(v => v !== value)
          : [...currentTests, value];
        const newPrice = newTests.reduce((sum, test) => sum + (TEST_PRICES[test] || 0), 0);
        session.bookingData.testNames = newTests;
        session.bookingData.price = newPrice;
        
        const statusMsg = newTests.length > 0 
          ? `${t.selectedTestsPrefix}: ${newTests.join(', ')}\nTotal: ₹${newPrice}\n\n${t.anyAdditionalTests}`
          : t.askTest;
        const remaining = t.packagesList.filter(p => !newTests.includes(p));
        // Point 6: ✅ Done option
        addResponse(statusMsg, [...remaining, t.doneSelecting, t.cancelBooking]);
      }
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
        session.step = 'TIME_SLOT';
        addResponse(t.timeSlot, [...t.slots, t.cancelBooking]);
      } else {
        session.step = 'PATIENT_ADDRESS';
        addResponse(t.patientAddress, [t.cancelBooking]);
      }
      break;

    case 'TIME_SLOT':
      if (t.slots.includes(value)) {
        session.bookingData.timeSlot = value;
        session.step = 'FASTING_CHECK';
        addResponse(t.fastingCheck, ['Yes / അതെ', 'No / ഇല്ല']);
      } else {
        addResponse(t.timeSlot, [...t.slots, t.cancelBooking]);
      }
      break;

    case 'FASTING_CHECK':
      session.bookingData.isFastingConfirmed = value.includes('Yes');
      session.step = 'NOTES';
      addResponse(t.askNotes, [t.none, t.backToMainMenu]);
      break;

    case 'NOTES':
      const notesText = (value === t.none || value.toLowerCase() === 'none' || value === 'ഇല്ല') ? '' : value;
      session.bookingData.notes = notesText;
      session.step = 'CONFIRMATION';
      const fPrice = (session.bookingData.testNames || []).reduce((sum, test) => sum + (TEST_PRICES[test] || 0), 0);
      const summary = `*${t.confirmHeader}*\n\nTests: ${(session.bookingData.testNames || []).join(', ')}\nPrice: ₹${fPrice}\nPatient: ${session.bookingData.patientName} (${session.bookingData.patientAge})\nAddress: ${session.bookingData.patientAddress}\nNotes: ${notesText || 'None'}`;
      addResponse(summary, [session.language === 'en' ? 'Confirm' : 'സ്ഥിരീകരിക്കുക', 'Edit / തിരുത്തുക']);
      break;

    case 'CONFIRMATION':
      if (value === 'Confirm' || value === 'സ്ഥിരീകരിക്കുക') {
        session.step = 'PAYMENT';
        addResponse(t.paymentHeader, t.paymentOptions);
      } else {
        session.step = 'MAIN_MENU';
        addResponse(t.menuHeader, Object.values(t.options));
      }
      break;

    case 'PAYMENT':
      const method = value.includes('UPI') ? 'UPI' : 'Cash';
      const bId = generateId();

      // Invariant: patientId is set by PATIENT_DETAILS_ENTRY or PATIENT_SELECTION.
      // Reject the booking attempt rather than silently writing an orphan.
      if (!session.bookingData.patientId) {
        console.error('[Bot] PAYMENT step reached without patientId in session', from);
        addResponse("❌ Patient details are missing. Please start the booking again.", [t.mainMenu]);
        session.step = 'MAIN_MENU';
        break;
      }

      const finalBooking = {
        ...session.bookingData,
        userId: from,
        paymentMethod: method,
        bookingId: bId,
        status: 'Created',
        createdAt: new Date().toISOString()
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
        addResponse(`${t.success}\n*${t.bookingId}: ${bId}*\n${t.phlebMsg}`, [t.mainMenu, t.endSession]);
      } catch (err) {
        console.error('Save error:', err);
        addResponse("❌ Failed to save booking. Please try again later.");
      }
      break;

    case 'COMPLETED':
      session.step = 'MAIN_MENU';
      addResponse(t.returningHeader, (Object.values(t.options) as string[]).concat([t.changeLanguage, t.endSession]));
      break;
  }

  session.lastActive = new Date().toISOString();
  await sessionRef.set(session);
  return responses;
}
