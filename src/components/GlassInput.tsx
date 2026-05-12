import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

const GlassInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-12 w-full rounded-xl glass-input px-4 py-3 text-sm font-medium",
          "placeholder:text-muted-foreground/60",
          "focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "transition-all duration-200",
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
