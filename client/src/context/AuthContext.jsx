import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
import { apiFetch, setTokenProvider } from '../services/api.js';

const AuthContext = createContext(null);

/**
 * Session comes from Supabase Auth (source of truth for identity).
 * The profile (role, status) comes from the API, which reads it from the database.
 * Nothing here is a security boundary: the server re-verifies every request.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [sessionReady, setSessionReady] = useState(!isSupabaseConfigured);
  const [profileLoading, setProfileLoading] = useState(false);
  const [notice, setNotice] = useState(null);
  const userIdRef = useRef(null);

  // Every API call asks Supabase for the freshest token (it refreshes automatically).
  useEffect(() => {
    if (!supabase) return undefined;
    setTokenProvider(async () => (await supabase.auth.getSession()).data.session?.access_token ?? null);
    return () => setTokenProvider(async () => null);
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setSessionReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next ?? null);
      setSessionReady(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const res = await apiFetch('/profile');
      setProfile(res.profile);
    } catch (err) {
      setProfile(null);
      if (err.code === 'ACCOUNT_SUSPENDED') {
        setNotice('This account has been suspended. Contact an administrator.');
        await supabase.auth.signOut();
      } else {
        setProfileError(err.message);
      }
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const userId = session?.user?.id ?? null;
  useEffect(() => {
    if (userId === userIdRef.current) return;
    userIdRef.current = userId;
    if (!userId) {
      setProfile(null);
      setProfileError(null);
      return;
    }
    loadProfile();
  }, [userId, loadProfile]);

  const signUp = useCallback(async ({ fullName, email, password }) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      // Only the display name is sent. The database trigger always assigns role "student".
      options: { data: { full_name: fullName.trim() }, emailRedirectTo: `${window.location.origin}/login` },
    });
    if (error) throw error;
    return { needsEmailConfirmation: !data.session };
  }, []);

  const signIn = useCallback(async ({ email, password }) => {
    setNotice(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const requestPasswordReset = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  }, []);

  const updateFullName = useCallback(async (fullName) => {
    const res = await apiFetch('/profile', { method: 'PATCH', body: { fullName } });
    setProfile(res.profile);
    return res.profile;
  }, []);

  const value = useMemo(
    () => ({
      isConfigured: isSupabaseConfigured,
      session,
      profile,
      profileError,
      notice,
      // "loading" until we know whether there is a session, and (if so) whether the profile loaded
      loading: !sessionReady || (Boolean(session) && !profile && !profileError) || profileLoading,
      isAdmin: profile?.role === 'admin',
      signUp, signIn, signOut, requestPasswordReset, updatePassword, updateFullName,
      retryProfile: loadProfile,
    }),
    [session, profile, profileError, notice, sessionReady, profileLoading, signUp, signIn, signOut, requestPasswordReset, updatePassword, updateFullName, loadProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
