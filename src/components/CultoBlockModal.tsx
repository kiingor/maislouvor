import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GlassInput } from "@/components/GlassInput";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cultoId: string;
  editBlock?: any | null;
  // sort_order a usar quando criar um bloco novo (final do roteiro)
  nextSortOrder?: number;
}

// Sugestões de tipo comuns (campo é livre).
const KIND_SUGGESTIONS = ["Abertura", "Oração", "Palavra", "Ministração", "Avisos", "Ofertas", "Santa Ceia", "Encerramento"];

export function CultoBlockModal({ open, onOpenChange, cultoId, editBlock, nextSortOrder = 0 }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("");
  const [durationMin, setDurationMin] = useState(5);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editBlock) {
      setTitle(editBlock.title || "");
      setKind(editBlock.kind || "");
      setDurationMin(editBlock.duration_min ?? 5);
      setNotes(editBlock.notes || "");
    } else {
      setTitle("");
      setKind("");
      setDurationMin(5);
      setNotes("");
    }
  }, [editBlock, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);

    const payload = {
      title: title.trim(),
      kind: kind.trim() || "moment",
      duration_min: Number.isFinite(durationMin) ? durationMin : 0,
      notes: notes.trim() || null,
    };

    let error;
    if (editBlock?.id) {
      ({ error } = await supabase.from("culto_blocks" as any).update(payload as any).eq("id", editBlock.id));
    } else {
      ({ error } = await supabase.from("culto_blocks" as any).insert({
        ...payload,
        culto_id: cultoId,
        sort_order: nextSortOrder,
      } as any));
    }

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editBlock ? "Momento atualizado" : "Momento adicionado" });
      qc.invalidateQueries({ queryKey: ["culto-blocks", cultoId] });
      onOpenChange(false);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass rounded-2xl border-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{editBlock ? "Editar momento" : "Adicionar momento"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Título</label>
            <GlassInput placeholder="Ex: Oração de abertura" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tipo</label>
            <GlassInput placeholder="Ex: Abertura, Palavra, Ministração..." value={kind} onChange={(e) => setKind(e.target.value)} />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
              {KIND_SUGGESTIONS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors flex items-center justify-center gap-1 ${
                    kind === k
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-accent/50 text-muted-foreground border-border hover:border-primary/50"
                  }`}
                >
                  {kind === k && <Sparkles className="h-2.5 w-2.5" />}
                  {k}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Duração (min)</label>
            <GlassInput
              type="number"
              min={0}
              max={300}
              value={durationMin}
              onChange={(e) => setDurationMin(parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notas</label>
            <Textarea
              placeholder="Detalhes do momento (opcional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="glass-subtle rounded-xl border-0 min-h-[70px] resize-none"
            />
          </div>
          <Button type="submit" disabled={saving || !title.trim()} className="w-full h-11 rounded-xl text-sm font-semibold">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editBlock ? "Salvar" : "Adicionar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
