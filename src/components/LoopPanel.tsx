import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import type { Database } from "@/integrations/supabase/types";
import {
  Plus,
  Trash2,
  Repeat,
  X,
  Target,
  Flag,
  Users,
  ChevronLeft,
  Infinity as InfinityIcon,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function parseTimeInput(val: string): number | null {
  const match = val.match(/^(\d+):(\d{1,2})$/);
  if (match) return parseInt(match[1]) * 60 + parseInt(match[2]);
  const num = parseFloat(val);
  return isFinite(num) && num >= 0 ? num : null;
}

function autoFormatTime(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `0:${digits.padStart(2, "0")}`;
  const secs = digits.slice(-2);
  const mins = digits.slice(0, -2);
  return `${parseInt(mins)}:${secs}`;
}

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

type LoopPoint = Database["public"]["Tables"]["song_loop_points"]["Row"];

interface LoopPanelProps {
  songId: string;
  currentTime: number;
  activeLoopId: string | null;
  currentRepetition: number;
  playbackRate: number;
  onSelectLoop: (loop: LoopPoint | null) => void;
  onPlaybackRateChange: (rate: number) => void;
  isDark: boolean;
  onClose: () => void;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5];

export function LoopPanel({
  songId,
  currentTime,
  activeLoopId,
  currentRepetition,
  playbackRate,
  onSelectLoop,
  onPlaybackRateChange,
  isDark,
  onClose,
}: LoopPanelProps) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("my");
  const [showForm, setShowForm] = useState(false);
  const [editingLoopId, setEditingLoopId] = useState<string | null>(null);
  const [formLabel, setFormLabel] = useState("Loop");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [formRepeat, setFormRepeat] = useState(0);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  useEffect(() => {
    setTab("my");
    setShowForm(false);
    setEditingLoopId(null);
    setFormLabel("Loop");
    setFormStart("");
    setFormEnd("");
    setFormRepeat(0);
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
      const { data } = await supabase
        .from("song_loop_points")
        .select("*")
        .eq("song_id", songId)
        .eq("profile_id", profile)
        .order("sort_order");
      return data ?? [];
    },
  });

  // Fetch public loops from team members
  const { data: publicLoops = [] } = useQuery({
    queryKey: ["public-loops", songId],
    queryFn: async () => {
      const { data } = await supabase
        .from("song_loop_points")
        .select("*")
        .eq("song_id", songId)
        .eq("is_public", true)
        .order("sort_order");
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-loops", songId] });
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
    setShowForm(false);
    setEditingLoopId(null);
    setFormLabel("Loop");
    setFormStart("");
    setFormEnd("");
    setFormRepeat(0);
  };

  const startEditing = (loop: LoopPoint) => {
    setEditingLoopId(loop.id);
    setFormLabel(loop.label);
    setFormStart(formatTime(loop.start_time));
    setFormEnd(formatTime(loop.end_time));
    setFormRepeat(loop.repeat_count);
    setShowForm(true);
  };

  const startCreating = () => {
    setEditingLoopId(null);
    setFormLabel("Loop");
    setFormStart(formatTime(currentTime));
    setFormEnd("");
    setFormRepeat(0);
    setShowForm(true);
  };

  const handleSubmit = () => {
    const start = parseTimeInput(formStart);
    const end = parseTimeInput(formEnd);
    if (start === null || end === null) {
      toast.error("Formato inválido. Use m:ss");
      return;
    }
    if (start >= end) {
      toast.error("O início deve ser antes do fim");
      return;
    }
    if (editingLoopId) {
      updateLoop.mutate({
        id: editingLoopId,
        label: formLabel || "Loop",
        start_time: start,
        end_time: end,
        repeat_count: formRepeat,
      });
    } else {
      createLoop.mutate({
        label: formLabel || "Loop",
        start_time: start,
        end_time: end,
        repeat_count: formRepeat,
      });
    }
  };

  const profileLoops = selectedProfileId
    ? publicLoops.filter((l) => l.profile_id === selectedProfileId)
    : [];

  const content = (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden ${isDark ? "text-white" : "text-black"}`}>
      {/* Header */}
      <div className={`flex shrink-0 items-center justify-between border-b px-4 py-3 ${borderSubtle}`}>
        <div className="flex items-center gap-2">
          <Repeat className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Modo Ensaio</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`rounded-lg p-1.5 ${hoverBg}`}
          aria-label="Fechar modo ensaio"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Speed control */}
      <div className={`flex shrink-0 items-center gap-1.5 border-b px-4 py-2.5 ${borderSubtle}`}>
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

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className={`mx-4 mt-2 shrink-0 ${isDark ? "bg-white/10" : "bg-black/10"}`}>
          <TabsTrigger value="my" className="flex-1 text-xs">
            Meus loops{myLoops.length > 0 ? ` (${myLoops.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="profiles" className="flex-1 text-xs gap-1">
            <Users className="h-3 w-3" /> Perfis
          </TabsTrigger>
        </TabsList>

        {/* My Loops */}
        <TabsContent
          value="my"
          className="min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"
        >
          {showForm ? (
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                handleSubmit();
              }}
            >
              <div
                className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-3 touch-pan-y"
                data-vaul-no-drag
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {editingLoopId ? "Editar loop" : "Novo loop"}
                    </p>
                    <p className={`mt-0.5 text-[11px] leading-relaxed ${subtleText}`}>
                      Use a posição da música para marcar o início e o fim do trecho.
                    </p>
                  </div>
                  <div className={`shrink-0 rounded-lg px-2 py-1 text-right ${accentBg}`}>
                    <span className={`block text-[9px] uppercase tracking-wide ${subtleText}`}>Agora</span>
                    <span className="font-mono text-xs tabular-nums">{formatTime(currentTime)}</span>
                  </div>
                </div>

                <label className="block space-y-1.5">
                  <span className={`text-[10px] font-medium uppercase tracking-wide ${subtleText}`}>Nome</span>
                  <input
                    value={formLabel}
                    onChange={(e) => setFormLabel(e.target.value)}
                    placeholder="Ex.: Refrão"
                    className={`w-full rounded-lg border bg-transparent px-3 py-2 text-sm ${borderSubtle} focus:border-primary focus:outline-none`}
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <div className="min-w-0">
                    <label className="block space-y-1.5">
                      <span className={`text-[10px] font-medium uppercase tracking-wide ${subtleText}`}>Início</span>
                      <input
                        value={formStart}
                        onChange={(e) => setFormStart(autoFormatTime(e.target.value))}
                        placeholder="0:00"
                        inputMode="numeric"
                        aria-label="Início do loop"
                        className={`w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-sm ${borderSubtle} focus:border-primary focus:outline-none`}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setFormStart(formatTime(currentTime))}
                      className={`mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-medium ${accentBg} ${hoverBg}`}
                      aria-label={`Usar ${formatTime(currentTime)} como início`}
                    >
                      <Target className="h-3.5 w-3.5 text-primary" />
                      Marcar agora
                    </button>
                  </div>
                  <div className="min-w-0">
                    <label className="block space-y-1.5">
                      <span className={`text-[10px] font-medium uppercase tracking-wide ${subtleText}`}>Fim</span>
                      <input
                        value={formEnd}
                        onChange={(e) => setFormEnd(autoFormatTime(e.target.value))}
                        placeholder="0:30"
                        inputMode="numeric"
                        aria-label="Fim do loop"
                        className={`w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-sm ${borderSubtle} focus:border-primary focus:outline-none`}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setFormEnd(formatTime(currentTime))}
                      className={`mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-medium ${accentBg} ${hoverBg}`}
                      aria-label={`Usar ${formatTime(currentTime)} como fim`}
                    >
                      <Flag className="h-3.5 w-3.5 text-primary" />
                      Marcar agora
                    </button>
                  </div>
                </div>

                <label className="block space-y-1.5">
                  <span className={`text-[10px] font-medium uppercase tracking-wide ${subtleText}`}>Repetições</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      value={formRepeat}
                      onChange={(e) => setFormRepeat(Math.max(0, parseInt(e.target.value) || 0))}
                      aria-label="Quantidade de repetições"
                      className={`w-20 rounded-lg border bg-transparent px-3 py-2 font-mono text-sm ${borderSubtle} focus:border-primary focus:outline-none`}
                    />
                    <span className={`text-[11px] ${subtleText}`}>
                      {formRepeat === 0 ? (
                        <span className="flex items-center gap-1">
                          <InfinityIcon className="h-3.5 w-3.5" /> Repete sem parar
                        </span>
                      ) : (
                        `${formRepeat} vez${formRepeat === 1 ? "" : "es"}`
                      )}
                    </span>
                  </div>
                </label>
              </div>

              <div className={`flex shrink-0 gap-2 border-t px-4 py-3 ${borderSubtle}`}>
                <Button
                  type="submit"
                  size="sm"
                  className="flex-1 rounded-xl text-xs"
                  disabled={createLoop.isPending || updateLoop.isPending}
                >
                  {editingLoopId ? "Salvar alterações" : "Criar loop"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="rounded-xl text-xs"
                  onClick={resetForm}
                >
                  Cancelar
                </Button>
              </div>
            </form>
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
                className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-3 touch-pan-y"
                data-vaul-no-drag
              >
                {myLoops.length === 0 && (
                  <p className={`px-4 py-8 text-center text-xs leading-relaxed ${subtleText}`}>
                    Nenhum loop criado. Marque um trecho para repeti-lo durante o ensaio.
                  </p>
                )}

                {myLoops.map((loop) => {
                  const isActive = activeLoopId === loop.id;
                  return (
                    <div
                      key={loop.id}
                      role="listitem"
                      onClick={() => onSelectLoop(isActive ? null : loop)}
                      className={`cursor-pointer rounded-xl border p-3 transition-all ${
                        isActive
                          ? "border-primary bg-primary/10"
                          : `border-transparent ${cardBg} ${hoverBg}`
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm font-medium">{loop.label}</span>
                        <div className="flex items-center gap-2">
                          {isActive && loop.repeat_count > 0 && (
                            <span className="font-mono text-[10px] text-primary">
                              {currentRepetition}/{loop.repeat_count}
                            </span>
                          )}
                          {isActive && loop.repeat_count === 0 && (
                            <span className="flex items-center gap-0.5 font-mono text-[10px] text-primary">
                              {currentRepetition}<InfinityIcon className="h-3 w-3" />
                            </span>
                          )}
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
                              if (isActive) onSelectLoop(null);
                              deleteLoop.mutate(loop.id);
                            }}
                            className={`rounded-lg p-1 ${hoverBg}`}
                            aria-label={`Remover ${loop.label}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`font-mono text-xs ${subtleText}`}>
                          {formatTime(loop.start_time)} → {formatTime(loop.end_time)}
                        </span>
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
                      {loop.repeat_count > 0 && (
                        <span className={`mt-1 block text-[10px] ${subtleText}`}>
                          Repetir {loop.repeat_count}x
                        </span>
                      )}
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
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 touch-pan-y"
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
                  onClick={() => onSelectLoop(activeLoopId === loop.id ? null : loop)}
                  className={`rounded-xl p-3 border transition-all cursor-pointer ${
                    activeLoopId === loop.id
                      ? "border-primary bg-primary/10"
                      : `border-transparent ${cardBg}`
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{loop.label}</span>
                    {activeLoopId === loop.id && loop.repeat_count > 0 && (
                      <span className="text-[10px] font-mono text-primary">
                        {currentRepetition}/{loop.repeat_count}
                      </span>
                    )}
                  </div>
                  <span className={`text-xs font-mono ${subtleText}`}>
                    {formatTime(loop.start_time)} → {formatTime(loop.end_time)}
                  </span>
                  {loop.repeat_count > 0 && (
                    <span className={`text-[10px] ${subtleText} mt-1 block`}>
                      Repetir {loop.repeat_count}x
                    </span>
                  )}
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
