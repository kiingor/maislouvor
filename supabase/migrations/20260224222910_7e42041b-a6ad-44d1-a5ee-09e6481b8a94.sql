
-- Create member_availability table
CREATE TABLE public.member_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  available_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_member_id, available_date)
);

-- Enable RLS
ALTER TABLE public.member_availability ENABLE ROW LEVEL SECURITY;

-- Members can view availability of their team
CREATE POLICY "Members can view availability"
ON public.member_availability FOR SELECT
TO authenticated
USING (
  is_team_member(auth.uid(), (
    SELECT team_id FROM public.team_members WHERE id = member_availability.team_member_id
  ))
);

-- Members can insert their own availability
CREATE POLICY "Members can insert own availability"
ON public.member_availability FOR INSERT
TO authenticated
WITH CHECK (
  team_member_id IN (
    SELECT tm.id FROM public.team_members tm
    JOIN public.profiles p ON p.id = tm.profile_id
    WHERE p.user_id = auth.uid()
  )
);

-- Members can delete their own availability
CREATE POLICY "Members can delete own availability"
ON public.member_availability FOR DELETE
TO authenticated
USING (
  team_member_id IN (
    SELECT tm.id FROM public.team_members tm
    JOIN public.profiles p ON p.id = tm.profile_id
    WHERE p.user_id = auth.uid()
  )
);
