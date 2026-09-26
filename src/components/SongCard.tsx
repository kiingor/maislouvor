import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight, ListMusic, Music, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SongCardProps {
  song: {
    id: string;
    title: string;
    artist?: string | null;
    key_current?: string | null;
    cover_path?: string | null;
    tags?: string[] | null;
    theme?: string | null;
  };
  index: number;
  onClick?: () => void;
  repertorios?: string[];
  actions?: React.ReactNode;
  /**
   * Esconde o badge de tom padrão do card. Usado onde o tom é exibido de forma
   * mais explícita dentro de `actions` (ex.: roteiro do culto, que mostra
   * "Original" x "Tocar em" lado a lado).
   */
  hideKey?: boolean;
  /**
   * `card` (padrão): card opaco avulso (rounded-card).
   * `row`: linha de lista agrupada (inset grouped) — o pai fornece o contêiner (`SongList`).
   */
  variant?: "card" | "row";
  /** Mostra o chevron de navegação à direita, depois de `actions` (só em `row`, quando há `onClick`). Padrão: true. */
  chevron?: boolean;
  /** Elemento antes do índice (ex.: círculo de seleção no modo de edição). */
  leading?: React.ReactNode;
  /** Elemento depois do chevron, na borda direita (ex.: alça de reordenar, como no iOS). */
  trailing?: React.ReactNode;
  /** Modo de seleção: `true`/`false` marca a linha (aria-pressed + fundo); `undefined` = fora do modo. */
  selected?: boolean;
  className?: string;
}

/**
 * Linha de música (HIG > Lists and tables): capa 44pt, título em Body,
 * artista em Footnote secundário, tom como valor à direita.
 */
export function SongCard({
  song,
  index,
  onClick,
  repertorios,
  actions,
  hideKey,
  variant = "card",
  chevron = true,
  leading,
  trailing,
  selected,
  className,
}: SongCardProps) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!song.cover_path) return;
    supabase.storage.from("covers").createSignedUrl(song.cover_path, 3600).then(({ data }) => {
      if (data?.signedUrl) setCoverUrl(data.signedUrl);
    });
  }, [song.cover_path]);

  const isRow = variant === "row";
  const interactive = !!onClick;
  const hasChips = (song.tags && song.tags.length > 0) || !!song.theme || (repertorios && repertorios.length > 0);
  const showChevron = isRow && chevron && interactive;

  // Controles próprios (menu "…", alça de arrastar) não acionam a linha.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const mainContent = (
    <>
      {leading}
      <span className="w-5 shrink-0 text-center text-footnote tabular-nums text-muted-foreground">{index + 1}</span>
      <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-fill-tertiary">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Music className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={2} aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-body text-foreground [overflow-wrap:anywhere]">{song.title}</span>
        {song.artist && <span className="block truncate text-footnote text-muted-foreground">{song.artist}</span>}
      </span>
      {song.key_current && !hideKey && (
        <span className="shrink-0 text-subhead tabular-nums text-muted-foreground">
          <span className="sr-only">Tom </span>
          {song.key_current}
        </span>
      )}
    </>
  );
  const mainClass = "flex min-w-0 flex-1 items-center gap-3 text-left";

  return (
    // A linha inteira é clicável (o clique do botão principal sobe até aqui), mas só o
    // botão principal é interativo para teclado/leitor de tela: sem controle dentro de controle.
    <div
      onClick={onClick}
      className={cn(
        "relative flex flex-col transition-colors",
        isRow ? "min-h-[64px] justify-center py-2.5 pl-4 pr-3" : "rounded-card bg-card p-3 text-card-foreground hover-lift",
        interactive && "cursor-pointer",
        interactive && (isRow ? "active:bg-fill-tertiary" : "active:bg-grouped-tertiary"),
        interactive && "has-[[data-row-control]:active]:bg-transparent",
        selected && "bg-fill-quaternary",
        className,
      )}
    >
      {/* Separador hairline recuado até o texto (o SongList esconde o da primeira linha). */}
      {isRow && (
        <span
          aria-hidden="true"
          data-row-sep=""
          className={cn("pointer-events-none absolute top-0 right-0 border-t border-separator", leading ? "left-[138px]" : "left-[104px]")}
        />
      )}
      <div className="flex items-center gap-3">
        {interactive ? (
          <button
            type="button"
            aria-pressed={typeof selected === "boolean" ? selected : undefined}
            className={cn(mainClass, "rounded-[10px]")}
          >
            {mainContent}
          </button>
        ) : (
          <div className={mainClass}>{mainContent}</div>
        )}
        {/* Acessórios à direita, agrupados de perto para não roubar largura do título. */}
        {(actions || showChevron || trailing) && (
          <div className="flex shrink-0 items-center gap-1">
            {actions && (
              <div data-row-control="" className="-my-1 -mx-1.5 flex items-center" onClick={stop} onKeyDown={stop}>
                {actions}
              </div>
            )}
            {showChevron && (
              <ChevronRight className="mx-0.5 h-3.5 w-3.5 shrink-0 text-label-tertiary" strokeWidth={2.5} aria-hidden="true" />
            )}
            {trailing && (
              <div data-row-control="" className="-my-1 -mr-1.5 flex items-center" onClick={stop} onKeyDown={stop}>
                {trailing}
              </div>
            )}
          </div>
        )}
      </div>
      {/* Etiquetas em linha própria, alinhadas ao texto e usando a largura toda da célula. */}
      {hasChips && (
        <div className={cn("mt-1.5 flex flex-wrap gap-1", leading ? "pl-[122px]" : "pl-[88px]")}>
          {repertorios?.map((name, i) => (
            <span
              key={`rep-${i}`}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-fill-secondary px-2 py-0.5 text-caption1 font-medium text-foreground"
            >
              <ListMusic className="h-3 w-3 shrink-0 text-muted-foreground" strokeWidth={2.25} aria-hidden="true" />
              <span className="truncate">{name}</span>
            </span>
          ))}
          {song.theme && (
            <span className="max-w-full truncate rounded-full bg-fill-tertiary px-2 py-0.5 text-caption1 font-semibold text-foreground">
              {song.theme}
            </span>
          )}
          {song.tags?.map((tag, i) => (
            <span key={i} className="max-w-full truncate rounded-full bg-fill-tertiary px-2 py-0.5 text-caption1 font-medium text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface SongSearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  "aria-label"?: string;
}

/** Campo de busca iOS (HIG > Search fields): cápsula de preenchimento terciário, lupa e limpar. */
export function SongSearchField({ value, onChange, placeholder, autoFocus, className, "aria-label": ariaLabel }: SongSearchFieldProps) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-muted-foreground"
        strokeWidth={2.25}
        aria-hidden="true"
      />
      <input
        type="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        autoFocus={autoFocus}
        className="h-10 w-full rounded-full bg-fill-tertiary pl-9 pr-10 text-body text-foreground placeholder:text-muted-foreground outline-none focus-visible:outline-none [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpar busca"
          className="absolute right-0.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full after:absolute after:-inset-1 after:content-['']"
        >
          <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-label-tertiary text-card">
            <X className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
          </span>
        </button>
      )}
    </div>
  );
}

/**
 * Contêiner de lista agrupada (inset grouped) para linhas `SongCard variant="row"`.
 * Esconde o separador da primeira linha, mesmo quando cada linha está embrulhada
 * (ex.: wrapper arrastável).
 */
export function SongList({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("overflow-hidden rounded-card bg-card text-card-foreground [&>:first-child_[data-row-sep]]:hidden", className)}
      {...props}
    >
      {children}
    </div>
  );
}
