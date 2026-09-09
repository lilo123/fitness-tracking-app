import React, { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { UserProfile, UserRole } from '../types/database';
import { AuthContext } from './AuthContextTypes';
import { restTimerStore } from '../utils/restTimerStore';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<UserRole>(() => {
    return (localStorage.getItem('cybergym_view_mode') as UserRole) || 'coach';
  });

  const queryClient = useQueryClient();

  const fetchProfile = async (userId: string, email?: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

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
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        setUser(session.user);
        await fetchProfile(session.user.id, session.user.email);
      } else {
        setUser(null);
        setProfile(null);
        localStorage.removeItem('cybergym_user');
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        setUser(session.user);
        await fetchProfile(session.user.id, session.user.email);
      } else if (_event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        localStorage.removeItem('cybergym_user');
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password = 'password123') => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        return { success: false, error: error.message };
      }
      if (data?.user) {
        setUser(data.user);
        await fetchProfile(data.user.id, data.user.email);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const signUp = async (email: string, password = 'password123', _role: UserRole = 'athlete') => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: email.split('@')[0],
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
        success: false,
        error: 'Account created! Please check your email to confirm your account before signing in, or disable email confirmation in Supabase Auth settings.',
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    restTimerStore.stop();
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('cybergym_')) {
        localStorage.removeItem(key);
      }
    });
    setUser(null);
    setProfile(null);
    queryClient.clear();
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
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
  };

  const switchRole = async (newRole: UserRole) => {
    // Only verified coaches can toggle between Coach View and Athlete Preview
    if (profile?.role !== 'coach') return;
    setViewMode(newRole);
    localStorage.setItem('cybergym_view_mode', newRole);
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id, user.email);
    }
  };

  const role: UserRole = profile?.role === 'coach' ? viewMode : 'athlete';
  const isCoachMode = Boolean(profile?.is_coach_mode || profile?.role === 'coach' || role === 'coach');

  return (
    <AuthContext.Provider
      value={{
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
