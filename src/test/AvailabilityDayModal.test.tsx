import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AvailabilityDayModal } from "@/components/AvailabilityDayModal";
import type { AvailabilityMode } from "@/lib/availability";

afterEach(cleanup);

function renderModal(availabilityMode: AvailabilityMode) {
  return render(
    <AvailabilityDayModal
      open
      onOpenChange={() => {}}
      date={new Date(2026, 6, 12)}
      teamMemberId="member-1"
      myInstruments={["Violão"]}
      availabilityMode={availabilityMode}
      existing={null}
      onSaved={() => {}}
    />,
  );
}

describe("AvailabilityDayModal workflow", () => {
  it("shows only the positive action in availability mode", () => {
    renderModal("available_only");

    expect(screen.getByText("Disponível")).toBeInTheDocument();
    expect(screen.queryByText("Indisponível")).not.toBeInTheDocument();
    expect(screen.getByText("Confirme este dia somente se você puder servir.")).toBeInTheDocument();
  });

  it("shows only the negative action in unavailability mode", () => {
    renderModal("unavailable_only");

    expect(screen.getByText("Indisponível")).toBeInTheDocument();
    expect(screen.queryByText("Disponível")).not.toBeInTheDocument();
    expect(screen.getByText("Registre este dia somente se você não puder servir.")).toBeInTheDocument();
  });

  it("shows both choices in the mixed mode", () => {
    renderModal("both");

    expect(screen.getByRole("radio", { name: "Disponível" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Indisponível" })).toBeInTheDocument();
  });
});
