import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type TeamRole = "admin" | "editor" | "viewer";

interface Team {
  id: string;
  name: string;
  owner_id: string;
}

interface TeamContextValue {
  currentTeam: Team | null;
  userRole: TeamRole | null;
  profileId: string | null;
  isAdmin: boolean;
  isEditor: boolean;
  isViewer: boolean;
  canEdit: boolean;
  loading: boolean;
  refetch: () => Promise<void>;
}

const TeamContext = createContext<TeamContextValue>({
  currentTeam: null,
  userRole: null,
  profileId: null,
  isAdmin: false,
  isEditor: false,
  isViewer: false,
  canEdit: false,
  loading: true,
  refetch: async () => {},
});

export function TeamProvider({ children }: { children: ReactNode }) {
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null);
  const [userRole, setUserRole] = useState<TeamRole | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTeam = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // Get profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!profile) { setLoading(false); return; }
    setProfileId(profile.id);

    // Get first team membership
    const { data: membership } = await supabase
      .from("team_members")
      .select("team_id, role, teams(id, name, owner_id)")
      .eq("profile_id", profile.id)
      .limit(1)
      .single();

    if (membership && membership.teams) {
      const team = membership.teams as unknown as Team;
      setCurrentTeam(team);
      setUserRole(membership.role as TeamRole);
    } else {
      setCurrentTeam(null);
      setUserRole(null);
    }
    setLoading(false);
  };

  useEffect(() => { fetchTeam(); }, []);

  const isAdmin = userRole === "admin";
  const isEditor = userRole === "editor";
  const isViewer = userRole === "viewer";
  const canEdit = isAdmin || isEditor;

  return (
    <TeamContext.Provider value={{ currentTeam, userRole, profileId, isAdmin, isEditor, isViewer, canEdit, loading, refetch: fetchTeam }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  return useContext(TeamContext);
}
