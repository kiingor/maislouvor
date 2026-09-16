import { useState } from "react";
import { GlassCard } from "@/components/GlassCard";
import { cn } from "@/lib/utils";
import { Avatar3D } from "./Avatar3D";
import { CHARS_3D, Char3D, loadChar3d, saveChar3d } from "@/lib/gamification";

/** Galeria de avatares 3D — uma lista única com vários personagens animados (CC0). */
export function AvatarLab() {
  const [sel, setSel] = useState<string>(loadChar3d);
  const current = CHARS_3D.find((c) => c.src === sel) ?? CHARS_3D[0];

  const choose = (c: Char3D) => { setSel(c.src); saveChar3d(c.src); };

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <div className="rounded-2xl bg-gradient-to-b from-primary/5 to-transparent">
          <Avatar3D key={current.src} src={current.src} clip={current.clip} height={340} />
        </div>
        <p className="text-center text-sm font-semibold mt-1">{current.label}</p>
        <p className="text-center text-[11px] text-muted-foreground">
          Arraste para girar · scroll/pinça para dar zoom.
        </p>
      </GlassCard>

      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Escolha seu personagem
          </label>
          <span className="text-[11px] text-muted-foreground">{CHARS_3D.length} opções</span>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-[320px] overflow-y-auto pr-1">
          {CHARS_3D.map((c) => (
            <button
              key={c.src}
              onClick={() => choose(c)}
              className={cn(
                "rounded-xl border p-2 flex flex-col items-center gap-1 transition-all",
                sel === c.src
                  ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                  : "border-border hover:border-primary/40 bg-card/40"
              )}
            >
              <span className="text-2xl leading-none">{c.emoji}</span>
              <span className="text-[10px] text-muted-foreground truncate w-full text-center">{c.label}</span>
            </button>
          ))}
        </div>
      </GlassCard>

      <p className="text-[11px] text-muted-foreground text-center">
        Personagens 3D animados CC0 (Quaternius e similares). Ainda não há modelos com instrumento/microfone prontos —
        o <b>instrumento na mão</b> será uma camada própria, na fase de customização (cabelo, roupa, cor).
      </p>
    </div>
  );
}
