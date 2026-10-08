import { useId, useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { songRpc } from "@/lib/songCatalog";
import { contentReportReasons as reportReasonLabels } from "@/lib/contentModeration";
export function ReportContentButton({ songId, evidence = "", label }: { songId?: string; evidence?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("copyright");
  const [details, setDetails] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();
  const { toast } = useToast();
  const submit = async () => {
    setBusy(true);
    try {
      await songRpc("report_content", { p_kind: songId ? "song" : "ai", p_song_id: songId ?? null, p_reason: reason,
        p_details: details, p_evidence: evidence || text });
      setOpen(false); setDetails(""); setText("");
      toast({ title: "Denúncia enviada", description: "A moderação recebeu o conteúdo para análise." });
    } catch (error) { toast({ title: "Não foi possível enviar", description: (error as Error).message, variant: "destructive" }); }
    finally { setBusy(false); }
  };
  return <>
    <Button type="button" variant="ghost" size="sm" onClick={() => { setReason(songId ? "copyright" : "other"); setOpen(true); }}><Flag className="mr-2 h-4 w-4" />{label || (songId ? "Denunciar música" : "Denunciar resposta de IA")}</Button>
    <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}>
      <DialogContent><DialogHeader><DialogTitle>Denunciar conteúdo</DialogTitle></DialogHeader><DialogDescription>Só a moderação da plataforma recebe sua denúncia. Não inclua senhas ou dados pessoais desnecessários.</DialogDescription>
        <label htmlFor={id}>Motivo</label><select id={id} className="h-11 rounded-md border bg-background px-3" value={reason} onChange={(e) => setReason(e.target.value)}>{Object.entries(reportReasonLabels).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select>
        {!songId && !evidence && <><label htmlFor={`${id}-text`}>Resposta recebida</label><Textarea id={`${id}-text`} maxLength={10000} value={text} onChange={(e) => setText(e.target.value)} /></>}
        <label htmlFor={`${id}-detail`}>Detalhes (opcional)</label><Textarea id={`${id}-detail`} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Explique o problema. Para direitos autorais, indique a obra e a autorização que está faltando." />
        <Button disabled={busy || (!songId && !(evidence || text).trim())} onClick={() => void submit()}>{busy ? "Enviando…" : "Enviar denúncia"}</Button>
      </DialogContent>
    </Dialog>
  </>;
}
