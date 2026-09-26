import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { BellRing, CalendarPlus, Clock, Music2, MessagesSquare, Check, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { enablePushOnThisDevice, pushPermission, pushSupported } from "@/lib/push";
import { cn } from "@/lib/utils";

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

/** Ícone de linha: quadrado de 30pt neutro (preenchimento terciário); cor só para status. */
function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span className={cn("flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-fill-tertiary text-muted-foreground", className)}>
      <Icon className="h-[17px] w-[17px]" strokeWidth={2.25} aria-hidden="true" />
    </span>
  );
}

/** Linha de lista agrupada: o separador começa no texto (recuo de 58pt), como no iOS. */
function Row({ tile, children }: { tile: ReactNode; children: ReactNode }) {
  return (
    <div className="group/row flex items-center gap-3 pl-4">
      {tile}
      <div className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 border-t border-separator py-2.5 pr-4 group-first/row:border-t-0">
        {children}
      </div>
    </div>
  );
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
    <section aria-labelledby="notification-prefs-title">
      <h2 id="notification-prefs-title" className="mx-4 mb-1.5 text-footnote text-muted-foreground">
        Notificações
      </h2>

      {/* Push neste aparelho (navegador / PWA) */}
      {pushSupported() && (
        <div className="mb-6">
          <div className="overflow-hidden rounded-card bg-card">
            {pushPerm === "granted" ? (
              <Row tile={<IconTile icon={Check} className="bg-ios-green text-white" />}>
                <p className="text-body">Notificações ativadas neste aparelho</p>
              </Row>
            ) : (
              <button
                type="button"
                onClick={handleEnablePush}
                disabled={pushLoading}
                aria-busy={pushLoading || undefined}
                className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors active:bg-fill-quaternary disabled:opacity-60"
              >
                <IconTile icon={BellRing} />
                <span className="min-w-0 flex-1 text-body font-medium text-primary">
                  {pushLoading ? "Ativando..." : pushPerm === "denied" ? "Permitir notificações" : "Ativar notificações neste aparelho"}
                </span>
                {pushLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />}
              </button>
            )}
          </div>
          {pushPerm !== "granted" && (
            <p className="mx-4 mt-1.5 text-footnote text-muted-foreground">
              Receba avisos e escalas mesmo com o app fechado, direto na tela do aparelho.
            </p>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-card bg-card">
        {PREFS.map(({ key, label, description, icon }) => (
          <Row key={key} tile={<IconTile icon={icon} />}>
            <div className="min-w-0 flex-1">
              <p id={`notif-pref-${key}`} className="text-body">{label}</p>
              <p id={`notif-pref-${key}-desc`} className="text-footnote text-muted-foreground">{description}</p>
            </div>
            <Switch
              checked={values[key]}
              onCheckedChange={(v) => handleToggle(key, v)}
              disabled={!profileTableId || savingKey === key}
              aria-labelledby={`notif-pref-${key}`}
              aria-describedby={`notif-pref-${key}-desc`}
            />
          </Row>
        ))}
      </div>
    </section>
  );
}
