import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SignUp from "./SignUp";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { memoryStorage } from "@/test/memoryStorage";

const mocks = vi.hoisted(() => ({ signUp: vi.fn(), rpc: vi.fn(), toast: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signUp: mocks.signUp, signInWithOAuth: vi.fn() }, rpc: mocks.rpc },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
// O banner de instalação não interessa aqui (usa APIs do navegador).
vi.mock("@/components/InstallPWABanner", () => ({ InstallPWABanner: () => null }));

function renderSignUp() {
  return render(
    <MemoryRouter initialEntries={["/signup"]}>
      <Routes>
        <Route path="/signup" element={<SignUp />} />
        <Route path="/app/home" element={<p>Início do app</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillForm() {
  fireEvent.change(screen.getByLabelText("Nome completo"), { target: { value: "Ana Souza" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@example.test" } });
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "segredo123" } });
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SignUp terms acceptance", () => {
  it("does not create the account until the terms checkbox is checked", async () => {
    renderSignUp();
    fillForm();
    const checkbox = screen.getByRole("checkbox", { name: /Li e aceito os Termos de Uso e a Política de Privacidade/ });
    expect(checkbox).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.");
    expect(checkbox).toHaveAttribute("aria-invalid", "true");
    expect(checkbox).toHaveFocus();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("creates the account with the acceptance recorded once the box is checked", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: { user: { id: "u1" } } }, error: null });
    mocks.rpc.mockResolvedValue({ data: { terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION }, error: null });
    renderSignUp();
    fillForm();

    fireEvent.click(screen.getByRole("checkbox", { name: /Li e aceito/ }));
    expect(screen.getByRole("checkbox", { name: /Li e aceito/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    await screen.findByText("Início do app");
    expect(mocks.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "ana@example.test",
        options: expect.objectContaining({
          data: expect.objectContaining({
            full_name: "Ana Souza",
            legal_acceptance: expect.objectContaining({ terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION }),
          }),
        }),
      }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith("accept_terms", { p_terms_version: TERMS_VERSION, p_privacy_version: PRIVACY_VERSION });
    expect(localStorage.getItem("louvor-legal-pending-acceptance")).toBeNull();
  });

  it("still enters the app when recording the acceptance fails (the gate retries later)", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: { user: { id: "u1" } } }, error: null });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "offline" } });
    renderSignUp();
    fillForm();
    fireEvent.click(screen.getByRole("checkbox", { name: /Li e aceito/ }));
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    await screen.findByText("Início do app");
    expect(localStorage.getItem("louvor-legal-pending-acceptance")).not.toBeNull();
  });

  it("opens the documents over the form without losing what was typed", async () => {
    renderSignUp();
    fillForm();
    fireEvent.click(screen.getAllByRole("link", { name: "Termos de Uso" })[0]);

    expect(await screen.findByRole("dialog", { name: "Termos de Uso" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nome completo")).toHaveValue("Ana Souza");
  });

  it("tells Google sign-up users that continuing means accepting the terms", () => {
    renderSignUp();
    expect(screen.getByText(/Ao continuar com o Google, você concorda com os/)).toBeInTheDocument();
  });
});
