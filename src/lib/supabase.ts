import { createClient } from '@supabase/supabase-js';

if (import.meta.env.PROD && !import.meta.env.VITE_SUPABASE_URL) {
  throw new Error('VITE_SUPABASE_URL is required in production environment');
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://127.0.0.1:58821';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'dummy_anon_key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
