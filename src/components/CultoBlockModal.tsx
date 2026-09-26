import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogToolbar } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";

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
      <DialogContent className="sm:max-w-md">
        <DialogToolbar
          title={editBlock ? "Editar momento" : "Adicionar momento"}
          confirm={{
            label: editBlock ? "Salvar" : "Adicionar",
            type: "submit",
            form: "culto-block-form",
            disabled: saving || !title.trim(),
            loading: saving,
          }}
        />
        <form id="culto-block-form" onSubmit={handleSubmit} className="space-y-6">
          <div className={group}>
            <div className={`${row} ${keyboardFocusRow}`}>
              <label htmlFor="block-title" className="w-20 shrink-0 text-body text-foreground">Título</label>
              <input
                id="block-title"
                placeholder="Ex: Oração de abertura"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                autoFocus
                className={fieldInput}
              />
            </div>
            <div className={`${row} ${rowSeparator} ${keyboardFocusRow}`}>
              <label htmlFor="block-kind" className="w-20 shrink-0 text-body text-foreground">Tipo</label>
              <input
                id="block-kind"
                placeholder="Ex: Abertura, Palavra, Ministração..."
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className={fieldInput}
              />
            </div>
            {/* Sugestões de tipo (o campo continua livre) */}
            <div className="flex flex-wrap gap-2 px-4 pb-3 pt-1" role="group" aria-label="Sugestões de tipo">
              {KIND_SUGGESTIONS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => setKind(k)}
                  className={`relative inline-flex h-8 items-center gap-1 rounded-full px-3 text-subhead font-medium transition-colors before:absolute before:inset-x-0 before:-inset-y-1.5 ${
                    kind === k
                      ? "bg-prominent text-prominent-foreground"
                      : "bg-fill-tertiary text-foreground active:bg-fill-secondary"
                  }`}
                >
                  {kind === k && <Check className="h-[15px] w-[15px]" strokeWidth={2.5} aria-hidden="true" />}
                  {k}
                </button>
              ))}
            </div>
            <div className={`${row} ${rowSeparator} justify-between`}>
              <label htmlFor="block-duration" className="text-body text-foreground">Duração</label>
              <span className="flex items-center gap-1.5">
                <input
                  id="block-duration"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={300}
                  value={durationMin}
                  onChange={(e) => setDurationMin(parseInt(e.target.value) || 0)}
                  className="h-9 w-[72px] rounded-[8px] border-0 bg-fill-tertiary px-2.5 text-right text-body tabular-nums text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ios-blue/40"
                />
                <span className="text-body text-muted-foreground">min</span>
              </span>
            </div>
          </div>
          <div>
            <label htmlFor="block-notes" className={groupLabel}>Notas</label>
            <div className={group}>
              <Textarea
                id="block-notes"
                placeholder="Detalhes do momento (opcional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[88px] resize-none rounded-none bg-transparent focus-visible:outline-none focus-visible:ring-0 [html:not(.pointer-mode)_&:focus-visible]:ring-[3px] [html:not(.pointer-mode)_&:focus-visible]:ring-inset [html:not(.pointer-mode)_&:focus-visible]:ring-ios-blue"
              />
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
