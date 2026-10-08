import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { songRpc } from "@/lib/songCatalog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { contentReportReasons as reportReasonLabels } from "@/lib/contentModeration";
interface Report { id: string; kind: string; song_id: string | null; reason: keyof typeof reportReasonLabels; evidence: string; details: string; created_at: string }
export function ContentReportsPanel() {
  const [selected, setSelected] = useState<Report | null>(null);
  const [note, setNote] = useState("");
  const [block, setBlock] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const query = useQuery({ queryKey: ["content-reports"], refetchInterval: 30000, queryFn: async () => {
    const { data, error } = await supabase.from("content_reports" as never).select("id,kind,song_id,reason,evidence,details,created_at").eq("status", "open").order("created_at").limit(100);
    if (error) throw error;
    return data as Report[];
  } });
  const resolve = async (status: string) => {
    if (!selected || !note.trim()) return;
    setSaving(true);
    try { await songRpc("resolve_content_report", { p_id: selected.id, p_status: status, p_resolution: note, p_block_song: status === "resolved" && block }); setSelected(null); await query.refetch(); }
    catch (error) { toast({ title: "Não foi possível resolver", description: (error as Error).message, variant: "destructive" }); }
    finally { setSaving(false); }
  };
  return <section className="mb-6 space-y-3 rounded-card border bg-card p-5">
    <h2 className="text-lg font-semibold">Músicas e respostas de IA</h2>
    <p className="text-sm text-muted-foreground">Denúncias pendentes, mais antigas primeiro. A evidência de IA é o texto informado por quem denunciou.</p>
    {query.isError && <div role="alert">Falha ao carregar. <Button variant="outline" onClick={() => void query.refetch()}>Tentar novamente</Button></div>}
    {query.isPending && <p role="status">Carregando denúncias…</p>}
    {query.data?.length === 0 && <p className="text-sm">Nenhuma denúncia pendente.</p>}
    {query.data?.map((report) => <article key={report.id} className="space-y-2 border-t pt-3"><h3 className="font-medium">{report.kind === "song" ? "Música" : "Resposta de IA"} · {reportReasonLabels[report.reason]}</h3><p className="text-xs text-muted-foreground">{new Date(report.created_at).toLocaleString("pt-BR")}</p><p className="line-clamp-3 whitespace-pre-wrap break-words text-sm">{report.evidence}</p><Button size="sm" variant="outline" onClick={() => { setSelected(report); setNote(""); setBlock(false); }}>Analisar denúncia</Button></article>)}
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open && !saving) setSelected(null); }}><DialogContent><DialogHeader><DialogTitle>Analisar conteúdo</DialogTitle></DialogHeader><DialogDescription>Registre o motivo da decisão. O histórico fica restrito à plataforma.</DialogDescription>
      <div className="max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-sm">{selected?.evidence}</div><p className="whitespace-pre-wrap break-words text-sm">{selected?.details}</p>
      <label htmlFor="report-resolution">Resultado da análise</label><Textarea id="report-resolution" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
      {selected?.kind === "song" && selected.song_id && <label className="flex gap-2 text-sm"><input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} />Retirar esta música de circulação no app e em novos acessos públicos</label>}
      <div className="flex flex-wrap gap-2"><Button disabled={saving || !note.trim()} onClick={() => void resolve("resolved")}>Resolver</Button><Button variant="outline" disabled={saving || !note.trim()} onClick={() => void resolve("dismissed")}>Descartar denúncia</Button></div>
    </DialogContent></Dialog>
  </section>;
}
