ALTER TABLE public.notifications 
  ADD COLUMN sender_profile_id uuid REFERENCES public.profiles(id);