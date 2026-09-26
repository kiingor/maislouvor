import { useId, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { firePush } from "@/lib/push";
import { useTeam } from "@/contexts/TeamContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogToolbar } from "@/components/ui/dialog";
import { GlassInput } from "@/components/GlassInput";

interface SendNotificationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SendNotificationModal({ open, onOpenChange }: SendNotificationModalProps) {
  const { currentTeam, profileId } = useTeam();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const fieldId = useId();

  const handleSend = async () => {
    if (!currentTeam || !profileId || !title.trim()) return;
    setSending(true);

    try {
      // Get all team members except the sender
      const { data: members } = await supabase
        .from("team_members")
        .select("profile_id")
        .eq("team_id", currentTeam.id)
        .neq("profile_id", profileId);

      if (!members || members.length === 0) {
        toast({ title: "Nenhum membro para notificar" });
        setSending(false);
        return;
      }

      const notifications = members.map((m) => ({
        profile_id: m.profile_id,
        team_id: currentTeam.id,
        type: "manual",
        title: title.trim(),
        body: body.trim() || null,
        sender_profile_id: profileId,
      }));

      const { error } = await supabase.from("notifications").insert(notifications as any);

      if (error) throw error;

      // Push (Web Push) — opcional, não bloqueia o aviso in-app
      await firePush(
        currentTeam.id,
        notifications.map((n) => ({ profile_id: n.profile_id, title: n.title, body: n.body, link: null })),
      );

      toast({ title: "Aviso enviado!", description: `Enviado para ${members.length} membro(s)` });
      setTitle("");
      setBody("");
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-md">
        <DialogToolbar
          title="Enviar aviso ao time"
          confirm={{
            // Círculo ✓ (padrão da barra): mantém o título centralizado e sem corte a 360pt.
            label: sending ? "Enviando..." : "Enviar aviso",
            onClick: handleSend,
            disabled: sending || !title.trim(),
            loading: sending,
          }}
        />

        {/* Formulário agrupado (HIG > Sheets): rótulo de grupo + célula. */}
        <div className="space-y-6 pb-1">
          <div>
            <label htmlFor={`${fieldId}-title`} className="mx-4 mb-1.5 block text-footnote text-muted-foreground">
              Título
            </label>
            <div className="overflow-hidden rounded-card bg-card">
              <GlassInput
                id={`${fieldId}-title`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Ensaio cancelado"
                className="h-[52px] rounded-none bg-transparent focus-visible:ring-0"
              />
            </div>
          </div>
          <div>
            <label htmlFor={`${fieldId}-body`} className="mx-4 mb-1.5 block text-footnote text-muted-foreground">
              Mensagem (opcional)
            </label>
            <div className="overflow-hidden rounded-card bg-card">
              <textarea
                id={`${fieldId}-body`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Detalhes do aviso..."
                className="block min-h-[112px] w-full resize-none border-0 bg-transparent px-4 py-[13px] text-body text-foreground caret-primary placeholder:text-label-tertiary focus-visible:outline-none"
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
