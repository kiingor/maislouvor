import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { GlassCard } from "@/components/GlassCard";
import { GlassInput } from "@/components/GlassInput";
import { RoleBadge } from "@/components/RoleBadge";
import { InviteMemberModal } from "@/components/InviteMemberModal";
import { MemberEditModal } from "@/components/MemberEditModal";
import { AvatarCropModal } from "@/components/AvatarCropModal";
import { MyAvailabilityCalendar } from "@/components/MyAvailabilityCalendar";
import { UserNotificationPrefs } from "@/components/UserNotificationPrefs";
import { UserStatsCard } from "@/components/UserStatsCard";
import { TeamAvailabilitySettings } from "@/components/TeamAvailabilitySettings";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { User, Users, UserPlus, Trash2, Camera, CalendarCheck, KeyRound, Pencil, Save, Mail, Phone, Ticket, Copy, Check, RefreshCw, Clock, X, Settings2 } from "lucide-react";
import { instrumentIcon } from "@/data/instruments";
import { InstrumentPicker } from "@/components/InstrumentPicker";
import { cn } from "@/lib/utils";
import { personalAvailabilityLabel } from "@/lib/availability";

export default function TeamSettings() {
  const { currentTeam, isAdmin, profileId, teams, can, refetch } = useTeam();
  const canManageMembers = can("membros", "editar");
  const adminTeams = teams.filter((t) => t.role === "admin").map((t) => ({ id: t.id, name: t.name }));
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editMember, setEditMember] = useState<any | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Current user email
  const [userEmail, setUserEmail] = useState("");
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? "");
    });
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

  const myMember = members.find((m: any) => m.profile_id === profileId);
  const myProfile = myMember ? (myMember as any).profiles : null;
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
    else { toast({ title: "Foto atualizada!" }); qc.invalidateQueries({ queryKey: ["team-members"] }); }
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

  // Other members (excluding self)
  const otherMembers = members.filter((m: any) => m.profile_id !== profileId);

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
    <div className="animate-in-up">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <User className="h-5 w-5" /> Usuário
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {currentTeam?.name ?? "Equipe"}
        </p>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="w-full mb-6">
          <TabsTrigger value="profile" className="flex-1 gap-1.5">
            <User className="h-3.5 w-3.5" /> Meu Usuário
          </TabsTrigger>
          <TabsTrigger value="members" className="flex-1 gap-1.5">
            <Users className="h-3.5 w-3.5" /> Membros
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="team" className="flex-1 gap-1.5">
              <Settings2 className="h-3.5 w-3.5" /> Equipe
            </TabsTrigger>
          )}
        </TabsList>

        {/* ===== ABA: MEU USUÁRIO ===== */}
        <TabsContent value="profile">
          {/* Desktop: 2 colunas | Mobile: coluna única */}
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 max-w-full sm:max-w-2xl lg:max-w-4xl mx-auto px-4 sm:px-0">

            {/* Coluna esquerda: Avatar + Dados pessoais */}
            <div className="space-y-6">
              {/* Avatar grande */}
              <GlassCard className="p-6 flex flex-col items-center gap-4">
                <div className="relative group">
                  <Avatar className="h-20 w-20 sm:h-24 sm:w-24 lg:h-32 lg:w-32">
                    {myProfile?.avatar_url ? (
                      <AvatarImage src={myProfile.avatar_url} alt={myProfile?.full_name || ""} />
                    ) : null}
                    <AvatarFallback className="text-3xl font-semibold bg-accent">
                      {(myProfile?.full_name ?? "?")[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <button
                    onClick={() => selfFileRef.current?.click()}
                    className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                  >
                    <Camera className="h-5 w-5 text-white" />
                  </button>
                  <input
                    ref={selfFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleSelfFileSelect}
                  />
                </div>
                <div className="text-center space-y-1">
                  <p className="font-semibold text-lg">{myProfile?.full_name ?? "Sem nome"}</p>
                  {myMember && <RoleBadge role={myMember.role} />}
                </div>
              </GlassCard>

              {/* Nome editável */}
              <GlassCard className="p-4 space-y-3">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nome completo</label>
                <div className="flex gap-2">
                  <GlassInput
                    value={nameValue}
                    onChange={(e) => { setNameValue(e.target.value); setEditingName(true); }}
                    placeholder="Seu nome"
                  />
                  {editingName && (
                    <Button size="icon" className="shrink-0 h-12 w-12 rounded-xl" onClick={handleSaveName} disabled={savingName}>
                      <Save className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </GlassCard>

              {/* Email readonly */}
              <GlassCard className="p-4 space-y-3">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Mail className="h-3 w-3" /> Email
                </label>
                <GlassInput value={userEmail} disabled className="opacity-60 cursor-not-allowed" />
              </GlassCard>

              {/* Telefone / WhatsApp */}
              <GlassCard className="p-4 space-y-3">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Phone className="h-3 w-3" /> Telefone / WhatsApp
                </label>
                <div className="flex gap-2">
                  <GlassInput
                    type="tel"
                    inputMode="tel"
                    value={phoneValue}
                    onChange={(e) => { setPhoneValue(e.target.value); setEditingPhone(true); }}
                    placeholder="(00) 00000-0000"
                  />
                  {editingPhone && (
                    <Button size="icon" className="shrink-0 h-12 w-12 rounded-xl" onClick={handleSavePhone} disabled={savingPhone}>
                      <Save className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </GlassCard>

              {/* Alterar senha */}
              <Button variant="outline" className="w-full rounded-xl gap-2 h-12" onClick={() => navigate("/app/change-password")}>
                <KeyRound className="h-4 w-4" /> Alterar senha
              </Button>
            </div>

            {/* Coluna direita: Instrumentos + Disponibilidade + Notificações + Estatísticas */}
            <div className="space-y-6">
              {/* Instrumentos */}
              {myMember && (
                <GlassCard className="p-4 space-y-3">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Minhas funções</label>
                  <InstrumentPicker
                    selected={myInstruments}
                    onToggle={(inst) => toggleInstrument(myMember.id, myInstruments, inst)}
                  />

                  {/* Nível por função */}
                  {myInstruments.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-border/50">
                      <p className="text-xs text-muted-foreground">Nível em cada função:</p>
                      {myInstruments.map((inst) => {
                        const Icon = instrumentIcon(inst);
                        return (
                          <div key={inst} className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium flex items-center gap-1.5 min-w-0">
                              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="truncate">{inst}</span>
                            </span>
                            <Select
                              value={myInstrumentLevels[inst] ?? ""}
                              onValueChange={(v) => handleInstrumentLevel(myMember.id, myInstrumentLevels, inst, v)}
                            >
                              <SelectTrigger className="h-9 w-full sm:w-36 rounded-lg text-xs shrink-0">
                                <SelectValue placeholder="Nível" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="aprendendo">Aprendendo</SelectItem>
                                <SelectItem value="intermediario">Intermediário</SelectItem>
                                <SelectItem value="avancado">Avançado</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </GlassCard>
              )}

              {/* Minha disponibilidade */}
              <GlassCard className="p-4 space-y-3">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <CalendarCheck className="h-3 w-3" />
                  {personalAvailabilityLabel(currentTeam?.availability_mode ?? "both")}
                </label>
                <MyAvailabilityCalendar
                  teamMemberId={myMember?.id ?? null}
                  myInstruments={myInstruments}
                  availabilityMode={currentTeam?.availability_mode}
                />
              </GlassCard>

              {/* Preferências de notificação */}
              <UserNotificationPrefs profileTableId={myProfile?.id ?? null} prefs={myNotificationPrefs} />

              {/* Minhas estatísticas */}
              <UserStatsCard teamMemberId={myMember?.id ?? null} />
            </div>
          </div>
        </TabsContent>

        {/* ===== ABA: MEMBROS ===== */}
        <TabsContent value="members">
          <div className="space-y-4">
            {/* Código de convite da equipe */}
            {canManageMembers && (
              <GlassCard className="p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Ticket className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Código da equipe</h2>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Compartilhe este código. Quem entrar com ele vira uma solicitação que você aprova aqui embaixo.
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-xl border border-border bg-accent/40 px-4 py-3 text-center">
                    <span className="text-2xl font-mono font-semibold tracking-[0.3em]">{teamCode ?? "—"}</span>
                  </div>
                  <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl shrink-0" onClick={handleCopyCode} title="Copiar código">
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl shrink-0" title="Gerar novo código">
                        <RefreshCw className="h-4 w-4" />
                      </Button>
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
              </GlassCard>
            )}

            {/* Solicitações de entrada pendentes */}
            {canManageMembers && joinRequests.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Solicitações de entrada ({joinRequests.length})
                </h2>
                {joinRequests.map((r: any) => (
                  <GlassCard key={r.id} variant="subtle" className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-9 w-9">
                        {r.avatar_url ? <AvatarImage src={r.avatar_url} alt={r.full_name || ""} /> : null}
                        <AvatarFallback className="text-sm font-medium bg-accent">
                          {(r.full_name ?? "?")[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <p className="text-sm font-medium truncate">{r.full_name ?? "Sem nome"}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" className="h-8 rounded-lg gap-1.5 text-xs" onClick={() => handleApproveRequest(r.id)}>
                        <Check className="h-3.5 w-3.5" /> Aprovar
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 rounded-lg gap-1.5 text-xs" onClick={() => handleRejectRequest(r.id)}>
                        <X className="h-3.5 w-3.5" /> Recusar
                      </Button>
                    </div>
                  </GlassCard>
                ))}
              </div>
            )}

            {/* Header com botão convidar */}
            {canManageMembers && (
              <div className="flex justify-end">
                <Button onClick={() => setInviteOpen(true)} variant="outline" className="rounded-xl gap-2">
                  <UserPlus className="h-4 w-4" /> Adicionar manualmente
                </Button>
              </div>
            )}

            {/* Lista de membros */}
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Membros</h2>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <GlassCard key={i} className="p-4 h-16 animate-pulse" />
                  ))}
                </div>
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
                      onRemove={handleRemove}
                      onAvatarUpload={(file) => handleAvatarUpload(profile?.user_id, profile?.id, file)}
                      onEdit={() => setEditMember(m)}
                    />
                  );
                })
              )}
            </div>

            {/* Convites pendentes */}
            {canManageMembers && invites.length > 0 && (
              <div className="mt-4 space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Convites pendentes</h2>
                {invites.map((inv: any) => (
                  <GlassCard key={inv.id} variant="subtle" className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm">{inv.email}</p>
                      <RoleBadge role={inv.role} className="mt-1" />
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteInvite(inv.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </GlassCard>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ===== ABA: EQUIPE (SOMENTE LÍDER) ===== */}
        {isAdmin && currentTeam && (
          <TabsContent value="team">
            <div className="mx-auto max-w-5xl px-4 sm:px-0">
              <TeamAvailabilitySettings
                teamId={currentTeam.id}
                value={currentTeam.availability_mode}
                onSaved={refetch}
              />
            </div>
          </TabsContent>
        )}
      </Tabs>

      <InviteMemberModal open={inviteOpen} onOpenChange={setInviteOpen} />
      <MemberEditModal
        open={!!editMember}
        onOpenChange={(o) => { if (!o) setEditMember(null); }}
        member={editMember}
        currentTeamId={currentTeam?.id ?? ""}
        adminTeams={adminTeams}
        canSetPassword={canManageMembers}
        onSaved={() => qc.invalidateQueries({ queryKey: ["team-members"] })}
      />

      {selfCropSrc && (
        <AvatarCropModal
          open={!!selfCropSrc}
          onOpenChange={(o) => { if (!o) setSelfCropSrc(null); }}
          imageSrc={selfCropSrc}
          onCropDone={handleSelfCropDone}
        />
      )}
    </div>
  );
}

function MemberCard({
  member,
  profile,
  isSelf,
  isAdmin,
  instruments,
  onRemove,
  onAvatarUpload,
  onEdit,
}: {
  member: any;
  profile: any;
  isSelf: boolean;
  isAdmin: boolean;
  instruments: string[];
  onRemove: (id: string) => void;
  onAvatarUpload: (file: File) => void;
  onEdit: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const canManage = isAdmin && !isSelf;
  const canEditAvatar = isAdmin || isSelf;

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

  return (
    <GlassCard className={cn("hover-lift overflow-hidden", isSelf && "ring-2 ring-primary/30")}>
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative group">
            <Avatar className="h-10 w-10">
              {profile?.avatar_url ? (
                <AvatarImage src={profile.avatar_url} alt={profile?.full_name || ""} />
              ) : null}
              <AvatarFallback className="text-sm font-medium bg-accent">
                {(profile?.full_name ?? "?")[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {canEditAvatar && (
              <>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                >
                  <Camera className="h-3.5 w-3.5 text-white" />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </>
            )}
          </div>
          <div>
            <p className="text-sm font-medium">
              {profile?.full_name ?? "Sem nome"}
              {isSelf && <span className="text-xs text-primary ml-1.5">(Você)</span>}
            </p>
            {instruments.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {instruments.map((inst) => (
                  <span key={inst} className="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                    {inst}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RoleBadge role={member.role} />
          {canManage && (
            <>
              <Button variant="outline" size="sm" className="h-8 rounded-lg gap-1.5 text-xs" onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remover membro?</AlertDialogTitle>
                    <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onRemove(member.id)}>Remover</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>

      {cropSrc && (
        <AvatarCropModal
          open={!!cropSrc}
          onOpenChange={(o) => { if (!o) setCropSrc(null); }}
          imageSrc={cropSrc}
          onCropDone={handleCropDone}
        />
      )}
    </GlassCard>
  );
}
