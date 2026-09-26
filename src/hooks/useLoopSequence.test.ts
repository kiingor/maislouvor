import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLoopSequence, type LoopPoint } from "./useLoopSequence";

const loop = (id: string, start: number, repeat = 0): LoopPoint => ({
  id, label: id, song_id: "song-1", profile_id: "profile-1", is_public: false,
  start_time: start, end_time: start + 10, repeat_count: repeat, sort_order: start,
  created_at: new Date(0).toISOString(),
});
const intro = loop("Intro", 0);
const chorus = loop("Refrão", 40);
const ending = loop("Final", 90);

function setup() {
  const view = renderHook(({ songId }) => useLoopSequence(songId), { initialProps: { songId: "song-1" } });
  const select = (item: LoopPoint) => {
    let seek: number | null;
    act(() => { seek = view.result.current.toggleLoop(item); });
    return seek;
  };
  const advance = (time: number) => {
    let seek: number | null;
    act(() => { seek = view.result.current.advanceLoop(time); });
    return seek;
  };
  return { ...view, select, advance };
}

describe("useLoopSequence", () => {
  it("repete a sequência na ordem de seleção, mesmo fora da ordem da música", () => {
    const { result, select, advance } = setup();
    expect(select(chorus)).toBe(40);
    expect(select(intro)).toBeNull();
    expect(select(ending)).toBeNull();
    expect(result.current.selectedLoops).toEqual([chorus, intro, ending]);
    expect(advance(49)).toBeNull();
    expect(advance(50)).toBe(0);
    expect(result.current.activeLoop).toEqual(intro);
    expect(advance(10)).toBe(90);
    expect(advance(100)).toBe(40);
    expect(result.current.selectedLoops).toEqual([chorus, intro, ending]);
    expect(result.current.currentRepetition).toBe(1);
  });

  it("cumpre repetições finitas e toca infinitos uma vez por rodada", () => {
    const { result, select, advance } = setup();
    select(loop("Refrão", 40, 2));
    select(intro);
    expect(advance(50)).toBe(40);
    expect(result.current.currentRepetition).toBe(2);
    expect(advance(50)).toBe(0);
    expect(result.current.currentRepetition).toBe(1);
    expect(advance(10)).toBe(40);
    expect(result.current.currentRepetition).toBe(1);
    expect(advance(50)).toBe(40);
  });

  it("repete também sequências compostas apenas de loops finitos", () => {
    const { select, advance } = setup();
    select(loop("A", 40, 1));
    select(loop("B", 0, 2));
    expect(advance(50)).toBe(0);
    expect(advance(10)).toBe(0);
    expect(advance(10)).toBe(40);
  });

  it("preserva o comportamento de um único loop infinito ou finito", () => {
    const { result, select, advance } = setup();
    select(intro);
    expect(advance(10)).toBe(0);
    expect(advance(10)).toBe(0);
    expect(result.current.currentRepetition).toBe(3);
    select(intro);
    select(loop("Finito", 20, 2));
    expect(advance(30)).toBe(20);
    expect(advance(30)).toBeNull();
    expect(result.current.selectedLoops).toEqual([]);
    expect(result.current.activeLoop).toBeNull();
    expect(result.current.currentRepetition).toBe(0);
  });

  it("adiciona e remove loops futuros sem reiniciar o trecho atual", () => {
    const { result, select, advance } = setup();
    select(loop("Atual", 40, 3));
    advance(50);
    expect(select(intro)).toBeNull();
    expect(select(ending)).toBeNull();
    expect(select(intro)).toBeNull();
    expect(result.current.activeLoop?.id).toBe("Atual");
    expect(result.current.currentRepetition).toBe(2);
    expect(result.current.selectedLoops.map((item) => item.id)).toEqual(["Atual", "Final"]);
  });

  it("reinsere um loop no fim e mantém o atual ao remover um item anterior", () => {
    const { result, select, advance } = setup();
    select(chorus);
    select(intro);
    select(ending);
    advance(50);
    expect(select(chorus)).toBeNull();
    expect(result.current.activeLoop).toEqual(intro);
    expect(select(chorus)).toBeNull();
    expect(result.current.selectedLoops).toEqual([intro, ending, chorus]);
    expect(advance(10)).toBe(90);
  });

  it("passa ao próximo ao remover o atual e volta ao início ao remover o último", () => {
    const { result, select, advance } = setup();
    select(chorus);
    select(intro);
    select(ending);
    expect(select(chorus)).toBe(0);
    advance(10);
    expect(select(ending)).toBe(0);
    expect(result.current.activeLoop).toEqual(intro);
    expect(result.current.currentRepetition).toBe(1);
    expect(select(intro)).toBeNull();
    expect(result.current.activeLoop).toBeNull();
  });

  it("usa o estado mais recente em eventos consecutivos antes de renderizar", () => {
    const { result } = setup();
    act(() => {
      result.current.toggleLoop(chorus);
      result.current.toggleLoop(intro);
      expect(result.current.advanceLoop(50)).toBe(0);
      expect(result.current.advanceLoop(0)).toBeNull();
      expect(result.current.advanceLoop(10)).toBe(40);
    });
    expect(result.current.activeLoop).toEqual(chorus);
    expect(result.current.selectedLoops).toEqual([chorus, intro]);
  });

  it("limpa a seleção e descarta a sequência ao mudar de música", () => {
    const { result, select, rerender } = setup();
    select(chorus);
    select(intro);
    act(() => result.current.clearLoops());
    expect(result.current.selectedLoops).toEqual([]);
    select(ending);
    rerender({ songId: "song-2" });
    expect(result.current.selectedLoops).toEqual([]);
    expect(result.current.activeLoop).toBeNull();
  });

  it("ignora a remoção de um loop fora da seleção", () => {
    const { result, select } = setup();
    select(chorus);
    act(() => expect(result.current.removeLoop(intro.id)).toBeNull());
    expect(result.current.selectedLoops).toEqual([chorus]);
  });
});
