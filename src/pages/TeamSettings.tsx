import { useState, useRef, useEffect, useMemo, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { PageHeader } from "@/components/shell/PageHeader";
import { RoleBadge } from "@/components/RoleBadge";
import { InviteMemberModal } from "@/components/InviteMemberModal";
import { MemberEditModal } from "@/components/MemberEditModal";
import { AvatarCropModal } from "@/components/AvatarCropModal";
import { MyAvailabilityCalendar } from "@/components/MyAvailabilityCalendar";
import { UserNotificationPrefs } from "@/components/UserNotificationPrefs";
import { FaceIdSettings } from "@/components/FaceIdSettings";
import { UserStatsCard } from "@/components/UserStatsCard";
import { TeamAvailabilitySettings } from "@/components/TeamAvailabilitySettings";
import { MyAssistantSettings, TeamAssistantSettings } from "@/components/AssistantSettings";
import { SettingsAboutGroup } from "@/components/legal/SettingsAboutGroup";
import { DeleteAccountSection } from "@/components/account/DeleteAccountSection";
import { BlockedUsersSettings } from "@/components/BlockedUsersSettings";
import { TeamChatReports } from "@/components/TeamChatReports";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AppearanceSegmented } from "@/components/AppearanceControl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { UserRound, UserPlus, Trash2, Camera, KeyRound, Mail, Phone, Copy, Check, RefreshCw, ChevronRight, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { instrumentIcon } from "@/data/instruments";
import { InstrumentPicker } from "@/components/InstrumentPicker";
import { cn } from "@/lib/utils";
import { DELETE_ACCOUNT_ANCHOR } from "@/lib/legal";
import { personalAvailabilityLabel } from "@/lib/availability";
import TeamBilling from "@/components/billing/TeamBilling";

/* ------------------------------------------------------------------
   Peças de lista agrupada no estilo do app Ajustes (iOS 27).
   ------------------------------------------------------------------ */

const GROUP = "overflow-hidden rounded-card bg-card";
const GROUP_LABEL = "mx-4 mb-1.5 text-footnote text-muted-foreground";
const GROUP_FOOTER = "mx-4 mt-1.5 text-footnote text-muted-foreground";
/** Conteúdo da linha: o separador começa no texto (recuo de 58pt) e some na primeira linha. */
const ROW_BODY = "flex min-h-[52px] min-w-0 flex-1 items-center gap-3 border-t border-separator py-2 pr-4 group-first/row:border-t-0";

/** Quadrado de 30pt neutro (preenchimento terciário); cor só quando a linha indica um status. */
function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span className={cn("flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-fill-tertiary text-muted-foreground", className)}>
      <Icon className="h-[17px] w-[17px]" strokeWidth={2.25} aria-hidden="true" />
    </span>
  );
}

function Row({ leading, children, className }: { leading: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className="group/row flex items-center gap-3 pl-4">
      {leading}
      <div className={cn(ROW_BODY, className)}>{children}</div>
    </div>
  );
}

