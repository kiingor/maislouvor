import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { useBlockedIds } from "@/components/chat/useBlockedUsers";
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

// Ícones monocromáticos em quadrado de 30px (lista agrupada do iOS): cor só para status.
const ICONS: Record<FeedKind, { icon: any }> = {
  culto: { icon: Church },
  song: { icon: Music },
  message: { icon: MessageCircle },
};

const FEED_SIZE = 6;
// Mensagens a mais: as de quem eu bloqueei saem do feed e o resto completa a lista.
const MESSAGES_FETCHED = 12;

interface FeedRows {
  cultos: { id: string; name: string; created_at: string | null }[];
  songs: { id: string; title: string; created_at: string | null }[];
  messages: {
    id: string;
    content: string | null;
    created_at: string | null;
    sender_profile_id: string;
    profiles: { full_name: string | null } | null;
  }[];
}

/**
 * Compact, read-only activity feed for the current team. Merges the latest
 * cultos, songs and messages by created_at and shows the ~6 most recent.
 * Messages from people I blocked in the chat never show up here.
 */
export function HomeTeamFeed({ teamId }: HomeTeamFeedProps) {
  const { profileId } = useTeam();
  const blocked = useBlockedIds(profileId);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FeedRows>({ cultos: [], songs: [], messages: [] });

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
          .limit(MESSAGES_FETCHED),
      ]);

      if (active) {
        setRows({
          cultos: cultosRes.data || [],
          songs: songsRes.data || [],
          messages: (messagesRes.data || []) as unknown as FeedRows["messages"],
        });
        setLoading(false);
      }
    };
    fetchFeed();
    return () => {
      active = false;
    };
  }, [teamId]);

  const items = useMemo(() => {
    const merged: FeedItem[] = [];

    rows.cultos.forEach((c) => {
      if (!c.created_at) return;
      merged.push({
        id: `culto-${c.id}`,
        kind: "culto",
        text: `Culto "${c.name}" foi criado`,
        date: c.created_at,
      });
    });

    rows.songs.forEach((s) => {
      if (!s.created_at) return;
      merged.push({
        id: `song-${s.id}`,
        kind: "song",
        text: `Música "${s.title}" adicionada ao repertório`,
        date: s.created_at,
      });
    });

    rows.messages
      .filter((m) => !blocked.ids.has(m.sender_profile_id))
      .slice(0, FEED_SIZE)
      .forEach((m) => {
        if (!m.created_at) return;
        const sender = m.profiles?.full_name?.split(" ")[0] ?? "Alguém";
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
    return merged.slice(0, FEED_SIZE);
  }, [rows, blocked.ids]);

  // Espera a lista de bloqueados para não mostrar, nem por um instante, quem foi bloqueado.
  const showSkeleton = loading || blocked.loading;

  return (
    <section aria-labelledby="home-feed-title">
      <h2 id="home-feed-title" className="text-title3 text-foreground mx-1 mb-2">
        Atividade da equipe
      </h2>
      <div className="rounded-card bg-card overflow-hidden">
        {showSkeleton ? (
          <div aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="relative flex items-center gap-3 min-h-[52px] px-4 py-2.5">
                {i > 0 && <Separator />}
                <Skeleton className="h-[30px] w-[30px] shrink-0 rounded-[8px] bg-fill-tertiary" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4 rounded-full bg-fill-tertiary" />
                  <Skeleton className="h-3 w-1/3 rounded-full bg-fill-quaternary" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-3.5">
            <Activity className="h-7 w-7 shrink-0 text-label-tertiary" strokeWidth={2} aria-hidden="true" />
            <p className="text-body text-muted-foreground">Nenhuma atividade recente.</p>
          </div>
        ) : (
          <ul>
            {items.map((item, i) => {
              const Icon = ICONS[item.kind].icon;
              return (
                <li key={item.id} className="relative flex items-center gap-3 min-h-[52px] px-4 py-2.5">
                  {i > 0 && <Separator />}
                  <span
                    aria-hidden="true"
                    className="grid place-items-center h-[30px] w-[30px] shrink-0 rounded-[8px] bg-fill-tertiary text-muted-foreground"
                  >
                    <Icon className="h-4 w-4" strokeWidth={2.25} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-subhead text-foreground [overflow-wrap:anywhere]">{item.text}</p>
                    <p className="text-footnote text-muted-foreground">
                      {formatDistanceToNow(new Date(item.date), { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Separador hairline recuado até o texto (58px = margem 16 + ícone 30 + espaço 12). */
function Separator() {
  return <span aria-hidden="true" className="absolute top-0 left-[58px] right-0 border-t border-separator" />;
}
