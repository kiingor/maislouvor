import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ToolbarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Ícone (lucide). Sozinho = círculo de 44pt; com `label` = cápsula. */
  icon?: ReactNode;
  label?: ReactNode;
  /** Ação principal da barra (HIG > Toolbars: uma só, à direita, tintada). */
  prominent?: boolean;
}

/**
 * Item da barra superior em Liquid Glass (kit iOS 27 > Toolbars).
 * Ícone sem rótulo precisa de `aria-label`.
 */
export const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  ({ icon, label, prominent, className, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        "glass-button",
        prominent
          ? "bg-prominent text-prominent-foreground shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_4px_12px_-4px_rgba(0,0,0,0.1)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_4px_12px_-4px_rgba(0,0,0,0.55)]"
          : "liquid-glass",
        label ? "capsule" : "w-11",
        "disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {icon && <span className="relative z-[4] inline-flex [&_svg]:h-[19px] [&_svg]:w-[19px]" aria-hidden="true">{icon}</span>}
      {label && <span className="relative z-[4] truncate">{label}</span>}
      {children}
    </button>
  ),
);
ToolbarButton.displayName = "ToolbarButton";
