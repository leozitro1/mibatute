// src/supabase/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://mbqvuxvwgexpsduijpck.supabase.co";
const supabaseKey = "sb_publishable_fvoL3vHRpE0TeM7sn_FUlQ_ocheeO6f";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});