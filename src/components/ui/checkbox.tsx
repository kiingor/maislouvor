import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Seleção iOS: círculo de 22px; marcado = círculo tintado com ✓.
 * O alvo de toque é estendido para 44×44.
 */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer group relative grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-[1.5px] border-label-tertiary bg-transparent",
      "transition-[background-color,border-color,transform] duration-200 active:scale-90 motion-reduce:transition-none motion-reduce:active:scale-100",
      "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
      "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
      "disabled:cursor-not-allowed disabled:opacity-40 [-webkit-tap-highlight-color:transparent]",
      "before:absolute before:left-1/2 before:top-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      <Check className="h-[13px] w-[13px] group-data-[state=indeterminate]:hidden" strokeWidth={2.25} aria-hidden="true" />
      <Minus className="hidden h-[13px] w-[13px] group-data-[state=indeterminate]:block" strokeWidth={2.25} aria-hidden="true" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
