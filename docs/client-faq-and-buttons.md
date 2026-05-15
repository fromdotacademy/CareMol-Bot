# CareMol Bot — FAQ content + Button labels (for client review)

Hand this to the CareMol client.
- **Part A** lists the FAQ topics. Four answers are placeholders (`[TODO: …]`) — please fill them in.
- **Part B** lists every button / option the bot shows the user. Mark anything you want re-worded.

Both English and Malayalam wording are shown side by side. The Malayalam should mirror whatever English wording is agreed.

Source file in code: `src/constants.ts`.

---

## Part A — FAQ topics & current answers

The bot shows nine FAQ topics. Tapping one shows the answer below.

### 1. Available Locations / സർവീസ് ലഭ്യമായ സ്ഥലങ്ങൾ

**English (current):**
> 📍 *Available Locations*
>
> We currently serve homes within 5 km of Melattur (PIN 679326). More locations coming soon!

**Malayalam (current):**
> 📍 *സർവീസ് ലഭ്യമായ സ്ഥലങ്ങൾ*
>
> നിലവിൽ Melattur ചുറ്റും 5 km പരിധിയിൽ (PIN 679326) സേവനം ലഭ്യമാണ്. കൂടുതൽ സ്ഥലങ്ങൾ ഉടൻ ചേർക്കും!

---

### 2. Working Hours / പ്രവൃത്തി സമയം  ⚠️ PLACEHOLDER

**English (current — to replace):**
> 🕐 *Working Hours*
>
> [TODO: fill in working hours, e.g., Mon–Sat 7:00 AM – 8:00 PM, Sun 8:00 AM – 1:00 PM]

**Malayalam (current — to replace):**
> 🕐 *പ്രവൃത്തി സമയം*
>
> [TODO: പ്രവൃത്തി സമയം ചേർക്കുക, ഉദാ: തിങ്കൾ–ശനി 7:00 AM – 8:00 PM, ഞായർ 8:00 AM – 1:00 PM]

**Please provide:**
- Weekday hours: ____
- Weekend hours: ____
- Any holiday/closure notes: ____

---

### 3. Sample Collection Timing / സാമ്പിൾ കളക്ഷൻ സമയം

**English (current):**
> 🧪 *Sample Collection Timing*
>
> Morning slots are recommended for fasting tests. Available time slots:
> • 08:00 AM – 10:00 AM
> • 10:00 AM – 12:00 PM
> • 02:00 PM – 04:00 PM
> • 04:00 PM – 06:00 PM

**Malayalam (current):**
> 🧪 *സാമ്പിൾ കളക്ഷൻ സമയം*
>
> ഫാസ്റ്റിംഗ് ടെസ്റ്റുകൾക്ക് രാവിലത്തെ സ്ലോട്ടുകൾ ശുപാർശ ചെയ്യുന്നു. ലഭ്യമായ സമയങ്ങൾ:
> • 08:00 AM – 10:00 AM
> • 10:00 AM – 12:00 PM
> • 02:00 PM – 04:00 PM
> • 04:00 PM – 06:00 PM

---

### 4. Report Delivery Time / റിപ്പോർട്ട് ലഭ്യമാകുന്ന സമയം  ⚠️ PLACEHOLDER

**English (current — to replace):**
> 📄 *Report Delivery Time*
>
> [TODO: fill in turn-around time per package, e.g., Basic Health: same day; Elite Care: 24–48 hrs]

**Malayalam (current — to replace):**
> 📄 *റിപ്പോർട്ട് ലഭ്യമാകുന്ന സമയം*
>
> [TODO: ഓരോ പാക്കേജിന്റെയും റിപ്പോർട്ട് സമയം ചേർക്കുക, ഉദാ: ബേസിക് ഹെൽത്ത്: അതേ ദിവസം; എലൈറ്റ് കെയർ: 24–48 മണിക്കൂർ]

**Please provide turn-around time per package:**
- Basic Health (₹299): ____
- Smart Care (₹999): ____
- Pro Care (₹1549): ____
- Elite Care (₹2549): ____
- Women Wellness (₹1299): ____
- Diabetes Care (₹999): ____
- Any special-case tests with longer TAT: ____

---

### 5. Payment Methods / പേയ്‌മെന്റ് രീതികൾ

**English (current):**
> 💳 *Payment Methods*
>
> We accept:
> • UPI (at booking)
> • Cash on Collection

**Malayalam (current):**
> 💳 *പേയ്‌മെന്റ് രീതികൾ*
>
> ഞങ്ങൾ സ്വീകരിക്കുന്നത്:
> • UPI (ബുക്കിംഗിൽ)
> • കളക്ഷനിൽ പണം

