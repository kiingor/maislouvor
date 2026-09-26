import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

/**
 * Controle deslizante iOS: trilho de 4px, parte preenchida tintada, botão branco de 28px com a sombra
 * do knob do iOS (fio de contorno + sombra difusa) para não sumir sobre fundos brancos.
 * A área de toque (44pt de altura) fica dentro da própria caixa do Root, sem invadir controles vizinhos.
 */
const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex min-h-11 w-full touch-none select-none items-center data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-fill">
      <SliderPrimitive.Range className="absolute h-full rounded-full bg-primary" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className={cn(
        "relative block h-7 w-7 cursor-grab rounded-full bg-white",
        "shadow-[0_0_0_0.5px_rgba(0,0,0,0.06),0_0.5px_4px_rgba(0,0,0,0.12),0_6px_13px_rgba(0,0,0,0.12)] dark:shadow-[0_0.5px_4px_rgba(0,0,0,0.4)]",
        "transition-transform duration-150 active:scale-110 active:cursor-grabbing motion-reduce:transition-none",
        "disabled:pointer-events-none",
        "before:absolute before:-inset-x-2 before:inset-y-0",
      )}
    />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
