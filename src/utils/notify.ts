/**
 * Notification helpers for Isky Camp Flow
 * Sends role-targeted notifications via the Supabase `notifications` table.
 */

import { supabase } from '@/lib/supabase';

// Calendar sync notifications removed as Google Calendar integration is decommissioned.
