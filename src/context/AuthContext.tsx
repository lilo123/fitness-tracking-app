import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { UserProfile, UserRole } from '../types/database';
import { AuthContext, type AuthContextType } from './AuthContextTypes';
import { restTimerStore } from '../utils/restTimerStore';
import { dedupeInFlight } from '../utils/promiseDedupe';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    try {
      const cached = localStorage.getItem('cybergym_user');
      return cached ? (JSON.parse(cached) as UserProfile) : null;
    } catch {
      return null;
    }
  });
  const [user, setUser] = useState<User | null>(() => {
    try {
      const cached = localStorage.getItem('cybergym_user');
      if (cached) {
        const parsed = JSON.parse(cached) as UserProfile;
        if (parsed?.id) {
          return {
            id: parsed.id,
            email: parsed.email,
            app_metadata: {},
            user_metadata: { username: parsed.username },
            aud: 'authenticated',
            created_at: '',
          } as unknown as User;
        }
      }
    } catch {
      // Fall through to null
    }
    return null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    try {
      const cached = localStorage.getItem('cybergym_user');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.id) return false;
      }
    } catch {
      // Fall through
    }
    return true;
  });
  const [viewMode, setViewMode] = useState<UserRole>(() => {
    return (localStorage.getItem('cybergym_view_mode') as UserRole) || 'coach';
  });

  const signedOutRef = useRef(false);
  const isRevalidatingRef = useRef(false);
  const queryClient = useQueryClient();

  const fetchProfile = useCallback(async (userId: string, email?: string) => {
    return dedupeInFlight(`profile:${userId}`, async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, email, username, role, target_calories, target_protein, target_carbs, target_fat, target_fiber, auto_rest_timer, is_coach_mode, coach_code, coach_tier, max_athletes, created_at')
          .eq('id', userId)
          .single();

        if (signedOutRef.current) return;

        if (data && !error) {
          setProfile(data as UserProfile);
          localStorage.setItem('cybergym_user', JSON.stringify(data));
          if (data.auto_rest_timer !== undefined && data.auto_rest_timer !== null) {
            localStorage.setItem('cybergym_auto_rest_timer', String(data.auto_rest_timer));
          }
          if (data.role === 'coach') {
            const savedMode = localStorage.getItem('cybergym_view_mode') as UserRole;
            if (!savedMode) {
              setViewMode('coach');
              localStorage.setItem('cybergym_view_mode', 'coach');
            }
          }
        } else {
          const fallbackProfile: UserProfile = {
            id: userId,
            email: email || 'user@example.com',
            username: email ? email.split('@')[0] : 'athlete',
            role: 'athlete',
            target_calories: 2200,
            target_protein: 160,
            target_carbs: 220,
            target_fat: 70,
            target_fiber: 30,
            auto_rest_timer: true,
          };
          setProfile(fallbackProfile);
          localStorage.setItem('cybergym_user', JSON.stringify(fallbackProfile));
        }
      } catch {
        // Retain current profile
      }
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    type SessionRaceResult =
      | { kind: 'session'; session: any }
      | { kind: 'timeout' };

    const resolveSession = async () => {
      if (isRevalidatingRef.current) return;
      isRevalidatingRef.current = true;

      try {
        const result: SessionRaceResult = await Promise.race([
          supabase.auth
            .getSession()
            .then(({ data: { session } }) => ({
              kind: 'session' as const,
              session,
            }))
            .catch((err) => {
              console.warn('[AuthContext] getSession rejection:', err);
              return { kind: 'timeout' as const };
            }),
          new Promise<SessionRaceResult>((resolve) =>
            setTimeout(
              () => resolve({ kind: 'timeout' as const }),
              3000
            )
          ),
        ]);

        if (!mounted) return;

        if (result.kind === 'session') {
          if (result.session?.user) {
            signedOutRef.current = false;
            setUser(result.session.user);
            setLoading(false);
            fetchProfile(result.session.user.id, result.session.user.email).catch((err) => {
              console.warn('[AuthContext] Background fetchProfile error:', err);
            });
            return;
          } else {
            // Explicitly unauthenticated or expired/invalid session
            setUser(null);
            setProfile(null);
            localStorage.removeItem('cybergym_user');
            setLoading(false);
            return;
          }
        }

        if (result.kind === 'timeout') {
          console.warn(
            '[AuthContext] getSession timed out after 3000ms. Utilizing cached credentials if available.'
          );
          try {
            const cached = localStorage.getItem('cybergym_user');
            const parsed = cached ? JSON.parse(cached) : null;
            if (!parsed?.id) {
              setUser(null);
              setProfile(null);
            }
          } catch {
            setUser(null);
            setProfile(null);
          }
          setLoading(false);
        }
      } catch (err) {
        console.error('[AuthContext] Unexpected session resolution error:', err);
        if (!mounted) return;
        setLoading(false);
      } finally {
        isRevalidatingRef.current = false;
      }
    };

    resolveSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        signedOutRef.current = false;
        setUser(session.user);
        fetchProfile(session.user.id, session.user.email).catch((err) => {
          console.warn('[AuthContext] Background fetchProfile error:', err);
        });
      } else if (_event === 'SIGNED_OUT') {
        signedOutRef.current = true;
        setUser(null);
        setProfile(null);
        localStorage.removeItem('cybergym_user');
      }
      setLoading(false);
    });

    const handleLifecycleResume = () => {
      if (document.visibilityState === 'visible') {
        if (isRevalidatingRef.current) return;
        isRevalidatingRef.current = true;

        supabase.auth
          .getSession()
          .then(({ data: { session } }) => {
            if (!mounted) return;
            if (session?.user) {
              signedOutRef.current = false;
              setUser(session.user);
              fetchProfile(session.user.id, session.user.email).catch((err) => {
                console.warn('[AuthContext] Background resume fetchProfile error:', err);
              });
            } else if (!session) {
              setUser(null);
              setProfile(null);
              localStorage.removeItem('cybergym_user');
            }
          })
          .catch((err) => {
            console.warn('[AuthContext] Background resume revalidation error:', err);
          })
          .finally(() => {
            isRevalidatingRef.current = false;
          });
      }
    };

    document.addEventListener('visibilitychange', handleLifecycleResume);
    window.addEventListener('pageshow', handleLifecycleResume);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleLifecycleResume);
      window.removeEventListener('pageshow', handleLifecycleResume);
    };
  }, [fetchProfile]);

  const signIn = useCallback(
    async (email: string, password = 'password123') => {
      try {
        const sanitizedEmail = email.trim().toLowerCase();
        const { data, error } = await supabase.auth.signInWithPassword({
          email: sanitizedEmail,
          password,
        });
        if (error) {
          return { success: false, error: error.message };
        }
        if (data?.user) {
          signedOutRef.current = false;
          setUser(data.user);
          await fetchProfile(data.user.id, data.user.email);

          let userRole: UserRole = 'athlete';
          const { data: pData } = await supabase.from('users').select('role').eq('id', data.user.id).single();
          if (pData?.role) {
            userRole = pData.role as UserRole;
          }
          return { success: true, role: userRole };
        }
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [fetchProfile]
  );

  const signUp = useCallback(
    async (email: string, password = 'password123', _role: UserRole = 'athlete') => {
      try {
        const sanitizedEmail = email.trim().toLowerCase();
        const { data, error } = await supabase.auth.signUp({
          email: sanitizedEmail,
          password,
          options: {
            data: {
              username: sanitizedEmail.split('@')[0],
            },
          },
        });
        if (error) {
          return { success: false, error: error.message };
        }
        if (data?.session && data?.user) {
          setUser(data.user);
          await fetchProfile(data.user.id, data.user.email);
          return { success: true };
        }
        return {
          success: true,
          needsEmailConfirmation: true,
          message: 'Account created! Please check your email to verify your account.',
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [fetchProfile]
  );

  const signOut = useCallback(async () => {
    signedOutRef.current = true;
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    restTimerStore.stop();
    localStorage.removeItem('cybergym_user');
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('cybergym_')) {
        localStorage.removeItem(key);
      }
    });
    setUser(null);
    setProfile(null);
    queryClient.clear();
  }, [queryClient]);

  const updateProfile = useCallback(async (updates: Partial<UserProfile>) => {
    if (!profile) return { success: false, error: 'Not authenticated' };
    // Strip role, coach_tier, and max_athletes mutations: client cannot modify protected fields
    const {
      role: _strippedRole,
      coach_tier: _strippedTier,
      max_athletes: _strippedMax,
      ...safeUpdates
    } = updates;
    const updated = { ...profile, ...safeUpdates };
    setProfile(updated);
    localStorage.setItem('cybergym_user', JSON.stringify(updated));
    if (safeUpdates.auto_rest_timer !== undefined) {
      localStorage.setItem('cybergym_auto_rest_timer', String(safeUpdates.auto_rest_timer));
    }

    try {
      const { error } = await supabase
        .from('users')
        .upsert(updated)
        .eq('id', updated.id);
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Update failed' };
    }
  }, [profile]);

  const switchRole = useCallback(async (newRole: UserRole) => {
    // Only verified coaches can toggle between Coach View and Athlete Preview
    if (profile?.role !== 'coach') return;
    setViewMode(newRole);
    localStorage.setItem('cybergym_view_mode', newRole);
  }, [profile?.role]);

  const refreshProfile = useCallback(async () => {
    signedOutRef.current = false;
    if (user) {
      await fetchProfile(user.id, user.email);
    }
  }, [user, fetchProfile]);

  const resendConfirmation = useCallback(async (email: string) => {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
      });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, []);

  const resetPassword = useCallback(async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, []);

  const role: UserRole = profile?.role === 'coach' ? viewMode : 'athlete';
  const isCoachMode = Boolean(profile?.is_coach_mode || profile?.role === 'coach' || role === 'coach');

  const contextValue = useMemo<AuthContextType>(
    () => ({
      user,
      profile,
      role,
      viewMode,
      isCoachMode,
      loading,
      signIn,
      signUp,
      signOut,
      updateProfile,
      switchRole,
      refreshProfile,
      resendConfirmation,
      requestPasswordReset,
      resetPassword,
    }),
    [
      user,
      profile,
      role,
      viewMode,
      isCoachMode,
      loading,
      signIn,
      signUp,
      signOut,
      updateProfile,
      switchRole,
      refreshProfile,
      resendConfirmation,
      requestPasswordReset,
      resetPassword,
    ]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
