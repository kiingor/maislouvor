import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TeamSettings from './TeamSettings';

const team = vi.hoisted(() => ({
  currentTeam: { id: 'team-a', name: 'Equipe A', role: 'admin' },
  teams: [{ id: 'team-a', name: 'Equipe A', role: 'admin' }, { id: 'team-b', name: 'Equipe B', role: 'admin' }],
  isAdmin: true, profileId: 'profile', can: () => true, refetch: vi.fn(), switchTeam: vi.fn(),
}));
vi.mock('@/contexts/TeamContext', () => ({ useTeam: () => team }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { email: 'qa@example.test' } } }) },
  from: () => { const query = { select: () => query, eq: () => query, single: async () => ({ data: null }),
    then: (resolve: (value: unknown) => void) => Promise.resolve({ data: [] }).then(resolve) }; return query; },
  rpc: async () => ({ data: [] }),
} }));
vi.mock('@/components/shell/PageHeader', () => ({ PageHeader: ({ children }: any) => <header>{children}</header> }));
vi.mock('@/components/billing/TeamBilling', () => ({ default: ({ initialSeats }: any) => <p>Plano para {initialSeats ?? 5} pessoas</p> }));
vi.mock('@/components/InviteMemberModal', () => ({ InviteMemberModal: ({ onChoosePlan }: any) =>
  <button onClick={() => onChoosePlan(8, 'team-b')}>Abrir plano da equipe convidada</button> }));
vi.mock('@/components/MemberEditModal', () => ({ MemberEditModal: () => null }));
vi.mock('@/components/AvatarCropModal', () => ({ AvatarCropModal: () => null }));
vi.mock('@/components/MyAvailabilityCalendar', () => ({ MyAvailabilityCalendar: () => null }));
vi.mock('@/components/UserNotificationPrefs', () => ({ UserNotificationPrefs: () => null }));
vi.mock('@/components/UserStatsCard', () => ({ UserStatsCard: () => null }));
vi.mock('@/components/TeamAvailabilitySettings', () => ({ TeamAvailabilitySettings: () => null }));
vi.mock('@/components/AppearanceControl', () => ({ AppearanceSegmented: () => null }));
vi.mock('@/components/FaceIdSettings', () => ({ FaceIdSettings: () => <p>Face ID</p> }));
vi.mock('@/components/AssistantSettings', () => ({ MyAssistantSettings: () => <p>Permissão do Asafe</p>, TeamAssistantSettings: () => null }));
vi.mock('@/components/legal/SettingsAboutGroup', () => ({ SettingsAboutGroup: () => null }));
vi.mock('@/components/account/DeleteAccountSection', () => ({ DeleteAccountSection: () => <p>Excluir minha conta</p> }));
vi.mock('@/components/BlockedUsersSettings', () => ({ BlockedUsersSettings: () => null }));
vi.mock('@/components/TeamChatReports', () => ({ TeamChatReports: () => <p>Denúncias da equipe</p> }));

function mount(path = '/app/settings') {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}>
      <Link to="/app/settings#excluir-conta">Ir para exclusão</Link>
      <TeamSettings />
    </MemoryRouter>
  </QueryClientProvider>);
}
function selectTab(name: string) {
  fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0, ctrlKey: false });
}
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe('junção de assinaturas, moderação e ajustes de conta', () => {
  it('abre a assinatura no retorno do pagamento', async () => {
    mount('/app/settings?billing=return');
    expect(await screen.findByText('Plano para 5 pessoas')).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Assinatura' })).toHaveAttribute('aria-selected', 'true');
  });

  it('a chamada da Home abre Assinatura na equipe indicada, sem botão Voltar', async () => {
    mount('/app/settings?aba=assinatura&equipe=team-b');
    expect(await screen.findByText('Plano para 5 pessoas')).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Assinatura' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(team.switchTeam).toHaveBeenCalledExactlyOnceWith('team-b'));
    expect(screen.queryByRole('button', { name: 'Voltar' })).not.toBeInTheDocument();
    selectTab('Perfil');
    expect(await screen.findByText('Excluir minha conta')).toBeVisible();
  });

  it('o link da denúncia mantém Membros ao consumir a equipe e ao voltar da assinatura', async () => {
    mount('/app/settings?aba=membros&equipe=team-b');
    expect(await screen.findByText('Denúncias da equipe')).toBeVisible();
    await waitFor(() => expect(team.switchTeam).toHaveBeenCalledExactlyOnceWith('team-b'));
    selectTab('Assinatura');
    expect(await screen.findByText('Plano para 5 pessoas')).toBeVisible();
    selectTab('Membros');
    expect(screen.getByText('Denúncias da equipe')).toBeVisible();
    expect(team.switchTeam).toHaveBeenCalledTimes(1);
  });

  it('a exclusão abre Perfil mesmo quando Assinatura foi selecionada sem mudar a URL', async () => {
    mount();
    selectTab('Assinatura');
    expect(await screen.findByText('Plano para 5 pessoas')).toBeVisible();
    fireEvent.click(screen.getByRole('link', { name: 'Ir para exclusão' }));
    expect(await screen.findByText('Excluir minha conta')).toBeVisible();
    expect(screen.getByText('Permissão do Asafe')).toBeVisible();
    expect(screen.getByText('Face ID')).toBeVisible();
  });

  it('o convite acima do limite abre a assinatura da equipe escolhida e volta a Membros', async () => {
    mount('/app/settings?aba=membros');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir plano da equipe convidada' }));
    expect(await screen.findByText('Plano para 8 pessoas')).toBeVisible();
    expect(team.switchTeam).toHaveBeenCalledExactlyOnceWith('team-b');
    selectTab('Membros');
    expect(screen.getByText('Denúncias da equipe')).toBeVisible();
  });
});