---

### 6. Refund / Cancellation / റീഫണ്ട് / റദ്ദാക്കൽ  ⚠️ PLACEHOLDER

**English (current — to replace):**
> ↩️ *Refund / Cancellation*
>
> [TODO: fill in cancellation window and refund policy]

**Malayalam (current — to replace):**
> ↩️ *റീഫണ്ട് / റദ്ദാക്കൽ*
>
> [TODO: റദ്ദാക്കൽ സമയവും റീഫണ്ട് നയവും ചേർക്കുക]

**Please provide:**
- How long before the appointment can a customer cancel for a full refund?
- Refund timeline after cancellation: ____
- Any cancellation charges: ____
- Reschedule policy (free / chargeable / how many times): ____

---

### 7. Doctor Consultation / ഡോക്ടർ കൺസൾട്ടേഷൻ  ⚠️ PLACEHOLDER

**English (current — to replace):**
> 👨‍⚕️ *Doctor Consultation*
>
> [TODO: fill in whether doctor consultation is available, and how to request it]

**Malayalam (current — to replace):**
> 👨‍⚕️ *ഡോക്ടർ കൺസൾട്ടേഷൻ*
>
> [TODO: ഡോക്ടർ കൺസൾട്ടേഷൻ ലഭ്യമാണോ എന്നും, എങ്ങനെ അഭ്യർത്ഥിക്കാം എന്നും ചേർക്കുക]

**Please provide:**
- Is doctor consultation offered? (Yes / No / Coming soon): ____
- If yes — how does the customer request it (call / form / WhatsApp): ____
- Fee, if any: ____

---

### 8. Medicine Delivery / മരുന്ന് ഡെലിവറി

**English (current):**
> 💊 *Medicine Delivery*
>
> Medicine Delivery will be available soon. Stay tuned for updates from CareMol.

**Malayalam (current):**
> 💊 *മരുന്ന് ഡെലിവറി*
>
> മരുന്ന് ഡെലിവറി ഉടൻ ലഭ്യമാകും. CareMol-ൽ നിന്നുള്ള അപ്ഡേറ്റുകൾക്കായി കാത്തിരിക്കുക.

---

### 9. Contact Support / സപ്പോർട്ട് ബന്ധപ്പെടുക

**English (current):**
> 📞 *Contact Support*
>
> Use the "Talk to Support" or "Call CareMol" option from the main menu, and our team will reach out shortly.

**Malayalam (current):**
> 📞 *സപ്പോർട്ട് ബന്ധപ്പെടുക*
>
> പ്രധാന മെനുവിൽ നിന്ന് "സപ്പോർട്ടുമായി സംസാരിക്കുക" അല്ലെങ്കിൽ "CareMol-ന് വിളിക്കുക" ഓപ്ഷൻ ഉപയോഗിക്കുക, ഞങ്ങളുടെ ടീം ഉടൻ ബന്ധപ്പെടും.

---

## Part B — All button / option labels

WhatsApp limits: reply-button text ≤ **20 characters**, list-row text ≤ **24 characters**. If you propose longer wording, it will get truncated.

### Main menu (after greeting)

| English | Malayalam |
|---|---|
| 🧪 Book Home Sample Collection | 🧪 ഹോം സാമ്പിൾ കളക്ഷൻ ബുക്ക് ചെയ്യുക |
| 💊 Medicine Delivery | 💊 മരുന്ന് ഡെലിവറി |
| 📋 View Health Packages | 📋 ഹെൽത്ത് പാക്കേജുകൾ കാണുക |
| 👨‍⚕️ Talk to Support | 👨‍⚕️ സപ്പോർട്ടുമായി സംസാരിക്കുക |
| ❓ FAQ | ❓ പതിവ് ചോദ്യങ്ങൾ |
| 📞 Call CareMol | 📞 CareMol-ന് വിളിക്കുക |
| 🌐 Change Language | 🌐 ഭാഷ മാറ്റുക |
| 🚪 End Chat | 🚪 ചാറ്റ് അവസാനിപ്പിക്കുക |

### Patient / booking flow

| English | Malayalam |
|---|---|
| Someone else | മറ്റൊരാൾക്ക് |
| Yes, it's correct | അതെ, ശരിയാണ് |
| No, let me change | അല്ല, മാറ്റണം |
| Yes (fasting prepared) | അതെ |
| No (not fasting) | ഇല്ല |
| Cancel Booking | ബുക്കിംഗ് റദ്ദാക്കുക |
| Yes, Cancel | അതെ, റദ്ദാക്കുക |
| No, Continue Booking | അല്ല, ബുക്കിംഗ് തുടരുക |
| Confirm | സ്ഥിരീകരിക്കുക |
| Edit Details | തിരുത്തുക |
| ✅ Done Selecting | ✅ തിരഞ്ഞെടുത്തു കഴിഞ്ഞു |

