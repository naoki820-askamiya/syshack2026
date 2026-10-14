import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { captureAuthBoundary, finishExplicitLogin, setAuthenticatedUser } from '../utils/authBoundary';
import type { AuthBoundary } from '../utils/authBoundary';
import '../utils/storage';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  authEpoch: number;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ needsEmailConfirmation: boolean; authenticatedBoundary: AuthBoundary | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const loginAttempt = useRef(0);
  const [authEpoch, setAuthEpoch] = useState(() => captureAuthBoundary().epoch);
  const publishUser = useCallback((nextUser: User | null, newSession = false) => {
    const boundary = setAuthenticatedUser(nextUser?.id ?? null, { newSession });
    setAuthEpoch(boundary.epoch);
    setUser(nextUser);
  }, []);

  useEffect(() => {
    let mounted = true;
    let authEventObserved = false;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted || authEventObserved) {
        return;
      }

      publishUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      authEventObserved = true;
      publishUser(nextSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [publishUser]);

  const signIn = useCallback(async (email: string, password: string) => {
    const start = captureAuthBoundary();
    const attempt = ++loginAttempt.current;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      throw new Error('メールアドレスまたはパスワードを確認してください。');
    }

    // SIGNED_IN also reconfirms an existing session on tab refocus. Only an explicit login
    // starts a new same-user epoch; never publish an operation result over a newer observed user.
    setAuthEpoch(finishExplicitLogin(start, data.session?.user.id ?? null, attempt !== loginAttempt.current).epoch);
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    const start = captureAuthBoundary();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: displayName ? { display_name: displayName } : undefined,
      },
    });

    if (error) {
      throw new Error('新規登録に失敗しました。入力内容を確認してください。');
    }

    const boundary = captureAuthBoundary();
    const expectedEpoch = start.epoch + (data.session?.user.id === start.userId ? 0 : 1);
    // Never attach registration intent to a different current account/session.
    return { needsEmailConfirmation: !data.session,
      authenticatedBoundary: data.session && boundary.userId === data.session.user.id && boundary.epoch === expectedEpoch ? boundary : null };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw new Error('ログアウトに失敗しました。時間をおいて再試行してください。');
    }

  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      authEpoch,
      signIn,
      signUp,
      signOut,
    }),
    [authEpoch, loading, signIn, signOut, signUp, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth は AuthProvider の内側で使ってください');
  }

  return value;
}
