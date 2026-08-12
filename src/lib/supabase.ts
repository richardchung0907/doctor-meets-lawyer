import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://xxtmeuabohgvcqzyphtx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4dG1ldWFib2hndmNxenlwaHR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MTU1ODUsImV4cCI6MjEwMjA5MTU4NX0.sbcuwq95mVXGHxuBunzUfg1FhaFTXiPOps5UkPZF5Ss';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
