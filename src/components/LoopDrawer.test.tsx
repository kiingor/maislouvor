import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoopDrawer } from "./LoopDrawer";

describe("LoopDrawer", () => {
  it("deixa os gestos da lista livres e captura o arraste apenas na alça", () => {
    render(
      <LoopDrawer open onOpenChange={vi.fn()} isDark>
        <div role="list" aria-label="Loops salvos" style={{ overflowY: "auto" }}>
          {Array.from({ length: 40 }, (_, i) => <div role="listitem" key={i}>Trecho {i + 1}</div>)}
        </div>
      </LoopDrawer>,
    );
    const item = screen.getByText("Trecho 1");
    item.setPointerCapture = vi.fn();
    fireEvent.pointerDown(item, { pointerType: "touch", pointerId: 1 });
    fireEvent.pointerMove(item, { pointerType: "touch", pointerId: 1, clientY: 100 });
    expect(item.setPointerCapture).not.toHaveBeenCalled();

    const handle = screen.getByRole("button", { name: "Fechar lista de loops" });
    handle.setPointerCapture = vi.fn();
    fireEvent.pointerDown(handle, { pointerType: "touch", pointerId: 2 });
    expect(handle.setPointerCapture).toHaveBeenCalledOnce();
  });

  it("permite fechar o painel pelo teclado", () => {
    const onOpenChange = vi.fn();
    render(<LoopDrawer open onOpenChange={onOpenChange} isDark><p>Loops</p></LoopDrawer>);
    fireEvent.keyDown(screen.getByRole("button", { name: "Fechar lista de loops" }), { key: "Enter" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
