import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PrivacyPolicy from "./PrivacyPolicy";
import TermsOfUse from "./TermsOfUse";
import Support from "./Support";

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderAt(entries: string[]) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Routes>
        <Route path="/privacidade" element={<PrivacyPolicy />} />
        <Route path="/termos" element={<TermsOfUse />} />
        <Route path="/suporte" element={<Support />} />
        <Route path="/app/settings" element={<p>Ajustes</p>} />
        <Route path="/" element={<p>Início</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("public legal pages", () => {
  it.each([
    ["/privacidade", "Política de Privacidade", "versão 2026-10-03"],
    ["/termos", "Termos de Uso", "versão 2026-10-03"],
    ["/suporte", "Suporte", null],
  ])("%s shows the title, the last update and a table of contents", (path, title, version) => {
    renderAt([path]);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    const updated = screen.getByText(/Última atualização:/);
    expect(updated).toHaveTextContent("Última atualização: 3 de outubro de 2026");
    if (version) expect(updated).toHaveTextContent(version);
    const toc = screen.getByRole("navigation", { name: "Nesta página" });
    const entries = within(toc).getAllByRole("link");
    expect(entries.length).toBeGreaterThan(3);
    // Cada item do sumário aponta para uma seção que existe.
    for (const entry of entries) {
      const id = entry.getAttribute("href")!.slice(1);
      expect(document.getElementById(id)).not.toBeNull();
    }
    expect(document.title).toBe(`${title} · +Louvor`);
  });

  it("jumps to a section from the table of contents without leaving the page", () => {
    renderAt(["/privacidade"]);
    const toc = screen.getByRole("navigation", { name: "Nesta página" });
    fireEvent.click(within(toc).getByRole("link", { name: /Exclusão da conta/ }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 2, name: /Exclusão da conta/ })).toHaveFocus();
  });

  it("goes back to the previous screen", () => {
    renderAt(["/app/settings", "/termos"]);
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByText("Ajustes")).toBeInTheDocument();
  });

  it("goes to the start when opened directly", () => {
    renderAt(["/suporte"]);
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByText("Início")).toBeInTheDocument();
  });

  it("links the other documents and the account deletion page", () => {
    renderAt(["/suporte"]);
    const footer = screen.getByRole("navigation", { name: "Documentos" });
    expect(within(footer).getByRole("link", { name: "Excluir conta" })).toHaveAttribute("href", "/excluir-conta");
    expect(within(footer).getByRole("link", { name: "Suporte" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Esqueci minha senha. E agora?")).toBeInTheDocument();
  });
});
