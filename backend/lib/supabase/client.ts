import { createBrowserClient } from '@supabase/ssr';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// NEXT_PUBLIC_* values are inlined when the bundle is built, not read at
// runtime. A deploy built before these were configured keeps the fallbacks
// below and every auth call then resolves to a domain that does not exist,
// surfacing as DNS_PROBE_FINISHED_NXDOMAIN rather than anything actionable.
// Say so plainly instead, while still letting pages that never touch auth render.
if (typeof window !== 'undefined' && (!url || !anonKey)) {
  console.error(
    '[supabase] Missing ' +
      [!url && 'NEXT_PUBLIC_SUPABASE_URL', !anonKey && 'NEXT_PUBLIC_SUPABASE_ANON_KEY']
        .filter(Boolean)
        .join(' and ') +
      '. Set them in the hosting environment, then rebuild WITHOUT the build cache — ' +
      'adding the variable alone does not change an existing bundle.'
  );
}

export function createClient() {
  return createBrowserClient(
    url || 'https://placeholder.supabase.co',
    anonKey || 'placeholder-anon-key'
  );
}
