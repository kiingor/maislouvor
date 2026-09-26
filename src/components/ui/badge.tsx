import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Cápsula iOS (caption1 semibold). Status: cor do sistema a 15% com texto na cor
 * (pendente = warning/laranja, aceito = success/verde, recusado = destructive/vermelho).
 * Nunca use a cor como único indicador: mantenha o texto ou um símbolo.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-caption1 font-semibold transition-colors [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-fill-secondary text-foreground",
        secondary: "bg-fill-tertiary text-foreground",
        destructive: "bg-ios-red/15 text-ios-red",
        outline: "bg-transparent text-foreground ring-1 ring-inset ring-separator",
        success: "bg-ios-green/15 text-ios-green",
        warning: "bg-ios-orange/15 text-ios-orange",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
