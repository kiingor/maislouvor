import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GlassInput } from "@/components/GlassInput";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editCulto?: any | null;
}

export function CultoModal({ open, onOpenChange, editCulto }: Props) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const { currentTeam, profileId } = useTeam();
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if (editCulto) {
      setName(editCulto.name || "");
      setDate(editCulto.date || "");
      setDescription(editCulto.description || "");
    } else {
      setName("");
      setDate("");
      setDescription("");
    }
  }, [editCulto, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTeam || !name.trim() || !date) return;
    setLoading(true);

    if (editCulto?.id) {
      const { error } = await supabase
        .from("cultos")
        .update({ name: name.trim(), date, description: description.trim() || null })
        .eq("id", editCulto.id);
      if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
      else toast({ title: "Culto atualizado" });
    } else {
      const { error } = await supabase
        .from("cultos")
        .insert({ name: name.trim(), date, description: description.trim() || null, team_id: currentTeam.id, created_by: profileId });
      if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
      else toast({ title: "Culto criado!" });
    }

    qc.invalidateQueries({ queryKey: ["cultos"] });
    setLoading(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass rounded-2xl border-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{editCulto ? "Editar culto" : "Novo culto"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nome</label>
            <GlassInput placeholder="Ex: Culto de Domingo" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Data</label>
            <GlassInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Observações</label>
            <Textarea
              placeholder="Observações do culto (opcional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="glass-subtle rounded-xl border-0 min-h-[80px] resize-none"
            />
          </div>
          <Button type="submit" disabled={loading || !name.trim() || !date} className="w-full h-11 rounded-xl text-sm font-semibold">
            {loading ? <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" /> : editCulto ? "Salvar" : "Criar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
