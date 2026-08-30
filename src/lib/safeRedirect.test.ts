import { describe, expect, it } from "vitest";
import { safeInternalRedirect } from "./safeRedirect";

describe("safeInternalRedirect", () => {
  it("mantém rotas internas de convite", () => {
    expect(safeInternalRedirect("/invite/123?source=email")).toBe("/invite/123?source=email");
  });

  it.each([
    "https://evil.example",
    "//evil.example/path",
    "/\\evil.example/path",
    "javascript:alert(1)",
  ])("rejeita redirecionamento externo: %s", (value) => {
    expect(safeInternalRedirect(value)).toBe("/app/home");
  });
});
