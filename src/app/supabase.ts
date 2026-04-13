import { createClient } from '@supabase/supabase-js';

export const defaultSupabaseBucket = 'kiosk-photos';

let supabaseClient: ReturnType<typeof createClient> | null = null;

function readRequiredEnv(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY') {
  const value = import.meta.env[name];

  if (!value) {
    throw new Error(`Missing required Supabase environment variable: ${name}`);
  }

  return value;
}

export function getSupabaseBucketName() {
  return import.meta.env.VITE_SUPABASE_BUCKET || defaultSupabaseBucket;
}

export function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createClient(
      readRequiredEnv('VITE_SUPABASE_URL'),
      readRequiredEnv('VITE_SUPABASE_ANON_KEY'),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  }

  return supabaseClient;
}
