import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "subtle";
}

export function GlassCard({ className, variant = "default", children, ...props }: GlassCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl",
        variant === "default" ? "glass" : "glass-subtle",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
