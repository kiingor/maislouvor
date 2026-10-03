import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useScrollTopOnNavigate } from "./useScrollTopOnNavigate";

let go: (to: string) => void = () => {};

/** Layout + tela: a tela rola até a âncora no próprio efeito (roda antes do efeito do layout). */
function Shell({ scrollEl, onChildEffect }: { scrollEl: HTMLElement; onChildEffect: () => void }) {
  const navigate = useNavigate();
  go = navigate;
  useScrollTopOnNavigate(scrollEl);
  return <Child onEffect={onChildEffect} />;
}
function Child({ onEffect }: { onEffect: () => void }) {
  useEffect(() => {
    onEffect();
  });
  return null;
}

afterEach(cleanup);

describe("useScrollTopOnNavigate", () => {
  it("starts each screen at the top, but leaves #anchors to the section", () => {
    const order: string[] = [];
    const scrollEl = document.createElement("div");
    scrollEl.scrollTo = vi.fn(() => {
      order.push("layout:top");
    });
    render(
      <MemoryRouter initialEntries={["/app/home"]}>
        <Shell scrollEl={scrollEl} onChildEffect={() => order.push("tela")} />
      </MemoryRouter>,
    );
    expect(scrollEl.scrollTo).toHaveBeenCalledTimes(1);

    act(() => go("/app/settings#excluir-conta"));
    expect(scrollEl.scrollTo).toHaveBeenCalledTimes(1);
    expect(order.at(-1)).toBe("tela");

    act(() => go("/app/cultos"));
    expect(scrollEl.scrollTo).toHaveBeenCalledTimes(2);
    expect(scrollEl.scrollTo).toHaveBeenLastCalledWith({ top: 0 });
  });
});
