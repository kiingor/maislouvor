import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Scissors, Play, Pause, Loader2, RotateCcw } from "lucide-react";

interface AudioTrimmerProps {
  audioPath: string;
  teamId: string;
  songId: string;
  onTrimmed: () => void;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${m}:${sec.toString().padStart(2, "0")}.${ms}`;
}

export function AudioTrimmer({ audioPath, teamId, songId, onTrimmed }: AudioTrimmerProps) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const animFrameRef = useRef<number>(0);

  const [loading, setLoading] = useState(true);
  const [trimming, setTrimming] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [dragging, setDragging] = useState<"start" | "end" | "playhead" | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  // Load audio and decode waveform
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: urlData } = await supabase.storage.from("audio").createSignedUrl(audioPath, 3600);
      if (!urlData?.signedUrl || cancelled) return;
      setSignedUrl(urlData.signedUrl);

      try {
        const response = await fetch(urlData.signedUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioCtx = new AudioContext();
        const buffer = await audioCtx.decodeAudioData(arrayBuffer);
        audioCtx.close();
        if (cancelled) return;
        audioBufferRef.current = buffer;
        setDuration(buffer.duration);
        setTrimEnd(buffer.duration);
        drawWaveform(buffer, 0, buffer.duration);
      } catch {
        toast({ title: "Erro ao carregar áudio", variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [audioPath]);

  // Draw waveform on canvas
  const drawWaveform = useCallback((buffer: AudioBuffer, start: number, end: number, currentPlayhead?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const totalSamples = channelData.length;

    ctx.clearRect(0, 0, w, h);

    // Background
    const isDark = document.documentElement.classList.contains("dark");
    ctx.fillStyle = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)";
    ctx.fillRect(0, 0, w, h);

    // Draw trim regions (dimmed)
    const startPx = (start / buffer.duration) * w;
    const endPx = (end / buffer.duration) * w;

    // Dimmed areas outside trim
    ctx.fillStyle = isDark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.15)";
    ctx.fillRect(0, 0, startPx, h);
    ctx.fillRect(endPx, 0, w - endPx, h);

    // Waveform bars
    const barWidth = 2;
    const gap = 1;
    const step = barWidth + gap;
    const numBars = Math.floor(w / step);

    for (let i = 0; i < numBars; i++) {
      const x = i * step;
      const sampleIdx = Math.floor((i / numBars) * totalSamples);
      const blockSize = Math.floor(totalSamples / numBars);
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(channelData[sampleIdx + j] || 0);
      }
      const avg = sum / blockSize;
      const barH = avg * h * 0.85;

      const inTrim = x >= startPx && x <= endPx;
      if (inTrim) {
        ctx.fillStyle = "hsl(var(--primary))";
      } else {
        ctx.fillStyle = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)";
      }
      ctx.fillRect(x, (h - barH) / 2, barWidth, barH || 1);
    }

    // Trim handles
    const handleW = 4;
    ctx.fillStyle = "hsl(var(--destructive))";
    ctx.fillRect(startPx - handleW / 2, 0, handleW, h);
    ctx.fillStyle = "hsl(var(--destructive))";
    ctx.fillRect(endPx - handleW / 2, 0, handleW, h);

    // Handle grip dots
    [startPx, endPx].forEach((px) => {
      ctx.fillStyle = isDark ? "#fff" : "#000";
      for (let d = -6; d <= 6; d += 6) {
        ctx.beginPath();
        ctx.arc(px, h / 2 + d, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Playhead
    if (currentPlayhead !== undefined) {
      const phPx = (currentPlayhead / buffer.duration) * w;
      ctx.strokeStyle = "hsl(var(--foreground))";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(phPx, 0);
      ctx.lineTo(phPx, h);
      ctx.stroke();
    }
  }, []);

  // Redraw on trim changes
  useEffect(() => {
    if (audioBufferRef.current) {
      drawWaveform(audioBufferRef.current, trimStart, trimEnd, playhead);
    }
  }, [trimStart, trimEnd, playhead, drawWaveform]);

  // Mouse handling for dragging trim handles
  const getTimeFromX = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !duration) return 0;
    const rect = canvas.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return pct * duration;
  }, [duration]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const time = getTimeFromX(e.clientX);
    const startDist = Math.abs(time - trimStart);
    const endDist = Math.abs(time - trimEnd);
    const playheadDist = Math.abs(time - playhead);
    const threshold = duration * 0.02;

    // Prioritize playhead if close
    if (playheadDist < threshold && playheadDist <= startDist && playheadDist <= endDist) {
      setDragging("playhead");
    } else if (startDist < threshold && startDist <= endDist) {
      setDragging("start");
    } else if (endDist < threshold) {
      setDragging("end");
    } else {
      // Click anywhere: seek playhead to that position
      setPlayhead(time);
      if (audioRef.current) {
        audioRef.current.currentTime = time;
      }
      setDragging("playhead");
    }
  }, [getTimeFromX, trimStart, trimEnd, duration, playhead]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const time = getTimeFromX(e.clientX);
      if (dragging === "start") {
        setTrimStart(Math.max(0, Math.min(time, trimEnd - 0.5)));
      } else if (dragging === "end") {
        setTrimEnd(Math.min(duration, Math.max(time, trimStart + 0.5)));
      } else if (dragging === "playhead") {
        const clamped = Math.max(0, Math.min(duration, time));
        setPlayhead(clamped);
        if (audioRef.current) audioRef.current.currentTime = clamped;
      }
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, getTimeFromX, trimStart, trimEnd, duration]);

  // Touch handling
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const time = getTimeFromX(touch.clientX);
    const startDist = Math.abs(time - trimStart);
    const endDist = Math.abs(time - trimEnd);
    const playheadDist = Math.abs(time - playhead);
    const threshold = duration * 0.04;

    if (playheadDist < threshold && playheadDist <= startDist && playheadDist <= endDist) {
      setDragging("playhead");
    } else if (startDist < threshold && startDist <= endDist) {
      setDragging("start");
    } else if (endDist < threshold) {
      setDragging("end");
    } else {
      setPlayhead(time);
      if (audioRef.current) audioRef.current.currentTime = time;
      setDragging("playhead");
    }
  }, [getTimeFromX, trimStart, trimEnd, duration, playhead]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      const time = getTimeFromX(touch.clientX);
      if (dragging === "start") {
        setTrimStart(Math.max(0, Math.min(time, trimEnd - 0.5)));
      } else if (dragging === "end") {
        setTrimEnd(Math.min(duration, Math.max(time, trimStart + 0.5)));
      } else if (dragging === "playhead") {
        const clamped = Math.max(0, Math.min(duration, time));
        setPlayhead(clamped);
        if (audioRef.current) audioRef.current.currentTime = clamped;
      }
    };
    const onUp = () => setDragging(null);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [dragging, getTimeFromX, trimStart, trimEnd, duration]);

  // Preview playback
  const togglePreview = useCallback(() => {
    if (!signedUrl) return;
    if (playing && audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
      cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const audio = new Audio(signedUrl);
    audioRef.current = audio;
    audio.currentTime = trimStart;
    audio.play();
    setPlaying(true);

    const tick = () => {
      if (audio.paused) return;
      setPlayhead(audio.currentTime);
      if (audio.currentTime >= trimEnd) {
        audio.pause();
        setPlaying(false);
        return;
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();

    audio.onended = () => {
      setPlaying(false);
    };
  }, [signedUrl, playing, trimStart, trimEnd]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Reset trim
  const resetTrim = () => {
    setTrimStart(0);
    setTrimEnd(duration);
    setPlayhead(0);
  };

  // Apply trim: re-encode and upload
  const applyTrim = async () => {
    const buffer = audioBufferRef.current;
    if (!buffer) return;

    // Don't trim if nothing changed
    if (trimStart < 0.1 && trimEnd > duration - 0.1) {
      toast({ title: "Nenhum corte aplicado", description: "Ajuste os marcadores para cortar" });
      return;
    }

    setTrimming(true);
    try {
      const sampleRate = buffer.sampleRate;
      const startSample = Math.floor(trimStart * sampleRate);
      const endSample = Math.floor(trimEnd * sampleRate);
      const length = endSample - startSample;
      const numChannels = buffer.numberOfChannels;

      const offlineCtx = new OfflineAudioContext(numChannels, length, sampleRate);
      const newBuffer = offlineCtx.createBuffer(numChannels, length, sampleRate);

      for (let ch = 0; ch < numChannels; ch++) {
        const src = buffer.getChannelData(ch);
        const dest = newBuffer.getChannelData(ch);
        for (let i = 0; i < length; i++) {
          dest[i] = src[startSample + i];
        }
      }

      // Encode to WAV
      const wavBlob = encodeWAV(newBuffer);

      // Upload replacing original
      const ext = audioPath.split(".").pop() || "wav";
      const path = audioPath.endsWith(".wav") ? audioPath : audioPath.replace(/\.[^.]+$/, ".wav");

      const { error } = await supabase.storage.from("audio").upload(path, wavBlob, {
        upsert: true,
        contentType: "audio/wav",
      });

      if (error) throw error;

      // If path changed (was mp3, now wav), update audio_path
      if (path !== audioPath) {
        await supabase.from("songs").update({ audio_path: path } as any).eq("id", songId);
        // Remove old file
        await supabase.storage.from("audio").remove([audioPath]);
      }

      toast({ title: "Áudio cortado!", description: `Duração: ${formatTime(trimEnd - trimStart)}` });
      onTrimmed();
    } catch (e: any) {
      toast({ title: "Erro ao cortar áudio", description: e.message, variant: "destructive" });
    } finally {
      setTrimming(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando waveform...
      </div>
    );
  }

  const hasChanges = trimStart > 0.1 || trimEnd < duration - 0.1;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Cortar áudio</span>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground tabular-nums">
          <span className="text-destructive font-medium">{formatTime(trimStart)}</span>
          <span>—</span>
          <span className="text-destructive font-medium">{formatTime(trimEnd)}</span>
          <span className="ml-1">({formatTime(trimEnd - trimStart)})</span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative rounded-lg overflow-hidden border border-border cursor-col-resize select-none"
        style={{ touchAction: "none" }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <canvas
          ref={canvasRef}
          className="w-full"
          style={{ height: 72 }}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl gap-1"
          onClick={togglePreview}
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          <span className="text-xs">{playing ? "Parar" : "Ouvir"}</span>
        </Button>

        {hasChanges && (
          <Button
            variant="ghost"
            size="sm"
            className="rounded-xl gap-1"
            onClick={resetTrim}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="text-xs">Resetar</span>
          </Button>
        )}

        <div className="flex-1" />

        <Button
          size="sm"
          className="rounded-xl gap-1"
          onClick={applyTrim}
          disabled={trimming || !hasChanges}
        >
          {trimming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scissors className="h-3.5 w-3.5" />}
          <span className="text-xs">{trimming ? "Cortando..." : "Aplicar corte"}</span>
        </Button>
      </div>
    </div>
  );
}

// Encode AudioBuffer to WAV Blob
function encodeWAV(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = length * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Interleave channels and write samples
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = buffer.getChannelData(ch)[i];
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clamped * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
