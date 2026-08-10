// src/lib/supabaseClient.js
//
// Same setup as FixFlow's client — both apps will eventually read from
// the same Supabase project, so a booking or a lead assignment shows up
// in both places instantly with no sync step needed.
//
// Install first:
//   npm install @supabase/supabase-js
//
// Then create a .env file in this project's root (never commit it):
//   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
//   VITE_SUPABASE_ANON_KEY=your-anon-public-key

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// detectSessionInUrl is off on purpose: Supabase's own auto-detection of invite/recovery
// tokens in the URL hash runs asynchronously and reliably wins the race against any check
// App.jsx does at render time, so the "set your password" screen never appeared for real
// invite links -- by the time we looked, supabase-js had already consumed and stripped the
// hash. We parse and consume it ourselves instead (see AUTH_HASH in App.jsx), synchronously,
// before anything else gets a chance to touch it.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { detectSessionInUrl: false },
});
