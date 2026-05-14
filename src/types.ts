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

export interface Staff {
  uid: string;
  email: string;
  name: string;
  phone?: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
  createdBy?: string;
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
  | 'TIME_SLOT'
  | 'FASTING_CHECK'
  | 'NOTES'
  | 'CONFIRMATION'
  | 'PAYMENT'
  | 'COMPLETED'
  | 'MEDICINE_DELIVERY'
  | 'FAQ';
