import { useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Check, Copy, Link2, Loader2, Send, Share2 } from "lucide-react";
import { appOrigin } from "@/lib/appUrl";

import { buildCultoShareText, type ShareRoteiroItem } from "@/lib/shareText";
import type { VoiceAssignment } from "@/lib/voices";

/**
 * `crypto.randomUUID` não existe em contexto não seguro (testar o app pelo IP
 * da rede local, http://192.168.x.x) nem em WebViews antigas.
 */
function newToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface CultoShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  culto: any;
  roteiro: ShareRoteiroItem[];
  lineup: Record<string, string[]>;
  voices: Map<string, VoiceAssignment[]>;
  memberInfo: Map<string, { name: string; roles: string[] }>;
  /** Só quem pode editar o culto consegue publicar o link. */
  canPublish: boolean;
}

/**
 * Monta a mensagem de escala + repertório para mandar no WhatsApp (útil para
 * músicos convidados, que não têm o app). Mostra o texto antes de enviar para
 * o líder poder conferir/ajustar.
 */
export function CultoShareModal({
  open,
  onOpenChange,
  culto,
  roteiro,
  lineup,
  voices,
  memberInfo,
  canPublish,
}: CultoShareModalProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [includeLineup, setIncludeLineup] = useState(true);
  const [includeVoices, setIncludeVoices] = useState(true);
  const [includeLinks, setIncludeLinks] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [includeUrl, setIncludeUrl] = useState(true);

  const alreadyPublic = !!(culto?.is_public && culto?.public_token);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState<"text" | "link" | null>(null);
  const [edited, setEdited] = useState<string | null>(null);

  // Só reflete o link de um culto JÁ publicado. Publicar é ação explícita
  // (marcar "Link do roteiro" ou clicar em "Copiar link") — abrir o modal para
  // conferir a mensagem não pode colocar cifras e nomes da equipe na internet.
  useEffect(() => {
    if (!open) return;
    setPublicUrl(alreadyPublic ? `${appOrigin()}/culto/${culto.public_token}` : null);
    setIncludeUrl(alreadyPublic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, alreadyPublic, culto?.public_token]);

  /** Publica o roteiro sob demanda e devolve a URL (null se não deu). */
  const ensurePublicUrl = async (): Promise<string | null> => {
    if (publicUrl) return publicUrl;
    if (!culto || !canPublish) return null;
    setPublishing(true);
    try {
      const token = newToken();
      // `.select()` é obrigatório: sem ele o PostgREST devolve 204 mesmo quando
      // a RLS barra a escrita, e o modal exibiria um link que nunca existiu.
      const { data, error } = await supabase
        .from("cultos")
        .update({ is_public: true, public_token: token } as any)
        .eq("id", culto.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Você não tem permissão para publicar este culto.");
      const url = `${appOrigin()}/culto/${token}`;
      setPublicUrl(url);
      qc.invalidateQueries({ queryKey: ["culto", culto.id] });
      return url;
    } catch (err: any) {
      setIncludeUrl(false);
      toast({
        title: "Não foi possível gerar o link público",
        description: err?.message ?? String(err),
        variant: "destructive",
      });
      return null;
    } finally {
      setPublishing(false);
    }
  };

  const toggleIncludeUrl = async (checked: boolean) => {
    if (!checked) {
      setIncludeUrl(false);
      return;
    }
    const url = await ensurePublicUrl();
    if (url) setIncludeUrl(true);
  };

  const generated = useMemo(
    () =>
      buildCultoShareText({
        cultoName: culto?.name ?? "Culto",
        cultoDate: culto?.date,
        roteiro,
        lineup,
        voices,
        memberInfo,
        url: publicUrl,
        options: { includeLineup, includeVoices, includeLinks, includeNotes, includeUrl },
      }),
    [culto, roteiro, lineup, voices, memberInfo, publicUrl, includeLineup, includeVoices, includeLinks, includeNotes, includeUrl],
  );

  // As opções regeneram o texto; a edição manual só é preservada até mexer nelas.
  useEffect(() => { setEdited(null); }, [generated]);
  const text = edited ?? generated;

  const openWhatsApp = async () => {
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    if (Capacitor.isNativePlatform()) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url });
      return;
    }
    // navigator.share dá acesso a todos os apps no celular; no desktop cai no wa.me.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (err: any) {
        if (err?.name === "AbortError") return;
      }
    }
    window.open(url, "_blank", "noopener");
  };

  const copy = async (what: "text" | "link") => {
    const value = what === "text" ? text : await ensurePublicUrl();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  const toggles: { key: string; label: string; value: boolean; disabled?: boolean; set: (v: boolean) => void }[] = [
    { key: "lineup", label: "Escala", value: includeLineup, set: setIncludeLineup },
    { key: "voices", label: "Vozes por canção", value: includeVoices, set: setIncludeVoices },
    { key: "links", label: "Link das canções", value: includeLinks, set: setIncludeLinks },
    { key: "notes", label: "Observações", value: includeNotes, set: setIncludeNotes },
    {
      key: "url",
      label: "Link do roteiro",
      value: includeUrl,
      // Publicar exige permissão de editar o culto.
      disabled: !alreadyPublic && !canPublish,
      set: (v) => void toggleIncludeUrl(v),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass sm:rounded-2xl border-0 max-w-sm sm:max-w-lg max-h-[88vh] p-0 flex flex-col">
        <DialogHeader className="p-5 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Share2 className="h-4 w-4" /> Compartilhar culto
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Mensagem pronta com a escala e o repertório — tom, BPM e link de cada canção.
          </p>
        </DialogHeader>

        <div className="px-5 pb-2 flex flex-wrap gap-x-4 gap-y-1.5">
          {toggles.map((t) => (
            <label key={t.key} className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox checked={t.value} disabled={t.disabled || publishing} onCheckedChange={(v) => t.set(!!v)} />
              <span className="text-xs text-muted-foreground">{t.label}</span>
            </label>
          ))}
        </div>

        <div className="px-5 flex-1 min-h-0">
          <Textarea
            value={text}
            onChange={(e) => setEdited(e.target.value)}
            spellCheck={false}
            className="h-[38vh] min-h-[180px] text-xs leading-relaxed rounded-xl bg-accent/30 border-border/50 font-mono resize-none"
          />
        </div>

        <div className="p-5 pt-3 space-y-2">
          <Button className="w-full h-11 rounded-xl gap-2" onClick={openWhatsApp}>
            <Send className="h-4 w-4" /> Enviar no WhatsApp
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl gap-2 h-10" onClick={() => copy("text")}>
              {copied === "text" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              Copiar texto
            </Button>
            <Button
              variant="outline"
              className="flex-1 rounded-xl gap-2 h-10"
              disabled={publishing || (!publicUrl && !canPublish)}
              onClick={() => copy("link")}
            >
              {publishing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : copied === "link" ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              Copiar link
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