/** Confirmar edição inline: círculo proeminente de 30pt com alvo de toque de 44pt. */
function InlineConfirm({ label, onClick, saving }: { label: string; onClick: () => void; saving: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      aria-label={label}
      className="relative flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-prominent text-prominent-foreground transition-[opacity,transform] active:scale-95 disabled:opacity-50 before:absolute before:-inset-[7px] before:content-['']"
    >
      {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" strokeWidth={2.75} aria-hidden="true" />}
    </button>
  );
}

/** Botão circular cinza de 44pt (ações dentro de cards; vidro fica só na camada funcional). */
const CIRCLE_BUTTON =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fill-tertiary text-foreground transition-[background-color,transform] hover:bg-fill-secondary active:scale-95";

const CAPSULE_SM =
  "relative inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3.5 text-subhead font-semibold transition-[background-color,transform] active:scale-[0.97] before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']";

const INLINE_INPUT =
  "h-9 min-w-0 flex-1 bg-transparent text-right text-body text-foreground placeholder:text-label-tertiary focus-visible:outline-offset-[-3px]";

/** Campo + confirmar quebram juntos para a linha de baixo quando o rótulo não deixa espaço (320pt). */
const INLINE_FIELD = "flex min-w-[7.5rem] flex-1 items-center justify-end gap-2";

export default function TeamSettings() {
  const { currentTeam, isAdmin, profileId, teams, can, refetch, switchTeam } = useTeam();
  const canManageMembers = can("membros", "editar");
  // Memorizado: um array novo a cada render reiniciava o formulário aberto no MemberEditModal.
  const adminTeams = useMemo(
    () => teams.filter((t) => t.role === "admin").map((t) => ({ id: t.id, name: t.name })),
    [teams],
  );
  const [inviteOpen, setInviteOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const linkedTab = searchParams.get("billing") === "return" ? "billing"
    : searchParams.get("aba") === "assinatura" ? "billing"
    : searchParams.get("aba") === "membros" ? "members" : "profile";
  const [activeTab, setActiveTab] = useState(linkedTab);
  useEffect(() => {
    setActiveTab(location.hash === `#${DELETE_ACCOUNT_ANCHOR}` ? "profile" : linkedTab);
  }, [linkedTab, location.hash, location.key]);
  const [requestedSeats, setRequestedSeats] = useState<number>();
  const changeTab = (tab: string) => {
    if (tab === 'billing' && activeTab !== 'billing') setRequestedSeats(undefined);
    setActiveTab(tab);
  };
  const [editMember, setEditMember] = useState<any | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  // Aviso de denúncia no chat abre direto na aba Membros (?aba=membros), na
  // equipe da denúncia (&equipe=<id>) para quem lidera mais de uma.
  const linkedTeamId = searchParams.get("equipe");
  useEffect(() => {
    if (!linkedTeamId || !teams.some((t) => t.id === linkedTeamId)) return;
    if (currentTeam?.id !== linkedTeamId) switchTeam(linkedTeamId);
    // Usado uma vez: trocar de equipe à mão depois não volta para esta.
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("equipe");
        return next;
      },
      { replace: true },
    );
  }, [linkedTeamId, teams, currentTeam?.id, switchTeam, setSearchParams]);

  // Current user email
  const [userEmail, setUserEmail] = useState("");
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUserEmail(data.user?.email ?? "");
      setAuthUserId(data.user?.id ?? null);
    });
    return () => { active = false; };
  }, []);

  // Editable name state
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Editable phone state
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneValue, setPhoneValue] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["team-members", currentTeam?.id],
    queryFn: async () => {
      if (!currentTeam) return [];
      const { data } = await supabase
        .from("team_members")
        .select("id, role, permissions, profile_id, instruments, instrument_levels, profiles(id, full_name, user_id, avatar_url, phone, notification_prefs)" as any)
        .eq("team_id", currentTeam.id);
      return data ?? [];
    },
    enabled: !!currentTeam,
  });

  // O perfil da conta não depende de ter uma equipe acessível. A RLS permite
  // ler o próprio perfil mesmo quando a participação ainda aguarda autorização.
  const ownProfile = useQuery({
    queryKey: ["my-profile", authUserId],
    enabled: !!authUserId,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles")
        .select("id, full_name, user_id, avatar_url, phone, notification_prefs")
        .eq("user_id", authUserId!).single();
      if (error) throw error;
      if (!data) throw new Error("Perfil indisponível");
      return data;
    },
  });
  const myMember: any = members.find((m: any) => m.profile_id === profileId);
  const myProfile = ownProfile.data ?? (myMember ? (myMember as any).profiles : null);
  const myInstruments: string[] = (myMember as any)?.instruments || [];
  const myInstrumentLevels: Record<string, string> = (myMember as any)?.instrument_levels || {};
  const myNotificationPrefs = (myProfile as any)?.notification_prefs ?? null;

  // Init name value when profile loads
  useEffect(() => {
    if (myProfile?.full_name && !editingName) {
      setNameValue(myProfile.full_name);
    }
  }, [myProfile?.full_name]);

  // Init phone value when profile loads
  useEffect(() => {
    if (!editingPhone) {
      setPhoneValue((myProfile as any)?.phone ?? "");
    }
  }, [(myProfile as any)?.phone]);

  const { data: invites = [] } = useQuery({
    queryKey: ["team-invites", currentTeam?.id],
    queryFn: async () => {
      if (!currentTeam) return [];
      const { data } = await supabase
        .from("team_invites")
        .select("*")
        .eq("team_id", currentTeam.id)
        .eq("accepted", false);
      return data ?? [];
    },
    enabled: !!currentTeam && canManageMembers,
  });

  // Código de convite da equipe
  const { data: teamCode } = useQuery({
    queryKey: ["team-code", currentTeam?.id],
    queryFn: async () => {
      if (!currentTeam) return null;
      const { data } = await supabase.from("teams").select("join_code").eq("id", currentTeam.id).single();
      return (data as any)?.join_code ?? null;
    },
    enabled: !!currentTeam && canManageMembers,
  });

  // Solicitações de entrada pendentes (via RPC — traz o nome do solicitante)
  const { data: joinRequests = [] } = useQuery({
    queryKey: ["join-requests", currentTeam?.id],
    queryFn: async () => {
      if (!currentTeam) return [];
      const { data } = await (supabase as any).rpc("list_join_requests", { p_team_id: currentTeam.id });
      return data ?? [];
    },
    enabled: !!currentTeam && canManageMembers,
  });

  const [copied, setCopied] = useState(false);
  const handleCopyCode = async () => {
    if (!teamCode) return;
    try { await navigator.clipboard.writeText(teamCode); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerateCode = async () => {
    if (!currentTeam) return;
    const { data, error } = await (supabase as any).rpc("regenerate_team_code", { p_team_id: currentTeam.id });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["team-code"] });
    toast({ title: "Novo código gerado!", description: `Agora é ${data}. Compartilhe o novo com a equipe.` });
  };

  const handleApproveRequest = async (id: string) => {
    const { data, error } = await (supabase as any).rpc("approve_join_request", { p_request_id: id });
    if (error || !data?.ok) {
      toast({ title: "Erro ao aprovar", description: error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "Membro aprovado!" });
    qc.invalidateQueries({ queryKey: ["join-requests"] });
    qc.invalidateQueries({ queryKey: ["team-members"] });
  };

  const handleRejectRequest = async (id: string) => {
    const { data, error } = await (supabase as any).rpc("reject_join_request", { p_request_id: id });
    if (error || !data?.ok) {
      toast({ title: "Erro ao recusar", description: error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "Solicitação recusada" });
    qc.invalidateQueries({ queryKey: ["join-requests"] });
  };

  const handleRemove = async (memberId: string) => {
    const { error } = await supabase.from("team_members").delete().eq("id", memberId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Membro removido" }); qc.invalidateQueries({ queryKey: ["team-members"] }); }
  };

  const handleDeleteInvite = async (inviteId: string) => {
    await supabase.from("team_invites").delete().eq("id", inviteId);
    qc.invalidateQueries({ queryKey: ["team-invites"] });
  };

  const toggleInstrument = async (memberId: string, currentInstruments: string[], instrument: string) => {
    const updated = currentInstruments.includes(instrument)
      ? currentInstruments.filter((i) => i !== instrument)
      : [...currentInstruments, instrument];
    const { error } = await supabase
      .from("team_members")
      .update({ instruments: updated } as any)
      .eq("id", memberId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else qc.invalidateQueries({ queryKey: ["team-members"] });
  };

  const handleAvatarUpload = async (profileUserId: string, profileTableId: string, file: File) => {
    const ext = file.name.split(".").pop();
    const path = `${profileUserId}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (upErr) { toast({ title: "Erro ao enviar foto", description: upErr.message, variant: "destructive" }); return; }
    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = urlData.publicUrl + "?t=" + Date.now();
    const { error } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", profileTableId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Foto atualizada!" }); qc.invalidateQueries({ queryKey: ["team-members"] }); qc.invalidateQueries({ queryKey: ["my-profile"] }); }
  };

  const handleSaveName = async () => {
    if (!myProfile?.id || !nameValue.trim()) return;
    setSavingName(true);
    const { error } = await supabase.from("profiles").update({ full_name: nameValue.trim() }).eq("id", myProfile.id);
    setSavingName(false);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Nome atualizado!" });
      setEditingName(false);
      qc.invalidateQueries({ queryKey: ["team-members"] });
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    }
  };

  const handleSavePhone = async () => {
    if (!myProfile?.id) return;
    setSavingPhone(true);
    const { error } = await supabase
      .from("profiles")
      .update({ phone: phoneValue.trim() || null } as any)
      .eq("id", myProfile.id);
    setSavingPhone(false);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Telefone atualizado!" });
      setEditingPhone(false);
      qc.invalidateQueries({ queryKey: ["team-members"] });
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      qc.invalidateQueries({ queryKey: ["assistant-my-status"] });
    }
  };

  const handleInstrumentLevel = async (memberId: string, levels: Record<string, string>, instrument: string, level: string) => {
    const updated = { ...levels, [instrument]: level };
    const { error } = await supabase
      .from("team_members")
      .update({ instrument_levels: updated } as any)
      .eq("id", memberId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else qc.invalidateQueries({ queryKey: ["team-members"] });
  };

  // Mesmo fluxo do "Sair" do shell (menu no celular, barra lateral no desktop).
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  // Avatar upload for self
  const selfFileRef = useRef<HTMLInputElement>(null);
  const [selfCropSrc, setSelfCropSrc] = useState<string | null>(null);

  const handleSelfFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setSelfCropSrc(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSelfCropDone = (blob: Blob) => {
    if (!myProfile) return;
    const file = new File([blob], "avatar.webp", { type: "image/webp" });
    handleAvatarUpload(myProfile.user_id, myProfile.id, file);
    setSelfCropSrc(null);
  };

  return (
    <Tabs value={activeTab} onValueChange={changeTab} className="w-full">
      <PageHeader title="Usuário">
        <TabsList className="flex w-full lg:w-[540px]">
          <TabsTrigger value="profile" className="flex-1 px-1.5 text-[13px] sm:px-3 sm:text-subhead">Perfil</TabsTrigger>
          <TabsTrigger value="members" className="flex-1 px-1.5 text-[13px] sm:px-3 sm:text-subhead">Membros</TabsTrigger>
          {isAdmin && <TabsTrigger value="team" className="flex-1 px-1.5 text-[13px] sm:px-3 sm:text-subhead">Equipe</TabsTrigger>}
          <TabsTrigger value="billing" className="flex-1 px-1.5 text-[13px] sm:px-3 sm:text-subhead">Assinatura</TabsTrigger>
        </TabsList>
      </PageHeader>

      {/* ===== ABA: MEU USUÁRIO ===== */}
      <TabsContent value="billing" className="mt-2">
        <TeamBilling key={`${currentTeam?.id}:${profileId}`} initialSeats={requestedSeats} />
      </TabsContent>
      <TabsContent value="profile" className="mt-2">
        <div className="grid grid-cols-1 gap-7 lg:grid-cols-2 lg:items-start lg:gap-x-8">
          <div className="space-y-7">
            {/* Cabeçalho do perfil (como o topo do app Ajustes) */}
            <section className={cn(GROUP, "flex items-center gap-3.5 p-4")} aria-label="Perfil">
              <button
                type="button"
                onClick={() => selfFileRef.current?.click()}
                aria-label="Alterar foto"
                className="relative shrink-0 rounded-full transition-transform active:scale-95"
              >
                <Avatar className="h-[60px] w-[60px]">
                  {myProfile?.avatar_url ? (
                    <AvatarImage src={myProfile.avatar_url} alt={myProfile?.full_name || ""} className="object-cover" />
                  ) : null}
                  <AvatarFallback className="bg-fill-tertiary text-title3 text-muted-foreground">
                    {(myProfile?.full_name ?? "?")[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute -bottom-0.5 -right-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-prominent text-prominent-foreground ring-[2.5px] ring-card">
                  <Camera className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
                </span>
              </button>
              <input
                ref={selfFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleSelfFileSelect}
              />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-title3">
                  {myProfile?.full_name ?? (isLoading || ownProfile.isLoading ? <span className="inline-block h-5 w-32 rounded-[8px] bg-fill-tertiary align-middle animate-pulse" aria-label="Carregando" /> : "Seu perfil")}
                </h2>
                {userEmail && <p className="truncate text-subhead text-muted-foreground">{userEmail}</p>}
                {ownProfile.isError && !myProfile && <div className="mt-2 text-sm">
                  <p role="alert">Não foi possível carregar seu perfil.</p>
                  <button className="mt-1 min-h-11 text-primary" onClick={() => void ownProfile.refetch()}>Tentar novamente</button>
                </div>}
                {(myMember || currentTeam) && (
                  <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                    {myMember && <RoleBadge role={myMember.role} />}
                    {currentTeam && <span className="truncate text-footnote text-muted-foreground">{currentTeam.name}</span>}
                  </div>
                )}
              </div>
            </section>

            {/* Aparência (Ajustes > Tela e Brilho): Automático segue o aparelho. */}
            <section aria-labelledby="appearance-label">
              <h2 id="appearance-label" className={GROUP_LABEL}>Aparência</h2>
              <div className={cn(GROUP, "p-3")}>
                <AppearanceSegmented />
              </div>
              <p className={GROUP_FOOTER}>Automático acompanha o modo claro ou escuro do aparelho.</p>
            </section>

            {/* Conta */}
            <section aria-labelledby="settings-account">
              <h2 id="settings-account" className={GROUP_LABEL}>Conta</h2>
              <div className={GROUP}>
                <Row leading={<IconTile icon={UserRound} />} className="flex-wrap gap-y-0">
                  <label htmlFor="settings-full-name" className="shrink-0 text-body">Nome completo</label>
                  <div className={INLINE_FIELD}>
                    <input
                      id="settings-full-name"
                      className={INLINE_INPUT}
                      autoComplete="name"
                      value={nameValue}
                      onChange={(e) => { setNameValue(e.target.value); setEditingName(true); }}
                      placeholder="Seu nome"
                    />
                    {editingName && <InlineConfirm label="Salvar nome" onClick={handleSaveName} saving={savingName} />}
                  </div>
                </Row>

                <Row leading={<IconTile icon={Mail} />}>
                  <span className="shrink-0 text-body">Email</span>
                  <span className="min-w-0 flex-1 truncate text-right text-body text-muted-foreground">{userEmail}</span>
                </Row>

                <Row leading={<IconTile icon={Phone} />} className="flex-wrap gap-y-0">
                  <label htmlFor="settings-phone" className="shrink-0 text-body">Telefone / WhatsApp</label>
                  <div className={INLINE_FIELD}>
                    <input
                      id="settings-phone"
                      className={INLINE_INPUT}
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={phoneValue}
                      onChange={(e) => { setPhoneValue(e.target.value); setEditingPhone(true); }}
                      placeholder="(00) 00000-0000"
                    />
                    {editingPhone && <InlineConfirm label="Salvar telefone" onClick={handleSavePhone} saving={savingPhone} />}
                  </div>
                </Row>

                <button
                  type="button"
                  onClick={() => navigate("/app/change-password")}
                  className="group/row flex w-full items-center gap-3 pl-4 text-left transition-colors active:bg-fill-quaternary"
                >
                  <IconTile icon={KeyRound} />
                  <span className={ROW_BODY}>
                    <span className="min-w-0 flex-1 text-body">Alterar senha</span>
                    <ChevronRight className="h-[18px] w-[18px] text-label-tertiary" strokeWidth={2.5} aria-hidden="true" />
                  </span>
                </button>
              </div>
            </section>

            {/* Assistente no WhatsApp: reconhece a pessoa pelo telefone acima */}
            <MyAssistantSettings />
            <FaceIdSettings />

            {/* Minhas funções */}
            {myMember && (
              <section aria-labelledby="settings-functions">
                <h2 id="settings-functions" className={GROUP_LABEL}>Minhas funções</h2>
                <div className={cn(GROUP, "p-4")}>
                  <InstrumentPicker
                    selected={myInstruments}
                    onToggle={(inst) => toggleInstrument(myMember.id, myInstruments, inst)}
                  />
                </div>

                {/* Nível por função */}
                {myInstruments.length > 0 && (
                  <>
                    <p className={cn(GROUP_LABEL, "mt-6")}>Nível em cada função</p>
                    <div className={GROUP}>
                      {myInstruments.map((inst) => {
                        const Icon = instrumentIcon(inst);
                        return (
                          <Row
                            key={inst}
                            leading={<IconTile icon={Icon} />}
                            className="gap-2 py-1 pr-2"
                          >
                            <span className="min-w-0 flex-1 truncate text-body">{inst}</span>
                            <Select
                              value={myInstrumentLevels[inst] ?? ""}
                              onValueChange={(v) => handleInstrumentLevel(myMember.id, myInstrumentLevels, inst, v)}
                            >
                              <SelectTrigger
                                aria-label={`Nível em ${inst}`}
                                className="h-11 w-auto shrink-0 bg-transparent pl-2 pr-2 text-muted-foreground active:bg-fill-quaternary data-[state=open]:bg-fill-quaternary data-[placeholder]:text-label-tertiary"
                              >
                                <SelectValue placeholder="Nível" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="aprendendo">Aprendendo</SelectItem>
                                <SelectItem value="intermediario">Intermediário</SelectItem>
                                <SelectItem value="avancado">Avançado</SelectItem>
                              </SelectContent>
                            </Select>
                          </Row>
                        );
                      })}
                    </div>
                  </>
                )}
              </section>
            )}

            {/* Preferências de notificação */}
            <UserNotificationPrefs profileTableId={myProfile?.id ?? null} prefs={myNotificationPrefs} />
          </div>

          <div className="space-y-7">
            {/* Minha disponibilidade */}
            <section aria-labelledby="settings-availability">
              <h2 id="settings-availability" className={GROUP_LABEL}>
                {personalAvailabilityLabel(currentTeam?.availability_mode ?? "both")}
              </h2>
              <div className={cn(GROUP, "p-3 sm:p-4")}>
                <MyAvailabilityCalendar
                  teamMemberId={myMember?.id ?? null}
                  myInstruments={myInstruments}
                  availabilityMode={currentTeam?.availability_mode}
                />
              </div>
            </section>

            {/* Minhas estatísticas */}
            <UserStatsCard teamMemberId={myMember?.id ?? null} loading={isLoading} />

            {/* Bloqueios do chat (denunciar/bloquear fica no toque longo da mensagem) */}
            <BlockedUsersSettings />

            {/* Sobre: Termos, Privacidade, Suporte, Excluir conta e versão do app */}
            <SettingsAboutGroup />

            {/* Excluir conta (App Store 5.1.1(v) / Google Play): prévia, transferência e confirmação na folha */}
            <DeleteAccountSection />

            {/* Sair (destrutivo, em grupo próprio no fim, como no app Ajustes) */}
            <div className={GROUP}>
              <button
                type="button"
                onClick={handleLogout}
                className="flex min-h-[50px] w-full items-center justify-center px-4 text-body text-ios-red transition-colors active:bg-fill-quaternary"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </TabsContent>

      {/* ===== ABA: MEMBROS ===== */}
      <TabsContent value="members" className="mt-2">
        <div className="space-y-7 lg:max-w-3xl">
          {/* Código de convite da equipe */}
          {canManageMembers && (
            <section aria-labelledby="settings-team-code">
              <h2 id="settings-team-code" className={GROUP_LABEL}>Código da equipe</h2>
              <div className={cn(GROUP, "flex min-h-[68px] items-center gap-2 py-3 pl-4 pr-3")}>
                <span className="min-w-0 flex-1 truncate font-mono text-title2 tracking-[0.25em] tabular-nums">
                  {teamCode ?? "—"}
                </span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  title="Copiar código"
                  aria-label={copied ? "Código copiado" : "Copiar código"}
                  className={CIRCLE_BUTTON}
                >
                  {copied ? (
                    <Check className="h-[18px] w-[18px] text-ios-green" strokeWidth={2.75} aria-hidden="true" />
                  ) : (
                    <Copy className="h-[18px] w-[18px]" aria-hidden="true" />
                  )}
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button type="button" title="Gerar novo código" aria-label="Gerar novo código" className={CIRCLE_BUTTON}>
                      <RefreshCw className="h-[18px] w-[18px]" aria-hidden="true" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Gerar um novo código?</AlertDialogTitle>
                      <AlertDialogDescription>
                        O código atual deixará de funcionar. Quem ainda não entrou precisará do código novo.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleRegenerateCode}>Gerar novo</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <p className={GROUP_FOOTER}>
                Compartilhe este código. Quem entrar com ele vira uma solicitação que você aprova aqui embaixo.
              </p>
            </section>
          )}

          {/* Solicitações de entrada pendentes */}
          {canManageMembers && joinRequests.length > 0 && (
            <section aria-labelledby="settings-join-requests">
              <h2 id="settings-join-requests" className={GROUP_LABEL}>
                Solicitações de entrada ({joinRequests.length})
              </h2>
              <div className={GROUP}>
                {joinRequests.map((r: any) => (
                  <Row
                    key={r.id}
                    leading={
                      <Avatar className="h-10 w-10">
                        {r.avatar_url ? <AvatarImage src={r.avatar_url} alt={r.full_name || ""} className="object-cover" /> : null}
                        <AvatarFallback className="bg-fill-tertiary text-subhead font-semibold text-muted-foreground">
                          {(r.full_name ?? "?")[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    }
                    className="min-h-[60px] flex-wrap gap-x-3 gap-y-2"
                  >
                    <p className="min-w-[5rem] flex-1 truncate text-body">{r.full_name ?? "Sem nome"}</p>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleApproveRequest(r.id)}
                        className={cn(CAPSULE_SM, "bg-prominent text-prominent-foreground")}
                      >
                        Aprovar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRejectRequest(r.id)}
                        className={cn(CAPSULE_SM, "bg-fill-tertiary text-foreground hover:bg-fill-secondary")}
                      >
                        Recusar
                      </button>
                    </div>
                  </Row>
                ))}
              </div>
            </section>
          )}

          {/* Denúncias do chat (somente líder) */}
          {isAdmin && currentTeam && <TeamChatReports key={currentTeam.id} teamId={currentTeam.id} />}

          {/* Lista de membros */}
          <section aria-labelledby="settings-members">
            <h2 id="settings-members" className={GROUP_LABEL}>Membros</h2>
            <div className={GROUP}>
              {canManageMembers && (
                <button
                  type="button"
                  onClick={() => setInviteOpen(true)}
                  className="group/row flex w-full items-center gap-3 pl-4 text-left transition-colors active:bg-fill-quaternary"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fill-tertiary text-primary">
                    <UserPlus className="h-[19px] w-[19px]" strokeWidth={2.25} aria-hidden="true" />
                  </span>
                  <span className={cn(ROW_BODY, "min-h-[60px]")}>
                    <span className="text-body font-medium text-primary">Adicionar manualmente</span>
                  </span>
                </button>
              )}

              {isLoading ? (
                [1, 2].map((i) => (
                  <Row key={i} leading={<span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-fill-tertiary" />} className="min-h-[60px]">
                    <span className="h-4 w-36 animate-pulse rounded-full bg-fill-tertiary" />
                  </Row>
                ))
              ) : (
                members.map((m: any) => {
                  const profile = m.profiles as any;
                  const isSelf = m.profile_id === profileId;
                  const memberInstruments: string[] = (m as any).instruments || [];
                  return (
                    <MemberCard
                      key={m.id}
                      member={m}
                      profile={profile}
                      isSelf={isSelf}
                      isAdmin={canManageMembers}
                      instruments={memberInstruments}
                      onAvatarUpload={(file) => handleAvatarUpload(profile?.user_id, profile?.id, file)}
                      onEdit={() => setEditMember(m)}
                    />
                  );
                })
              )}
            </div>
          </section>

          {/* Convites pendentes */}
          {canManageMembers && invites.length > 0 && (
            <section aria-labelledby="settings-invites">
              <h2 id="settings-invites" className={GROUP_LABEL}>Convites pendentes</h2>
              <div className={GROUP}>
                {invites.map((inv: any) => (
                  <Row
                    key={inv.id}
                    leading={<IconTile icon={Mail} />}
                    className="gap-2 py-1 pr-2"
                  >
                    <p className="min-w-0 flex-1 truncate text-body">{inv.email}</p>
                    <RoleBadge role={inv.role} />
                    <button
                      type="button"
                      aria-label={`Excluir convite de ${inv.email}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ios-red transition-colors hover:bg-ios-red/10"
                      onClick={() => handleDeleteInvite(inv.id)}
                    >
                      <Trash2 className="h-[18px] w-[18px]" aria-hidden="true" />
                    </button>
                  </Row>
                ))}
              </div>
            </section>
          )}
        </div>
      </TabsContent>

      {/* ===== ABA: EQUIPE (SOMENTE LÍDER) ===== */}
      {isAdmin && currentTeam && (
        <TabsContent value="team" className="mt-2">
          <div className="space-y-10 lg:max-w-3xl">
            <TeamAvailabilitySettings
              teamId={currentTeam.id}
              value={currentTeam.availability_mode}
              onSaved={refetch}
            />
            <TeamAssistantSettings key={currentTeam.id} teamId={currentTeam.id} />
          </div>
        </TabsContent>
      )}

      <InviteMemberModal open={inviteOpen} onOpenChange={setInviteOpen} onChoosePlan={(seats, teamId) => {
        if (teamId !== currentTeam?.id) switchTeam(teamId);
        setRequestedSeats(seats); setActiveTab('billing');
      }} />
      <MemberEditModal
        open={!!editMember}
        onOpenChange={(o) => { if (!o) setEditMember(null); }}
        member={editMember}
        currentTeamId={currentTeam?.id ?? ""}
        adminTeams={adminTeams}
        canSetPassword={canManageMembers}
        onSaved={() => qc.invalidateQueries({ queryKey: ["team-members"] })}
        onRemove={editMember ? () => handleRemove(editMember.id) : undefined}
      />

      {selfCropSrc && (
        <AvatarCropModal
          open={!!selfCropSrc}
          onOpenChange={(o) => { if (!o) setSelfCropSrc(null); }}
          imageSrc={selfCropSrc}
          onCropDone={handleSelfCropDone}
        />
      )}
    </Tabs>
  );
}

