import { createContext } from 'react';
import type { User } from '@supabase/supabase-js';
import type { UserProfile, UserRole } from '../types/database';

export interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  role: UserRole;
  viewMode: UserRole;
  loading: boolean;
  signIn: (email: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password?: string, role?: UserRole) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ success: boolean; error?: string }>;
  switchRole: (newRole: UserRole) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
