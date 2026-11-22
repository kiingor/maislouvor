import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { Dialog, DialogContent, DialogToolbar } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DateField } from "@/components/DateField";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editCulto?: any | null;
}

// Formulário agrupado dentro da folha (protótipo `.group` / `.group-label`).
// Na folha, --card já vira branco (claro) / #2C2C2E (escuro) — ver ui/dialog.tsx.
const group = "overflow-hidden rounded-card bg-card";
const groupLabel = "mx-4 mb-1.5 block text-footnote text-muted-foreground";
const row = "relative flex min-h-[48px] items-center gap-3 px-4";
const rowSeparator = "before:absolute before:top-0 before:right-0 before:left-4 before:border-t before:border-border";
const fieldInput = "min-w-0 flex-1 bg-transparent py-3 text-body text-foreground placeholder:text-label-tertiary focus-visible:outline-none";
// Foco de teclado nas linhas com campo de texto: anel interno na linha inteira (o contorno global
// de :focus-visible seria cortado pelo overflow do grupo). Some no toque, como a regra global (.pointer-mode).
const keyboardFocusRow =
  "[html:not(.pointer-mode)_&:focus-within]:ring-[3px] [html:not(.pointer-mode)_&:focus-within]:ring-inset [html:not(.pointer-mode)_&:focus-within]:ring-ios-blue";

export function CultoModal({ open, onOpenChange, editCulto }: Props) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const { currentTeam, profileId } = useTeam();
  const { toast } = useToast();
  const qc = useQueryClient();
  // Mesmo corte da lista em Cultos.tsx: antes de hoje vai para "Passados" (PrimeTestLab 10957, S-01).
  const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local
  const isPastNew = !editCulto && !!date && date < todayStr;

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
      <DialogContent className="sm:max-w-md">
        <DialogToolbar
          title={editCulto ? "Editar culto" : "Novo culto"}
          confirm={{
            label: editCulto ? "Salvar" : "Criar",
            type: "submit",
            form: "culto-form",
            disabled: loading || !name.trim() || !date,
            loading,
          }}
        />
        <form id="culto-form" onSubmit={handleSubmit} className="space-y-6">
          <div className={group}>
            <div className={`${row} ${keyboardFocusRow}`}>
              <label htmlFor="culto-name" className="w-20 shrink-0 text-body text-foreground">Nome</label>
              <input
                id="culto-name"
                placeholder="Ex: Culto de Domingo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className={fieldInput}
              />
            </div>
            <div className={`${row} ${rowSeparator} justify-between`}>
              <label htmlFor="culto-date" className="text-body text-foreground">Data</label>
              <DateField
                id="culto-date"
                value={date}
                onChange={setDate}
                required
                aria-describedby={isPastNew ? "culto-date-past" : undefined}
              />
            </div>
          </div>
          {isPastNew && (
            <p id="culto-date-past" role="status" className="-mt-4 mx-4 text-footnote text-muted-foreground">
              Essa data já passou. O culto vai aparecer em Passados, não em Próximos.
            </p>
          )}
          <div>
            <label htmlFor="culto-description" className={groupLabel}>Observações</label>
            <div className={group}>
              <Textarea
                id="culto-description"
                placeholder="Observações do culto (opcional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[88px] resize-none rounded-none bg-transparent focus-visible:outline-none focus-visible:ring-0 [html:not(.pointer-mode)_&:focus-visible]:ring-[3px] [html:not(.pointer-mode)_&:focus-visible]:ring-inset [html:not(.pointer-mode)_&:focus-visible]:ring-ios-blue"
              />
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
