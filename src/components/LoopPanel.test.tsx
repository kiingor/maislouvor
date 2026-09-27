import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { LoopPanel } from "./LoopPanel";
import { useLoopSequence } from "@/hooks/useLoopSequence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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
  notes: null as string | null,
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

function setup(songId = "song-1", myLoops = loops) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(["my-loops", "song-1"], myLoops);
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

  describe("observações", () => {
    const longNote = "Respirar antes do refrão e segurar a dinâmica até a bateria entrar no segundo compasso.";
    const withNotes = [
      { ...loops[0], notes: null },
      { ...loops[1], notes: "Entrar junto com a bateria" },
      { ...loops[2], notes: "Primeira voz sobe uma terça.\nSegunda voz entra no verso." },
      { ...loops[3], notes: longNote },
    ];
    const item = (label: string) => screen.getByRole("button", { name: `Selecionar ${label}` }).closest("[role=listitem]") as HTMLElement;
    // JSDOM não tem layout: simula texto que não cabe na linha (texto longo).
    const fakeLayout = () => {
      vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(240);
      vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) {
        return (this.textContent?.length ?? 0) > 60 ? 720 : 200;
      });
    };

    it("não reserva espaço sem observação e mostra a observação recolhida em uma linha", () => {
      fakeLayout();
      setup("song-1", withNotes);
      expect(within(item("Trecho 1")).queryByText(/Observações:/)).not.toBeInTheDocument();
      expect(item("Trecho 1").querySelector("p")).toBeNull();

      const short = within(item("Trecho 2")).getByText("Entrar junto com a bateria");
      expect(short).toHaveClass("truncate");
      // Cabe na linha: sem controle, e tocar no texto continua selecionando o loop como o resto da linha.
      expect(within(item("Trecho 2")).queryByRole("button", { name: /observações/ })).not.toBeInTheDocument();
      fireEvent.click(short);
      expect(screen.getByRole("button", { name: "Selecionar Trecho 2" })).toHaveAttribute("aria-pressed", "true");

      for (const label of ["Trecho 3", "Trecho 4"]) {
        const toggle = within(item(label)).getByRole("button", { name: `Mostrar observações de ${label}` });
        expect(toggle).toHaveAttribute("aria-expanded", "false");
        expect(document.getElementById(toggle.getAttribute("aria-controls")!)).toHaveClass("truncate");
      }
      vi.restoreAllMocks();
    });

    it("expande e recolhe o texto completo sem selecionar nem tocar o loop", () => {
      fakeLayout();
      const { props } = setup("song-1", withNotes);
      const toggle = within(item("Trecho 3")).getByRole("button", { name: "Mostrar observações de Trecho 3" });
      const text = document.getElementById(toggle.getAttribute("aria-controls")!)!;
      fireEvent.pointerDown(toggle);
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(toggle).toHaveAccessibleName("Recolher observações de Trecho 3");
      expect(text).toHaveClass("whitespace-pre-wrap");
      expect(text).not.toHaveClass("truncate");
      expect(text.textContent).toContain("terça.\nSegunda voz");

      fireEvent.click(text); // tocar no texto aberto recolhe
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      fireEvent.click(within(item("Trecho 4")).getByText(longNote)); // tocar no texto cortado expande
      expect(within(item("Trecho 4")).getByRole("button", { name: "Recolher observações de Trecho 4" })).toHaveAttribute("aria-expanded", "true");

      fireEvent.keyDown(toggle, { key: "Enter" });
      fireEvent.keyDown(toggle, { key: " " });
      expect(props.onSelectLoop).not.toHaveBeenCalled();
      expect(props.onSeek).not.toHaveBeenCalled();
      expect(props.onTogglePlayback).not.toHaveBeenCalled();
      expect(screen.queryByRole("list", { name: "Ordem dos loops" })).not.toBeInTheDocument();
      expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
      vi.restoreAllMocks();
    });

    it("mostra a observação nos loops públicos dos perfis", async () => {
      const { queryClient } = setup();
      const publicLoop = { ...loops[0], id: "public-loop", profile_id: "profile-2", label: "Ponte pública", is_public: true, notes: "Tom sobe no final.\nOlhar para o ministro." };
      await act(async () => {
        queryClient.setQueryData(["loop-profiles", "profile-2"], [{ id: "profile-2", full_name: "Membro", avatar_url: null }]);
        queryClient.setQueryData(["public-loops", "song-1"], [publicLoop]);
      });
      fireEvent.mouseDown(screen.getByRole("tab", { name: /perfis/i }), { button: 0, ctrlKey: false });
      fireEvent.click(await screen.findByRole("button", { name: /membro/i }));
      const toggle = screen.getByRole("button", { name: "Mostrar observações de Ponte pública" });
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("button", { name: "Selecionar Ponte pública" })).toHaveAttribute("aria-pressed", "false");
    });

    function mockWrites() {
      const insert = vi.fn().mockResolvedValue({ error: null });
      const eq = vi.fn().mockResolvedValue({ error: null });
      const update = vi.fn<(values: Record<string, unknown>) => { eq: typeof eq }>(() => ({ eq }));
      vi.mocked(supabase.rpc).mockResolvedValue({ data: "profile-1", error: null } as never);
      vi.mocked(supabase.from).mockReturnValue({ insert, update } as unknown as ReturnType<typeof supabase.from>);
      return { insert, update, eq };
    }

    it("cria o loop com a observação e sem o campo quando não há observação", async () => {
      const { insert } = mockWrites();
      const { queryClient } = setup("song-1", withNotes);
      vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
      fireEvent.click(screen.getByRole("button", { name: /criar novo loop/i }));
      fireEvent.change(screen.getByRole("textbox", { name: /Observações/ }), { target: { value: "Ponte com a banda toda\nSem pressa" } });
      fireEvent.click(screen.getByRole("button", { name: "Criar loop" }));
      await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
      expect(insert.mock.calls[0][0]).toMatchObject({ song_id: "song-1", profile_id: "profile-1", notes: "Ponte com a banda toda\nSem pressa", sort_order: 4 });
      await waitFor(() => expect(screen.getByRole("button", { name: /criar novo loop/i })).toBeInTheDocument());

      fireEvent.click(screen.getByRole("button", { name: /criar novo loop/i }));
      fireEvent.click(screen.getByRole("button", { name: "Criar loop" }));
      await waitFor(() => expect(insert).toHaveBeenCalledTimes(2));
      expect(insert.mock.calls[1][0]).not.toHaveProperty("notes");
      vi.restoreAllMocks();
    });

    it("edita, remove e só envia a observação quando ela muda", async () => {
      const { update, eq } = mockWrites();
      const { queryClient } = setup("song-1", withNotes);
      vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();

      fireEvent.click(screen.getByRole("button", { name: "Editar Trecho 2" }));
      const notes = screen.getByRole("textbox", { name: /Observações/ });
      expect(notes).toHaveValue("Entrar junto com a bateria");
      fireEvent.change(notes, { target: { value: "Entrar depois da virada" } });
      fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      expect(update.mock.calls[0][0]).toEqual({ label: "Trecho 2", start_time: 10, end_time: 18, repeat_count: 0, notes: "Entrar depois da virada" });
      expect(eq).toHaveBeenLastCalledWith("id", "loop-1");

      await waitFor(() => expect(screen.getByRole("button", { name: "Editar Trecho 3" })).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: "Editar Trecho 3" }));
      fireEvent.click(screen.getByRole("button", { name: "Limpar observações" }));
      fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
      await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
      expect(update.mock.calls[1][0]).toMatchObject({ notes: null });

      // Loop sem observação editado sem mexer nela: o pedido não leva `notes`
      // (continua funcionando num servidor que ainda não tem a coluna).
      await waitFor(() => expect(screen.getByRole("button", { name: "Editar Trecho 1" })).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: "Editar Trecho 1" }));
      fireEvent.click(screen.getByRole("button", { name: "4×" }));
      fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
      await waitFor(() => expect(update).toHaveBeenCalledTimes(3));
      expect(update.mock.calls[2][0]).toEqual({ label: "Trecho 1", start_time: 0, end_time: 8, repeat_count: 4 });
      vi.restoreAllMocks();
    });

    it("mantém o editor aberto e explica quando o servidor ainda não aceita observações", async () => {
      const { insert } = mockWrites();
      insert.mockResolvedValue({ error: { code: "PGRST204", message: "Could not find the 'notes' column of 'song_loop_points' in the schema cache" } });
      setup("song-1", withNotes);
      fireEvent.click(screen.getByRole("button", { name: /criar novo loop/i }));
      fireEvent.change(screen.getByRole("textbox", { name: /Observações/ }), { target: { value: "Não perder" } });
      fireEvent.click(screen.getByRole("button", { name: "Criar loop" }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
        "As observações ainda não estão disponíveis no servidor. Limpe a observação para salvar o loop.",
      ));
      expect(screen.getByRole("textbox", { name: /Observações/ })).toHaveValue("Não perder");
      vi.restoreAllMocks();
    });
  });
});
