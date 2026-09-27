import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { LoopEditor } from "./LoopEditor";
import { LoopNote } from "./LoopNote";
import { formatLoopTime as formatTime, normalizeLoopNotes, type LoopDraft, type LoopRange } from "@/lib/loopTime";
import type { LoopPoint } from "@/hooks/useLoopSequence";
import {
  Plus,
  Trash2,
  Repeat,
  X,
  Users,
  ChevronLeft,
  ChevronRight,
  Infinity as InfinityIcon,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";

function errorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    // Servidor ainda sem a coluna (migração 20260927120000 não aplicada): o PostgREST recusa o campo.
    if (/'notes' column/.test(error.message)) {
      return "As observações ainda não estão disponíveis no servidor. Limpe a observação para salvar o loop.";
    }
    return error.message;
  }
  return "Não foi possível salvar o loop";
}

// `notes` só vai no pedido quando há algo a gravar ou apagar: sem observação, criar e editar
// loops funciona igual mesmo num servidor que ainda não tem a coluna.
type LoopWrite = Omit<LoopDraft, "notes"> & { notes?: string | null };

interface LoopPanelProps {
  songId: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isPreviewing: boolean;
  onSeek: (time: number) => void;
  onTogglePlayback: () => void;
  onPreview: (range: LoopRange | null) => void;
  selectedLoops: LoopPoint[];
  activeLoopId: string | null;
  currentRepetition: number;
  playbackRate: number;
  onSelectLoop: (loop: LoopPoint | null) => void;
  onRemoveLoop: (id: string) => void;
  onPlaybackRateChange: (rate: number) => void;
  isDark: boolean;
  onClose: () => void;
  /** Renderizado na folha mobile. Mantido por compatibilidade: a folha iOS também mostra o ✕ (spec). */
  inDrawer?: boolean;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5];

