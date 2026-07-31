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

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
