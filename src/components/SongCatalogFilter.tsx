import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { songRpc } from "@/lib/songCatalog";
import { useSongSearchDelay } from "@/hooks/useSongSearchDelay";

export function SongCatalogFilter({
  teamId,
  kind,
  label,
  value,
  onChange,
}: {
  teamId: string;
  kind: "artist" | "theme";
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const search = useSongSearchDelay(query);
  const options = useQuery({
    queryKey: ["song-catalog-facets", teamId, kind, search],
    enabled: open,
    queryFn: () =>
      songRpc<{ value: string }[]>("song_catalog_facets", {
        p_team_id: teamId,
        p_kind: kind,
        p_query: search,
      }),
  });
  const select = (next: string) => {
    onChange(next);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-11 w-full min-w-0 items-center gap-2 rounded-[11px] border border-separator bg-card px-3 text-left text-xs"
          aria-label={label + ": " + (value || "Todos")}
        >
          <span className="shrink-0 text-muted-foreground">{label}</span>
          <span className="min-w-0 flex-1 truncate">{value || "Todos"}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[max(280px,var(--radix-popover-trigger-width))] max-w-[calc(100vw-24px)] rounded-[15px] bg-card p-1"
        align="start"
        collisionPadding={12}
      >
        <Command
          label={"Buscar " + label.toLowerCase()}
          shouldFilter={false}
          className="bg-card [&_[cmdk-input-wrapper]]:h-11"
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            aria-label={"Buscar " + label.toLowerCase()}
            placeholder={"Buscar " + label.toLowerCase() + "…"}
          />
          <CommandList className="max-h-60">
            <CommandItem
              onSelect={() => select("")}
              value="__all__"
              className="min-h-11"
            >
              Todos
            </CommandItem>
            {options.isPending ? (
              <p className="p-3 text-xs" role="status">
                Carregando…
              </p>
            ) : options.isError ? (
              <p className="p-3 text-xs text-destructive">
                Não foi possível carregar. Feche e tente novamente.
              </p>
            ) : (
              (options.data || []).map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => select(option.value)}
                  className="min-h-11"
                >
                  <span className="flex-1 truncate">{option.value}</span>
                  {value === option.value && <Check className="h-4 w-4" />}
                </CommandItem>
              ))
            )}
            {options.data?.length === 0 && (
              <p className="p-3 text-xs text-muted-foreground">
                Nenhum resultado.
              </p>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
