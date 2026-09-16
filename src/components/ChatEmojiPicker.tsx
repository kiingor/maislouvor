import { useState } from "react";
import { Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
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
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={disabled}
          className="rounded-xl h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Smile className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="glass w-72 max-h-72 overflow-y-auto rounded-2xl border-0 p-3 space-y-3"
      >
        {CATEGORIES.map((cat) => (
          <div key={cat.label}>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              {cat.label}
            </p>
            <div className="grid grid-cols-8 gap-0.5">
              {cat.emojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onSelect(emoji);
                    setOpen(false);
                  }}
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-lg hover:bg-accent transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
