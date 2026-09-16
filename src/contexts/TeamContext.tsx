import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { canDo, parseOverrides, type PermAction, type PermOverrides, type PermResource } from "@/lib/permissions";
import { normalizeAvailabilityMode, type AvailabilityMode } from "@/lib/availability";

type TeamRole = "admin" | "editor" | "viewer";

interface Team {
  id: string;
  name: string;
  owner_id: string;
  availability_mode: AvailabilityMode;
}

interface TeamMembership extends Team {
  role: TeamRole;
  permissions: PermOverrides;
}

interface PendingTeam {
  id: string;
  name: string;
  requestId: string;
}

interface TeamContextValue {
  currentTeam: Team | null;
  teams: TeamMembership[];
  pendingTeams: PendingTeam[];
  userRole: TeamRole | null;
  permissions: PermOverrides;
  profileId: string | null;
  isAdmin: boolean;
  isEditor: boolean;
  isViewer: boolean;
  canEdit: boolean;
  /** Permissão efetiva do usuário no time atual (preset + exceções). */
  can: (resource: PermResource, action: PermAction) => boolean;
  loading: boolean;
  switchTeam: (teamId: string) => void;
  refetch: () => Promise<void>;
}

const STORAGE_KEY = "louvor_current_team";

const TeamContext = createContext<TeamContextValue>({
  currentTeam: null,
  teams: [],
  pendingTeams: [],
  userRole: null,
  permissions: {},
  profileId: null,
  isAdmin: false,
  isEditor: false,
  isViewer: false,
  canEdit: false,
  can: () => false,
  loading: true,
  switchTeam: () => {},
  refetch: async () => {},
});

export function TeamProvider({ children }: { children: ReactNode }) {
  const [teams, setTeams] = useState<TeamMembership[]>([]);
  const [pendingTeams, setPendingTeams] = useState<PendingTeam[]>([]);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(
    () => (typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null)
  );
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setTeams([]); setPendingTeams([]); setProfileId(null); setLoading(false); return; }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!profile) { setTeams([]); setLoading(false); return; }
    setProfileId(profile.id);

    // All team memberships for this user
    const membershipsWithMode = await supabase
      .from("team_members")
      .select("role, permissions, teams(id, name, owner_id, availability_mode)" as any)
      .eq("profile_id", profile.id);

    let memberships = membershipsWithMode.data as any[] | null;
    // Keep older environments usable while the new migration is being rolled out.
    if (membershipsWithMode.error && /availability_mode/i.test(membershipsWithMode.error.message)) {
      const fallback = await supabase
        .from("team_members")
        .select("role, permissions, teams(id, name, owner_id)" as any)
        .eq("profile_id", profile.id);
      memberships = fallback.data as any[] | null;
    }

    const list: TeamMembership[] = (memberships ?? [])
      .filter((m: any) => m.teams)
      .map((m: any) => ({
        ...(m.teams as Team),
        availability_mode: normalizeAvailabilityMode(m.teams.availability_mode),
        role: m.role as TeamRole,
        permissions: parseOverrides(m.permissions),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    setTeams(list);

    // Equipes com pedido PENDENTE (aguardando o líder aprovar) — aparecem na lista também.
    const { data: pendingReqs } = await supabase
      .from("team_join_requests")
      .select("id, team_id, teams(name)")
      .eq("profile_id", profile.id)
      .eq("status", "pending");
    const activeIds = new Set(list.map((t) => t.id));
    setPendingTeams(
      ((pendingReqs as any[]) ?? [])
        .filter((r) => r.team_id && !activeIds.has(r.team_id))
        .map((r) => ({ id: r.team_id, name: r.teams?.name ?? "Equipe", requestId: r.id }))
    );

    setCurrentTeamId((prev) => (prev && list.some((t) => t.id === prev) ? prev : list[0]?.id ?? null));
    setLoading(false);
  }, []);

  useEffect(() => { fetchTeams(); }, [fetchTeams]);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    if (currentTeamId) localStorage.setItem(STORAGE_KEY, currentTeamId);
    else localStorage.removeItem(STORAGE_KEY);
  }, [currentTeamId]);

  const switchTeam = useCallback((teamId: string) => setCurrentTeamId(teamId), []);

  const current = teams.find((t) => t.id === currentTeamId) ?? null;
  const currentTeam: Team | null = current
    ? {
        id: current.id,
        name: current.name,
        owner_id: current.owner_id,
        availability_mode: current.availability_mode,
      }
    : null;
  const userRole = current?.role ?? null;
  const permissions = current?.permissions ?? {};
  const isAdmin = userRole === "admin";
  const isEditor = userRole === "editor";
  const isViewer = userRole === "viewer";
  const canEdit = isAdmin || isEditor;
  const can = useCallback(
    (resource: PermResource, action: PermAction) => canDo(userRole, permissions, resource, action),
    [userRole, permissions]
  );

  return (
    <TeamContext.Provider
      value={{ currentTeam, teams, pendingTeams, userRole, permissions, profileId, isAdmin, isEditor, isViewer, canEdit, can, loading, switchTeam, refetch: fetchTeams }}
    >
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  return useContext(TeamContext);
}
