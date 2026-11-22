import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DateField } from "./DateField";
import { formatIsoDateBR } from "@/lib/isoDate";

describe("DateField", () => {
  it("mostra a data com o dia primeiro, sem depender do idioma do aparelho (M-02)", () => {
    render(<><label htmlFor="d">Data</label><DateField id="d" value="2026-11-01" onChange={() => {}} /></>);
    expect(screen.getByText("01/11/2026")).toBeInTheDocument();
    expect(screen.getByLabelText("Data")).toHaveValue("2026-11-01");
  });

  it("mostra o texto de escolha quando vazio e devolve o valor ISO ao mudar", () => {
    const onChange = vi.fn();
    render(<DateField aria-label="Data" value="" onChange={onChange} />);
    expect(screen.getByText("Escolher")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-12-25" } });
    expect(onChange).toHaveBeenCalledWith("2026-12-25");
  });

  it("formata sem passar por Date (sem erro de fuso)", () => {
    expect(formatIsoDateBR("2026-01-01")).toBe("01/01/2026");
    expect(formatIsoDateBR("")).toBe("");
  });
});