### Gender options (asked during patient entry)

| English | Malayalam |
|---|---|
| Male | പുരുഷൻ |
| Female | സ്ത്രീ |
| Other | മറ്റ് |

### Time slots (current default — also editable in admin Settings tab)

Shown in both languages:
- 08:00 AM – 10:00 AM
- 10:00 AM – 12:00 PM
- 02:00 PM – 04:00 PM
- 04:00 PM – 06:00 PM

### Date selection

| English | Malayalam |
|---|---|
| Today | ഇന്ന് |
| Tomorrow | നാളെ |
| (weekday short labels) Sun, Mon, Tue, Wed, Thu, Fri, Sat | ഞായർ, തിങ്കൾ, ചൊവ്വ, ബുധൻ, വ്യാഴം, വെള്ളി, ശനി |
| (month short labels) Jan…Dec | ജനു, ഫെബ്രു, മാർ, ഏപ്രി, മേയ്, ജൂൺ, ജൂലൈ, ഓഗ, സെപ്റ്റം, ഒക്ടോ, നവം, ഡിസം |

### ECG add-on prompt

| English | Malayalam |
|---|---|
| Yes, add ECG | അതെ, ECG ചേർക്കുക |
| No, skip | വേണ്ട, ഒഴിവാക്കുക |

### Payment options

| English | Malayalam |
|---|---|
| UPI | UPI |
| Cash on Collection | Cash on Collection *(currently shown in English only)* |

> ⚠ The Malayalam side currently shows the English payment labels. If you want them translated (e.g., "കളക്ഷനിൽ പണം"), please confirm.

### Package screen

| English | Malayalam |
|---|---|
| Book Now | ഇപ്പോൾ ബുക്ക് ചെയ്യുക |
| Back to Packages | മറ്റ് പാക്കേജുകൾ കാണുക |
| ⬅️ Back to Main Menu | ⬅️ പ്രധാന മെനുവിലേക്ക് |

### Package badges (shown on package cards)

| English | Malayalam |
|---|---|
| ⭐ MOST BOOKED | ⭐ ഏറ്റവും കൂടുതൽ ബുക്ക് ചെയ്തത് |
| 👨‍⚕️ DOCTOR REC. | 👨‍⚕️ ഡോക്ടർ ശുപാർശ |
| 🏆 PREMIUM | 🏆 പ്രീമിയം |

### Location flow

| English | Malayalam |
|---|---|
| 📍 Change Location | 📍 ലൊക്കേഷൻ മാറ്റുക |
| 🔢 Enter Another PIN Code | 🔢 മറ്റൊരു പിൻകോഡ് നൽകുക |

### After successful booking

| English | Malayalam |
|---|---|
| Share to WhatsApp | വാട്സാപ്പിൽ അയക്കുക |
| Main Menu | പ്രധാന മെനു |

### FAQ navigation

| English | Malayalam |
|---|---|
| ❓ More FAQs | ❓ കൂടുതൽ ചോദ്യങ്ങൾ |
| ⬅️ Back to Main Menu | ⬅️ പ്രധാന മെനുവിലേക്ക് |

### FAQ topic buttons (one per topic — 9 total)

| English | Malayalam |
|---|---|
| Available Locations | സർവീസ് ലഭ്യമായ സ്ഥലങ്ങൾ |
| Working Hours | പ്രവൃത്തി സമയം |
| Sample Collection Timing | സാമ്പിൾ കളക്ഷൻ സമയം |
| Report Delivery Time | റിപ്പോർട്ട് ലഭ്യമാകുന്ന സമയം |
| Payment Methods | പേയ്‌മെന്റ് രീതികൾ |
| Refund / Cancellation | റീഫണ്ട് / റദ്ദാക്കൽ |
| Doctor Consultation | ഡോക്ടർ കൺസൾട്ടേഷൻ |
| Medicine Delivery | മരുന്ന് ഡെലിവറി |
| Contact Support | സപ്പോർട്ട് ബന്ധപ്പെടുക |

### Health package names (also shown as list rows)

