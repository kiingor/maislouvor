import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { format, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/GlassCard";
import { PageHeader } from "@/components/shell/PageHeader";
import { AvatarLab } from "@/components/gamification/AvatarLab";
import { Podium3D } from "@/components/gamification/Podium3D";
import { cn } from "@/lib/utils";
import { Sprout, HandHeart, Flame, Shield, Mountain, BadgeCheck, Sparkles, Medal, Crown, LucideIcon } from "lucide-react";
import {
  Gender, TITULOS, tituloForLevel, tituloLabel,
  levelProgress, TREE_SPECIES, FRUITS, fruitSrc, GARDEN_STAGES, PERIOD_MONTHS, LEAF_COLORS,
  CARE_ACTIONS, MOCK_LEADERBOARD, MOCK_TEAM_META, charPose,
  loadMember, saveMember, loadGarden, saveGarden, GardenState,
} from "@/lib/gamification";

/* Emblema de título em CSS (glossy, não achatado) — ícone + gradiente por tier. */
const TITULO_VISUAL: { icon: LucideIcon; from: string; to: string }[] = [
  { icon: Sprout, from: "#9ccc65", to: "#7cb342" },
  { icon: HandHeart, from: "#4dd0e1", to: "#26a69a" },
  { icon: Flame, from: "#ffb74d", to: "#fb8c00" },
  { icon: Shield, from: "#64b5f6", to: "#1e88e5" },
  { icon: Mountain, from: "#b39ddb", to: "#7e57c2" },
  { icon: BadgeCheck, from: "#7986cb", to: "#3949ab" },
  { icon: Sparkles, from: "#f48fb1", to: "#ec407a" },
  { icon: Medal, from: "#ffd54f", to: "#f9a825" },
  { icon: Crown, from: "#ffe082", to: "#ff8f00" },
];
function TituloBadge({ idx, size = 40, locked = false }: { idx: number; size?: number; locked?: boolean }) {
  const v = TITULO_VISUAL[Math.max(0, Math.min(idx, TITULO_VISUAL.length - 1))];
  const Icon = v.icon;
  return (
    <div
      className="rounded-full grid place-items-center shrink-0 ring-2 ring-white/50"
      style={{
        width: size, height: size,
        background: locked ? "linear-gradient(145deg,#d4d4d4,#9e9e9e)" : `linear-gradient(145deg,${v.from},${v.to})`,
        boxShadow: locked
          ? "inset 0 2px 3px rgba(255,255,255,.45), 0 2px 5px rgba(0,0,0,.15)"
          : `inset 0 2px 4px rgba(255,255,255,.55), inset 0 -2px 4px rgba(0,0,0,.12), 0 3px 9px ${v.to}55`,
      }}
    >
      <Icon style={{ width: size * 0.5, height: size * 0.5 }} className="text-white" strokeWidth={2.4} />
    </div>
  );
}

export default function Gamificacao() {
  return (
    <div className="max-w-3xl">
      <Tabs defaultValue="avatar3d">
        <PageHeader
          title="Jornada"
          subtitle="Reconhecimento da equipe — pré-visualização. Dados de exemplo (sem banco ainda)."
        >
          <TabsList className="flex w-full">
            <TabsTrigger value="avatar3d" className="flex-1">Avatar</TabsTrigger>
            <TabsTrigger value="personagem" className="flex-1">Progresso</TabsTrigger>
            <TabsTrigger value="destaques" className="flex-1">Destaques</TabsTrigger>
            <TabsTrigger value="jardim" className="flex-1">Jardim</TabsTrigger>
          </TabsList>
        </PageHeader>

        <TabsContent value="avatar3d" className="mt-4"><AvatarLab /></TabsContent>
        <TabsContent value="personagem" className="mt-4"><PersonagemTab /></TabsContent>
        <TabsContent value="destaques" className="mt-4"><DestaquesTab /></TabsContent>
        <TabsContent value="jardim" className="mt-4"><JardimTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ===================== PERSONAGEM ===================== */
function PersonagemTab() {
  const [member, setMember] = useState(loadMember);
  const prog = levelProgress(member.xp);
  const titulo = tituloForLevel(prog.level);

  const update = (patch: Partial<typeof member>) => {
    const next = { ...member, ...patch };
    setMember(next); saveMember(next);
  };
  const setGender = (g: Gender) => update({ gender: g });

  const ganharXp = () => {
    const before = prog.level;
    const next = { ...member, xp: member.xp + 120 };
    setMember(next); saveMember(next);
    const after = levelProgress(next.xp).level;
    if (after > before) toast.success(`Subiu de Nível ${after}! — ${tituloLabel(after, member.gender)} 🎉`);
    else toast(`+120 Trajeto`);
  };

  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <div className="flex items-center gap-2">
          <TituloBadge idx={TITULOS.indexOf(titulo)} size={46} />
          <div>
            <p className="text-headline">{tituloLabel(prog.level, member.gender)}</p>
            <p className="text-footnote text-muted-foreground">Nível {prog.level} · {member.xp} Trajeto</p>
          </div>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-footnote text-muted-foreground mb-1">
            <span>Nível {prog.level}</span><span>{prog.next} XP</span>
          </div>
          <div className="h-3 rounded-full bg-fill-secondary overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${prog.pct}%`, background: "linear-gradient(90deg,hsl(255 70% 62%),hsl(42 90% 46%))" }} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-footnote text-muted-foreground">Gênero:</span>
          <SegBtn active={member.gender === "m"} onClick={() => setGender("m")}>♂ Masc.</SegBtn>
          <SegBtn active={member.gender === "f"} onClick={() => setGender("f")}>♀ Fem.</SegBtn>
          <Button size="sm" className="ml-auto" onClick={ganharXp}>🎉 Ganhar trajeto</Button>
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <h3 className="text-headline">Escada de títulos</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
          {TITULOS.map((t, i) => {
            const reached = prog.level >= t.min;
            return (
              <div key={t.min} className={cn(
                "flex items-center gap-3 rounded-[14px] px-3 py-2",
                prog.level >= t.min && prog.level <= t.max ? "bg-fill-secondary ring-2 ring-primary" : "bg-fill-tertiary",
                !reached && "opacity-60"
              )}>
                <TituloBadge idx={i} size={36} locked={!reached} />
                <div className="min-w-0">
                  <p className="text-subhead font-semibold truncate">{member.gender === "f" ? t.f : t.m}</p>
                  <p className="text-caption2 text-muted-foreground">Nível {t.min}–{t.max}</p>
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}

/* ===================== DESTAQUES ===================== */
const PODIUM_SRC = ["/models/Michelle.glb", "/models/Q_Person.glb", "/models/Cyber.glb"];
function DestaquesTab() {
  const rows = useMemo(() => [...MOCK_LEADERBOARD].sort((a, b) => b.score - a.score), []);
  const top3 = rows.slice(0, 3).map((r, i) => ({ src: PODIUM_SRC[i], name: r.name, score: r.score }));
  const medalEmoji = ["🥇", "🥈", "🥉"];
  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <h3 className="text-headline mb-1">🏆 Pódio da temporada</h3>
        <Podium3D top3={top3} height={300} />
        <div className="flex justify-center gap-5 text-subhead mt-1">
          <span>🥈 {rows[1]?.name}</span>
          <span className="font-bold">🥇 {rows[0]?.name}</span>
          <span>🥉 {rows[2]?.name}</span>
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-headline">Mais constante</h3>
          <span className="text-caption1 font-semibold text-muted-foreground bg-fill-tertiary px-2 py-0.5 rounded-full">por taxa, não volume</span>
        </div>
        <div className="space-y-2 mt-3">
          {rows.map((r, i) => (
            <div key={r.name} className={cn(
              "flex items-center gap-3 rounded-[14px] px-3 py-2",
              r.me ? "bg-fill-secondary ring-2 ring-primary" : "bg-fill-tertiary"
            )}>
              <div className="w-8 text-center shrink-0 font-bold">
                {i < 3 ? <span className="text-title3">{medalEmoji[i]}</span> : <span className="text-muted-foreground">{i + 1}</span>}
              </div>
              <img src={charPose(r.char, "idle")} alt="" className="h-9 w-9 object-contain shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-subhead font-semibold truncate">{r.name}{r.me && " (você)"}</p>
                <p className="text-caption2 text-muted-foreground">{r.served} de {r.scheduled} cultos · {Math.round(r.served / r.scheduled * 100)}%</p>
              </div>
              <span className="text-subhead font-bold tabular-nums text-foreground">{r.score}</span>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <h3 className="text-headline flex items-center gap-2">⚖️ Como funciona a justiça</h3>
        <ul className="text-subhead text-muted-foreground mt-2 space-y-2 list-none">
          <li>• Conta a sua <b className="text-foreground">taxa de presença</b> (quantas vezes serviu das que foi escalado), não o total.</li>
          <li>• Foi escalado 2× e serviu nas 2 (100%) → fica à frente de quem foi escalado 8× e faltou 2 (75%).</li>
          <li>• Marcou indisponível? Aquela data <b className="text-foreground">não entra na conta</b> — indisponibilidade nunca vira falta.</li>
        </ul>
      </GlassCard>

      <GlassCard className="p-5 text-center">
        <p className="text-subhead text-muted-foreground">Meta coletiva da equipe (cooperativa)</p>
        <p className="text-headline mt-1">
          🌱 {MOCK_TEAM_META.membersInStreak} de {MOCK_TEAM_META.membersTotal} mantiveram a disponibilidade em dia
        </p>
        <p className="text-footnote text-muted-foreground mt-1">Veja o crescimento na aba <b>Jardim</b> 🌳</p>
      </GlassCard>
    </div>
  );
}

/* ===================== JARDIM ===================== */
function JardimTab() {
  const [g, setG] = useState<GardenState>(loadGarden);
  useEffect(() => { saveGarden(g); }, [g]);
  const update = (patch: Partial<GardenState>) => setG((prev) => ({ ...prev, ...patch }));

  const start = () => {
    update({ started: true, startISO: new Date().toISOString(), stage: 0, progress: 0 });
    toast.success("Período iniciado! 🌱 Que a equipe floresça.");
  };
  const reset = () => update({ started: false, startISO: null, stage: 0, progress: 0 });

  const care = (amount: number, label: string) => {
    setG((prev) => {
      if (prev.stage >= 7) return prev;
      let stage = prev.stage;
      let progress = prev.progress + amount;
      let grew = false;
      if (progress >= 100) { stage += 1; progress = stage >= 7 ? 100 : progress - 100; grew = true; }
      const finalStage = stage;
      const msg = grew
        ? `A planta cresceu! 🌿 ${GARDEN_STAGES[Math.min(finalStage, 7)]}`
        : `${label} · +${amount}% no Jardim 🌱`;
      queueMicrotask(() => (grew ? toast.success(msg) : toast(msg)));
      return { ...prev, stage, progress };
    });
  };

  if (!g.started) {
    return (
      <div className="space-y-4">
        <GlassCard className="p-5">
          <h3 className="text-headline">🌳 Meta da equipe — o Jardim</h3>
          <p className="text-subhead text-muted-foreground mt-1">
            Cada período dura <b>{PERIOD_MONTHS} meses</b> (2 por ano). O <b>líder dá início</b> ao período,
            escolhe a <b>espécie da árvore</b> e o <b>fruto</b>. A cada cuidado da equipe a planta cresce,
            da semente até a colheita.
          </p>
        </GlassCard>

        <GlassCard className="p-5">
          <h3 className="text-headline">🌲 Espécie da árvore (brasileira)</h3>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
            {TREE_SPECIES.map((t) => (
              <button key={t.key} onClick={() => update({ species: t.key })}
                aria-pressed={g.species === t.key}
                className={cn("rounded-[14px] p-2 flex flex-col items-center gap-1 transition-[background-color,transform] active:scale-95",
                  g.species === t.key ? "bg-fill-secondary ring-2 ring-primary" : "bg-fill-tertiary hover:bg-fill-secondary")}>
                <span className="text-3xl leading-none">{t.emoji}</span>
                <span className="text-caption2 text-muted-foreground">{t.label}</span>
              </button>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <h3 className="text-headline">🍎 Fruto da colheita</h3>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 mt-3">
            {FRUITS.map((f) => (
              <button key={f.key} onClick={() => update({ fruit: f.key })}
                aria-pressed={g.fruit === f.key}
                className={cn("rounded-[14px] p-2 flex flex-col items-center gap-1 transition-[background-color,transform] active:scale-95",
                  g.fruit === f.key ? "bg-fill-secondary ring-2 ring-primary" : "bg-fill-tertiary hover:bg-fill-secondary")}>
                <img src={fruitSrc(f.key)} alt={f.label} className="h-9 w-9 object-contain" />
                <span className="text-caption2 text-muted-foreground">{f.label}</span>
              </button>
            ))}
          </div>
        </GlassCard>

        <Button className="w-full" size="lg" onClick={start}>🌱 Iniciar período de {PERIOD_MONTHS} meses</Button>
        <p className="text-caption1 text-muted-foreground text-center">
          Árvores e frutos: assets CC0 do <b>Kenney</b> (Nature Kit + Food Kit).
        </p>
      </div>
    );
  }

  const endDate = g.startISO ? addMonths(new Date(g.startISO), PERIOD_MONTHS) : null;
  const harvested = g.stage >= 7;

  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-headline">🌳 Jardim da equipe</h3>
            <p className="text-footnote text-muted-foreground">
              {harvested ? "Colheita completa!" : `Estágio ${g.stage + 1} de 8 — ${GARDEN_STAGES[g.stage]}`}
              {endDate && <> · termina {format(endDate, "MMM/yy", { locale: ptBR })}</>}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={reset}>Reiniciar</Button>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-5 mt-3">
          <GardenPlant species={g.species} fruit={g.fruit} stage={g.stage} />
          <div className="flex-1 w-full">
            <div className="h-3 rounded-full bg-fill-secondary overflow-hidden mb-1">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${harvested ? 100 : g.progress}%`, background: "linear-gradient(90deg,hsl(150 55% 42%),hsl(150 60% 55%))" }} />
            </div>
            <p className="text-footnote text-muted-foreground">
              {harvested ? "🎉 Meta do período alcançada!" : `${g.progress}% até o próximo estágio`}
            </p>
            <p className="text-footnote text-muted-foreground mt-3 mb-1.5">Cuidados (cada um é uma ação real):</p>
            <div className="grid grid-cols-3 gap-2">
              {CARE_ACTIONS.map((c) => (
                <button key={c.key} onClick={() => care(c.amount, `${c.emoji} ${c.label}`)}
                  className="rounded-[14px] bg-fill-tertiary px-2.5 py-2 text-left transition-[background-color,transform] hover:bg-fill-secondary active:scale-95">
                  <p className="text-footnote font-semibold">{c.emoji} {c.label}</p>
                  <p className="text-caption2 text-muted-foreground">{c.sub}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
          {GARDEN_STAGES.map((s, i) => (
            <div key={s} className={cn(
              "flex-1 min-w-[78px] text-center rounded-[12px] px-2 py-2 transition-colors",
              i < g.stage ? "bg-ios-green/15 text-foreground"
                : i === g.stage ? "bg-ios-green/15 ring-2 ring-ios-green"
                : "bg-fill-tertiary opacity-60"
            )}>
              <p className="text-caption2 font-semibold">{s}</p>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

/* Jardim em PIXEL ART (minimalista) — 8 estágios de crescimento. */
const FRUIT_COLORS: Record<string, string> = {
  apple: "#e2483d", orange: "#f39c12", banana: "#f4d03f", grapes: "#7d3c98",
  lemon: "#f1c40f", pear: "#9acd32", strawberry: "#e74c3c", watermelon: "#27ae60",
};

function pixelBlocks(stage: number, leaf: string, fruitC: string) {
  const B: { x: number; y: number; c: string }[] = [];
  const T = "#7a5230", soil = "#6b4a2b", soilD = "#5a3d22";
  const add = (x: number, y: number, c: string) => B.push({ x, y, c });
  for (let x = 0; x < 12; x++) { add(x, 13, soil); add(x, 12, x % 2 ? soilD : soil); }
  if (stage === 0) { add(5, 11, "#3a2a17"); add(6, 11, "#3a2a17"); return B; }
  const trunkTop = [0, 10, 10, 9, 8, 7, 6, 5][stage];
  for (let y = trunkTop; y < 12; y++) { add(5, y, T); add(6, y, T); }
  const r = [0, 0.7, 1, 1.4, 1.9, 2.4, 2.8, 3.1][stage];
  const cx = 5.5, cy = trunkTop - 1.3;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r * 0.7); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (y < 0 || x < 0 || x > 11) continue;
      if (Math.hypot(x - cx, (y - cy) * 1.05) <= r) add(x, y, leaf);
    }
  if (stage === 2) ([[3,11],[3,10],[4,9],[5,8],[6,8],[7,9],[8,10],[8,11]] as const).forEach(([x,y]) => add(x, y, "#bcdcff"));
  if (stage === 6) ([[4, Math.round(cy)],[7, Math.round(cy)],[6, Math.round(cy - r)]] as const).forEach(([x,y]) => add(x, y, "#f8bbd0"));
  if (stage >= 7) ([[4, Math.round(cy)],[7, Math.round(cy - 0.5)],[5, Math.round(cy + 0.6)],[6, Math.round(cy - 1)]] as const).forEach(([x,y]) => add(x, y, fruitC));
  return B;
}

function GardenPlant({ species, fruit, stage }: { species: string; fruit: string; stage: number }) {
  const leaf = LEAF_COLORS[species] ?? "#43a047";
  const fruitC = FRUIT_COLORS[fruit] ?? "#e2483d";
  const blocks = pixelBlocks(stage, leaf, fruitC);
  return (
    <div className="shrink-0 rounded-[20px] overflow-hidden mx-auto"
      style={{ width: 150, height: 175, background: "linear-gradient(180deg,#eaf6ff 0%,#eaf6ff 60%,#eafae7 60%,#eafae7 100%)" }}>
      <svg viewBox="0 0 120 140" width="100%" height="100%" shapeRendering="crispEdges" style={{ imageRendering: "pixelated" }}>
        {blocks.map((b, i) => (<rect key={i} x={b.x * 10} y={b.y * 10} width="10.3" height="10.3" fill={b.c} />))}
      </svg>
    </div>
  );
}

function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn(
      "relative h-8 rounded-full px-3 text-subhead font-medium transition-[background-color,transform] active:scale-95 before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']",
      active ? "bg-primary text-primary-foreground" : "bg-fill-tertiary text-foreground hover:bg-fill-secondary"
    )}>{children}</button>
  );
}
