import { cn } from "@/lib/utils";

const labels: Record<string, string> = {
  admin: "Líder",
  editor: "Editor",
  viewer: "Membro",
};

export function RoleBadge({ role, className }: { role: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        role === "admin" && "bg-foreground text-background",
        role === "editor" && "bg-secondary text-secondary-foreground",
        role === "viewer" && "bg-muted text-muted-foreground",
        className
      )}
    >
      {labels[role] ?? role}
    </span>
  );
}