| English | Malayalam | Price |
|---|---|---|
| Basic Health | ബേസിക് ഹെൽത്ത് | ₹299 (MRP ₹500) |
| Smart Care ⭐ MOST BOOKED | സ്മാർട്ട് കെയർ | ₹999 (MRP ₹1300) |
| Pro Care 👨‍⚕️ DOCTOR REC. | പ്രോ കെയർ | ₹1549 (MRP ₹1949) |
| Elite Care 🏆 PREMIUM | എലൈറ്റ് കെയർ | ₹2549 (MRP ₹3049) |
| Women Wellness | വിമൻ വെൽനസ് | ₹1299 (MRP ₹1599) |
| Diabetes Care | ഡയബറ്റീസ് കെയർ | ₹999 (MRP ₹1299) |
| Family Basic (2–3 members) | ഫാമിലി ബേസിക് | ₹999–1499 (phone) |
| Family Smart (3–4 members) | ഫാമിലി സ്മാർട്ട് | ₹1999–2999 (phone) |
| Family Complete (4–5 members) | ഫാമിലി കംപ്ലീറ്റ് | ₹3499–4999 (phone) |

---

## Part C — Conversation prompts & messages

Every line of text the customer sees from the bot, organized by the flow step where it appears. `{name}`, `{phone}`, `{address}`, `{n}`, `{plan}` are filled in at runtime. Anything you want re-worded, mark and we'll patch both `src/services/botLogic.ts` and `src/App.tsx`.

### C-1. Welcome & language selection

**Language picker (first ever message):**
> 👋 Welcome to CareMol – Care Close to You
> Please select your language / നിങ്ങളുടെ ഭാഷ തിരഞ്ഞെടുക്കുക:

**Brand line shown after language picked:**
| English | Malayalam |
|---|---|
| Welcome to CareMol – Care Close to You | CareMol ലേക്ക് സ്വാഗതം – Care Close to You |

**Main menu header (shown above the menu buttons):**
| English | Malayalam |
|---|---|
| We provide home sample collection within 5 km of Melattur 🏠<br>How can I help you? | Melattur ചുറ്റുമുള്ള 5 km പരിധിയിൽ home sample collection ലഭ്യമാണ് 🏠<br>നിങ്ങളെ എങ്ങനെ സഹായിക്കാം? |

### C-2. Returning customer

| Field | English | Malayalam |
|---|---|---|
| Greeting | 👋 Welcome back, **{name}**! | 👋 വീണ്ടും സ്വാഗതം, **{name}**! |
| Returning header | How can I help you today? | ഇന്ന് നിങ്ങളെ എങ്ങനെ സഹായിക്കാം? |
| Interested? | Are you interested in booking a test? | ടെസ്റ്റ് ബുക്ക് ചെയ്യാൻ നിങ്ങൾക്ക് താൽപ്പര്യമുണ്ടോ? |
| Who is it for? | Who are you booking for? | ആർക്ക് വേണ്ടിയാണ് മെഡിക്കൽ ടെസ്റ്റ് ബുക്ക് ചെയ്യുന്നത്? |

### C-3. Location check

| Field | English | Malayalam |
|---|---|---|
| Ask for location | Please share your location or enter your PIN code | ലൊക്കേഷൻ അയക്കുക അല്ലെങ്കിൽ പിൻകോഡ് നൽകുക |
| Available | Service available in your area ✅ | നിങ്ങളുടെ പ്രദേശത്ത് സേവനം ലഭ്യമാണ് ✅ |
| Out of range (initial) | Currently we serve only within 5 km of Melattur | ഇപ്പോൾ Melattur ചുറ്റുമുള്ള 5 km പരിധിയിൽ മാത്രം സേവനം ലഭ്യമാണ് |
| Out of range (after retry) | Currently service is not available in this area. | നിലവിൽ ഈ പ്രദേശത്ത് സേവനം ലഭ്യമല്ല. |

> Internal note: service area is currently gated on PIN code **679326** as a literal string. Other PINs fall through to "service not available" regardless of distance.

### C-4. Patient detail entry

**Combined entry prompt (Name + Age + Phone in one message):**

| English | Malayalam |
|---|---|
| Please enter patient details:<br><br>*Format:* Name, Age, Phone Number<br>*Example:* John Doe, 32, 9876543210 | രോഗിയുടെ വിവരങ്ങൾ താഴെ പറയുന്ന രീതിയിൽ നൽകുക:<br><br>*Format:* പേര്, പ്രായം, ഫോൺ നമ്പർ<br>*Example:* സുരേഷ്, 35, 9876543210 |

**If the customer needs to re-enter field-by-field:**

