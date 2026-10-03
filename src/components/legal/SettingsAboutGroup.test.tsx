import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SettingsAboutGroup } from "./SettingsAboutGroup";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Usuário › Meu usuário, com ou sem a seção de exclusão da conta na mesma tela. */
function renderSettings({ withDeletionSection }: { withDeletionSection: boolean }) {
  return render(
    <MemoryRouter initialEntries={["/app/settings"]}>
      <Routes>
        <Route
          path="/app/settings"
          element={
            <>
              {withDeletionSection && (
                <section id="excluir-conta" aria-label="Excluir conta">
                  <button type="button">Excluir minha conta</button>
                </section>
              )}
              <SettingsAboutGroup />
            </>
          }
        />
        <Route path="/excluir-conta" element={<p>Página pública de exclusão</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SettingsAboutGroup", () => {
  it("links the documents and shows the web version", () => {
    renderSettings({ withDeletionSection: false });
    expect(screen.getByRole("link", { name: "Termos de Uso" })).toHaveAttribute("href", "/termos");
    expect(screen.getByRole("link", { name: "Política de Privacidade" })).toHaveAttribute("href", "/privacidade");
    expect(screen.getByRole("link", { name: "Suporte" })).toHaveAttribute("href", "/suporte");
    expect(screen.getByText("Web")).toBeInTheDocument();
  });

  it("goes to the in-app deletion section when it is on the same screen", () => {
    renderSettings({ withDeletionSection: true });
    fireEvent.click(screen.getByRole("link", { name: "Excluir conta" }));

    expect(screen.queryByText("Página pública de exclusão")).not.toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Excluir minha conta" })).toHaveFocus();
  });

  it("falls back to the public deletion page when the section is not there", () => {
    renderSettings({ withDeletionSection: false });
    const row = screen.getByRole("link", { name: "Excluir conta" });
    expect(row).toHaveAttribute("href", "/excluir-conta");
    fireEvent.click(row);
    expect(screen.getByText("Página pública de exclusão")).toBeInTheDocument();
  });
});
