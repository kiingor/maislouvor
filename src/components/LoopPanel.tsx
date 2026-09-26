import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { LoopEditor } from "./LoopEditor";
import { formatLoopTime as formatTime, type LoopDraft, type LoopRange } from "@/lib/loopTime";
import type { LoopPoint } from "@/hooks/useLoopSequence";
import {
  Plus,
  Trash2,
  Repeat,
  X,
  Users,
  ChevronLeft,
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
    return error.message;
  }
  return "Não foi possível salvar o loop";
}

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
  /** No drawer mobile: esconde o botão fechar (fecha arrastando). */
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
  inDrawer = false,
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

  const subtleText = isDark ? "text-white/50" : "text-black/50";
  const accentBg = isDark ? "bg-white/10" : "bg-black/10";
  const hoverBg = isDark ? "hover:bg-white/10" : "hover:bg-black/10";
  const borderSubtle = isDark ? "border-white/10" : "border-black/10";
  const cardBg = isDark ? "bg-white/5" : "bg-black/5";

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
    mutationFn: async (loop: { label: string; start_time: number; end_time: number; repeat_count: number }) => {
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
    mutationFn: async (loop: { id: string; label: string; start_time: number; end_time: number; repeat_count: number }) => {
      const { error } = await supabase
        .from("song_loop_points")
        .update({
          label: loop.label,
          start_time: loop.start_time,
          end_time: loop.end_time,
          repeat_count: loop.repeat_count,
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

  const handleSubmit = (draft: LoopDraft) => {
    if (editingLoop) updateLoop.mutate({ id: editingLoop.id, ...draft });
    else createLoop.mutate(draft);
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
        className="min-w-0 flex-1 rounded-lg p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="flex items-center gap-2">
          {order >= 0 && (
            <span aria-label={`${order + 1}º na sequência`} className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {order + 1}
            </span>
          )}
          <span className="min-w-0 break-words text-sm font-medium">{loop.label}</span>
        </span>
        <span className={`mt-1 block font-mono text-xs ${subtleText}`}>
          {formatTime(loop.start_time)} → {formatTime(loop.end_time)}
        </span>
        {isActive ? (
          <span className="mt-1 flex items-center gap-1 text-[10px] text-primary">
            {isPlaying ? "Tocando" : "Atual"} · {infinite ? currentRepetition : Math.min(currentRepetition, Math.max(1, loop.repeat_count))}
            {infinite ? <InfinityIcon className="h-3 w-3" /> : `/${Math.max(1, loop.repeat_count)}`}
          </span>
        ) : loop.repeat_count > 0 && (
          <span className={`mt-1 block text-[10px] ${subtleText}`}>Repetir {loop.repeat_count}x</span>
        )}
      </button>
    );
  };

  const content = (
    <div onKeyDown={(event) => event.stopPropagation()} className={`flex h-full min-h-0 flex-col overflow-hidden ${isDark ? "text-white" : "text-black"}`}>
      {/* Header */}
      <div className={`flex shrink-0 items-center justify-between border-b px-4 py-3 ${borderSubtle}`}>
        <div className="flex items-center gap-2">
          <Repeat className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Loop</span>
        </div>
        {!inDrawer && (
          <button
            type="button"
            onClick={() => { onPreview(null); onClose(); }}
            className={`rounded-lg p-1.5 ${hoverBg}`}
            aria-label="Fechar modo ensaio"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Speed control */}
      <div className={`flex shrink-0 flex-wrap items-center gap-1.5 border-b px-4 py-2.5 ${borderSubtle}`}>
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${subtleText} mr-1`}>Velocidade</span>
        {SPEED_OPTIONS.map((speed) => (
          <button
            key={speed}
            onClick={() => onPlaybackRateChange(speed)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              playbackRate === speed
                ? "bg-primary text-primary-foreground"
                : `${accentBg} ${subtleText} ${hoverBg}`
            }`}
          >
            {speed}x
          </button>
        ))}
      </div>

      {!showForm && (
        <div className={`shrink-0 border-b px-4 py-2.5 ${borderSubtle}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">Sequência{selectedLoops.length > 0 ? ` (${selectedLoops.length})` : ""}</span>
            {selectedLoops.length > 0 && (
              <button type="button" onClick={() => onSelectLoop(null)} className={`rounded-lg px-2 py-1 text-xs ${subtleText} ${hoverBg}`}>
                Limpar seleção
              </button>
            )}
          </div>
          <p className={`mt-1 text-[10px] leading-relaxed ${subtleText}`}>
            {selectedLoops.length > 1
              ? "A sequência se repete. Loops infinitos tocam uma vez por rodada."
              : "Selecione os loops na ordem em que deseja ouvir."}
          </p>
          {selectedLoops.length > 0 && (
            <ol aria-label="Ordem dos loops" className="mt-2 flex gap-1.5 overflow-x-auto pb-1" data-vaul-no-drag>
              {selectedLoops.map((loop, index) => (
                <li key={loop.id} className="shrink-0">
                  <button
                    type="button"
                    aria-label={`Remover ${loop.label} da sequência`}
                    aria-current={activeLoopId === loop.id ? "step" : undefined}
                    onClick={() => onRemoveLoop(loop.id)}
                    className={`flex max-w-48 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs ${activeLoopId === loop.id ? "bg-primary text-primary-foreground" : `${accentBg} ${hoverBg}`}`}
                  >
                    <span className="font-mono">{index + 1}.</span>
                    <span className="truncate">{loop.label}</span>
                    <X className="h-3 w-3 shrink-0" />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(value) => { onPreview(null); setTab(value); }} className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden">
        {!showForm && <TabsList className={`mx-4 mt-2 shrink-0 ${isDark ? "bg-white/10" : "bg-black/10"}`}>
          <TabsTrigger value="my" className="flex-1 text-xs">
            Meus loops{myLoops.length > 0 ? ` (${myLoops.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="profiles" className="flex-1 text-xs gap-1">
            <Users className="h-3 w-3" /> Perfis
          </TabsTrigger>
        </TabsList>}

        {/* My Loops */}
        <TabsContent
          value="my"
          className="h-0 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"
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
              <div className={`shrink-0 border-b px-4 py-3 ${borderSubtle}`}>
                <button
                  type="button"
                  onClick={startCreating}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border border-dashed px-3 py-2.5 text-left transition-colors ${borderSubtle} ${hoverBg}`}
                >
                  <span className="flex items-center gap-2 text-xs font-semibold">
                    <span className={`grid h-7 w-7 place-items-center rounded-lg ${accentBg}`}>
                      <Plus className="h-4 w-4 text-primary" />
                    </span>
                    Criar novo loop
                  </span>
                  <span className={`shrink-0 font-mono text-[10px] tabular-nums ${subtleText}`}>
                    em {formatTime(currentTime)}
                  </span>
                </button>
              </div>

              <div
                role="list"
                aria-label="Loops salvos"
                tabIndex={0}
                style={{ WebkitOverflowScrolling: "touch", scrollbarGutter: "stable" }}
                className="h-0 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-3 touch-pan-y"
                data-vaul-no-drag
              >
                {myLoops.length === 0 && (
                  <p className={`px-4 py-8 text-center text-xs leading-relaxed ${subtleText}`}>
                    Nenhum loop criado. Marque um trecho para repeti-lo durante o ensaio.
                  </p>
                )}

                {myLoops.map((loop) => {
                  const isSelected = selectedLoops.some((selected) => selected.id === loop.id);
                  return (
                    <div
                      key={loop.id}
                      role="listitem"
                      onClick={() => onSelectLoop(loop)}
                      className={`cursor-pointer rounded-xl border p-3 transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10"
                          : `border-transparent ${cardBg} ${hoverBg}`
                      }`}
                    >
                      <div className="mb-1 flex items-start justify-between gap-2">
                        {loopSelection(loop)}
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditing(loop);
                            }}
                            className={`rounded-lg p-1 ${hoverBg}`}
                            aria-label={`Editar ${loop.label}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteLoop.mutate(loop.id);
                            }}
                            className={`rounded-lg p-1 ${hoverBg}`}
                            aria-label={`Remover ${loop.label}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-end">
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <span className={`text-[10px] ${subtleText}`}>
                            {loop.is_public ? "Público" : "Privado"}
                          </span>
                          <Switch
                            checked={loop.is_public}
                            onCheckedChange={(checked) =>
                              togglePublic.mutate({ loopId: loop.id, isPublic: checked })
                            }
                            className="scale-75"
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
          className="h-0 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 touch-pan-y"
          style={{ WebkitOverflowScrolling: "touch", scrollbarGutter: "stable" }}
          data-vaul-no-drag
        >
          {selectedProfileId ? (
            <div className="space-y-2">
              <button
                onClick={() => setSelectedProfileId(null)}
                className={`flex items-center gap-1.5 text-xs font-medium ${subtleText} mb-2 ${hoverBg} px-2 py-1 rounded-lg`}
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Voltar
              </button>
              {profileLoops.map((loop) => (
                <div
                  key={loop.id}
                  onClick={() => onSelectLoop(loop)}
                  className={`flex cursor-pointer rounded-xl p-3 border transition-all ${
                    selectedLoops.some((selected) => selected.id === loop.id)
                      ? "border-primary bg-primary/10"
                      : `border-transparent ${cardBg} ${hoverBg}`
                  }`}
                >
                  {loopSelection(loop)}
                </div>
              ))}
              {profileLoops.length === 0 && (
                <p className={`text-xs ${subtleText} text-center py-4`}>Nenhum loop público</p>
              )}
            </div>
          ) : (
            <div className="space-y-2 mt-2">
              {publicProfiles.length === 0 ? (
                <p className={`text-xs ${subtleText} text-center py-8`}>
                  Nenhum membro tem loops públicos nesta música
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {publicProfiles.map((profile) => {
                    const loopCount = publicLoops.filter((l) => l.profile_id === profile.id).length;
                    return (
                      <button
                        key={profile.id}
                        onClick={() => setSelectedProfileId(profile.id)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl ${cardBg} ${hoverBg} transition-colors`}
                      >
                        <Avatar className="h-12 w-12">
                          {profile.avatar_url ? (
                            <AvatarImage src={profile.avatar_url} />
                          ) : null}
                          <AvatarFallback className="text-sm">
                            {(profile.full_name || "?")[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-[11px] font-medium truncate w-full text-center">
                          {profile.full_name || "Membro"}
                        </span>
                        <span className={`text-[10px] ${subtleText}`}>
                          {loopCount} loop{loopCount !== 1 ? "s" : ""}
                        </span>
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
