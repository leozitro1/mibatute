import { useSyncExternalStore } from 'react';
import { supabase } from '../supabase/supabaseClient.js';
import { createLocationCatalog } from './locationCatalog.js';

const catalog = createLocationCatalog(supabase);
export const refreshLocations = force => catalog.refresh(force);
export default function useLocations() {
  return useSyncExternalStore(catalog.subscribe, catalog.getSnapshot);
}
