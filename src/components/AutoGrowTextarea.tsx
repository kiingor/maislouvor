import { useRef, useLayoutEffect, useEffect, TextareaHTMLAttributes } from "react";

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
}

/**
 * A textarea that grows with its content so short cifras/letras don't sit in a
 * big empty box. It grows up to the element's CSS `max-height` (e.g. a Tailwind
 * `max-h-[70vh]` class) and then scrolls internally — so a very long cifra never
 * stretches the page infinitely. The cap is fully driven by the `max-h-*` class,
 * so it stays responsive (vh resolves to px via getComputedStyle).
 */
export function AutoGrowTextarea({ value, className, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const max = parseFloat(getComputedStyle(el).maxHeight); // px, or NaN when 'none'
    const next = el.scrollHeight;
    if (!isNaN(max) && next > max) {
      el.style.height = `${max}px`;
      el.style.overflowY = "auto";
    } else {
      el.style.height = `${next}px`;
      el.style.overflowY = "hidden";
    }
  };

  // Resize on value changes (typing, transpose, paste, programmatic updates)
  useLayoutEffect(resize, [value]);

  // Resize on viewport changes (font/width/vh-based max all depend on it)
  useEffect(() => {
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      onInput={resize}
      className={className}
      {...rest}
    />
  );
}
