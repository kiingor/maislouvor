import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HomeTeamFeed } from "@/components/HomeTeamFeed";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), limits: {} as Record<string, number> }));

// Linhas de cada tabela, da mais nova para a mais antiga (como o .order() do feed pede).
const tables: Record<string, unknown[]> = {
  cultos: [{ id: "c1", name: "Culto de domingo", created_at: "2026-10-03T08:00:00Z" }],
  songs: [],
  messages: [
    { id: "m1", content: "Você é um *****", created_at: "2026-10-03T12:00:00Z", sender_profile_id: "p-ana", profiles: { full_name: "Ana Souza" } },
    { id: "m2", content: "Bom dia, equipe!", created_at: "2026-10-03T11:00:00Z", sender_profile_id: "p-bia", profiles: { full_name: "Bia Lima" } },
    { id: "m3", content: "Mais uma da Ana", created_at: "2026-10-03T10:00:00Z", sender_profile_id: "p-ana", profiles: { full_name: "Ana Souza" } },
  ],
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: (n: number) => {
          mocks.limits[table] = n;
          return Promise.resolve({ data: tables[table] ?? [], error: null });
        },
      };
      return query;
    },
  },
}));
vi.mock("@/contexts/TeamContext", () => ({ useTeam: () => ({ profileId: "me" }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderFeed() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HomeTeamFeed teamId="team-1" />
    </QueryClientProvider>,
  );
}

describe("HomeTeamFeed", () => {
  it("leaves out chat messages from people I blocked", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ profile_id: "p-ana", full_name: "Ana Souza", avatar_url: null, created_at: "2026-10-03T09:00:00Z" }],
      error: null,
    });
    renderFeed();

    expect(await screen.findByText("Bia: Bom dia, equipe!")).toBeInTheDocument();
    expect(screen.getByText('Culto "Culto de domingo" foi criado')).toBeInTheDocument();
    expect(screen.queryByText(/Ana/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\*\*\*\*\*/)).not.toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("list_blocked_users", undefined);
    // Busca mensagens a mais para o feed continuar cheio sem as bloqueadas.
    expect(mocks.limits.messages).toBeGreaterThan(6);
  });

  it("shows everyone when nobody is blocked", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    renderFeed();

    expect(await screen.findByText("Ana: Você é um *****")).toBeInTheDocument();
    expect(screen.getByText("Bia: Bom dia, equipe!")).toBeInTheDocument();
    expect(screen.getByText("Ana: Mais uma da Ana")).toBeInTheDocument();
  });
});
