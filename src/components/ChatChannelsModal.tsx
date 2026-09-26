import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogToolbar,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Hash, Pencil, Trash2, Plus, Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CustomChannel {
  id: string;
  team_id: string;
  name: string;
  description: string | null;
  sort_order: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  channels: CustomChannel[];
  onChanged: () => void;
}

// Grupo da folha. A folha redefine --card: branco no claro, #2C2C2E no escuro.
const group = "rounded-card bg-card overflow-hidden";
// Campo sem borda dentro do grupo (padrão de formulário do iOS).
const field =
  "block w-full h-11 bg-transparent px-4 text-body text-foreground placeholder:text-label-tertiary focus:outline-none focus-visible:outline-none";
const groupLabel = "text-footnote text-muted-foreground px-4 mb-1.5";

export function ChatChannelsModal({ open, onOpenChange, channels, onChanged }: Props) {
  const { currentTeam, profileId } = useTeam();
  const { toast } = useToast();

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTeam || !profileId || !newName.trim() || creating) return;
    setCreating(true);
    const maxOrder = channels.reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0);
    const { error } = await supabase.from("channels" as any).insert({
      team_id: currentTeam.id,
      name: newName.trim(),
      description: newDesc.trim() || null,
      created_by: profileId,
      sort_order: maxOrder + 1,
    } as any);
    setCreating(false);
    if (error) {
      toast({ title: "Erro ao criar canal", description: error.message, variant: "destructive" });
      return;
    }
    setNewName("");
    setNewDesc("");
    toast({ title: "Canal criado!" });
    onChanged();
  };

  const startEdit = (c: CustomChannel) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditDesc(c.description ?? "");
  };

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim() || savingEdit) return;
    setSavingEdit(true);
    const { error } = await supabase
      .from("channels" as any)
      .update({ name: editName.trim(), description: editDesc.trim() || null } as any)
      .eq("id", id);
    setSavingEdit(false);
    if (error) {
      toast({ title: "Erro ao renomear", description: error.message, variant: "destructive" });
      return;
    }
    setEditingId(null);
    onChanged();
  };

  const handleDelete = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    const { error } = await supabase.from("channels" as any).delete().eq("id", id);
    setDeletingId(null);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Canal excluído" });
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogToolbar title="Gerenciar canais" />
        <DialogDescription className="text-center px-4 -mt-2">
          Crie, renomeie ou exclua canais da equipe.
        </DialogDescription>

        {/* Create */}
        <form onSubmit={handleCreate} className="mt-1.5">
          <p className={groupLabel} id="new-channel-label">Novo canal</p>
          <div className={group} role="group" aria-labelledby="new-channel-label">
            <input
              className={field}
              placeholder="Nome do canal"
              aria-label="Nome do canal"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={40}
            />
            <div className="ml-4 border-t border-separator" />
            <input
              className={field}
              placeholder="Descrição (opcional)"
              aria-label="Descrição (opcional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              maxLength={120}
            />
          </div>
          <Button
            type="submit"
            disabled={!newName.trim() || creating}
            className="mt-3 w-full h-11 rounded-full text-body font-semibold"
          >
            {creating ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
            Criar canal
          </Button>
        </form>

        {/* List */}
        <div className="mt-1.5">
          <p className={groupLabel}>Canais da equipe</p>
          <div className={cn(group, "max-h-72 overflow-y-auto overscroll-contain")}>
            {channels.length === 0 ? (
              <p className="text-subhead text-muted-foreground text-center px-4 py-4">
                Nenhum canal personalizado ainda.
              </p>
            ) : (
              channels.map((c, i) => (
                <div key={c.id} className="relative">
                  {i > 0 && <div className="absolute top-0 right-0 left-[58px] border-t border-separator" aria-hidden="true" />}
                  {editingId === c.id ? (
                    <div className="py-1.5">
                      <input
                        autoFocus
                        className={field}
                        aria-label="Nome do canal"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={40}
                      />
                      <div className="ml-4 border-t border-separator" />
                      <input
                        className={field}
                        placeholder="Descrição (opcional)"
                        aria-label="Descrição (opcional)"
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        maxLength={120}
                      />
                      <div className="flex items-center justify-end gap-2 px-3 pt-1.5 pb-1">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          aria-label="Cancelar edição"
                          title="Cancelar"
                          className="relative before:absolute before:-inset-1 before:rounded-full before:content-[''] grid h-9 w-9 place-items-center rounded-full bg-fill-tertiary text-foreground transition-colors active:bg-fill-secondary"
                        >
                          <X className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          disabled={!editName.trim() || savingEdit}
                          onClick={() => handleSaveEdit(c.id)}
                          className="relative before:absolute before:-inset-1 before:rounded-full before:content-[''] inline-flex h-9 items-center gap-1.5 rounded-full bg-prominent px-4 text-subhead font-semibold text-prominent-foreground transition-opacity disabled:opacity-40"
                        >
                          {savingEdit ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                          )}
                          Salvar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 min-h-[52px] pl-4 pr-2 py-2">
                      <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] bg-fill-tertiary text-muted-foreground" aria-hidden="true">
                        <Hash className="h-4 w-4" strokeWidth={2.25} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-body truncate">{c.name}</p>
                        {c.description && (
                          <p className="text-footnote text-muted-foreground truncate">{c.description}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        aria-label={`Renomear ${c.name}`}
                        title="Renomear"
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-primary transition-colors active:bg-fill-tertiary"
                      >
                        <Pencil className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === c.id}
                        onClick={() => handleDelete(c.id)}
                        aria-label={`Excluir ${c.name}`}
                        title="Excluir"
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ios-red transition-colors active:bg-ios-red/10 disabled:opacity-40"
                      >
                        {deletingId === c.id ? (
                          <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" />
                        ) : (
                          <Trash2 className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
