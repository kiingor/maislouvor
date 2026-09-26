import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

/**
 * Interruptor iOS (51×31): trilho verde quando ligado, botão branco de 27px com sombra.
 * O alvo de toque é estendido para 44pt de altura.
 */
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer relative inline-flex h-[31px] w-[51px] shrink-0 cursor-pointer items-center rounded-full border-0 p-[2px]",
      "transition-colors duration-200 data-[state=checked]:bg-ios-green data-[state=unchecked]:bg-fill-secondary",
      "disabled:cursor-not-allowed disabled:opacity-50 [-webkit-tap-highlight-color:transparent]",
      "before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-[27px] w-[27px] rounded-full bg-white shadow-md ring-0",
        "transition-transform duration-300 [transition-timing-function:cubic-bezier(0.3,1.3,0.5,1)] motion-reduce:transition-none",
        "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
