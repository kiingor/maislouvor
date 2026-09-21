import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { LoopPanel } from "./LoopPanel";

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
    activeLoopId: null,
    currentRepetition: 0,
    playbackRate: 1,
    onSelectLoop: vi.fn(),
    onPlaybackRateChange: vi.fn(),
    isDark: true,
    onClose: vi.fn(),
  };

  const view = render(
    <QueryClientProvider client={queryClient}>
      <LoopPanel songId={songId} {...props} />
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
});
