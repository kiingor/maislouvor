import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogToolbar } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff } from "lucide-react";
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
  /** Remove o membro da equipe atual (mostra a linha destrutiva no fim da folha, com confirmação). */
  onRemove?: () => void;
}

const LEVELS = [
  { value: "aprendendo", label: "Aprendendo" },
  { value: "intermediario", label: "Intermediário" },
  { value: "avancado", label: "Avançado" },
];

/* Grupos dentro da folha: a folha já redefine --card (claro: branco; escuro: #2C2C2E). */
const GROUP = "overflow-hidden rounded-card bg-card";
const GROUP_LABEL = "mx-4 mb-1.5 text-footnote text-muted-foreground";
const GROUP_FOOTER = "mx-4 mt-1.5 text-footnote text-muted-foreground";
const INPUT =
  "h-[52px] min-w-0 flex-1 bg-transparent text-body text-foreground placeholder:text-label-tertiary focus-visible:outline-offset-[-3px]";

function FieldRow({ id, label, trailing, children }: { id: string; label: ReactNode; trailing?: ReactNode; children: ReactNode }) {
  return (
    <div className="ml-4 flex min-h-[52px] items-center gap-3 pr-4">
      <label htmlFor={id} className="w-[7.5rem] shrink-0 py-2 text-body leading-[20px]">
        {label}
      </label>
      {children}
      {trailing}
    </div>
  );
}

