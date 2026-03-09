/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_DATA_SUPABASE_URL?: string;
  readonly VITE_DATA_SUPABASE_ANON_KEY?: string;
  readonly VITE_DATA_TABLE_CARDS?: string;
  readonly VITE_DATA_TABLE_PEOPLE?: string;
  readonly VITE_DATA_TABLE_INTERACTIONS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
