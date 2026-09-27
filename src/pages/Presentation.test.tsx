import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Presentation from "./Presentation";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ createSignedUrl: async (path: string) => ({ data: { signedUrl: `audio:${path}` } }) }) },
  },
}));
vi.mock("@/contexts/TeamContext", () => ({ useTeam: () => ({ profileId: null, currentTeam: null }) }));
vi.mock("tone", () => ({
  start: vi.fn().mockResolvedValue(undefined),
  // Exercise the player's existing HTMLAudio fallback in JSDOM.
  PitchShift: class { constructor() { throw new Error("Web Audio unavailable in JSDOM"); } },
}));

class TestAudio extends EventTarget {
  static instances: TestAudio[] = [];
  src = "";
  duration = 120;
  private time = 0;
  ended = false;
  readyState = 4;
  paused = true;
  muted = false;
  volume = 1;
  playbackRate = 1;

  constructor() {
    super();
    TestAudio.instances.push(this);
  }
  load = vi.fn();
  get currentTime() { return this.time; }
  set currentTime(time: number) { this.time = time; this.ended = false; }
  play = vi.fn(async () => {
    this.paused = false;
    this.ended = false;
    this.dispatchEvent(new Event("play"));
    this.dispatchEvent(new Event("playing"));
  });
  pause = vi.fn(() => {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  });
  tick(time: number) {
    this.currentTime = time;
    this.dispatchEvent(new Event("timeupdate"));
  }
  finish(withTimeUpdate: boolean) {
    this.time = this.duration;
    this.paused = true;
    this.ended = true;
    if (withTimeUpdate) this.dispatchEvent(new Event("timeupdate"));
    this.dispatchEvent(new Event("ended"));
  }
}

const lyrics = Array.from({ length: 8 }, (_, index) => `[Parte ${index + 1}]\nLetra do trecho ${index + 1}`).join("\n\n");
const loop = {
  id: "intro", label: "Trecho de ensaio", song_id: "song-1", profile_id: "profile-1",
  start_time: 0, end_time: 10, repeat_count: 0, sort_order: 0,
  is_public: false, created_at: new Date(0).toISOString(),
};
const loops = [loop,
  { ...loop, id: "chorus", label: "Refrão", start_time: 40, end_time: 50, repeat_count: 2, sort_order: 1 },
  { ...loop, id: "ending", label: "Final", start_time: 110, end_time: 120, sort_order: 2 },
];

async function setup({ audio = true, tracks = true, timestamps }: {
  audio?: boolean;
  tracks?: boolean;
  timestamps?: { voz: number[] };
} = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  queryClient.setQueryData(["presentation-songs", "repertorio", "repertorio-1"], [
    { id: "song-1", title: "Aleluia, Hosana", audio_path: audio ? "main" : null, cifra_text: lyrics, lyrics_text: lyrics, cover_path: null, segment_timestamps: timestamps },
    { id: "song-2", title: "Próxima música", audio_path: "next", cifra_text: "[Intro]\nLetra seguinte", cover_path: null },
  ]);
  for (const id of ["song-1", "song-2"]) {
    queryClient.setQueryData(["presentation-tracks", id], id === "song-1" && tracks ? [{ id: "track-1", track_name: "Voz", audio_path: "stem" }] : []);
    queryClient.setQueryData(["all-my-loops", id], id === "song-1" ? loops : []);
    queryClient.setQueryData(["my-loops", id], id === "song-1" ? loops : []);
    queryClient.setQueryData(["public-loops", id], []);
    queryClient.setQueryData(["song-audio-attachments", id], []);
  }
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/app/repertorios/repertorio-1/ensaio"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes><Route path="/app/repertorios/:id/ensaio" element={<Presentation source="repertorio" />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  if (audio) {
    await waitFor(() => expect(TestAudio.instances.some((item) => item.src === "audio:main")).toBe(true));
    const main = TestAudio.instances.find((item) => item.src === "audio:main")!;
    act(() => main.dispatchEvent(new Event("loadedmetadata")));
    return main;
  }
  return null;
}

async function elapse(seconds: number, onSecond?: (second: number) => void) {
  // Flush each second so React can schedule subsequent segment/countdown ticks.
  for (let second = 1; second <= seconds; second++) {
    await act(async () => {
      onSecond?.(second);
      await vi.advanceTimersByTimeAsync(1000);
    });
  }
}

beforeAll(() => {
  vi.stubGlobal("Audio", TestAudio);
  vi.stubGlobal("localStorage", { getItem: vi.fn(), setItem: vi.fn() });
});
beforeEach(() => {
  TestAudio.instances = [];
  vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify({ instrument: "voz" }));
});
afterEach(() => vi.useRealTimers());
afterAll(() => vi.unstubAllGlobals());

