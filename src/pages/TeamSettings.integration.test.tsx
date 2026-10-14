import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TeamSettings from './TeamSettings';

const team = vi.hoisted(() => ({
  currentTeam: { id: 'team-a', name: 'Equipe A', role: 'admin' } as { id: string; name: string; role: string } | null,
  teams: [{ id: 'team-a', name: 'Equipe A', role: 'admin' }, { id: 'team-b', name: 'Equipe B', role: 'admin' }],
  isAdmin: true, profileId: 'profile', can: () => true, refetch: vi.fn(), switchTeam: vi.fn(),
}));
const profileApi = vi.hoisted(() => ({
  data: { id: 'profile', user_id: 'auth-user', full_name: 'Pessoa de teste', phone: '83999990000', avatar_url: null },
  error: null as { message: string } | null,
  filter: vi.fn(),
}));
vi.mock('@/contexts/TeamContext', () => ({ useTeam: () => team }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: 'auth-user', email: 'qa@example.test' } } }) },
  from: (table: string) => { const query = { select: () => query,
    eq: (key: string, value: string) => { profileApi.filter(table, key, value); return query; },
    single: async () => table === 'profiles' ? { data: profileApi.error ? null : profileApi.data, error: profileApi.error } : { data: null },
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
vi.mock('@/components/TeamMemberCapacity', () => ({ TeamMemberCapacity: ({ onViewPlan }: any) => <button onClick={onViewPlan}>Ver capacidade e plano</button> }));
vi.mock('@/components/TeamAvailabilitySettings', () => ({ TeamAvailabilitySettings: () => null }));
vi.mock('@/components/AppearanceControl', () => ({ AppearanceSegmented: () => null }));
vi.mock('@/components/FaceIdSettings', () => ({ FaceIdSettings: () => <p>Face ID</p> }));
vi.mock('@/components/AssistantSettings', () => ({ MyAssistantSettings: () => <p>Permissão do Asafe</p>, TeamAssistantSettings: () => <p>Grupos do Asafe</p> }));
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
beforeEach(() => {
  vi.clearAllMocks();
  team.currentTeam = { id: 'team-a', name: 'Equipe A', role: 'admin' };
  team.isAdmin = true;
  profileApi.error = null;
});

describe('junção de assinaturas, moderação e ajustes de conta', () => {
  it('mantém o próprio nome e telefone quando nenhum vínculo de equipe está acessível', async () => {
    team.currentTeam = null;
    mount();
    expect(await screen.findByRole('heading', { name: 'Pessoa de teste' })).toBeVisible();
    expect(screen.getByLabelText('Telefone / WhatsApp')).toHaveValue('83999990000');
    expect(profileApi.filter).toHaveBeenCalledWith('profiles', 'user_id', 'auth-user');
    expect(screen.queryByText('Sem nome')).not.toBeInTheDocument();
  });

  it('exibe erro e permite repetir a leitura do perfil sem apresentá-lo como apagado', async () => {
    team.currentTeam = null;
    profileApi.error = { message: 'network unavailable' };
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar seu perfil.');
    expect(screen.queryByText('Sem nome')).not.toBeInTheDocument();
    profileApi.error = null;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('heading', { name: 'Pessoa de teste' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

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
    expect(screen.queryByText('Permissão do Asafe')).not.toBeInTheDocument();
    expect(screen.getByText('Face ID')).toBeVisible();
  });

  it('separa o Asafe de Perfil e Equipe, mantendo os controles do líder na nova aba', async () => {
    mount();
    expect(await screen.findByText('Excluir minha conta')).toBeVisible();
    expect(screen.queryByText('Permissão do Asafe')).not.toBeInTheDocument();
    selectTab('Equipe');
    expect(screen.queryByText('Grupos do Asafe')).not.toBeInTheDocument();
    selectTab('Asafe');
    expect(screen.getByText('Permissão do Asafe')).toBeVisible();
    expect(screen.getByText('Grupos do Asafe')).toBeVisible();
    expect(screen.queryByText('Face ID')).not.toBeInTheDocument();
  });

  it('abre o link do Asafe para um integrante sem expor os controles do líder', async () => {
    team.isAdmin = false;
    mount('/app/settings?aba=asafe');
    expect(await screen.findByText('Permissão do Asafe')).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Asafe' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Grupos do Asafe')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Equipe' })).not.toBeInTheDocument();
  });

  it('abre Assinatura a partir do resumo de vagas na aba Membros', async () => {
    mount('/app/settings?aba=membros');
    fireEvent.click(await screen.findByRole('button', { name: 'Ver capacidade e plano' }));
    expect(await screen.findByText('Plano para 5 pessoas')).toBeVisible();
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
