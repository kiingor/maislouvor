import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ native: true, platform: "android", setStyle: vi.fn(() => Promise.resolve()) }));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => mock.native, getPlatform: () => mock.platform },
  SystemBars: { setStyle: mock.setStyle },
  SystemBarsStyle: { Dark: "DARK", Light: "LIGHT", Default: "DEFAULT" },
}));

import { pageDrawsUnderSystemBars, paintTheme, setAppearance } from "./appearance";

const ua = (chrome: number) =>
  `Mozilla/5.0 (Linux; Android 17; Pixel 7 Pro Build/X; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/${chrome}.0.0.0 Mobile Safari/537.36`;

function useWebView(chrome: number) {
  Object.defineProperty(window.navigator, "userAgent", { value: ua(chrome), configurable: true });
}

describe("barra de status do app nativo segue a Aparência", () => {
  beforeEach(() => {
    mock.native = true;
    mock.platform = "android";
    mock.setStyle.mockClear();
    useWebView(146);
  });

  it("Escuro pede ícones claros, mesmo com o aparelho em claro (M-03)", () => {
    setAppearance("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(mock.setStyle).toHaveBeenLastCalledWith({ style: "DARK" });
  });

  it("Claro pede ícones escuros", () => {
    setAppearance("light");
    expect(mock.setStyle).toHaveBeenLastCalledWith({ style: "LIGHT" });
  });

  it("WebView antigo no Android: a faixa mostra o fundo do aparelho, então os ícones seguem o aparelho", () => {
    useWebView(133);
    setAppearance("dark");
    expect(mock.setStyle).toHaveBeenLastCalledWith({ style: "DEFAULT" });
  });

  it("no iPhone a página sempre fica atrás da barra", () => {
    mock.platform = "ios";
    setAppearance("dark");
    expect(mock.setStyle).toHaveBeenLastCalledWith({ style: "DARK" });
  });

  it("no navegador não chama a barra nativa", () => {
    mock.native = false;
    paintTheme(true);
    expect(mock.setStyle).not.toHaveBeenCalled();
  });
});

describe("pageDrawsUnderSystemBars", () => {
  it("usa o mesmo corte do Capacitor 8 (WebView 140)", () => {
    expect(pageDrawsUnderSystemBars("android", ua(139))).toBe(false);
    expect(pageDrawsUnderSystemBars("android", ua(140))).toBe(true);
    expect(pageDrawsUnderSystemBars("android", "sem versão")).toBe(false);
    expect(pageDrawsUnderSystemBars("ios", "qualquer")).toBe(true);
  });
});
