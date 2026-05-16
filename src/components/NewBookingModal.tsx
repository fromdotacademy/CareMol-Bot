// Manual-booking modal opened from the admin and phleb dashboards.
//
// Captures every field the WhatsApp flow captures plus admin-only extras
// (free-form `customTests`, language pick, optional "Assign to me" for phleb).
// Writes the booking via the web SDK (same path as the simulator) and then
// asks the server to send the WhatsApp confirmation receipt.

import React, { useEffect, useMemo, useState } from "react";
import { Plus, X, CheckCircle2, Printer, AlertTriangle, Search } from "lucide-react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import {
  PACKAGES,
  TRANSLATIONS,
  computeBookingTotal,
  computeCustomTestsTotal,
  eligibleForEcgAddon,
  getPackagePrice,
  ECG_ADDON_PRICE,
  type PackageInfo,
} from "../constants";
import type {
  Booking,
  BookingConfig,
  CustomTest,
  Language,
  PatientProfile,
} from "../types";
import { generateId, cn } from "../lib/utils";
import { upsertPatientWeb, listPatientsForUser, findOrCreatePatient } from "../services/patientService";
import {
  defaultBookingConfig,
  formatDateLabel,
  formatSlotLabel,
  getNextNDates,
} from "../services/slotService";
import { isPinInServiceArea, toServiceAreaConfig } from "../services/serviceAreaService";

type Gender = "Male" | "Female" | "Other";

interface NewBookingModalProps {
  /** Resolved role of the staff currently signed in — controls phleb-only UI bits. */
  staffRole: "admin" | "phlebotomist";
  /** Display name for the signed-in staff (used when "Assign to me" is checked). */
  staffName: string;
  onClose: () => void;
}

interface SuccessState {
  bookingId: string;
  notifySent: boolean;
  notifyReason?: string;
  payload: Booking;
}

