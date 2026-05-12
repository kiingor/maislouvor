import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GlassInput } from "@/components/GlassInput";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editId?: string | null;
  editName?: string;
}

export function RepertorioModal({ open, onOpenChange, editId, editName }: Props) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const { currentTeam, profileId } = useTeam();
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    setName(editName ?? "");
  }, [editName, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTeam || !name.trim()) return;
    setLoading(true);

    if (editId) {
      const { error } = await supabase.from("repertorios").update({ name: name.trim() }).eq("id", editId);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); }
      else { toast({ title: "Repertório atualizado" }); }
    } else {
      const { error } = await supabase.from("repertorios").insert({ name: name.trim(), team_id: currentTeam.id, created_by: profileId });
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); }
      else { toast({ title: "Repertório criado!" }); }
    }

    qc.invalidateQueries({ queryKey: ["repertorios"] });
    setLoading(false);
    onOpenChange(false);
    setName("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass rounded-2xl border-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{editId ? "Renomear repertório" : "Novo repertório"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nome</label>
            <GlassInput placeholder="Ex: Domingo 23/02" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <Button type="submit" disabled={loading} className="w-full h-11 rounded-xl text-sm font-semibold">
            {loading ? <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" /> : editId ? "Salvar" : "Criar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
