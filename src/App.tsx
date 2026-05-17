import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Phone,
  LayoutDashboard,
  MessageSquare,
  Search,
  Plus,
  CheckCircle,
  Clock,
  User,
  MapPin,
  MoreVertical,
  LogOut,
  Send,
  MoreHorizontal,
  ChevronRight,
  Database,
  Calendar,
  Layers,
  Activity,
  ChevronDown,
  Filter,
  RefreshCw,
  X,
  Languages,
  LogIn,
  AlertTriangle,
  FileUp,
  Bell,
  TrendingUp,
  Users,
  CheckCircle2,
  Settings,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { isCoordInServiceArea, isPinInServiceArea, toServiceAreaConfig } from './services/serviceAreaService';
import { db, auth } from './lib/firebase';
import {
  collection,
  collectionGroup,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  updateDoc,
  doc,
  setDoc,
  getDoc,
  getDocs,
  where,
  serverTimestamp,
  getDocFromServer,
  deleteDoc
} from 'firebase/firestore';
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updatePassword,
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { HARDCODED_ADMIN_EMAILS } from './lib/adminEmails';
import {
  TRANSLATIONS,
  PACKAGES,
  computeBookingPrice,
  computeBookingTotal,
  getPackageByName,
  getPackagePrice,
  isFamilyPlan,
  eligibleForEcgAddon,
  browserPackagesList,
  cartPackagesList,
  formatPackageDetail,
} from './constants';
import { Booking, BookingStatus, CustomTest, Language, ChatStep, PatientProfile, Staff, StaffRole, BookingConfig, PhlebAvailability, WeeklySchedule, SlotConfig } from './types';
import { buildBookingConfirmation } from './services/confirmationMessage';
import { upsertPatientWeb } from './services/patientService';
import { NewBookingModal } from './components/NewBookingModal';
import { generateId, cn } from './lib/utils';
import { format } from 'date-fns';
import {
  defaultBookingConfig,
  rememberBookingConfig,
  invalidateBookingConfigCache,
  effectiveSlotsFromDocs,
  formatSlotLabel,
  formatDateLabel,
  weekdayKey,
  phlebAvailabilityDocId,
  getNextNDates,
  getISTToday,
  slotsForDate,
  filterBookableSlots,
  bookableDates,
} from './services/slotService';

import { useStaffRole } from './hooks/useStaffRole';
import { useBookingConfig } from './hooks/useBookingConfig';
import { useOwnStaff } from './hooks/useOwnStaff';
import { StatCard as UiStatCard } from './ui/StatCard';

// --- Firestore Error Handling ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- ERROR BOUNDARY ---

export function ErrorFallback({ error }: { error: Error }) {
  let details: FirestoreErrorInfo | null = null;
  try {
    details = JSON.parse(error.message);
  } catch (e) {
    // Not a FirestoreErrorInfo
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-red-100 p-8 text-center">
        <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h1>
        <p className="text-slate-500 mb-6 text-sm">
          {details ? `Database Error: ${details.operationType} on ${details.path}` : error.message}
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="w-full bg-primary text-white py-3 rounded-xl font-bold hover:opacity-90 transition-opacity"
        >
          Reload Application
        </button>
      </div>
    </div>
  );
}

// --- MOBILE LIST CARD ---
// Shared primitive for mobile-friendly list views (admin Bookings / Staff /
// Schedule). Keeps padding, border, radius consistent across the three callsites.
// Desktop keeps the existing tables — the mobile cards live under `sm:hidden`
// while tables stay behind `hidden sm:block`.
function MobileListCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-[var(--radius-lg)] p-4 space-y-3 shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

// --- DASHBOARD VIEW ---

export type AdminTab = 'bookings' | 'patients' | 'staff' | 'schedule' | 'settings';

