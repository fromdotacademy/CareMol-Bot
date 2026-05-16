import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import type { User as FirebaseUser } from 'firebase/auth';
import { db } from '../lib/firebase';
import { HARDCODED_ADMIN_EMAILS } from '../lib/adminEmails';
import type { Staff, StaffRole } from '../types';

export type ResolvedRole = StaffRole | 'customer';

/**
 * Resolves the active user's role:
 *   1. Hardcoded bootstrap admins (mirrors firestore.rules.isHardcodedAdmin)
 *   2. staff/{uid} record with role + active flag
 *   3. Otherwise: customer
 */
export function useStaffRole(user: FirebaseUser | null): {
  role: ResolvedRole | null;
  loading: boolean;
} {
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
      },
    );
  }, [user]);

  return { role, loading };
}
