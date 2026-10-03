import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MusicalKeyPicker } from "./MusicalKeyPicker";
import { isSongComplete, matchingMusicalKeys } from "@/lib/songCatalog";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);
const Picker = () => {
  const [value, setValue] = useState("");
  return (
    <MusicalKeyPicker value={value} onChange={setValue} label="Tom original" />
  );
};
describe("searchable musical key", () => {
  it("ranks exact chords and Portuguese names before accidentals", () => {
    expect(matchingMusicalKeys("Sol")[0].value).toBe("G");
    expect(matchingMusicalKeys("G#")[0].value).toBe("G#");
    expect(matchingMusicalKeys("ré bemol menor")[0].value).toBe("Dbm");
    expect(matchingMusicalKeys("F♯")[0].value).toBe("F#");
    expect(matchingMusicalKeys("none")).toHaveLength(0);
  });
  it("supports text search, Enter selection and trigger focus return", async () => {
    render(<Picker />);
    fireEvent.click(screen.getByRole("button", { name: /Tom original/ }));
    const search = screen.getByRole("combobox", { name: "Buscar tom" });
    fireEvent.change(search, { target: { value: "Sol" } });
    await waitFor(() =>
      expect(screen.getAllByRole("option")[0]).toHaveTextContent("G")
    );
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Tom original: G · Sol maior" })
      ).toHaveFocus()
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
  it("displays empty search results and closes with Escape", async () => {
    render(<Picker />);
    fireEvent.click(screen.getByRole("button", { name: /Tom original/ }));
    const search = screen.getByRole("combobox", { name: "Buscar tom" });
    fireEvent.change(search, { target: { value: "unknown" } });
    expect(screen.getByText(/Nenhum tom encontrado/)).toBeInTheDocument();
    fireEvent.keyDown(search, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
    );
  });
});
describe("catalog completeness", () => {
  const complete = {
    title: "Canção",
    artist: "Artista",
    key_original: "G",
    theme: "Adoração",
    audio_path: "team/song.mp3",
    cifra_text: "G D",
  };
  it("excludes drafts and each missing or whitespace required field", () => {
    expect(isSongComplete(complete)).toBe(true);
    expect(isSongComplete({ ...complete, is_draft: true })).toBe(false);
    for (const field of Object.keys(complete))
      expect(isSongComplete({ ...complete, [field]: " \n\t" })).toBe(false);
    expect(
      isSongComplete({ ...complete, key_original: "", key_current: "C" })
    ).toBe(true);
  });
});