export function DashboardView({ tab: tabProp, onTabChange, onError }: { tab?: AdminTab; onTabChange?: (t: AdminTab) => void; onError: (err: Error) => void }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [patients, setPatients] = useState<PatientProfile[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [phlebAvailMap, setPhlebAvailMap] = useState<Record<string, PhlebAvailability>>({});
  const [filter, setFilter] = useState<BookingStatus | 'All'>('All');
  const [dateFilter, setDateFilter] = useState<'upcoming' | 'all'>('upcoming');
  const [searchTerm, setSearchTerm] = useState('');
  const [internalTab, setInternalTab] = useState<AdminTab>(tabProp ?? 'bookings');
  const tab: AdminTab = tabProp ?? internalTab;
  const setTab = (next: AdminTab) => {
    if (onTabChange) onTabChange(next);
    else setInternalTab(next);
  };
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [overrideForBooking, setOverrideForBooking] = useState<Set<string>>(new Set());
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const config = useBookingConfig();

  useEffect(() => {
    const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), bookingId: doc.id } as Booking));
      setBookings(data);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'bookings');
      } catch (e: any) {
        onError(e);
      }
    });
  }, [onError]);

  useEffect(() => {
    // Collection-group query: admin can read any patient under any userId
    // (the firestore rule grants admins access to /users/{*}/patients/{*}).
    const q = query(collectionGroup(db, 'patients'));
    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => d.data() as PatientProfile);
      setPatients(data);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'patients');
      } catch (e: any) {
        onError(e);
      }
    });
  }, [onError]);

  useEffect(() => {
    const qStaff = query(collection(db, 'staff'));
    return onSnapshot(qStaff, (snapshot) => {
      const data = snapshot.docs.map(d => ({ ...(d.data() as Staff), uid: d.id }));
      setStaff(data);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'staff');
      } catch (e: any) {
        onError(e);
      }
    });
  }, [onError]);

  // Snapshot of all per-date phleb availability overrides. Used by the
  // Schedule tab and by the assignment dropdown to filter eligible phlebs.
  useEffect(() => {
    const qAvail = query(collection(db, 'phlebAvailability'));
    return onSnapshot(qAvail, (snap) => {
      const map: Record<string, PhlebAvailability> = {};
      snap.docs.forEach(d => {
        const data = d.data() as PhlebAvailability;
        if (data.date && data.phlebotomistUid) {
          map[`${data.date}_${data.phlebotomistUid}`] = data;
        }
      });
      setPhlebAvailMap(map);
    }, (error) => {
      try { handleFirestoreError(error, OperationType.LIST, 'phlebAvailability'); }
      catch (e: any) { onError(e); }
    });
  }, [onError]);

  const openPatient = (patientId: string) => {
    setSelectedPatientId(patientId);
    setTab('patients');
  };

  const phlebotomists = staff.filter(s => s.role === 'phlebotomist' && s.active);

  const assignBooking = async (b: Booking, phleb: Staff | null) => {
    try {
      await updateDoc(doc(db, 'bookings', b.bookingId), {
        assignedTo: phleb?.uid || null,
        assignedToName: phleb?.name || null,
        status: phleb ? 'Assigned' : 'Created',
      });
    } catch (e) {
      try { handleFirestoreError(e, OperationType.UPDATE, `bookings/${b.bookingId}`); }
      catch (err: any) { onError(err); }
    }
  };

  const setPriority = async (b: Booking, priority: 'high' | 'medium' | 'low' | '') => {
    try {
      await updateDoc(doc(db, 'bookings', b.bookingId), {
        priority: priority || null,
      });
    } catch (e) {
      try { handleFirestoreError(e, OperationType.UPDATE, `bookings/${b.bookingId}`); }
      catch (err: any) { onError(err); }
    }
  };

  const saveTestsForBooking = async (b: Booking, tests: string[]) => {
    // If the new test list has no ECG-eligible package, clear any stale ecgAddon
    // so the recomputed total doesn't include an orphan ₹50.
    const ecgAddon = eligibleForEcgAddon(tests) ? (b.ecgAddon ?? false) : false;
    const price = computeBookingPrice(tests, ecgAddon);
    try {
      await updateDoc(doc(db, 'bookings', b.bookingId), { testNames: tests, price, ecgAddon });
    } catch (e) {
      try { handleFirestoreError(e, OperationType.UPDATE, `bookings/${b.bookingId}`); }
      catch (err: any) { onError(err); }
    }
  };

  const editingBooking = editingBookingId
    ? bookings.find(b => b.bookingId === editingBookingId) || null
    : null;

  const stats = {
    total: bookings.length,
    revenue: bookings.reduce((acc, b) => acc + (b.price || 0), 0),
    pending: bookings.filter(b => b.status === 'Created' || b.status === 'Assigned').length,
    inTransit: bookings.filter(b => b.status === 'Collected').length,
    completed: bookings.filter(b => b.status === 'Completed').length,
  };

  const filteredBookings = useMemo(() => {
    const today = getISTToday();
    const futureWindow = getNextNDates(Math.max(1, config.maxAdvanceDays));
    const upperBound = futureWindow[futureWindow.length - 1];
    const dateFiltered = bookings.filter(b => {
      if (dateFilter === 'all') return true;
      if (!b.bookingDate) return true; // legacy — keep visible
      return b.bookingDate >= today && b.bookingDate <= upperBound;
    });
    const matched = dateFiltered.filter(b => {
      const matchesFilter = filter === 'All' || b.status === filter;
      const matchesSearch = b.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (b.patientPhone && b.patientPhone.includes(searchTerm));
      return matchesFilter && matchesSearch;
    });
    return matched.slice().sort((a, b) => {
      // Dated bookings first (ascending by date, then slot), legacy last (by createdAt desc).
      if (a.bookingDate && b.bookingDate) {
        const dCmp = a.bookingDate.localeCompare(b.bookingDate);
        if (dCmp !== 0) return dCmp;
        return (a.slotStart || '').localeCompare(b.slotStart || '');
      }
      if (a.bookingDate) return -1;
      if (b.bookingDate) return 1;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
  }, [bookings, filter, searchTerm, dateFilter, config.maxAdvanceDays]);

  // Per-booking availability resolver. Returns the list of phlebs eligible to
  // be assigned and the reason (so the row can render an appropriate hint).
  const getAssignablePhlebs = (b: Booking): { phlebs: Staff[]; reason: 'legacy' | 'override' | 'filtered' } => {
    if (!b.bookingDate || !b.slotStart) return { phlebs: phlebotomists, reason: 'legacy' };
    if (overrideForBooking.has(b.bookingId)) return { phlebs: phlebotomists, reason: 'override' };
    const filtered = phlebotomists.filter(p => {
      const override = phlebAvailMap[`${b.bookingDate}_${p.uid}`] ?? null;
      const effective = effectiveSlotsFromDocs(p, override, b.bookingDate!);
      if (!effective.includes(b.slotStart!)) return false;
      const conflict = bookings.find(other =>
        other.bookingId !== b.bookingId &&
        other.assignedTo === p.uid &&
        other.bookingDate === b.bookingDate &&
        other.slotStart === b.slotStart &&
        other.status !== 'Completed'
      );
      return !conflict;
    });
    return { phlebs: filtered, reason: 'filtered' };
  };

  const toggleAssignOverride = (bookingId: string) => {
    setOverrideForBooking(prev => {
      const next = new Set(prev);
      if (next.has(bookingId)) next.delete(bookingId); else next.add(bookingId);
      return next;
    });
  };

  const updateStatus = async (id: string, newStatus: BookingStatus) => {
    try {
      await updateDoc(doc(db, 'bookings', id), { status: newStatus });
      if (newStatus === 'Completed') {
        const targetBooking = bookings.find(b => b.bookingId === id);
        if (targetBooking?.userId) {
          await addDoc(collection(db, 'notifications'), {
            bookingId: id,
            userId: targetBooking.userId,
            type: 'REPORT_READY',
            createdAt: serverTimestamp()
          });
        }
      }
    } catch (e) {
      try {
        handleFirestoreError(e, OperationType.UPDATE, `bookings/${id}`);
      } catch (err: any) {
        onError(err);
      }
    }
  };

  return (
    <div className="space-y-6 sm:space-y-7">
      {/* Header row — page name + primary action */}
      {tabProp !== undefined && (
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] sm:text-[26px] font-semibold tracking-tight leading-[1.2] text-[var(--color-text-primary)] capitalize">
              {tab}
            </h1>
            <p className="mt-0.5 text-[13px] text-[var(--color-text-secondary)]">
              {tab === 'bookings' && `${stats.total} total · ${stats.pending} need action`}
              {tab === 'patients' && `${patients.length} patients in directory`}
              {tab === 'staff' && `${staff.length} staff members`}
              {tab === 'schedule' && 'Per-phlebotomist availability'}
              {tab === 'settings' && 'Booking template, service area, and account'}
            </p>
          </div>
          <button
            onClick={() => setNewBookingOpen(true)}
            className="inline-flex items-center gap-1.5 h-10 px-3.5 sm:px-4 rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white text-[13px] font-medium tracking-tight hover:bg-[var(--color-accent-hover)] transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Booking</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      )}

      {/* KPI Top Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Total Revenue" value={`₹${stats.revenue.toLocaleString()}`} icon={<TrendingUp className="w-5 h-5 text-emerald-500" />} />
        <StatCard title="Action Needed" value={stats.pending} icon={<AlertTriangle className="w-5 h-5 text-amber-500" />} />
        <StatCard title="Samples in Transit" value={stats.inTransit} icon={<Clock className="w-5 h-5 text-blue-500" />} />
        <StatCard title="Completed Today" value={stats.completed} icon={<CheckCircle2 className="w-5 h-5 text-green-500" />} />
      </div>

      {/* Primary action — only shown when used standalone (legacy mode, no tabProp). */}
      {tabProp === undefined && (
        <div className="flex items-center justify-end">
          <button
            onClick={() => setNewBookingOpen(true)}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg bg-primary text-white hover:opacity-90 shadow-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Booking
          </button>
        </div>
      )}

      {/* Internal tab bar — hidden when DashboardView is mounted under a URL route
          (the sidebar/bottom-bar already provides navigation in that case). */}
      {tabProp === undefined && (
        <div className="flex items-center gap-1 border-b border-border-subtle overflow-x-auto">
          {(['bookings', 'patients', 'staff', 'schedule', 'settings'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors -mb-px whitespace-nowrap",
                tab === t
                  ? "text-primary border-primary"
                  : "text-text-muted border-transparent hover:text-text-dark"
              )}
            >
              {t === 'bookings'
                ? `Bookings (${bookings.length})`
                : t === 'patients'
                  ? `Patients (${patients.length})`
                  : t === 'staff'
                    ? `Staff (${staff.length})`
                    : t === 'schedule'
                      ? 'Schedule'
                      : 'Settings'}
            </button>
          ))}
        </div>
      )}

      {tab === 'settings' ? (
        <SettingsView config={config} onError={onError} />
      ) : tab === 'schedule' ? (
        <ScheduleView staff={staff} config={config} bookings={bookings} onError={onError} />
      ) : tab === 'staff' ? (
        <StaffView staff={staff} config={config} onError={onError} />
      ) : tab === 'patients' ? (
        <PatientsView
          patients={patients}
          bookings={bookings}
          selectedPatientId={selectedPatientId}
          onSelect={setSelectedPatientId}
        />
      ) : (
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] overflow-hidden">
        {/* Toolbar */}
        <div className="p-3 sm:p-4 border-b border-[var(--color-border-subtle)] flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 bg-[var(--color-surface)] border border-[var(--color-border-strong)] rounded-[var(--radius-md)] h-10 px-3 focus-within:border-[var(--color-accent)] transition-colors max-w-sm w-full">
            <Search className="w-4 h-4 text-[var(--color-text-tertiary)]" />
            <input
              type="text"
              placeholder="Search patient name or phone…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent border-none text-[13.5px] outline-none w-full text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap md:flex-nowrap md:overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            {['All', 'Created', 'Assigned', 'Collected', 'Processing', 'Completed'].map(s => (
              <button
                key={s}
                onClick={() => setFilter(s as any)}
                className={cn(
                  "h-10 sm:h-9 px-4 sm:px-3 text-[13px] sm:text-[12px] font-medium tracking-tight rounded-[var(--radius-sm)] border transition-colors whitespace-nowrap",
                  filter === s
                    ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                    : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border-subtle)] hover:bg-[var(--color-sunken)] hover:text-[var(--color-text-primary)]"
                )}
              >
                {s}
              </button>
            ))}
            <div className="hidden md:block w-px h-5 bg-[var(--color-border-subtle)] mx-1" />
            <button
              onClick={() => setDateFilter(d => d === 'upcoming' ? 'all' : 'upcoming')}
              title={dateFilter === 'upcoming' ? 'Showing today + next ' + config.maxAdvanceDays + ' days. Click to show all.' : 'Showing all dates. Click to limit to upcoming.'}
              className={cn(
                "inline-flex items-center gap-1.5 h-10 sm:h-9 px-4 sm:px-3 text-[13px] sm:text-[12px] font-medium tracking-tight rounded-[var(--radius-sm)] border transition-colors whitespace-nowrap",
                dateFilter === 'upcoming'
                  ? "bg-[var(--color-status-assigned-bg)] text-[var(--color-status-assigned)] border-[var(--color-status-assigned-ring)]"
                  : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border-subtle)] hover:bg-[var(--color-sunken)] hover:text-[var(--color-text-primary)]"
              )}
            >
              <Calendar className="w-3.5 h-3.5" />
              {dateFilter === 'upcoming' ? 'Upcoming' : 'All dates'}
            </button>
          </div>
        </div>

        {/* Desktop table (≥640px) */}
        <div className="hidden sm:block overflow-x-auto scroll-area">
          <table className="w-full border-collapse min-w-[1024px]">
            <thead>
              <tr className="bg-[var(--color-sunken)] border-b border-[var(--color-border-subtle)]">
                <th className="text-left py-2.5 px-4 sm:px-5 text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em]">Patient</th>
                <th className="text-left py-2.5 px-4 sm:px-5 text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em]">Tests &amp; Logistics</th>
                <th className="text-left py-2.5 px-4 sm:px-5 text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em]">Revenue</th>
                <th className="text-left py-2.5 px-4 sm:px-5 text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em]">Status</th>
                <th className="text-right py-2.5 px-4 sm:px-5 text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filteredBookings.length > 0 ? filteredBookings.map(b => (
                <tr key={b.bookingId} className="group hover:bg-primary/5 transition-colors">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center border border-border-subtle group-hover:bg-white transition-colors">
                        <User className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-bold text-text-dark text-sm">{b.patientName}</span>
                          <span className="text-[9px] bg-slate-200 px-2 py-0.5 rounded text-text-dark font-black tracking-tighter uppercase">
                            {b.patientGender || 'N/A'} • {b.patientAge || '??'}
                          </span>
                        </div>
                        <p className="text-[10px] text-text-muted flex items-center gap-1 font-medium">
                          <Phone className="w-3 h-3" /> {b.patientPhone}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-primary" />
                        <span className="text-xs font-bold text-text-dark uppercase tracking-tight">{(b.testNames || []).join(', ')}</span>
                      </div>
                      <div className="flex flex-col gap-0.5 ml-4">
                        <span className="text-[10px] text-text-muted font-bold flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {b.bookingDate ? (
                            <span className="text-text-dark">{formatDateLabel(b.bookingDate, 'en')}</span>
                          ) : (
                            <>
                              <span className="text-text-muted">—</span>
                              <span className="text-[9px] font-black bg-amber-100 text-amber-700 px-1 py-0.5 rounded uppercase tracking-widest">Legacy</span>
                            </>
                          )}
                        </span>
                        <span className="text-[10px] text-text-muted font-bold flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {b.timeSlot || '—'}
                        </span>
                        {b.isFastingConfirmed && (
                           <span className="text-[9px] text-blue-600 font-bold flex items-center gap-1">
                             <Activity className="w-3 h-3" /> Requires Fasting
                           </span>
                        )}
                        {b.notes && (
                           <span className="text-[9px] text-orange-600 font-bold flex items-center gap-1 bg-orange-50 px-1 py-0.5 rounded">
                             <MessageSquare className="w-3 h-3" /> Note: {b.notes}
                           </span>
                        )}
                        <div className="text-[10px] text-text-muted italic flex items-center gap-1">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="line-clamp-1">{b.patientAddress}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="space-y-2">
                      <div className="text-sm font-black text-text-dark">₹{b.price || 0}</div>
                      <select
                        value={b.priority || ''}
                        onChange={(e) => setPriority(b, e.target.value as any)}
                        title="Override priority"
                        className={cn(
                          "text-[9px] font-bold uppercase tracking-widest py-0.5 px-2 rounded border-none cursor-pointer outline-none",
                          getPriorityStyle(resolvePriority(b))
                        )}
                      >
                        <option value="">Auto ({resolvePriority(b) || 'none'})</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                      {b.isFastingConfirmed && (
                         <span className="text-[9px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded font-bold uppercase block w-fit">Fasting</span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="space-y-2">
                      <select
                        value={b.status}
                        onChange={(e) => updateStatus(b.bookingId, e.target.value as BookingStatus)}
                        className={cn(
                          "text-[11px] font-medium tracking-tight py-1 pl-3 pr-7 rounded-full cursor-pointer outline-none transition-colors appearance-none",
                          "bg-no-repeat bg-[right_0.5rem_center] bg-[length:10px]",
                          getStatusStyle(b.status)
                        )}
                        style={{
                          backgroundImage:
                            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
                        }}
                      >
                        <option value="Created">Created</option>
                        <option value="Assigned">Assigned</option>
                        <option value="Collected">Collected</option>
                        <option value="Processing">Processing</option>
                        <option value="Completed">Completed</option>
                      </select>
                      {(() => {
                        const { phlebs: assignable, reason } = getAssignablePhlebs(b);
                        // Ensure currently assigned (even if outside filter) stays selectable so admin doesn't lose track.
                        const dropdownPhlebs = b.assignedTo && !assignable.find(p => p.uid === b.assignedTo)
                          ? [...assignable, ...phlebotomists.filter(p => p.uid === b.assignedTo)]
                          : assignable;
                        return (
                          <>
                            <select
                              value={b.assignedTo || ''}
                              onChange={(e) => {
                                const phleb = phlebotomists.find(p => p.uid === e.target.value) || null;
                                assignBooking(b, phleb);
                              }}
                              title="Assign phlebotomist"
                              className="text-[10px] font-bold py-1 px-2 rounded border border-border-subtle bg-white cursor-pointer outline-none w-full max-w-[160px]"
                            >
                              <option value="">Unassigned</option>
                              {dropdownPhlebs.map(p => (
                                <option key={p.uid} value={p.uid}>{p.name}</option>
                              ))}
                            </select>
                            {reason === 'legacy' && (
                              <div className="text-[9px] text-amber-700 italic">No date set — all phlebs shown</div>
                            )}
                            {reason === 'filtered' && assignable.length === 0 && (
                              <button
                                onClick={() => toggleAssignOverride(b.bookingId)}
                                className="text-[9px] font-bold text-red-600 hover:underline text-left"
                              >
                                No phlebs available — show all
                              </button>
                            )}
                            {reason === 'filtered' && assignable.length > 0 && (
                              <label className="flex items-center gap-1 text-[9px] text-text-muted cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={false}
                                  onChange={() => toggleAssignOverride(b.bookingId)}
                                  className="w-3 h-3 accent-primary"
                                />
                                Show all (override filter)
                              </label>
                            )}
                            {reason === 'override' && (
                              <button
                                onClick={() => toggleAssignOverride(b.bookingId)}
                                className="text-[9px] font-bold text-primary hover:underline text-left"
                              >
                                Re-filter to available
                              </button>
                            )}
                            {b.assignedToName && b.assignedTo && !phlebotomists.find(p => p.uid === b.assignedTo) && (
                              <div className="text-[9px] text-text-muted italic">â†’ {b.assignedToName} (inactive)</div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        title="Call Patient"
                        onClick={() => window.open(`tel:${b.patientPhone}`)}
                        className="p-2 text-text-muted hover:text-primary hover:bg-white rounded-lg transition-all border border-transparent hover:border-border-subtle"
                      >
                        <Phone className="w-4 h-4" />
                      </button>
                      {b.patientId && (
                        <button
                          title="View patient profile"
                          onClick={() => openPatient(b.patientId)}
                          className="p-2 text-text-muted hover:text-primary hover:bg-white rounded-lg transition-all border border-transparent hover:border-border-subtle"
                        >
                          <User className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        title="Edit tests"
                        onClick={() => setEditingBookingId(b.bookingId)}
                        className="p-1 px-2 text-[9px] bg-slate-100 text-text-dark rounded hover:bg-primary hover:text-white transition-all font-bold uppercase"
                      >
                        Edit Tests
                      </button>
                      {b.status === 'Processing' && (
                        <button
                          onClick={() => updateStatus(b.bookingId, 'Completed')}
                          className="flex items-center gap-2 px-3 py-1.5 bg-primary text-white text-[10px] font-bold uppercase tracking-wider rounded-lg shadow-lg shadow-primary/20 hover:scale-105 transition-all"
                        >
                          <FileUp className="w-3 h-3" />
                          Upload Report
                        </button>
                      )}
                      {b.status === 'Completed' && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
                          <CheckCircle2 className="w-3 h-3" /> Report Sent
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-2 text-text-muted">
                      <Search className="w-10 h-10 opacity-20" />
                      <p className="text-sm font-medium">No bookings found matching filters</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile card list (<640px) */}
        <div className="sm:hidden p-3 space-y-3 bg-[var(--color-sunken)]">
          {filteredBookings.length === 0 ? (
            <div className="py-16 text-center flex flex-col items-center gap-2 text-text-muted">
              <Search className="w-10 h-10 opacity-20" />
              <p className="text-sm font-medium">No bookings found matching filters</p>
            </div>
          ) : filteredBookings.map(b => (
            <MobileListCard key={b.bookingId}>
              {/* Header: name + status */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="font-bold text-text-dark text-base truncate">{b.patientName}</span>
                    <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded text-text-dark font-black tracking-tighter uppercase">
                      {b.patientGender || 'N/A'} • {b.patientAge || '??'}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted flex items-center gap-1 font-medium">
                    <Phone className="w-3.5 h-3.5" /> {b.patientPhone}
                  </p>
                </div>
                <select
                  value={b.status}
                  onChange={(e) => updateStatus(b.bookingId, e.target.value as BookingStatus)}
                  className={cn(
                    "text-xs font-medium tracking-tight py-1.5 pl-3 pr-7 rounded-full cursor-pointer outline-none transition-colors appearance-none shrink-0",
                    "bg-no-repeat bg-[right_0.5rem_center] bg-[length:10px]",
                    getStatusStyle(b.status)
                  )}
                  style={{
                    backgroundImage:
                      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
                  }}
                >
                  <option value="Created">Created</option>
                  <option value="Assigned">Assigned</option>
                  <option value="Collected">Collected</option>
                  <option value="Processing">Processing</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>

              {/* Tests + logistics */}
              <div className="space-y-1.5 pt-2 border-t border-[var(--color-border-subtle)]">
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                  <span className="text-sm font-bold text-text-dark uppercase tracking-tight">{(b.testNames || []).join(', ')}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 ml-4 text-xs">
                  <span className="text-text-muted font-bold flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {b.bookingDate ? (
                      <span className="text-text-dark">{formatDateLabel(b.bookingDate, 'en')}</span>
                    ) : (
                      <>
                        <span className="text-text-muted">—</span>
                        <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded uppercase tracking-widest">Legacy</span>
                      </>
                    )}
                  </span>
                  <span className="text-text-muted font-bold flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> {b.timeSlot || '—'}
                  </span>
                  {b.isFastingConfirmed && (
                    <span className="text-blue-600 font-bold flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5" /> Fasting
                    </span>
                  )}
                </div>
                {b.notes && (
                  <div className="text-xs text-orange-700 font-bold flex items-start gap-1 bg-orange-50 px-2 py-1.5 rounded ml-4">
                    <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {b.notes}
                  </div>
                )}
                <div className="text-xs text-text-muted italic flex items-start gap-1 ml-4">
                  <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{b.patientAddress}</span>
                </div>
              </div>

              {/* Price + priority + assign */}
              <div className="space-y-2 pt-2 border-t border-[var(--color-border-subtle)]">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-lg font-black text-text-dark">₹{b.price || 0}</div>
                  <select
                    value={b.priority || ''}
                    onChange={(e) => setPriority(b, e.target.value as any)}
                    title="Override priority"
                    className={cn(
                      "text-[11px] font-bold uppercase tracking-widest py-1 px-2 rounded border-none cursor-pointer outline-none",
                      getPriorityStyle(resolvePriority(b))
                    )}
                  >
                    <option value="">Auto ({resolvePriority(b) || 'none'})</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                {(() => {
                  const { phlebs: assignable, reason } = getAssignablePhlebs(b);
                  const dropdownPhlebs = b.assignedTo && !assignable.find(p => p.uid === b.assignedTo)
                    ? [...assignable, ...phlebotomists.filter(p => p.uid === b.assignedTo)]
                    : assignable;
                  return (
                    <>
                      <select
                        value={b.assignedTo || ''}
                        onChange={(e) => {
                          const phleb = phlebotomists.find(p => p.uid === e.target.value) || null;
                          assignBooking(b, phleb);
                        }}
                        title="Assign phlebotomist"
                        className="w-full text-xs font-bold py-2 px-3 rounded-md border border-border-subtle bg-white cursor-pointer outline-none"
                      >
                        <option value="">Unassigned</option>
                        {dropdownPhlebs.map(p => (
                          <option key={p.uid} value={p.uid}>{p.name}</option>
                        ))}
                      </select>
                      {reason === 'legacy' && (
                        <div className="text-[11px] text-amber-700 italic">No date set — all phlebs shown</div>
                      )}
                      {reason === 'filtered' && assignable.length === 0 && (
                        <button
                          onClick={() => toggleAssignOverride(b.bookingId)}
                          className="text-[11px] font-bold text-red-600 hover:underline"
                        >
                          No phlebs available — show all
                        </button>
                      )}
                      {reason === 'filtered' && assignable.length > 0 && (
                        <label className="flex items-center gap-1.5 text-[11px] text-text-muted cursor-pointer">
                          <input
                            type="checkbox"
                            checked={false}
                            onChange={() => toggleAssignOverride(b.bookingId)}
                            className="w-4 h-4 accent-primary"
                          />
                          Show all (override filter)
                        </label>
                      )}
                      {reason === 'override' && (
                        <button
                          onClick={() => toggleAssignOverride(b.bookingId)}
                          className="text-[11px] font-bold text-primary hover:underline"
                        >
                          Re-filter to available
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
                <button
                  onClick={() => window.open(`tel:${b.patientPhone}`)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg bg-slate-100 text-text-dark hover:bg-slate-200 transition-colors"
                >
                  <Phone className="w-4 h-4" /> Call
                </button>
                {b.patientId && (
                  <button
                    onClick={() => openPatient(b.patientId)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg bg-slate-100 text-text-dark hover:bg-slate-200 transition-colors"
                  >
                    <User className="w-4 h-4" /> Profile
                  </button>
                )}
                <button
                  onClick={() => setEditingBookingId(b.bookingId)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg bg-slate-100 text-text-dark hover:bg-primary hover:text-white transition-colors"
                >
                  Edit Tests
                </button>
              </div>
              {b.status === 'Processing' && (
                <button
                  onClick={() => updateStatus(b.bookingId, 'Completed')}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 bg-primary text-white text-sm font-bold uppercase tracking-wider rounded-lg shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity"
                >
                  <FileUp className="w-4 h-4" /> Upload Report
                </button>
              )}
              {b.status === 'Completed' && (
                <div className="flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 rounded-lg">
                  <CheckCircle2 className="w-4 h-4" /> Report Sent
                </div>
              )}
            </MobileListCard>
          ))}
        </div>
      </div>
      )}

      {editingBooking && (
        <TestPickerModal
          booking={editingBooking}
          onClose={() => setEditingBookingId(null)}
          onSave={(tests) => { saveTestsForBooking(editingBooking, tests); setEditingBookingId(null); }}
        />
      )}

      {newBookingOpen && (
        <NewBookingModal
          staffRole="admin"
          staffName={auth.currentUser?.displayName || auth.currentUser?.email || "Admin"}
          onClose={() => setNewBookingOpen(false)}
        />
      )}
    </div>
  );
}

function PatientsView({
  patients,
  bookings,
  selectedPatientId,
  onSelect,
}: {
  patients: PatientProfile[];
  bookings: Booking[];
  selectedPatientId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [search, setSearch] = useState('');

  const sorted = [...patients].sort((a, b) => {
    const ta = (a as any).updatedAt || a.createdAt || '';
    const tb = (b as any).updatedAt || b.createdAt || '';
    return String(tb).localeCompare(String(ta));
  });

  const term = search.trim().toLowerCase();
  const filtered = term
    ? sorted.filter(p =>
        (p.name || '').toLowerCase().includes(term) ||
        (p.phone || '').includes(term) ||
        (p.userId || '').includes(term)
      )
    : sorted;

  const selected = selectedPatientId ? patients.find(p => p.id === selectedPatientId) : null;
  const patientBookings = selected
    ? bookings.filter(b => b.patientId === selected.id)
    : [];

  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] overflow-hidden grid grid-cols-1 lg:grid-cols-[320px_1fr]">
      {/* List */}
      <div className="border-b lg:border-b-0 lg:border-r border-[var(--color-border-subtle)]">
        <div className="p-3 border-b border-[var(--color-border-subtle)]">
          <div className="flex items-center gap-2 bg-[var(--color-surface)] border border-[var(--color-border-strong)] rounded-[var(--radius-md)] h-9 px-3 focus-within:border-[var(--color-accent)] transition-colors">
            <Search className="w-4 h-4 text-[var(--color-text-tertiary)]" />
            <input
              type="text"
              placeholder="Search patients…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent border-none text-[13px] outline-none w-full text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]"
            />
          </div>
        </div>
        <div className="max-h-[60vh] overflow-auto scroll-area divide-y divide-[var(--color-border-subtle)]">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-[var(--color-text-tertiary)] text-[12.5px]">No patients yet</div>
          )}
          {filtered.map(p => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={cn(
                "w-full text-left px-3 sm:px-4 py-3 transition-colors flex items-center gap-3",
                selectedPatientId === p.id
                  ? "bg-[var(--color-accent-soft)]"
                  : "hover:bg-[var(--color-sunken)]"
              )}
            >
              <div className="size-9 rounded-full bg-[var(--color-sunken)] flex items-center justify-center border border-[var(--color-border-subtle)] text-[var(--color-accent-hover)] shrink-0">
                <User className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-[13.5px] tracking-tight text-[var(--color-text-primary)] truncate">{p.name || 'Unnamed'}</div>
                <div className="text-[11.5px] text-[var(--color-text-secondary)] truncate">
                  <span className="font-mono">{p.phone || 'no phone'}</span> · {p.age ? `${p.age} yrs` : '?'} · {p.gender || '—'}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div className="p-4 sm:p-6">
        {!selected ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-[var(--color-text-tertiary)] py-16">
            <Users className="w-10 h-10 opacity-25 mb-3" />
            <p className="text-[14px] font-medium text-[var(--color-text-secondary)]">Select a patient to view bookings</p>
            <p className="text-[12px] mt-1">Tap any name on the left to drill in.</p>
          </div>
        ) : (
          <div className="space-y-5 sm:space-y-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-[20px] font-semibold tracking-tight text-[var(--color-text-primary)] truncate">{selected.name}</h3>
                <p className="text-[12.5px] text-[var(--color-text-secondary)] mt-0.5">
                  {selected.gender || '—'} · {selected.age || '?'} yrs · <span className="font-mono">{selected.phone || 'no phone'}</span>
                </p>
                {selected.address && (
                  <p className="text-[12.5px] text-[var(--color-text-secondary)] flex items-start gap-1 mt-1.5">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" /> <span>{selected.address}</span>
                  </p>
                )}
                <p className="text-[11px] text-[var(--color-text-tertiary)] mt-2.5 break-all leading-relaxed">
                  <span className="block sm:inline">Phone account <span className="font-mono">{selected.userId}</span></span>
                  <span className="hidden sm:inline"> · </span>
                  <span className="block sm:inline">Patient ID <span className="font-mono">{selected.id}</span></span>
                </p>
              </div>
              <button
                onClick={() => onSelect(null)}
                className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-sunken)] transition-colors"
                title="Clear selection"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <h4 className="text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em] mb-3">
                Bookings ({patientBookings.length})
              </h4>
              {patientBookings.length === 0 ? (
                <div className="text-[13px] text-[var(--color-text-secondary)] bg-[var(--color-sunken)] border border-[var(--color-border-subtle)] rounded-[var(--radius-md)] p-4 text-center">
                  No bookings yet for this patient.
                </div>
              ) : (
                <div className="space-y-2">
                  {patientBookings.map(b => (
                    <div
                      key={b.bookingId}
                      className="flex items-center justify-between gap-3 border border-[var(--color-border-subtle)] rounded-[var(--radius-md)] px-3 sm:px-4 py-3 hover:bg-[var(--color-sunken)] transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[13.5px] font-medium text-[var(--color-text-primary)] truncate">
                          {(b.testNames || []).join(', ') || '—'}
                        </div>
                        <div className="text-[11.5px] text-[var(--color-text-secondary)] mt-0.5 flex items-center gap-1.5 flex-wrap tabular-nums">
                          <span className="font-mono">{b.bookingId.slice(0, 8)}</span>
                          <span>·</span>
                          <span>{b.timeSlot || 'no slot'}</span>
                          <span>·</span>
                          <span>₹{b.price || 0}</span>
                        </div>
                      </div>
                      <span className={cn(
                        "text-[11px] font-medium tracking-tight px-2 py-0.5 rounded-full whitespace-nowrap",
                        getStatusStyle(b.status)
                      )}>
                        {b.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function defaultWeeklySchedule(slots: SlotConfig[]): WeeklySchedule {
  const starts = slots.map(s => s.start);
  return { sun: [], mon: starts, tue: starts, wed: starts, thu: starts, fri: starts, sat: starts };
}

function emptyWeeklySchedule(): WeeklySchedule {
  return { sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] };
}

function StaffView({ staff, config, onError }: { staff: Staff[]; config: BookingConfig; onError: (err: Error) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{
    name: string;
    email: string;
    phone: string;
    role: StaffRole;
    defaultSchedule: WeeklySchedule;
  }>({ name: '', email: '', phone: '', role: 'phlebotomist', defaultSchedule: defaultWeeklySchedule(config.slots) });
  const [saving, setSaving] = useState(false);
  const [editingScheduleUid, setEditingScheduleUid] = useState<string | null>(null);
  const [editingScheduleDraft, setEditingScheduleDraft] = useState<WeeklySchedule>(emptyWeeklySchedule());
  const [savingSchedule, setSavingSchedule] = useState(false);

  const reset = () => setForm({
    name: '', email: '', phone: '', role: 'phlebotomist',
    defaultSchedule: defaultWeeklySchedule(config.slots),
  });

  const phoneRequired = form.role === 'phlebotomist';
  const phoneValid = !phoneRequired || form.phone.trim().length >= 6;
  const canSubmit = !!form.email.trim() && !!form.name.trim() && phoneValid;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not signed in');
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          email: form.email.trim(),
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          role: form.role,
          defaultSchedule: form.role === 'phlebotomist' ? form.defaultSchedule : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      reset();
      setShowForm(false);
    } catch (e: any) {
      onError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (s: Staff) => {
    try {
      await updateDoc(doc(db, 'staff', s.uid), { active: !s.active });
    } catch (e) {
      try { handleFirestoreError(e, OperationType.UPDATE, `staff/${s.uid}`); }
      catch (err: any) { onError(err); }
    }
  };

  const startEditingSchedule = (s: Staff) => {
    setEditingScheduleUid(s.uid);
    setEditingScheduleDraft(s.defaultSchedule ?? defaultWeeklySchedule(config.slots));
  };

  const saveSchedule = async (uid: string) => {
    setSavingSchedule(true);
    try {
      await updateDoc(doc(db, 'staff', uid), { defaultSchedule: editingScheduleDraft });
      setEditingScheduleUid(null);
    } catch (e) {
      try { handleFirestoreError(e, OperationType.UPDATE, `staff/${uid}`); }
      catch (err: any) { onError(err); }
    } finally {
      setSavingSchedule(false);
    }
  };

  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-[var(--color-border-subtle)] flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-[var(--color-text-primary)]">Staff Members</h3>
          <p className="text-[13px] text-[var(--color-text-secondary)] mt-0.5">Admins and phlebotomists with dashboard access</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="inline-flex items-center justify-center h-10 px-4 bg-[var(--color-accent)] text-white text-[13px] font-medium tracking-tight rounded-[var(--radius-md)] hover:bg-[var(--color-accent-hover)] transition-colors gap-1.5 self-end sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          {showForm ? 'Cancel' : 'Add Staff'}
        </button>
      </div>

      {showForm && (
        <div className="p-5 border-b border-border-subtle bg-blue-50/50 space-y-3">
          <p className="text-[11px] text-text-muted leading-relaxed">
            {form.role === 'phlebotomist' ? (
              <>
                <span className="font-bold uppercase tracking-widest text-[10px] block mb-1">Phlebotomist onboarding</span>
                A Firebase Auth account will be created with this email and the <strong>phone number (without country code)</strong> as the default password.
                The phleb can change it from the login screen's <em>Forgot password?</em> link or from their dashboard.
              </>
            ) : (
              <>
                <span className="font-bold uppercase tracking-widest text-[10px] block mb-1">Admin onboarding</span>
                A Firebase Auth account will be created with this email and the phone number (without country code) as the default password.
                Admins normally sign in with Google, but the email/password pair also works.
              </>
            )}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="px-3 py-2 border border-border-subtle rounded-lg text-sm outline-none focus:border-primary"
            />
            <input
              type="text"
              placeholder="Full Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="px-3 py-2 border border-border-subtle rounded-lg text-sm outline-none focus:border-primary"
            />
            <input
              type="tel"
              placeholder={phoneRequired ? 'Phone (used as default password)' : 'Phone (optional)'}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="px-3 py-2 border border-border-subtle rounded-lg text-sm outline-none focus:border-primary"
            />
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as StaffRole })}
              className="px-3 py-2 border border-border-subtle rounded-lg text-sm outline-none focus:border-primary bg-white"
            >
              <option value="phlebotomist">Phlebotomist</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {form.role === 'phlebotomist' && (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-lg p-3">
              <DefaultScheduleEditor
                value={form.defaultSchedule}
                config={config}
                onChange={(next) => setForm({ ...form, defaultSchedule: next })}
              />
            </div>
          )}
          <div className="flex justify-end">
            <button
              onClick={submit}
              disabled={saving || !canSubmit}
              className="px-4 py-2 bg-primary text-white text-[11px] font-bold uppercase tracking-wider rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Staff Member'}
            </button>
          </div>
        </div>
      )}

      {/* Desktop table (≥640px) */}
      <div className="hidden sm:block overflow-x-auto scroll-area">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="bg-[var(--color-sunken)] border-b border-[var(--color-border-subtle)]">
              <th className="text-left py-2.5 px-4 sm:px-5 text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em] whitespace-nowrap">Name</th>
              <th className="text-left py-2.5 px-4 sm:px-5 text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em] whitespace-nowrap">Role</th>
              <th className="text-left py-2.5 px-4 sm:px-5 text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em] whitespace-nowrap">Email / Phone</th>
              <th className="hidden lg:table-cell text-left py-2.5 px-4 sm:px-5 text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em] whitespace-nowrap">UID</th>
              <th className="text-left py-2.5 px-4 sm:px-5 text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em] whitespace-nowrap">Schedule</th>
              <th className="text-right py-2.5 px-4 sm:px-5 text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em] whitespace-nowrap">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {staff.length === 0 ? (
              <tr><td colSpan={6} className="py-10 text-center text-text-muted text-xs">No staff records yet. Add one to get started.</td></tr>
            ) : staff.map(s => (
              <React.Fragment key={s.uid}>
                <tr className="hover:bg-slate-50/50">
                  <td className="py-3 px-4 sm:px-6 text-sm font-bold text-text-dark whitespace-nowrap">{s.name}</td>
                  <td className="py-3 px-4 sm:px-6 whitespace-nowrap">
                    <span className={cn(
                      "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded",
                      s.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    )}>
                      {s.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 sm:px-6 text-xs text-text-muted">
                    <div className="truncate max-w-[200px] sm:max-w-none">{s.email}</div>
                    {s.phone && <div className="text-[10px] font-mono whitespace-nowrap">{s.phone}</div>}
                  </td>
                  <td className="hidden lg:table-cell py-3 px-4 sm:px-6 text-[10px] text-text-muted font-mono whitespace-nowrap max-w-[180px] truncate">{s.uid}</td>
                  <td className="py-3 px-4 sm:px-6 whitespace-nowrap">
                    {s.role === 'phlebotomist' ? (
                      <button
                        onClick={() => startEditingSchedule(s)}
                        className="text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-md bg-slate-100 text-text-dark hover:bg-slate-200 transition-colors"
                      >
                        {editingScheduleUid === s.uid ? 'Editing…' : 'Edit Schedule'}
                      </button>
                    ) : (
                      <span className="text-[10px] text-text-muted italic">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 sm:px-6 text-right whitespace-nowrap">
                    <button
                      onClick={() => toggleActive(s)}
                      className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full transition-colors",
                        s.active ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      )}
                    >
                      {s.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                </tr>
                {editingScheduleUid === s.uid && (
                  <tr className="bg-blue-50/40">
                    <td colSpan={6} className="px-4 sm:px-6 py-4">
                    <DefaultScheduleEditor
                      value={editingScheduleDraft}
                      config={config}
                      onChange={setEditingScheduleDraft}
                    />
                    <div className="flex items-center justify-end gap-2 mt-3">
                      <button
                        onClick={() => setEditingScheduleUid(null)}
                        className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-lg border border-border-subtle text-text-muted hover:bg-white transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => saveSchedule(s.uid)}
                        disabled={savingSchedule}
                        className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-lg bg-primary text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {savingSchedule ? 'Saving…' : 'Save Schedule'}
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      </div>

      {/* Mobile card list (<640px) */}
      <div className="sm:hidden p-3 space-y-3 bg-[var(--color-sunken)]">
        {staff.length === 0 ? (
          <div className="py-10 text-center text-text-muted text-sm">No staff records yet. Add one to get started.</div>
        ) : staff.map(s => (
          <React.Fragment key={s.uid}>
            <MobileListCard>
              {/* Header: name + active toggle */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-text-dark text-base mb-1">{s.name}</div>
                  <span className={cn(
                    "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded inline-block",
                    s.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                  )}>
                    {s.role}
                  </span>
                </div>
                <button
                  onClick={() => toggleActive(s)}
                  className={cn(
                    "text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full transition-colors shrink-0",
                    s.active ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  )}
                >
                  {s.active ? 'Active' : 'Inactive'}
                </button>
              </div>

              {/* Contact */}
              <div className="space-y-1 text-sm pt-2 border-t border-[var(--color-border-subtle)]">
                <div className="text-text-dark break-all">{s.email}</div>
                {s.phone && <div className="text-xs font-mono text-text-muted">{s.phone}</div>}
                <details className="text-xs">
                  <summary className="cursor-pointer text-text-muted font-medium">UID</summary>
                  <div className="text-[11px] font-mono text-text-muted break-all mt-1">{s.uid}</div>
                </details>
              </div>

              {/* Edit schedule (phlebs only) */}
              {s.role === 'phlebotomist' && (
                <button
                  onClick={() => startEditingSchedule(s)}
                  className="w-full inline-flex items-center justify-center py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg bg-slate-100 text-text-dark hover:bg-slate-200 transition-colors"
                >
                  {editingScheduleUid === s.uid ? 'Editing Schedule…' : 'Edit Schedule'}
                </button>
              )}
            </MobileListCard>

            {/* Inline schedule editor (mobile) */}
            {editingScheduleUid === s.uid && (
              <MobileListCard className="bg-blue-50/40">
                <DefaultScheduleEditor
                  value={editingScheduleDraft}
                  config={config}
                  onChange={setEditingScheduleDraft}
                />
                <div className="flex items-center justify-end gap-2 mt-3">
                  <button
                    onClick={() => setEditingScheduleUid(null)}
                    className="px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border border-border-subtle text-text-muted hover:bg-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => saveSchedule(s.uid)}
                    disabled={savingSchedule}
                    className="px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-lg bg-primary text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {savingSchedule ? 'Saving…' : 'Save Schedule'}
                  </button>
                </div>
              </MobileListCard>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// --- DEFAULT SCHEDULE EDITOR ---
//
// 7-row Ã— N-slot checkbox grid for a phlebotomist's weekly default schedule.
// Each column is a slot from the current booking template; each row is a weekday.
// Pure controlled component — parent owns the WeeklySchedule state.
const WEEKDAY_LABELS: { key: keyof WeeklySchedule; label: string }[] = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

function DefaultScheduleEditor({
  value,
  config,
  onChange,
}: {
  value: WeeklySchedule;
  config: BookingConfig;
  onChange: (next: WeeklySchedule) => void;
}) {
  // Per-weekday template (override if present, else global cfg.slots).
  const slotsForDay = (day: keyof WeeklySchedule): SlotConfig[] => {
    const override = config.slotsByWeekday?.[day];
    return override !== undefined ? override : config.slots;
  };

  // Union of all distinct slot starts across the 7 weekdays — column header.
  const headerSlots = useMemo(() => {
    const seen = new Map<string, SlotConfig>();
    (['sun','mon','tue','wed','thu','fri','sat'] as (keyof WeeklySchedule)[]).forEach(day => {
      slotsForDay(day).forEach(s => { if (!seen.has(s.start)) seen.set(s.start, s); });
    });
    return Array.from(seen.values()).sort((a, b) => a.start.localeCompare(b.start));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.slots, config.slotsByWeekday]);

  const toggleCell = (day: keyof WeeklySchedule, slotStart: string) => {
    const current = value[day] ?? [];
    const has = current.includes(slotStart);
    const next = has ? current.filter(s => s !== slotStart) : [...current, slotStart].sort();
    onChange({ ...value, [day]: next });
  };

  const fillRow = (day: keyof WeeklySchedule) => {
    onChange({ ...value, [day]: slotsForDay(day).map(s => s.start) });
  };
  const clearRow = (day: keyof WeeklySchedule) => {
    onChange({ ...value, [day]: [] });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-text-muted uppercase tracking-widest font-bold">
          Default weekly schedule
        </div>
        <div className="text-[10px] text-text-muted">
          Per-date exceptions live in the Schedule tab.
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs w-full">
          <thead>
            <tr>
              <th className="text-left py-2 pr-3 text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em]">Day</th>
              {headerSlots.map(s => (
                <th key={s.start} className="text-center py-2 px-2 text-[10px] font-bold text-text-dark whitespace-nowrap">
                  {formatSlotLabel(s)}
                </th>
              ))}
              <th className="text-right py-2 pl-3 text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em]">Quick</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {WEEKDAY_LABELS.map(({ key, label }) => {
              const cells = value[key] ?? [];
              const dayTemplateStarts = new Set(slotsForDay(key).map(s => s.start));
              return (
                <tr key={key}>
                  <td className="py-1.5 pr-3 font-bold text-text-dark text-xs">{label}</td>
                  {headerSlots.map(s => {
                    const inTemplate = dayTemplateStarts.has(s.start);
                    return (
                      <td key={s.start} className="py-1.5 px-2 text-center">
                        {inTemplate ? (
                          <input
                            type="checkbox"
                            checked={cells.includes(s.start)}
                            onChange={() => toggleCell(key, s.start)}
                            className="w-4 h-4 accent-primary cursor-pointer"
                          />
                        ) : (
                          <span className="text-slate-300" title="Slot not in this weekday's template">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-1.5 pl-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => fillRow(key)}
                      className="text-[9px] font-bold uppercase tracking-widest text-primary hover:underline"
                    >
                      All
                    </button>
                    <span className="text-text-muted px-1">·</span>
                    <button
                      onClick={() => clearRow(key)}
                      className="text-[9px] font-bold uppercase tracking-widest text-text-muted hover:underline"
                    >
                      Off
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- SETTINGS VIEW ---
//
// Edits the singleton config/booking doc. Admin-only (gated by firestore rules
// and by the tab being inside DashboardView).
function SettingsView({ config, onError }: { config: BookingConfig; onError: (err: Error) => void }) {
  const [slots, setSlots] = useState<SlotConfig[]>(config.slots);
  const [slotsByWeekday, setSlotsByWeekday] = useState<Partial<Record<keyof WeeklySchedule, SlotConfig[]>>>(config.slotsByWeekday ?? {});
  const [maxAdvanceDays, setMaxAdvanceDays] = useState<number>(config.maxAdvanceDays);
  const [servicePins, setServicePins] = useState<string[]>(config.servicePins?.length ? config.servicePins : ['679326']);
  const [pinDraft, setPinDraft] = useState('');
  const [serviceRadiusKm, setServiceRadiusKm] = useState<number>(typeof config.serviceRadiusKm === 'number' ? config.serviceRadiusKm : 5);
  const [serviceCenterLat, setServiceCenterLat] = useState<number>(config.serviceCenter?.lat ?? 11.0664);
  const [serviceCenterLng, setServiceCenterLng] = useState<number>(config.serviceCenter?.lng ?? 76.2687);
  const [editCoords, setEditCoords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // When the prop refreshes (live snapshot), pull the new values in unless
  // the user has unsaved local edits.
  useEffect(() => {
    if (!dirty) {
      setSlots(config.slots);
      setSlotsByWeekday(config.slotsByWeekday ?? {});
      setMaxAdvanceDays(config.maxAdvanceDays);
      setServicePins(config.servicePins?.length ? config.servicePins : ['679326']);
      setServiceRadiusKm(typeof config.serviceRadiusKm === 'number' ? config.serviceRadiusKm : 5);
      setServiceCenterLat(config.serviceCenter?.lat ?? 11.0664);
      setServiceCenterLng(config.serviceCenter?.lng ?? 76.2687);
    }
  }, [config, dirty]);

  const validation = useMemo<string | null>(() => {
    if (slots.length === 0) return 'At least one slot is required.';
    const re = /^([01]\d|2[0-3]):[0-5]\d$/;
    const validateList = (list: SlotConfig[], scope: string): string | null => {
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (!re.test(s.start) || !re.test(s.end)) return `${scope} slot ${i + 1}: times must be HH:mm (24-hour).`;
        if (s.start >= s.end) return `${scope} slot ${i + 1}: end must be after start.`;
        if (i > 0 && s.start < list[i - 1].end) return `${scope} slot ${i + 1}: overlaps with slot ${i}.`;
      }
      return null;
    };
    const globalErr = validateList(slots, 'Default');
    if (globalErr) return globalErr;
    for (const [day, list] of Object.entries(slotsByWeekday)) {
      if (!list) continue;
      const dayErr = validateList(list, `${day.toUpperCase()}`);
      if (dayErr) return dayErr;
    }
    if (!Number.isInteger(maxAdvanceDays) || maxAdvanceDays < 1 || maxAdvanceDays > 30) {
      return 'Max advance days must be a whole number between 1 and 30.';
    }
    if (servicePins.length === 0) return 'At least one service-area PIN is required.';
    for (const pin of servicePins) {
      if (!/^\d{6}$/.test(pin)) return `Invalid PIN "${pin}" — must be exactly 6 digits.`;
    }
    if (!Number.isFinite(serviceRadiusKm) || serviceRadiusKm < 1 || serviceRadiusKm > 50) {
      return 'Service radius must be a number between 1 and 50 km.';
    }
    if (!Number.isFinite(serviceCenterLat) || serviceCenterLat < -90 || serviceCenterLat > 90) {
      return 'Service center latitude must be between -90 and 90.';
    }
    if (!Number.isFinite(serviceCenterLng) || serviceCenterLng < -180 || serviceCenterLng > 180) {
      return 'Service center longitude must be between -180 and 180.';
    }
    return null;
  }, [slots, slotsByWeekday, maxAdvanceDays, servicePins, serviceRadiusKm, serviceCenterLat, serviceCenterLng]);

  const addPin = () => {
    const trimmed = pinDraft.trim();
    if (!/^\d{6}$/.test(trimmed)) return;
    if (servicePins.includes(trimmed)) { setPinDraft(''); return; }
    setServicePins([...servicePins, trimmed]);
    setPinDraft('');
    setDirty(true);
  };
  const removePin = (pin: string) => {
    setServicePins(servicePins.filter(p => p !== pin));
    setDirty(true);
  };

  const addSlot = () => {
    const last = slots[slots.length - 1];
    const nextStart = last ? last.end : '07:00';
    const nextEnd = bumpHour(nextStart);
    setSlots([...slots, { start: nextStart, end: nextEnd }]);
    setDirty(true);
  };
  const updateSlot = (i: number, patch: Partial<SlotConfig>) => {
    const next = slots.slice();
    next[i] = { ...next[i], ...patch };
    setSlots(next);
    setDirty(true);
  };
  const removeSlot = (i: number) => {
    setSlots(slots.filter((_, j) => j !== i));
    setDirty(true);
  };

  const save = async () => {
    if (validation) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'config', 'booking'), {
        slots,
        slotsByWeekday,
        maxAdvanceDays,
        timezone: config.timezone || 'Asia/Kolkata',
        servicePins,
        serviceRadiusKm,
        serviceCenter: { lat: serviceCenterLat, lng: serviceCenterLng },
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser?.uid || null,
      }, { merge: true });
      invalidateBookingConfigCache();
      setDirty(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
    } catch (e) {
      try { handleFirestoreError(e, OperationType.WRITE, 'config/booking'); }
      catch (err: any) { onError(err); }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-[var(--color-border-subtle)] flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-[var(--color-text-primary)] flex items-center gap-2">
            <Settings className="w-4 h-4 text-[var(--color-text-secondary)]" /> Booking Settings
          </h3>
          <p className="text-[13px] text-[var(--color-text-secondary)] mt-0.5">Slot template and how far ahead customers can book.</p>
        </div>
        <div className="flex items-center gap-3 self-end sm:self-auto">
          {savedFlash && (
            <span className="text-[12px] font-medium text-[var(--color-status-completed)] tracking-tight flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" /> Saved
            </span>
          )}
          <button
            onClick={save}
            disabled={saving || !!validation || !dirty}
            className="inline-flex items-center justify-center h-10 px-4 bg-[var(--color-accent)] text-white text-[13px] font-medium tracking-tight rounded-[var(--radius-md)] hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>

      <div className="p-5 space-y-6">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em]">Slot Template</h4>
            <button
              onClick={addSlot}
              className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add slot
            </button>
          </div>
          <div className="space-y-2">
            {slots.length === 0 && (
              <div className="text-xs text-text-muted italic">No slots configured.</div>
            )}
            {slots.map((s, i) => (
              <div key={i} className="flex items-center gap-3 bg-slate-50 border border-border-subtle rounded-lg px-3 py-2">
                <span className="text-[10px] font-bold text-text-muted w-6">#{i + 1}</span>
                <input
                  type="time"
                  value={s.start}
                  onChange={(e) => updateSlot(i, { start: e.target.value })}
                  className="px-2 py-1 border border-border-subtle rounded text-sm outline-none focus:border-primary bg-white"
                />
                <span className="text-text-muted text-sm">â†’</span>
                <input
                  type="time"
                  value={s.end}
                  onChange={(e) => updateSlot(i, { end: e.target.value })}
                  className="px-2 py-1 border border-border-subtle rounded text-sm outline-none focus:border-primary bg-white"
                />
                <span className="text-[10px] text-text-muted ml-2 flex-1">
                  {/^([01]\d|2[0-3]):[0-5]\d$/.test(s.start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.end)
                    ? formatSlotLabel(s)
                    : '—'}
                </span>
                <button
                  onClick={() => removeSlot(i)}
                  title="Remove slot"
                  className="p-1.5 rounded hover:bg-red-50 text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em]">Per-Weekday Slot Overrides</h4>
            <span className="text-[10px] text-text-muted">Optional. Inherit defaults unless customized.</span>
          </div>
          <div className="space-y-2">
            {WEEKDAY_LABELS.map(({ key, label }) => {
              const list = slotsByWeekday[key];
              const customized = list !== undefined;
              const setList = (next: SlotConfig[] | undefined) => {
                const draft: Partial<Record<keyof WeeklySchedule, SlotConfig[]>> = { ...slotsByWeekday };
                if (next === undefined) delete draft[key]; else draft[key] = next;
                setSlotsByWeekday(draft);
                setDirty(true);
              };
              const addDaySlot = () => {
                const cur = list ?? [];
                const last = cur[cur.length - 1];
                const nextStart = last ? last.end : '07:00';
                setList([...cur, { start: nextStart, end: bumpHour(nextStart) }]);
              };
              const updateDaySlot = (i: number, patch: Partial<SlotConfig>) => {
                const cur = list ?? [];
                const next = cur.slice();
                next[i] = { ...next[i], ...patch };
                setList(next);
              };
              const removeDaySlot = (i: number) => {
                const cur = list ?? [];
                setList(cur.filter((_, j) => j !== i));
              };
              return (
                <div key={key} className="border border-border-subtle rounded-lg bg-white">
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-50">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-text-dark w-24">{label}</span>
                      <span className="text-[10px] text-text-muted">
                        {!customized && 'Inherits default slots'}
                        {customized && list!.length === 0 && 'Closed (no slots)'}
                        {customized && list!.length > 0 && `${list!.length} custom slot${list!.length === 1 ? '' : 's'}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {customized ? (
                        <>
                          <button
                            onClick={addDaySlot}
                            className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Slot
                          </button>
                          <button
                            onClick={() => setList(undefined)}
                            className="text-[10px] font-bold text-text-muted hover:underline"
                          >
                            Reset to default
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setList([])}
                          className="text-[10px] font-bold text-primary hover:underline"
                        >
                          Customize
                        </button>
                      )}
                    </div>
                  </div>
                  {customized && list!.length > 0 && (
                    <div className="p-3 space-y-2">
                      {list!.map((s, i) => (
                        <div key={i} className="flex items-center gap-3 bg-slate-50 border border-border-subtle rounded-lg px-3 py-1.5">
                          <span className="text-[10px] font-bold text-text-muted w-6">#{i + 1}</span>
                          <input
                            type="time"
                            value={s.start}
                            onChange={(e) => updateDaySlot(i, { start: e.target.value })}
                            className="px-2 py-1 border border-border-subtle rounded text-sm outline-none focus:border-primary bg-white"
                          />
                          <span className="text-text-muted text-sm">â†’</span>
                          <input
                            type="time"
                            value={s.end}
                            onChange={(e) => updateDaySlot(i, { end: e.target.value })}
                            className="px-2 py-1 border border-border-subtle rounded text-sm outline-none focus:border-primary bg-white"
                          />
                          <span className="text-[10px] text-text-muted ml-2 flex-1">
                            {/^([01]\d|2[0-3]):[0-5]\d$/.test(s.start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.end)
                              ? formatSlotLabel(s)
                              : '—'}
                          </span>
                          <button
                            onClick={() => removeDaySlot(i)}
                            title="Remove slot"
                            className="p-1.5 rounded hover:bg-red-50 text-red-500 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h4 className="text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em] mb-3">Booking Window</h4>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-text-dark">Customers can book up to</span>
            <input
              type="number"
              min={1}
              max={30}
              value={maxAdvanceDays}
              onChange={(e) => { setMaxAdvanceDays(Number(e.target.value)); setDirty(true); }}
              className="px-2 py-1 w-20 border border-border-subtle rounded text-sm outline-none focus:border-primary bg-white text-center"
            />
            <span className="text-xs font-bold text-text-dark">days ahead.</span>
          </div>
        </section>

        <section>
          <h4 className="text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em] mb-3">Service Area PINs</h4>
          <div className="flex flex-wrap gap-2 mb-2">
            {servicePins.map((pin) => (
              <span key={pin} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full">
                {pin}
                <button
                  onClick={() => removePin(pin)}
                  title={`Remove ${pin}`}
                  className="ml-1 -mr-1 p-0.5 rounded hover:bg-primary/20"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {servicePins.length === 0 && (
              <span className="text-xs text-text-muted italic">No PINs configured — bot will reject every address.</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={pinDraft}
              onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPin(); } }}
              placeholder="6-digit PIN"
              className="px-2 py-1 w-32 border border-border-subtle rounded text-sm outline-none focus:border-primary bg-white"
            />
            <button
              onClick={addPin}
              disabled={!/^\d{6}$/.test(pinDraft.trim()) || servicePins.includes(pinDraft.trim())}
              className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1 disabled:opacity-40 disabled:no-underline"
            >
              <Plus className="w-3 h-3" /> Add PIN
            </button>
          </div>
        </section>

        <section>
          <h4 className="text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em] mb-3">GPS Service Radius</h4>
          <p className="text-[11px] text-text-muted mb-2">
            When a customer shares their live WhatsApp location, the bot accepts them if they're within this many kilometers of the service center.
          </p>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-text-dark">Within</span>
            <input
              type="number"
              min={1}
              max={50}
              step={0.5}
              value={serviceRadiusKm}
              onChange={(e) => { setServiceRadiusKm(Number(e.target.value)); setDirty(true); }}
              className="px-2 py-1 w-20 border border-border-subtle rounded text-sm outline-none focus:border-primary bg-white text-center"
            />
            <span className="text-xs font-bold text-text-dark">km of</span>
            <span className="text-xs font-mono text-text-dark">
              ({serviceCenterLat.toFixed(4)}, {serviceCenterLng.toFixed(4)})
            </span>
            <button
              onClick={() => setEditCoords((v) => !v)}
              className="text-[10px] font-bold text-primary hover:underline"
            >
              {editCoords ? 'Hide coords' : 'Edit coords'}
            </button>
          </div>
          {editCoords && (
            <div className="mt-3 flex items-center gap-3">
              <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Lat</label>
              <input
                type="number"
                step="any"
                min={-90}
                max={90}
                value={serviceCenterLat}
                onChange={(e) => { setServiceCenterLat(Number(e.target.value)); setDirty(true); }}
                className="px-2 py-1 w-32 border border-border-subtle rounded text-sm outline-none focus:border-primary bg-white"
              />
              <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Lng</label>
              <input
                type="number"
                step="any"
                min={-180}
                max={180}
                value={serviceCenterLng}
                onChange={(e) => { setServiceCenterLng(Number(e.target.value)); setDirty(true); }}
                className="px-2 py-1 w-32 border border-border-subtle rounded text-sm outline-none focus:border-primary bg-white"
              />
            </div>
          )}
        </section>

        {validation && (
          <div className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            {validation}
          </div>
        )}
      </div>
    </div>
  );
}

function bumpHour(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const total = (h * 60 + (m || 0) + 60) % (24 * 60);
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

// --- SCHEDULE VIEW ---
//
// Per-date, per-phlebotomist availability grid. Override docs live at
// phlebAvailability/{YYYY-MM-DD}_{phlebUid} and are sparse — absence means
// the staff.defaultSchedule applies.
function ScheduleView({
  staff,
  config,
  bookings,
  onError,
}: {
  staff: Staff[];
  config: BookingConfig;
  bookings: Booking[];
  onError: (err: Error) => void;
}) {
  const dateOptions = useMemo(() => getNextNDates(14), []);
  const [selectedDate, setSelectedDate] = useState<string>(dateOptions[0]);
  const [overrides, setOverrides] = useState<Record<string, PhlebAvailability>>({});

  useEffect(() => {
    const qAvail = query(collection(db, 'phlebAvailability'), where('date', '==', selectedDate));
    return onSnapshot(
      qAvail,
      (snap) => {
        const map: Record<string, PhlebAvailability> = {};
        snap.docs.forEach(d => {
          const data = d.data() as PhlebAvailability;
          if (data.phlebotomistUid) map[data.phlebotomistUid] = data;
        });
        setOverrides(map);
      },
      (error) => {
        try { handleFirestoreError(error, OperationType.LIST, 'phlebAvailability'); }
        catch (e: any) { onError(e); }
      }
    );
  }, [selectedDate, onError]);

  const activePhlebs = useMemo(
    () => staff.filter(s => s.role === 'phlebotomist' && s.active),
    [staff]
  );

  const bookingAt = (phlebUid: string, slotStart: string): Booking | null => {
    return bookings.find(b =>
      b.assignedTo === phlebUid &&
      b.bookingDate === selectedDate &&
      b.slotStart === slotStart &&
      b.status !== 'Completed'
    ) || null;
  };

  // Slot template that applies on the selected date (weekday override or global).
  const dateSlots = useMemo(() => slotsForDate(config, selectedDate), [config, selectedDate]);

  // Off-template slots: bookings on this date with a slotStart that isn't in
  // the current template. Surfaced as a separate row in the grid header.
  const offTemplateSlotStarts = useMemo(() => {
    const templateStarts = new Set(dateSlots.map(s => s.start));
    const set = new Set<string>();
    bookings.forEach(b => {
      if (b.bookingDate === selectedDate && b.slotStart && !templateStarts.has(b.slotStart) && b.status !== 'Completed') {
        set.add(b.slotStart);
      }
    });
    return Array.from(set).sort();
  }, [bookings, selectedDate, dateSlots]);

  const writeOverride = async (phleb: Staff, payload: Partial<PhlebAvailability>) => {
    const docId = phlebAvailabilityDocId(selectedDate, phleb.uid);
    try {
      await setDoc(doc(db, 'phlebAvailability', docId), {
        date: selectedDate,
        phlebotomistUid: phleb.uid,
        phlebotomistName: phleb.name,
        ...payload,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser?.uid || null,
      }, { merge: true });
    } catch (e) {
      try { handleFirestoreError(e, OperationType.WRITE, `phlebAvailability/${docId}`); }
      catch (err: any) { onError(err); }
    }
  };

  const toggleSlot = async (phleb: Staff, slotStart: string) => {
    const current = effectiveSlotsFromDocs(phleb, overrides[phleb.uid] ?? null, selectedDate);
    const isOn = current.includes(slotStart);
    if (isOn) {
      const conflict = bookingAt(phleb.uid, slotStart);
      if (conflict) {
        alert(`Cannot remove this slot — ${phleb.name} has booking ${conflict.bookingId} (${conflict.patientName}) on it. Reassign first.`);
        return;
      }
    }
    const nextSlots = isOn
      ? current.filter(s => s !== slotStart)
      : [...current, slotStart].sort();
    await writeOverride(phleb, {
      workingSlots: nextSlots,
      unavailable: false,
    });
  };

  const markDayOff = async (phleb: Staff) => {
    // Block if any active booking exists on this date for this phleb.
    const conflict = bookings.find(b =>
      b.assignedTo === phleb.uid &&
      b.bookingDate === selectedDate &&
      b.status !== 'Completed'
    );
    if (conflict) {
      alert(`Cannot mark day off — ${phleb.name} has booking ${conflict.bookingId} on ${selectedDate}. Reassign first.`);
      return;
    }
    await writeOverride(phleb, { workingSlots: [], unavailable: true });
  };

  const resetToDefault = async (phleb: Staff) => {
    const docId = phlebAvailabilityDocId(selectedDate, phleb.uid);
    try {
      await deleteDoc(doc(db, 'phlebAvailability', docId));
    } catch (e) {
      // "Not found" is fine — no override existed.
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.toLowerCase().includes('not-found')) {
        try { handleFirestoreError(e, OperationType.DELETE, `phlebAvailability/${docId}`); }
        catch (err: any) { onError(err); }
      }
    }
  };

  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-[var(--color-border-subtle)]">
        <h3 className="text-[15px] font-semibold tracking-tight text-[var(--color-text-primary)] flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[var(--color-text-secondary)]" /> Phlebotomist Schedule
        </h3>
        <p className="text-[13px] text-[var(--color-text-secondary)] mt-0.5">Per-date availability. Empty doc = staff default schedule applies.</p>
      </div>

      <div className="p-4 sm:p-5 border-b border-[var(--color-border-subtle)]">
        <div className="text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em] mb-2">Date</div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {dateOptions.map(d => (
            <button
              key={d}
              onClick={() => setSelectedDate(d)}
              className={cn(
                "h-8 px-3 rounded-[var(--radius-md)] text-[12.5px] font-medium tracking-tight whitespace-nowrap border transition-colors",
                selectedDate === d
                  ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                  : "bg-[var(--color-surface)] text-[var(--color-text-primary)] border-[var(--color-border-subtle)] hover:bg-[var(--color-sunken)]"
              )}
            >
              {formatDateLabel(d, 'en')}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop grid (≥640px) */}
      <div className="hidden sm:block overflow-x-auto scroll-area">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="bg-[var(--color-sunken)] border-b border-[var(--color-border-subtle)]">
              <th className="text-left py-2.5 px-4 text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em] whitespace-nowrap">Phlebotomist</th>
              {dateSlots.map(s => (
                <th key={s.start} className="text-center py-2.5 px-2 text-[11.5px] font-medium text-[var(--color-text-primary)] tabular-nums whitespace-nowrap">
                  {formatSlotLabel(s)}
                </th>
              ))}
              {offTemplateSlotStarts.map(start => (
                <th
                  key={`off-${start}`}
                  className="text-center py-2.5 px-2 text-[11.5px] font-medium text-[var(--color-status-created)] tabular-nums whitespace-nowrap"
                  title="Off-template slot — booking exists but not in current template"
                >
                  {start}
                  <span className="ml-1 text-[9px] font-semibold uppercase tracking-[0.06em] bg-[var(--color-status-created-bg)] ring-1 ring-inset ring-[var(--color-status-created-ring)] px-1.5 py-0.5 rounded">
                    Off
                  </span>
                </th>
              ))}
              <th className="text-right py-2.5 px-4 text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {activePhlebs.length === 0 ? (
              <tr>
                <td colSpan={2 + dateSlots.length + offTemplateSlotStarts.length} className="py-10 text-center text-text-muted text-xs">
                  No active phlebotomists. Add one in the Staff tab.
                </td>
              </tr>
            ) : activePhlebs.map(p => {
              const override = overrides[p.uid] ?? null;
              const effective = effectiveSlotsFromDocs(p, override, selectedDate);
              const dayOff = override?.unavailable === true;
              return (
                <tr key={p.uid} className="hover:bg-slate-50/40">
                  <td className="py-3 px-4">
                    <div className="text-sm font-bold text-text-dark">{p.name}</div>
                    <div className="text-[10px] text-text-muted">
                      {override ? (
                        <span className="text-amber-700 font-bold">Override active</span>
                      ) : (
                        <span>Using default ({weekdayKey(selectedDate)})</span>
                      )}
                    </div>
                  </td>
                  {dateSlots.map(s => {
                    const isOn = !dayOff && effective.includes(s.start);
                    const conflict = isOn ? bookingAt(p.uid, s.start) : null;
                    return (
                      <td key={s.start} className="text-center py-3 px-2">
                        <button
                          onClick={() => toggleSlot(p, s.start)}
                          disabled={dayOff}
                          title={conflict ? `Booking ${conflict.bookingId} assigned here` : isOn ? 'Working — click to remove' : 'Off — click to add'}
                          className={cn(
                            "w-7 h-7 rounded-md border-2 transition-colors inline-flex items-center justify-center",
                            dayOff
                              ? "border-slate-200 bg-slate-100 text-slate-300 cursor-not-allowed"
                              : isOn
                                ? conflict
                                  ? "border-amber-400 bg-amber-50 text-amber-700"
                                  : "border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                : "border-border-subtle bg-white text-text-muted hover:bg-slate-50"
                          )}
                        >
                          {isOn ? <CheckCircle className="w-4 h-4" /> : null}
                        </button>
                      </td>
                    );
                  })}
                  {offTemplateSlotStarts.map(start => {
                    const conflict = bookingAt(p.uid, start);
                    return (
                      <td key={`off-${p.uid}-${start}`} className="text-center py-3 px-2">
                        {conflict ? (
                          <span title={`Booking ${conflict.bookingId}`} className="inline-flex items-center justify-center w-7 h-7 rounded-md border-2 border-amber-400 bg-amber-50 text-amber-700">
                            <CheckCircle className="w-4 h-4" />
                          </span>
                        ) : (
                          <span className="text-text-muted text-xs">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    {dayOff ? (
                      <span className="text-[10px] font-black bg-red-100 text-red-700 px-2 py-0.5 rounded uppercase tracking-widest">
                        Day off
                      </span>
                    ) : (
                      <button
                        onClick={() => markDayOff(p)}
                        className="text-[10px] font-bold uppercase tracking-wider text-red-600 hover:underline mr-3"
                      >
                        Day off
                      </button>
                    )}
                    {override && (
                      <button
                        onClick={() => resetToDefault(p)}
                        className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline"
                      >
                        Reset to default
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card list (<640px) */}
      <div className="sm:hidden p-3 space-y-3 bg-[var(--color-sunken)]">
        {activePhlebs.length === 0 ? (
          <div className="py-10 text-center text-text-muted text-sm">
            No active phlebotomists. Add one in the Staff tab.
          </div>
        ) : activePhlebs.map(p => {
          const override = overrides[p.uid] ?? null;
          const effective = effectiveSlotsFromDocs(p, override, selectedDate);
          const dayOff = override?.unavailable === true;
          return (
            <MobileListCard key={p.uid}>
              {/* Header: name + override badge */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-text-dark text-base">{p.name}</div>
                  <div className="text-xs text-text-muted mt-0.5">
                    {override ? (
                      <span className="text-amber-700 font-bold">Override active</span>
                    ) : (
                      <span>Using default ({weekdayKey(selectedDate)})</span>
                    )}
                  </div>
                </div>
                {dayOff && (
                  <span className="text-[11px] font-black bg-red-100 text-red-700 px-2 py-1 rounded uppercase tracking-widest shrink-0">
                    Day off
                  </span>
                )}
              </div>

              {/* Slot grid */}
              <div className="pt-2 border-t border-[var(--color-border-subtle)]">
                <div className="text-[11px] font-medium text-text-muted uppercase tracking-widest mb-2">Slots</div>
                <div className="grid grid-cols-3 gap-2">
                  {dateSlots.map(s => {
                    const isOn = !dayOff && effective.includes(s.start);
                    const conflict = isOn ? bookingAt(p.uid, s.start) : null;
                    return (
                      <button
                        key={s.start}
                        onClick={() => toggleSlot(p, s.start)}
                        disabled={dayOff}
                        title={conflict ? `Booking ${conflict.bookingId} assigned here` : isOn ? 'Working — tap to remove' : 'Off — tap to add'}
                        className={cn(
                          "flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-md border-2 transition-colors text-[11px] font-medium tabular-nums",
                          dayOff
                            ? "border-slate-200 bg-slate-100 text-slate-300 cursor-not-allowed"
                            : isOn
                              ? conflict
                                ? "border-amber-400 bg-amber-50 text-amber-700"
                                : "border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              : "border-border-subtle bg-white text-text-muted hover:bg-slate-50"
                        )}
                      >
                        <span>{formatSlotLabel(s)}</span>
                        {isOn && <CheckCircle className="w-3.5 h-3.5" />}
                      </button>
                    );
                  })}
                </div>

                {offTemplateSlotStarts.length > 0 && (
                  <>
                    <div className="text-[11px] font-medium text-[var(--color-status-created)] uppercase tracking-widest mt-3 mb-2">Off-template</div>
                    <div className="grid grid-cols-3 gap-2">
                      {offTemplateSlotStarts.map(start => {
                        const conflict = bookingAt(p.uid, start);
                        return (
                          <div
                            key={`off-${p.uid}-${start}`}
                            className={cn(
                              "flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-md border-2 text-[11px] font-medium tabular-nums",
                              conflict
                                ? "border-amber-400 bg-amber-50 text-amber-700"
                                : "border-border-subtle bg-white text-text-muted"
                            )}
                            title={conflict ? `Booking ${conflict.bookingId}` : undefined}
                          >
                            <span>{start}</span>
                            {conflict ? <CheckCircle className="w-3.5 h-3.5" /> : <span>—</span>}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
                {dayOff ? (
                  override && (
                    <button
                      onClick={() => resetToDefault(p)}
                      className="flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg bg-slate-100 text-primary hover:bg-slate-200 transition-colors"
                    >
                      Reset to default
                    </button>
                  )
                ) : (
                  <>
                    <button
                      onClick={() => markDayOff(p)}
                      className="flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                    >
                      Day off
                    </button>
                    {override && (
                      <button
                        onClick={() => resetToDefault(p)}
                        className="flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg bg-slate-100 text-primary hover:bg-slate-200 transition-colors"
                      >
                        Reset
                      </button>
                    )}
                  </>
                )}
              </div>
            </MobileListCard>
          );
        })}
      </div>
    </div>
  );
}

export function PhlebotomistDashboard({ user, onError }: { user: FirebaseUser; onError: (err: Error) => void }) {
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [unassigned, setUnassigned] = useState<Booking[]>([]);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const config = useBookingConfig();
  const { staff: ownStaff } = useOwnStaff(user);

  useEffect(() => {
    // Own assignments (any status)
    const qMine = query(collection(db, 'bookings'), where('assignedTo', '==', user.uid));
    return onSnapshot(qMine, (snap) => {
      const data = snap.docs.map(d => ({ ...d.data(), bookingId: d.id } as Booking));
      // Primary sort: bookingDate ASC, then slotStart ASC. Legacy (no bookingDate)
      // sinks to the bottom, ordered by timeSlot for stability.
      data.sort((a, b) => {
        if (a.bookingDate && b.bookingDate) {
          const dCmp = a.bookingDate.localeCompare(b.bookingDate);
          if (dCmp !== 0) return dCmp;
          return (a.slotStart || '').localeCompare(b.slotStart || '');
        }
        if (a.bookingDate) return -1;
        if (b.bookingDate) return 1;
        return (a.timeSlot || '').localeCompare(b.timeSlot || '');
      });
      setMyBookings(data);
    }, (error) => {
      try { handleFirestoreError(error, OperationType.LIST, 'bookings (assigned)'); }
      catch (e: any) { onError(e); }
    });
  }, [user.uid, onError]);

  useEffect(() => {
    // Unassigned queue (Created bookings the rule permits any phleb to see)
    const qCreated = query(collection(db, 'bookings'), where('status', '==', 'Created'));
    return onSnapshot(qCreated, (snap) => {
      const data = snap.docs
        .map(d => ({ ...d.data(), bookingId: d.id } as Booking))
        .filter(b => !b.assignedTo);
      data.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      setUnassigned(data);
    }, (error) => {
      try { handleFirestoreError(error, OperationType.LIST, 'bookings (queue)'); }
      catch (e: any) { onError(e); }
    });
  }, [onError]);

  const todayISO = getISTToday();
  const active = myBookings.filter(b => b.status === 'Assigned' || b.status === 'Collected' || b.status === 'Processing');
  const completedToday = myBookings.filter(b => {
    if (b.status !== 'Completed') return false;
    // Prefer bookingDate (the day the visit was scheduled for); fall back to
    // createdAt for legacy bookings without a date.
    if (b.bookingDate) return b.bookingDate === todayISO;
    return String(b.createdAt || '').slice(0, 10) === todayISO;
  });

  const selfAssign = async (b: Booking) => {
    try {
      await updateDoc(doc(db, 'bookings', b.bookingId), {
        status: 'Assigned',
        assignedTo: user.uid,
        assignedToName: user.displayName || user.email || 'Phlebotomist',
      });
    } catch (e) {
      try { handleFirestoreError(e, OperationType.UPDATE, `bookings/${b.bookingId}`); }
      catch (err: any) { onError(err); }
    }
  };

  const transition = async (b: Booking, next: BookingStatus) => {
    try {
      await updateDoc(doc(db, 'bookings', b.bookingId), { status: next });
      // Mirror the admin path: notify the customer when a booking is completed.
      // Rule allows phleb-create of REPORT_READY only when assignedTo == self,
      // which is always true here since this is the phleb's own queue card.
      if (next === 'Completed' && b.userId) {
        await addDoc(collection(db, 'notifications'), {
          bookingId: b.bookingId,
          userId: b.userId,
          type: 'REPORT_READY',
          createdAt: serverTimestamp(),
        });
      }
    } catch (e) {
      try { handleFirestoreError(e, OperationType.UPDATE, `bookings/${b.bookingId}`); }
      catch (err: any) { onError(err); }
    }
  };

  const saveTests = async (b: Booking, newTests: string[]) => {
    const ecgAddon = eligibleForEcgAddon(newTests) ? (b.ecgAddon ?? false) : false;
    const newPrice = computeBookingPrice(newTests, ecgAddon);
    try {
      await updateDoc(doc(db, 'bookings', b.bookingId), {
        testNames: newTests,
        price: newPrice,
        ecgAddon,
      });
    } catch (e) {
      try { handleFirestoreError(e, OperationType.UPDATE, `bookings/${b.bookingId}`); }
      catch (err: any) { onError(err); }
    }
  };

  const editingBooking = editingBookingId
    ? [...myBookings, ...unassigned].find(b => b.bookingId === editingBookingId) || null
    : null;

  // Includes packages + admin-added custom items + ECG add-on for both old and new bookings.
  // Legacy bookings (no customTests) yield the persisted b.price, which is what's already shown.
  const expectedRevenue = active.reduce((sum, b) => {
    const computed = computeBookingTotal(b.testNames || [], b.customTests, !!b.ecgAddon);
    return sum + (computed || b.price || 0);
  }, 0);

  // What's "in hand" for today: any own booking dated today whose status is
  // Collected, Processing, or Completed — the sample has been taken so the
  // money is effectively collected.
  const collectedToday = myBookings.reduce((sum, b) => {
    if (b.bookingDate !== todayISO) return sum;
    if (b.status !== 'Collected' && b.status !== 'Processing' && b.status !== 'Completed') return sum;
    const computed = computeBookingTotal(b.testNames || [], b.customTests, !!b.ecgAddon);
    return sum + (computed || b.price || 0);
  }, 0);

  return (
    <div className="space-y-6 sm:space-y-7">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] sm:text-[26px] font-semibold tracking-tight leading-[1.2] text-[var(--color-text-primary)]">
            My Queue
          </h1>
          <p className="mt-0.5 text-[13px] text-[var(--color-text-secondary)]">
            {active.length} assigned · {unassigned.length} unclaimed
          </p>
        </div>
        <button
          onClick={() => setNewBookingOpen(true)}
          className="inline-flex items-center gap-1.5 h-10 px-3.5 sm:px-4 rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white text-[13px] font-medium tracking-tight hover:bg-[var(--color-accent-hover)] transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New Booking</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Today's Assignments" value={active.length} icon={<Calendar className="w-5 h-5 text-blue-500" />} />
        <StatCard title="Unassigned Queue" value={unassigned.length} icon={<AlertTriangle className="w-5 h-5 text-amber-500" />} />
        <StatCard title="Expected Revenue" value={`₹${expectedRevenue.toLocaleString()}`} icon={<TrendingUp className="w-5 h-5 text-emerald-500" />} />
        <StatCard title="Collected Today" value={`₹${collectedToday.toLocaleString()}`} icon={<CheckCircle className="w-5 h-5 text-emerald-600" />} />
      </div>

      <MyScheduleWidget staff={ownStaff} config={config} />

      <section>
        <h3 className="text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em] mb-3">
          Today's Assignments ({active.length})
        </h3>
        {active.length === 0 ? (
          <div className="text-xs text-text-muted bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-xl p-6 text-center">
            No active assignments. Self-assign from the queue below.
          </div>
        ) : (
          <div className="space-y-3">
            {active.map(b => (
              <PhlebBookingCard
                key={b.bookingId}
                booking={b}
                mode="assigned"
                onEditTests={() => setEditingBookingId(b.bookingId)}
                onMarkCollected={() => transition(b, 'Collected')}
                onMarkProcessing={() => transition(b, 'Processing')}
                onMarkCompleted={() => transition(b, 'Completed')}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em] mb-3">
          Unassigned Queue ({unassigned.length})
        </h3>
        {unassigned.length === 0 ? (
          <div className="text-xs text-text-muted bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-xl p-6 text-center">
            No unassigned bookings in the queue.
          </div>
        ) : (
          <div className="space-y-3">
            {unassigned.map(b => (
              <PhlebBookingCard
                key={b.bookingId}
                booking={b}
                mode="queue"
                onSelfAssign={() => selfAssign(b)}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <button
          onClick={() => setShowCompleted(v => !v)}
          className="text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em] mb-3 flex items-center gap-2 hover:text-text-dark"
        >
          {showCompleted ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Completed Today ({completedToday.length})
        </button>
        {showCompleted && completedToday.map(b => (
          <PhlebBookingCard key={b.bookingId} booking={b} mode="completed" />
        ))}
      </section>

      {editingBooking && (
        <TestPickerModal
          booking={editingBooking}
          onClose={() => setEditingBookingId(null)}
          onSave={(tests) => { saveTests(editingBooking, tests); setEditingBookingId(null); }}
        />
      )}

      {newBookingOpen && (
        <NewBookingModal
          staffRole="phlebotomist"
          staffName={user.displayName || user.email || "Phlebotomist"}
          onClose={() => setNewBookingOpen(false)}
        />
      )}
    </div>
  );
}

function MyScheduleWidget({ staff, config }: { staff: Staff | null; config: BookingConfig }) {
  if (!staff || !staff.defaultSchedule) return null;
  const days: { key: keyof WeeklySchedule; label: string }[] = [
    { key: 'mon', label: 'Mon' },
    { key: 'tue', label: 'Tue' },
    { key: 'wed', label: 'Wed' },
    { key: 'thu', label: 'Thu' },
    { key: 'fri', label: 'Fri' },
    { key: 'sat', label: 'Sat' },
    { key: 'sun', label: 'Sun' },
  ];
  return (
    <section className="bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-[var(--radius-lg)] p-3 sm:p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em]">
          My Default Schedule
        </h3>
        <span className="text-[10px] text-[var(--color-text-secondary)]">Admin overrides apply per date</span>
      </div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {days.map(({ key, label }) => {
          const phlebStarts = staff.defaultSchedule?.[key] ?? [];
          const dayTemplate = config.slotsByWeekday?.[key] ?? config.slots;
          const visible = dayTemplate.filter(s => phlebStarts.includes(s.start));
          const off = visible.length === 0;
          return (
            <div
              key={key}
              className={cn(
                "rounded-md border px-1.5 py-1.5 text-center min-h-[58px]",
                off
                  ? "bg-[var(--color-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-secondary)]"
                  : "bg-[var(--color-surface)] border-[var(--color-border-subtle)]"
              )}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">{label}</div>
              {off ? (
                <div className="text-[10px] mt-1 italic">Off</div>
              ) : (
                <div className="mt-1 space-y-0.5">
                  {visible.map(s => (
                    <div key={s.start} className="text-[9.5px] tabular-nums text-[var(--color-text-primary)] leading-tight">
                      {formatSlotLabel(s)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PhlebBookingCard({
  booking,
  mode,
  onSelfAssign,
  onEditTests,
  onMarkCollected,
  onMarkProcessing,
  onMarkCompleted,
}: {
  booking: Booking;
  mode: 'queue' | 'assigned' | 'completed';
  onSelfAssign?: () => void;
  onEditTests?: () => void;
  onMarkCollected?: () => void;
  onMarkProcessing?: () => void;
  onMarkCompleted?: () => void;
}) {
  const priority = resolvePriority(booking);
  const mapsHref = booking.patientAddress
    ? `https://maps.google.com/?q=${encodeURIComponent(booking.patientAddress)}`
    : null;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-[var(--radius-lg)] p-4 sm:p-5 transition-shadow hover:shadow-[var(--shadow-sm)]">
      <div className="flex items-start justify-between gap-3 sm:gap-4 mb-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="size-10 shrink-0 rounded-full bg-[var(--color-sunken)] flex items-center justify-center border border-[var(--color-border-subtle)] text-[var(--color-accent-hover)]">
            <User className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <span className="font-semibold text-[15px] tracking-tight text-[var(--color-text-primary)]">{booking.patientName}</span>
              <span className="text-[10px] bg-[var(--color-sunken)] ring-1 ring-inset ring-[var(--color-border-subtle)] px-1.5 py-0.5 rounded font-medium uppercase tracking-[0.04em] text-[var(--color-text-secondary)] whitespace-nowrap">
                {booking.patientGender || '—'} · {booking.patientAge || '?'}
              </span>
              {priority && (
                <span className={cn(
                  "text-[10.5px] px-2 py-0.5 rounded-full font-medium tracking-tight capitalize whitespace-nowrap",
                  getPriorityStyle(priority)
                )}>
                  {priority} priority
                </span>
              )}
              <span className={cn(
                "text-[10.5px] px-2 py-0.5 rounded-full font-medium tracking-tight whitespace-nowrap",
                getStatusStyle(booking.status)
              )}>
                {booking.status}
              </span>
            </div>
            <div className="text-[12px] text-[var(--color-text-secondary)] mt-1.5 flex items-center gap-x-3 gap-y-1 flex-wrap">
              <a href={`tel:${booking.patientPhone}`} className="flex items-center gap-1 font-mono hover:text-[var(--color-accent-hover)] transition-colors">
                <Phone className="w-3 h-3" /> {booking.patientPhone || 'no phone'}
              </a>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {booking.bookingDate ? (
                  <span className="text-[var(--color-text-primary)] font-medium">{formatDateLabel(booking.bookingDate, 'en')}</span>
                ) : (
                  <>
                    <span>—</span>
                    <span className="text-[10px] font-medium bg-[var(--color-status-created-bg)] text-[var(--color-status-created)] ring-1 ring-inset ring-[var(--color-status-created-ring)] px-1.5 py-0.5 rounded-full uppercase tracking-[0.04em]">Legacy</span>
                  </>
                )}
              </span>
              <span className="flex items-center gap-1 tabular-nums">
                <Clock className="w-3 h-3" /> {booking.timeSlot || 'no slot'}
              </span>
              {booking.isFastingConfirmed && (
                <span className="flex items-center gap-1 text-[var(--color-status-assigned)] font-medium">
                  <Activity className="w-3 h-3" /> Fasting
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-black text-text-dark">₹{booking.price || 0}</div>
          <div className="text-[9px] text-text-muted uppercase tracking-widest font-bold">Revenue</div>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        <div className="text-xs">
          <span className="font-bold text-text-dark">Tests: </span>
          <span className="text-text-muted">{(booking.testNames || []).join(', ') || '—'}</span>
        </div>
        {booking.patientAddress && (
          <div className="text-xs flex items-start gap-1">
            <MapPin className="w-3 h-3 mt-0.5 shrink-0 text-text-muted" />
            <span className="text-text-muted flex-1">{booking.patientAddress}</span>
            {mapsHref && (
              <a
                href={mapsHref}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] font-bold text-primary hover:underline whitespace-nowrap"
              >
                Open in Maps â†—
              </a>
            )}
          </div>
        )}
        {booking.notes && (
          <div className="text-xs bg-orange-50 border border-orange-100 rounded px-2 py-1.5 text-orange-700">
            <span className="font-bold">Note: </span>{booking.notes}
          </div>
        )}
      </div>

      {mode !== 'completed' && (
        <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-[var(--color-border-subtle)]">
          {mode === 'queue' && (
            <button
              onClick={onSelfAssign}
              className="inline-flex items-center justify-center h-9 px-3.5 bg-[var(--color-accent)] text-white text-[13px] font-medium tracking-tight rounded-[var(--radius-md)] hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              Self-Assign
            </button>
          )}
          {mode === 'assigned' && (
            <>
              <button
                onClick={onEditTests}
                className="inline-flex items-center justify-center h-9 px-3 bg-[var(--color-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] text-[12.5px] font-medium tracking-tight rounded-[var(--radius-md)] hover:bg-[var(--color-border-subtle)] transition-colors"
              >
                Edit Tests
              </button>
              {booking.status === 'Assigned' && (
                <button
                  onClick={onMarkCollected}
                  className="inline-flex items-center justify-center h-9 px-3 bg-[var(--color-status-collected)] text-white text-[12.5px] font-medium tracking-tight rounded-[var(--radius-md)] hover:opacity-90 transition-opacity"
                >
                  Mark Collected
                </button>
              )}
              {booking.status === 'Collected' && (
                <button
                  onClick={onMarkProcessing}
                  className="inline-flex items-center justify-center h-9 px-3 bg-[var(--color-status-processing)] text-white text-[12.5px] font-medium tracking-tight rounded-[var(--radius-md)] hover:opacity-90 transition-opacity"
                >
                  Mark Processing
                </button>
              )}
              {booking.status === 'Processing' && (
                <button
                  onClick={onMarkCompleted}
                  className="inline-flex items-center justify-center h-9 px-3 bg-[var(--color-status-completed)] text-white text-[12.5px] font-medium tracking-tight rounded-[var(--radius-md)] hover:opacity-90 transition-opacity"
                >
                  Mark Completed
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TestPickerModal({
  booking,
  onClose,
  onSave,
}: {
  booking: Booking;
  onClose: () => void;
  onSave: (tests: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>(booking.testNames || []);
  // English bookable catalog — family plans excluded (phone-only, not bookable in app).
  const englishTests = PACKAGES.filter(p => p.category !== 'family').map(p => p.name_en);

  const toggle = (name: string) => {
    setSelected(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };

  // Preserve existing ecgAddon for the total preview; cleared on save if not eligible.
  const ecgAddon = eligibleForEcgAddon(selected) ? (booking.ecgAddon ?? false) : false;
  const total = computeBookingPrice(selected, ecgAddon);

  return (
    <div className="fixed inset-0 bg-[var(--color-overlay)] backdrop-blur-[2px] z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="bg-[var(--color-surface)] rounded-t-[var(--radius-xl-2)] sm:rounded-[var(--radius-lg)] border-t sm:border border-[var(--color-border-subtle)] shadow-[var(--shadow-lg)] sm:max-w-md w-full max-h-[92vh] sm:max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex sm:hidden justify-center pt-2.5 pb-1" aria-hidden>
          <span className="h-1 w-9 rounded-full bg-[var(--color-border-strong)]" />
        </div>
        <header className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[16px] font-semibold tracking-tight text-[var(--color-text-primary)]">Edit Tests</h3>
            <p className="text-[12px] text-[var(--color-text-secondary)] truncate"><span className="font-mono">{booking.bookingId.slice(0, 8)}</span> · {booking.patientName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-sunken)] transition-colors" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="flex-1 overflow-auto scroll-area px-4 sm:px-5 py-4 space-y-2">
          {englishTests.map(name => {
            const isOn = selected.includes(name);
            return (
              <button
                key={name}
                onClick={() => toggle(name)}
                className={cn(
                  "w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-[var(--radius-md)] border transition-colors text-left",
                  isOn
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                    : "border-[var(--color-border-subtle)] hover:bg-[var(--color-sunken)]"
                )}
              >
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium tracking-tight text-[var(--color-text-primary)] truncate">{name}</div>
                  <div className="text-[11.5px] text-[var(--color-text-secondary)] truncate">{getPackageByName(name)?.tests ?? ''}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[13px] font-semibold tabular-nums text-[var(--color-text-primary)]">₹{getPackagePrice(name)}</span>
                  {isOn ? <CheckCircle2 className="w-5 h-5 text-[var(--color-accent)]" /> : <Plus className="w-5 h-5 text-[var(--color-text-tertiary)]" />}
                </div>
              </button>
            );
          })}
        </div>
        <footer className="px-4 sm:px-5 py-3 border-t border-[var(--color-border-subtle)] flex items-center justify-between gap-3">
          <div className="text-[13px]">
            <span className="text-[var(--color-text-secondary)]">Total </span>
            <span className="font-semibold tabular-nums text-[var(--color-text-primary)]">₹{total}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center h-9 px-3 text-[13px] font-medium tracking-tight text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-sunken)] rounded-[var(--radius-md)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(selected)}
              className="inline-flex items-center justify-center h-9 px-4 bg-[var(--color-accent)] text-white text-[13px] font-medium tracking-tight rounded-[var(--radius-md)] hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              Save
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string, value: any, icon: React.ReactNode }) {
  // Delegate to the new ui/ primitive — keeps the legacy call sites working
  // while every dashboard inherits the refined visual style.
  return <UiStatCard label={title} value={value} icon={icon} />;
}

function resolvePriority(b: Booking): 'high' | 'medium' | 'low' | null {
  if (b.priority) return b.priority;
  switch (b.status) {
    case 'Created': return 'high';
    case 'Assigned': return 'medium';
    case 'Collected':
    case 'Processing': return 'low';
    case 'Completed': return null;
    default: return 'medium';
  }
}

function getPriorityStyle(p: 'high' | 'medium' | 'low' | null) {
  // Subtle tinted pills with a 1px inset ring for definition.
  switch (p) {
    case 'high':   return 'bg-[var(--color-status-danger-bg)] text-[var(--color-status-danger)] ring-1 ring-inset ring-[var(--color-status-danger-ring)]';
    case 'medium': return 'bg-[var(--color-status-created-bg)] text-[var(--color-status-created)] ring-1 ring-inset ring-[var(--color-status-created-ring)]';
    case 'low':    return 'bg-[var(--color-sunken)] text-[var(--color-text-secondary)] ring-1 ring-inset ring-[var(--color-border-subtle)]';
    default:       return 'bg-[var(--color-sunken)] text-[var(--color-text-tertiary)] ring-1 ring-inset ring-[var(--color-border-subtle)]';
  }
}

function getStatusStyle(status: BookingStatus) {
  // Semantic booking-lifecycle tints — every state has matching bg + text + ring.
  switch (status) {
    case 'Created':    return 'bg-[var(--color-status-created-bg)] text-[var(--color-status-created)] ring-1 ring-inset ring-[var(--color-status-created-ring)]';
    case 'Assigned':   return 'bg-[var(--color-status-assigned-bg)] text-[var(--color-status-assigned)] ring-1 ring-inset ring-[var(--color-status-assigned-ring)]';
    case 'Collected':  return 'bg-[var(--color-status-collected-bg)] text-[var(--color-status-collected)] ring-1 ring-inset ring-[var(--color-status-collected-ring)]';
    case 'Processing': return 'bg-[var(--color-status-processing-bg)] text-[var(--color-status-processing)] ring-1 ring-inset ring-[var(--color-status-processing-ring)]';
    case 'Completed':  return 'bg-[var(--color-status-completed-bg)] text-[var(--color-status-completed)] ring-1 ring-inset ring-[var(--color-status-completed-ring)]';
    default:           return 'bg-[var(--color-sunken)] text-[var(--color-text-tertiary)] ring-1 ring-inset ring-[var(--color-border-subtle)]';
  }
}

// --- WHATSAPP SIMULATOR ---

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  buttons?: string[];
}

export function WhatsAppSimulator({ userId }: { userId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [step, setStep] = useState<ChatStep>('LANGUAGE_SELECTION');
  const [language, setLanguage] = useState<Language | null>(null);
  const [patients, setPatients] = useState<PatientProfile[]>([]);
  const [userName, setUserName] = useState<string>('');
  const [bookingData, setBookingData] = useState<Partial<Booking>>({
    status: 'Created',
    testNames: []
  });
  const [isOnlyChecking, setIsOnlyChecking] = useState(false);
  const [inputVisible, setInputVisible] = useState(true);
  const [inputText, setInputText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const t = language ? TRANSLATIONS[language] : TRANSLATIONS['en'];
  const config = useBookingConfig();

  const resetSimulator = (quiet = false) => {
    setMessages([]);
    setStep('MAIN_MENU');
    setIsOnlyChecking(false);
    setBookingData({ status: 'Created', testNames: [] });
    if (!quiet) {
      if (language) {
        const langT = TRANSLATIONS[language];
        addBotMessage(`ðŸ‘‹ ${langT.welcome}\n${langT.menuHeader}`, (Object.values(langT.options) as string[]).concat([langT.backToMainMenu, langT.endSession]));
      } else {
        setStep('LANGUAGE_SELECTION');
        setInputVisible(true);
      }
    }
  };

  useEffect(() => {
    const initSimulator = async () => {
      let detectedLang: Language | null = null;
      let detectedName = '';

      try {
        // Fetch base user profile (language pref)
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const profile = userSnap.data();
          if (profile.language) {
            setLanguage(profile.language);
            setUserName(profile.name || 'User');
            detectedLang = profile.language as Language;
            detectedName = profile.name || 'User';
          }
        }
      } catch (e) {
        console.error("Error initializing simulator:", e);
      } finally {
        // Auto-start chat on mount so the simulator is never blank,
        // even if the profile fetch failed.
        if (detectedLang) {
          const langT = TRANSLATIONS[detectedLang];
          setStep('MAIN_MENU');
          setMessages([{
            id: 'init',
            text: langT.greetName.replace('{name}', detectedName || 'User') + '\n\n' + langT.returningHeader,
            sender: 'bot',
            timestamp: new Date(),
            buttons: (Object.values(langT.options) as string[]).concat([langT.changeLanguage, langT.endSession]),
          }]);
        } else {
          setMessages([{
            id: 'init',
            text: TRANSLATIONS.en.languageSelectPrompt,
            sender: 'bot',
            timestamp: new Date(),
            buttons: ['English', 'à´®à´²à´¯à´¾à´³à´‚'],
          }]);
        }
        setInputVisible(false);
      }
    };
    initSimulator();

    // Real-time patients listener
    const patientsRef = collection(db, 'users', userId, 'patients');
    return onSnapshot(patientsRef, (snap) => {
      const list = snap.docs.map(d => d.data() as PatientProfile);
      setPatients(list);
    });
  }, [userId]);

  const startChat = () => {
    if (language) {
      setStep('MAIN_MENU');
      const langT = TRANSLATIONS[language];
      addBotMessage(
        langT.greetName.replace('{name}', userName || 'User') + 
        "\n\n" + langT.returningHeader, 
        (Object.values(langT.options) as string[]).concat([langT.changeLanguage, langT.endSession])
      );
    } else {
      addBotMessage(
        TRANSLATIONS.en.languageSelectPrompt,
        ['English', 'à´®à´²à´¯à´¾à´³à´‚']
      );
    }
  };

  useEffect(() => {
    // Listen for report notifications scoped to current user
    const q = query(
      collection(db, 'notifications'), 
      where('userId', '==', userId)
    );
    return onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type !== 'added') return;
        const data = change.doc.data();
        // REPORT_READY notifications are intentionally suppressed: there is no
        // live reports portal yet, so surfacing "Your report is ready / Download …"
        // would be misleading. Re-enable this block when the portal lands.
        if (data.type === 'REPORT_READY') return;
      });
    }, (error) => {
      console.error('Notification listener error:', error);
    });
  }, [language]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addBotMessage = (text: string, buttons?: string[], forceInputVisible?: boolean) => {
    setMessages(prev => [...prev, {
      id: Math.random().toString(),
      text,
      sender: 'bot',
      timestamp: new Date(),
      buttons
    }]);
    
    // Default: hide input if buttons present, unless forceInputVisible is true
    if (forceInputVisible !== undefined) {
      setInputVisible(forceInputVisible);
    } else {
      setInputVisible(!buttons || buttons.length === 0);
    }
  };

  const promptTestSelection = (customMsg?: string) => {
    setStep('TEST_SELECTION');
    const currentTests = bookingData.testNames || [];
    const msg = customMsg || (currentTests.length > 0 ? t.anyAdditionalTests : t.askTest);
    const cart = cartPackagesList(language || 'en');
    const remainingOptions = cart.filter(pkg => !currentTests.includes(pkg));
    addBotMessage(msg, [...remainingOptions, t.doneSelecting, t.cancelBooking], false);
  };

  // Browser-side equivalent of the WhatsApp "share live location" flow.
  // Asks for geolocation, then either continues past AVAILABILITY_CHECK
  // (in-area) or asks for a PIN as fallback (out-of-area / denied / unsupported).
  const requestBrowserLocation = () => {
    const cfg = toServiceAreaConfig(config);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      addBotMessage(t.locationUnavailableBrowser, [t.shareLocation, t.backToMainMenu]);
      return;
    }
    // User-bubble so the chat history reflects the action.
    setMessages(prev => [...prev, {
      id: Math.random().toString(),
      text: t.shareLocation,
      sender: 'user',
      timestamp: new Date(),
    }]);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (isCoordInServiceArea(latitude, longitude, cfg)) {
          addBotMessage(t.available);
          setTimeout(() => {
            if (isOnlyChecking) {
              addBotMessage(t.interestedInBooking, [t.options.book, t.backToMainMenu]);
            } else if (bookingData.testNames && bookingData.testNames.length > 0) {
              routeAfterTestsKnownWeb(bookingData);
            } else {
              promptTestSelection();
            }
          }, 800);
        } else {
          addBotMessage(t.gpsOutsideArea, [t.changeLocation, t.enterAnotherPin, t.shareLocation, t.backToMainMenu]);
        }
      },
      () => {
        // Denied / timeout / hardware unavailable.
        addBotMessage(t.locationUnavailableBrowser, [t.shareLocation, t.backToMainMenu]);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  };

  // Mirrors routeAfterTestsKnown() in botLogic.ts. Decides whether to ask the
  // ECG add-on question or proceed to address/gender. Takes the prospective
  // bookingData (caller's snapshot) since React state updates are async.
  const routeAfterTestsKnownWeb = (current: Partial<Booking>) => {
    const testNames = current.testNames || [];
    if (current.ecgAddon === undefined && eligibleForEcgAddon(testNames)) {
      setStep('ECG_ADDON');
      addBotMessage(t.ecgAddonAsk, [t.ecgAddonYes, t.ecgAddonNo]);
      return;
    }
    const lockedEcg = current.ecgAddon ?? false;
    const newPrice = computeBookingPrice(testNames, lockedEcg);
    setBookingData(prev => ({ ...prev, ecgAddon: lockedEcg, price: newPrice }));

    if (current.patientAddress) {
      setStep('PATIENT_ADDRESS_CONFIRM');
      addBotMessage(t.confirmAddressPrompt.replace('{address}', current.patientAddress), [t.yesCorrect, t.noChange]);
    } else if (current.patientGender) {
      setStep('PATIENT_ADDRESS');
      addBotMessage(t.patientAddress, [t.backToMainMenu], true);
    } else {
      setStep('PATIENT_GENDER');
      addBotMessage(t.patientGender, [...t.genderOptions, t.backToMainMenu]);
    }
  };

  const addUserMessage = (text: string) => {
    setMessages(prev => [...prev, {
      id: Math.random().toString(),
      text,
      sender: 'user',
      timestamp: new Date()
    }]);
  };

  const handleAction = async (value: string) => {
    addUserMessage(value);
    
    // Handle Global Actions (Keywords & Buttons)
    const normalizedVal = value.toLowerCase().trim();
    const isExitCommand = 
      value === t.endSession || 
      ['exit', 'stop', 'bye', 'end'].includes(normalizedVal);

    if (isExitCommand) {
      setStep('LANGUAGE_SELECTION');
      setLanguage(null);
      setIsOnlyChecking(false);
      setMessages([]);
      addBotMessage(t.sessionEnded);
      return;
    }

    const isMenuCommand =
      value === t.mainMenu ||
      value === t.backToMainMenu ||
      value === t.options.book ||
      value === t.options.packages ||
      value === t.options.medicine ||
      value === t.options.faq ||
      value === t.options.call ||
      value === t.options.support ||
      value === 'Back to Menu' ||
      value === 'à´¤à´¿à´°à´¿à´•àµ†' ||
      ['menu', 'home', 'restart'].includes(normalizedVal);

    if (isMenuCommand) {
      if (value === t.options.book) {
        setIsOnlyChecking(false);
        setBookingData({ status: 'Created', testNames: [] }); // Reset for new booking
        if (patients.length > 0) {
          setStep('PATIENT_SELECTION');
          addBotMessage(t.selectPatient, [...patients.map(p => p.name), t.someoneElse, t.backToMainMenu]);
        } else {
          setStep('PATIENT_DETAILS_ENTRY');
          addBotMessage(t.patientDetailsEntry, [t.backToMainMenu], true);
        }
        return;
      }

      if (value === t.options.packages) {
        setStep('PACKAGE_VIEW');
        addBotMessage(t.selectPackageToView, [...browserPackagesList(language || 'en'), t.backToMainMenu]);
        return;
      }

      if (value === t.options.medicine) {
        setStep('MEDICINE_DELIVERY');
        addBotMessage(t.medicineComingSoon, [t.backToMainMenu, t.options.support]);
        return;
      }

      if (value === t.options.faq) {
        setStep('FAQ');
        addBotMessage(t.faqHeader, [...t.faqTopics, t.backToMainMenu]);
        return;
      }

      if (value === t.options.call) {
        const phone = (import.meta as any).env?.VITE_CAREMOL_PHONE || '919000000000';
        setStep('MAIN_MENU');
        addBotMessage(t.callCaremolMessage.replace(/\{phone\}/g, phone), [t.backToMainMenu]);
        return;
      }

      if (value === t.options.support) {
        const phone = (import.meta as any).env?.VITE_CAREMOL_PHONE || '919000000000';
        const message = encodeURIComponent("Hello CareMol, I need support with my booking.");
        window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
        setStep('MAIN_MENU');
        addBotMessage(t.supportResponse, [t.backToMainMenu]);
        return;
      }

      setStep('MAIN_MENU');
      setIsOnlyChecking(false);
      setBookingData({ status: 'Created', testNames: [] }); // Clear partially filled data
      addBotMessage(t.returningHeader, (Object.values(t.options) as string[]).concat([t.changeLanguage, t.endSession]));
      return;
    }

    if (value === t.cancelBooking || normalizedVal === 'cancel') {
      setStep('CONFIRM_CANCEL');
      addBotMessage(t.confirmCancelHeader, [t.yesCancel, t.continueBooking]);
      return;
    }

    // Guard: Prevent stale buttons from being taken as free-text input
    const systemOptionButtons = Object.values(t.options);
    const staleButtons = [...systemOptionButtons, ...browserPackagesList(language || 'en'), ...t.slots, t.changeLanguage, t.doneSelecting];
    const freeTextSteps: ChatStep[] = ['PATIENT_DETAILS_ENTRY', 'PATIENT_ADDRESS', 'AVAILABILITY_CHECK'];

    if (freeTextSteps.includes(step) && staleButtons.includes(value)) {
      addBotMessage(
        language === 'en' ? "Please provide the requested information or cancel the booking." : "à´¦à´¯à´µà´¾à´¯à´¿ à´†à´µà´¶àµà´¯à´ªàµà´ªàµ†à´Ÿàµà´Ÿ à´µà´¿à´µà´°à´™àµà´™àµ¾ à´¨àµ½à´•àµà´• à´…à´²àµà´²àµ†à´™àµà´•à´¿àµ½ à´¬àµà´•àµà´•à´¿à´‚à´—àµ à´±à´¦àµà´¦à´¾à´•àµà´•àµà´•.",
        [t.cancelBooking],
        true
      );
      return;
    }

    // Process Logic
    setTimeout(async () => {
      switch (step) {
        case 'CONFIRM_CANCEL':
          if (value === t.yesCancel) {
            setStep('MAIN_MENU');
            setBookingData({ status: 'Created', testNames: [] });
            addBotMessage(t.returningHeader, (Object.values(t.options) as string[]).concat([t.changeLanguage, t.endSession]));
          } else {
            setStep('MAIN_MENU');
            addBotMessage(t.menuHeader, (Object.values(t.options) as string[]).concat([t.changeLanguage, t.endSession]));
          }
          break;

        case 'LANGUAGE_SELECTION':
          if (value === 'English' || value === 'à´®à´²à´¯à´¾à´³à´‚') {
            const lang: Language = value === 'English' ? 'en' : 'ml';
            setLanguage(lang);
            const langT = TRANSLATIONS[lang];
            setStep('MAIN_MENU');
            addBotMessage(`ðŸ‘‹ ${langT.welcome}\n${langT.menuHeader}`, (Object.values(langT.options) as string[]).concat([langT.changeLanguage, langT.endSession]));
          } else {
            // Re-prompt if they typed random text instead of clicking language
            addBotMessage(
              t.languageSelectPrompt,
              ['English', 'à´®à´²à´¯à´¾à´³à´‚']
            );
          }
          break;

        case 'MAIN_MENU':
          if (value === t.options.book) {
            setIsOnlyChecking(false);
            setBookingData({ status: 'Created', testNames: [] }); // Reset for new booking
            if (patients.length > 0) {
              setStep('PATIENT_SELECTION');
              addBotMessage(t.selectPatient, [...patients.map(p => p.name), t.someoneElse, t.backToMainMenu]);
            } else {
              setStep('PATIENT_DETAILS_ENTRY');
              addBotMessage(t.patientDetailsEntry, [t.backToMainMenu], true);
            }
          } else if (value === t.options.packages) {
            setStep('PACKAGE_VIEW');
            addBotMessage(t.selectPackageToView, [...browserPackagesList(language || 'en'), t.backToMainMenu]);
          } else if (value === t.options.medicine) {
            setStep('MEDICINE_DELIVERY');
            addBotMessage(t.medicineComingSoon, [t.backToMainMenu, t.options.support]);
          } else if (value === t.options.faq) {
            setStep('FAQ');
            addBotMessage(t.faqHeader, [...t.faqTopics, t.backToMainMenu]);
          } else if (value === t.options.call) {
            const phone = (import.meta as any).env?.VITE_CAREMOL_PHONE || '919000000000';
            addBotMessage(t.callCaremolMessage.replace(/\{phone\}/g, phone), [t.backToMainMenu]);
          } else if (value === t.options.support) {
            const phone = (import.meta as any).env?.VITE_CAREMOL_PHONE || '919000000000';
            const message = encodeURIComponent("Hello CareMol, I need support with my booking.");
            window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
            addBotMessage(t.supportResponse, [t.mainMenu]);
          } else if (value === t.changeLanguage) {
            setStep('LANGUAGE_SELECTION');
            addBotMessage(t.selectLabel, ['English', 'à´®à´²à´¯à´¾à´³à´‚']);
          } else {
            addBotMessage("Coming soon... / à´‰à´Ÿàµ» à´µà´°àµà´¨àµà´¨àµ...", [t.mainMenu, t.endSession]);
          }
          break;

        case 'PACKAGE_VIEW': {
          const lang = language || 'en';
          if (value === t.backToPackages) {
            addBotMessage(t.selectPackageToView, [...browserPackagesList(lang), t.backToMainMenu]);
            break;
          }
          const browserList = browserPackagesList(lang);
          if (!browserList.includes(value)) {
            setStep('MAIN_MENU');
            addBotMessage(t.menuHeader, Object.values(t.options));
            break;
          }
          if (isFamilyPlan(value)) {
            addBotMessage(
              t.familyPlanCallPrompt.replace('{plan}', value),
              [t.options.call, t.backToPackages, t.backToMainMenu]
            );
            break;
          }
          const pkg = getPackageByName(value, lang);
          if (!pkg) {
            setStep('MAIN_MENU');
            addBotMessage(t.menuHeader, Object.values(t.options));
            break;
          }
          setBookingData(prev => {
            const { ecgAddon: _drop, ...rest } = prev;
            return { ...rest, testNames: [value], price: pkg.price };
          });
          setStep('PACKAGE_DETAIL_VIEW');
          addBotMessage(
            formatPackageDetail(pkg, lang),
            [t.bookNow, t.backToPackages, t.backToMainMenu]
          );
          break;
        }

        case 'PACKAGE_DETAIL_VIEW':
          if (value === t.bookNow) {
            setIsOnlyChecking(false);
            if (patients.length > 0) {
                setStep('PATIENT_SELECTION');
                addBotMessage(t.selectPatient, [...patients.map(p => p.name), t.someoneElse, t.backToMainMenu]);
            } else {
                setStep('PATIENT_DETAILS_ENTRY');
                addBotMessage(t.patientDetailsEntry, [t.backToMainMenu], true);
            }
          } else if (value === t.backToPackages) {
            setStep('PACKAGE_VIEW');
            addBotMessage(t.selectPackageToView, [...browserPackagesList(language || 'en'), t.backToMainMenu]);
          } else {
            setStep('MAIN_MENU');
            addBotMessage(t.menuHeader, Object.values(t.options));
          }
          break;

        case 'PATIENT_DETAILS_ENTRY':
          // Simple local parsing for simulator (actual bot uses Gemini)
          const parts = value.split(',').map(s => s.trim());
          const sName = parts[0] || 'Patient';
          const sAge = parseInt(parts[1]) || 30;
          const sPhone = parts[2] || '';

          try {
            // Create patient profile immediately (lead capture).
            const newPatientId = await upsertPatientWeb(
              userId,
              { name: sName, age: sAge, phone: sPhone },
              bookingData.patientId
            );
            setBookingData(prev => ({
              ...prev,
              patientId: newPatientId,
              patientName: sName,
              patientAge: sAge,
              patientPhone: sPhone
            }));
            setStep('AVAILABILITY_CHECK');
            addBotMessage(t.askLocation, [t.shareLocation, t.backToMainMenu], true);
          } catch (e) {
            console.error('[Simulator] Failed to save patient profile', e);
            addBotMessage("âŒ Could not save details. Please try again.", [t.cancelBooking], true);
          }
          break;

        case 'PATIENT_SELECTION':
          const selectedPatient = patients.find(p => p.name === value);
          if (selectedPatient) {
            const merged: Partial<Booking> = {
              ...bookingData,
              patientId: selectedPatient.id,
              patientName: selectedPatient.name,
              patientAge: selectedPatient.age,
              patientGender: selectedPatient.gender,
              patientPhone: selectedPatient.phone,
              patientAddress: selectedPatient.address || ''
            };
            setBookingData(prev => ({
              ...prev,
              patientId: selectedPatient.id,
              patientName: selectedPatient.name,
              patientAge: selectedPatient.age,
              patientGender: selectedPatient.gender,
              patientPhone: selectedPatient.phone,
              patientAddress: selectedPatient.address || ''
            }));
            // Existing patient — skip location check; address is reconfirmed at the end.
            if (bookingData.testNames && bookingData.testNames.length > 0) {
              routeAfterTestsKnownWeb(merged);
            } else {
              promptTestSelection();
            }
          } else {
            // "Someone else" selected (Reset patient specific fields)
            setBookingData(prev => ({
              ...prev,
              patientId: undefined,
              patientName: '',
              patientAge: 0,
              patientGender: 'Male',
              patientPhone: '',
              patientAddress: ''
            }));
            setStep('PATIENT_DETAILS_ENTRY');
            addBotMessage(t.patientDetailsEntry, [t.backToMainMenu], true);
          }
          break;

        case 'AVAILABILITY_CHECK': {
          const inputLoc = value.trim();
          if (inputLoc === t.changeLocation || inputLoc === t.enterAnotherPin) {
            addBotMessage(t.askLocation, [t.shareLocation, t.backToMainMenu], true);
            return;
          }
          if (inputLoc === t.shareLocation) {
            requestBrowserLocation();
            return;
          }
          const cfg = toServiceAreaConfig(config);
          if (isPinInServiceArea(inputLoc, cfg)) {
            addBotMessage(t.available);
            setTimeout(() => {
              if (isOnlyChecking) {
                addBotMessage(t.interestedInBooking, [t.options.book, t.backToMainMenu]);
              } else if (bookingData.testNames && bookingData.testNames.length > 0) {
                routeAfterTestsKnownWeb(bookingData);
              } else {
                promptTestSelection();
              }
            }, 800);
          } else {
            addBotMessage(t.serviceUnavailable, [t.changeLocation, t.enterAnotherPin, t.shareLocation, t.backToMainMenu]);
          }
          break;
        }

        case 'TEST_SELECTION': {
          const lang = language || 'en';
          const cart = cartPackagesList(lang);
          const currentTests = bookingData.testNames || [];

          if (value === t.doneSelecting) {
            if (currentTests.length === 0) {
              addBotMessage(t.selectAtLeastOneTest, [...cart, t.cancelBooking]);
              return;
            }
            routeAfterTestsKnownWeb(bookingData);
          } else if (cart.includes(value)) {
            const newTests = currentTests.includes(value)
              ? currentTests.filter(n => n !== value)
              : [...currentTests, value];
            const newPrice = computeBookingPrice(newTests, false);
            setBookingData(prev => {
              const { ecgAddon: _drop, ...rest } = prev;
              return { ...rest, testNames: newTests, price: newPrice };
            });

            const statusMsg = newTests.length > 0
              ? `${t.selectedTestsPrefix}: ${newTests.join(', ')}\nTotal: ₹${newPrice}\n\n${t.anyAdditionalTests}`
              : t.askTest;
            const remainingOptions = cart.filter(pkg => !newTests.includes(pkg));
            addBotMessage(statusMsg, [...remainingOptions, t.doneSelecting, t.cancelBooking], false);
          } else {
            promptTestSelection();
          }
          break;
        }

        case 'ECG_ADDON': {
          let ecg: boolean | undefined;
          if (value === t.ecgAddonYes) ecg = true;
          else if (value === t.ecgAddonNo) ecg = false;
          if (ecg === undefined) {
            addBotMessage(t.ecgAddonAsk, [t.ecgAddonYes, t.ecgAddonNo]);
            break;
          }
          setBookingData(prev => ({ ...prev, ecgAddon: ecg }));
          routeAfterTestsKnownWeb({ ...bookingData, ecgAddon: ecg });
          break;
        }

        case 'PATIENT_GENDER':
          const internalGender = t.genderMap[value] || 'Other';
          setBookingData(prev => ({ ...prev, patientGender: internalGender as any }));
          if (bookingData.patientId) {
            try {
              await upsertPatientWeb(userId, { gender: internalGender as any }, bookingData.patientId);
            } catch (e) {
              console.error('[Simulator] Failed to update gender on patient', e);
            }
          }
          setStep('PATIENT_ADDRESS');
          addBotMessage(t.patientAddress, [t.backToMainMenu], true);
          break;

        case 'PATIENT_ADDRESS':
          const addrInput = value.trim();
          // Safety: Don't allow main menu button texts as addresses
          const mainOptions = Object.values(t.options);
          if (mainOptions.includes(addrInput) || addrInput === t.changeLanguage || addrInput === t.endSession) {
            addBotMessage(t.patientAddress, [t.cancelBooking], true);
            return;
          }

          setBookingData(prev => ({ ...prev, patientAddress: addrInput }));
          setStep('PATIENT_ADDRESS_CONFIRM');
          addBotMessage(t.confirmAddressPrompt.replace('{address}', addrInput), [t.yesCorrect, t.noChange]);
          break;

        case 'PATIENT_ADDRESS_CONFIRM':
          if (value === t.yesCorrect) {
            if (bookingData.patientId && bookingData.patientAddress) {
              try {
                await upsertPatientWeb(
                  userId,
                  { address: bookingData.patientAddress },
                  bookingData.patientId
                );
              } catch (e) {
                console.error('[Simulator] Failed to update address on patient', e);
              }
            }
            const dates = bookableDates(config);
            const dateLabels = dates.map(d => formatDateLabel(d, language || 'en'));
            setStep('DATE_SELECTION');
            addBotMessage(t.chooseDate, [...dateLabels, t.cancelBooking]);
          } else {
            setStep('PATIENT_ADDRESS');
            addBotMessage(t.patientAddress, [t.backToMainMenu], true);
          }
          break;

        case 'DATE_SELECTION': {
          const dates = bookableDates(config);
          const dateLabels = dates.map(d => formatDateLabel(d, language || 'en'));
          const dIdx = dateLabels.indexOf(value);
          if (dIdx >= 0) {
            const chosenDate = dates[dIdx];
            setBookingData(prev => ({ ...prev, bookingDate: chosenDate }));
            const bookable = filterBookableSlots(slotsForDate(config, chosenDate), chosenDate);
            const slotLabels = bookable.map(s => formatSlotLabel(s, language || 'en'));
            setStep('TIME_SLOT');
            addBotMessage(t.timeSlot, [...slotLabels, t.cancelBooking]);
          } else {
            const advanceMsg = t.advanceLimitError.replace('{n}', String(config.maxAdvanceDays));
            addBotMessage(`${advanceMsg}\n\n${t.chooseDate}`, [...dateLabels, t.cancelBooking]);
          }
          break;
        }

        case 'TIME_SLOT': {
          const chosenDate = bookingData.bookingDate || '';
          const bookable = filterBookableSlots(slotsForDate(config, chosenDate), chosenDate);
          const slotLabels = bookable.map(s => formatSlotLabel(s, language || 'en'));
          const sIdx = slotLabels.indexOf(value);
          if (sIdx < 0) {
            addBotMessage(t.timeSlot, [...slotLabels, t.cancelBooking]);
            return;
          }
          const slot = bookable[sIdx];
          setBookingData(prev => ({
            ...prev,
            slotStart: slot.start,
            slotEnd: slot.end,
            timeSlot: value,
          }));
          setStep('FASTING_CHECK');
          addBotMessage(t.fastingCheck, [t.yesFasting, t.noFasting]);
          break;
        }

        case 'FASTING_CHECK':
          setBookingData(prev => ({ ...prev, isFastingConfirmed: value === t.yesFasting }));
          setStep('NOTES');
          addBotMessage(t.askNotes, [t.none, t.backToMainMenu], true);
          break;

        case 'NOTES':
          const notesText = (value === t.none || value.toLowerCase() === 'none') ? '' : value;
          setBookingData(prev => ({ ...prev, notes: notesText }));
          setStep('CONFIRMATION');
          // Re-calculate price to ensure accuracy
          const finalPrice = computeBookingPrice(bookingData.testNames || [], bookingData.ecgAddon || false);

          const sl = t.summaryLabels;
          const dateLabel = bookingData.bookingDate
            ? formatDateLabel(bookingData.bookingDate, language || 'en')
            : '—';
          const summary = `*${t.confirmHeader}*\n\n${sl.tests}: ${(bookingData.testNames || []).join(', ')}\n${sl.price}: ₹${finalPrice}\n${sl.patient}: ${bookingData.patientName} (${bookingData.patientAge})\n${sl.address}: ${bookingData.patientAddress}\n${sl.date}: ${dateLabel}\n${sl.slot}: ${bookingData.timeSlot || '—'}\n${sl.notes}: ${notesText || t.summaryNoneNotes}`;
          addBotMessage(summary, [t.confirmButton, t.editButton]);
          break;

        case 'CONFIRMATION':
          if (value === t.confirmButton) {
            setStep('PAYMENT');
            addBotMessage(t.paymentHeader, t.paymentOptions);
          } else {
            // Point 7: Edit Details redirects to Main Menu
            setStep('MAIN_MENU');
            addBotMessage(t.menuHeader, (Object.values(t.options) as string[]).concat([t.changeLanguage, t.endSession]));
          }
          break;

        case 'PAYMENT':
          const currentMethod = value.includes('UPI') ? 'UPI' : 'Cash';

          // Invariant: patientId is set by PATIENT_DETAILS_ENTRY or PATIENT_SELECTION.
          if (!bookingData.patientId) {
            console.error('[Simulator] PAYMENT step reached without patientId');
            addBotMessage(t.bookingDetailsMissing, [t.mainMenu]);
            setStep('MAIN_MENU');
            break;
          }

          // Complete the booking in Firestore
          const finalId = generateId();
          const newBooking: any = {
            ...bookingData,
            userId: userId, // CRITICAL: Use current authenticated user's ID
            paymentMethod: currentMethod,
            bookingId: finalId,
            status: 'Created',
            createdAt: serverTimestamp(),
            language: language || 'en',
            bookingSource: 'whatsapp',
          };

          try {
            await setDoc(doc(db, 'bookings', finalId), newBooking);

            await setDoc(doc(db, 'users', userId), {
              userId: userId,
              name: bookingData.patientName, // Keep last patient name as reference
              language: language,
              lastActive: serverTimestamp()
            }, { merge: true });

            // Touch patient updatedAt to surface as recently active.
            await upsertPatientWeb(userId, {}, bookingData.patientId);

            setStep('COMPLETED');
            // Build a Booking-shaped view of the just-written record (serverTimestamp() is
            // a sentinel, not a string — substitute a real ISO for the receipt builder).
            const receipt = buildBookingConfirmation(
              { ...(newBooking as Booking), bookingId: finalId },
              language || 'en'
            );
            addBotMessage(receipt, [t.mainMenu, t.endSession]);
          } catch (e) {
            console.error('Save error:', e);
            addBotMessage(t.bookingFailed);
          }
          break;

        case 'COMPLETED':
          if (value === t.mainMenu) {
            setStep('MAIN_MENU');
            addBotMessage(t.returningHeader, (Object.values(t.options) as string[]).concat([t.changeLanguage, t.endSession]));
          } else if (value === t.endSession) {
            setStep('LANGUAGE_SELECTION');
            setLanguage(null);
            setIsOnlyChecking(false);
            setMessages([]);
            addBotMessage(t.sessionEnded);
          } else {
            addBotMessage(t.phlebMsg, [t.mainMenu, t.endSession]);
          }
          break;

        case 'MEDICINE_DELIVERY':
          // Most exits (Back to Main Menu, Talk to Support) are handled by the global
          // menu handler above; this fallback covers any unrecognized input.
          setStep('MAIN_MENU');
          addBotMessage(t.returningHeader, (Object.values(t.options) as string[]).concat([t.changeLanguage, t.endSession]));
          break;

        case 'FAQ':
          if (t.faqTopics.includes(value)) {
            const answer = t.faqAnswers[value as keyof typeof t.faqAnswers];
            addBotMessage(answer, [t.moreFaqs, t.options.support, t.backToMainMenu]);
          } else if (value === t.moreFaqs) {
            addBotMessage(t.faqHeader, [...t.faqTopics, t.backToMainMenu]);
          } else {
            // Unrecognized input — return to main menu
            setStep('MAIN_MENU');
            addBotMessage(t.returningHeader, (Object.values(t.options) as string[]).concat([t.changeLanguage, t.endSession]));
          }
          break;
      }
    }, 500);
  };

  return (
    <div className="w-[300px] h-[600px] bg-[#000] rounded-xl-3 p-3 border-[8px] border-slate-700 shadow-xl overflow-hidden relative flex flex-col shrink-0">
      {/* WhatsApp Screen */}
      <div className="flex-1 bg-[#E5DDD5] rounded-[28px] overflow-hidden flex flex-col">
        {/* WhatsApp Header */}
        <header className="bg-[#075E54] text-white pt-8 pb-3 px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0">
              <span className="text-[#075E54] font-bold text-xs uppercase tracking-tighter">CM</span>
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-sm leading-tight">CareMol Melattur</span>
              <span className="text-[10px] opacity-70">online</span>
            </div>
          </div>
          <button 
            onClick={() => resetSimulator(true)}
            className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
            title="Reset Chat"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-auto p-3 space-y-3">
          {messages.map((m) => (
            <div key={m.id} className={cn("flex flex-col max-w-[85%]", m.sender === 'user' ? "ml-auto items-end" : "mr-auto items-start")}>
              <div className={cn(
                "p-2.5 rounded-lg text-xs shadow-sm relative",
                m.sender === 'user' ? "bg-[#DCF8C6]" : "bg-white"
              )}>
                <p className="whitespace-pre-wrap">{m.text}</p>
              </div>
              
              {m.buttons && (
                <div className="mt-2 w-full flex flex-col gap-1.5">
                  {m.buttons.map((btn, idx) => (
                    <button
                      key={`${btn}-${idx}`}
                      onClick={() => handleAction(btn)}
                      className="bg-white border border-whatsapp text-whatsapp font-bold text-[10px] py-2 px-3 rounded shadow-sm hover:bg-green-50 transition-colors uppercase tracking-wider"
                    >
                      {btn}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input Area */}
        <footer className="p-2 border-t border-slate-200/50 flex items-center gap-2 bg-white/50 backdrop-blur-sm shrink-0">
          <div className="bg-white flex-1 rounded-full px-3 py-1.5 flex items-center shadow-sm border border-slate-200">
            <input
              type="text"
              placeholder={inputVisible ? "Type message..." : "Or tap a button above…"}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && inputText && (handleAction(inputText), setInputText(''))}
              className="flex-1 bg-transparent border-none focus:ring-0 outline-none text-[11px]"
            />
          </div>
        </footer>
      </div>
    </div>
  );
}

// ============================================================================
// ROUTER-BASED APP (active default export)
// ============================================================================

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ErrorBoundaryProvider, useErrorBoundary } from './context/ErrorContext';
import { AppShell } from './shell/AppShell';
import { SignInRoute } from './routes/SignIn';
import {
  BookingsRoute,
  PatientsRoute,
  StaffRoute as StaffRouteAdmin,
  ScheduleRoute,
  SettingsRoute,
} from './routes/AdminDashboard';
import { QueueRoute } from './routes/Queue';
import { SimulatorRoute } from './routes/Simulator';
import { RootRedirect } from './routes/RootRedirect';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { MyAccountRoute } from './routes/MyAccount';

function AppContent() {
  const { dbError } = useErrorBoundary();
  if (dbError) return <ErrorFallback error={dbError} />;

  return (
    <Routes>
      <Route path="/sign-in" element={<SignInRoute />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<RootRedirect />} />
          <Route path="/bookings" element={<BookingsRoute />} />
          <Route path="/patients" element={<PatientsRoute />} />
          <Route path="/staff" element={<StaffRouteAdmin />} />
          <Route path="/schedule" element={<ScheduleRoute />} />
          <Route path="/settings" element={<SettingsRoute />} />
          <Route path="/queue" element={<QueueRoute />} />
          <Route path="/simulator" element={<SimulatorRoute />} />
          <Route path="/me" element={<MyAccountRoute />} />
          <Route path="*" element={<RootRedirect />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default function App() {
  // One-shot Firestore connectivity probe (preserved from legacy App).
  useEffect(() => {
    getDocFromServer(doc(db, 'test', 'connection')).catch((error: any) => {
      if (error instanceof Error && error.message.includes('the client is offline')) {
        console.error('Firebase client is offline.');
      }
    });
  }, []);

  return (
    <BrowserRouter>
      <ErrorBoundaryProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ErrorBoundaryProvider>
    </BrowserRouter>
  );
}
