import { useId, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { Dialog, DialogContent, DialogToolbar } from "@/components/ui/dialog";
import { GlassInput } from "@/components/GlassInput";
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
  // Há várias instâncias montadas (barra lateral, barra superior, onboarding): ids únicos.
  const formId = useId();
  const nameId = useId();

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
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogToolbar
          title="Criar equipe"
          confirm={{ label: "Criar", type: "submit", form: formId, disabled: loading || !name.trim(), loading }}
        />
        <form id={formId} onSubmit={handleCreate}>
          <label htmlFor={nameId} className="block mx-4 mb-1.5 text-footnote text-muted-foreground">
            Nome da equipe
          </label>
          <div className="rounded-card bg-card overflow-hidden">
            <GlassInput
              id={nameId}
              placeholder="Ex: Ministério de Louvor"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="h-[52px] rounded-card bg-transparent px-4 text-body font-normal placeholder:text-label-tertiary focus-visible:ring-inset focus-visible:ring-ios-blue/40"
            />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
