
-- Create messages table for team chat
CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  culto_id uuid REFERENCES public.cultos(id) ON DELETE CASCADE,
  sender_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Members can view messages in their team
CREATE POLICY "Members can view team messages"
ON public.messages
FOR SELECT
USING (is_team_member(auth.uid(), team_id));

-- Members can send messages to their team
CREATE POLICY "Members can send team messages"
ON public.messages
FOR INSERT
WITH CHECK (
  is_team_member(auth.uid(), team_id)
  AND sender_profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
);

-- Users can delete their own messages
CREATE POLICY "Users can delete own messages"
ON public.messages
FOR DELETE
USING (sender_profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1));

-- Indexes
CREATE INDEX idx_messages_team_culto ON public.messages(team_id, culto_id, created_at DESC);
CREATE INDEX idx_messages_team_general ON public.messages(team_id, created_at DESC) WHERE culto_id IS NULL;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
