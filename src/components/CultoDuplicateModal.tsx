import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { Dialog, DialogContent, DialogToolbar } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { DateField } from "@/components/DateField";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  // culto de origem (precisa pelo menos de id, name, date)
  sourceCulto: any | null;
}

// Formulário agrupado dentro da folha (protótipo `.group` / `.group-label`).
// Na folha, --card já vira branco (claro) / #2C2C2E (escuro) — ver ui/dialog.tsx.
const group = "overflow-hidden rounded-card bg-card";
const groupLabel = "mx-4 mb-1.5 block text-footnote text-muted-foreground";
const row = "relative flex min-h-[48px] items-center gap-3 px-4";
const rowSeparator = "before:absolute before:top-0 before:right-0 before:left-4 before:border-t before:border-border";
const fieldInput = "min-w-0 flex-1 bg-transparent py-3 text-body text-foreground placeholder:text-label-tertiary focus-visible:outline-none";
// Foco de teclado nas linhas com campo de texto: anel interno na linha inteira (o contorno global
// de :focus-visible seria cortado pelo overflow do grupo). Some no toque, como a regra global (.pointer-mode).
const keyboardFocusRow =
  "[html:not(.pointer-mode)_&:focus-within]:ring-[3px] [html:not(.pointer-mode)_&:focus-within]:ring-inset [html:not(.pointer-mode)_&:focus-within]:ring-ios-blue";


export function CultoDuplicateModal({ open, onOpenChange, sourceCulto }: Props) {
  const { currentTeam, profileId } = useTeam();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [copySongs, setCopySongs] = useState(true);
  const [copyBlocks, setCopyBlocks] = useState(true);
  const [copyLineup, setCopyLineup] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && sourceCulto) {
      setName(`${sourceCulto.name} (cópia)`);
      setDate(sourceCulto.date || "");
      setCopySongs(true);
      setCopyBlocks(true);
      setCopyLineup(false);
    }
  }, [open, sourceCulto]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTeam || !sourceCulto || !name.trim() || !date) return;
    setSaving(true);

    try {
      // 1) Cria o culto novo
      const { data: newCulto, error: cErr } = await supabase
        .from("cultos")
        .insert({
          name: name.trim(),
          date,
          description: sourceCulto.description || null,
          team_id: currentTeam.id,
          created_by: profileId,
        } as any)
        .select("id")
        .single();

      if (cErr || !newCulto) throw cErr || new Error("Falha ao criar culto");
      const newId = (newCulto as any).id;

      // 2) Copia músicas (culto_songs)
      if (copySongs) {
        const { data: songs } = await supabase
          .from("culto_songs")
          .select("song_id, sort_order, notes, key_override")
          .eq("culto_id", sourceCulto.id)
          .order("sort_order", { ascending: true });
        if (songs && songs.length > 0) {
          const rows = songs.map((s: any) => ({
            culto_id: newId,
            song_id: s.song_id,
            sort_order: s.sort_order,
            notes: s.notes ?? null,
            key_override: s.key_override ?? null,
          }));
          await supabase.from("culto_songs").insert(rows as any);
        }
      }

      // 3) Copia roteiro (culto_blocks)
      if (copyBlocks) {
        const { data: blocks } = await supabase
          .from("culto_blocks" as any)
          .select("title, kind, duration_min, notes, sort_order")
          .eq("culto_id", sourceCulto.id)
          .order("sort_order", { ascending: true });
        if (blocks && blocks.length > 0) {
          const rows = blocks.map((b: any) => ({
            culto_id: newId,
            title: b.title,
            kind: b.kind,
            duration_min: b.duration_min,
            notes: b.notes ?? null,
            sort_order: b.sort_order,
          }));
          await supabase.from("culto_blocks" as any).insert(rows as any);
        }
      }

      // 4) Copia escala (culto_lineup) com status='pending'
      if (copyLineup) {
        const { data: lineup } = await supabase
          .from("culto_lineup")
          .select("team_member_id, instrument")
          .eq("culto_id", sourceCulto.id);
        if (lineup && lineup.length > 0) {
          const rows = lineup.map((l: any) => ({
            culto_id: newId,
            team_member_id: l.team_member_id,
            instrument: l.instrument,
            status: "pending",
          }));
          await supabase.from("culto_lineup").insert(rows as any);
        }
      }

      toast({ title: "Culto duplicado!" });
      qc.invalidateQueries({ queryKey: ["cultos"] });
      onOpenChange(false);
      navigate(`/app/cultos/${newId}`);
    } catch (err: any) {
      toast({ title: "Erro ao duplicar", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const copyOptions = [
    { id: "dup-copy-songs", label: "Copiar músicas", hint: "tom e notas", value: copySongs, set: setCopySongs },
    { id: "dup-copy-blocks", label: "Copiar roteiro", hint: "momentos", value: copyBlocks, set: setCopyBlocks },
    { id: "dup-copy-lineup", label: "Copiar escala", hint: "como pendente", value: copyLineup, set: setCopyLineup },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogToolbar
          title="Duplicar culto"
          confirm={{
            label: "Duplicar",
            type: "submit",
            form: "culto-duplicate-form",
            disabled: saving || !name.trim() || !date,
            loading: saving,
          }}
        />
        <form id="culto-duplicate-form" onSubmit={handleSubmit} className="space-y-6">
          <div className={group}>
            <div className={`${row} ${keyboardFocusRow}`}>
              <label htmlFor="dup-name" className="w-20 shrink-0 text-body text-foreground">Nome</label>
              <input
                id="dup-name"
                placeholder="Nome do novo culto"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                className={fieldInput}
              />
            </div>
            <div className={`${row} ${rowSeparator} justify-between`}>
              <label htmlFor="dup-date" className="text-body text-foreground">Data</label>
              <DateField id="dup-date" value={date} onChange={setDate} required />
            </div>
          </div>

          <div>
            <p className={groupLabel} id="dup-copy-label">O que copiar</p>
            <div className={group} role="group" aria-labelledby="dup-copy-label">
              {copyOptions.map((o, i) => (
                <div key={o.id} className={`${row} min-h-[56px] py-2 ${i > 0 ? rowSeparator : ""}`}>
                  <label htmlFor={o.id} className="min-w-0 flex-1 cursor-pointer">
                    <span className="block text-body text-foreground">{o.label}</span>
                    <span className="block text-footnote text-muted-foreground">{o.hint}</span>
                  </label>
                  <Switch id={o.id} checked={o.value} onCheckedChange={(v) => o.set(!!v)} />
                </div>
              ))}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