describe("áudios adicionais e sequência de loops", () => {
  it("pausa os players e retoma a segunda repetição na mesma posição e velocidade", async () => {
    const main = (await setup())!;
    fireEvent.click(screen.getByTitle("Modo Ensaio"));
    fireEvent.click(screen.getByRole("button", { name: "Selecionar Refrão" }));
    fireEvent.click(screen.getByRole("button", { name: "Selecionar Trecho de ensaio" }));
    fireEvent.click(screen.getByRole("button", { name: "0.75x" }));
    fireEvent.click(screen.getByTitle("Mixer de faixas"));
    fireEvent.click(screen.getByRole("button", { name: "Reproduzir música" }));
    await waitFor(() => expect(TestAudio.instances.some((item) => item.src === "audio:stem" && !item.paused)).toBe(true));
    const stem = TestAudio.instances.find((item) => item.src === "audio:stem")!;
    act(() => main.tick(50));
    act(() => main.tick(43));
    fireEvent.click(screen.getByRole("button", { name: "Áudios adicionais" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(main.paused).toBe(true);
    expect(stem.paused).toBe(true);
    expect(main.currentTime).toBe(43);
    expect(main.playbackRate).toBe(0.75);
    fireEvent.keyDown(window, { key: " " });
    fireEvent.keyDown(window, { key: "n" });
    expect(main.paused).toBe(true);
    expect(main.src).toBe("audio:main");
    // O ✕ da folha vem de ui/dialog (closeLabel "Fechar").
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.getByRole("button", { name: "Remover Refrão da sequência" })).toHaveAttribute("aria-current", "step");
    fireEvent.click(screen.getByRole("button", { name: "Reproduzir música" }));
    await waitFor(() => expect(stem.paused).toBe(false));
    expect(main.currentTime).toBe(43);
    expect(stem.currentTime).toBe(43);
    expect(main.playbackRate).toBe(0.75);
    act(() => main.tick(50));
    expect(main.currentTime).toBe(0);
    expect(stem.currentTime).toBe(0);
    expect(screen.getByRole("button", { name: "Remover Trecho de ensaio da sequência" })).toHaveAttribute("aria-current", "step");
  });

  it.each([true, false])("continua a sequência ao terminar o arquivo (timeupdate: %s)", async (withTimeUpdate) => {
    const main = (await setup())!;
    fireEvent.click(screen.getByTitle("Modo Ensaio"));
    fireEvent.click(screen.getByRole("button", { name: "Selecionar Final" }));
    fireEvent.click(screen.getByRole("button", { name: "Selecionar Trecho de ensaio" }));
    fireEvent.click(screen.getByTitle("Mixer de faixas"));
    fireEvent.click(screen.getByRole("button", { name: "Reproduzir música" }));
    await waitFor(() => expect(TestAudio.instances.some((item) => item.src === "audio:stem" && !item.paused)).toBe(true));
    const stem = TestAudio.instances.find((item) => item.src === "audio:stem")!;
    act(() => { stem.finish(false); main.finish(withTimeUpdate); });
    expect(main.currentTime).toBe(0);
    expect(stem.currentTime).toBe(0);
    expect(main.paused).toBe(false);
    expect(stem.paused).toBe(false);
    expect(screen.getByRole("button", { name: "Remover Trecho de ensaio da sequência" })).toHaveAttribute("aria-current", "step");
    act(() => main.tick(10));
    expect(main.currentTime).toBe(110);
  });
});

describe("avanço automático durante o ensaio", () => {
  it.each([
    { label: "sem timestamps", timestamps: undefined, tracks: true },
    { label: "timestamps incompatíveis e sem faixas", timestamps: { voz: [0, 30] }, tracks: false },
  ])("mantém a música aos 1:09 com áudio e $label", async ({ timestamps, tracks }) => {
    const main = (await setup({ timestamps, tracks }))!;
    vi.useFakeTimers();
    fireEvent.keyDown(window, { key: " " });
    await elapse(69, (second) => main.tick(second));

    expect(main.src).toBe("audio:main");
    expect(main.currentTime).toBe(69);
    expect(main.paused).toBe(false);
    expect(screen.queryByText("Próxima música em")).not.toBeInTheDocument();
    expect(TestAudio.instances.some((item) => item.src === "audio:next" && !item.paused)).toBe(false);
  });

  it("mantém o loop ativo depois do tempo que antes trocava a música", async () => {
    const main = (await setup())!;
    fireEvent.click(screen.getByTitle("Modo Ensaio"));
    fireEvent.click(screen.getByText("Trecho de ensaio"));
    vi.useFakeTimers();
    fireEvent.keyDown(window, { key: " " });
    await elapse(69, () => main.tick(main.currentTime + 1));

    expect(main.src).toBe("audio:main");
    expect(main.currentTime).toBe(9);
    expect(main.paused).toBe(false);
    expect(screen.queryByText("Próxima música em")).not.toBeInTheDocument();
  });

  it("não troca automaticamente quando há apenas faixas de áudio", async () => {
    await setup({ audio: false });
    vi.useFakeTimers();
    await act(async () => { fireEvent.keyDown(window, { key: " " }); });
    const stem = TestAudio.instances.find((item) => item.src === "audio:stem")!;
    expect(stem?.paused).toBe(false);
    await elapse(69);

    expect(stem.src).toBe("audio:stem");
    expect(stem.paused).toBe(false);
    expect(screen.queryByText("Próxima música em")).not.toBeInTheDocument();
  });

  it("mantém a navegação explícita para a próxima música", async () => {
    const main = (await setup())!;
    fireEvent.keyDown(window, { key: " " });
    fireEvent.keyDown(window, { key: "n" });
    await waitFor(() => expect(main.src).toBe(""));
    expect(main.paused).toBe(true);
    await waitFor(() => expect(TestAudio.instances.some((item) => item.src === "audio:next")).toBe(true));
  });
});

describe("tema do palco e foco", () => {
  it("aplica o tema do palco no <html> e na theme-color e devolve o do sistema ao sair", async () => {
    const metas = ["(prefers-color-scheme: light)", "(prefers-color-scheme: dark)"].map((media, index) => {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.media = media;
      meta.content = index === 0 ? "#F2F2F7" : "#000000";
      document.head.appendChild(meta);
      return meta;
    });
    try {
      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify({ instrument: "voz", theme: "light" }));
      document.documentElement.classList.add("dark");
      await setup();
      expect(document.documentElement.classList.contains("dark")).toBe(false);
      expect(metas.map((meta) => meta.content)).toEqual(["#FFFFFF", "#FFFFFF"]);
      cleanup();
      // matchMedia do setup responde "claro": ao sair, volta o esquema do sistema e as cores originais.
      expect(document.documentElement.classList.contains("dark")).toBe(false);
      expect(metas.map((meta) => meta.content)).toEqual(["#F2F2F7", "#000000"]);

      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify({ instrument: "voz", theme: "dark" }));
      await setup();
      expect(document.documentElement.classList.contains("dark")).toBe(true);
      expect(metas.map((meta) => meta.content)).toEqual(["#000000", "#000000"]);
      cleanup();
      expect(document.documentElement.classList.contains("dark")).toBe(false);
      expect(metas.map((meta) => meta.content)).toEqual(["#F2F2F7", "#000000"]);
    } finally {
      metas.forEach((meta) => meta.remove());
    }
  });

  it("não devolve o foco ao seletor de músicas: o espaço volta a tocar/pausar", async () => {
    const main = (await setup())!;
    const trigger = screen.getAllByRole("button", { name: /Aleluia, Hosana/ })[0];
    fireEvent.click(trigger);
    const menu = await screen.findByRole("dialog");
    fireEvent.click(within(menu).getByRole("button", { name: /Aleluia, Hosana/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.activeElement).not.toBe(trigger);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: " " });
    await waitFor(() => expect(main.paused).toBe(false));
  });
});

// Regressão: abrir o TAP em tela larga mostrava
// «Error: `DialogTitle` must be used within `Dialog`.» (título de gaveta fora de Drawer).
describe("metrônomo (TAP)", () => {
  it("abre e fecha o painel lateral em telas largas, com nome acessível e sem erro", async () => {
    // JSDOM usa innerWidth 1024: caminho do painel lateral (fora de Drawer/Dialog).
    await setup();
    fireEvent.click(screen.getByTitle("Metrônomo / Tap"));
    const panel = await screen.findByRole("region", { name: "Metrônomo" });
    expect(within(panel).getByRole("heading", { name: "Metrônomo" })).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Fechar metrônomo" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Metrônomo" })).not.toBeInTheDocument());
  });

  it("abre a folha do celular com título acessível de diálogo", async () => {
    const width = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    try {
      await setup();
      fireEvent.click(screen.getByTitle("Metrônomo / Tap"));
      expect(await screen.findByRole("dialog", { name: "Metrônomo" })).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    }
  });
});
