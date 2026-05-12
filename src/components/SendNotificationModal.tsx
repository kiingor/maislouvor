import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GlassInput } from "@/components/GlassInput";
import { Loader2, Send } from "lucide-react";

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
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Enviar aviso ao time</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Título</label>
            <GlassInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Ensaio cancelado"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Mensagem (opcional)</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Detalhes do aviso..."
              className="w-full min-h-[100px] rounded-xl glass-input p-3 text-sm resize-y placeholder:text-muted-foreground/60 focus-visible:outline-none"
            />
          </div>
          <Button
            onClick={handleSend}
            disabled={sending || !title.trim()}
            className="w-full rounded-xl gap-2"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Enviando..." : "Enviar aviso"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