| Field | English | Malayalam |
|---|---|---|
| Name | Enter patient name | രോഗിയുടെ പേര് നൽകുക |
| Age | Enter age | പ്രായം നൽകുക |
| Gender | Select gender | ലിംഗം തിരഞ്ഞെടുക്കുക |
| Phone | Enter contact number | ഫോൺ നമ്പർ നൽകുക |
| Address | Enter full address with landmark | വിലാസം (ലാൻഡ് മാർക്ക് ഉൾപ്പെടെ) നൽകുക |
| Invalid name error | That doesn't look like a valid name. Please use only letters and avoid generic greetings. | ദയവായി ശരിയായ പേര് നൽകുക. അക്ഷരങ്ങൾ മാത്രം ഉപയോഗിക്കുക. |

### C-5. Confirmation prompts (name / address / phone)

These appear after the customer enters details, so they can confirm before continuing.

| Field | English | Malayalam |
|---|---|---|
| Confirm name | Is the patient's name **{name}**? | രോഗിയുടെ പേര് **{name}** എന്നത് ശരിയാണോ? |
| Confirm address | Is this your full address?<br><br>**{address}** | ഇതാണ് നിങ്ങളുടെ പൂർണ്ണ വിലാസം എന്നത് ശരിയാണോ?<br><br>**{address}** |
| Confirm phone | Is this the correct contact number?<br><br>**{phone}** | ഈ ഫോൺ നമ്പർ ശരിയാണോ?<br><br>**{phone}** |

### C-6. Test / package selection

| Field | English | Malayalam |
|---|---|---|
| Open question | What test do you want to book? | ഏത് ടെസ്റ്റ് ആണ് ബുക്ക് ചെയ്യേണ്ടത്? |
| Package picker prompt | Select a package to view details: | വിശദാംശങ്ങൾ കാണാൻ ഒരു പാക്കേജ് തിരഞ്ഞെടുക്കുക: |
| Selected list prefix | Selected tests | തിരഞ്ഞെടുത്ത ടെസ്റ്റുകൾ |
| Validation | Please select at least one test to continue. | തുടരുന്നതിന് ദയവായി കുറഞ്ഞത് ഒരു ടെസ്റ്റ് എങ്കിലും തിരഞ്ഞെടുക്കുക. |
| Add-more prompt | Any additional tests needed? | കൂടുതൽ ടെസ്റ്റുകൾ വേണോ? |
| Family plan deflect | *{plan}* is a family plan and needs a phone consultation. Please call us to book — we'll work out the details together. | *{plan}* ഒരു ഫാമിലി പ്ലാൻ ആണ്, ബുക്കിംഗിന് ഫോൺ കൺസൾട്ടേഷൻ ആവശ്യമാണ്. ദയവായി ഞങ്ങളെ വിളിക്കുക — ഒരുമിച്ച് വിശദാംശങ്ങൾ ക്രമീകരിക്കാം. |

### C-7. Date & time

| Field | English | Malayalam |
|---|---|---|
| Choose date | Choose a date for the home visit: | സന്ദർശനത്തിന് ഒരു തീയതി തിരഞ്ഞെടുക്കുക: |
| Out-of-range date | Please choose a date within the next **{n}** days. | ദയവായി അടുത്ത **{n}** ദിവസത്തിനുള്ളിലെ തീയതി തിരഞ്ഞെടുക്കുക. |
| Choose slot | Choose preferred time: | സമയം തിരഞ്ഞെടുക്കുക: |
| Slot missing (legacy) | Time slot not set — please pick from the options. | സമയം സജ്ജമല്ല — ദയവായി ലിസ്റ്റിൽ നിന്ന് തിരഞ്ഞെടുക്കുക. |

> `{n}` defaults to **7** (today + next 6 days). Configurable via `config/booking.maxAdvanceDays` from the admin Settings tab.

### C-8. Fasting & notes

| Field | English | Malayalam |
|---|---|---|
| Fasting check | This test requires fasting for 8–12 hours. Are you prepared? | ഈ ടെസ്റ്റിന് 8–12 മണിക്കൂർ ഉപവാസം ആവശ്യമാണ്. തയ്യാറാണോ? |
| Notes prompt | Any specific instructions or notes for the phlebotomist? (Optional - type 'None' or skip) | സ്റ്റാഫിന് പ്രത്യേക നിർദ്ദേശങ്ങൾ വല്ലതും ഉണ്ടോ? (നിർബന്ധമില്ല - 'ഇല്ല' എന്ന് ടൈപ്പ് ചെയ്യുകയോ ഒഴിവാക്കുകയോ ചെയ്യാം) |

### C-9. ECG add-on

