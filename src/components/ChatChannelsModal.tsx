import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GlassInput } from "@/components/GlassInput";
import { useToast } from "@/hooks/use-toast";
import { Hash, Pencil, Trash2, Plus, Check, X } from "lucide-react";

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
      <DialogContent className="glass rounded-2xl border-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Gerenciar canais</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Crie, renomeie ou exclua canais da equipe.
          </DialogDescription>
        </DialogHeader>

        {/* Create */}
        <form onSubmit={handleCreate} className="space-y-2 mt-2">
          <GlassInput
            placeholder="Nome do canal"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={40}
          />
          <GlassInput
            placeholder="Descrição (opcional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            maxLength={120}
          />
          <Button
            type="submit"
            disabled={!newName.trim() || creating}
            className="w-full h-10 rounded-xl text-sm font-semibold"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Criar canal
          </Button>
        </form>

        {/* List */}
        <div className="mt-2 space-y-1.5 max-h-72 overflow-y-auto">
          {channels.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nenhum canal personalizado ainda.
            </p>
          ) : (
            channels.map((c) => (
              <div
                key={c.id}
                className="rounded-xl bg-accent/40 border border-border/50 p-2.5"
              >
                {editingId === c.id ? (
                  <div className="space-y-2">
                    <GlassInput
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      maxLength={40}
                      className="h-9"
                    />
                    <GlassInput
                      placeholder="Descrição (opcional)"
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      maxLength={120}
                      className="h-9"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-8 rounded-lg flex-1"
                        disabled={!editName.trim() || savingEdit}
                        onClick={() => handleSaveEdit(c.id)}
                      >
                        <Check className="h-4 w-4 mr-1" /> Salvar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 rounded-lg"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      {c.description && (
                        <p className="text-[11px] text-muted-foreground truncate">
                          {c.description}
                        </p>
                      )}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-lg shrink-0"
                      onClick={() => startEdit(c)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-lg shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={deletingId === c.id}
                      onClick={() => handleDelete(c.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
