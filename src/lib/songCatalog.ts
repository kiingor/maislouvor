import { supabase } from "@/integrations/supabase/client";

export interface CatalogSong {
  id: string;
  title: string;
  artist: string;
  key_current: string;
  theme: string;
  tags: string[];
  cover_path: string | null;
  already_added: boolean;
}
export interface CatalogPage {
  songs: CatalogSong[];
  total: number;
  page: number;
  page_size: number;
}
export interface SongCompleteness {
  title?: string | null;
  artist?: string | null;
  key_original?: string | null;
  key_current?: string | null;
  theme?: string | null;
  audio_path?: string | null;
  cifra_text?: string | null;
  is_draft?: boolean;
}
export function isSongComplete(song: SongCompleteness) {
  return (
    !song.is_draft &&
    [
      song.title,
      song.artist,
      song.key_current?.trim() || song.key_original,
      song.theme,
      song.audio_path,
      song.cifra_text,
    ].every((value) => Boolean(value?.trim()))
  );
}
// These additive RPCs are deployed with this feature; generated legacy types remain untouched.
export async function songRpc<T>(
  name: string,
  args: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw new Error(error.message);
  return data as unknown as T;
}
export function normalizeSongSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/♯/g, "#")
    .replace(/♭/g, "b");
}
const NOTES: Record<string, string> = {
  C: "Dó",
  "C#": "Dó sustenido",
  Db: "Ré bemol",
  D: "Ré",
  "D#": "Ré sustenido",
  Eb: "Mi bemol",
  E: "Mi",
  F: "Fá",
  "F#": "Fá sustenido",
  Gb: "Sol bemol",
  G: "Sol",
  "G#": "Sol sustenido",
  Ab: "Lá bemol",
  A: "Lá",
  "A#": "Lá sustenido",
  Bb: "Si bemol",
  B: "Si",
};
export const MUSICAL_KEYS = Object.entries(NOTES).flatMap(([key, name]) => [
  { value: key, label: name + " maior" },
  { value: key + "m", label: name + " menor" },
]);
export function matchingMusicalKeys(query: string) {
  const text = normalizeSongSearch(query);
  const matches = MUSICAL_KEYS.filter(
    (key) =>
      !text ||
      (/^[a-g](?:#|b)?m?$/.test(text)
        ? key.value.toLowerCase().startsWith(text)
        : text
            .split(/\s+/)
            .every((word) =>
              normalizeSongSearch(key.value + " " + key.label).includes(word)
            ))
  );
  if (text) {
    const rank = (key: (typeof MUSICAL_KEYS)[number]) =>
      normalizeSongSearch(key.value) === text ||
      normalizeSongSearch(key.label) === text
        ? 0
        : 1;
    matches.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        a.label.split(" ").length - b.label.split(" ").length
    );
  }
  return matches;
}
