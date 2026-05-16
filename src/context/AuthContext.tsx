import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updatePassword,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useStaffRole, type ResolvedRole } from '../hooks/useStaffRole';

export interface AuthResult {
  ok: boolean;
  error?: string;
}

interface AuthContextValue {
  user: FirebaseUser | null;
  isAuthReady: boolean;
  role: ResolvedRole | null;
  roleLoading: boolean;
  isPasswordUser: boolean;
  loginWithGoogle: () => Promise<AuthResult>;
  loginWithEmail: (email: string, password: string) => Promise<AuthResult>;
  sendResetEmail: (email: string) => Promise<AuthResult>;
  changePassword: (newPassword: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toErrMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const { role, loading: roleLoading } = useStaffRole(user);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
  }, []);

  const loginWithGoogle = useCallback(async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: toErrMsg(e) };
    }
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    if (!email.trim() || !password) {
      return { ok: false as const, error: 'Enter your email and password.' };
    }
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: toErrMsg(e) };
    }
  }, []);

  const sendResetEmail = useCallback(async (email: string) => {
    if (!email.trim()) {
      return { ok: false as const, error: 'Enter your email first.' };
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: toErrMsg(e) };
    }
  }, []);

  const changePassword = useCallback(async (newPassword: string) => {
    if (newPassword.length < 6) {
      return { ok: false as const, error: 'Password must be at least 6 characters.' };
    }
    if (!auth.currentUser) {
      return { ok: false as const, error: 'Not signed in.' };
    }
    try {
      await updatePassword(auth.currentUser, newPassword);
      return { ok: true as const };
    } catch (e: any) {
      if (e?.code === 'auth/requires-recent-login' && auth.currentUser?.email) {
        try {
          await sendPasswordResetEmail(auth, auth.currentUser.email);
          return {
            ok: false as const,
            error: 'For security, please sign in again. A reset link has been sent to your email.',
          };
        } catch (e2) {
          return { ok: false as const, error: toErrMsg(e2) };
        }
      }
      return { ok: false as const, error: toErrMsg(e) };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const isPasswordUser = !!user?.providerData?.some((p) => p.providerId === 'password');

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthReady,
      role,
      roleLoading,
      isPasswordUser,
      loginWithGoogle,
      loginWithEmail,
      sendResetEmail,
      changePassword,
      logout,
    }),
    [user, isAuthReady, role, roleLoading, isPasswordUser, loginWithGoogle, loginWithEmail, sendResetEmail, changePassword, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
