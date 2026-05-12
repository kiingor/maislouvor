import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { GlassCard } from "@/components/GlassCard";
import { SongCard } from "@/components/SongCard";
import { AddSongModal } from "@/components/AddSongModal";
import { Button } from "@/components/ui/button";
import { GlassInput } from "@/components/GlassInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Music, Plus, Search, Trash2, X, Share2, Loader2 } from "lucide-react";

export default function RepertorioDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canEdit } = useTeam();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [addSongOpen, setAddSongOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterKey, setFilterKey] = useState<string>("");
  const [filterTheme, setFilterTheme] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<{ rsId: string; songTitle: string } | null>(null);
  const [sharing, setSharing] = useState(false);

  const { data: repertorio, isLoading } = useQuery({
    queryKey: ["repertorio", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("repertorios")
        .select("*, public_token, is_public")
        .eq("id", id!)
        .single();
      return data;
    },
    enabled: !!id,
  });

  const { data: songs = [] } = useQuery({
    queryKey: ["repertorio-songs", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("repertorio_songs")
        .select("*, songs(id, title, artist, key_current, cover_path, tags, theme)")
        .eq("repertorio_id", id!)
        .order("sort_order", { ascending: true });
      return data ?? [];
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="animate-in-up space-y-4">
        <div className="h-8 w-48 bg-accent rounded-lg animate-pulse" />
        <GlassCard className="h-32 animate-pulse" />
      </div>
    );
  }

  if (!repertorio) {
    return (
      <div className="animate-in-up text-center py-16">
        <p className="text-muted-foreground">Repertório não encontrado.</p>
        <Button variant="outline" className="mt-4 rounded-xl" onClick={() => navigate("/app/repertorios")}>
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-in-up">
      <div className="mb-8">
        <button
          onClick={() => navigate("/app/repertorios")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" /> Repertórios
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{repertorio.name}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Criado em {new Date(repertorio.created_at).toLocaleDateString("pt-BR")}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              className="rounded-xl h-9 w-9"
              disabled={sharing}
              onClick={async () => {
                if (!repertorio) return;
                setSharing(true);
                try {
                  let publicToken = (repertorio as any).public_token;
                  if (!(repertorio as any).is_public || !publicToken) {
                    publicToken = crypto.randomUUID();
                    const { error } = await supabase
                      .from("repertorios")
                      .update({ is_public: true, public_token: publicToken } as any)
                      .eq("id", repertorio.id);
                    if (error) throw error;
                    queryClient.invalidateQueries({ queryKey: ["repertorio", id] });
                  }
                  const url = `${window.location.origin}/playlist/${publicToken}`;
                  await navigator.clipboard.writeText(url);
                  toast({ title: "Link copiado!", description: "Compartilhe com quem quiser." });
                } catch {
                  toast({ title: "Erro ao compartilhar", variant: "destructive" });
                } finally {
                  setSharing(false);
                }
              }}
            >
              {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            </Button>
            {canEdit && (
              <>
                <Button onClick={() => setAddSongOpen(true)} size="icon" className="rounded-xl sm:hidden h-9 w-9">
                  <Plus className="h-4 w-4" />
                </Button>
                <Button onClick={() => setAddSongOpen(true)} className="rounded-xl gap-2 hidden sm:inline-flex">
                  <Plus className="h-4 w-4" /> Adicionar música
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      {songs.length > 0 && (
        <div className="mb-4 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <GlassInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar música ou artista..."
              className="pl-9"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <Select value={filterKey} onValueChange={(v) => setFilterKey(v === "all" ? "" : v)}>
            <SelectTrigger className="w-full sm:w-32 rounded-xl">
              <SelectValue placeholder="Tom" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tons</SelectItem>
              {[...new Set(songs.map((rs: any) => rs.songs?.key_current).filter(Boolean))].sort().map((k: string) => (
                <SelectItem key={k} value={k}>{k}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterTheme} onValueChange={(v) => setFilterTheme(v === "all" ? "" : v)}>
            <SelectTrigger className="w-full sm:w-36 rounded-xl">
              <SelectValue placeholder="Tema" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os temas</SelectItem>
              {[...new Set(songs.map((rs: any) => rs.songs?.theme).filter(Boolean))].sort().map((t: string) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {(() => {
        const filtered = songs.filter((rs: any) => {
          const s = rs.songs;
          if (!s) return true;
          const matchSearch = !search || 
            s.title?.toLowerCase().includes(search.toLowerCase()) ||
            s.artist?.toLowerCase().includes(search.toLowerCase());
          const matchKey = !filterKey || s.key_current === filterKey;
          const matchTheme = !filterTheme || s.theme === filterTheme;
          return matchSearch && matchKey && matchTheme;
        });

        if (songs.length === 0) return (
        <GlassCard className="p-12 flex flex-col items-center justify-center text-center">
          <div className="h-16 w-16 rounded-2xl bg-accent flex items-center justify-center mb-4">
            <Music className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-1">Nenhuma música</h3>
          <p className="text-muted-foreground text-sm max-w-xs">
            {canEdit
              ? "Adicione músicas a este repertório."
              : "Nenhuma música foi adicionada ainda."}
          </p>
          {canEdit && (
            <Button className="mt-6 rounded-xl gap-2" onClick={() => setAddSongOpen(true)}>
              <Plus className="h-4 w-4" /> Adicionar música
            </Button>
          )}
        </GlassCard>
        );

        return filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma música encontrada com os filtros aplicados.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((rs: any, idx: number) => (
              <div key={rs.id} className="relative group">
                <SongCard
                  song={rs.songs || { id: rs.song_id, title: "—" }}
                  index={idx}
                  onClick={() => navigate(`/app/songs/${rs.songs?.id || rs.song_id}`)}
                />
                {canEdit && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget({ rsId: rs.id, songTitle: rs.songs?.title || "esta música" });
                    }}
                    className="absolute right-14 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-destructive/10 text-destructive opacity-0 group-hover:opacity-100 hover:bg-destructive/20 transition-all"
                    title="Remover do repertório"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        );
      })()}

      <AddSongModal open={addSongOpen} onOpenChange={setAddSongOpen} repertorioId={id!} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover música</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{deleteTarget?.songTitle}</strong> deste repertório? A música não será excluída do sistema, apenas removida do repertório.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteTarget) return;
                const { error } = await supabase
                  .from("repertorio_songs")
                  .delete()
                  .eq("id", deleteTarget.rsId);
                if (error) {
                  toast({ title: "Erro", description: "Não foi possível remover a música.", variant: "destructive" });
                } else {
                  toast({ title: "Música removida do repertório" });
                  queryClient.invalidateQueries({ queryKey: ["repertorio-songs", id] });
                }
                setDeleteTarget(null);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