export function NewBookingModal({ staffRole, staffName, onClose }: NewBookingModalProps) {
  // ─── Patient identity ───
  const [phone, setPhone] = useState("");
  const [existingPatients, setExistingPatients] = useState<PatientProfile[]>([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState<number | "">("");
  const [patientGender, setPatientGender] = useState<Gender>("Male");
  const [patientAddress, setPatientAddress] = useState("");

  // ─── Tests & pricing ───
  const [selectedPackages, setSelectedPackages] = useState<string[]>([]);
  const [customTests, setCustomTests] = useState<CustomTest[]>([]);
  const [ecgAddon, setEcgAddon] = useState(false);

  // ─── Schedule ───
  const [bookingConfig, setBookingConfig] = useState<BookingConfig | null>(null);
  const [bookingDate, setBookingDate] = useState<string>("");
  const [slotStart, setSlotStart] = useState<string>("");

  // ─── Misc ───
  const [isFastingConfirmed, setIsFastingConfirmed] = useState(false);
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"UPI" | "Cash">("Cash");
  const [language, setLanguage] = useState<Language>("en");
  const [assignToMe, setAssignToMe] = useState(false);

  // ─── Submission state ───
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  // Load booking config (slot template + maxAdvanceDays) on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "config", "booking"));
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data() as Partial<BookingConfig>;
          setBookingConfig({ ...defaultBookingConfig(), ...data });
        } else {
          setBookingConfig(defaultBookingConfig());
        }
      } catch {
        if (!cancelled) setBookingConfig(defaultBookingConfig());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Default to today once config is loaded.
  useEffect(() => {
    if (bookingConfig && !bookingDate) {
      setBookingDate(getNextNDates(1)[0]);
    }
  }, [bookingConfig, bookingDate]);

  // Look up existing user + patient profiles when phone is 10–15 digits.
  useEffect(() => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      setExistingPatients([]);
      setSelectedPatientId(null);
      return;
    }
    let cancelled = false;
    setLookupBusy(true);
    const handle = setTimeout(async () => {
      try {
        const profiles = await listPatientsForUser(digits);
        if (!cancelled) setExistingPatients(profiles);
      } catch {
        if (!cancelled) setExistingPatients([]);
      } finally {
        if (!cancelled) setLookupBusy(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [phone]);

  const dateOptions = useMemo(() => {
    if (!bookingConfig) return [];
    return getNextNDates(Math.max(1, bookingConfig.maxAdvanceDays || 7));
  }, [bookingConfig]);

  const slotOptions = useMemo(() => bookingConfig?.slots ?? [], [bookingConfig]);

  const total = useMemo(
    () => computeBookingTotal(selectedPackages, customTests, ecgAddon),
    [selectedPackages, customTests, ecgAddon]
  );
  const packagesSubtotal = useMemo(
    () => selectedPackages.reduce((s, n) => s + getPackagePrice(n), 0),
    [selectedPackages]
  );
  const customSubtotal = useMemo(() => computeCustomTestsTotal(customTests), [customTests]);

  // Soft-warn if the typed address does not contain any of the configured
  // service-area PINs. The booking can still go through — admins may know the
  // customer is in-area despite an unusual address line.
  const addressPinWarning = useMemo(() => {
    if (!patientAddress) return false;
    const cfg = toServiceAreaConfig(bookingConfig || defaultBookingConfig());
    return !isPinInServiceArea(patientAddress, cfg);
  }, [patientAddress, bookingConfig]);
  const servicePinsList = (bookingConfig?.servicePins?.length ? bookingConfig.servicePins : ["679326"]).join(", ");

  const canSubmit =
    !!phone.replace(/\D/g, "").length &&
    !!patientName.trim() &&
    typeof patientAge === "number" &&
    patientAge > 0 &&
    !!patientAddress.trim() &&
    (selectedPackages.length > 0 || customTests.some((c) => c.name.trim() && Number(c.price) > 0)) &&
    !!bookingDate &&
    !!slotStart &&
    !submitting;

  // ─── Handlers ───

  const selectExisting = (p: PatientProfile) => {
    setSelectedPatientId(p.id);
    setPatientName(p.name || "");
    setPatientAge(typeof p.age === "number" ? p.age : "");
    setPatientGender((p.gender as Gender) || "Male");
    if (p.address) setPatientAddress(p.address);
  };

  const startNewPatient = () => {
    setSelectedPatientId(null);
    setPatientName("");
    setPatientAge("");
    setPatientGender("Male");
    setPatientAddress("");
  };

  const togglePackage = (pkg: PackageInfo) => {
    if (pkg.category === "family") {
      // Family plans aren't entered into testNames. They prefill a custom row instead.
      const midpoint = pkg.priceRange
        ? Math.round((pkg.priceRange[0] + pkg.priceRange[1]) / 2)
        : 0;
      setCustomTests((prev) => [
        ...prev,
        { name: `${pkg.name_en} (${pkg.members ?? "family"} members)`, price: midpoint },
      ]);
      return;
    }
    setSelectedPackages((prev) =>
      prev.includes(pkg.name_en) ? prev.filter((n) => n !== pkg.name_en) : [...prev, pkg.name_en]
    );
  };

  // Clear ECG add-on if no eligible package is selected.
  useEffect(() => {
    if (!eligibleForEcgAddon(selectedPackages)) {
      setEcgAddon(false);
    }
  }, [selectedPackages]);

  const addCustomItem = () => setCustomTests((prev) => [...prev, { name: "", price: 0 }]);
  const updateCustomItem = (idx: number, field: "name" | "price", value: string) => {
    setCustomTests((prev) =>
      prev.map((item, i) =>
        i === idx
          ? { ...item, [field]: field === "price" ? Number(value) || 0 : value }
          : item
      )
    );
  };
  const removeCustomItem = (idx: number) => {
    setCustomTests((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const me = auth.currentUser;
      if (!me) throw new Error("Not signed in.");
      const digits = phone.replace(/\D/g, "");

      // 1. Upsert patient profile (preserves the patientId invariant).
      //    Note: users/{phone} is intentionally not touched from the client —
      //    rules only permit owners to write their own user doc. The notify
      //    endpoint (Admin SDK) merges users/{phone} server-side.
      //    Firestore web SDK rejects undefined values, so optional fields are
      //    conditionally included instead of set to undefined.
      const trimmedAddress = patientAddress.trim();
      const trimmedName = patientName.trim();
      const patientFields: Record<string, unknown> = {
        name: trimmedName,
        age: Number(patientAge),
        gender: patientGender,
        phone: digits,
      };
      if (trimmedAddress) patientFields.address = trimmedAddress;
      // Explicit pick from the returning-customer list always wins. Otherwise
      // dedup by normalized name so retries / re-typed details don't fork the
      // profile.
      const patientId = selectedPatientId
        ? await upsertPatientWeb(digits, patientFields as any, selectedPatientId)
        : await findOrCreatePatient(digits, patientFields as any);

      const bookingId = generateId();
      const selectedSlot = slotOptions.find((s) => s.start === slotStart);
      const cleanCustom = customTests
        .map((c) => ({ name: c.name.trim(), price: Number(c.price) || 0 }))
        .filter((c) => c.name && c.price > 0);
      const trimmedNotes = notes.trim();

      const payload: Record<string, unknown> = {
        bookingId,
        patientId,
        userId: digits,
        patientName: patientName.trim(),
        patientAge: Number(patientAge),
        patientGender,
        patientPhone: digits,
        patientAddress: trimmedAddress,
        testNames: selectedPackages,
        customTests: cleanCustom,
        ecgAddon,
        timeSlot: selectedSlot ? formatSlotLabel(selectedSlot, language) : slotStart,
        bookingDate,
        slotStart,
        slotEnd: selectedSlot?.end || "",
        status: "Created",
        price: computeBookingTotal(selectedPackages, cleanCustom, ecgAddon),
        paymentMethod,
        isFastingConfirmed,
        createdAt: new Date().toISOString(),
        language,
        bookingSource: "manual",
        createdBy: me.uid,
      };
      if (trimmedNotes) payload.notes = trimmedNotes;
      if (assignToMe && staffRole === "phlebotomist") {
        payload.assignedTo = me.uid;
        payload.assignedToName = staffName;
      }

      // 3. Write booking through the web SDK (Firestore rules guard the create).
      await setDoc(doc(db, "bookings", bookingId), payload);

      // 4. Trigger the WhatsApp confirmation via the server (Admin SDK + WhatsApp Cloud API).
      let notifySent = false;
      let notifyReason: string | undefined;
      try {
        const idToken = await me.getIdToken();
        const resp = await fetch(`/api/bookings/${bookingId}/notify`, {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const json = await resp.json().catch(() => ({}));
        notifySent = !!json.sent;
        notifyReason = json.reason || (resp.ok ? undefined : `http-${resp.status}`);
      } catch (e: any) {
        notifyReason = e?.message || "notify-failed";
      }

      setSuccess({ bookingId, notifySent, notifyReason, payload: payload as unknown as Booking });
    } catch (e: any) {
      console.error("[NewBookingModal] submit failed", e);
      setSubmitError(e?.message || "Failed to create booking.");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Rendering ───

  if (success) {
    return <SuccessView success={success} onClose={onClose} />;
  }

  return (
    <div className="fixed inset-0 bg-[var(--color-overlay)] backdrop-blur-[2px] z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="bg-[var(--color-surface)] rounded-t-[var(--radius-xl-2)] sm:rounded-[var(--radius-lg)] border-t sm:border border-[var(--color-border-subtle)] shadow-[var(--shadow-lg)] sm:max-w-2xl w-full max-h-[94vh] sm:max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex sm:hidden justify-center pt-2.5 pb-1" aria-hidden>
          <span className="h-1 w-9 rounded-full bg-[var(--color-border-strong)]" />
        </div>
        <header className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[16px] font-semibold tracking-tight text-[var(--color-text-primary)]">New Booking</h3>
            <p className="text-[12.5px] text-[var(--color-text-secondary)]">
              Manual booking — customer will receive a WhatsApp confirmation
            </p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-dark">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-5 space-y-6">
          {/* Phone + existing patient lookup */}
          <Section title="Customer phone">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 flex-1 border border-border-subtle rounded-lg px-3 py-2 focus-within:ring-2 ring-primary/20">
                <Search className="w-4 h-4 text-text-muted" />
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="919876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="bg-transparent outline-none flex-1 text-sm text-text-dark"
                />
              </div>
              {lookupBusy && <span className="text-[10px] text-text-muted">looking up…</span>}
            </div>
            {existingPatients.length > 0 && (
              <div className="mt-3 border border-border-subtle rounded-lg overflow-hidden">
                <div className="bg-[var(--color-sunken)] px-3 py-2 text-[10.5px] font-medium uppercase tracking-[0.06em] text-[var(--color-text-secondary)]">
                  Returning customer — pick a saved patient or add new
                </div>
                <div className="divide-y divide-border-subtle">
                  {existingPatients.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => selectExisting(p)}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-sunken)] flex items-center justify-between",
                        selectedPatientId === p.id && "bg-primary/5"
                      )}
                    >
                      <span>
                        <span className="font-bold text-text-dark">{p.name}</span>
                        <span className="text-text-muted"> · {p.age} · {p.gender}</span>
                      </span>
                      {selectedPatientId === p.id && (
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                      )}
                    </button>
                  ))}
                  <button
                    onClick={startNewPatient}
                    className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-[var(--color-sunken)]"
                  >
                    + Add new patient instead
                  </button>
                </div>
              </div>
            )}
          </Section>

          {/* Patient form */}
          <Section title="Patient details">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Name">
                <input
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  className="w-full border border-border-subtle rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-primary/20"
                />
              </Field>
              <Field label="Age">
                <input
                  type="number"
                  value={patientAge}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPatientAge(v === "" ? "" : Math.max(0, Number(v)));
                  }}
                  className="w-full border border-border-subtle rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-primary/20"
                />
              </Field>
              <Field label="Gender">
                <div className="flex gap-2">
                  {(["Male", "Female", "Other"] as Gender[]).map((g) => (
                    <button
                      key={g}
                      onClick={() => setPatientGender(g)}
                      className={cn(
                        "flex-1 px-3 py-2 rounded-lg text-xs font-bold border",
                        patientGender === g
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border-subtle text-text-muted hover:bg-[var(--color-sunken)]"
                      )}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Language">
                <div className="flex gap-2">
                  {(["en", "ml"] as Language[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => setLanguage(l)}
                      className={cn(
                        "flex-1 px-3 py-2 rounded-lg text-xs font-bold border",
                        language === l
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border-subtle text-text-muted hover:bg-[var(--color-sunken)]"
                      )}
                    >
                      {l === "en" ? "English" : "മലയാളം"}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            <Field label="Address (include PIN code)">
              <textarea
                value={patientAddress}
                onChange={(e) => setPatientAddress(e.target.value)}
                rows={2}
                className="w-full border border-border-subtle rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-primary/20"
              />
            </Field>
            {addressPinWarning && (
              <div className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  Address may be outside the Melattur service area (PIN{servicePinsList.includes(",") ? "s" : ""} {servicePinsList}). Confirm with the
                  customer before booking — you can still proceed.
                </span>
              </div>
            )}
          </Section>

          {/* Packages */}
          <Section title="Health packages">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {PACKAGES.filter((p) => p.category !== "family").map((pkg) => {
                const on = selectedPackages.includes(pkg.name_en);
                return (
                  <button
                    key={pkg.id}
                    onClick={() => togglePackage(pkg)}
                    className={cn(
                      "text-left px-3 py-2 rounded-lg border transition",
                      on ? "border-primary bg-primary/5" : "border-border-subtle hover:bg-[var(--color-sunken)]"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-text-dark">{pkg.name_en}</span>
                      <span className="font-black text-sm">₹{pkg.price}</span>
                    </div>
                    <div className="text-[10px] text-text-muted truncate">{pkg.tagline_en}</div>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 pt-3 border-t border-border-subtle">
              <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">
                Family plans (adds an editable custom item)
              </div>
              <div className="flex flex-wrap gap-2">
                {PACKAGES.filter((p) => p.category === "family").map((pkg) => (
                  <button
                    key={pkg.id}
                    onClick={() => togglePackage(pkg)}
                    className="px-3 py-1.5 rounded-lg border border-border-subtle text-xs hover:bg-[var(--color-sunken)]"
                  >
                    + {pkg.name_en} (₹{pkg.priceRange?.[0]}–{pkg.priceRange?.[1]})
                  </button>
                ))}
              </div>
            </div>

            {eligibleForEcgAddon(selectedPackages) && (
              <label className="mt-3 flex items-center gap-2 text-sm text-text-dark cursor-pointer">
                <input
                  type="checkbox"
                  checked={ecgAddon}
                  onChange={(e) => setEcgAddon(e.target.checked)}
                />
                Add ECG (+₹{ECG_ADDON_PRICE})
              </label>
            )}
          </Section>

          {/* Custom items */}
          <Section title="Custom test items (individual tests / discounts / overrides)">
            <div className="space-y-2">
              {customTests.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    placeholder="Test name (e.g. Vitamin D3)"
                    value={c.name}
                    onChange={(e) => updateCustomItem(i, "name", e.target.value)}
                    className="flex-1 border border-border-subtle rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-primary/20"
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-text-muted text-sm">₹</span>
                    <input
                      type="number"
                      min={0}
                      value={c.price || ""}
                      onChange={(e) => updateCustomItem(i, "price", e.target.value)}
                      className="w-24 border border-border-subtle rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 ring-primary/20"
                    />
                  </div>
                  <button
                    onClick={() => removeCustomItem(i)}
                    className="text-text-muted hover:text-red-500"
                    title="Remove"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={addCustomItem}
                className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add custom item
              </button>
            </div>
          </Section>

          {/* Total preview */}
          <div className="bg-[var(--color-sunken)] border border-[var(--color-border-subtle)] rounded-lg p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-text-muted">Packages</span>
              <span>₹{packagesSubtotal}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Custom items</span>
              <span>₹{customSubtotal}</span>
            </div>
            {ecgAddon && (
              <div className="flex justify-between">
                <span className="text-text-muted">ECG add-on</span>
                <span>₹{ECG_ADDON_PRICE}</span>
              </div>
            )}
            <div className="flex justify-between font-black text-text-dark border-t border-border-subtle mt-2 pt-2">
              <span>Total</span>
              <span>₹{total}</span>
            </div>
          </div>

          {/* Schedule */}
          <Section title="Visit date">
            <div className="flex flex-wrap gap-2">
              {dateOptions.map((d) => (
                <button
                  key={d}
                  onClick={() => setBookingDate(d)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold border",
                    bookingDate === d
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border-subtle text-text-muted hover:bg-[var(--color-sunken)]"
                  )}
                >
                  {formatDateLabel(d, language)}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Visit slot">
            <div className="flex flex-wrap gap-2">
              {slotOptions.map((s) => (
                <button
                  key={s.start}
                  onClick={() => setSlotStart(s.start)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold border",
                    slotStart === s.start
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border-subtle text-text-muted hover:bg-[var(--color-sunken)]"
                  )}
                >
                  {formatSlotLabel(s, language)}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Fasting & notes">
            <label className="flex items-center gap-2 text-sm text-text-dark cursor-pointer">
              <input
                type="checkbox"
                checked={isFastingConfirmed}
                onChange={(e) => setIsFastingConfirmed(e.target.checked)}
              />
              Customer is prepared to fast (required for some tests)
            </label>
            <Field label="Notes (optional)">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full border border-border-subtle rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-primary/20"
              />
            </Field>
          </Section>

          <Section title="Payment & assignment">
            <Field label="Payment method">
              <div className="flex gap-2">
                {(["UPI", "Cash"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setPaymentMethod(m)}
                    className={cn(
                      "flex-1 px-3 py-2 rounded-lg text-xs font-bold border",
                      paymentMethod === m
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border-subtle text-text-muted hover:bg-[var(--color-sunken)]"
                    )}
                  >
                    {m === "Cash" ? "Cash on Collection" : "UPI"}
                  </button>
                ))}
              </div>
            </Field>
            {staffRole === "phlebotomist" && (
              <label className="flex items-center gap-2 text-sm text-text-dark cursor-pointer mt-2">
                <input
                  type="checkbox"
                  checked={assignToMe}
                  onChange={(e) => setAssignToMe(e.target.checked)}
                />
                Assign this booking to me
              </label>
            )}
          </Section>

          {submitError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{submitError}</span>
            </div>
          )}
        </div>

        <footer className="p-5 border-t border-border-subtle flex items-center justify-between">
          <div className="text-sm">
            <span className="text-text-muted">Total: </span>
            <span className="font-black text-text-dark">₹{total}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-text-muted hover:text-text-dark"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={cn(
                "px-5 py-2 text-[11px] font-bold uppercase tracking-wider rounded-lg text-white",
                canSubmit ? "bg-primary hover:opacity-90" : "bg-slate-300 cursor-not-allowed"
              )}
            >
              {submitting ? "Saving…" : "Create booking"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-2">
        {title}
      </h4>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1 block">
        {label}
      </span>
      {children}
    </label>
  );
}

function SuccessView({
  success,
  onClose,
}: {
  success: SuccessState;
  onClose: () => void;
}) {
  const b = success.payload;
  const t = TRANSLATIONS[b.language || "en"];
  const sl = t.summaryLabels;
  const customLine = (b.customTests ?? [])
    .map((c) => `${c.name} — ₹${c.price}`)
    .join(", ");

  return (
    <div className="fixed inset-0 bg-[var(--color-overlay)] backdrop-blur-[2px] z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="bg-[var(--color-surface)] rounded-t-[var(--radius-xl-2)] sm:rounded-[var(--radius-lg)] border-t sm:border border-[var(--color-border-subtle)] shadow-[var(--shadow-lg)] sm:max-w-lg w-full max-h-[94vh] sm:max-h-[90vh] flex flex-col overflow-hidden print:shadow-none">
        <div className="flex sm:hidden justify-center pt-2.5 pb-1" aria-hidden>
          <span className="h-1 w-9 rounded-full bg-[var(--color-border-strong)]" />
        </div>
        <header className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-[var(--color-status-completed)]" />
            <h3 className="text-[16px] font-semibold tracking-tight text-[var(--color-text-primary)]">Booking confirmed</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-sunken)] transition-colors print:hidden" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-5 space-y-3 text-sm">
          <Row label="Booking ID" value={b.bookingId} />
          <Row label={sl.patient} value={`${b.patientName} (${b.patientAge}, ${b.patientGender})`} />
          <Row label={sl.tests} value={b.testNames.join(", ") || "—"} />
          {customLine && <Row label={sl.additionalItems} value={customLine} />}
          {b.ecgAddon && <Row label="ECG add-on" value={`+₹${ECG_ADDON_PRICE}`} />}
          <Row label={sl.price} value={`₹${b.price}`} bold />
          <Row label={sl.address} value={b.patientAddress} />
          <Row
            label={sl.date}
            value={b.bookingDate ? formatDateLabel(b.bookingDate, b.language || "en") : "—"}
          />
          <Row label={sl.slot} value={b.timeSlot || "—"} />
          <Row
            label={sl.fasting}
            value={b.isFastingConfirmed ? t.fastingYesLabel : t.fastingNoLabel}
          />
          {b.notes && <Row label={sl.notes} value={b.notes} />}
          <Row label={sl.payment} value={b.paymentMethod} />

          <div
            className={cn(
              "mt-3 rounded-lg px-3 py-2 text-xs",
              success.notifySent
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-amber-50 text-amber-800 border border-amber-200"
            )}
          >
            {success.notifySent
              ? `Confirmation sent to +${b.patientPhone} via WhatsApp.`
              : `WhatsApp confirmation did not send${success.notifyReason ? ` (${success.notifyReason})` : ""}. Please confirm verbally.`}
          </div>
        </div>

        <footer className="p-5 border-t border-border-subtle flex items-center justify-end gap-2 print:hidden">
          <button
            onClick={() => window.print()}
            className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-text-muted hover:text-text-dark flex items-center gap-1"
          >
            <Printer className="w-3 h-3" /> Print
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-primary text-white text-[11px] font-bold uppercase tracking-wider rounded-lg hover:opacity-90"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted flex-shrink-0 w-28">
        {label}
      </span>
      <span className={cn("text-right", bold ? "font-black text-text-dark" : "text-text-dark")}>
        {value}
      </span>
    </div>
  );
}
