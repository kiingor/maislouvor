import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GlassInput } from "@/components/GlassInput";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function CreateTeamModal({ open, onOpenChange }: Props) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const { profileId, refetch } = useTeam();
  const { toast } = useToast();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileId || !name.trim()) return;
    setLoading(true);

    const { error } = await supabase
      .from("teams")
      .insert({ name: name.trim(), owner_id: profileId });

    if (error) {
      toast({ title: "Erro ao criar equipe", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Equipe criada!" });
      await refetch();
      onOpenChange(false);
      setName("");
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass rounded-2xl border-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Criar equipe</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4 mt-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Nome da equipe
            </label>
            <GlassInput
              placeholder="Ex: Ministério de Louvor"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full h-11 rounded-xl text-sm font-semibold">
            {loading ? <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" /> : "Criar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
