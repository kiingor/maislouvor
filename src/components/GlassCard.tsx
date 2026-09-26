import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "subtle";
}

/**
 * Card da camada de conteúdo (lista agrupada do iOS). Apesar do nome histórico,
 * NÃO é vidro: HIG > Materials pede superfícies opacas no conteúdo.
 * `subtle` = célula secundária (fundo terciário agrupado), útil dentro de outro card.
 */
export function GlassCard({ className, variant = "default", children, ...props }: GlassCardProps) {
  return (
    <div
      className={cn(
        "rounded-card",
        variant === "default" ? "bg-card text-card-foreground" : "bg-card/80 text-card-foreground",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
