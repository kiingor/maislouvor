import { useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Check, Copy, Link2, Loader2, Send } from "lucide-react";
import { appOrigin } from "@/lib/appUrl";

import { buildCultoShareText, type ShareRoteiroItem } from "@/lib/shareText";
import type { VoiceAssignment } from "@/lib/voices";

// Lista agrupada dentro da folha (protótipo `.group` / `.group-label`).
// Na folha, --card já vira branco (claro) / #2C2C2E (escuro) — ver ui/dialog.tsx.
const group = "overflow-hidden rounded-card bg-card";
const groupLabel = "mx-4 mb-1.5 block text-footnote text-muted-foreground";
const row = "relative flex min-h-[52px] items-center gap-3 px-4";
const rowSeparator = "before:absolute before:top-0 before:right-0 before:left-4 before:border-t before:border-border";

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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Compartilhar culto</DialogTitle>
          <DialogDescription className="text-center">
            Mensagem pronta com a escala e o repertório — tom, BPM e link de cada canção.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <p className={groupLabel} id="share-include-label">Incluir</p>
            <div className={group} role="group" aria-labelledby="share-include-label">
              {toggles.map((t, i) => {
                const switchId = `share-toggle-${t.key}`;
                return (
                  <div key={t.key} className={`${row} ${i > 0 ? rowSeparator : ""}`}>
                    <label
                      htmlFor={switchId}
                      className={`min-w-0 flex-1 py-2 ${t.disabled || publishing ? "cursor-default" : "cursor-pointer"}`}
                    >
                      <span className="block text-body text-foreground">{t.label}</span>
                      {t.key === "url" && (
                        <span className="block text-footnote text-muted-foreground">
                          {publicUrl ? "Link público ativo" : "Gera um link público do roteiro"}
                        </span>
                      )}
                    </label>
                    {t.key === "url" && publishing && (
                      <Loader2 className="h-[17px] w-[17px] animate-spin text-muted-foreground" aria-label="Publicando" />
                    )}
                    <Switch
                      id={switchId}
                      checked={t.value}
                      disabled={t.disabled || publishing}
                      onCheckedChange={(v) => t.set(!!v)}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="share-text" className={groupLabel}>Mensagem</label>
            <div className={group}>
              <Textarea
                id="share-text"
                value={text}
                onChange={(e) => setEdited(e.target.value)}
                spellCheck={false}
                className="h-[38vh] min-h-[180px] resize-none rounded-none bg-transparent font-mono text-footnote leading-[18px] focus-visible:outline-none focus-visible:ring-0 [html:not(.pointer-mode)_&:focus-visible]:ring-[3px] [html:not(.pointer-mode)_&:focus-visible]:ring-inset [html:not(.pointer-mode)_&:focus-visible]:ring-ios-blue"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Button className="w-full gap-2" onClick={openWhatsApp}>
              <Send aria-hidden="true" /> Enviar no WhatsApp
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1 gap-2" onClick={() => copy("text")}>
                {copied === "text" ? <Check className="text-ios-green" aria-hidden="true" /> : <Copy aria-hidden="true" />}
                Copiar texto
              </Button>
              <Button
                variant="secondary"
                className="flex-1 gap-2"
                disabled={publishing || (!publicUrl && !canPublish)}
                onClick={() => copy("link")}
              >
                {publishing ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : copied === "link" ? (
                  <Check className="text-ios-green" aria-hidden="true" />
                ) : (
                  <Link2 aria-hidden="true" />
                )}
                Copiar link
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
