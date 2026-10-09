import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Download from "./Download";

afterEach(() => vi.unstubAllGlobals());

describe("Android APK download", () => {
  it("links the new version and warns about incompatible signatures before downloading", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-length": "24867600" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MemoryRouter><Download /></MemoryRouter>);

    const link = screen.getByRole("link", { name: /Baixar APK/ });
    expect(link).toHaveAttribute("href", "/LouvorMais-1.0.6.apk");
    expect(link).toHaveAttribute("download", "LouvorMais-1.0.6.apk");
    expect(screen.getByText("Versão 1.0.6")).toBeInTheDocument();
    const warning = screen.getByRole("note");
    expect(warning).toHaveTextContent("Se você instalou a versão 1.0.1 ou mais nova deste site, atualize sem desinstalar.");
    expect(warning).toHaveTextContent("não instala por cima da versão 1.0");
    expect(warning).toHaveTextContent("A desinstalação pode apagar esses dados locais.");
    expect(warning.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/instalam por cima, sem perder nada/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("23.7 MB")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/LouvorMais-1.0.6.apk", { method: "HEAD", cache: "no-store" });
  });

  it("does not present an error document's size as the APK size", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      headers: new Headers({ "content-length": "1048576" }),
    }));
    render(<MemoryRouter><Download /></MemoryRouter>);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText("1.0 MB")).not.toBeInTheDocument();
  });
});
