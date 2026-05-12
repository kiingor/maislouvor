import { useMemo, useEffect, useRef, useState, useCallback } from "react";
import { ChordDiagram } from "@/components/ChordDiagram";

interface ContinuousScrollProps {
  fullText: string;
  scrollSpeed: number;
  isScrolling: boolean;
  onScrollSpeedChange: (speed: number) => void;
  fontScale: number;
  isDark: boolean;
  instrument: "violao" | "guitarra" | "guitarra_worship";
  isVoz: boolean;
}

const CHORD_TOKEN = /[A-G][#b]?(?:m|M|maj|min|dim|aug|sus[24]?|add\d+|[2-9]|1[0-3]|6\/9)*(?:\/[A-G][#b]?)?/;
const CHORD_LINE_REGEX = new RegExp(`^\\s*(?:${CHORD_TOKEN.source}\\s*)+$`);
const SECTION_TAG_REGEX = /^\s*\[[^\]]+\]\s*$/;

function isChordLine(line: string): boolean {
  return CHORD_LINE_REGEX.test(line.trim());
}

function isSectionTag(line: string): boolean {
  return SECTION_TAG_REGEX.test(line.trim());
}

interface ParsedLine {
  type: "chord" | "lyric" | "section" | "empty";
  text: string;
  chords: string[];
}

function parseFullText(text: string, isVoz: boolean): ParsedLine[] {
  const lines = text.split("\n");
  return lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return { type: "empty" as const, text: "", chords: [] };
    if (isSectionTag(trimmed)) return { type: "section" as const, text: trimmed, chords: [] };
    if (!isVoz && isChordLine(trimmed)) {
      const matches = trimmed.match(new RegExp(CHORD_TOKEN.source, "g")) || [];
      return { type: "chord" as const, text: trimmed, chords: matches };
    }
    return { type: "lyric" as const, text: trimmed, chords: [] };
  });
}

export function KaraokeSegment({
  fullText,
  scrollSpeed,
  isScrolling,
  onScrollSpeedChange,
  fontScale,
  isDark,
  instrument,
  isVoz,
}: ContinuousScrollProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const maxOffsetRef = useRef(0);
  const [offsetState, setOffsetState] = useState(0);
  const [visibleChords, setVisibleChords] = useState<string[]>([]);

  const lines = useMemo(() => parseFullText(fullText, isVoz), [fullText, isVoz]);

  // Compute max offset when content/container size changes
  useEffect(() => {
    const updateMax = () => {
      if (!containerRef.current || !contentRef.current) return;
      const contentH = contentRef.current.scrollHeight;
      const containerH = containerRef.current.clientHeight;
      maxOffsetRef.current = Math.max(0, contentH - containerH);
    };
    updateMax();
    window.addEventListener("resize", updateMax);
    return () => window.removeEventListener("resize", updateMax);
  }, [lines, fontScale]);

  // Smooth auto-scroll via translateY with subpixel precision
  useEffect(() => {
    if (!isScrolling) {
      lastTimeRef.current = 0;
      return;
    }

    const tick = (timestamp: number) => {
      if (!lastTimeRef.current) {
        lastTimeRef.current = timestamp;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const dt = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;

      const newOffset = Math.min(
        offsetRef.current + scrollSpeed * dt,
        maxOffsetRef.current
      );
      offsetRef.current = newOffset;
      
      // Apply transform directly for GPU-accelerated subpixel rendering
      if (contentRef.current) {
        contentRef.current.style.transform = `translateY(${-newOffset}px)`;
      }

      // Throttle React state updates to ~10fps for chord extraction
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = 0;
    };
  }, [isScrolling, scrollSpeed]);

  // Throttled state update for visible chords (~10fps)
  useEffect(() => {
    if (isVoz) return;
    const interval = setInterval(() => {
      setOffsetState(offsetRef.current);
    }, 100);
    return () => clearInterval(interval);
  }, [isVoz]);

  // Handle manual scroll (wheel/touch) — coexists with auto-scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const newOffset = Math.max(
        0,
        Math.min(offsetRef.current + e.deltaY, maxOffsetRef.current)
      );
      offsetRef.current = newOffset;
      if (contentRef.current) {
        contentRef.current.style.transform = `translateY(${-newOffset}px)`;
      }
    };

    let touchStartY = 0;
    let touchStartOffset = 0;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
      touchStartOffset = offsetRef.current;
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const deltaY = touchStartY - e.touches[0].clientY;
      const newOffset = Math.max(
        0,
        Math.min(touchStartOffset + deltaY, maxOffsetRef.current)
      );
      offsetRef.current = newOffset;
      if (contentRef.current) {
        contentRef.current.style.transform = `translateY(${-newOffset}px)`;
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
    };
  }, []);

  // Extract visible chords from viewport based on offset
  useEffect(() => {
    if (isVoz || !containerRef.current || !contentRef.current) return;

    const containerH = containerRef.current.clientHeight;
    const chordElements = contentRef.current.querySelectorAll("[data-chords]");
    const visible: string[] = [];

    chordElements.forEach((el) => {
      const elTop = (el as HTMLElement).offsetTop - offsetState;
      const elBottom = elTop + (el as HTMLElement).offsetHeight;
      if (elBottom >= 0 && elTop <= containerH) {
        const chords = el.getAttribute("data-chords");
        if (chords) {
          chords.split(",").forEach((c) => {
            if (c && !visible.includes(c)) visible.push(c);
          });
        }
      }
    });

    setVisibleChords(visible);
  }, [offsetState, isVoz, lines]);

  return (
    <div className="flex w-full h-full max-w-6xl mx-auto gap-4">
      {/* Main lyrics area — overflow hidden, content moves via translateY */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden px-4 py-8 relative"
      >
        <div
          ref={contentRef}
          className="flex flex-col items-center gap-0.5 min-h-[50vh] pb-[60vh] will-change-transform"
          style={{ transform: `translateY(${-offsetRef.current}px)` }}
        >
          {lines.map((line, i) => {
            if (line.type === "empty") {
              return <div key={i} className="h-4" />;
            }
            if (line.type === "section") {
              return (
                <div
                  key={i}
                  className="text-primary/60 uppercase tracking-wider font-mono mt-4 mb-1"
                  style={{ fontSize: `${fontScale * 0.85}rem` }}
                >
                  {line.text}
                </div>
              );
            }
            if (line.type === "chord") {
              return (
                <div
                  key={i}
                  data-chords={line.chords.join(",")}
                  className="font-mono text-primary/80 w-full text-center"
                  style={{
                    fontSize: `${fontScale * 0.95}rem`,
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                  }}
                >
                  {line.text}
                </div>
              );
            }
            // lyric line
            return (
              <div
                key={i}
                className="w-full text-center whitespace-pre-wrap"
                style={{
                  fontSize: `${fontScale * 1.4}rem`,
                  fontWeight: 600,
                  lineHeight: 1.7,
                }}
              >
                {line.text}
              </div>
            );
          })}
        </div>
      </div>

      {/* Side chord diagrams */}
      {!isVoz && visibleChords.length > 0 && (
        <div className="hidden md:flex flex-col items-center gap-3 w-32 lg:w-40 py-8 overflow-y-auto hide-scrollbar shrink-0">
          <span
            className={`text-[9px] font-semibold uppercase tracking-wider ${
              isDark ? "text-white/40" : "text-black/40"
            } mb-1`}
          >
            Acordes
          </span>
          {visibleChords.map((chord) => (
            <div key={chord} className="flex flex-col items-center">
              <ChordDiagram
                chord={chord}
                instrument={instrument}
                size={Math.round(80 * fontScale)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
