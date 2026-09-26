import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

/**
 * Controle segmentado iOS: trilho cinza em cápsula, segmentos de largura igual.
 * Base em grade (colunas 1fr): sem largura definida, todos os segmentos ficam do tamanho
 * do maior; com w-full, dividem a largura por igual. `grid grid-cols-N` e `flex` continuam valendo.
 */
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-grid min-h-9 max-w-full auto-cols-[minmax(0,1fr)] grid-flow-col items-center justify-center gap-0.5 rounded-full bg-fill-tertiary p-0.5 text-foreground",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

/** Envolve cada trecho de texto num span que trunca com reticências (ícones ficam de fora). */
function wrapTextRuns(children: React.ReactNode): React.ReactNode {
  const out: React.ReactNode[] = [];
  let run: Array<string | number> = [];
  const flush = () => {
    if (run.length === 0) return;
    const text = run.join("");
    if (text.trim() === "") out.push(text);
    else
      out.push(
        <span key={`t${out.length}`} className="min-w-0 truncate">
          {text}
        </span>,
      );
    run = [];
  };
  React.Children.toArray(children).forEach((child) => {
    if (typeof child === "string" || typeof child === "number") run.push(child);
    else {
      flush();
      out.push(child);
    }
  });
  flush();
  return out;
}

/**
 * Segmento: o ativo ganha a superfície do card com sombra leve (no escuro, cinza systemGray2).
 * Visual de 32pt com alvo de toque de 44pt. Rótulos longos truncam em vez de alargar o segmento.
 */
const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative inline-flex min-h-8 min-w-0 flex-1 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-subhead font-medium text-foreground [&_svg]:shrink-0",
      "transition-[background-color,box-shadow,color] duration-200 motion-reduce:transition-none",
      "data-[state=active]:bg-card data-[state=active]:shadow-sm dark:data-[state=active]:bg-prominent",
      "disabled:pointer-events-none disabled:opacity-40 [-webkit-tap-highlight-color:transparent]",
      "before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2",
      className,
    )}
    {...props}
  >
    {wrapTextRuns(children)}
  </TabsPrimitive.Trigger>
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn("mt-2", className)} {...props} />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
