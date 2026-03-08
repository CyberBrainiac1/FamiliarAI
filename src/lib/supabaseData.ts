import { createClient } from '@supabase/supabase-js';

const dataSupabaseUrl = import.meta.env.VITE_DATA_SUPABASE_URL;
const dataSupabaseAnonKey = import.meta.env.VITE_DATA_SUPABASE_ANON_KEY;

export const isDataSupabaseConfigured = Boolean(dataSupabaseUrl && dataSupabaseAnonKey);

export const dataSupabase = isDataSupabaseConfigured
  ? createClient(dataSupabaseUrl as string, dataSupabaseAnonKey as string)
  : null;
