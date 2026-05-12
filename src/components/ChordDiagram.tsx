import { getChordShape } from "@/data/chordDictionary";

interface ChordDiagramProps {
  chord: string;
  instrument: "violao" | "guitarra" | "guitarra_worship";
  size?: number;
}

export function ChordDiagram({ chord, instrument, size = 80 }: ChordDiagramProps) {
  const shape = getChordShape(chord, instrument);

  const w = size;
  const h = size * 1.3;
  const padX = w * 0.2;
  const padTop = h * 0.18;
  const padBot = h * 0.08;
  const gridW = w - padX * 2;
  const gridH = h - padTop - padBot;
  const stringSpacing = gridW / 5;
  const fretSpacing = gridH / 5;
  const dotR = stringSpacing * 0.3;

  if (!shape) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div
          className="rounded-lg border border-muted-foreground/30 flex items-center justify-center bg-muted/20"
          style={{ width: w, height: h }}
        >
          <span className="text-muted-foreground text-xs">?</span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">{chord}</span>
      </div>
    );
  }

  const { frets, baseFret, barres } = shape;

  // Calculate display frets relative to baseFret
  const displayFrets = frets.map(f => {
    if (f <= 0) return f; // -1 (muted) or 0 (open)
    return f - baseFret + 1;
  });

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block">
        {/* Nut or position indicator */}
        {baseFret === 1 ? (
          <rect x={padX - 1} y={padTop - 3} width={gridW + 2} height={4} rx={1} className="fill-foreground" />
        ) : (
          <text x={padX - 8} y={padTop + fretSpacing * 0.6} className="fill-muted-foreground" fontSize={9} textAnchor="end" dominantBaseline="middle">
            {baseFret}
          </text>
        )}

        {/* Fret lines */}
        {Array.from({ length: 6 }, (_, i) => (
          <line
            key={`fret-${i}`}
            x1={padX}
            y1={padTop + i * fretSpacing}
            x2={padX + gridW}
            y2={padTop + i * fretSpacing}
            className="stroke-muted-foreground/40"
            strokeWidth={1}
          />
        ))}

        {/* String lines */}
        {Array.from({ length: 6 }, (_, i) => (
          <line
            key={`str-${i}`}
            x1={padX + i * stringSpacing}
            y1={padTop}
            x2={padX + i * stringSpacing}
            y2={padTop + gridH}
            className="stroke-muted-foreground/50"
            strokeWidth={1}
          />
        ))}

        {/* Barre */}
        {barres?.map(barreFret => {
          const barreDisplay = barreFret - baseFret + 1;
          const y = padTop + (barreDisplay - 0.5) * fretSpacing;
          const startStr = frets.indexOf(barreFret);
          const endStr = frets.lastIndexOf(barreFret);
          if (startStr === -1 || endStr === -1 || startStr === endStr) return null;
          return (
            <rect
              key={`barre-${barreFret}`}
              x={padX + startStr * stringSpacing - dotR}
              y={y - dotR}
              width={(endStr - startStr) * stringSpacing + dotR * 2}
              height={dotR * 2}
              rx={dotR}
              className="fill-foreground"
            />
          );
        })}

        {/* Dots, open, muted */}
        {displayFrets.map((f, i) => {
          const x = padX + i * stringSpacing;
          if (f === -1) {
            // Muted
            const y = padTop - 10;
            return (
              <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-muted-foreground" fontSize={10}>
                ×
              </text>
            );
          }
          if (f === 0) {
            // Open
            const y = padTop - 10;
            return (
              <circle key={i} cx={x} cy={y} r={dotR} className="stroke-muted-foreground fill-none" strokeWidth={1.5} />
            );
          }
          // Fretted - skip if part of barre (only show if not start/end of barre)
          const y = padTop + (f - 0.5) * fretSpacing;
          return (
            <circle key={i} cx={x} cy={y} r={dotR} className="fill-foreground" />
          );
        })}
      </svg>
      <span className="text-[10px] font-mono font-semibold text-foreground">{chord}</span>
    </div>
  );
}