export function MemberEditModal({
  open,
  onOpenChange,
  member,
  currentTeamId,
  adminTeams,
  canSetPassword,
  onSaved,
  onRemove,
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
      <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
        <DialogToolbar
          title={`Editar ${name}`}
          confirm={{ label: "Salvar", onClick: handleSave, disabled: saving || loading, loading: saving }}
        />

        <Tabs defaultValue="geral" className="min-w-0">
          <TabsList className="flex w-full">
            <TabsTrigger value="geral" className="flex-1">Geral</TabsTrigger>
            <TabsTrigger value="permissoes" className="flex-1">Permissões</TabsTrigger>
            <TabsTrigger value="instrumentos" className="flex-1">Instrumentos</TabsTrigger>
          </TabsList>

          {/* A própria folha rola (sem área de rolagem aninhada). */}
          <div className="pb-2 pt-5">
            {/* ===== ABA: GERAL ===== */}
            <TabsContent value="geral" className="mt-0 space-y-6">
              <section>
                <div className={cn(GROUP, "divide-y divide-separator")}>
                  <FieldRow id="member-edit-name" label="Nome completo">
                    <input
                      id="member-edit-name"
                      className={INPUT}
                      autoComplete="off"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </FieldRow>

                  {canSetPassword && (
                    <FieldRow
                      id="member-edit-password"
                      label={
                        <>
                          Nova senha
                          <span className="block text-footnote text-muted-foreground">(opcional)</span>
                        </>
                      }
                      trailing={
                        <button
                          type="button"
                          aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                          aria-pressed={showPassword}
                          className="-mr-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" /> : <Eye className="h-[18px] w-[18px]" aria-hidden="true" />}
                        </button>
                      }
                    >
                      <input
                        id="member-edit-password"
                        className={INPUT}
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        aria-describedby="member-edit-password-hint"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        minLength={6}
                      />
                    </FieldRow>
                  )}
                </div>
                {canSetPassword && (
                  <p id="member-edit-password-hint" className={GROUP_FOOTER}>
                    Deixe vazio para manter a senha atual.
                  </p>
                )}
              </section>

              {/* Tipo / grupo */}
              <section>
                <p id="member-edit-role-label" className={GROUP_LABEL}>Tipo (grupo de permissões)</p>
                <div className={GROUP}>
                  <Select value={role} onValueChange={handleRoleChange}>
                    <SelectTrigger
                      aria-labelledby="member-edit-role-label"
                      className="h-[52px] rounded-none bg-transparent px-4 active:bg-fill-quaternary data-[state=open]:bg-fill-quaternary"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">{ROLE_LABELS.admin} — acesso total</SelectItem>
                      <SelectItem value="editor">{ROLE_LABELS.editor} — edita conteúdo</SelectItem>
                      <SelectItem value="viewer">{ROLE_LABELS.viewer} — só visualiza</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className={GROUP_FOOTER}>
                  Trocar o tipo redefine as permissões (aba <strong className="font-semibold">Permissões</strong>) para o padrão dele. Depois você pode personalizar.
                </p>
              </section>

              {/* Equipes */}
              {showTeams && (
                <section>
                  <p className={GROUP_LABEL}>Equipes</p>
                  <div className={cn(GROUP, "divide-y divide-separator")}>
                    {adminTeams.map((t) => {
                      const isCurrent = t.id === currentTeamId;
                      return (
                        <label
                          key={t.id}
                          className={cn(
                            "ml-4 flex min-h-[48px] items-center gap-3 py-2 pr-4",
                            isCurrent || loading ? "cursor-default" : "cursor-pointer",
                          )}
                        >
                          <span className="min-w-0 flex-1 text-body">{t.name}</span>
                          {isCurrent && <span className="text-footnote text-muted-foreground">(atual)</span>}
                          <Checkbox
                            checked={selectedTeams.has(t.id)}
                            disabled={isCurrent || loading}
                            onCheckedChange={() => toggleTeam(t.id)}
                          />
                        </label>
                      );
                    })}
                  </div>
                  <p className={GROUP_FOOTER}>
                    Marque as equipes das quais este membro participa. Ele verá apenas as equipes marcadas.
                  </p>
                </section>
              )}

              {onRemove && (
                <div className={cn(GROUP, "mt-8")}>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        type="button"
                        disabled={saving || loading}
                        className="flex min-h-[50px] w-full items-center justify-center px-4 text-body text-ios-red transition-[background-color,opacity] active:bg-fill-quaternary disabled:opacity-40"
                      >
                        Remover membro
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover membro?</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-ios-red text-white hover:bg-ios-red/90"
                          onClick={() => { onRemove(); onOpenChange(false); }}
                        >
                          Remover
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </TabsContent>

            {/* ===== ABA: PERMISSÕES ===== */}
            <TabsContent value="permissoes" className="mt-0">
              <div className="mx-4 mb-1.5 flex items-end justify-between gap-3">
                <p className="text-footnote text-muted-foreground">Permissões de {ROLE_LABELS[role]}</p>
                {!isAdminRole && (
                  <div className="flex shrink-0 gap-2 text-footnote text-muted-foreground" aria-hidden="true">
                    <span className="w-11 text-center">Ver</span>
                    <span className="w-11 text-center">Editar</span>
                  </div>
                )}
              </div>

              {isAdminRole ? (
                <div className={cn(GROUP, "px-4 py-3.5 text-subhead text-muted-foreground")}>
                  Líder tem acesso total a tudo. Para limitar, mude o <strong className="font-semibold text-foreground">Tipo</strong> (aba Geral) para <strong className="font-semibold text-foreground">Editor</strong> ou <strong className="font-semibold text-foreground">Membro</strong>.
                </div>
              ) : (
                <div className={cn(GROUP, "divide-y divide-separator")}>
                  {RESOURCES.map((r) => (
                    <div key={r.key} className="ml-4 flex min-h-[56px] items-center gap-2 py-2 pr-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-body">{r.label}</p>
                        <p className="text-footnote text-muted-foreground">
                          {r.showVer ? `${r.verLabel} · ` : ""}{r.editarLabel}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <div className="flex w-11 justify-center">
                          {r.showVer ? (
                            <Checkbox
                              aria-label={`${r.verLabel} ${r.label}`}
                              checked={matrix[r.key].ver}
                              onCheckedChange={() => toggleCell(r.key, "ver")}
                            />
                          ) : (
                            <span className="text-footnote text-label-tertiary" aria-hidden="true">—</span>
                          )}
                        </div>
                        <div className="flex w-11 justify-center">
                          <Checkbox
                            aria-label={`${r.editarLabel} ${r.label}`}
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
            <TabsContent value="instrumentos" className="mt-0">
              <div className={cn(GROUP, "p-4")}>
                <InstrumentPicker selected={instruments} onToggle={toggleInstrument} />
              </div>

              {instruments.length > 0 ? (
                <section className="mt-6">
                  <p className={GROUP_LABEL}>Nível em cada função</p>
                  <div className={GROUP}>
                    {instruments.map((inst) => {
                      const Icon = instrumentIcon(inst);
                      return (
                        <div key={inst} className="group/row flex items-center gap-3 pl-4">
                          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-fill-tertiary text-muted-foreground">
                            <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                          </span>
                          <div className="flex min-h-[52px] min-w-0 flex-1 items-center gap-2 border-t border-separator py-1 pr-2 group-first/row:border-t-0">
                            <span className="min-w-0 flex-1 truncate text-body">{inst}</span>
                            <Select value={instrumentLevels[inst] ?? ""} onValueChange={(v) => setLevel(inst, v)}>
                              <SelectTrigger
                                aria-label={`Nível em ${inst}`}
                                className="h-11 w-auto shrink-0 bg-transparent pl-2 pr-2 text-muted-foreground active:bg-fill-quaternary data-[state=open]:bg-fill-quaternary data-[placeholder]:text-label-tertiary"
                              >
                                <SelectValue placeholder="Nível" />
                              </SelectTrigger>
                              <SelectContent>
                                {LEVELS.map((l) => (
                                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : (
                <p className={GROUP_FOOTER}>
                  Selecione as vozes e os instrumentos que este membro faz.
                </p>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
