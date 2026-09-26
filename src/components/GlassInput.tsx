import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

/**
 * Campo de texto iOS (nome histórico). Preenchimento terciário, sem borda nem vidro,
 * 44pt de altura e texto body (17px evita o zoom automático do iOS).
 */
const GlassInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
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
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
GlassInput.displayName = "GlassInput";

export { GlassInput };
