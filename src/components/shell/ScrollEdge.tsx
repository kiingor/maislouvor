import { cn } from "@/lib/utils";

/** Efeito de borda de rolagem progressivo (HIG > Scroll views). Decorativo. */
export function ScrollEdge({ position, active = true, className, style }: { position: "top" | "bottom"; active?: boolean; className?: string; style?: React.CSSProperties }) {
  return (
    <div aria-hidden="true" className={cn("scroll-edge", position, active && "on", className)} style={style}>
      <i className="b1" />
      <i className="b2" />
      <i className="b3" />
      <i className="b4" />
      <i className="fade" />
    </div>
  );
}
