import React, { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { UserProfile, UserRole } from '../types/database';
import { AuthContext } from './AuthContextTypes';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const stored = localStorage.getItem('cybergym_user');
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  });
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('cybergym_user');
    if (!stored) return null;
    try {
      const parsed = JSON.parse(stored);
      return parsed?.id ? ({ id: parsed.id, email: parsed.email } as User) : null;
    } catch {
      return null;
    }
  });
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
    setUser(null);
    setProfile(null);
    localStorage.removeItem('cybergym_user');
    queryClient.clear();
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!profile) return { success: false, error: 'Not authenticated' };
    // Strip role mutations: client cannot modify database role
    const { role: _stripped, ...safeUpdates } = updates;
    const updated = { ...profile, ...safeUpdates };
    setProfile(updated);
    localStorage.setItem('cybergym_user', JSON.stringify(updated));

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

  const role: UserRole = profile?.role === 'coach' ? viewMode : 'athlete';

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role,
        viewMode,
        loading,
        signIn,
        signUp,
        signOut,
        updateProfile,
        switchRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
