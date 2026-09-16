-- Availability redesign: status (available/unavailable), per-day instruments, and reason.
ALTER TABLE public.member_availability
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS instruments text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reason text;

ALTER TABLE public.member_availability
  ADD CONSTRAINT member_availability_status_check
  CHECK (status IN ('available', 'unavailable'));

-- The new flow upserts/updates availability rows, so members need UPDATE on their own rows.
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
