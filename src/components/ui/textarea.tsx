import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

/** Área de texto iOS: mesmo campo do Input (preenchimento terciário, sem borda). */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[88px] w-full rounded-[12px] border-0 bg-fill-tertiary px-4 py-3 text-body text-foreground caret-primary",
        "placeholder:text-label-tertiary",
        "transition-[background-color,box-shadow] duration-200",
        // Toque: anel suave. Teclado: soma-se o contorno global de 3px ios-blue (:focus-visible).
        "focus-visible:ring-[3px] focus-visible:ring-ios-blue/25",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
