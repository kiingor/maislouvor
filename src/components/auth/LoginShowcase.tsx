import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, ListMusic, Music2, Plus, Users } from "lucide-react";

const slides = [
  { title: "Sua equipe em sintonia.", description: "Escalas e repertórios em um só lugar.", label: "Equipe e repertórios" },
  { title: "O tom certo, na sua mão.", description: "Separe as faixas. Ensaie no seu tom.", label: "Cifras e ensaio" },
  { title: "Comece no plano gratuito.", description: "Experimente com a sua equipe.", label: "Plano gratuito" },
];
const INTERVAL = 6500;

/** Ilustrações do produto, sem dados de uma conta nem controles falsos acessíveis. */
function ProductIllustration({ slide }: { slide: number }) {
  return (
    <div className="login-product-art" aria-hidden="true">
      <div className="login-sheet-back" />
      <div className={`login-music-sheet login-music-sheet--${slide}`}>
        {slide === 0 ? <>
          <div className="login-sheet-heading"><span><ListMusic size={14} /> Repertório de domingo</span><span>19h</span></div>
          <div className="login-setlist-row"><span className="login-mini-note"><Music2 size={16} /></span><div><strong>Abertura</strong><span>Prontos para louvar</span></div><span className="login-chord-tag">G</span></div>
          <div className="login-sheet-bottom"><span className="login-mini-avatars"><i><Users size={12} /></i><i><Music2 size={12} /></i><i><Check size={12} /></i></span><span>Sua equipe, uma só voz</span></div>
        </> : slide === 1 ? <>
          <div className="login-sheet-heading"><span><Music2 size={14} /> Modo ensaio</span><span>Tom: G</span></div>
          <div className="login-stem-mixer">{[{ label: "Voz", level: "76%" }, { label: "Baixo", level: "48%" }, { label: "Bateria", level: "62%" }].map(track => (
            <div className="login-stem-row" key={track.label}><span>{track.label}</span><i><b style={{ width: track.level }} /></i></div>
          ))}</div>
          <div className="login-sheet-bottom"><span>Cifras · Letras · Transposição</span><ChevronRight size={14} /></div>
        </> : <>
          <div className="login-sheet-heading"><span><Users size={14} /> Espaço da sua equipe</span><Check size={14} /></div>
          <div className="login-free-plan"><div><span>Seu ponto de partida</span><strong>Plano gratuito</strong></div><span className="login-plan-plus"><Plus size={23} /></span></div>
          <div className="login-sheet-bottom"><span>Vamos preparar o primeiro culto?</span><ChevronRight size={14} /></div>
        </>}
      </div>
    </div>
  );
}

export function LoginShowcase() {
  const [slide, setSlide] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [dragging, setDragging] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const running = !reducedMotion && visible && !dragging;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => setReducedMotion(media.matches);
    const onVisibility = () => setVisible(!document.hidden);
    media.addEventListener("change", onMotion);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      media.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setSlide(current => (current + 1) % slides.length), INTERVAL);
    return () => window.clearTimeout(timer);
  }, [running, slide]);

  const select = (index: number) => {
    setSlide((index + slides.length) % slides.length);
  };
  const startDrag = (x: number, y: number) => {
    touchStart.current = { x, y };
    setDragging(true);
  };
  const cancelDrag = () => {
    touchStart.current = null;
    setDragging(false);
  };
  const finishDrag = (x: number, y: number) => {
    if (touchStart.current) {
      const dx = x - touchStart.current.x;
      const dy = y - touchStart.current.y;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) select(slide + (dx < 0 ? 1 : -1));
    }
    cancelDrag();
  };

  return (
    <section className="login-showcase" aria-label="Conheça o +Louvor" aria-roledescription="carrossel"
      onPointerDown={event => {
        if (event.pointerType !== "mouse" || event.button !== 0 || (event.target as Element).closest("button")) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        startDrag(event.clientX, event.clientY);
      }}
      onPointerUp={event => { if (event.pointerType === "mouse") finishDrag(event.clientX, event.clientY); }}
      onPointerCancel={event => { if (event.pointerType === "mouse") cancelDrag(); }}
      onLostPointerCapture={event => { if (event.pointerType === "mouse") cancelDrag(); }}
      onKeyDown={event => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          select(slide + (event.key === "ArrowRight" ? 1 : -1));
        }
      }}
      onTouchStart={event => { const point = event.touches[0]; startDrag(point.clientX, point.clientY); }}
      onTouchEnd={event => {
        const point = event.changedTouches[0];
        finishDrag(point.clientX, point.clientY);
      }}
      onTouchCancel={cancelDrag}>
      <div className="login-slide-stage" aria-live={running ? "off" : "polite"} aria-atomic="true">
        {slides.map((item, index) => <div className="login-slide" data-active={slide === index} key={item.label} role="group" aria-roledescription="slide" aria-label={`${index + 1} de ${slides.length}`} aria-hidden={slide !== index}>
          <ProductIllustration slide={index} />
          <h2>{item.title}</h2>
          <p>{item.description}</p>
        </div>)}
      </div>
      <div className="login-carousel-controls">
        <div className="login-carousel-pages" role="group" aria-label="Telas de apresentação">
          {slides.map((item, index) => <button key={item.label} type="button" aria-label={item.label} aria-current={slide === index ? "true" : undefined} onClick={() => select(index)}>
            <span className={slide === index ? "is-selected" : ""}>{slide === index && running && <i key={`${slide}-${running}`} />}</span>
          </button>)}
        </div>
      </div>
    </section>
  );
}
