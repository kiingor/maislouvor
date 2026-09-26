import * as React from "react";

import { cn } from "@/lib/utils";

/** Campo de texto iOS: preenchimento terciário, sem borda, 44pt, texto body (17px evita zoom no iOS). */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full min-w-0 rounded-[12px] border-0 bg-fill-tertiary px-4 py-2.5 text-body text-foreground caret-primary",
          "placeholder:text-label-tertiary",
          "transition-[background-color,box-shadow] duration-200",
          // Toque: anel suave. Teclado: soma-se o contorno global de 3px ios-blue (:focus-visible).
          "focus-visible:ring-[3px] focus-visible:ring-ios-blue/25",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "file:mr-3 file:border-0 file:bg-transparent file:p-0 file:text-subhead file:font-semibold file:text-primary",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
