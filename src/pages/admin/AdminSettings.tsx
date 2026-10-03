import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminPageHeader, AdminPanel, EmptyState, QueryState } from "@/components/admin/AdminUI";
import { platformSupabase as supabase } from "@/integrations/supabase/platform-client";
import { useToast } from "@/hooks/use-toast";
import { displayDate, platformError, platformRpc, type PlatformSettings } from "@/lib/platform";

const actionLabels: Record<string, string> = { ticket_reply: "Resposta enviada ao usuário", ticket_update: "Ticket atualizado", subscription_update: "Assinatura registrada", settings_update: "Configurações atualizadas",
  // Conformidade com as lojas: exclusão de conta e moderação do chat.
  account_deleted: "Conta excluída pelo usuário", team_ownership_transfer: "Propriedade de equipe transferida", chat_report_update: "Denúncia do chat analisada", chat_message_delete: "Mensagem do chat apagada",
  account_suspend: "Conta suspensa pela plataforma", account_reactivate: "Conta reativada pela plataforma" };

function SettingsForm({ settings }: { settings: PlatformSettings }) {
  const [enabled, setEnabled] = useState(settings.support_enabled); const [email, setEmail] = useState(settings.support_email); const [announcement, setAnnouncement] = useState(settings.announcement);
  const queryClient = useQueryClient(); const { toast } = useToast();
  const save = useMutation({ mutationFn: () => platformRpc<PlatformSettings>("admin_update_settings", { p_support_enabled: enabled, p_support_email: email, p_announcement: announcement }),
    onSuccess: () => { toast({ className: "platform-toast", title: "Configurações salvas" }); void queryClient.invalidateQueries({ queryKey: ["platform"] }); void queryClient.invalidateQueries({ queryKey: ["support", "settings"] }); },
    onError: (error) => toast({ className: "platform-toast", title: "Não foi possível salvar", description: platformError(error), variant: "destructive" }),
  });
  const dirty = enabled !== settings.support_enabled || email !== settings.support_email || announcement !== settings.announcement;
  return <form onSubmit={(event) => { event.preventDefault(); save.mutate(); }} className="p-5 sm:p-6"><fieldset disabled={save.isPending} className="space-y-6">
    <div className="flex items-center justify-between gap-6 rounded-xl border bg-neutral-50/60 p-4"><div><label className="admin-field-label" htmlFor="support-enabled">Receber novos tickets</label><p id="support-enabled-help" className="text-xs leading-relaxed text-muted-foreground">Permita que usuários enviem bugs e sugestões. As conversas existentes continuam disponíveis durante uma pausa.</p></div><Switch id="support-enabled" checked={enabled} onCheckedChange={setEnabled} aria-describedby="support-enabled-help" disabled={save.isPending} /></div>
    <div><label className="admin-field-label" htmlFor="support-email">E-mail de atendimento</label><Input id="support-email" type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="suporte@exemplo.com" /><p className="admin-field-hint">Contato opcional exibido na área de sugestões dos usuários.</p></div>
    <div><label className="admin-field-label" htmlFor="support-announcement">Mensagem na área de sugestões</label><Textarea id="support-announcement" maxLength={1000} rows={4} value={announcement} onChange={(event) => setAnnouncement(event.target.value)} placeholder="Informe prazos de resposta ou novidades sobre o atendimento." /><p className="admin-field-hint">Visível para todos os usuários nessa área · {announcement.length}/1.000 caracteres.</p></div>
  </fieldset><div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-5"><span className="text-[11px] text-muted-foreground">{dirty ? "Há alterações para salvar." : `Última atualização: ${displayDate(settings.updated_at, true)}`}</span><Button type="submit" disabled={!dirty || save.isPending}><Save size={15} className="mr-2" />{save.isPending ? "Salvando…" : "Salvar configurações"}</Button></div></form>;
}

export default function AdminSettings() {
  const settings = useQuery({ queryKey: ["platform", "settings"], queryFn: async () => { const { data, error } = await supabase.from("platform_settings").select("*").single(); if (error) throw error; return data; } });
  const history = useQuery({ queryKey: ["platform", "audit"], queryFn: async () => { const { data, error } = await supabase.from("platform_audit_log").select("id, action, entity_id, details, created_at").order("created_at", { ascending: false }).limit(30); if (error) throw error; return data; } });
  return <><AdminPageHeader eyebrow="Preferências da plataforma" title="Configurações" description="Ajuste o atendimento e consulte o histórico das ações administrativas." />
    <Tabs defaultValue="support"><TabsList className="mb-5 border bg-white"><TabsTrigger value="support">Atendimento</TabsTrigger><TabsTrigger value="history"><History size={14} className="mr-2" />Histórico</TabsTrigger></TabsList>
      <TabsContent value="support"><div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(250px,1fr)]"><AdminPanel title="Sugestões e suporte" description="As alterações entram em vigor ao salvar."><QueryState loading={settings.isPending} error={settings.error} retry={() => void settings.refetch()} />{settings.data && !settings.error && <SettingsForm key={settings.data.updated_at} settings={settings.data} />}</AdminPanel>
        <AdminPanel title="Acesso à administração"><div className="p-6"><ShieldCheck size={25} className="mb-4 text-[#111111]" /><p className="text-sm font-medium">Permissão exclusiva da plataforma</p><p className="mt-3 text-xs leading-relaxed text-muted-foreground">O acesso ao gerenciador é concedido à conta autorizada. Os papéis de líder, editor e membro continuam vinculados às equipes.</p><p className="mt-4 border-t pt-4 text-[11px] leading-relaxed text-muted-foreground">Respostas, alterações de tickets, assinaturas e configurações ficam registradas no histórico administrativo.</p></div></AdminPanel>
      </div></TabsContent>
      <TabsContent value="history"><AdminPanel title="Histórico administrativo" description="As 30 ações mais recentes, da mais nova para a mais antiga."><QueryState loading={history.isPending} error={history.error} retry={() => void history.refetch()} />{history.data && !history.error && (!history.data.length ? <EmptyState title="Nenhuma ação registrada" description="As primeiras respostas e alterações feitas no gerenciador aparecerão aqui." /> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Ação</th><th>Referência</th><th>Data</th></tr></thead><tbody>{history.data.map((entry) => { const details = entry.details && typeof entry.details === "object" && !Array.isArray(entry.details) ? entry.details : {}; return <tr key={entry.id}><td className="font-medium">{actionLabels[entry.action] || entry.action}</td><td><span className="break-all font-mono text-[10px] text-muted-foreground">{details.ticket_number ? `Ticket #${details.ticket_number}` : entry.entity_id === "platform" ? "Plataforma" : entry.entity_id || "—"}</span></td><td className="whitespace-nowrap text-muted-foreground">{displayDate(entry.created_at, true)}</td></tr>; })}</tbody></table></div>)}</AdminPanel></TabsContent>
    </Tabs>
  </>;
}
