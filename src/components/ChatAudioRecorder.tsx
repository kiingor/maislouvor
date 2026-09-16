import { useState, useRef, useEffect } from "react";
import { Mic, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Props {
  disabled?: boolean;
  /** Called with the recorded audio blob when the user stops the recording. */
  onRecorded: (blob: Blob) => void;
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ChatAudioRecorder({ disabled, onRecorded }: Props) {
  const { toast } = useToast();
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

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
    return (
      <div className="flex items-center gap-2 shrink-0">
        <span className="flex items-center gap-1.5 text-xs font-medium text-destructive whitespace-nowrap">
          <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
          {formatTime(seconds)}
        </span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="rounded-xl h-9 w-9 text-muted-foreground hover:text-foreground"
          onClick={cancelRecording}
          title="Cancelar"
        >
          <X className="h-5 w-5" />
        </Button>
        <Button
          type="button"
          size="icon"
          className="rounded-xl h-9 w-9 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          onClick={stopRecording}
          title="Parar e enviar"
        >
          <Square className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      disabled={disabled}
      className="rounded-xl h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
      onClick={startRecording}
      title="Gravar áudio"
    >
      <Mic className="h-5 w-5" />
    </Button>
  );
}
