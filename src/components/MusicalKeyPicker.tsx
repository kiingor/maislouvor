import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
} from "@/components/ui/command";
import { matchingMusicalKeys, MUSICAL_KEYS } from "@/lib/songCatalog";
import { cn } from "@/lib/utils";

interface Props {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  emptyLabel?: string;
  allowEmpty?: boolean;
  label?: string;
  invalid?: boolean;
  describedBy?: string;
  required?: boolean;
  className?: string;
}
export function MusicalKeyPicker({
  id,
  value,
  onChange,
  disabled,
  emptyLabel = "Selecione o tom",
  allowEmpty = false,
  label = "Tom",
  invalid,
  describedBy,
  required,
  className,
}: Props) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const choice = MUSICAL_KEYS.find((key) => key.value === value),
    matches = matchingMusicalKeys(query);
  const select = (key: string) => {
    onChange(key);
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-label={
            label +
            ": " +
            (choice ? choice.value + " · " + choice.label : value || emptyLabel)
          }
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          className={cn(
            "flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-[11px] border border-separator bg-background px-3 text-left text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60",
            invalid && "border-destructive",
            className
          )}
        >
          <span
            className={cn(
              "min-w-0 truncate",
              !value && "text-muted-foreground"
            )}
          >
            {choice ? choice.value + " · " + choice.label : value || emptyLabel}
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={7}
        collisionPadding={12}
        aria-label={"Escolher " + label.toLowerCase()}
        className="w-[max(280px,var(--radix-popover-trigger-width))] max-w-[calc(100vw-24px)] overflow-hidden rounded-[15px] border-separator bg-card p-2 shadow-lg"
      >
        <Command
          label="Buscar tom"
          shouldFilter={false}
          className="bg-card [&_[cmdk-input-wrapper]]:h-11"
        >
          <p className="px-2 pb-2 pt-1 text-xs font-semibold">
            Escolher {label.toLowerCase()}
          </p>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Buscar tom: G, Sol, menor…"
            aria-label="Buscar tom"
            className="h-11 text-base sm:text-sm"
          />
          <CommandList className="mt-1 max-h-[min(230px,calc(var(--radix-popover-content-available-height)-120px))] overscroll-contain">
            {allowEmpty &&
              (!query ||
                emptyLabel.toLowerCase().includes(query.toLowerCase())) && (
                <CommandItem
                  value="__original__"
                  onSelect={() => select("")}
                  className="min-h-11 rounded-[9px] px-3"
                >
                  <span className="flex-1">{emptyLabel}</span>
                  {!value && <Check className="h-4 w-4" />}
                </CommandItem>
              )}
            {matches.map((key) => (
              <CommandItem
                key={key.value}
                value={key.value}
                onSelect={() => select(key.value)}
                className="min-h-11 cursor-pointer gap-3 rounded-[9px] px-3"
              >
                <span className="w-9 shrink-0 font-semibold">{key.value}</span>
                <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                  {key.label}
                </span>
                {value === key.value && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </CommandItem>
            ))}
            {!matches.length && (
              <p className="px-3 py-4 text-xs text-muted-foreground">
                Nenhum tom encontrado. Tente a cifra ou o nome.
              </p>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
