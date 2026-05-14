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
import { geocodeLocation, isWithinRange } from './services/mapsService';
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
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { TRANSLATIONS, TEST_PRICES, PACKAGE_DESCRIPTIONS } from './constants';
import { Booking, BookingStatus, Language, ChatStep, PatientProfile, Staff, StaffRole, BookingConfig, PhlebAvailability, WeeklySchedule, SlotConfig } from './types';
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
} from './services/slotService';

// --- ROLE DETECTION ---
//
// Resolution order:
//   1. Hardcoded bootstrap admins (mirrors firestore.rules.isHardcodedAdmin) so
//      access cannot be lost if the staff collection is wiped.
//   2. staff/{uid} record with role + active flag.
//   3. Otherwise: customer (sees the WhatsApp simulator only).
const HARDCODED_ADMIN_EMAILS = new Set([
  'tubejaf@gmail.com',
  'fromdotacademy@gmail.com',
]);

type ResolvedRole = StaffRole | 'customer';

function useStaffRole(user: FirebaseUser | null): { role: ResolvedRole | null; loading: boolean } {
  const [role, setRole] = useState<ResolvedRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRole(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    if (user.email && HARDCODED_ADMIN_EMAILS.has(user.email)) {
      setRole('admin');
      setLoading(false);
      return;
    }
    const ref = doc(db, 'staff', user.uid);
    return onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Staff;
          setRole(data.active === false ? 'customer' : data.role);
        } else {
          setRole('customer');
        }
        setLoading(false);
      },
      () => {
        setRole('customer');
        setLoading(false);
      }
    );
  }, [user]);

  return { role, loading };
}

// --- BOOKING CONFIG ---
//
// Subscribes to the singleton config/booking doc with the slot template and
// max-advance window. Falls back to defaultBookingConfig() if absent so the
// UI still renders. Also populates the in-memory cache in slotService so any
// non-React caller in this process sees fresh values.
function useBookingConfig(): BookingConfig {
  const [config, setConfig] = useState<BookingConfig>(defaultBookingConfig());
  useEffect(() => {
    const ref = doc(db, 'config', 'booking');
    return onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<BookingConfig>;
          const merged: BookingConfig = { ...defaultBookingConfig(), ...data };
          setConfig(merged);
          rememberBookingConfig(merged);
        } else {
          setConfig(defaultBookingConfig());
        }
      },
      () => {
        // Permission denied or other read error — keep the fallback config.
      }
    );
  }, []);
  return config;
}

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

// --- PATIENT PROFILE HELPER ---

// Create or update a patient profile under users/{userId}/patients/{patientId}.
// Mirrors upsertPatientProfile in src/services/botLogic.ts.
async function upsertPatientWeb(
  userId: string,
  fields: Partial<PatientProfile>,
  existingId?: string
): Promise<string> {
  const patientId = existingId || generateId('PT');
  const ref = doc(db, 'users', userId, 'patients', patientId);
  const payload: any = {
    ...fields,
    id: patientId,
    userId,
    updatedAt: serverTimestamp(),
  };
  if (!existingId) payload.createdAt = serverTimestamp();
  await setDoc(ref, payload, { merge: true });
  return patientId;
}

// --- ERROR BOUNDARY ---

