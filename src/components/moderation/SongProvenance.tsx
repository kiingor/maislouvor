import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { songRpc } from "@/lib/songCatalog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
interface Provenance { source_url: string; rights_basis: string; rights_details: string }
const bases = { unknown: "Autorização não informada", original: "Obra e gravação próprias", permission: "Autorização do titular", licensed: "Licença de uso", public_domain: "Domínio público comprovado" };
export function SongProvenance({ songId, readOnly }: { songId: string; readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Provenance>({ source_url: "", rights_basis: "unknown", rights_details: "" });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const query = useQuery({ queryKey: ["song-provenance", songId], queryFn: async () => {
    const { data, error } = await supabase.from("song_provenance" as never).select("source_url,rights_basis,rights_details").eq("song_id", songId).maybeSingle();
    if (error) throw error;
    return data as Provenance | null;
  } });
  const save = async () => {
    setSaving(true);
    try { await songRpc("set_song_provenance", { p_song_id: songId, p_source_url: form.source_url, p_rights_basis: form.rights_basis, p_rights_details: form.rights_details }); await query.refetch(); setOpen(false); toast({ title: "Origem registrada" }); }
    catch (error) { toast({ title: "Não foi possível salvar", description: (error as Error).message, variant: "destructive" }); }
    finally { setSaving(false); }
  };
  return <section className="space-y-2 rounded-card bg-card p-4">
    <h3 className="text-subhead font-semibold">Origem e direitos</h3>
    <p className="text-footnote text-muted-foreground">{query.isError ? "Não foi possível consultar a origem." : bases[(query.data?.rights_basis ?? "unknown") as keyof typeof bases]}. Declaração de quem cadastrou; a plataforma não certifica a licença.</p>
    {query.data?.source_url && <a href={query.data.source_url} target="_blank" rel="noopener noreferrer" className="block truncate text-subhead text-primary">Consultar fonte</a>}
    {!readOnly && <Button variant="outline" size="sm" disabled={query.isPending || query.isError} onClick={() => { setForm(query.data ?? { source_url: "", rights_basis: "unknown", rights_details: "" }); setOpen(true); }}>Registrar origem</Button>}
    <Dialog open={open} onOpenChange={(next) => { if (!saving) setOpen(next); }}><DialogContent><DialogHeader><DialogTitle>Origem da música</DialogTitle></DialogHeader><DialogDescription>Estar em um site público não significa domínio público. Considere os direitos da composição, letra e gravação.</DialogDescription>
      <label htmlFor={`source-${songId}`}>Fonte (opcional)</label><Input id={`source-${songId}`} type="url" maxLength={2000} value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} placeholder="https://" />
      <label htmlFor={`basis-${songId}`}>Autorização</label><select id={`basis-${songId}`} value={form.rights_basis} onChange={(e) => setForm({ ...form, rights_basis: e.target.value })} className="h-11 rounded-md border bg-background px-3">{Object.entries(bases).map(([key,name]) => <option key={key} value={key}>{name}</option>)}</select>
      <label htmlFor={`rights-${songId}`}>Titular, licença e condições</label><Textarea id={`rights-${songId}`} maxLength={2000} value={form.rights_details} onChange={(e) => setForm({ ...form, rights_details: e.target.value })} />
      <Button disabled={saving || (form.rights_basis !== "unknown" && !form.rights_details.trim())} onClick={() => void save()}>{saving ? "Salvando…" : "Salvar declaração"}</Button>
    </DialogContent></Dialog>
  </section>;
}
