import { supabase } from "./supabaseClient";
import { queryMisRescates } from "./rescatesQuery";

export async function obtenerMisRescates(userId) {
  try {
    return await queryMisRescates(supabase, userId);
  } catch (error) {
    return { data: [], error };
  }
}