function ErrorFallback({ error }: { error: Error }) {
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

// --- MAIN APP COMPONENT ---

export default function App() {
  const [view, setView] = useState<'dashboard' | 'simulator'>('dashboard');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [dbError, setDbError] = useState<Error | null>(null);
  const { role, loading: roleLoading } = useStaffRole(user);

  useEffect(() => {
    // Connection test
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error: any) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. The client is offline.");
        }
      }
    };
    testConnection();

    onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
  }, []);

  const loginWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error(e);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error(e);
    }
  };

  if (dbError) return <ErrorFallback error={dbError} />;

  if (!isAuthReady) return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#F8FAFC]">
      <motion.div 
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      >
        <RefreshCw className="w-8 h-8 text-blue-600" />
      </motion.div>
    </div>
  );

  return (
    <div className="h-screen w-screen bg-bg-app p-6 flex items-center justify-center overflow-hidden font-sans">
      <div className="w-full max-w-7xl h-full flex gap-6">
        
        {!user ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-xl-2 border border-border-subtle p-12 text-center shadow-xl">
            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center text-primary mb-8">
              <LogIn className="w-10 h-10" />
            </div>
            <h2 className="text-3xl font-black text-text-dark mb-4 tracking-tight">Access Secure Dashboard</h2>
            <p className="text-text-muted mb-10 max-w-md text-lg">Experience real-time sample collection management and chatbot simulation.</p>
            <button 
              onClick={loginWithGoogle}
              className="bg-primary text-white px-10 py-5 rounded-2xl font-bold flex items-center gap-4 hover:opacity-90 transition-opacity shadow-2xl shadow-primary/30"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6 bg-white p-0.5 rounded" alt="Google" />
              Sign in with Google
            </button>
          </div>
        ) : (
          <>
            {/* Phone Column - Always Visible */}
            <div className="hidden lg:flex flex-col items-center justify-center w-[340px] shrink-0">
              <WhatsAppSimulator userId={user.uid} />
              <p className="mt-4 text-xs font-semibold text-text-muted uppercase tracking-widest">User Interface: WhatsApp Chatbot</p>
            </div>

            {/* Dashboard Column */}
            <div className="flex-1 bg-white rounded-xl-2 border border-border-subtle flex flex-col shadow-sm overflow-hidden">
              {/* Header */}
              <header className="p-8 border-b border-border-subtle flex items-center justify-between shrink-0">
                <div>
                  <h1 className="text-2xl font-bold text-primary">
                    {role === 'phlebotomist' ? 'CareMol Phlebotomist' : 'CareMol Admin'}
                  </h1>
                  <p className="text-sm text-text-muted">Home Sample Collection | Melattur Center</p>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-sm font-bold text-text-dark">{format(new Date(), 'MMM dd, yyyy')}</p>
                    <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Last updated: {format(new Date(), 'HH:mm aa')}</p>
                  </div>
                  <div className="flex items-center gap-3 pr-4 border-r border-border-subtle">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center border border-border-subtle overflow-hidden">
                      {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <User className="w-5 h-5 text-primary" />}
                    </div>
                    <button onClick={logout} className="text-text-muted hover:text-red-500 transition-colors">
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <button 
                    onClick={() => setView(view === 'dashboard' ? 'simulator' : 'dashboard')}
                    className="lg:hidden p-2 bg-slate-100 rounded-lg text-primary border border-border-subtle"
                  >
                    {view === 'dashboard' ? <MessageSquare className="w-5 h-5" /> : <LayoutDashboard className="w-5 h-5" />}
                  </button>
                </div>
              </header>

              <div className="flex-1 overflow-auto p-8">
                <AnimatePresence mode="wait">
                  {view === 'dashboard' || window.innerWidth >= 1024 ? (
                    roleLoading ? (
                      <motion.div
                        key="role-loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="h-full flex items-center justify-center"
                      >
                        <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
                      </motion.div>
                    ) : role === 'admin' ? (
                      <motion.div
                        key="dashboard"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <DashboardView onError={(err) => setDbError(err)} />
                      </motion.div>
                    ) : role === 'phlebotomist' ? (
                      <motion.div
                        key="phleb"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <PhlebotomistDashboard
                          user={user}
                          onError={(err) => setDbError(err)}
                        />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="no-admin"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="h-full flex flex-col items-center justify-center text-center p-8"
                      >
                        <AlertTriangle className="w-12 h-12 text-orange-500 mb-4" />
                        <h3 className="text-xl font-bold text-text-dark mb-2">Staff Access Required</h3>
                        <p className="text-text-muted">The dashboard is reserved for authorized staff. Please use the WhatsApp simulator to book tests.</p>
                      </motion.div>
                    )
                  ) : (
                    <motion.div
                      key="simulator"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center justify-center py-4"
                    >
                      <WhatsAppSimulator userId={user.uid} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <footer className="px-8 py-4 border-t border-border-subtle flex items-center justify-between text-[10px] text-text-muted font-bold uppercase tracking-widest">
                <div>System ID: MLT-004</div>
                <div>User: {user.email}</div>
              </footer>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// --- DASHBOARD VIEW ---

function DashboardView({ onError }: { onError: (err: Error) => void }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [patients, setPatients] = useState<PatientProfile[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [phlebAvailMap, setPhlebAvailMap] = useState<Record<string, PhlebAvailability>>({});
  const [filter, setFilter] = useState<BookingStatus | 'All'>('All');
  const [dateFilter, setDateFilter] = useState<'upcoming' | 'all'>('upcoming');
  const [searchTerm, setSearchTerm] = useState('');
  const [tab, setTab] = useState<'bookings' | 'patients' | 'staff' | 'schedule' | 'settings'>('bookings');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [overrideForBooking, setOverrideForBooking] = useState<Set<string>>(new Set());
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
    const price = tests.reduce((sum, t) => sum + (TEST_PRICES[t] || 0), 0);
    try {
      await updateDoc(doc(db, 'bookings', b.bookingId), { testNames: tests, price });
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
    <div className="space-y-8">
      {/* KPI Top Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Revenue" value={`₹${stats.revenue.toLocaleString()}`} icon={<TrendingUp className="w-5 h-5 text-emerald-500" />} />
        <StatCard title="Action Needed" value={stats.pending} icon={<AlertTriangle className="w-5 h-5 text-amber-500" />} />
        <StatCard title="Samples in Transit" value={stats.inTransit} icon={<Clock className="w-5 h-5 text-blue-500" />} />
        <StatCard title="Completed Today" value={stats.completed} icon={<CheckCircle2 className="w-5 h-5 text-green-500" />} />
      </div>

      {/* Tab Toggle */}
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
      <div className="bg-white rounded-xl border border-border-subtle overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-border-subtle bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex bg-white border border-border-subtle rounded-lg px-3 py-1.5 focus-within:ring-2 ring-primary/20 transition-all items-center gap-2 max-w-sm w-full">
            <Search className="w-4 h-4 text-text-muted" />
            <input 
              type="text" 
              placeholder="Search patient name or phone..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent border-none text-xs outline-none w-full text-text-dark"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            {['All', 'Created', 'Assigned', 'Collected', 'Processing', 'Completed'].map(s => (
              <button
                key={s}
                onClick={() => setFilter(s as any)}
                className={cn(
                  "px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md border transition-all whitespace-nowrap",
                  filter === s
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "bg-white text-text-muted border-border-subtle hover:bg-slate-50"
                )}
              >
                {s}
              </button>
            ))}
            <div className="w-px h-5 bg-border-subtle mx-1" />
            <button
              onClick={() => setDateFilter(d => d === 'upcoming' ? 'all' : 'upcoming')}
              title={dateFilter === 'upcoming' ? 'Showing today + next ' + config.maxAdvanceDays + ' days. Click to show all.' : 'Showing all dates. Click to limit to upcoming.'}
              className={cn(
                "px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md border transition-all whitespace-nowrap flex items-center gap-1",
                dateFilter === 'upcoming'
                  ? "bg-blue-100 text-blue-700 border-blue-200"
                  : "bg-white text-text-muted border-border-subtle hover:bg-slate-50"
              )}
            >
              <Calendar className="w-3 h-3" />
              {dateFilter === 'upcoming' ? 'Upcoming' : 'All dates'}
            </button>
          </div>
        </div>

        {/* Enhanced Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-border-subtle">
                <th className="text-left py-4 px-6 text-[10px] font-black text-text-muted uppercase tracking-widest">Patient Details</th>
                <th className="text-left py-4 px-6 text-[10px] font-black text-text-muted uppercase tracking-widest">Test & Logistics</th>
                <th className="text-left py-4 px-6 text-[10px] font-black text-text-muted uppercase tracking-widest">Revenue & Priority</th>
                <th className="text-left py-4 px-6 text-[10px] font-black text-text-muted uppercase tracking-widest">Status Management</th>
                <th className="text-right py-4 px-6 text-[10px] font-black text-text-muted uppercase tracking-widest">Actions</th>
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
                          "text-[10px] font-black uppercase tracking-widest py-1.5 px-4 rounded-full border-none cursor-pointer outline-none shadow-sm transition-all",
                          getStatusStyle(b.status)
                        )}
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
                              <div className="text-[9px] text-text-muted italic">→ {b.assignedToName} (inactive)</div>
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
      </div>
      )}

      {editingBooking && (
        <TestPickerModal
          booking={editingBooking}
          onClose={() => setEditingBookingId(null)}
          onSave={(tests) => { saveTestsForBooking(editingBooking, tests); setEditingBookingId(null); }}
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
    <div className="bg-white rounded-xl border border-border-subtle overflow-hidden grid grid-cols-1 lg:grid-cols-[320px_1fr]">
      {/* List */}
      <div className="border-r border-border-subtle">
        <div className="p-3 border-b border-border-subtle bg-slate-50/50">
          <div className="flex items-center gap-2 bg-white border border-border-subtle rounded-lg px-3 py-1.5">
            <Search className="w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Search patients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent border-none text-xs outline-none w-full text-text-dark"
            />
          </div>
        </div>
        <div className="max-h-[60vh] overflow-auto divide-y divide-border-subtle">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-text-muted text-xs">No patients yet</div>
          )}
          {filtered.map(p => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={cn(
                "w-full text-left px-4 py-3 hover:bg-primary/5 transition-colors flex items-center gap-3",
                selectedPatientId === p.id && "bg-primary/10"
              )}
            >
              <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center border border-border-subtle">
                <User className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-text-dark truncate">{p.name || 'Unnamed'}</div>
                <div className="text-[10px] text-text-muted truncate">
                  {p.phone || 'no phone'} · {p.userId}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div className="p-6">
        {!selected ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-text-muted py-16">
            <Users className="w-10 h-10 opacity-20 mb-2" />
            <p className="text-sm">Select a patient to view bookings</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold text-text-dark">{selected.name}</h3>
                <p className="text-xs text-text-muted">
                  {selected.gender || '—'} · {selected.age || '?'} yrs · {selected.phone || 'no phone'}
                </p>
                {selected.address && (
                  <p className="text-xs text-text-muted flex items-center gap-1 mt-1">
                    <MapPin className="w-3 h-3" /> {selected.address}
                  </p>
                )}
                <p className="text-[10px] text-text-muted mt-2 uppercase tracking-widest font-bold">
                  Phone account: {selected.userId} · Patient ID: {selected.id}
                </p>
              </div>
              <button
                onClick={() => onSelect(null)}
                className="p-1 text-text-muted hover:text-text-dark"
                title="Clear selection"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <h4 className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-3">
                Bookings ({patientBookings.length})
              </h4>
              {patientBookings.length === 0 ? (
                <div className="text-xs text-text-muted bg-slate-50 border border-border-subtle rounded-lg p-4 text-center">
                  No bookings yet for this patient.
                </div>
              ) : (
                <div className="space-y-2">
                  {patientBookings.map(b => (
                    <div
                      key={b.bookingId}
                      className="flex items-center justify-between border border-border-subtle rounded-lg px-4 py-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-text-dark">
                          {(b.testNames || []).join(', ') || '—'}
                        </div>
                        <div className="text-[10px] text-text-muted mt-0.5 flex items-center gap-2">
                          <span>{b.bookingId}</span>
                          <span>·</span>
                          <span>{b.timeSlot || 'no slot'}</span>
                          <span>·</span>
                          <span>₹{b.price || 0}</span>
                        </div>
                      </div>
                      <span className={cn(
                        "text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded",
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
    uid: string;
    name: string;
    email: string;
    phone: string;
    role: StaffRole;
    defaultSchedule: WeeklySchedule;
  }>({ uid: '', name: '', email: '', phone: '', role: 'phlebotomist', defaultSchedule: defaultWeeklySchedule(config.slots) });
  const [saving, setSaving] = useState(false);
  const [editingScheduleUid, setEditingScheduleUid] = useState<string | null>(null);
  const [editingScheduleDraft, setEditingScheduleDraft] = useState<WeeklySchedule>(emptyWeeklySchedule());
  const [savingSchedule, setSavingSchedule] = useState(false);

  const reset = () => setForm({
    uid: '', name: '', email: '', phone: '', role: 'phlebotomist',
    defaultSchedule: defaultWeeklySchedule(config.slots),
  });

  const submit = async () => {
    if (!form.uid.trim() || !form.email.trim() || !form.name.trim()) return;
    setSaving(true);
    try {
      const payload: any = {
        uid: form.uid.trim(),
        email: form.email.trim(),
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        role: form.role,
        active: true,
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser?.uid || null,
      };
      if (form.role === 'phlebotomist') {
        payload.defaultSchedule = form.defaultSchedule;
      }
      await setDoc(doc(db, 'staff', form.uid.trim()), payload, { merge: true });
      reset();
      setShowForm(false);
    } catch (e) {
      try { handleFirestoreError(e, OperationType.WRITE, `staff/${form.uid}`); }
      catch (err: any) { onError(err); }
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
    <div className="bg-white rounded-xl border border-border-subtle overflow-hidden">
      <div className="p-4 border-b border-border-subtle bg-slate-50/50 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-text-dark">Staff Members</h3>
          <p className="text-xs text-text-muted">Admins and phlebotomists with dashboard access</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 bg-primary text-white text-[11px] font-bold uppercase tracking-wider rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2"
        >
          <Plus className="w-3 h-3" />
          {showForm ? 'Cancel' : 'Add Staff'}
        </button>
      </div>

      {showForm && (
        <div className="p-5 border-b border-border-subtle bg-blue-50/50 space-y-3">
          <p className="text-[10px] text-text-muted uppercase tracking-widest font-bold">
            The staff member must sign in with Google once first so we know their Firebase UID.
            Paste that UID below along with their details.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Firebase UID"
              value={form.uid}
              onChange={(e) => setForm({ ...form, uid: e.target.value })}
              className="px-3 py-2 border border-border-subtle rounded-lg text-sm outline-none focus:border-primary"
            />
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
              placeholder="Phone (optional)"
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
            <div className="bg-white border border-border-subtle rounded-lg p-3">
              <DefaultScheduleEditor
                value={form.defaultSchedule}
                templateSlots={config.slots}
                onChange={(next) => setForm({ ...form, defaultSchedule: next })}
              />
            </div>
          )}
          <div className="flex justify-end">
            <button
              onClick={submit}
              disabled={saving || !form.uid.trim() || !form.email.trim() || !form.name.trim()}
              className="px-4 py-2 bg-primary text-white text-[11px] font-bold uppercase tracking-wider rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Staff Member'}
            </button>
          </div>
        </div>
      )}

      <table className="w-full">
        <thead>
          <tr className="bg-slate-50 border-b border-border-subtle">
            <th className="text-left py-3 px-6 text-[10px] font-black text-text-muted uppercase tracking-widest">Name</th>
            <th className="text-left py-3 px-6 text-[10px] font-black text-text-muted uppercase tracking-widest">Role</th>
            <th className="text-left py-3 px-6 text-[10px] font-black text-text-muted uppercase tracking-widest">Email / Phone</th>
            <th className="text-left py-3 px-6 text-[10px] font-black text-text-muted uppercase tracking-widest">UID</th>
            <th className="text-left py-3 px-6 text-[10px] font-black text-text-muted uppercase tracking-widest">Schedule</th>
            <th className="text-right py-3 px-6 text-[10px] font-black text-text-muted uppercase tracking-widest">Active</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {staff.length === 0 ? (
            <tr><td colSpan={6} className="py-10 text-center text-text-muted text-xs">No staff records yet. Add one to get started.</td></tr>
          ) : staff.map(s => (
            <React.Fragment key={s.uid}>
              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-6 text-sm font-bold text-text-dark">{s.name}</td>
                <td className="py-3 px-6">
                  <span className={cn(
                    "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded",
                    s.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                  )}>
                    {s.role}
                  </span>
                </td>
                <td className="py-3 px-6 text-xs text-text-muted">
                  <div>{s.email}</div>
                  {s.phone && <div className="text-[10px]">{s.phone}</div>}
                </td>
                <td className="py-3 px-6 text-[10px] text-text-muted font-mono">{s.uid}</td>
                <td className="py-3 px-6">
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
                <td className="py-3 px-6 text-right">
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
                  <td colSpan={6} className="px-6 py-4">
                    <DefaultScheduleEditor
                      value={editingScheduleDraft}
                      templateSlots={config.slots}
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
  );
}

// --- DEFAULT SCHEDULE EDITOR ---
//
// 7-row × N-slot checkbox grid for a phlebotomist's weekly default schedule.
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
  templateSlots,
  onChange,
}: {
  value: WeeklySchedule;
  templateSlots: SlotConfig[];
  onChange: (next: WeeklySchedule) => void;
}) {
  const toggleCell = (day: keyof WeeklySchedule, slotStart: string) => {
    const current = value[day] ?? [];
    const has = current.includes(slotStart);
    const next = has ? current.filter(s => s !== slotStart) : [...current, slotStart].sort();
    onChange({ ...value, [day]: next });
  };

  const fillRow = (day: keyof WeeklySchedule) => {
    onChange({ ...value, [day]: templateSlots.map(s => s.start) });
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
              <th className="text-left py-2 pr-3 text-[10px] font-black text-text-muted uppercase tracking-widest">Day</th>
              {templateSlots.map(s => (
                <th key={s.start} className="text-center py-2 px-2 text-[10px] font-bold text-text-dark whitespace-nowrap">
                  {formatSlotLabel(s)}
                </th>
              ))}
              <th className="text-right py-2 pl-3 text-[10px] font-black text-text-muted uppercase tracking-widest">Quick</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {WEEKDAY_LABELS.map(({ key, label }) => {
              const cells = value[key] ?? [];
              return (
                <tr key={key}>
                  <td className="py-1.5 pr-3 font-bold text-text-dark text-xs">{label}</td>
                  {templateSlots.map(s => (
                    <td key={s.start} className="py-1.5 px-2 text-center">
                      <input
                        type="checkbox"
                        checked={cells.includes(s.start)}
                        onChange={() => toggleCell(key, s.start)}
                        className="w-4 h-4 accent-primary cursor-pointer"
                      />
                    </td>
                  ))}
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
  const [maxAdvanceDays, setMaxAdvanceDays] = useState<number>(config.maxAdvanceDays);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // When the prop refreshes (live snapshot), pull the new values in unless
  // the user has unsaved local edits.
  useEffect(() => {
    if (!dirty) {
      setSlots(config.slots);
      setMaxAdvanceDays(config.maxAdvanceDays);
    }
  }, [config, dirty]);

  const validation = useMemo<string | null>(() => {
    if (slots.length === 0) return 'At least one slot is required.';
    const re = /^([01]\d|2[0-3]):[0-5]\d$/;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!re.test(s.start) || !re.test(s.end)) {
        return `Slot ${i + 1}: times must be HH:mm (24-hour).`;
      }
      if (s.start >= s.end) return `Slot ${i + 1}: end must be after start.`;
      if (i > 0 && s.start < slots[i - 1].end) {
        return `Slot ${i + 1}: overlaps with slot ${i}.`;
      }
    }
    if (!Number.isInteger(maxAdvanceDays) || maxAdvanceDays < 1 || maxAdvanceDays > 30) {
      return 'Max advance days must be a whole number between 1 and 30.';
    }
    return null;
  }, [slots, maxAdvanceDays]);

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
        maxAdvanceDays,
        timezone: config.timezone || 'Asia/Kolkata',
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
    <div className="bg-white rounded-xl border border-border-subtle overflow-hidden">
      <div className="p-4 border-b border-border-subtle bg-slate-50/50 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-text-dark flex items-center gap-2">
            <Settings className="w-4 h-4" /> Booking Settings
          </h3>
          <p className="text-xs text-text-muted">Slot template and how far ahead customers can book.</p>
        </div>
        <div className="flex items-center gap-3">
          {savedFlash && (
            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Saved
            </span>
          )}
          <button
            onClick={save}
            disabled={saving || !!validation || !dirty}
            className="px-4 py-2 bg-primary text-white text-[11px] font-bold uppercase tracking-wider rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>

      <div className="p-5 space-y-6">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[10px] font-black text-text-muted uppercase tracking-widest">Slot Template</h4>
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
                <span className="text-text-muted text-sm">→</span>
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
          <h4 className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-3">Booking Window</h4>
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

  // Off-template slots: bookings on this date with a slotStart that isn't in
  // the current template. Surfaced as a separate row in the grid header.
  const offTemplateSlotStarts = useMemo(() => {
    const templateStarts = new Set(config.slots.map(s => s.start));
    const set = new Set<string>();
    bookings.forEach(b => {
      if (b.bookingDate === selectedDate && b.slotStart && !templateStarts.has(b.slotStart) && b.status !== 'Completed') {
        set.add(b.slotStart);
      }
    });
    return Array.from(set).sort();
  }, [bookings, selectedDate, config.slots]);

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
    <div className="bg-white rounded-xl border border-border-subtle overflow-hidden">
      <div className="p-4 border-b border-border-subtle bg-slate-50/50">
        <h3 className="font-bold text-text-dark flex items-center gap-2">
          <Calendar className="w-4 h-4" /> Phlebotomist Schedule
        </h3>
        <p className="text-xs text-text-muted">Per-date availability. Empty doc = staff default schedule applies.</p>
      </div>

      <div className="p-4 border-b border-border-subtle bg-white">
        <div className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-2">Date</div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {dateOptions.map(d => (
            <button
              key={d}
              onClick={() => setSelectedDate(d)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap border transition-colors",
                selectedDate === d
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-text-dark border-border-subtle hover:bg-slate-50"
              )}
            >
              {formatDateLabel(d, 'en')}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-border-subtle">
              <th className="text-left py-3 px-4 text-[10px] font-black text-text-muted uppercase tracking-widest">Phlebotomist</th>
              {config.slots.map(s => (
                <th key={s.start} className="text-center py-3 px-2 text-[10px] font-bold text-text-dark whitespace-nowrap">
                  {formatSlotLabel(s)}
                </th>
              ))}
              {offTemplateSlotStarts.map(start => (
                <th key={`off-${start}`} className="text-center py-3 px-2 text-[10px] font-bold text-amber-700 whitespace-nowrap" title="Off-template slot — booking exists but not in current template">
                  {start} <span className="ml-1 text-[9px] font-black bg-amber-100 px-1 rounded">OFF-TEMPLATE</span>
                </th>
              ))}
              <th className="text-right py-3 px-4 text-[10px] font-black text-text-muted uppercase tracking-widest">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {activePhlebs.length === 0 ? (
              <tr>
                <td colSpan={2 + config.slots.length + offTemplateSlotStarts.length} className="py-10 text-center text-text-muted text-xs">
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
                  {config.slots.map(s => {
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
    </div>
  );
}

function PhlebotomistDashboard({ user, onError }: { user: FirebaseUser; onError: (err: Error) => void }) {
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [unassigned, setUnassigned] = useState<Booking[]>([]);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

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
    } catch (e) {
      try { handleFirestoreError(e, OperationType.UPDATE, `bookings/${b.bookingId}`); }
      catch (err: any) { onError(err); }
    }
  };

  const saveTests = async (b: Booking, newTests: string[]) => {
    const newPrice = newTests.reduce((sum, t) => sum + (TEST_PRICES[t] || 0), 0);
    try {
      await updateDoc(doc(db, 'bookings', b.bookingId), {
        testNames: newTests,
        price: newPrice,
      });
    } catch (e) {
      try { handleFirestoreError(e, OperationType.UPDATE, `bookings/${b.bookingId}`); }
      catch (err: any) { onError(err); }
    }
  };

  const editingBooking = editingBookingId
    ? [...myBookings, ...unassigned].find(b => b.bookingId === editingBookingId) || null
    : null;

  const expectedRevenue = active.reduce((sum, b) => sum + (b.price || 0), 0);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Today's Assignments" value={active.length} icon={<Calendar className="w-5 h-5 text-blue-500" />} />
        <StatCard title="Unassigned Queue" value={unassigned.length} icon={<AlertTriangle className="w-5 h-5 text-amber-500" />} />
        <StatCard title="Expected Revenue" value={`₹${expectedRevenue.toLocaleString()}`} icon={<TrendingUp className="w-5 h-5 text-emerald-500" />} />
      </div>

      <section>
        <h3 className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-3">
          Today's Assignments ({active.length})
        </h3>
        {active.length === 0 ? (
          <div className="text-xs text-text-muted bg-white border border-border-subtle rounded-xl p-6 text-center">
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
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-3">
          Unassigned Queue ({unassigned.length})
        </h3>
        {unassigned.length === 0 ? (
          <div className="text-xs text-text-muted bg-white border border-border-subtle rounded-xl p-6 text-center">
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
          className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-3 flex items-center gap-2 hover:text-text-dark"
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
    </div>
  );
}

function PhlebBookingCard({
  booking,
  mode,
  onSelfAssign,
  onEditTests,
  onMarkCollected,
  onMarkProcessing,
}: {
  booking: Booking;
  mode: 'queue' | 'assigned' | 'completed';
  onSelfAssign?: () => void;
  onEditTests?: () => void;
  onMarkCollected?: () => void;
  onMarkProcessing?: () => void;
}) {
  const priority = resolvePriority(booking);
  const mapsHref = booking.patientAddress
    ? `https://maps.google.com/?q=${encodeURIComponent(booking.patientAddress)}`
    : null;

  return (
    <div className="bg-white border border-border-subtle rounded-xl p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center border border-border-subtle">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-text-dark">{booking.patientName}</span>
              <span className="text-[9px] bg-slate-100 px-2 py-0.5 rounded font-black tracking-tighter uppercase text-text-dark">
                {booking.patientGender || '—'} · {booking.patientAge || '?'}
              </span>
              {priority && (
                <span className={cn(
                  "text-[9px] px-2 py-0.5 rounded font-bold uppercase",
                  getPriorityStyle(priority)
                )}>
                  {priority} priority
                </span>
              )}
              <span className={cn(
                "text-[9px] px-2 py-0.5 rounded font-black uppercase tracking-widest",
                getStatusStyle(booking.status)
              )}>
                {booking.status}
              </span>
            </div>
            <div className="text-[10px] text-text-muted mt-1 flex items-center gap-3 flex-wrap">
              <a href={`tel:${booking.patientPhone}`} className="flex items-center gap-1 hover:text-primary">
                <Phone className="w-3 h-3" /> {booking.patientPhone || 'no phone'}
              </a>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {booking.bookingDate ? (
                  <span className="text-text-dark font-bold">{formatDateLabel(booking.bookingDate, 'en')}</span>
                ) : (
                  <>
                    <span>—</span>
                    <span className="text-[9px] font-black bg-amber-100 text-amber-700 px-1 py-0.5 rounded uppercase tracking-widest">Legacy</span>
                  </>
                )}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> {booking.timeSlot || 'no slot'}
              </span>
              {booking.isFastingConfirmed && (
                <span className="flex items-center gap-1 text-blue-600 font-bold">
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
                Open in Maps ↗
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
        <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-border-subtle">
          {mode === 'queue' && (
            <button
              onClick={onSelfAssign}
              className="px-4 py-2 bg-primary text-white text-[11px] font-bold uppercase tracking-wider rounded-lg hover:opacity-90 transition-opacity"
            >
              Self-Assign
            </button>
          )}
          {mode === 'assigned' && (
            <>
              <button
                onClick={onEditTests}
                className="px-3 py-1.5 bg-slate-100 text-text-dark text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-slate-200 transition-colors"
              >
                Edit Tests
              </button>
              {booking.status === 'Assigned' && (
                <button
                  onClick={onMarkCollected}
                  className="px-3 py-1.5 bg-teal-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg hover:opacity-90 transition-opacity"
                >
                  Mark Collected
                </button>
              )}
              {booking.status === 'Collected' && (
                <button
                  onClick={onMarkProcessing}
                  className="px-3 py-1.5 bg-purple-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg hover:opacity-90 transition-opacity"
                >
                  Mark Processing
                </button>
              )}
              {booking.status === 'Processing' && (
                <span className="text-[10px] font-bold text-purple-700 uppercase tracking-widest">
                  Awaiting admin to mark Completed
                </span>
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
  // English catalog from TEST_PRICES (skip Malayalam duplicates)
  const englishTests = Object.keys(TEST_PRICES).filter(n => /^[A-Za-z0-9 \-/]+$/.test(n));

  const toggle = (name: string) => {
    setSelected(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };

  const total = selected.reduce((sum, n) => sum + (TEST_PRICES[n] || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] flex flex-col overflow-hidden">
        <header className="p-5 border-b border-border-subtle flex items-center justify-between">
          <div>
            <h3 className="font-bold text-text-dark">Edit Tests</h3>
            <p className="text-xs text-text-muted">Booking {booking.bookingId} · {booking.patientName}</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-dark">
            <X className="w-5 h-5" />
          </button>
        </header>
        <div className="flex-1 overflow-auto p-5 space-y-2">
          {englishTests.map(name => {
            const isOn = selected.includes(name);
            return (
              <button
                key={name}
                onClick={() => toggle(name)}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors text-left",
                  isOn ? "border-primary bg-primary/5" : "border-border-subtle hover:bg-slate-50"
                )}
              >
                <div>
                  <div className="font-bold text-sm text-text-dark">{name}</div>
                  <div className="text-[10px] text-text-muted">{PACKAGE_DESCRIPTIONS[name] || ''}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-black text-text-dark">₹{TEST_PRICES[name] || 0}</span>
                  {isOn ? <CheckCircle2 className="w-5 h-5 text-primary" /> : <Plus className="w-5 h-5 text-text-muted" />}
                </div>
              </button>
            );
          })}
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
              onClick={() => onSave(selected)}
              className="px-5 py-2 bg-primary text-white text-[11px] font-bold uppercase tracking-wider rounded-lg hover:opacity-90"
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
  return (
    <div className="bg-white p-5 rounded-xl border border-border-subtle shadow-sm flex items-start justify-between">
      <div>
        <div className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">{title}</div>
        <div className="text-2xl font-black text-text-dark leading-none">{value}</div>
      </div>
      <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center border border-border-subtle">
        {icon}
      </div>
    </div>
  );
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
  switch (p) {
    case 'high': return 'bg-red-100 text-red-600';
    case 'medium': return 'bg-amber-100 text-amber-600';
    case 'low': return 'bg-slate-100 text-slate-600';
    default: return 'bg-slate-100 text-slate-400';
  }
}

function getStatusStyle(status: BookingStatus) {
  switch (status) {
    case 'Created': return 'bg-slate-100 text-slate-600';
    case 'Assigned': return 'bg-blue-100 text-blue-800';
    case 'Collected': return 'bg-teal-100 text-teal-800';
    case 'Processing': return 'bg-purple-100 text-purple-800';
    case 'Completed': return 'bg-green-100 text-green-800';
    default: return 'bg-gray-100 text-gray-500';
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

function WhatsAppSimulator({ userId }: { userId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [step, setStep] = useState<ChatStep>('LANGUAGE_SELECTION');
  const [language, setLanguage] = useState<Language | null>(null);
  const [patients, setPatients] = useState<PatientProfile[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [userName, setUserName] = useState<string>('');
  const [bookingData, setBookingData] = useState<Partial<Booking>>({
    status: 'Created',
    testNames: []
  });
  const [isOnlyChecking, setIsOnlyChecking] = useState(false);
  const [inputVisible, setInputVisible] = useState(true);
  const [inputText, setInputText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const mountTimeRef = useRef(new Date());

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
        addBotMessage(`👋 ${langT.welcome}\n${langT.menuHeader}`, (Object.values(langT.options) as string[]).concat([langT.backToMainMenu, langT.endSession]));
      } else {
        setStep('LANGUAGE_SELECTION');
        setInputVisible(true);
      }
    }
  };

  useEffect(() => {
    const initSimulator = async () => {
      try {
        // Fetch base user profile (language pref)
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const profile = userSnap.data();
          if (profile.language) {
            setLanguage(profile.language);
            setUserName(profile.name || 'User');
          }
        }
      } catch (e) {
        console.error("Error initializing simulator:", e);
      } finally {
        setIsInitializing(false);
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
        "👋 Welcome to CareMol – Care Close to You\nPlease select your language / നിങ്ങളുടെ ഭാഷ തിരഞ്ഞെടുക്കുക:",
        ['English', 'മലയാളം']
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
        if (change.type === 'added') {
          const data = change.doc.data();
          const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
          
          // Only show notification if it happened AFTER the component mounted
          if (data.type === 'REPORT_READY' && language && createdAt > mountTimeRef.current) {
            addBotMessage(
              (TRANSLATIONS[language].success || "✅ Success") + "\n" + 
              (TRANSLATIONS[language].reportReady || "Your report is ready!")
            );
          }
        }
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
    const remainingOptions = t.packagesList.filter(pkg => !currentTests.includes(pkg));
    addBotMessage(msg, [...remainingOptions, t.doneSelecting, t.cancelBooking], false);
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
      value === t.options.availability ||
      value === t.options.support ||
      value === 'Back to Menu' || 
      value === 'തിരികെ' ||
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
        addBotMessage(t.selectPackageToView, [...t.packagesList, t.backToMainMenu]);
        return;
      }

      if (value === t.options.availability) {
        setIsOnlyChecking(true);
        setStep('AVAILABILITY_CHECK');
        addBotMessage(t.askLocation, [t.backToMainMenu], true);
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
    const staleButtons = [...systemOptionButtons, ...t.packagesList, ...t.slots, t.changeLanguage, t.doneSelecting];
    const freeTextSteps: ChatStep[] = ['PATIENT_DETAILS_ENTRY', 'PATIENT_ADDRESS', 'AVAILABILITY_CHECK'];

    if (freeTextSteps.includes(step) && staleButtons.includes(value)) {
      addBotMessage(
        language === 'en' ? "Please provide the requested information or cancel the booking." : "ദയവായി ആവശ്യപ്പെട്ട വിവരങ്ങൾ നൽകുക അല്ലെങ്കിൽ ബുക്കിംഗ് റദ്ദാക്കുക.",
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
          // If this is the trigger message (no bot response yet)
          const botResponded = messages.some(m => m.sender === 'bot');
          if (!botResponded) {
            startChat();
            return;
          }

          if (value === 'English' || value === 'മലയാളം') {
            const lang: Language = value === 'English' ? 'en' : 'ml';
            setLanguage(lang);
            const langT = TRANSLATIONS[lang];
            setStep('MAIN_MENU');
            addBotMessage(`👋 ${langT.welcome}\n${langT.menuHeader}`, (Object.values(langT.options) as string[]).concat([langT.endSession]));
          } else {
            // Re-prompt if they typed random text instead of clicking language
            addBotMessage(
              "Please select your language / നിങ്ങളുടെ ഭാഷ തിരഞ്ഞെടുക്കുക:",
              ['English', 'മലയാളം']
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
            addBotMessage(t.selectPackageToView, [...t.packagesList, t.backToMainMenu]);
          } else if (value === t.options.availability) {
            setIsOnlyChecking(true);
            setStep('AVAILABILITY_CHECK');
            addBotMessage(t.askLocation, [t.backToMainMenu], true);
          } else if (value === t.options.support) {
            const supportNumber = "919000000000"; // REPLACE WITH YOUR REAL NUMBER
            const message = encodeURIComponent("Hello CareMol, I need support with my booking.");
            window.open(`https://wa.me/${supportNumber}?text=${message}`, '_blank');
            addBotMessage("Opening WhatsApp support channel...", [t.mainMenu]);
          } else if (value === t.changeLanguage) {
            setStep('LANGUAGE_SELECTION');
            addBotMessage(t.selectLabel, ['English', 'മലയാളം']);
          } else {
            addBotMessage("Coming soon... / ഉടൻ വരുന്നു...", [t.mainMenu, t.endSession]);
          }
          break;

        case 'PACKAGE_VIEW':
          if (t.packagesList.includes(value)) {
            const desc = PACKAGE_DESCRIPTIONS[value] || "";
            setBookingData(prev => ({ 
              ...prev, 
              testNames: [value], 
              price: TEST_PRICES[value] || 0 
            }));
            setStep('PACKAGE_DETAIL_VIEW');
            addBotMessage(
              `**${value}**\n\n${t.packageIncludes.replace('{details}', desc)}\n\nPrice: ₹${TEST_PRICES[value]}`,
              [t.bookNow, t.backToPackages, t.backToMainMenu]
            );
          } else {
            setStep('MAIN_MENU');
            addBotMessage(t.menuHeader, Object.values(t.options));
          }
          break;

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
            addBotMessage(t.selectPackageToView, [...t.packagesList, t.backToMainMenu]);
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
            addBotMessage(t.askLocation, [t.backToMainMenu], true);
          } catch (e) {
            console.error('[Simulator] Failed to save patient profile', e);
            addBotMessage("❌ Could not save details. Please try again.", [t.cancelBooking], true);
          }
          break;

        case 'PATIENT_SELECTION':
          const selectedPatient = patients.find(p => p.name === value);
          if (selectedPatient) {
            setBookingData(prev => ({
              ...prev,
              patientId: selectedPatient.id,
              patientName: selectedPatient.name,
              patientAge: selectedPatient.age,
              patientGender: selectedPatient.gender,
              patientPhone: selectedPatient.phone,
              patientAddress: selectedPatient.address || ''
            }));
            setStep('AVAILABILITY_CHECK');
            addBotMessage(t.askLocation);
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

        case 'AVAILABILITY_CHECK':
          const inputLoc = value.trim();
          if (inputLoc === t.changeLocation || inputLoc === t.enterAnotherPin) {
            addBotMessage(t.askLocation, [t.backToMainMenu], true);
            return;
          }
          const normalizedInput = inputLoc.replace(/\s/g, '');
          const melatturPin = '679326';
          
          // Fast track known local PINs
          const isKnownLocal = normalizedInput.includes(melatturPin);

          if (isKnownLocal) {
            addBotMessage(t.available);
            setTimeout(() => {
              if (isOnlyChecking) {
                addBotMessage(t.interestedInBooking, [t.options.book, t.backToMainMenu]);
              } else {
                // Avoid duplicate selection if tests already selected via Package View
                if (bookingData.testNames && bookingData.testNames.length > 0) {
                   if (bookingData.patientAddress) {
                     setStep('PATIENT_ADDRESS_CONFIRM');
                     addBotMessage(t.confirmAddressPrompt.replace('{address}', bookingData.patientAddress), [t.yesCorrect, t.noChange]);
                   } else if (bookingData.patientGender) {
                     setStep('PATIENT_ADDRESS');
                     addBotMessage(t.patientAddress, [t.backToMainMenu], true);
                   } else {
                     setStep('PATIENT_GENDER');
                     addBotMessage(t.patientGender, [...t.genderOptions, t.backToMainMenu]);
                   }
                } else {
                   promptTestSelection();
                }
              }
            }, 800);
          } else {
            // Point 5: Service unavailability handling
            addBotMessage(t.serviceUnavailable, [t.changeLocation, t.enterAnotherPin, t.backToMainMenu]);
          }
          break;

        case 'TEST_SELECTION':
          const currentTests = bookingData.testNames || [];
          
          if (value === t.doneSelecting) {
            if (currentTests.length === 0) {
              addBotMessage(t.selectAtLeastOneTest, [...t.packagesList, t.cancelBooking]);
              return;
            }
            if (bookingData.patientAddress) {
                setStep('PATIENT_ADDRESS_CONFIRM');
                addBotMessage(t.confirmAddressPrompt.replace('{address}', bookingData.patientAddress), [t.yesCorrect, t.noChange]);
            } else if (bookingData.patientGender) {
                setStep('PATIENT_ADDRESS');
                addBotMessage(t.patientAddress, [t.backToMainMenu], true);
            } else {
                setStep('PATIENT_GENDER');
                addBotMessage(t.patientGender, [...t.genderOptions, t.backToMainMenu]);
            }
          } else if (t.packagesList.includes(value)) {
            const newTests = currentTests.includes(value) 
              ? currentTests.filter(t => t !== value)
              : [...currentTests, value];
            
            const newPrice = newTests.reduce((sum, test) => sum + (TEST_PRICES[test] || 0), 0);
            
            setBookingData(prev => ({ 
              ...prev, 
              testNames: newTests, 
              price: newPrice 
            }));

            const statusMsg = newTests.length > 0 
              ? `${t.selectedTestsPrefix}: ${newTests.join(', ')}\nTotal: ₹${newPrice}\n\n${t.anyAdditionalTests}`
              : t.askTest;

            const remainingOptions = t.packagesList.filter(pkg => !newTests.includes(pkg));
            addBotMessage(statusMsg, [...remainingOptions, t.doneSelecting, t.cancelBooking], false);
          } else {
            // Re-prompt specifically if they try to type something unknown
            promptTestSelection();
          }
          break;

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
            const dates = getNextNDates(config.maxAdvanceDays);
            const dateLabels = dates.map(d => formatDateLabel(d, language || 'en'));
            setStep('DATE_SELECTION');
            addBotMessage(t.chooseDate, [...dateLabels, t.cancelBooking]);
          } else {
            setStep('PATIENT_ADDRESS');
            addBotMessage(t.patientAddress, [t.backToMainMenu], true);
          }
          break;

        case 'DATE_SELECTION': {
          const dates = getNextNDates(config.maxAdvanceDays);
          const dateLabels = dates.map(d => formatDateLabel(d, language || 'en'));
          const dIdx = dateLabels.indexOf(value);
          if (dIdx >= 0) {
            setBookingData(prev => ({ ...prev, bookingDate: dates[dIdx] }));
            const slotLabels = config.slots.map(s => formatSlotLabel(s, language || 'en'));
            setStep('TIME_SLOT');
            addBotMessage(t.timeSlot, [...slotLabels, t.cancelBooking]);
          } else {
            const advanceMsg = t.advanceLimitError.replace('{n}', String(config.maxAdvanceDays));
            addBotMessage(`${advanceMsg}\n\n${t.chooseDate}`, [...dateLabels, t.cancelBooking]);
          }
          break;
        }

        case 'TIME_SLOT': {
          const slotLabels = config.slots.map(s => formatSlotLabel(s, language || 'en'));
          const sIdx = slotLabels.indexOf(value);
          if (sIdx < 0) {
            addBotMessage(t.timeSlot, [...slotLabels, t.cancelBooking]);
            return;
          }
          const slot = config.slots[sIdx];
          setBookingData(prev => ({
            ...prev,
            slotStart: slot.start,
            slotEnd: slot.end,
            timeSlot: value,
          }));
          setStep('FASTING_CHECK');
          addBotMessage(t.fastingCheck, ['Yes / അതെ', 'No / ഇല്ല']);
          break;
        }

        case 'FASTING_CHECK':
          setBookingData(prev => ({ ...prev, isFastingConfirmed: value.includes('Yes') }));
          setStep('NOTES');
          addBotMessage(t.askNotes, [t.none, t.backToMainMenu], true);
          break;

        case 'NOTES':
          const notesText = (value === t.none || value.toLowerCase() === 'none' || value === 'ഇല്ല') ? '' : value;
          setBookingData(prev => ({ ...prev, notes: notesText }));
          setStep('CONFIRMATION');
          // Re-calculate price to ensure accuracy
          const finalPrice = (bookingData.testNames || []).reduce((sum, test) => sum + (TEST_PRICES[test] || 0), 0);
          
          const dateLabel = bookingData.bookingDate
            ? formatDateLabel(bookingData.bookingDate, language || 'en')
            : '—';
          const summary = `
            *${t.confirmHeader}*\n
            Tests: ${(bookingData.testNames || []).join(', ')}\n
            Price: ₹${finalPrice}\n
            Patient: ${bookingData.patientName} (${bookingData.patientAge})\n
            Gender: ${bookingData.patientGender}\n
            Address: ${bookingData.patientAddress}\n
            Date: ${dateLabel}\n
            Slot: ${bookingData.timeSlot}\n
            Fasting: ${bookingData.isFastingConfirmed ? 'Yes' : 'No'}\n
            Notes: ${notesText || 'None'}
          `;
          addBotMessage(summary, [language === 'en' ? 'Confirm' : 'സ്ഥിരീകരിക്കുക', 'Edit / തിരുത്തുക']);
          break;

        case 'CONFIRMATION':
          if (value === 'Confirm' || value === 'സ്ഥിരീകരിക്കുക') {
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
            addBotMessage("❌ Patient details are missing. Please start the booking again.", [t.mainMenu]);
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
            createdAt: serverTimestamp()
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

            const shareOptions = [t.shareToWhatsApp, t.mainMenu, t.endSession];
            setStep('COMPLETED');
            addBotMessage(`${t.success}\n${t.bookingId}: ${finalId}\n${t.phlebMsg}`, shareOptions);
          } catch (e) {
            console.error('Save error:', e);
            addBotMessage("❌ Failed to save booking. Please check permissions.");
          }
          break;

        case 'COMPLETED':
          if (value === t.mainMenu) {
            setStep('MAIN_MENU');
            addBotMessage(t.returningHeader, (Object.values(t.options) as string[]).concat([t.changeLanguage, t.endSession]));
          } else if (value === t.shareToWhatsApp) {
            // Sharing logic - only share if there's a booking ID
            const msg = encodeURIComponent(`${t.success}!\n${t.bookingId}: ${bookingData.bookingId || 'CM-NEW'}\nPatient: ${bookingData.patientName}\nTests: ${(bookingData.testNames || []).join(', ')}`);
            window.open(`https://wa.me/?text=${msg}`, '_blank');
            addBotMessage(`Ready to share!`, [t.mainMenu, t.endSession, t.shareToWhatsApp]);
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
              placeholder="Type message..."
              disabled={!inputVisible}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && inputText && (handleAction(inputText), setInputText(''))}
              className="flex-1 bg-transparent border-none focus:ring-0 outline-none text-[11px] disabled:opacity-50"
            />
          </div>
        </footer>
      </div>
    </div>
  );
}
