import { cn } from "@/lib/utils";

/** Espaço reservado de carregamento: preenchimento terciário pulsando (sem pulso com movimento reduzido). */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-xl bg-fill-tertiary motion-reduce:animate-none", className)}
      aria-hidden="true"
      {...props}
    />
  );
}

export { Skeleton };
