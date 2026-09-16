import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CharKey, charPose, Pose } from "@/lib/gamification";

interface Props {
  char: CharKey;
  /** "idle" fica flutuando suave; "celebrate" pula com a pose de comemoração. */
  mode?: "idle" | "celebrate";
  size?: number;
  className?: string;
  /** fundo com glow (usado na tela grande de avatar). */
  glow?: boolean;
}

/**
 * Personagem do membro renderizado com sprites CC0 do Kenney (Toon Characters 1).
 * Camada de instrumento/acessório entra na fase seguinte; aqui é o personagem base
 * com animação leve (respeitando prefers-reduced-motion).
 */
export function MeuPersonagem({ char, mode = "idle", size = 120, className, glow }: Props) {
  const [pose, setPose] = useState<Pose>("idle");
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    if (mode === "celebrate") {
      setPose("cheer0");
      setCelebrating(true);
      const t = setTimeout(() => { setPose("idle"); setCelebrating(false); }, 1400);
      return () => clearTimeout(t);
    }
  }, [mode]);

  return (
    <div
      className={cn("relative grid place-items-center rounded-3xl", className)}
      style={{ width: size, height: size }}
    >
      {glow && (
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-primary/10 to-transparent" />
      )}
      <img
        src={charPose(char, pose)}
        alt="Personagem"
        draggable={false}
        className={cn(
          "relative h-[82%] w-[82%] object-contain select-none transition-transform",
          celebrating && "gam-celebrate"
        )}
        style={{ filter: "drop-shadow(0 6px 10px rgba(0,0,0,.18))" }}
      />
    </div>
  );
}
