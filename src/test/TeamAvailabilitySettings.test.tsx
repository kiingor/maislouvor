import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TeamAvailabilitySettings } from "@/components/TeamAvailabilitySettings";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  eq: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ update: mocks.update }),
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TeamAvailabilitySettings", () => {
  it("saves the mode selected by the team admin", async () => {
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockResolvedValue({ error: null });
    const onSaved = vi.fn().mockResolvedValue(undefined);

    render(
      <TeamAvailabilitySettings
        teamId="team-1"
        value="both"
        onSaved={onSaved}
      />,
    );

    const saveButton = screen.getByRole("button", { name: "Salvar preferência" });
    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByRole("radio", { name: /Indisponibilidade/ }));
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mocks.update).toHaveBeenCalledWith({ availability_mode: "unavailable_only" });
      expect(mocks.eq).toHaveBeenCalledWith("id", "team-1");
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
  });
});
