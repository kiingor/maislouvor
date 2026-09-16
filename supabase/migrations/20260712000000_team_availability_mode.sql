-- Let each team choose how members report their schedule.
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS availability_mode text NOT NULL DEFAULT 'both';

ALTER TABLE public.teams
  DROP CONSTRAINT IF EXISTS teams_availability_mode_check;

ALTER TABLE public.teams
  ADD CONSTRAINT teams_availability_mode_check
  CHECK (availability_mode IN ('available_only', 'unavailable_only', 'both'));

COMMENT ON COLUMN public.teams.availability_mode IS
  'Controls whether members report available dates, unavailable dates, or both.';

-- Replace the permissive write policies so the team setting is also enforced
-- at the database boundary. Existing incompatible rows are preserved and can
-- still be deleted by their owner, but they cannot be inserted or updated.
DROP POLICY IF EXISTS "Members can insert own availability" ON public.member_availability;
CREATE POLICY "Members can insert own availability"
ON public.member_availability FOR INSERT
TO authenticated
WITH CHECK (
  team_member_id IN (
    SELECT tm.id
    FROM public.team_members tm
    JOIN public.profiles p ON p.id = tm.profile_id
    WHERE p.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.id = member_availability.team_member_id
      AND (
        t.availability_mode = 'both'
        OR (t.availability_mode = 'available_only' AND member_availability.status = 'available')
        OR (t.availability_mode = 'unavailable_only' AND member_availability.status = 'unavailable')
      )
  )
);

DROP POLICY IF EXISTS "Members can update own availability" ON public.member_availability;
CREATE POLICY "Members can update own availability"
ON public.member_availability FOR UPDATE
TO authenticated
USING (
  team_member_id IN (
    SELECT tm.id
    FROM public.team_members tm
    JOIN public.profiles p ON p.id = tm.profile_id
    WHERE p.user_id = auth.uid()
  )
)
WITH CHECK (
  team_member_id IN (
    SELECT tm.id
    FROM public.team_members tm
    JOIN public.profiles p ON p.id = tm.profile_id
    WHERE p.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.id = member_availability.team_member_id
      AND (
        t.availability_mode = 'both'
        OR (t.availability_mode = 'available_only' AND member_availability.status = 'available')
        OR (t.availability_mode = 'unavailable_only' AND member_availability.status = 'unavailable')
      )
  )
);
