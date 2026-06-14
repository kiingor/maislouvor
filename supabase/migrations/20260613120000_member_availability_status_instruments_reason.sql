-- Extend member_availability to support availability status, chosen instruments
-- and a justification/reason when a member marks themselves as unavailable.

ALTER TABLE public.member_availability
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS instruments text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reason text;

-- Restrict status to the two known values (existing rows default to 'available')
ALTER TABLE public.member_availability
  DROP CONSTRAINT IF EXISTS member_availability_status_check;
ALTER TABLE public.member_availability
  ADD CONSTRAINT member_availability_status_check
  CHECK (status IN ('available', 'unavailable'));

-- Allow members to update their own availability (needed for upsert / toggling)
DROP POLICY IF EXISTS "Members can update own availability" ON public.member_availability;
CREATE POLICY "Members can update own availability"
ON public.member_availability FOR UPDATE
TO authenticated
USING (
  team_member_id IN (
    SELECT tm.id FROM public.team_members tm
    JOIN public.profiles p ON p.id = tm.profile_id
    WHERE p.user_id = auth.uid()
  )
)
WITH CHECK (
  team_member_id IN (
    SELECT tm.id FROM public.team_members tm
    JOIN public.profiles p ON p.id = tm.profile_id
    WHERE p.user_id = auth.uid()
  )
);
