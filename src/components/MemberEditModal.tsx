import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GlassInput } from "@/components/GlassInput";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Users, ShieldCheck, KeyRound, Music, User } from "lucide-react";
import { instrumentIcon } from "@/data/instruments";
import { InstrumentPicker } from "@/components/InstrumentPicker";
import { cn } from "@/lib/utils";
import {
  RESOURCES,
  ROLE_LABELS,
  effectiveMatrix,
  diffOverrides,
  parseOverrides,
  type PermAction,
  type PermResource,
  type PermRole,
} from "@/lib/permissions";

interface MemberRow {
  id: string;
  role: PermRole;
  profile_id: string;
  permissions?: unknown;
  instruments?: string[] | null;
  instrument_levels?: Record<string, string> | null;
  profiles?: { id: string; full_name?: string | null; user_id: string } | null;
}

interface TeamLite {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  member: MemberRow | null;
  currentTeamId: string;
  /** Equipes onde QUEM gerencia é líder (pode adicionar/remover o membro). */
  adminTeams: TeamLite[];
  /** Quem está editando pode definir/alterar a senha do membro. */
  canSetPassword: boolean;
  onSaved: () => void;
}

const LEVELS = [
  { value: "aprendendo", label: "Aprendendo" },
  { value: "intermediario", label: "Intermediário" },
  { value: "avancado", label: "Avançado" },
];

