import { cn } from "@/lib/utils";

const labels: Record<string, string> = {
  admin: "Líder",
  editor: "Editor",
  viewer: "Membro",
};

interface RoleBadgeProps {
  role: string;
  className?: string;
  /** `capsule` (padrão) = etiqueta iOS; `text` = só o rótulo, para compor linhas ("Líder · Equipe"). */
  variant?: "capsule" | "text";
}

/** Papel do membro na equipe. Líder em destaque (tinta da marca); os demais em cinza do sistema. */
export function RoleBadge({ role, className, variant = "capsule" }: RoleBadgeProps) {
  const label = labels[role] ?? role;
  if (variant === "text") return <span className={className}>{label}</span>;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-caption1 font-semibold",
        role === "admin"
          ? "bg-prominent text-prominent-foreground"
          : role === "editor"
            ? "bg-fill-secondary text-foreground"
            : "bg-fill-tertiary text-muted-foreground",
        className
      )}
    >
      {label}
    </span>
  );
}
