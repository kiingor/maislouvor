import { useState, useRef, useEffect } from "react";
import { Mic, Square, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Props {
  disabled?: boolean;
  /** Called with the recorded audio blob when the user stops the recording. */
  onRecorded: (blob: Blob) => void;
  /** Avisa o compositor quando a gravação começa/termina (ele cede o espaço ao gravador). */
  onRecordingChange?: (recording: boolean) => void;
  /** Classe extra do botão de microfone (estado parado). */
  className?: string;
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Mantém o foco no campo de texto ao tocar nos botões do compositor (teclado não fecha).
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

export function ChatAudioRecorder({ disabled, onRecorded, onRecordingChange, className }: Props) {
  const { toast } = useToast();
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  // Só apresentação: o compositor troca o campo de texto pelo gravador enquanto grava.
  useEffect(() => {
    onRecordingChange?.(recording);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const cleanup = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    setSeconds(0);
  };

  useEffect(() => {
    return () => {
      // Stop stream on unmount to release the mic.
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    if (recording || disabled) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast({
        title: "Gravação indisponível",
        description: "Seu navegador não suporta gravação de áudio.",
        variant: "destructive",
      });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      cancelledRef.current = false;
      chunksRef.current = [];

      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : undefined;
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const wasCancelled = cancelledRef.current;
        cleanup();
        if (!wasCancelled && blob.size > 0) onRecorded(blob);
      };

      recorder.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err: any) {
      cleanup();
      toast({
        title: "Não foi possível acessar o microfone",
        description: err?.message ?? "Permissão negada.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (!recorderRef.current) return;
    cancelledRef.current = false;
    recorderRef.current.stop();
  };

  const cancelRecording = () => {
    if (!recorderRef.current) {
      cleanup();
      return;
    }
    cancelledRef.current = true;
    recorderRef.current.stop();
  };

  if (recording) {
    // Mensagens do iOS: o campo vira a gravação (ponto vermelho + tempo), Cancelar e Parar.
    return (
      <div className="flex flex-1 min-w-0 items-center gap-1">
        <span className="flex flex-1 min-w-0 items-center gap-2 text-subhead font-medium text-ios-red tabular-nums">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-ios-red" aria-hidden="true" />
          {/* Anunciado uma vez; o tempo fica num role="timer" (aria-live off) para não ser lido a cada segundo. */}
          <span role="status" className="sr-only">Gravando áudio</span>
          <span role="timer" aria-label="Tempo de gravação">{formatTime(seconds)}</span>
        </span>
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={cancelRecording}
          title="Cancelar"
          aria-label="Cancelar"
          className="relative z-[4] before:absolute before:-inset-1 before:rounded-full before:content-[''] grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground active:bg-fill-tertiary"
        >
          <X className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
        </button>
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={stopRecording}
          title="Parar e enviar"
          aria-label="Parar e enviar"
          className="relative z-[4] before:absolute before:-inset-1 before:rounded-full before:content-[''] grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ios-red text-white transition-transform active:scale-95"
        >
          <Square className="h-3.5 w-3.5 fill-current" strokeWidth={2.25} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={keepFocus}
      onClick={startRecording}
      title="Gravar áudio"
      aria-label="Gravar áudio"
      className={cn(
        "relative z-[4] before:absolute before:-inset-1 before:rounded-full before:content-[''] grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground active:bg-fill-tertiary disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
    >
      <Mic className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
    </button>
  );
}
