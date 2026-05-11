import React, { useState, useEffect, useRef } from 'react';
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
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { geocodeLocation, isWithinRange } from './services/mapsService';
import { db, auth } from './lib/firebase';
import { 
  collection, 
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
  getDocFromServer
} from 'firebase/firestore';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider,
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { TRANSLATIONS, TEST_PRICES, PACKAGE_DESCRIPTIONS } from './constants';
import { Booking, BookingStatus, Language, ChatStep, PatientProfile } from './types';
import { generateId, cn } from './lib/utils';
import { format } from 'date-fns';

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
                  <h1 className="text-2xl font-bold text-primary">CareMol Admin</h1>
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
                    (user.email === 'tubejaf@gmail.com' || user.email === 'fromdotacademy@gmail.com') ? (
                      <motion.div 
                        key="dashboard"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <DashboardView onError={(err) => setDbError(err)} />
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
                        <h3 className="text-xl font-bold text-text-dark mb-2">Admin Access Required</h3>
                        <p className="text-text-muted">The dashboard is reserved for authorized staff. please use the WhatsApp simulator to book tests.</p>
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
  const [filter, setFilter] = useState<BookingStatus | 'All'>('All');
  const [searchTerm, setSearchTerm] = useState('');

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

  const stats = {
    total: bookings.length,
    revenue: bookings.reduce((acc, b) => acc + (b.price || 0), 0),
    pending: bookings.filter(b => b.status === 'Created' || b.status === 'Assigned').length,
    inTransit: bookings.filter(b => b.status === 'Collected').length,
    completed: bookings.filter(b => b.status === 'Completed').length,
  };

  const filteredBookings = bookings.filter(b => {
    const matchesFilter = filter === 'All' || b.status === filter;
    const matchesSearch = b.patientName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (b.patientPhone && b.patientPhone.includes(searchTerm));
    return matchesFilter && matchesSearch;
  });

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

  const updateTests = async (booking: Booking, mode: 'add' | 'remove') => {
    const testName = prompt(mode === 'add' ? "Enter test name to add:" : "Enter exact test name to remove:");
    if (!testName) return;

    let newTests = [...(booking.testNames || [])];
    if (mode === 'add') {
      newTests.push(testName);
    } else {
      newTests = newTests.filter(t => t !== testName);
    }

    const newPrice = newTests.reduce((sum, t) => sum + (TEST_PRICES[t] || 500), 0);
    
    try {
      await updateDoc(doc(db, 'bookings', booking.bookingId), { 
        testNames: newTests,
        price: newPrice
      });
    } catch (e) {
      onError(e as Error);
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

      {/* Main Content Area */}
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
                          <Clock className="w-3 h-3" /> {b.timeSlot}
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
                    <div className="space-y-1">
                      <div className="text-sm font-black text-text-dark">₹{b.price || 0}</div>
                      <div className="flex items-center gap-2">
                        {b.status === 'Created' && (
                          <span className="text-[9px] bg-red-100 text-red-600 px-2 py-0.5 rounded font-bold uppercase">High Priority</span>
                        )}
                        {b.status === 'Assigned' && (
                          <span className="text-[9px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded font-bold uppercase">Medium Priority</span>
                        )}
                        {b.isFastingConfirmed && (
                           <span className="text-[9px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded font-bold uppercase">Fasting</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6">
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
                      <div className="flex flex-col gap-1">
                        <button 
                          title="Add Test"
                          onClick={() => updateTests(b, 'add')}
                          className="p-1 px-2 text-[9px] bg-slate-100 text-text-dark rounded hover:bg-emerald-50 hover:text-emerald-600 transition-all font-bold uppercase"
                        >
                          + Add Test
                        </button>
                        <button 
                          title="Remove Test"
                          onClick={() => updateTests(b, 'remove')}
                          className="p-1 px-2 text-[9px] bg-slate-100 text-text-dark rounded hover:bg-red-50 hover:text-red-600 transition-all font-bold uppercase"
                        >
                          - Remove
                        </button>
                      </div>
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
          
          setBookingData(prev => ({ 
            ...prev, 
            patientName: sName,
            patientAge: sAge,
            patientPhone: sPhone
          }));
          setStep('AVAILABILITY_CHECK');
          addBotMessage(t.askLocation, [t.backToMainMenu], true);
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
            setStep('TIME_SLOT');
            addBotMessage(t.timeSlot, [...t.slots, t.backToMainMenu]);
          } else {
            setStep('PATIENT_ADDRESS');
            addBotMessage(t.patientAddress, [t.backToMainMenu], true);
          }
          break;

        case 'TIME_SLOT':
          if (!t.slots.includes(value)) {
            addBotMessage(t.timeSlot, [...t.slots, t.backToMainMenu]);
            return;
          }
          setBookingData(prev => ({ ...prev, timeSlot: value }));
          setStep('FASTING_CHECK');
          addBotMessage(t.fastingCheck, ['Yes / അതെ', 'No / ഇല്ല']);
          break;

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
          
          const summary = `
            *${t.confirmHeader}*\n
            Tests: ${(bookingData.testNames || []).join(', ')}\n
            Price: ₹${finalPrice}\n
            Patient: ${bookingData.patientName} (${bookingData.patientAge})\n
            Gender: ${bookingData.patientGender}\n
            Address: ${bookingData.patientAddress}\n
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
            // Save Booking
            await setDoc(doc(db, 'bookings', finalId), newBooking);
            
            // 1. Save/Update Base User Profile for language persistence
            await setDoc(doc(db, 'users', userId), {
              userId: userId,
              name: bookingData.patientName, // Keep last patient name as reference
              language: language,
              lastActive: serverTimestamp()
            }, { merge: true });

            // 2. Save/Update Patient Profile for this specific patient
            // If bookingData.patientId exists, we update the existing one.
            // Otherwise, we create a new one.
            const targetPatientId = bookingData.patientId || generateId();
            const patientRef = doc(db, 'users', userId, 'patients', targetPatientId);
            
            const patientData: PatientProfile = {
              id: targetPatientId,
              userId: userId,
              name: bookingData.patientName,
              age: bookingData.patientAge,
              gender: bookingData.patientGender,
              phone: bookingData.patientPhone,
              address: bookingData.patientAddress,
              createdAt: serverTimestamp()
            } as any;

            await setDoc(patientRef, patientData, { merge: true });

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
