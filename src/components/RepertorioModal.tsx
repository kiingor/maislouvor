import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { Dialog, DialogContent, DialogToolbar } from "@/components/ui/dialog";
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
      <DialogContent className="sm:max-w-md">
        <DialogToolbar
          title={editId ? "Renomear repertório" : "Novo repertório"}
          confirm={{
            label: editId ? "Salvar" : "Criar",
            type: "submit",
            form: "repertorio-form",
            disabled: loading || !name.trim(),
            loading,
          }}
        />
        <form id="repertorio-form" onSubmit={handleSubmit} className="min-w-0 pb-2">
          <label htmlFor="repertorio-name" className="mx-4 mb-1.5 block text-footnote text-muted-foreground">
            Nome
          </label>
          <div className="overflow-hidden rounded-card bg-card">
            <input
              id="repertorio-name"
              placeholder="Ex: Domingo 23/02"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="off"
              enterKeyHint="done"
              className="h-[52px] w-full bg-transparent px-4 text-body text-foreground placeholder:text-label-tertiary outline-none focus-visible:outline-none"
            />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