| Field | English | Malayalam |
|---|---|---|
| Ask | 💓 Would you like to add an ECG test for just ₹50? | 💓 ₹50-ന് ഒരു ECG ടെസ്റ്റ് കൂടി ചേർക്കണോ? |
| Package label (included) | 💓 ECG Included | 💓 ECG ഉൾപ്പെടുത്തിയിരിക്കുന്നു |
| Package label (add-on) | 💓 ECG add-on available (+₹50) | 💓 ECG ആഡ്-ഓൺ ലഭ്യം (+₹50) |

### C-10. Booking summary (confirm screen)

**Header:** "Confirm booking?" / "ബുക്കിംഗ് സ്ഥിരീകരിക്കണോ?"

The bot composes the summary using these labels:

| Label key | English | Malayalam |
|---|---|---|
| Tests | Tests | ടെസ്റ്റുകൾ |
| Price | Price | വില |
| Patient | Patient | രോഗി |
| Address | Address | വിലാസം |
| Date | Date | തീയതി |
| Slot | Slot | സമയം |
| Notes | Notes | കുറിപ്പുകൾ |
| "None" (when no notes) | None | ഇല്ല |

**Example summary the customer would see (English):**
> *Confirm booking?*
>
> *Tests:* Smart Care
> *Price:* ₹999
> *Patient:* John Doe, 32, Male
> *Address:* House 5, Near Mosque, Melattur, 679326
> *Date:* Sat, 17 May
> *Slot:* 8:00 AM – 9:00 AM
> *Notes:* None

**Same summary in Malayalam:**
> *ബുക്കിംഗ് സ്ഥിരീകരിക്കണോ?*
>
> *ടെസ്റ്റുകൾ:* സ്മാർട്ട് കെയർ
> *വില:* ₹999
> *രോഗി:* സുരേഷ്, 35, പുരുഷൻ
> *വിലാസം:* House 5, Near Mosque, Melattur, 679326
> *തീയതി:* ശനി, 17 മേയ്
> *സമയം:* 8:00 AM – 9:00 AM
> *കുറിപ്പുകൾ:* ഇല്ല

### C-11. Payment

| Field | English | Malayalam |
|---|---|---|
| Header | Select payment method: | പേയ്‌മെന്റ് രീതി തിരഞ്ഞെടുക്കുക: |
| Options | UPI / Cash on Collection | UPI / Cash on Collection ⚠ |

> ⚠ Payment option labels are stored in English for both languages. Confirm whether you want Malayalam translations (e.g. "കളക്ഷനിൽ പണം"); we'll patch if so.

### C-12. Cancel confirmation

| Field | English | Malayalam |
|---|---|---|
| Cancel confirm header | Are you sure you want to cancel this booking? | ഈ ബുക്കിംഗ് റദ്ദാക്കണമെന്ന് നിങ്ങൾക്ക് ഉറപ്പാണോ? |

### C-13. Booking success

| Field | English | Malayalam |
|---|---|---|
| Success | Booking Confirmed ✅ | ബുക്കിംഗ് സ്ഥിരീകരിച്ചു ✅ |
| Booking ID label | Booking ID | ബുക്കിംഗ് ഐഡി |
| Phleb arrival msg | Phlebotomist will arrive at selected time | നിശ്ചിത സമയത്ത് സ്റ്റാഫ് എത്തും |
| Report ready (sample only) | Your report is ready<br>Download: caremol.in/report/CM123 | നിങ്ങളുടെ റിപ്പോർട്ട് തയ്യാറായി<br>ഡൗൺലോഡ് ചെയ്യുക: caremol.in/report/CM123 |

> The report URL `caremol.in/report/CM123` is currently a hard-coded sample — there is no live reports portal yet. Decide whether to replace with the real URL once live, or hide this message.

### C-14. Errors

| Field | English | Malayalam |
|---|---|---|
| Patient missing | ❌ Patient details are missing. Please start the booking again. | ❌ രോഗിയുടെ വിവരങ്ങൾ ലഭ്യമല്ല. ദയവായി ബുക്കിംഗ് വീണ്ടും ആരംഭിക്കുക. |
| Save failed | ❌ Failed to save booking. Please try again later. | ❌ ബുക്കിംഗ് സേവ് ചെയ്യാൻ കഴിഞ്ഞില്ല. ദയവായി പിന്നീട് വീണ്ടും ശ്രമിക്കുക. |

### C-15. Other menu options