/**
 * Linha de membro na lista agrupada. Quem gerencia toca na linha para abrir a folha de edição
 * (onde também fica "Remover membro"). A foto é trocada tocando no avatar, marcado com o selo de câmera.
 */
function MemberCard({
  member,
  profile,
  isSelf,
  isAdmin,
  instruments,
  onAvatarUpload,
  onEdit,
}: {
  member: any;
  profile: any;
  isSelf: boolean;
  isAdmin: boolean;
  instruments: string[];
  onAvatarUpload: (file: File) => void;
  onEdit: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const canManage = isAdmin && !isSelf;
  const canEditAvatar = isAdmin || isSelf;
  const name = profile?.full_name ?? "Sem nome";

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCropDone = (blob: Blob) => {
    const file = new File([blob], "avatar.webp", { type: "image/webp" });
    onAvatarUpload(file);
    setCropSrc(null);
  };

  const avatar = (
    <Avatar className="h-10 w-10">
      {profile?.avatar_url ? (
        <AvatarImage src={profile.avatar_url} alt={profile?.full_name || ""} className="object-cover" />
      ) : null}
      <AvatarFallback className="bg-fill-tertiary text-subhead font-semibold text-muted-foreground">
        {(profile?.full_name ?? "?")[0]?.toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );

  const details = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body">
          {name}
          {isSelf && <span className="text-muted-foreground"> (Você)</span>}
        </span>
        {instruments.length > 0 && (
          <span className="line-clamp-2 text-footnote text-muted-foreground">{instruments.join(" · ")}</span>
        )}
      </span>
      <RoleBadge role={member.role} />
    </>
  );

  return (
    <div className="group/row flex items-center gap-3 pl-4">
      {canEditAvatar ? (
        <>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label={`Alterar foto de ${name}`}
            className="relative shrink-0 rounded-full transition-transform active:scale-95 before:absolute before:-inset-0.5 before:rounded-full before:content-['']"
          >
            {avatar}
            {/* Selo de câmera sempre que a foto pode ser trocada: deixa claro que o avatar tem ação própria. */}
            <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-prominent text-prominent-foreground ring-2 ring-card">
              <Camera className="h-2.5 w-2.5" strokeWidth={2.75} aria-hidden="true" />
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
        </>
      ) : (
        <span className="shrink-0">{avatar}</span>
      )}

      {canManage ? (
        <button
          type="button"
          onClick={onEdit}
          aria-haspopup="dialog"
          className={cn(ROW_BODY, "min-h-[60px] gap-2 text-left transition-colors active:bg-fill-quaternary")}
        >
          <span className="sr-only">Editar </span>
          {details}
          <ChevronRight className="h-[18px] w-[18px] shrink-0 text-label-tertiary" strokeWidth={2.5} aria-hidden="true" />
        </button>
      ) : (
        <div className={cn(ROW_BODY, "min-h-[60px] gap-2")}>{details}</div>
      )}

      {cropSrc && (
        <AvatarCropModal
          open={!!cropSrc}
          onOpenChange={(o) => { if (!o) setCropSrc(null); }}
          imageSrc={cropSrc}
          onCropDone={handleCropDone}
        />
      )}
    </div>
  );
}
