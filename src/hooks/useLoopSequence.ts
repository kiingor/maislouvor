import { useCallback, useEffect, useRef, useState } from "react";
import type { Database } from "@/integrations/supabase/types";

export type LoopPoint = Database["public"]["Tables"]["song_loop_points"]["Row"];

interface LoopSequence {
  loops: LoopPoint[];
  activeIndex: number;
  repetition: number;
}

const emptySequence = (): LoopSequence => ({ loops: [], activeIndex: 0, repetition: 0 });

export function useLoopSequence(songId: string | undefined) {
  const [sequence, setSequence] = useState<LoopSequence>(emptySequence);
  // Audio events can arrive before React renders the previous transition.
  const sequenceRef = useRef(sequence);

  const updateSequence = useCallback((next: LoopSequence) => {
    sequenceRef.current = next;
    setSequence(next);
  }, []);

  const clearLoops = useCallback(() => updateSequence(emptySequence()), [updateSequence]);

  useEffect(() => {
    clearLoops();
  }, [songId, clearLoops]);

  // Return a seek target only when the current loop changes.
  const removeLoop = useCallback((id: string): number | null => {
    const current = sequenceRef.current;
    const index = current.loops.findIndex((loop) => loop.id === id);
    if (index < 0) return null;

    const loops = current.loops.filter((loop) => loop.id !== id);
    if (!loops.length) {
      clearLoops();
      return null;
    }

    const removedActive = index === current.activeIndex;
    const activeIndex = removedActive
      ? current.activeIndex % loops.length
      : current.activeIndex - (index < current.activeIndex ? 1 : 0);
    updateSequence({
      loops,
      activeIndex,
      repetition: removedActive ? 1 : current.repetition,
    });
    return removedActive ? loops[activeIndex].start_time : null;
  }, [clearLoops, updateSequence]);

  const toggleLoop = useCallback((loop: LoopPoint): number | null => {
    const current = sequenceRef.current;
    if (current.loops.some((selected) => selected.id === loop.id)) return removeLoop(loop.id);

    const isFirst = current.loops.length === 0;
    updateSequence({
      ...current,
      loops: [...current.loops, loop],
      repetition: isFirst ? 1 : current.repetition,
    });
    return isFirst ? loop.start_time : null;
  }, [removeLoop, updateSequence]);

  const advanceLoop = useCallback((time: number): number | null => {
    const current = sequenceRef.current;
    const loop = current.loops[current.activeIndex];
    if (!loop || time < loop.end_time) return null;

    // In a sequence, an infinite loop plays once per round so it cannot block
    // the following loops. A single loop keeps its original repeat behavior.
    const repeatCurrent = loop.repeat_count === 0
      ? current.loops.length === 1
      : current.repetition < loop.repeat_count;
    if (repeatCurrent) {
      updateSequence({ ...current, repetition: current.repetition + 1 });
      return loop.start_time;
    }
    if (current.loops.length === 1) {
      clearLoops();
      return null;
    }

    const activeIndex = (current.activeIndex + 1) % current.loops.length;
    updateSequence({ ...current, activeIndex, repetition: 1 });
    return current.loops[activeIndex].start_time;
  }, [clearLoops, updateSequence]);

  return {
    selectedLoops: sequence.loops,
    activeLoop: sequence.loops[sequence.activeIndex] ?? null,
    currentRepetition: sequence.repetition,
    toggleLoop,
    removeLoop,
    clearLoops,
    advanceLoop,
  };
}
