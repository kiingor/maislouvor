import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { LoopPanel } from "./LoopPanel";
import { useLoopSequence } from "@/hooks/useLoopSequence";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

const loops = Array.from({ length: 12 }, (_, index) => ({
  id: `loop-${index}`,
  song_id: "song-1",
  profile_id: "profile-1",
  label: `Trecho ${index + 1}`,
  start_time: index * 10,
  end_time: index * 10 + 8,
  is_public: false,
  repeat_count: 0,
  sort_order: index,
  created_at: new Date(0).toISOString(),
}));

function StatefulPanel(props: ComponentProps<typeof LoopPanel>) {
  const sequence = useLoopSequence(props.songId);
  return <LoopPanel {...props}
    selectedLoops={sequence.selectedLoops}
    activeLoopId={sequence.activeLoop?.id ?? null}
    currentRepetition={sequence.currentRepetition}
    onSelectLoop={(loop) => {
      props.onSelectLoop(loop);
      if (loop) sequence.toggleLoop(loop);
      else sequence.clearLoops();
    }}
    onRemoveLoop={(id) => {
      props.onRemoveLoop(id);
      sequence.removeLoop(id);
    }}
  />;
}

function setup(songId = "song-1") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(["my-loops", "song-1"], loops);
  queryClient.setQueryData(["public-loops", "song-1"], []);
  queryClient.setQueryData(["my-loops", "song-2"], []);
  queryClient.setQueryData(["public-loops", "song-2"], []);

  const props = {
    currentTime: 215,
    duration: 300,
    isPlaying: false,
    isPreviewing: false,
    onSeek: vi.fn(),
    onTogglePlayback: vi.fn(),
    onPreview: vi.fn(),
    selectedLoops: [],
    activeLoopId: null,
    currentRepetition: 0,
    playbackRate: 1,
    onSelectLoop: vi.fn(),
    onRemoveLoop: vi.fn(),
    onPlaybackRateChange: vi.fn(),
    isDark: true,
    onClose: vi.fn(),
  };

  const view = render(
    <QueryClientProvider client={queryClient}>
      <StatefulPanel songId={songId} {...props} />
    </QueryClientProvider>,
  );

  return { ...view, props, queryClient };
}

describe("LoopPanel", () => {
  it("mantém a criação acessível antes de uma lista longa e abre um editor focado", () => {
    setup();

    const createButton = screen.getByRole("button", { name: /criar novo loop/i });
    const list = screen.getByRole("list", { name: "Loops salvos" });

    expect(screen.getByRole("tab", { name: "Meus loops (12)" })).toBeInTheDocument();
    expect(list).toHaveClass("overflow-y-auto", "overscroll-contain", "touch-pan-y");
    expect(list).toHaveAttribute("data-vaul-no-drag");
    expect(list).not.toContainElement(createButton);

    fireEvent.click(createButton);

    expect(screen.getByText("Novo loop")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Início do loop" })).toHaveValue("3:35");
    expect(screen.getByRole("textbox", { name: "Fim do loop" })).toHaveValue("3:55");
    expect(screen.getByRole("button", { name: "Criar loop" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Loops salvos" })).not.toBeInTheDocument();
  });

  it("descarta o rascunho ao trocar de música", async () => {
    const { rerender, props, queryClient } = setup();
    fireEvent.click(screen.getByRole("button", { name: /criar novo loop/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Fim do loop" }), {
      target: { value: "4:00" },
    });

    rerender(
      <QueryClientProvider client={queryClient}>
        <LoopPanel songId="song-2" {...props} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /criar novo loop/i })).toBeInTheDocument();
    });
    expect(screen.queryByText("Novo loop")).not.toBeInTheDocument();
    expect(screen.getByText(/nenhum loop criado/i)).toBeInTheDocument();
  });

  it("mostra a ordem escolhida, mantém múltiplos selecionados e permite remover e limpar", () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Selecionar Trecho 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Selecionar Trecho 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Selecionar Trecho 2" }));

    const selectedNames = () => within(screen.getByRole("list", { name: "Ordem dos loops" }))
      .getAllByRole("button").map((button) => button.getAttribute("aria-label"));
    expect(selectedNames()).toEqual([
      "Remover Trecho 3 da sequência", "Remover Trecho 1 da sequência", "Remover Trecho 2 da sequência",
    ]);
    expect(screen.getByRole("button", { name: "Selecionar Trecho 1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Remover Trecho 3 da sequência" })).toHaveAttribute("aria-current", "step");

    fireEvent.click(screen.getByRole("button", { name: "Selecionar Trecho 1" }));
    expect(props.onSelectLoop).toHaveBeenLastCalledWith(loops[0]);
    expect(screen.getByRole("button", { name: "Selecionar Trecho 1" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Selecionar Trecho 1" }));
    expect(selectedNames()).toEqual([
      "Remover Trecho 3 da sequência", "Remover Trecho 2 da sequência", "Remover Trecho 1 da sequência",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Remover Trecho 3 da sequência" }));
    expect(screen.getByRole("button", { name: "Remover Trecho 2 da sequência" })).toHaveAttribute("aria-current", "step");
    fireEvent.click(screen.getByRole("button", { name: "Limpar seleção" }));
    expect(screen.queryByRole("list", { name: "Ordem dos loops" })).not.toBeInTheDocument();
    expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
  });

  it("compartilha a sequência entre meus loops e os loops públicos", async () => {
    const { queryClient } = setup();
    const publicLoop = { ...loops[0], id: "public-loop", profile_id: "profile-2", label: "Ponte pública", is_public: true };
    await act(async () => {
      queryClient.setQueryData(["loop-profiles", "profile-2"], [{ id: "profile-2", full_name: "Membro", avatar_url: null }]);
      queryClient.setQueryData(["public-loops", "song-1"], [publicLoop]);
    });
    fireEvent.click(screen.getByRole("button", { name: "Selecionar Trecho 3" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: /perfis/i }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("button", { name: /membro/i }));
    fireEvent.click(screen.getByRole("button", { name: "Selecionar Ponte pública" }));
    expect(within(screen.getByRole("list", { name: "Ordem dos loops" })).getAllByRole("button")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Selecionar Ponte pública" })).toHaveAttribute("aria-pressed", "true");
  });

  it("remove somente o loop excluído da sequência após a exclusão ser salva", async () => {
    const { props, queryClient } = setup();
    vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    const eq = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({ delete: () => ({ eq }) } as unknown as ReturnType<typeof supabase.from>);
    fireEvent.click(screen.getByRole("button", { name: "Selecionar Trecho 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Selecionar Trecho 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Remover Trecho 3" }));
    await waitFor(() => expect(props.onRemoveLoop).toHaveBeenCalledWith(loops[2].id));
    expect(eq).toHaveBeenCalledWith("id", loops[2].id);
    expect(screen.getByRole("button", { name: "Remover Trecho 1 da sequência" })).toHaveAttribute("aria-current", "step");
    expect(props.onSelectLoop).toHaveBeenCalledTimes(2);
  });
});
