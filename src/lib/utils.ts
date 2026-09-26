import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Ensina ao tailwind-merge os tokens do redesign iOS 27 (tailwind.config.ts):
// sem isto, "text-footnote text-muted-foreground" perde o tamanho (é lido como cor)
// e "rounded-card rounded-xl" não resolve o conflito.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["large-title", "title1", "title2", "title3", "headline", "body", "callout", "subhead", "footnote", "caption1", "caption2"] },
      ],
      rounded: [{ rounded: ["card", "sheet"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
