-- Push notifications support (remote push for new 1-on-1 messages)
--
-- 1. profiles.push_token  — Expo push token registered by each client
-- 2. app_config           — central config: Edge Function notify endpoint + auth
-- 3. notify_new_message() — AFTER INSERT trigger on messages that calls the
--                           Edge Function via pg_net (fire-and-forget; never
--                           blocks or fails the message insert).

-- 1. Push token column on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_token TEXT;

-- 2. Central app config table
CREATE TABLE IF NOT EXISTS public.app_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Edge Function endpoint (deploy supabase/functions/notify first).
-- The anon key below is the project's public anon key (embedded in clients).
INSERT INTO public.app_config (key, value)
VALUES
  ('push_notify_url', 'https://xxtmeuabohgvcqzyphtx.supabase.co/functions/v1/notify'),
  ('push_notify_auth', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4dG1ldWFib2hndmNxenlwaHR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MTU1ODUsImV4cCI6MjEwMjA5MTU4NX0.sbcuwq95mVXGHxuBunzUfg1FhaFTXiPOps5UkPZF5Ss')
ON CONFLICT (key) DO NOTHING;

-- 3. Fire-and-forget HTTP call to the notify Edge Function on new messages
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS TRIGGER AS $$
DECLARE
  v_url  TEXT;
  v_auth TEXT;
BEGIN
  SELECT value INTO v_url  FROM public.app_config WHERE key = 'push_notify_url';
  SELECT value INTO v_auth FROM public.app_config WHERE key = 'push_notify_auth';
  IF v_url IS NULL OR v_auth IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_auth
    ),
    body    := jsonb_build_object('message_id', NEW.id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_new_message ON public.messages;
CREATE TRIGGER trg_notify_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_message();
