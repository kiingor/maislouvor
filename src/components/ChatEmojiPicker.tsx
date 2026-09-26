import { useState } from "react";
import { Smile } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Props {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
}

const CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: "Sorrisos",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "🙂", "🙃",
      "😉", "😊", "😇", "🥰", "😍", "😘", "😗", "😋", "😛", "🤪",
      "🤩", "🥳", "😎", "🤓", "😏", "😌", "😴", "🤗", "🤔", "🤨",
    ],
  },
  {
    label: "Emoções",
    emojis: [
      "😢", "😭", "😤", "😠", "😡", "🥺", "😩", "😫", "😳", "😱",
      "😬", "🙄", "😶", "😐", "😔", "😪", "🤒", "🤕", "🥶", "🥵",
    ],
  },
  {
    label: "Gestos",
    emojis: [
      "👍", "👎", "👌", "🙏", "👏", "🙌", "🤝", "💪", "✌️", "🤞",
      "👋", "🤙", "👊", "✊", "☝️", "👇", "👉", "👈", "🫶", "🤲",
    ],
  },
  {
    label: "Louvor",
    emojis: [
      "🎵", "🎶", "🎸", "🎹", "🥁", "🎤", "🎼", "🎷", "🎺", "🎻",
      "✝️", "🙏", "🔥", "❤️", "🧡", "💛", "💚", "💙", "💜", "✨",
      "⭐", "🌟", "💫", "🕊️", "📖", "🎉", "🎊", "👑", "🌈", "☀️",
    ],
  },
];

export function ChatEmojiPicker({ onSelect, disabled }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          // Mantém o teclado aberto enquanto o seletor abre.
          onMouseDown={(e) => e.preventDefault()}
          aria-label="Inserir emoji"
          title="Inserir emoji"
          className="relative z-[4] before:absolute before:-inset-1 before:rounded-full before:content-[''] grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground active:bg-fill-tertiary disabled:pointer-events-none disabled:opacity-40 data-[state=open]:text-foreground"
        >
          <Smile className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={12}
        className="w-[min(308px,calc(100vw-32px))] max-h-80 overflow-y-auto overscroll-contain p-3 space-y-3"
      >
        {CATEGORIES.map((cat) => (
          <section key={cat.label} aria-label={cat.label}>
            <p className="relative z-[4] text-footnote font-semibold text-muted-foreground mb-1 px-1">{cat.label}</p>
            <div className="relative z-[4] grid grid-cols-7">
              {cat.emojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onSelect(emoji);
                    setOpen(false);
                  }}
                  className="grid h-10 w-full place-items-center rounded-[10px] text-[24px] leading-none transition-colors hover:bg-fill-tertiary active:bg-fill-secondary"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </section>
        ))}
      </PopoverContent>
    </Popover>
  );
}
