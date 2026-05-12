import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { GlassCard } from "@/components/GlassCard";
import { GlassInput } from "@/components/GlassInput";
import { RoleBadge } from "@/components/RoleBadge";
import { InviteMemberModal } from "@/components/InviteMemberModal";
import { EditMemberModal } from "@/components/EditMemberModal";
import { AvatarCropModal } from "@/components/AvatarCropModal";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { User, Users, UserPlus, Trash2, Camera, CalendarCheck, KeyRound, Pencil, Save, Mail } from "lucide-react";
import { INSTRUMENTS, INSTRUMENT_ICONS } from "@/data/instruments";
import { cn } from "@/lib/utils";
import { ptBR } from "date-fns/locale";

export default function TeamSettings() {
  const { currentTeam, isAdmin, canEdit, profileId } = useTeam();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editMember, setEditMember] = useState<{ id: string; full_name: string | null; user_id: string } | null>(null);
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

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["team-members", currentTeam?.id],
    queryFn: async () => {
      if (!currentTeam) return [];
      const { data } = await supabase
        .from("team_members")
        .select("id, role, profile_id, instruments, profiles(id, full_name, user_id, avatar_url)")
        .eq("team_id", currentTeam.id);
      return data ?? [];
    },
    enabled: !!currentTeam,
  });

  const myMember = members.find((m: any) => m.profile_id === profileId);
  const myProfile = myMember ? (myMember as any).profiles : null;
  const myInstruments: string[] = (myMember as any)?.instruments || [];

  // Init name value when profile loads
  useEffect(() => {
    if (myProfile?.full_name && !editingName) {
      setNameValue(myProfile.full_name);
    }
  }, [myProfile?.full_name]);

  const { data: myAvailability = [] } = useQuery({
    queryKey: ["my-availability", myMember?.id],
    queryFn: async () => {
      if (!myMember) return [];
      const { data } = await supabase
        .from("member_availability")
        .select("available_date")
        .eq("team_member_id", myMember.id);
      return (data ?? []).map((d: any) => new Date(d.available_date + "T00:00:00"));
    },
    enabled: !!myMember,
  });

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
    enabled: !!currentTeam && isAdmin,
  });

  const handleRoleChange = async (memberId: string, newRole: string) => {
    const { error } = await supabase.from("team_members").update({ role: newRole as "admin" | "editor" | "viewer" }).eq("id", memberId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Função atualizada" }); qc.invalidateQueries({ queryKey: ["team-members"] }); }
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

  const handleToggleAvailability = async (date: Date) => {
    if (!myMember) return;
    const dateStr = date.toISOString().split("T")[0];
    const exists = myAvailability.some(
      (d) => d.toISOString().split("T")[0] === dateStr
    );
    if (exists) {
      await supabase
        .from("member_availability")
        .delete()
        .eq("team_member_id", myMember.id)
        .eq("available_date", dateStr);
    } else {
      await supabase
        .from("member_availability")
        .insert({ team_member_id: myMember.id, available_date: dateStr } as any);
    }
    qc.invalidateQueries({ queryKey: ["my-availability"] });
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
        </TabsList>

        {/* ===== ABA: MEU USUÁRIO ===== */}
        <TabsContent value="profile">
          {/* Desktop: 2 colunas | Mobile: coluna única */}
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 max-w-4xl mx-auto">

            {/* Coluna esquerda: Avatar + Dados pessoais */}
            <div className="space-y-6">
              {/* Avatar grande */}
              <GlassCard className="p-6 flex flex-col items-center gap-4">
                <div className="relative group">
                  <Avatar className="h-28 w-28 lg:h-32 lg:w-32">
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

              {/* Alterar senha */}
              <Button variant="outline" className="w-full rounded-xl gap-2 h-12" onClick={() => navigate("/app/change-password")}>
                <KeyRound className="h-4 w-4" /> Alterar senha
              </Button>
            </div>

            {/* Coluna direita: Instrumentos + Disponibilidade */}
            <div className="space-y-6">
              {/* Instrumentos */}
              {myMember && (
                <GlassCard className="p-4 space-y-3">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Instrumentos</label>
                  <div className="flex flex-wrap gap-1.5">
                    {INSTRUMENTS.map((inst) => {
                      const active = myInstruments.includes(inst);
                      const Icon = INSTRUMENT_ICONS[inst];
                      return (
                        <button
                          key={inst}
                          onClick={() => toggleInstrument(myMember.id, myInstruments, inst)}
                          className={cn(
                            "text-xs px-2.5 py-1.5 rounded-full border transition-colors flex items-center gap-1.5",
                            active
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-accent/50 text-muted-foreground border-border hover:border-primary/50"
                          )}
                        >
                          {Icon && <Icon className="h-3 w-3" />}
                          {inst}
                        </button>
                      );
                    })}
                  </div>
                </GlassCard>
              )}

              {/* Disponibilidade */}
              {myMember && (
                <GlassCard className="p-4 space-y-3">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <CalendarCheck className="h-3 w-3" /> Minha Disponibilidade
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Clique nos dias em que você está disponível para a escala.
                  </p>
                  <div className="flex justify-center">
                    <Calendar
                      mode="multiple"
                      selected={myAvailability}
                      onSelect={(dates) => {
                        if (!dates) return;
                        const currentSet = new Set(myAvailability.map(d => d.toISOString().split("T")[0]));
                        const newSet = new Set((dates as Date[]).map(d => d.toISOString().split("T")[0]));
                        for (const d of newSet) {
                          if (!currentSet.has(d)) {
                            handleToggleAvailability(new Date(d + "T00:00:00"));
                            return;
                          }
                        }
                        for (const d of currentSet) {
                          if (!newSet.has(d)) {
                            handleToggleAvailability(new Date(d + "T00:00:00"));
                            return;
                          }
                        }
                      }}
                      locale={ptBR}
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </div>
                </GlassCard>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ===== ABA: MEMBROS ===== */}
        <TabsContent value="members">
          <div className="space-y-4">
            {/* Header com botão convidar */}
            {isAdmin && (
              <div className="flex justify-end">
                <Button onClick={() => setInviteOpen(true)} className="rounded-xl gap-2">
                  <UserPlus className="h-4 w-4" /> Convidar
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
                      isAdmin={isAdmin}
                      canEditSelf={isSelf}
                      instruments={memberInstruments}
                      onRoleChange={handleRoleChange}
                      onRemove={handleRemove}
                      onToggleInstrument={(instrument) => toggleInstrument(m.id, memberInstruments, instrument)}
                      onAvatarUpload={(file) => handleAvatarUpload(profile?.user_id, profile?.id, file)}
                      onEdit={() => setEditMember(profile ? { id: profile.id, full_name: profile.full_name, user_id: profile.user_id } : null)}
                    />
                  );
                })
              )}
            </div>

            {/* Convites pendentes */}
            {isAdmin && invites.length > 0 && (
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
      </Tabs>

      <InviteMemberModal open={inviteOpen} onOpenChange={setInviteOpen} />
      <EditMemberModal
        open={!!editMember}
        onOpenChange={(o) => { if (!o) setEditMember(null); }}
        profile={editMember}
        onSaved={() => qc.invalidateQueries({ queryKey: ["team-members"] })}
        isAdmin={isAdmin}
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
  canEditSelf,
  instruments,
  onRoleChange,
  onRemove,
  onToggleInstrument,
  onAvatarUpload,
  onEdit,
}: {
  member: any;
  profile: any;
  isSelf: boolean;
  isAdmin: boolean;
  canEditSelf: boolean;
  instruments: string[];
  onRoleChange: (id: string, role: string) => void;
  onRemove: (id: string) => void;
  onToggleInstrument: (instrument: string) => void;
  onAvatarUpload: (file: File) => void;
  onEdit: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const canManage = isAdmin && !isSelf;
  const canEditInstruments = isAdmin || canEditSelf;
  const canEditAvatar = isAdmin || canEditSelf;

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
          {(canEditInstruments) && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg text-xs h-8"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Fechar" : "Instrumentos"}
            </Button>
          )}
          {(isAdmin || isSelf) && (
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {canManage ? (
            <>
              <Select value={member.role} onValueChange={(v) => onRoleChange(member.id, v)}>
                <SelectTrigger className="h-8 w-28 rounded-lg text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Líder</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Membro</SelectItem>
                </SelectContent>
              </Select>
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
          ) : (
            <RoleBadge role={member.role} />
          )}
        </div>
      </div>

      {/* Instruments panel */}
      {expanded && canEditInstruments && (
        <div className="px-4 pb-4 pt-1 border-t border-border/50">
          <p className="text-xs text-muted-foreground mb-2">Selecione os instrumentos:</p>
          <div className="flex flex-wrap gap-1.5">
            {INSTRUMENTS.map((inst) => {
              const active = instruments.includes(inst);
              const Icon = INSTRUMENT_ICONS[inst];
              return (
                <button
                  key={inst}
                  onClick={() => onToggleInstrument(inst)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1.5",
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-accent/50 text-muted-foreground border-border hover:border-primary/50"
                  )}
                >
                  {Icon && <Icon className="h-3 w-3" />}
                  {inst}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
