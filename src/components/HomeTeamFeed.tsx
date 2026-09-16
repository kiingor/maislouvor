import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Church, Music, MessageCircle, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface HomeTeamFeedProps {
  teamId: string;
}

type FeedKind = "culto" | "song" | "message";

interface FeedItem {
  id: string;
  kind: FeedKind;
  text: string;
  date: string; // ISO created_at
}

const ICONS: Record<FeedKind, { icon: any; className: string }> = {
  culto: { icon: Church, className: "text-blue-500 bg-blue-500/10" },
  song: { icon: Music, className: "text-purple-500 bg-purple-500/10" },
  message: { icon: MessageCircle, className: "text-emerald-500 bg-emerald-500/10" },
};

/**
 * Compact, read-only activity feed for the current team. Merges the latest
 * cultos, songs and messages by created_at and shows the ~6 most recent.
 */
export function HomeTeamFeed({ teamId }: HomeTeamFeedProps) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<FeedItem[]>([]);

  useEffect(() => {
    let active = true;
    const fetchFeed = async () => {
      setLoading(true);
      const [cultosRes, songsRes, messagesRes] = await Promise.all([
        supabase
          .from("cultos")
          .select("id, name, created_at")
          .eq("team_id", teamId)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("songs")
          .select("id, title, created_at")
          .eq("team_id", teamId)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("messages")
          .select("id, content, created_at, sender_profile_id, profiles:sender_profile_id(full_name)")
          .eq("team_id", teamId)
          .order("created_at", { ascending: false })
          .limit(6),
      ]);

      const merged: FeedItem[] = [];

      (cultosRes.data || []).forEach((c: any) => {
        if (!c.created_at) return;
        merged.push({
          id: `culto-${c.id}`,
          kind: "culto",
          text: `Culto "${c.name}" foi criado`,
          date: c.created_at,
        });
      });

      (songsRes.data || []).forEach((s: any) => {
        if (!s.created_at) return;
        merged.push({
          id: `song-${s.id}`,
          kind: "song",
          text: `Música "${s.title}" adicionada ao repertório`,
          date: s.created_at,
        });
      });

      (messagesRes.data || []).forEach((m: any) => {
        if (!m.created_at) return;
        const sender = (m.profiles as any)?.full_name?.split(" ")[0] ?? "Alguém";
        const snippet = (m.content ?? "").trim();
        const short = snippet.length > 60 ? snippet.slice(0, 60) + "…" : snippet;
        merged.push({
          id: `msg-${m.id}`,
          kind: "message",
          text: short ? `${sender}: ${short}` : `${sender} enviou uma mensagem`,
          date: m.created_at,
        });
      });

      merged.sort((a, b) => b.date.localeCompare(a.date));
      if (active) {
        setItems(merged.slice(0, 6));
        setLoading(false);
      }
    };
    fetchFeed();
    return () => {
      active = false;
    };
  }, [teamId]);

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground mb-2 px-1 flex items-center gap-1.5">
        <Activity className="h-3.5 w-3.5" /> Atividade da equipe
      </h2>
      <GlassCard variant="subtle" className="p-2">
        {loading ? (
          <div className="space-y-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                <Skeleton className="h-4 flex-1 rounded" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma atividade recente.
          </p>
        ) : (
          <div className="space-y-0.5">
            {items.map((item) => {
              const cfg = ICONS[item.kind];
              const Icon = cfg.icon;
              return (
                <div key={item.id} className="flex items-center gap-3 p-2 rounded-xl">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.className}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{item.text}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(item.date), { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
