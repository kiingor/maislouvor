import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Bell, BellRing, CalendarPlus, Clock, Music2, MessagesSquare, Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { enablePushOnThisDevice, pushPermission, pushSupported } from "@/lib/push";

type PrefKey = "nova_escala" | "lembrete_culto" | "musica_culto" | "mensagens";

const PREFS: { key: PrefKey; label: string; description: string; icon: LucideIcon }[] = [
  { key: "nova_escala", label: "Nova escala", description: "Quando você for escalado em um culto", icon: CalendarPlus },
  { key: "lembrete_culto", label: "Lembrete de culto", description: "Lembrete antes dos cultos em que você serve", icon: Clock },
  { key: "musica_culto", label: "Música adicionada ao meu culto", description: "Quando uma música entra em um culto seu", icon: Music2 },
  { key: "mensagens", label: "Mensagens da equipe", description: "Avisos e mensagens enviadas pela equipe", icon: MessagesSquare },
];

interface UserNotificationPrefsProps {
  profileTableId: string | null;
  prefs: Record<string, unknown> | null | undefined;
}

/**
 * Notification preference toggles, persisted in profiles.notification_prefs (jsonb).
 * Each event type defaults to enabled when no stored value exists.
 * (Only stores the preferences; honoring them when sending is future work.)
 */
export function UserNotificationPrefs({ profileTableId, prefs }: UserNotificationPrefsProps) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const initial = useMemo(() => {
    const state: Record<PrefKey, boolean> = {
      nova_escala: true,
      lembrete_culto: true,
      musica_culto: true,
      mensagens: true,
    };
    if (prefs && typeof prefs === "object") {
      (Object.keys(state) as PrefKey[]).forEach((k) => {
        const v = (prefs as Record<string, unknown>)[k];
        if (typeof v === "boolean") state[k] = v;
      });
    }
    return state;
  }, [prefs]);

  const [values, setValues] = useState<Record<PrefKey, boolean>>(initial);
  const [savingKey, setSavingKey] = useState<PrefKey | null>(null);

  // Push neste aparelho (Web Push — navegador/PWA)
  const [pushPerm, setPushPerm] = useState<NotificationPermission | "unsupported">("default");
  const [pushLoading, setPushLoading] = useState(false);
  useEffect(() => {
    setPushPerm(pushPermission());
  }, []);

  const handleEnablePush = async () => {
    setPushLoading(true);
    const res = await enablePushOnThisDevice();
    setPushLoading(false);
    setPushPerm(pushPermission());
    if (res === "granted") toast({ title: "Notificações ativadas neste aparelho!" });
    else if (res === "denied") toast({ title: "Permissão negada", description: "Habilite as notificações nas configurações do navegador.", variant: "destructive" });
    else if (res === "error") toast({ title: "Erro ao ativar notificações", variant: "destructive" });
  };

  useEffect(() => {
    setValues(initial);
  }, [initial]);

  const handleToggle = async (key: PrefKey, next: boolean) => {
    if (!profileTableId) return;
    const previous = values;
    const updated = { ...values, [key]: next };
    setValues(updated);
    setSavingKey(key);
    const { error } = await supabase
      .from("profiles")
      .update({ notification_prefs: updated } as any)
      .eq("id", profileTableId);
    setSavingKey(null);
    if (error) {
      setValues(previous);
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      qc.invalidateQueries({ queryKey: ["team-members"] });
    }
  };

  return (
    <GlassCard className="p-4 space-y-3">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Bell className="h-3 w-3" /> Notificações
      </label>

      {/* Push neste aparelho (navegador / PWA) */}
      {pushSupported() && (
        pushPerm === "granted" ? (
          <div className="flex items-center gap-2 rounded-xl bg-primary/10 text-primary px-3 py-2.5 text-sm">
            <Check className="h-4 w-4 shrink-0" />
            <span>Notificações ativadas neste aparelho</span>
          </div>
        ) : (
          <div className="rounded-xl bg-accent/40 px-3 py-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              Receba avisos e escalas mesmo com o app fechado, direto na tela do aparelho.
            </p>
            <Button onClick={handleEnablePush} disabled={pushLoading} className="w-full rounded-lg gap-2 h-10">
              <BellRing className="h-4 w-4" />
              {pushLoading ? "Ativando..." : pushPerm === "denied" ? "Permitir notificações" : "Ativar notificações neste aparelho"}
            </Button>
          </div>
        )
      )}

      <div className="divide-y divide-border/50">
        {PREFS.map(({ key, label, description, icon: Icon }) => (
          <div key={key} className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1">
            <div className="flex items-start gap-2 min-w-0">
              <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
              </div>
            </div>
            <Switch
              checked={values[key]}
              onCheckedChange={(v) => handleToggle(key, v)}
              disabled={!profileTableId || savingKey === key}
            />
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
