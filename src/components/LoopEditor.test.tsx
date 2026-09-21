import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoopEditor, type LoopEditorProps } from "./LoopEditor";

function setup(overrides: Partial<LoopEditorProps> = {}) {
  const props: LoopEditorProps = {
    currentTime: 73, duration: 240, isPlaying: false, isPreviewing: false, isDark: true,
    onSeek: vi.fn(), onTogglePlayback: vi.fn(), onPreview: vi.fn(), onSave: vi.fn(), onCancel: vi.fn(), ...overrides,
  };
  const view = render(<LoopEditor {...props} />);
  return { props, ...view };
}

describe("LoopEditor", () => {
  it("permite apagar e digitar sem a máscara mover o cursor ou reescrever o campo", () => {
    setup();
    const input = screen.getByRole("textbox", { name: "Início do loop" });
    for (const value of ["", "1", "1:", "1:2", "1:20"]) {
      fireEvent.change(input, { target: { value } });
      expect(input).toHaveValue(value);
    }
    fireEvent.blur(input);
    expect(input).toHaveValue("1:20");
    fireEvent.change(input, { target: { value: "65" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("1:05");
  });

  it.each(["1:75", "2:00abc", "-1", "Infinity", "1.5", ""])("recusa tempo inválido %s antes de salvar", (value) => {
    const { props } = setup();
    fireEvent.change(screen.getByRole("textbox", { name: "Início do loop" }), { target: { value } });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar loop" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("button", { name: "Criar loop" }).closest("form")!);
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("valida a ordem e o limite da música sem perder o rascunho", () => {
    setup();
    const end = screen.getByRole("textbox", { name: "Fim do loop" });
    fireEvent.change(end, { target: { value: "1:00" } });
    expect(screen.getByRole("alert")).toHaveTextContent("O fim precisa vir depois do início");
    fireEvent.change(end, { target: { value: "4:01" } });
    expect(screen.getByRole("alert")).toHaveTextContent("até 4:00");
    fireEvent.change(end, { target: { value: "4:00" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar loop" })).toBeEnabled();
  });

  it("marca o tempo atual, ajusta por segundo, ouve e salva exatamente o mesmo trecho", () => {
    const { props, rerender } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Marcar início agora" }));
    rerender(<LoopEditor {...props} currentTime={98} />);
    fireEvent.click(screen.getByRole("button", { name: "Marcar fim agora" }));
    fireEvent.click(screen.getByRole("button", { name: "Diminuir fim em 1 segundo" }));
    fireEvent.click(screen.getByRole("button", { name: /Ouvir trecho/ }));
    expect(props.onPreview).toHaveBeenCalledWith({ start_time: 73, end_time: 97 });
    fireEvent.click(screen.getByRole("button", { name: "Refrão" }));
    fireEvent.click(screen.getByRole("button", { name: "4×" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar loop" }));
    expect(props.onSave).toHaveBeenCalledWith({ label: "Refrão", start_time: 73, end_time: 97, repeat_count: 4 });
  });

  it("não dispara os atalhos da apresentação durante a edição", () => {
    setup();
    const shortcut = vi.fn();
    window.addEventListener("keydown", shortcut);
    for (const key of ["n", " ", "ArrowLeft", "Escape"]) fireEvent.keyDown(screen.getByRole("textbox", { name: /Nome/ }), { key });
    expect(shortcut).not.toHaveBeenCalled();
    window.removeEventListener("keydown", shortcut);
  });

  it("mantém os controles de áudio dentro do editor e interrompe prévia ao ajustar", () => {
    const { props } = setup({ isPreviewing: true });
    fireEvent.click(screen.getByRole("button", { name: "Voltar 5 segundos" }));
    expect(props.onPreview).toHaveBeenCalledWith(null);
    expect(props.onSeek).toHaveBeenCalledWith(68);
    fireEvent.click(screen.getByRole("button", { name: "Reproduzir música" }));
    expect(props.onTogglePlayback).toHaveBeenCalledOnce();
  });

  it("arrasta o trecho inteiro preservando a duração e respeitando o fim da música", () => {
    setup();
    const range = screen.getByRole("button", { name: "Mover trecho inteiro" });
    const track = range.closest(".loop-editor__range-control")!;
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({ width: 240 } as DOMRect);
    range.setPointerCapture = vi.fn();
    range.releasePointerCapture = vi.fn();
    fireEvent(range, new MouseEvent("pointerdown", { bubbles: true, clientX: 80 }));
    fireEvent(range, new MouseEvent("pointermove", { bubbles: true, clientX: 100 }));
    expect(screen.getByRole("textbox", { name: "Início do loop" })).toHaveValue("1:33");
    expect(screen.getByRole("textbox", { name: "Fim do loop" })).toHaveValue("1:53");
    fireEvent(range, new MouseEvent("pointermove", { bubbles: true, clientX: 400 }));
    expect(screen.getByRole("textbox", { name: "Início do loop" })).toHaveValue("3:40");
    expect(screen.getByRole("textbox", { name: "Fim do loop" })).toHaveValue("4:00");
    fireEvent(range, new MouseEvent("pointerup", { bubbles: true }));
  });

  it("permite ajustar as alças e mover o trecho usando apenas o teclado", () => {
    setup();
    fireEvent.keyDown(screen.getByRole("slider", { name: "Arrastar início do loop" }), { key: "ArrowRight" });
    expect(screen.getByRole("textbox", { name: "Início do loop" })).toHaveValue("1:14");
    fireEvent.keyDown(screen.getByRole("button", { name: "Mover trecho inteiro" }), { key: "ArrowLeft", shiftKey: true });
    expect(screen.getByRole("textbox", { name: "Início do loop" })).toHaveValue("1:09");
    expect(screen.getByRole("textbox", { name: "Fim do loop" })).toHaveValue("1:28");
  });

  it("cria um trecho válido perto do fim e permite editar sem áudio", () => {
    const { props, rerender } = setup({ currentTime: 239 });
    expect(screen.getByRole("textbox", { name: "Início do loop" })).toHaveValue("3:40");
    expect(screen.getByRole("textbox", { name: "Fim do loop" })).toHaveValue("4:00");
    rerender(<LoopEditor {...props} duration={0} />);
    expect(screen.getByRole("button", { name: "Reproduzir música" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Criar loop" })).toBeEnabled();
  });

  it("preserva repetições personalizadas e impede envio duplo durante salvamento", () => {
    const { props, rerender } = setup({ initialValue: { label: "Solo", start_time: 10, end_time: 20, repeat_count: 5 } });
    expect(screen.getByRole("spinbutton", { name: "Quantidade de repetições" })).toHaveValue(5);
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(props.onSave).toHaveBeenCalledWith({ label: "Solo", start_time: 10, end_time: 20, repeat_count: 5 });
    rerender(<LoopEditor {...props} isSaving />);
    expect(screen.getByRole("button", { name: "Salvando…" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("button", { name: "Salvando…" }).closest("form")!);
    expect(props.onSave).toHaveBeenCalledOnce();
  });
});
