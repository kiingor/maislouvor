import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import DeleteAccountInfo from "./DeleteAccountInfo";
import { DELETE_REQUEST_EMAIL } from "@/lib/accountDeletion";

describe("public account deletion page", () => {
  it("explains the in-app path, what is erased or kept, and the e-mail fallback", () => {
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><DeleteAccountInfo /></MemoryRouter>);

    expect(screen.getByRole("heading", { level: 1, name: "Excluir sua conta" })).toBeInTheDocument();
    expect(screen.getByText("Ajustes › Meu usuário")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Entrar e excluir minha conta" }))
      .toHaveAttribute("href", "/login?redirect=%2Fapp%2Fsettings%23excluir-conta");
    expect(screen.getByRole("heading", { name: "O que é apagado" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "O que continua com a equipe" }).parentElement)
      .toHaveTextContent("sem o seu nome");
    expect(screen.getByRole("heading", { name: "Prazo" }).parentElement).toHaveTextContent("A exclusão é imediata.");
    const mail = screen.getByRole("link", { name: DELETE_REQUEST_EMAIL });
    expect(mail.getAttribute("href")).toMatch(new RegExp(`^mailto:${DELETE_REQUEST_EMAIL}\\?subject=`));
    expect(screen.getByRole("note")).toHaveTextContent("precisam ser canceladas na loja");
    expect(screen.getByRole("link", { name: /Política de Privacidade/ })).toHaveAttribute("href", "/privacidade");
    expect(screen.getByRole("link", { name: /Termos de Uso/ })).toHaveAttribute("href", "/termos");
    expect(screen.getByRole("link", { name: /Suporte/ })).toHaveAttribute("href", "/suporte");
  });
});