export function MemberEditModal({
  open,
  onOpenChange,
  member,
  currentTeamId,
  adminTeams,
  canSetPassword,
  onSaved,
}: Props) {
  const { toast } = useToast();

  // Dados
  const [fullName, setFullName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Tipo / permissões
  const [role, setRole] = useState<PermRole>("viewer");
  const [matrix, setMatrix] = useState<Record<PermResource, Record<PermAction, boolean>>>(
    () => effectiveMatrix("viewer", {})
  );

  // Instrumentos
  const [instruments, setInstruments] = useState<string[]>([]);
  const [instrumentLevels, setInstrumentLevels] = useState<Record<string, string>>({});

  // Equipes (team_id -> team_members.id do membro nas equipes que administro)
  const [memberOf, setMemberOf] = useState<Record<string, string>>({});
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const profile = member?.profiles ?? null;
  const name = profile?.full_name ?? "Membro";
  const isAdminRole = role === "admin";
  const showTeams = adminTeams.length > 1;

  // (Re)inicializa estado ao abrir
  useEffect(() => {
    if (!open || !member) return;
    setFullName(member.profiles?.full_name ?? "");
    setNewPassword("");
    setShowPassword(false);
    setRole(member.role);
    setMatrix(effectiveMatrix(member.role, parseOverrides(member.permissions)));
    setInstruments(member.instruments ?? []);
    setInstrumentLevels(member.instrument_levels ?? {});

    let cancelled = false;
    (async () => {
      if (!showTeams) return;
      setLoading(true);
      const adminTeamIds = adminTeams.map((t) => t.id);
      const { data } = await supabase
        .from("team_members")
        .select("id, team_id")
        .eq("profile_id", member.profile_id)
        .in("team_id", adminTeamIds);
      if (cancelled) return;
      const map: Record<string, string> = {};
      (data ?? []).forEach((row: any) => { map[row.team_id] = row.id; });
      setMemberOf(map);
      setSelectedTeams(new Set(Object.keys(map)));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, member, adminTeams, showTeams]);

  const handleRoleChange = (value: string) => {
    const r = value as PermRole;
    setRole(r);
    // Trocar de grupo reinicia a matriz para os padrões do preset (limpa exceções).
    setMatrix(effectiveMatrix(r, {}));
  };

  const toggleCell = (resource: PermResource, action: PermAction) => {
    setMatrix((prev) => ({
      ...prev,
      [resource]: { ...prev[resource], [action]: !prev[resource][action] },
    }));
  };

  const toggleInstrument = (inst: string) => {
    setInstruments((prev) =>
      prev.includes(inst) ? prev.filter((i) => i !== inst) : [...prev, inst]
    );
  };

  const setLevel = (inst: string, level: string) => {
    setInstrumentLevels((prev) => ({ ...prev, [inst]: level }));
  };

  const toggleTeam = (teamId: string) => {
    setSelectedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  const handleSave = async () => {
    if (!member || !profile) return;

    const nameChanged = fullName.trim() !== (profile.full_name ?? "");
    const passwordChanged = newPassword.trim().length > 0;
    if (passwordChanged && newPassword.length < 6) {
      toast({ title: "Senha muito curta", description: "Mínimo 6 caracteres.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      // 1) Nome / senha — via edge function admin-update-user
      if (nameChanged || passwordChanged) {
        const { data, error } = await supabase.functions.invoke("admin-update-user", {
          body: {
            user_id: profile.user_id,
            ...(nameChanged ? { full_name: fullName.trim() } : {}),
            ...(passwordChanged ? { password: newPassword } : {}),
          },
        });
        if (error || (data as any)?.error) {
          throw new Error((data as any)?.error || error?.message || "Erro ao atualizar dados");
        }
      }

      // 2) Tipo + permissões + instrumentos + níveis na equipe atual
      const overrides = isAdminRole ? {} : diffOverrides(role, matrix);
      const { error: upErr } = await supabase
        .from("team_members")
        .update({
          role,
          permissions: overrides,
          instruments,
          instrument_levels: instrumentLevels,
        } as any)
        .eq("id", member.id);
      if (upErr) throw upErr;

      // 3) Equipes (adicionar/remover nas equipes que administro)
      if (showTeams) {
        for (const t of adminTeams) {
          const existingId = memberOf[t.id];
          const want = selectedTeams.has(t.id);
          if (want && !existingId) {
            const { error } = await supabase
              .from("team_members")
              .insert({ team_id: t.id, profile_id: member.profile_id, role: "viewer" } as any);
            if (error) throw error;
          } else if (!want && existingId && t.id !== currentTeamId) {
            const { error } = await supabase.from("team_members").delete().eq("id", existingId);
            if (error) throw error;
          }
        }
      }

      toast({ title: "Membro atualizado!", description: `Dados de ${name} salvos.` });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass rounded-2xl border-0 sm:max-w-lg p-0">
        <DialogHeader className="p-5 pb-3">
          <DialogTitle className="text-lg font-semibold">Editar {name}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="geral" className="px-5">
          <TabsList className="w-full">
            <TabsTrigger value="geral" className="flex-1 gap-1.5">
              <User className="h-3.5 w-3.5" /> Geral
            </TabsTrigger>
            <TabsTrigger value="permissoes" className="flex-1 gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> Permissões
            </TabsTrigger>
            <TabsTrigger value="instrumentos" className="flex-1 gap-1.5">
              <Music className="h-3.5 w-3.5" /> Instrumentos
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="max-h-[60vh] mt-4">
            {/* ===== ABA: GERAL ===== */}
            <TabsContent value="geral" className="mt-0 space-y-6 pb-1">
              {/* Dados */}
              <section className="space-y-3">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Nome completo
                  </label>
                  <GlassInput value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>

                {canSetPassword && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <KeyRound className="h-3 w-3" /> Nova senha (opcional)
                    </label>
                    <div className="relative">
                      <GlassInput
                        type={showPassword ? "text" : "password"}
                        placeholder="Deixe vazio para manter"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        minLength={6}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* Tipo / grupo */}
              <section className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Tipo (grupo de permissões)
                </label>
                <Select value={role} onValueChange={handleRoleChange}>
                  <SelectTrigger className="h-11 rounded-xl glass-input border-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{ROLE_LABELS.admin} — acesso total</SelectItem>
                    <SelectItem value="editor">{ROLE_LABELS.editor} — edita conteúdo</SelectItem>
                    <SelectItem value="viewer">{ROLE_LABELS.viewer} — só visualiza</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Trocar o tipo redefine as permissões (aba <strong>Permissões</strong>) para o padrão dele. Depois você pode personalizar.
                </p>
              </section>

              {/* Equipes */}
              {showTeams && (
                <section className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="h-3 w-3" /> Equipes
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    Marque as equipes das quais este membro participa. Ele verá apenas as equipes marcadas.
                  </p>
                  <div className="space-y-1.5">
                    {adminTeams.map((t) => {
                      const isCurrent = t.id === currentTeamId;
                      return (
                        <label
                          key={t.id}
                          className="flex items-center gap-3 rounded-xl glass-input px-3 py-2.5 cursor-pointer"
                        >
                          <Checkbox
                            checked={selectedTeams.has(t.id)}
                            disabled={isCurrent || loading}
                            onCheckedChange={() => toggleTeam(t.id)}
                          />
                          <span className="text-sm flex-1">{t.name}</span>
                          {isCurrent && <span className="text-[10px] text-muted-foreground">(atual)</span>}
                        </label>
                      );
                    })}
                  </div>
                </section>
              )}
            </TabsContent>

            {/* ===== ABA: PERMISSÕES ===== */}
            <TabsContent value="permissoes" className="mt-0 space-y-2 pb-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Permissões de {ROLE_LABELS[role]}
                </label>
                {!isAdminRole && (
                  <div className="flex gap-4 text-[10px] font-medium text-muted-foreground uppercase tracking-wider pr-1">
                    <span className="w-10 text-center">Ver</span>
                    <span className="w-10 text-center">Editar</span>
                  </div>
                )}
              </div>

              {isAdminRole ? (
                <div className="rounded-xl glass-input px-4 py-4 text-sm text-muted-foreground">
                  Líder tem acesso total a tudo. Para limitar, mude o <strong>Tipo</strong> (aba Geral) para <strong>Editor</strong> ou <strong>Membro</strong>.
                </div>
              ) : (
                <div className="space-y-1">
                  {RESOURCES.map((r) => (
                    <div key={r.key} className="flex items-center gap-2 rounded-xl glass-input px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight">{r.label}</p>
                        <p className="text-[10px] text-muted-foreground leading-tight">
                          {r.showVer ? `${r.verLabel} · ` : ""}{r.editarLabel}
                        </p>
                      </div>
                      <div className="flex gap-4 items-center">
                        <div className="w-10 flex justify-center">
                          {r.showVer ? (
                            <Checkbox
                              checked={matrix[r.key].ver}
                              onCheckedChange={() => toggleCell(r.key, "ver")}
                            />
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          )}
                        </div>
                        <div className="w-10 flex justify-center">
                          <Checkbox
                            checked={matrix[r.key].editar}
                            onCheckedChange={() => toggleCell(r.key, "editar")}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ===== ABA: INSTRUMENTOS ===== */}
            <TabsContent value="instrumentos" className="mt-0 space-y-3 pb-1">
              <InstrumentPicker selected={instruments} onToggle={toggleInstrument} />

              {instruments.length > 0 ? (
                <div className="space-y-2 pt-2 border-t border-border/50">
                  <p className="text-xs text-muted-foreground">Nível em cada função:</p>
                  {instruments.map((inst) => {
                    const Icon = instrumentIcon(inst);
                    return (
                      <div key={inst} className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium flex items-center gap-1.5 min-w-0">
                          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{inst}</span>
                        </span>
                        <Select value={instrumentLevels[inst] ?? ""} onValueChange={(v) => setLevel(inst, v)}>
                          <SelectTrigger className="h-9 w-36 rounded-lg text-xs shrink-0">
                            <SelectValue placeholder="Nível" />
                          </SelectTrigger>
                          <SelectContent>
                            {LEVELS.map((l) => (
                              <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground pt-1">
                  Selecione as vozes e os instrumentos que este membro faz.
                </p>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <div className="p-5 pt-3">
          <Button onClick={handleSave} disabled={saving || loading} className="w-full h-11 rounded-xl text-sm font-semibold">
            {saving ? <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" /> : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