export function LoopPanel({
  songId,
  currentTime,
  duration,
  isPlaying,
  isPreviewing,
  onSeek,
  onTogglePlayback,
  onPreview,
  selectedLoops,
  activeLoopId,
  currentRepetition,
  playbackRate,
  onSelectLoop,
  onRemoveLoop,
  onPlaybackRateChange,
  isDark,
  onClose,
}: LoopPanelProps) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("my");
  const [showForm, setShowForm] = useState(false);
  const [editingLoop, setEditingLoop] = useState<LoopPoint | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  useEffect(() => {
    setTab("my");
    setShowForm(false);
    setEditingLoop(null);
    setSelectedProfileId(null);
  }, [songId]);

  // Superfícies iOS: células brancas sobre o painel no claro, #2C2C2E no escuro (também na folha).
  const group = "rounded-card bg-card dark:bg-grouped-tertiary";
  // Linhas de loop têm o círculo de ordem (22px) à esquerda: o fio começa no texto (16 + 22 + 12).
  const rowSeparator = "before:absolute before:left-[50px] before:right-0 before:top-0 before:border-t before:border-separator";
  const iconButton =
    "relative grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors hover:bg-fill-tertiary active:bg-fill-tertiary before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2";

  // Fetch own loops
  const { data: myLoops = [] } = useQuery({
    queryKey: ["my-loops", songId],
    queryFn: async () => {
      const { data: profile } = await supabase.rpc("get_my_profile_id");
      if (!profile) return [];
      const { data, error } = await supabase
        .from("song_loop_points")
        .select("*")
        .eq("song_id", songId)
        .eq("profile_id", profile)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch public loops from team members
  const { data: publicLoops = [] } = useQuery({
    queryKey: ["public-loops", songId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("song_loop_points")
        .select("*")
        .eq("song_id", songId)
        .eq("is_public", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch profiles that have public loops
  const publicProfileIds = [...new Set(publicLoops.map((l) => l.profile_id))];
  const { data: publicProfiles = [] } = useQuery({
    queryKey: ["loop-profiles", publicProfileIds.join(",")],
    queryFn: async () => {
      if (!publicProfileIds.length) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", publicProfileIds);
      return data ?? [];
    },
    enabled: publicProfileIds.length > 0,
  });

  // Create loop
  const createLoop = useMutation({
    mutationFn: async (loop: LoopWrite) => {
      const { data: profileId } = await supabase.rpc("get_my_profile_id");
      if (!profileId) throw new Error("Não autenticado");
      const { error } = await supabase.from("song_loop_points").insert({
        song_id: songId,
        profile_id: profileId,
        label: loop.label,
        start_time: loop.start_time,
        end_time: loop.end_time,
        repeat_count: loop.repeat_count,
        sort_order: myLoops.length,
        ...(loop.notes !== undefined ? { notes: loop.notes } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-loops", songId] });
      queryClient.invalidateQueries({ queryKey: ["all-my-loops"] });
      resetForm();
      toast.success("Loop criado!");
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  // Update loop
  const updateLoop = useMutation({
    mutationFn: async (loop: LoopWrite & { id: string }) => {
      const { error } = await supabase
        .from("song_loop_points")
        .update({
          label: loop.label,
          start_time: loop.start_time,
          end_time: loop.end_time,
          repeat_count: loop.repeat_count,
          ...(loop.notes !== undefined ? { notes: loop.notes } : {}),
        })
        .eq("id", loop.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-loops", songId] });
      queryClient.invalidateQueries({ queryKey: ["all-my-loops"] });
      queryClient.invalidateQueries({ queryKey: ["public-loops", songId] });
      resetForm();
      toast.success("Loop atualizado!");
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  // Delete loop
  const deleteLoop = useMutation({
    mutationFn: async (loopId: string) => {
      const { error } = await supabase.from("song_loop_points").delete().eq("id", loopId);
      if (error) throw error;
    },
    onSuccess: (_, loopId) => {
      onRemoveLoop(loopId);
      queryClient.invalidateQueries({ queryKey: ["my-loops", songId] });
      queryClient.invalidateQueries({ queryKey: ["all-my-loops"] });
      queryClient.invalidateQueries({ queryKey: ["public-loops", songId] });
      toast.success("Loop removido");
    },
  });

  // Toggle public
  const togglePublic = useMutation({
    mutationFn: async ({ loopId, isPublic }: { loopId: string; isPublic: boolean }) => {
      const { error } = await supabase
        .from("song_loop_points")
        .update({ is_public: isPublic })
        .eq("id", loopId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-loops", songId] });
      queryClient.invalidateQueries({ queryKey: ["public-loops", songId] });
    },
  });

  const resetForm = () => {
    onPreview(null);
    setShowForm(false);
    setEditingLoop(null);
  };

  const startEditing = (loop: LoopPoint) => {
    onPreview(null);
    onSelectLoop(null);
    setEditingLoop(loop);
    setShowForm(true);
  };

  const startCreating = () => {
    onPreview(null);
    onSelectLoop(null);
    setEditingLoop(null);
    setShowForm(true);
  };

  const handleSubmit = ({ notes, ...draft }: LoopDraft) => {
    if (editingLoop) {
      const changed = notes !== normalizeLoopNotes(editingLoop.notes);
      updateLoop.mutate({ id: editingLoop.id, ...draft, ...(changed ? { notes } : {}) });
    } else {
      createLoop.mutate({ ...draft, ...(notes ? { notes } : {}) });
    }
  };

  const profileLoops = selectedProfileId
    ? publicLoops.filter((l) => l.profile_id === selectedProfileId)
    : [];

  const loopSelection = (loop: LoopPoint) => {
    const order = selectedLoops.findIndex((selected) => selected.id === loop.id);
    const isActive = activeLoopId === loop.id;
    const infinite = loop.repeat_count === 0 && selectedLoops.length <= 1;
    return (
      <button
        type="button"
        aria-label={`Selecionar ${loop.label}`}
        aria-pressed={order >= 0}
        onClick={(event) => {
          event.stopPropagation();
          onSelectLoop(loop);
        }}
        className="flex w-full min-w-0 flex-1 items-start gap-3 rounded-[12px] py-0.5 text-left"
      >
        <span
          aria-hidden={order < 0 ? true : undefined}
          aria-label={order >= 0 ? `${order + 1}º na sequência` : undefined}
          className={`mt-px grid h-[22px] min-w-[22px] shrink-0 place-items-center rounded-full px-1 text-caption1 font-semibold tabular-nums transition-colors ${
            order >= 0 ? "bg-prominent text-prominent-foreground" : "border-[1.5px] border-label-tertiary"
          }`}
        >
          {order >= 0 ? order + 1 : ""}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block break-words text-body ${order >= 0 ? "font-semibold" : ""}`}>{loop.label}</span>
          <span className="mt-0.5 block font-mono text-footnote tabular-nums text-muted-foreground">
            {formatTime(loop.start_time)} → {formatTime(loop.end_time)}
          </span>
          {isActive ? (
            <span className="mt-0.5 flex items-center gap-1 text-caption1 font-semibold text-primary">
              {isPlaying ? "Tocando" : "Atual"} · {infinite ? currentRepetition : Math.min(currentRepetition, Math.max(1, loop.repeat_count))}
              {infinite ? <InfinityIcon className="h-3.5 w-3.5" aria-hidden="true" /> : `/${Math.max(1, loop.repeat_count)}`}
            </span>
          ) : loop.repeat_count > 0 && (
            <span className="mt-0.5 block text-caption1 text-muted-foreground">Repetir {loop.repeat_count}x</span>
          )}
        </span>
      </button>
    );
  };

  const content = (
    <div
      onKeyDown={(event) => event.stopPropagation()}
      // Altura ≤ 500 (celular deitado): o painel inteiro rola como uma coisa só — velocidade, sequência,
      // abas e loops ficam alcançáveis em vez de cortados por blocos fixos.
      className="flex h-full min-h-0 flex-col overflow-hidden text-foreground [@media(max-height:500px)]:overflow-y-auto [@media(max-height:500px)]:overscroll-contain"
    >
      {/* Barra do painel: Fechar (vidro) à esquerda, título centralizado */}
      <div className="grid shrink-0 grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 px-3 pb-2 pt-3 [@media(max-height:500px)]:pb-1 [@media(max-height:500px)]:pt-1.5">
        <button
          type="button"
          onClick={() => { onPreview(null); onClose(); }}
          className="liquid-glass grid h-11 w-11 place-items-center rounded-full text-foreground transition-transform duration-200 active:scale-95 motion-reduce:transition-none"
          aria-label="Fechar modo ensaio"
          title="Fechar"
        >
          <X className="relative z-[4] h-[18px] w-[18px]" strokeWidth={2.4} aria-hidden="true" />
        </button>
        <h2 className="flex items-center justify-center gap-1.5 truncate text-headline">
          <Repeat className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2.25} aria-hidden="true" />
          Loop
        </h2>
        <span aria-hidden="true" className="h-11 w-11" />
      </div>

      {/* Speed control — controle segmentado */}
      <div className="shrink-0 px-4 pb-3">
        <p className="mx-4 mb-1.5 text-footnote text-muted-foreground">Velocidade</p>
        <div role="group" aria-label="Velocidade" className="flex h-9 items-center gap-0.5 rounded-full bg-fill-tertiary p-0.5">
          {SPEED_OPTIONS.map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => onPlaybackRateChange(speed)}
              aria-current={playbackRate === speed ? "true" : undefined}
              className={`relative h-8 min-w-0 flex-1 rounded-full text-subhead font-medium tabular-nums text-foreground transition-colors duration-200 before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2 motion-reduce:transition-none ${
                playbackRate === speed ? "bg-card shadow-sm dark:bg-prominent" : ""
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>

      {!showForm && (
        // pt-2: o "Limpar seleção" (44pt, -my-3) não alcança a área de toque dos botões de velocidade.
        <div className="shrink-0 px-4 pb-3 pt-2">
          <div className="mx-4 mb-1.5 flex min-h-5 items-center justify-between gap-2">
            <span className="text-footnote text-muted-foreground">Sequência{selectedLoops.length > 0 ? ` (${selectedLoops.length})` : ""}</span>
            {selectedLoops.length > 0 && (
              <button
                type="button"
                onClick={() => onSelectLoop(null)}
                className="relative -my-3 -mr-1.5 min-h-11 rounded-[10px] px-1.5 text-subhead font-medium text-primary active:opacity-60"
              >
                Limpar seleção
              </button>
            )}
          </div>
          {selectedLoops.length > 0 && (
            <ol aria-label="Ordem dos loops" className="-my-1.5 flex gap-1.5 overflow-x-auto pt-1.5 pb-2.5 hide-scrollbar" data-vaul-no-drag>
              {selectedLoops.map((loop, index) => (
                <li key={loop.id} className="shrink-0">
                  <button
                    type="button"
                    aria-label={`Remover ${loop.label} da sequência`}
                    aria-current={activeLoopId === loop.id ? "step" : undefined}
                    onClick={() => onRemoveLoop(loop.id)}
                    className={`relative flex h-8 max-w-48 items-center gap-1.5 rounded-full pl-3 pr-2.5 text-footnote font-medium transition-colors before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2 ${
                      activeLoopId === loop.id ? "bg-prominent text-prominent-foreground" : "bg-fill-tertiary text-foreground"
                    }`}
                  >
                    <span className="tabular-nums opacity-70">{index + 1}</span>
                    <span className="truncate">{loop.label}</span>
                    <X className="h-3.5 w-3.5 shrink-0 opacity-70" strokeWidth={2.5} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ol>
          )}
          <p className="mx-4 mt-1.5 text-footnote text-muted-foreground">
            {selectedLoops.length > 1
              ? "A sequência se repete. Loops infinitos tocam uma vez por rodada."
              : "Selecione os loops na ordem em que deseja ouvir."}
          </p>
        </div>
      )}

      {/* Tabs — controle segmentado */}
      <Tabs value={tab} onValueChange={(value) => { onPreview(null); setTab(value); }} className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden [@media(max-height:500px)]:h-auto [@media(max-height:500px)]:flex-none [@media(max-height:500px)]:overflow-visible">
        {!showForm && <TabsList className="mx-4 mt-1 flex shrink-0">
          <TabsTrigger value="my" className="flex-1">
            Meus loops{myLoops.length > 0 ? ` (${myLoops.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="profiles" className="flex-1 gap-1.5">
            <Users className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" /> Perfis
          </TabsTrigger>
        </TabsList>}

        {/* My Loops */}
        <TabsContent
          value="my"
          className="h-0 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col [@media(max-height:500px)]:h-auto [@media(max-height:500px)]:flex-none [@media(max-height:500px)]:overflow-visible"
        >
          {showForm ? (
            <LoopEditor
              key={editingLoop?.id ?? "new"}
              initialValue={editingLoop ?? undefined}
              currentTime={currentTime}
              duration={duration}
              isPlaying={isPlaying}
              isPreviewing={isPreviewing}
              isDark={isDark}
              isSaving={createLoop.isPending || updateLoop.isPending}
              onSeek={onSeek}
              onTogglePlayback={onTogglePlayback}
              onPreview={onPreview}
              onSave={handleSubmit}
              onCancel={resetForm}
            />
          ) : (
            <>
              <div className="shrink-0 px-4 pb-1">
                <button
                  type="button"
                  onClick={startCreating}
                  className={`${group} flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors active:bg-fill-tertiary`}
                >
                  <span className="flex items-center gap-3 text-body font-medium">
                    <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-prominent text-prominent-foreground">
                      <Plus className="h-[18px] w-[18px]" strokeWidth={2.5} aria-hidden="true" />
                    </span>
                    Criar novo loop
                  </span>
                  <span className="shrink-0 font-mono text-footnote tabular-nums text-muted-foreground">
                    em {formatTime(currentTime)}
                  </span>
                </button>
              </div>

              <div
                role="list"
                aria-label="Loops salvos"
                tabIndex={0}
                style={{ WebkitOverflowScrolling: "touch", scrollbarGutter: "stable" }}
                className="h-0 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3 touch-pan-y [@media(max-height:500px)]:h-auto [@media(max-height:500px)]:flex-none [@media(max-height:500px)]:overflow-visible"
                data-vaul-no-drag
              >
                {myLoops.length === 0 && (
                  <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                    <Repeat className="h-7 w-7 text-label-tertiary" strokeWidth={2} aria-hidden="true" />
                    <p className="text-body text-muted-foreground">
                      Nenhum loop criado. Marque um trecho para repeti-lo durante o ensaio.
                    </p>
                  </div>
                )}

                {myLoops.map((loop, index) => {
                  const isSelected = selectedLoops.some((selected) => selected.id === loop.id);
                  return (
                    <div
                      key={loop.id}
                      role="listitem"
                      onClick={() => onSelectLoop(loop)}
                      className={`relative cursor-pointer bg-card px-4 py-2.5 transition-colors dark:bg-grouped-tertiary ${
                        isSelected ? "" : "hover:bg-fill-quaternary"
                      } ${index === 0 ? "rounded-t-card" : rowSeparator} ${index === myLoops.length - 1 ? "rounded-b-card" : ""}`}
                    >
                      <div className="flex items-start gap-1">
                        {loopSelection(loop)}
                        {/* gap-2: as áreas de 44pt de Editar e Remover se encontram sem se sobrepor. */}
                        <div className="-mr-1.5 flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditing(loop);
                            }}
                            className={`${iconButton} text-foreground`}
                            aria-label={`Editar ${loop.label}`}
                          >
                            <Pencil className="h-[17px] w-[17px]" strokeWidth={2.25} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteLoop.mutate(loop.id);
                            }}
                            className={`${iconButton} text-ios-red`}
                            aria-label={`Remover ${loop.label}`}
                          >
                            <Trash2 className="h-[17px] w-[17px]" strokeWidth={2.25} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                      {/* Largura toda (passa sob Editar/Remover): no painel de 360pt o texto não fica espremido. */}
                      <LoopNote notes={loop.notes} loopLabel={loop.label} />
                      <div className="mt-1 flex items-center justify-end">
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <span className="text-footnote text-muted-foreground">
                            {loop.is_public ? "Público" : "Privado"}
                          </span>
                          <Switch
                            checked={loop.is_public}
                            onCheckedChange={(checked) =>
                              togglePublic.mutate({ loopId: loop.id, isPublic: checked })
                            }
                            aria-label={`${loop.is_public ? "Tornar privado" : "Tornar público"}: ${loop.label}`}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </TabsContent>

        {/* Profiles */}
        <TabsContent
          value="profiles"
          className="h-0 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 touch-pan-y [@media(max-height:500px)]:h-auto [@media(max-height:500px)]:flex-none [@media(max-height:500px)]:overflow-visible"
          style={{ WebkitOverflowScrolling: "touch", scrollbarGutter: "stable" }}
          data-vaul-no-drag
        >
          {selectedProfileId ? (
            <div>
              <button
                onClick={() => setSelectedProfileId(null)}
                className="-ml-1.5 mb-1 flex min-h-11 items-center gap-0.5 rounded-[10px] px-1.5 text-subhead font-medium text-primary active:opacity-60"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" /> Voltar
              </button>
              {profileLoops.length > 0 && (
                <div className={`${group} overflow-hidden`}>
                  {profileLoops.map((loop, index) => (
                    <div
                      key={loop.id}
                      onClick={() => onSelectLoop(loop)}
                      className={`relative cursor-pointer px-4 py-2.5 transition-colors hover:bg-fill-quaternary ${index > 0 ? rowSeparator : ""}`}
                    >
                      {loopSelection(loop)}
                      <LoopNote notes={loop.notes} loopLabel={loop.label} />
                    </div>
                  ))}
                </div>
              )}
              {profileLoops.length === 0 && (
                <p className="py-4 text-center text-body text-muted-foreground">Nenhum loop público</p>
              )}
            </div>
          ) : (
            <div>
              {publicProfiles.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <Users className="h-7 w-7 text-label-tertiary" strokeWidth={2} aria-hidden="true" />
                  <p className="text-body text-muted-foreground">
                    Nenhum membro tem loops públicos nesta música
                  </p>
                </div>
              ) : (
                <div className={`${group} overflow-hidden`}>
                  {publicProfiles.map((profile, index) => {
                    const loopCount = publicLoops.filter((l) => l.profile_id === profile.id).length;
                    return (
                      <button
                        key={profile.id}
                        onClick={() => setSelectedProfileId(profile.id)}
                        className={`relative flex min-h-[60px] w-full items-center gap-3 px-4 py-2 text-left transition-colors active:bg-fill-tertiary ${
                          index > 0 ? "before:absolute before:left-[68px] before:right-0 before:top-0 before:border-t before:border-separator" : ""
                        }`}
                      >
                        <Avatar className="h-10 w-10">
                          {profile.avatar_url ? (
                            <AvatarImage src={profile.avatar_url} />
                          ) : null}
                          <AvatarFallback className="text-subhead">
                            {(profile.full_name || "?")[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body">{profile.full_name || "Membro"}</span>
                          <span className="block text-footnote text-muted-foreground">
                            {loopCount} loop{loopCount !== 1 ? "s" : ""}
                          </span>
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-label-tertiary" strokeWidth={3} aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );

  return content;
}
