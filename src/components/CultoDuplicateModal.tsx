import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GlassInput } from "@/components/GlassInput";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Copy } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  // culto de origem (precisa pelo menos de id, name, date)
  sourceCulto: any | null;
}

export function CultoDuplicateModal({ open, onOpenChange, sourceCulto }: Props) {
  const { currentTeam, profileId } = useTeam();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [copySongs, setCopySongs] = useState(true);
  const [copyBlocks, setCopyBlocks] = useState(true);
  const [copyLineup, setCopyLineup] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && sourceCulto) {
      setName(`${sourceCulto.name} (cópia)`);
      setDate(sourceCulto.date || "");
      setCopySongs(true);
      setCopyBlocks(true);
      setCopyLineup(false);
    }
  }, [open, sourceCulto]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTeam || !sourceCulto || !name.trim() || !date) return;
    setSaving(true);

    try {
      // 1) Cria o culto novo
      const { data: newCulto, error: cErr } = await supabase
        .from("cultos")
        .insert({
          name: name.trim(),
          date,
          description: sourceCulto.description || null,
          team_id: currentTeam.id,
          created_by: profileId,
        } as any)
        .select("id")
        .single();

      if (cErr || !newCulto) throw cErr || new Error("Falha ao criar culto");
      const newId = (newCulto as any).id;

      // 2) Copia músicas (culto_songs)
      if (copySongs) {
        const { data: songs } = await supabase
          .from("culto_songs")
          .select("song_id, sort_order, notes, key_override")
          .eq("culto_id", sourceCulto.id)
          .order("sort_order", { ascending: true });
        if (songs && songs.length > 0) {
          const rows = songs.map((s: any) => ({
            culto_id: newId,
            song_id: s.song_id,
            sort_order: s.sort_order,
            notes: s.notes ?? null,
            key_override: s.key_override ?? null,
          }));
          await supabase.from("culto_songs").insert(rows as any);
        }
      }

      // 3) Copia roteiro (culto_blocks)
      if (copyBlocks) {
        const { data: blocks } = await supabase
          .from("culto_blocks" as any)
          .select("title, kind, duration_min, notes, sort_order")
          .eq("culto_id", sourceCulto.id)
          .order("sort_order", { ascending: true });
        if (blocks && blocks.length > 0) {
          const rows = blocks.map((b: any) => ({
            culto_id: newId,
            title: b.title,
            kind: b.kind,
            duration_min: b.duration_min,
            notes: b.notes ?? null,
            sort_order: b.sort_order,
          }));
          await supabase.from("culto_blocks" as any).insert(rows as any);
        }
      }

      // 4) Copia escala (culto_lineup) com status='pending'
      if (copyLineup) {
        const { data: lineup } = await supabase
          .from("culto_lineup")
          .select("team_member_id, instrument")
          .eq("culto_id", sourceCulto.id);
        if (lineup && lineup.length > 0) {
          const rows = lineup.map((l: any) => ({
            culto_id: newId,
            team_member_id: l.team_member_id,
            instrument: l.instrument,
            status: "pending",
          }));
          await supabase.from("culto_lineup").insert(rows as any);
        }
      }

      toast({ title: "Culto duplicado!" });
      qc.invalidateQueries({ queryKey: ["cultos"] });
      onOpenChange(false);
      navigate(`/app/cultos/${newId}`);
    } catch (err: any) {
      toast({ title: "Erro ao duplicar", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass rounded-2xl border-0 max-w-sm sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Copy className="h-4 w-4" /> Duplicar culto
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nome</label>
            <GlassInput placeholder="Nome do novo culto" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Data</label>
            <GlassInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">O que copiar</label>
            <div className="space-y-2.5 rounded-xl glass-subtle p-3">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <Checkbox checked={copySongs} onCheckedChange={(v) => setCopySongs(!!v)} />
                <span className="text-sm">Copiar músicas <span className="text-muted-foreground text-xs">(tom e notas)</span></span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <Checkbox checked={copyBlocks} onCheckedChange={(v) => setCopyBlocks(!!v)} />
                <span className="text-sm">Copiar roteiro <span className="text-muted-foreground text-xs">(momentos)</span></span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <Checkbox checked={copyLineup} onCheckedChange={(v) => setCopyLineup(!!v)} />
                <span className="text-sm">Copiar escala <span className="text-muted-foreground text-xs">(como pendente)</span></span>
              </label>
            </div>
          </div>

          <Button type="submit" disabled={saving || !name.trim() || !date} className="w-full h-11 rounded-xl text-sm font-semibold">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Duplicar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
