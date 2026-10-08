import { useEffect, useState } from "react";
import { ScanFace } from "lucide-react";
import { BiometricSession, disableFaceId, enableFaceId, isFaceIdPlatform } from "@/lib/biometricStorage";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";

export function FaceIdSettings() {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  useEffect(() => {
    if (!isFaceIdPlatform()) return;
    void BiometricSession.status().then(status => { setAvailable(status.available || status.enabled); setEnabled(status.enabled); }).catch(() => {});
  }, []);
  if (!available) return null;
  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      if (next) {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session) throw new Error("Entre novamente");
        await enableFaceId(data.session);
        localStorage.setItem(`maislouvor.faceid.prompted.${data.session.user.id}`, "yes");
      } else await disableFaceId();
      setEnabled(next);
    } catch { toast({ title: "Não foi possível alterar o Face ID", description: "Tente novamente e confira a permissão do +Louvor nos Ajustes do iPhone.", variant: "destructive" }); }
    finally { setBusy(false); }
  };
  return <section aria-labelledby="faceid-settings-title">
    <h2 id="faceid-settings-title" className="mx-4 mb-1.5 text-footnote text-muted-foreground">Segurança</h2>
    <div className="flex min-h-[60px] items-center gap-3 rounded-card bg-card px-4">
      <ScanFace className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      <label htmlFor="faceid-switch" className="flex-1 text-body">Entrar com Face ID</label>
      <Switch id="faceid-switch" checked={enabled} disabled={busy} onCheckedChange={next => void toggle(next)} />
    </div>
    <p className="mx-4 mt-1.5 text-footnote text-muted-foreground">Protege sua entrada neste aparelho. Ao sair da conta, será necessário fazer login novamente.</p>
  </section>;
}
