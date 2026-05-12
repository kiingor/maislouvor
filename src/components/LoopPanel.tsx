import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Plus,
  Trash2,
  Repeat,
  X,
  Target,
  Flag,
  Users,
  ChevronLeft,
  Infinity,
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

interface LoopPoint {
  id: string;
  song_id: string;
  profile_id: string;
  label: string;
  start_time: number;
  end_time: number;
  is_public: boolean;
  repeat_count: number;
  sort_order: number;
  created_at: string;
}

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
        .from("song_loop_points" as any)
        .select("*")
        .eq("song_id", songId)
        .eq("profile_id", profile)
        .order("sort_order");
      return (data ?? []) as unknown as LoopPoint[];
    },
  });

  // Fetch public loops from team members
  const { data: publicLoops = [] } = useQuery({
    queryKey: ["public-loops", songId],
    queryFn: async () => {
      const { data } = await supabase
        .from("song_loop_points" as any)
        .select("*")
        .eq("song_id", songId)
        .eq("is_public", true)
        .order("sort_order");
      return (data ?? []) as unknown as LoopPoint[];
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
      const { error } = await supabase.from("song_loop_points" as any).insert({
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
    onError: (e: any) => toast.error(e.message),
  });

  // Update loop
  const updateLoop = useMutation({
    mutationFn: async (loop: { id: string; label: string; start_time: number; end_time: number; repeat_count: number }) => {
      const { error } = await supabase
        .from("song_loop_points" as any)
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
    onError: (e: any) => toast.error(e.message),
  });

  // Delete loop
  const deleteLoop = useMutation({
    mutationFn: async (loopId: string) => {
      const { error } = await supabase.from("song_loop_points" as any).delete().eq("id", loopId);
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
        .from("song_loop_points" as any)
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
    <div className={`flex flex-col h-full ${isDark ? "text-white" : "text-black"}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${borderSubtle}`}>
        <div className="flex items-center gap-2">
          <Repeat className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Modo Ensaio</span>
        </div>
        <button onClick={onClose} className={`p-1.5 rounded-lg ${hoverBg}`}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Speed control */}
      <div className={`flex items-center gap-1.5 px-4 py-2.5 border-b ${borderSubtle}`}>
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
      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className={`mx-4 mt-2 ${isDark ? "bg-white/10" : "bg-black/10"}`}>
          <TabsTrigger value="my" className="flex-1 text-xs">Meus Loops</TabsTrigger>
          <TabsTrigger value="profiles" className="flex-1 text-xs gap-1">
            <Users className="h-3 w-3" /> Perfis
          </TabsTrigger>
        </TabsList>

        {/* My Loops */}
        <TabsContent value="my" className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
          {myLoops.map((loop) => {
            const isActive = activeLoopId === loop.id;
            return (
              <div
                key={loop.id}
                onClick={() => onSelectLoop(isActive ? null : loop)}
                className={`rounded-xl p-3 border transition-all cursor-pointer ${
                  isActive
                    ? "border-primary bg-primary/10"
                    : `border-transparent ${cardBg} ${hoverBg}`
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{loop.label}</span>
                  <div className="flex items-center gap-2">
                    {isActive && loop.repeat_count > 0 && (
                      <span className="text-[10px] font-mono text-primary">
                        {currentRepetition}/{loop.repeat_count}
                      </span>
                    )}
                    {isActive && loop.repeat_count === 0 && (
                      <span className="text-[10px] font-mono text-primary flex items-center gap-0.5">
                        {currentRepetition}<Infinity className="h-3 w-3" />
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditing(loop);
                      }}
                      className={`p-1 rounded-lg ${hoverBg}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isActive) onSelectLoop(null);
                        deleteLoop.mutate(loop.id);
                      }}
                      className={`p-1 rounded-lg ${hoverBg}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-mono ${subtleText}`}>
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
                    />
                  </div>
                </div>
                {loop.repeat_count > 0 && (
                  <span className={`text-[10px] ${subtleText} mt-1 block`}>
                    Repetir {loop.repeat_count}x
                  </span>
                )}
              </div>
            );
          })}

          {/* Add form */}
          {showForm ? (
            <div className={`rounded-xl border ${borderSubtle} p-3 space-y-3 ${cardBg}`}>
              <input
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder="Nome do loop"
                className={`w-full text-sm bg-transparent border-b ${borderSubtle} pb-1 focus:outline-none focus:border-primary`}
              />
              <div className="space-y-2">
                <div className="min-w-0">
                  <label className={`text-[10px] ${subtleText} block mb-1`}>Início</label>
                  <div className="flex gap-1 items-center">
                    <input
                      value={formStart}
                      onChange={(e) => setFormStart(autoFormatTime(e.target.value))}
                      placeholder="0:00"
                      inputMode="numeric"
                      className={`w-full text-sm font-mono bg-transparent border ${borderSubtle} rounded-lg px-2 py-1.5 focus:outline-none focus:border-primary`}
                    />
                    <button
                      onClick={() => setFormStart(formatTime(currentTime))}
                      className={`p-1.5 rounded-lg shrink-0 ${accentBg} ${hoverBg}`}
                      title="Marcar início"
                    >
                      <Target className="h-3.5 w-3.5 text-primary" />
                    </button>
                  </div>
                </div>
                <div className="min-w-0">
                  <label className={`text-[10px] ${subtleText} block mb-1`}>Fim</label>
                  <div className="flex gap-1 items-center">
                    <input
                      value={formEnd}
                      onChange={(e) => setFormEnd(autoFormatTime(e.target.value))}
                      placeholder="0:30"
                      inputMode="numeric"
                      className={`w-full text-sm font-mono bg-transparent border ${borderSubtle} rounded-lg px-2 py-1.5 focus:outline-none focus:border-primary`}
                    />
                    <button
                      onClick={() => setFormEnd(formatTime(currentTime))}
                      className={`p-1.5 rounded-lg shrink-0 ${accentBg} ${hoverBg}`}
                      title="Marcar fim"
                    >
                      <Flag className="h-3.5 w-3.5 text-primary" />
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <label className={`text-[10px] ${subtleText} block mb-1`}>
                  Repetições (0 = infinito)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={formRepeat}
                    onChange={(e) => setFormRepeat(parseInt(e.target.value) || 0)}
                    className={`w-20 text-sm font-mono bg-transparent border ${borderSubtle} rounded-lg px-2 py-1.5 focus:outline-none focus:border-primary`}
                  />
                  {formRepeat === 0 && (
                    <span className={`text-[10px] ${subtleText} flex items-center gap-0.5`}>
                      <Infinity className="h-3 w-3" /> Infinito
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 rounded-xl text-xs"
                  onClick={handleSubmit}
                  disabled={createLoop.isPending || updateLoop.isPending}
                >
                  {editingLoopId ? "Atualizar" : "Salvar"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-xl text-xs"
                  onClick={resetForm}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                setFormStart(formatTime(currentTime));
                setFormEnd(formatTime(currentTime));
                setShowForm(true);
              }}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed ${borderSubtle} ${hoverBg} transition-colors`}
            >
              <Plus className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium">Novo Loop</span>
            </button>
          )}
        </TabsContent>

        {/* Profiles */}
        <TabsContent value="profiles" className="flex-1 overflow-y-auto px-4 pb-4">
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
                  {publicProfiles.map((profile: any) => {
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
