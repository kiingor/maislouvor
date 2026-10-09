const team = { id: 'fixture-team', name: 'Equipe Demonstração', owner_id: 'fixture-profile', role: 'admin', availability_mode: 'both' };
export const TeamProvider = ({ children }: any) => children;
export const useTeam = () => ({ currentTeam: team, teams: [team], pendingTeams: [], switchTeam: () => {},
  refetch: async () => {}, can: () => true, profileId: 'fixture-profile', userRole: 'admin', isAdmin: true,
  canEdit: true, isEditor: false, isViewer: false, permissions: {}, loading: false });
