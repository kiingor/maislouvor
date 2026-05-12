import { Mic, Music, Guitar, Piano, Drum } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const INSTRUMENTS = [
  "Ministrante",
  "Back 1",
  "Back 2",
  "Back 3",
  "Back 4",
  "Violão",
  "Guitarra",
  "Baixo",
  "Bateria",
  "Teclado",
  "Cajon",
  "Mesa de Som",
] as const;

export type Instrument = (typeof INSTRUMENTS)[number];

export const INSTRUMENT_ICONS: Record<string, LucideIcon> = {
  "Ministrante": Mic,
  "Back 1": Music,
  "Back 2": Music,
  "Back 3": Music,
  "Back 4": Music,
  "Violão": Guitar,
  "Guitarra": Guitar,
  "Baixo": Guitar,
  "Bateria": Drum,
  "Teclado": Piano,
  "Cajon": Drum,
  "Mesa de Som": Music,
};
