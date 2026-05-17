import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import type { User as FirebaseUser } from 'firebase/auth';
import { db } from '../lib/firebase';
import type { Staff } from '../types';

/**
 * Subscribes to the signed-in user's own staff/{uid} doc.
 * Returns null for bootstrap admins (no staff record) and during loading.
 */
export function useOwnStaff(user: FirebaseUser | null): {
  staff: Staff | null;
  loading: boolean;
} {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setStaff(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db, 'staff', user.uid);
    return onSnapshot(
      ref,
      (snap) => {
        setStaff(snap.exists() ? (snap.data() as Staff) : null);
        setLoading(false);
      },
      () => {
        setStaff(null);
        setLoading(false);
      },
    );
  }, [user]);

  return { staff, loading };
}