| Field | English | Malayalam |
|---|---|---|
| Support reply | 👨‍⚕️ Opening support channel... One of our agents will contact you shortly. | 👨‍⚕️ സപ്പോർട്ട് ചാനൽ തുറക്കുന്നു... ഞങ്ങളുടെ ഏജന്റ് ഉടൻ ബന്ധപ്പെടും. |
| Call CareMol | 📞 Tap the number below to call CareMol:<br><br>+{phone}<br><br>Or message us on WhatsApp: https://wa.me/{phone} | 📞 CareMol-ന് വിളിക്കാൻ താഴെയുള്ള നമ്പറിൽ ടാപ്പ് ചെയ്യുക:<br><br>+{phone}<br><br>അല്ലെങ്കിൽ വാട്സാപ്പിൽ സന്ദേശം അയക്കുക: https://wa.me/{phone} |
| Medicine coming soon | 💊 Medicine Delivery will be available soon. Stay tuned for updates from CareMol. | 💊 മരുന്ന് ഡെലിവറി ഉടൻ ലഭ്യമാകും. CareMol-ൽ നിന്നുള്ള അപ്ഡേറ്റുകൾക്കായി കാത്തിരിക്കുക. |
| FAQ header | ❓ Frequently Asked Questions<br><br>Pick a topic: | ❓ പതിവ് ചോദ്യങ്ങൾ<br><br>ഒരു വിഷയം തിരഞ്ഞെടുക്കുക: |
| End chat | Chat session ended. Type anything to start again. | ചാറ്റ് അവസാനിച്ചു. വീണ്ടും തുടങ്ങാൻ സന്ദേശം അയക്കുക. |

### C-16. Reusable price / pickup phrases (used inside package cards)

| Field | English | Malayalam |
|---|---|---|
| Savings prefix | Save ₹{amount} | ₹{amount} ലാഭിക്കുക |
| Home pickup | 🏠 {n} months home pickup | 🏠 {n} മാസം ഹോം പിക്കപ്പ് |
| Package "Included tests" | Included tests: {details} | ഉൾപ്പെടുത്തിയിരിക്കുന്ന ടെസ്റ്റുകൾ: {details} |

---

## Part D — Health package full details

Tests are stored in English clinical terms (used in both languages). Tagline + name are localized. Prices and MRPs are identical across languages.

### Individual packages

#### 🩺 Basic Health / ബേസിക് ഹെൽത്ത്

| Field | Value |
|---|---|
| Tagline (EN) | 10–15 Tests · Routine Essential |
| Tagline (ML) | 10–15 ടെസ്റ്റുകൾ · റൂട്ടീൻ എസെൻഷ്യൽ |
| Price | **₹299** (MRP ₹500 → save ₹201) |
| ECG | Add-on available (+₹50) |
| Home pickup | 2 months |
| Badge | — |
| Included tests | Blood Sugar (Fasting), Lipid Profile, BP · Weight · BMI |

#### 🩺 Smart Care / സ്മാർട്ട് കെയർ ⭐ MOST BOOKED

| Field | Value |
|---|---|
| Tagline (EN) | 20–30 Tests · Active Lifestyle |
| Tagline (ML) | 20–30 ടെസ്റ്റുകൾ · ആക്ടീവ് ലൈഫ്സ്റ്റൈൽ |
| Price | **₹999** (MRP ₹1300 → save ₹301) |
| ECG | Add-on available (+₹50) |
| Home pickup | 2 months |
| Badge | ⭐ MOST BOOKED / ⭐ ഏറ്റവും കൂടുതൽ ബുക്ക് ചെയ്തത് |
| Included tests | Blood Sugar (Fasting), HbA1c, Lipid Profile, CBC, Creatinine (KFT), SGPT (Liver Fn.), Physique Check |

#### 🩺 Pro Care / പ്രോ കെയർ 👨‍⚕️ DOCTOR REC.

| Field | Value |
|---|---|
| Tagline (EN) | 40–50 Tests · Preventive Screening |
| Tagline (ML) | 40–50 ടെസ്റ്റുകൾ · പ്രിവൻ്റീവ് സ്ക്രീനിംഗ് |
| Price | **₹1549** (MRP ₹1949 → save ₹400) |
| ECG | **Included** |
| Home pickup | 3 months |
| Badge | 👨‍⚕️ DOCTOR REC. / 👨‍⚕️ ഡോക്ടർ ശുപാർശ |
| Included tests | CBC + ESR, Thyroid (TSH), Liver & Kidney Function, Blood Sugar + HbA1c, Urine Routine, Physique Check |

#### 🩺 Elite Care / എലൈറ്റ് കെയർ 🏆 PREMIUM

