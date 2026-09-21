import { useId, useRef, useState } from "react";
import * as RangeSlider from "@radix-ui/react-slider";
import { Check, GripVertical, Infinity as InfinityIcon, Loader2, Minus, Pause, Play, Plus, RotateCcw } from "lucide-react";
import { formatLoopTime, initialLoopRange, parseLoopTime, type LoopDraft, type LoopRange } from "@/lib/loopTime";
import "./loop-editor.css";

export interface LoopEditorProps {
  initialValue?: LoopDraft;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isPreviewing: boolean;
  isDark: boolean;
  isSaving?: boolean;
  onSeek: (time: number) => void;
  onTogglePlayback: () => void;
  onPreview: (range: LoopRange | null) => void;
  onSave: (draft: LoopDraft) => void;
  onCancel: () => void;
}

export function LoopEditor({ initialValue, currentTime, duration, isPlaying, isPreviewing, isDark,
  isSaving = false, onSeek, onTogglePlayback, onPreview, onSave, onCancel }: LoopEditorProps) {
  const id = useId();
  const rangeControlRef = useRef<HTMLSpanElement>(null);
  const dragRef = useRef<{ x: number; start: number; end: number; width: number } | null>(null);
  const [initialRange] = useState(() => initialValue ?? initialLoopRange(currentTime, duration));
  const [startText, setStartText] = useState(formatLoopTime(initialRange.start_time));
  const [endText, setEndText] = useState(formatLoopTime(initialRange.end_time));
  const [label, setLabel] = useState(initialValue?.label ?? "");
  const [repeat, setRepeat] = useState(initialValue?.repeat_count ?? 0);
  const [customRepeat, setCustomRepeat] = useState(false);
  const start = parseLoopTime(startText);
  const end = parseLoopTime(endText);
  const hasAudio = Number.isFinite(duration) && duration >= 1;
  const limit = hasAudio ? Math.floor(duration) : Math.max(end ?? 0, start ?? 0, 60);
  const error = start === null || end === null
    ? "Digite minutos e segundos (1:30) ou só segundos (90)."
    : start >= end ? "O fim precisa vir depois do início."
      : hasAudio && end > duration ? `O trecho precisa terminar até ${formatLoopTime(duration)}.` : null;
  const valid = !error && start !== null && end !== null;
  const selection = [Math.min(start ?? 0, limit), Math.min(end ?? limit, limit)].sort((a, b) => a - b);

  const stopPreview = () => { if (isPreviewing) onPreview(null); };
  const changeTime = (edge: "start" | "end", text: string) => {
    stopPreview();
    (edge === "start" ? setStartText : setEndText)(text);
  };
  const adjustTime = (edge: "start" | "end", delta: number) => {
    const value = edge === "start" ? start : end;
    if (value === null) return;
    changeTime(edge, formatLoopTime(Math.max(0, Math.min(hasAudio ? limit : Infinity, value + delta))));
  };

  return (
    <form
      className="loop-editor"
      data-theme={isDark ? "dark" : "light"}
      data-vaul-no-drag
      onKeyDown={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || isSaving) return;
        onSave({ label: label.trim() || "Meu trecho", start_time: start, end_time: end, repeat_count: repeat });
      }}
    >
      <div className="loop-editor__body">
        <header className="loop-editor__heading">
          <h3>{initialValue ? "Editar loop" : "Novo loop"}</h3>
          <p>Ouça, marque o trecho e ensaie.</p>
        </header>

        <div className="loop-editor__player">
          <button type="button" className="loop-editor__play" disabled={!hasAudio || isSaving}
            onClick={() => { stopPreview(); onTogglePlayback(); }} aria-label={isPlaying ? "Pausar música" : "Reproduzir música"}>
            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
          <div className="loop-editor__scrubber">
            <div className="loop-editor__play-time">
              <span>{formatLoopTime(currentTime)}</span>
              <span>{hasAudio ? formatLoopTime(duration) : "Sem áudio"}</span>
            </div>
            <input type="range" min={0} max={limit} step={1} value={Math.min(currentTime, limit)} disabled={!hasAudio || isSaving}
              aria-label="Posição da música" aria-valuetext={formatLoopTime(currentTime)}
              onChange={(event) => { stopPreview(); onSeek(Number(event.target.value)); }} />
          </div>
          <button type="button" className="loop-editor__icon" disabled={!hasAudio || isSaving}
            aria-label="Voltar 5 segundos" onClick={() => { stopPreview(); onSeek(Math.max(0, currentTime - 5)); }}>
            <RotateCcw size={16} /><span>5s</span>
          </button>
        </div>

        <fieldset disabled={isSaving} className="loop-editor__section">
          <legend className="sr-only">Seleção do trecho</legend>
          <div className="loop-editor__range">
            <div className="loop-editor__range-heading"><span>Selecione na linha do tempo</span><strong>{valid ? `${end - start}s` : "—"}</strong></div>
            <RangeSlider.Root ref={rangeControlRef} className="loop-editor__range-control" value={selection} min={0} max={limit} step={1} minStepsBetweenThumbs={1}
              disabled={!hasAudio || isSaving} onValueChange={([a, b]) => { stopPreview(); setStartText(formatLoopTime(a)); setEndText(formatLoopTime(b)); }}>
              <RangeSlider.Track className="loop-editor__range-track"><RangeSlider.Range
                  className="loop-editor__range-fill"
                  role="button"
                  tabIndex={hasAudio && valid && !isSaving ? 0 : -1}
                  aria-label="Mover trecho inteiro"
                  aria-disabled={!hasAudio || !valid || isSaving}
                  onPointerDown={(event) => {
                    if (!hasAudio || !valid || isSaving) return;
                    event.stopPropagation();
                    event.preventDefault();
                    stopPreview();
                    event.currentTarget.focus();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    dragRef.current = { x: event.clientX, start, end, width: rangeControlRef.current?.getBoundingClientRect().width || 1 };
                  }}
                  onPointerMove={(event) => {
                    const drag = dragRef.current;
                    if (!drag) return;
                    event.stopPropagation();
                    const delta = Math.max(-drag.start, Math.min(limit - drag.end, Math.round((event.clientX - drag.x) / drag.width * limit)));
                    setStartText(formatLoopTime(drag.start + delta));
                    setEndText(formatLoopTime(drag.end + delta));
                  }}
                  onPointerUp={(event) => {
                    if (!dragRef.current) return;
                    event.stopPropagation();
                    dragRef.current = null;
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }}
                  onPointerCancel={() => { dragRef.current = null; }}
                  onKeyDown={(event) => {
                    if (!hasAudio || !valid || isSaving || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
                    event.preventDefault();
                    event.stopPropagation();
                    stopPreview();
                    const step = (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 5 : 1);
                    const delta = Math.max(-start, Math.min(limit - end, step));
                    setStartText(formatLoopTime(start + delta));
                    setEndText(formatLoopTime(end + delta));
                  }}
                ><GripVertical size={14} aria-hidden="true" /></RangeSlider.Range></RangeSlider.Track>
              <span className="loop-editor__playhead" aria-hidden="true" style={{ left: `${Math.min(100, currentTime / limit * 100)}%` }} />
              <RangeSlider.Thumb className="loop-editor__range-thumb" aria-label="Arrastar início do loop" aria-valuetext={formatLoopTime(selection[0])}>A</RangeSlider.Thumb>
              <RangeSlider.Thumb className="loop-editor__range-thumb" aria-label="Arrastar fim do loop" aria-valuetext={formatLoopTime(selection[1])}>B</RangeSlider.Thumb>
            </RangeSlider.Root>
            <div className="loop-editor__range-scale" aria-hidden="true"><span>0:00</span><span>{formatLoopTime(limit / 2)}</span><span>{formatLoopTime(limit)}</span></div>
            <p id={`${id}-hint`} className="loop-editor__hint">{hasAudio ? "Arraste A e B. Pelo centro, mova o trecho inteiro." : "Sem áudio disponível. Você pode digitar os tempos."}</p>
          </div>

          <div className="loop-editor__time-grid">
            {(["start", "end"] as const).map((edge, index) => {
              const text = edge === "start" ? startText : endText;
              const value = edge === "start" ? start : end;
              const name = edge === "start" ? "Início" : "Fim";
              return (
                <div className="loop-editor__boundary" key={edge}>
                  <label htmlFor={`${id}-${edge}`}><span className="loop-editor__letter">{index === 0 ? "A" : "B"}</span>{name}</label>
                  <input id={`${id}-${edge}`} aria-label={`${name} do loop`} type="text" inputMode="text" autoComplete="off" spellCheck={false}
                    value={text} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : `${id}-hint`}
                    onChange={(event) => changeTime(edge, event.target.value)}
                    onBlur={() => { if (value !== null) (edge === "start" ? setStartText : setEndText)(formatLoopTime(value)); }} />
                  <div className="loop-editor__nudge">
                    <button type="button" aria-label={`Diminuir ${name.toLowerCase()} em 1 segundo`} disabled={value === null || value <= 0}
                      onClick={() => adjustTime(edge, -1)}><Minus size={14} /></button>
                    <span>1 segundo</span>
                    <button type="button" aria-label={`Aumentar ${name.toLowerCase()} em 1 segundo`} disabled={value === null || (hasAudio && value >= limit)}
                      onClick={() => adjustTime(edge, 1)}><Plus size={14} /></button>
                  </div>
                  <button type="button" className="loop-editor__mark" disabled={!hasAudio}
                    onClick={() => changeTime(edge, formatLoopTime(currentTime))}>
                    Marcar {name.toLowerCase()} agora
                  </button>
                </div>
              );
            })}
          </div>

          {error && <p id={`${id}-error`} className="loop-editor__error" role="alert">{error}</p>}
          <button type="button" className="loop-editor__preview" disabled={!valid || !hasAudio}
            onClick={() => onPreview(isPreviewing ? null : { start_time: start!, end_time: end! })}>
            {isPreviewing ? <Pause size={15} /> : <Play size={15} />}
            {isPreviewing ? "Parar prévia" : "Ouvir trecho"}
            <span>{valid ? `${formatLoopTime(start)} – ${formatLoopTime(end)}` : "Ajuste os tempos"}</span>
          </button>
        </fieldset>

        <fieldset disabled={isSaving} className="loop-editor__details">
          <label htmlFor={`${id}-label`}>Nome <span>opcional</span></label>
          <input id={`${id}-label`} value={label} onChange={(event) => setLabel(event.target.value)} maxLength={100} placeholder="Ex.: Refrão, ponte, solo…" />
          <div className="loop-editor__name-options" aria-label="Sugestões de nome">
            {["Refrão", "Ponte", "Solo"].map((name) => <button key={name} type="button" aria-pressed={label === name} onClick={() => setLabel(name)}>{name}</button>)}
          </div>
          <span className="loop-editor__label" id={`${id}-repeat`}>Repetir o trecho</span>
          <div className="loop-editor__repeat" role="group" aria-labelledby={`${id}-repeat`}>
            {[0, 2, 4, 8].map((count) => <button key={count} type="button" aria-pressed={repeat === count && !customRepeat}
              onClick={() => { setRepeat(count); setCustomRepeat(false); }}>
              {count === 0 ? <><InfinityIcon size={16} /> Sem parar</> : `${count}×`}
            </button>)}
            <button type="button" aria-pressed={customRepeat || ![0, 2, 4, 8].includes(repeat)}
              onClick={() => { setCustomRepeat(true); if (!repeat) setRepeat(3); }}>Outra</button>
          </div>
          {(customRepeat || ![0, 2, 4, 8].includes(repeat)) && <label className="loop-editor__custom-repeat">Quantidade de vezes
            <input type="number" aria-label="Quantidade de repetições" min={1} max={999} step={1} value={repeat}
              onChange={(event) => setRepeat(Math.min(999, Math.max(1, Math.floor(Number(event.target.value) || 1))))} />
          </label>}
        </fieldset>
      </div>

      <footer className="loop-editor__footer">
        <button type="button" className="loop-editor__cancel" disabled={isSaving} onClick={onCancel}>Cancelar</button>
        <button type="submit" className="loop-editor__save" disabled={!valid || isSaving}>
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          {isSaving ? "Salvando…" : initialValue ? "Salvar alterações" : "Criar loop"}
        </button>
      </footer>
    </form>
  );
}
