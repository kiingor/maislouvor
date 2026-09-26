import * as React from "react";
import * as TogglePrimitive from "@radix-ui/react-toggle";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/** Botão de alternância iOS: cápsula; ligado = preenchimento cinza com texto em label. */
const toggleVariants = cva(
  [
    "relative inline-flex select-none items-center justify-center gap-1.5 rounded-full text-subhead font-medium text-primary",
    "transition-[transform,background-color,color] duration-200 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100",
    "hover:bg-fill-quaternary disabled:pointer-events-none disabled:opacity-40",
    "data-[state=on]:bg-fill-secondary data-[state=on]:text-foreground",
    "[-webkit-tap-highlight-color:transparent] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-[1.1em]",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "bg-fill-tertiary hover:bg-fill-secondary",
      },
      size: {
        default: "h-11 min-w-11 px-4",
        // 36px visíveis, alvo de toque de 44px.
        sm: "h-9 min-w-9 px-3 before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2",
        lg: "h-[50px] min-w-[50px] px-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const Toggle = React.forwardRef<
  React.ElementRef<typeof TogglePrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>
>(({ className, variant, size, ...props }, ref) => (
  <TogglePrimitive.Root ref={ref} className={cn(toggleVariants({ variant, size, className }))} {...props} />
));

Toggle.displayName = TogglePrimitive.Root.displayName;

export { Toggle, toggleVariants };
