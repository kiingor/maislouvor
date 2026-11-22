import { describe, expect, it } from "vitest";
import { AUTH_ERROR_FALLBACK, authErrorMessage } from "./authErrors";

describe("authErrorMessage", () => {
  it("traduz a senha errada pelo código do Supabase", () => {
    expect(authErrorMessage({ code: "invalid_credentials", message: "Invalid login credentials", status: 400 }))
      .toBe("Email ou senha incorretos.");
  });

  it("traduz pela mensagem quando o código não vem", () => {
    expect(authErrorMessage({ message: "Invalid login credentials", status: 400 })).toBe("Email ou senha incorretos.");
    expect(authErrorMessage({ message: "Email not confirmed" })).toMatch(/^Confirme seu email/);
    expect(authErrorMessage({ message: "User already registered" })).toMatch(/^Já existe uma conta/);
  });

  it("explica falta de conexão e excesso de tentativas", () => {
    expect(authErrorMessage({ name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 }))
      .toMatch(/^Sem conexão/);
    expect(authErrorMessage({ message: "Request rate limit reached", status: 429 })).toMatch(/^Muitas tentativas/);
  });

  it("nunca devolve a mensagem em inglês de um erro desconhecido", () => {
    expect(authErrorMessage({ code: "unexpected_failure", message: "Database error saving new user", status: 500 }))
      .toBe(AUTH_ERROR_FALLBACK);
    expect(authErrorMessage(null)).toBe(AUTH_ERROR_FALLBACK);
  });
});
