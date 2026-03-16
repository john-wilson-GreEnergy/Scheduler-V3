-- ─────────────────────────────────────────────────────────────
-- Migration: Google Chat Space Membership Sync
-- Run this in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────

-- 1. Add chat_space_id column to jobsites table
--    Populate this with the Google Chat Space ID for each site/group
--    Format: "spaces/XXXXXXXXX" (from the Google Chat API or space URL)
ALTER TABLE jobsites ADD COLUMN IF NOT EXISTS chat_space_id TEXT;

-- 2. Create chat_space_memberships tracking table
CREATE TABLE IF NOT EXISTS chat_space_memberships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id        TEXT NOT NULL,           -- Google Chat space ID e.g. "spaces/XXXXXXXXX"
  group_name      TEXT NOT NULL,           -- Human readable e.g. "Solar Star"
  employee_id     UUID REFERENCES employees(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  membership_name TEXT,                    -- Google Chat membership resource name (for DELETE calls)
                                           -- e.g. "spaces/XXXXXXXXX/members/YYYYYYYYY"
                                           -- Populate this from the addMemberToSpace response
                                           -- once the stub is replaced with real API calls
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(space_id, email)
);

-- RLS policies for chat_space_memberships
ALTER TABLE chat_space_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated reads"
  ON chat_space_memberships FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Allow service role full access"
  ON chat_space_memberships FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- 3. Add chat_sync to activity_log allowed event types (if using an enum)
--    If event_type is plain TEXT, skip this block.
-- ALTER TYPE log_event_type ADD VALUE IF NOT EXISTS 'chat_sync';

-- 4. Schedule the sync to run every Monday at 6:00 AM UTC
--    Requires pg_cron extension (enabled by default in Supabase)
SELECT cron.schedule(
  'sync-chat-memberships',           -- job name
  '0 6 * * 1',                       -- every Monday at 06:00 UTC
  $$
    SELECT net.http_post(
      url    := current_setting('app.supabase_url') || '/functions/v1/sync-chat-memberships',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body   := '{}'::jsonb
    );
  $$
);

-- ─────────────────────────────────────────────────────────────
-- To manually trigger the sync from SQL (for testing):
-- ─────────────────────────────────────────────────────────────
-- SELECT net.http_post(
--   url    := '<YOUR_SUPABASE_URL>/functions/v1/sync-chat-memberships',
--   headers := jsonb_build_object(
--     'Content-Type',  'application/json',
--     'Authorization', 'Bearer <YOUR_SERVICE_ROLE_KEY>'
--   ),
--   body   := '{}'::jsonb
-- );
