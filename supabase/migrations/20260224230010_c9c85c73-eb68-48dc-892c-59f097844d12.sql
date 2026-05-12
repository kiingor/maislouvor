
-- 1. Add status to culto_lineup for accept/decline workflow
CREATE TYPE public.lineup_status AS ENUM ('pending', 'accepted', 'declined');

ALTER TABLE public.culto_lineup 
ADD COLUMN status public.lineup_status NOT NULL DEFAULT 'pending';

-- Allow members to update their own lineup status (accept/decline)
CREATE POLICY "Members can update own lineup status"
ON public.culto_lineup
FOR UPDATE
USING (
  team_member_id IN (
    SELECT tm.id FROM team_members tm
    JOIN profiles p ON p.id = tm.profile_id
    WHERE p.user_id = auth.uid()
  )
);

-- 2. Add notes to culto_songs
ALTER TABLE public.culto_songs
ADD COLUMN notes text;

-- 3. Create notifications table
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  read boolean NOT NULL DEFAULT false,
  link text,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
ON public.notifications
FOR SELECT
USING (profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1));

CREATE POLICY "Users can update own notifications"
ON public.notifications
FOR UPDATE
USING (profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1));

CREATE POLICY "Users can delete own notifications"
ON public.notifications
FOR DELETE
USING (profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1));

-- Editors/admins can create notifications for team members
CREATE POLICY "Team editors can create notifications"
ON public.notifications
FOR INSERT
WITH CHECK (
  team_id IS NULL OR can_edit_team(auth.uid(), team_id)
);

-- Index for fast lookups
CREATE INDEX idx_notifications_profile_read ON public.notifications(profile_id, read);
CREATE INDEX idx_notifications_created ON public.notifications(created_at DESC);

-- 4. Create trigger to auto-create notification when someone is added to lineup
CREATE OR REPLACE FUNCTION public.notify_lineup_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _profile_id uuid;
  _culto_name text;
  _culto_date date;
  _culto_id uuid;
  _team_id uuid;
BEGIN
  -- Get the profile_id of the team member being added
  SELECT tm.profile_id INTO _profile_id
  FROM team_members tm WHERE tm.id = NEW.team_member_id;

  -- Get culto details
  SELECT c.name, c.date, c.id, c.team_id INTO _culto_name, _culto_date, _culto_id, _team_id
  FROM cultos c WHERE c.id = NEW.culto_id;

  -- Insert notification
  INSERT INTO public.notifications (profile_id, type, title, body, link, team_id)
  VALUES (
    _profile_id,
    'lineup',
    'Você foi escalado!',
    'Você foi escalado para ' || _culto_name || ' em ' || to_char(_culto_date, 'DD/MM/YYYY') || ' tocando ' || NEW.instrument,
    '/app/cultos/' || _culto_id,
    _team_id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_lineup_added
AFTER INSERT ON public.culto_lineup
FOR EACH ROW
EXECUTE FUNCTION public.notify_lineup_added();
