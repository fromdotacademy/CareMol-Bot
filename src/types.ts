export type Language = 'en' | 'ml';

export type BookingStatus = 'Created' | 'Assigned' | 'Collected' | 'Processing' | 'Completed';

export type Priority = 'high' | 'medium' | 'low';

export type StaffRole = 'admin' | 'phlebotomist';

export interface Booking {
  bookingId: string;
  patientId: string;
  userId: string;
  patientName: string;
  patientAge: number;
  patientGender: 'Male' | 'Female' | 'Other';
  patientPhone: string;
  patientAddress: string;
  testNames: string[];
  timeSlot: string;
  bookingDate?: string; // "YYYY-MM-DD" in Asia/Kolkata. Optional only for legacy bookings; required for new writes.
  slotStart?: string;   // "HH:mm" 24h canonical start, e.g. "07:00".
  slotEnd?: string;     // "HH:mm" 24h canonical end, e.g. "08:00".
  status: BookingStatus;
  price: number;
  paymentMethod: 'UPI' | 'Cash';
  isFastingConfirmed: boolean;
  notes?: string;
  createdAt: string;
  priority?: Priority;
  assignedTo?: string; // staff uid (phlebotomist)
  assignedToName?: string;
}

// Weekly default working slots for a phlebotomist. Each array holds slotStart
// values (e.g. ["07:00", "08:00"]). Empty array means off that weekday.
// Per-date overrides live in the phlebAvailability collection.
export interface WeeklySchedule {
  sun: string[];
  mon: string[];
  tue: string[];
  wed: string[];
  thu: string[];
  fri: string[];
  sat: string[];
}

export interface Staff {
  uid: string;
  email: string;
  name: string;
  phone?: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
  createdBy?: string;
  defaultSchedule?: WeeklySchedule;
}

export interface SlotConfig {
  start: string; // "HH:mm" 24h
  end: string;   // "HH:mm" 24h
}

// Singleton at config/booking. Edited by admin via Settings tab; read by both
// bot implementations (cached client-side).
export interface BookingConfig {
  slots: SlotConfig[];
  maxAdvanceDays: number;
  timezone: string; // e.g. "Asia/Kolkata"
  updatedAt?: string;
  updatedBy?: string;
}

// Document at phlebAvailability/{YYYY-MM-DD}_{phlebUid}. Sparse — created only
// when admin deviates from staff.defaultSchedule.
export interface PhlebAvailability {
  date: string;              // "YYYY-MM-DD"
  phlebotomistUid: string;
  phlebotomistName: string;  // denormalized for grid rendering
  workingSlots: string[];    // slotStart values for this date
  unavailable?: boolean;     // true = entire day off (workingSlots ignored)
  updatedAt?: string;
  updatedBy?: string;
}

export interface UserProfile {
  userId: string;
  phoneNumber: string;
  language?: Language;
  name?: string;
  lastActive: string;
}

export interface PatientProfile {
  id: string;
  userId: string;
  name: string;
  age: number;
  gender: 'Male' | 'Female' | 'Other';
  phone: string;
  address?: string;
  createdAt: string;
  updatedAt?: string;
}

export type ChatStep =
  | 'LANGUAGE_SELECTION'
  | 'MAIN_MENU'
  | 'PACKAGE_VIEW'
  | 'PACKAGE_DETAIL_VIEW'
  | 'PATIENT_SELECTION'
  | 'PATIENT_DETAILS_ENTRY'
  | 'AVAILABILITY_CHECK'
  | 'TEST_SELECTION'
  | 'LEAD_CAPTURE_NAME'
  | 'LEAD_CAPTURE_PHONE'
  | 'PATIENT_BASIC_DETAILS'
  | 'CONFIRM_CANCEL'
  | 'PATIENT_NAME'
  | 'PATIENT_NAME_CONFIRM'
  | 'PATIENT_AGE'
  | 'PATIENT_GENDER'
  | 'PATIENT_PHONE'
  | 'PATIENT_PHONE_CONFIRM'
  | 'PATIENT_ADDRESS'
  | 'PATIENT_ADDRESS_CONFIRM'
  | 'DATE_SELECTION'
  | 'TIME_SLOT'
  | 'FASTING_CHECK'
  | 'NOTES'
  | 'CONFIRMATION'
  | 'PAYMENT'
  | 'COMPLETED'
  | 'MEDICINE_DELIVERY'
  | 'FAQ';
