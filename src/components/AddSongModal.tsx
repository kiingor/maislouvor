import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GlassInput } from "@/components/GlassInput";
import { Button } from "@/components/ui/button";
import { Music, Globe, Loader2 } from "lucide-react";

interface AddSongModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repertorioId: string;
}

export function AddSongModal({ open, onOpenChange, repertorioId }: AddSongModalProps) {
  const navigate = useNavigate();
  const { currentTeam, profileId } = useTeam();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [mode, setMode] = useState<"choose" | "manual" | "import">("choose");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => { setMode("choose"); setTitle(""); setUrl(""); setLoading(false); };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const createAndLink = async (songData: { title: string; artist?: string | null; key_original?: string | null; key_current?: string | null; cifra_text?: string | null }) => {
    if (!currentTeam) return;

    const { data: song, error } = await supabase
      .from("songs")
      .insert([{ team_id: currentTeam.id, created_by: profileId, title: songData.title, artist: songData.artist, key_original: songData.key_original, key_current: songData.key_current, cifra_text: songData.cifra_text }])
      .select("id")
      .single();

    if (error || !song) {
      toast({ title: "Erro ao criar música", description: error?.message, variant: "destructive" });
      return null;
    }

    // Get max sort_order
    const { data: maxOrder } = await supabase
      .from("repertorio_songs")
      .select("sort_order")
      .eq("repertorio_id", repertorioId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (maxOrder?.sort_order ?? -1) + 1;

    await supabase.from("repertorio_songs").insert({
      repertorio_id: repertorioId,
      song_id: song.id,
      sort_order: nextOrder,
    });

    qc.invalidateQueries({ queryKey: ["repertorio-songs", repertorioId] });
    return song.id;
  };

  const handleManual = async () => {
    if (!title.trim()) return;
    setLoading(true);
    const songId = await createAndLink({ title: title.trim() });
    setLoading(false);
    if (songId) {
      handleClose(false);
      navigate(`/app/songs/${songId}`);
    }
  };

  const handleImport = async () => {
    if (!url.trim()) return;
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("import-cifra", {
        body: { url: url.trim() },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha na importação");

      const parsed = data.data;
      const songId = await createAndLink({
        title: parsed.title || "Sem título",
        artist: parsed.artist || null,
        key_original: parsed.key_original || null,
        key_current: parsed.key_original || null,
        cifra_text: parsed.cifra_text || null,
      });

      setLoading(false);
      if (songId) {
        toast({ title: "Música importada com sucesso!" });
        handleClose(false);
        navigate(`/app/songs/${songId}`);
      }
    } catch (e: any) {
      setLoading(false);
      toast({ title: "Erro na importação", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="glass sm:rounded-2xl border-0">
        <DialogHeader>
          <DialogTitle>
            {mode === "choose" ? "Adicionar música" : mode === "manual" ? "Criar manualmente" : "Importar do Cifra Club"}
          </DialogTitle>
        </DialogHeader>

        {mode === "choose" && (
          <div className="grid gap-3 pt-2">
            <button
              onClick={() => setMode("manual")}
              className="flex items-center gap-4 p-4 rounded-xl glass-subtle hover-lift text-left transition-all"
            >
              <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center">
                <Music className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Manual</p>
                <p className="text-xs text-muted-foreground">Preencha título, cifra e detalhes</p>
              </div>
            </button>
            <button
              onClick={() => setMode("import")}
              className="flex items-center gap-4 p-4 rounded-xl glass-subtle hover-lift text-left transition-all"
            >
              <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center">
                <Globe className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Importar do Cifra Club</p>
                <p className="text-xs text-muted-foreground">Cole o link e importe automaticamente</p>
              </div>
            </button>
          </div>
        )}

        {mode === "manual" && (
          <div className="space-y-4 pt-2">
            <GlassInput
              placeholder="Nome da música"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => setMode("choose")}>
                Voltar
              </Button>
              <Button className="rounded-xl" onClick={handleManual} disabled={!title.trim() || loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Criar
              </Button>
            </div>
          </div>
        )}

        {mode === "import" && (
          <div className="space-y-4 pt-2">
            <GlassInput
              placeholder="https://www.cifraclub.com.br/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
            />
            {loading && (
              <div className="flex items-center gap-3 p-4 rounded-xl glass-subtle">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Importando do Cifra Club...</span>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => setMode("choose")} disabled={loading}>
                Voltar
              </Button>
              <Button className="rounded-xl" onClick={handleImport} disabled={!url.trim() || loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Importar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
