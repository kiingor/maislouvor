import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { platformRpc } from "@/lib/platform";
import { PlatformAccessContext } from "./PlatformAccessContext";
import { clearAuthRedirect } from "@/lib/authRedirect";

export function PlatformAccessProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const currentUser = useRef<string | null>(null);
  const queryClient = useQueryClient();
  useEffect(() => {
    let active = true;
    let authEventReceived = false;
    const applyUser = (id: string | null) => {
      if (!active) return;
      if (currentUser.current !== id) {
        // Account switches must never leave the prior administrator's data cached.
        queryClient.removeQueries({ queryKey: ["platform"] });
        queryClient.removeQueries({ queryKey: ["support"] });
        queryClient.removeQueries({ queryKey: ["platform-access"] });
      }
      currentUser.current = id;
      setUserId(id);
      setAuthLoading(false);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === "SIGNED_OUT") clearAuthRedirect();
      authEventReceived = true;
      applyUser(session?.user.id ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!authEventReceived) applyUser(data.session?.user.id ?? null);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [queryClient]);
  const access = useQuery({
    queryKey: ["platform-access", userId], queryFn: () => platformRpc<boolean>("is_platform_admin"),
    enabled: !!userId, retry: false, staleTime: 60_000, refetchInterval: 60_000,
  });
  return <PlatformAccessContext.Provider value={{
    userId, isPlatformAdmin: access.data === true && !!userId,
    loading: authLoading || (!!userId && access.isPending), error: access.error,
    refetch: () => { void access.refetch(); },
  }}>{children}</PlatformAccessContext.Provider>;
}
