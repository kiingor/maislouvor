
-- Drop the problematic policy that causes recursion
DROP POLICY IF EXISTS "Team members can view teammate profiles" ON public.profiles;

-- Create a SECURITY DEFINER function to get current user's profile_id (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_my_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

-- Create a safe policy using the function (no self-referencing subquery)
CREATE POLICY "Team members can view teammate profiles"
ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm1
    JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.profile_id = profiles.id
    AND tm2.profile_id = public.get_my_profile_id()
  )
);
