import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import DeleteAccountInfo from "./DeleteAccountInfo";
import { isLegalPlaceholder, MY_SETTINGS_IN_APP, PRIVACY_EMAIL } from "@/lib/legal";

describe("public account deletion page", () => {
  it("explains the in-app path, what is erased or kept, and the e-mail fallback", () => {
    render(<MemoryRouter initialEntries={["/excluir-conta"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><DeleteAccountInfo /></MemoryRouter>);

    expect(screen.getByRole("heading", { level: 1, name: "Excluir sua conta" })).toBeInTheDocument();
    expect(screen.getByText(MY_SETTINGS_IN_APP)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Entrar e excluir minha conta" }))
      .toHaveAttribute("href", "/login?redirect=%2Fapp%2Fsettings%23excluir-conta");
    expect(screen.getByRole("heading", { name: "O que é apagado" }).parentElement)
      .toHaveTextContent("Rascunhos de músicas que você começou e não cadastrou");
    expect(screen.getByRole("heading", { name: "O que continua com a equipe" }).parentElement)
      .toHaveTextContent("sem o seu nome");
    expect(screen.getByRole("heading", { name: "Prazo" }).parentElement).toHaveTextContent("A exclusão é imediata.");
    // O e-mail vem de src/lib/legal.ts: pendente, aparece destacado e sem link.
    if (isLegalPlaceholder(PRIVACY_EMAIL)) {
      expect(screen.getByText(PRIVACY_EMAIL).tagName).toBe("MARK");
      expect(screen.queryByRole("link", { name: PRIVACY_EMAIL })).toBeNull();
    } else {
      const mail = screen.getByRole("link", { name: PRIVACY_EMAIL });
      expect(mail.getAttribute("href")).toMatch(new RegExp(`^mailto:${PRIVACY_EMAIL}\\?subject=`));
    }
    expect(screen.getByRole("heading", { name: "O que continua com a equipe" }).parentElement)
      .toHaveTextContent("Denúncias do chat que envolvem você continuam com a moderação");
    expect(screen.getByRole("note")).toHaveTextContent("Cancele compras da App Store ou Google Play na respectiva loja");
    // Mesma moldura das páginas legais: "Voltar" (o iOS não tem voltar do sistema) e os documentos no rodapé.
    expect(screen.getByRole("button", { name: "Voltar" })).toBeInTheDocument();
    const docs = screen.getByRole("navigation", { name: "Documentos" });
    expect(within(docs).getByRole("link", { name: "Privacidade" })).toHaveAttribute("href", "/privacidade");
    expect(within(docs).getByRole("link", { name: "Termos de Uso" })).toHaveAttribute("href", "/termos");
    expect(within(docs).getByRole("link", { name: "Suporte" })).toHaveAttribute("href", "/suporte");
    expect(within(docs).getByRole("link", { name: "Excluir conta" })).toHaveAttribute("aria-current", "page");
  });
});
