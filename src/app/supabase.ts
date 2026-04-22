import { createClient } from '@supabase/supabase-js';

export const defaultSupabaseBucket = 'kiosk-photos';

let supabaseClient: ReturnType<typeof createClient> | null = null;

function readRequiredEnv(name: 'VITE_SUPABASE_URL') {
  const value = import.meta.env[name];

  if (!value) {
    throw new Error(`Missing required Supabase environment variable: ${name}`);
  }

  return value;
}

function readSupabasePublicKey() {
  const value =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!value) {
    throw new Error(
      'Missing required Supabase environment variable: VITE_SUPABASE_PUBLISHABLE_KEY',
    );
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
      readSupabasePublicKey(),
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
