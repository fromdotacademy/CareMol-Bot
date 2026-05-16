import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { BookingConfig } from '../types';
import { defaultBookingConfig, rememberBookingConfig } from '../services/slotService';

/**
 * Subscribes to config/booking and exposes the resolved booking config.
 * Falls back to defaultBookingConfig() on missing doc or permission errors.
 */
export function useBookingConfig(): BookingConfig {
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
      },
    );
  }, []);
  return config;
}