| Field | Value |
|---|---|
| Tagline (EN) | 60+ Tests · Max Protection |
| Tagline (ML) | 60+ ടെസ്റ്റുകൾ · പരമാവധി സംരക്ഷണം |
| Price | **₹2549** (MRP ₹3049 → save ₹500) |
| ECG | **Included** |
| Home pickup | 6 months |
| Badge | 🏆 PREMIUM / 🏆 പ്രീമിയം |
| Included tests | All Pro Care tests + Thyroid Full Panel (TFT), Vitamin D · Calcium, Electrolytes |

### Special packages

#### 🌸 Women Wellness / വിമൻ വെൽനസ്

| Field | Value |
|---|---|
| Tagline (EN) | Hormones · Energy · Deficiencies |
| Tagline (ML) | ഹോർമോണുകൾ · എനർജി · കുറവുകൾ |
| Price | **₹1299** (MRP ₹1599 → save ₹300) |
| ECG | Add-on available (+₹50) |
| Home pickup | 2 months |
| Included tests | CBC, Thyroid (T3, T4, TSH), Vitamin D · Calcium, Urine Routine, Physique Check |

#### 🍬 Diabetes Care / ഡയബറ്റീസ് കെയർ

| Field | Value |
|---|---|
| Tagline (EN) | Monitor & Manage Sugar Levels |
| Tagline (ML) | ഷുഗർ ലെവൽ നിരീക്ഷിക്കുക & കൈകാര്യം ചെയ്യുക |
| Price | **₹999** (MRP ₹1299 → save ₹300) |
| ECG | Add-on available (+₹50) |
| Home pickup | 2 months |
| Included tests | Blood Sugar (F+PP), HbA1c, Lipid Profile, KFT, Urine Microalbumin, Physique Check |

### Family plans (phone consultation — not bookable in chat)

#### 👨‍👩‍👧 Family Basic / ഫാമിലി ബേസിക്

| Field | Value |
|---|---|
| Tagline (EN) | 2–3 members · Basic Health |
| Tagline (ML) | 2–3 അംഗങ്ങൾ · ബേസിക് ഹെൽത്ത് |
| Price range | ₹999 – ₹1499 |
| Includes | Basic Health package for every family member |

#### 👨‍👩‍👧‍👦 Family Smart / ഫാമിലി സ്മാർട്ട്

| Field | Value |
|---|---|
| Tagline (EN) | 3–4 members · Smart Care |
| Tagline (ML) | 3–4 അംഗങ്ങൾ · സ്മാർട്ട് കെയർ |
| Price range | ₹1999 – ₹2999 |
| Includes | Smart Care package for every family member |

#### 👨‍👩‍👧‍👦 Family Complete / ഫാമിലി കംപ്ലീറ്റ്

| Field | Value |
|---|---|
| Tagline (EN) | 4–5 members · Pro Care / Mixed |
| Tagline (ML) | 4–5 അംഗങ്ങൾ · പ്രോ കെയർ / Mixed |
| Price range | ₹3499 – ₹4999 |
| Includes | Pro Care or mixed packages for every family member |

### Example: how a package card looks in chat

When a customer taps "Smart Care" on the package list, the bot sends:

**English:**
> *Smart Care*
> 20–30 Tests · Active Lifestyle
> ⭐ MOST BOOKED
>
> Included tests: Blood Sugar (Fasting), HbA1c, Lipid Profile, CBC, Creatinine (KFT), SGPT (Liver Fn.), Physique Check
>
> ~₹1300~  *₹999*  (Save ₹301)
> 💓 ECG add-on available (+₹50)
> 🏠 2 months home pickup

**Malayalam:**
> *സ്മാർട്ട് കെയർ*
> 20–30 ടെസ്റ്റുകൾ · ആക്ടീവ് ലൈഫ്സ്റ്റൈൽ
> ⭐ ഏറ്റവും കൂടുതൽ ബുക്ക് ചെയ്തത്
>
> ഉൾപ്പെടുത്തിയിരിക്കുന്ന ടെസ്റ്റുകൾ: Blood Sugar (Fasting), HbA1c, Lipid Profile, CBC, Creatinine (KFT), SGPT (Liver Fn.), Physique Check
>
> ~₹1300~  *₹999*  (₹301 ലാഭിക്കുക)
> 💓 ECG ആഡ്-ഓൺ ലഭ്യം (+₹50)
> 🏠 2 മാസം ഹോം പിക്കപ്പ്

> Note: Test names (Blood Sugar, HbA1c, CBC, etc.) currently stay in English even on the Malayalam side — these are clinical terms used the same way in lab requisitions. If you want them transliterated to Malayalam for customers, let us know and we'll add a Malayalam test-names dictionary.
