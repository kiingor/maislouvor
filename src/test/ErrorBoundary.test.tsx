import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

afterEach(cleanup);

/** React sempre loga o erro capturado; silencia para não poluir a saída. */
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

function Explode({ error }: { error: Error }): JSX.Element {
  throw error;
}

describe("ErrorBoundary", () => {
  it("mostra os filhos quando não há erro", () => {
    render(
      <ErrorBoundary>
        <p>conteúdo normal</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("conteúdo normal")).toBeInTheDocument();
  });

  it("substitui a tela branca por uma mensagem legível quando o render quebra", () => {
    render(
      <ErrorBoundary>
        <Explode error={new TypeError("Cannot read properties of undefined (reading 'nome')")} />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Algo deu errado nesta tela")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recarregar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Limpar cache e recarregar" })).toBeInTheDocument();
  });

  it("reconhece falha de chunk (deploy novo) e usa a mensagem específica", () => {
    render(
      <ErrorBoundary>
        <Explode error={new TypeError("Failed to fetch dynamically imported module: /assets/Home-abc123.js")} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("O app foi atualizado")).toBeInTheDocument();
    expect(screen.queryByText("Algo deu errado nesta tela")).not.toBeInTheDocument();
  });

  it("expõe a mensagem original nos detalhes técnicos", () => {
    render(
      <ErrorBoundary scope="ensaio">
        <Explode error={new RangeError("Invalid time value")} />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Invalid time value/)).toBeInTheDocument();
  });
});
