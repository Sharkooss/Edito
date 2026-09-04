import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import WaveSurfer from "wavesurfer.js";
import { useProjectStore, type Clip } from "../store/projectStore";
import { useHistoryStore } from "../store/historyStore";
import { secondsToPixels, pixelsToSeconds } from "../lib/time";
import { deleteClipWithHistory, hasClipChanged } from "../audio/clipEditing";

function useEdgeDrag(
  clip: Clip,
  pxPerSecond: number,
  edge: "left" | "right",
  updateClip: (id: string, patch: Partial<Clip>) => void
) {
  const [active, setActive] = useState(false);

  function onMouseDown(e: ReactMouseEvent) {
    e.stopPropagation();
    setActive(true);
  }

  useEffect(() => {
    if (!active) return;
    const original = { ...clip };
    function onMove(e: globalThis.MouseEvent) {
      const rect = (e.target as HTMLElement).closest(".timeline-track")?.getBoundingClientRect();
      if (!rect) return;
      const timeAtCursor = pixelsToSeconds(e.clientX - rect.left, pxPerSecond);
      if (edge === "left") {
        const newStart = Math.min(timeAtCursor, original.startTime + original.duration - 0.1);
        const delta = newStart - original.startTime;
        updateClip(clip.id, { startTime: newStart, sourceOffset: original.sourceOffset + delta, duration: original.duration - delta });
      } else {
        const newDuration = Math.max(0.1, timeAtCursor - original.startTime);
        updateClip(clip.id, { duration: newDuration });
      }
    }
    function onUp() {
      const current = useProjectStore.getState().clips.find((c) => c.id === clip.id)!;
      if (!hasClipChanged(original, current)) {
        setActive(false);
        return;
      }
      updateClip(clip.id, { startTime: original.startTime, sourceOffset: original.sourceOffset, duration: original.duration });
      useHistoryStore.getState().push({
        do: () => updateClip(clip.id, { startTime: current.startTime, sourceOffset: current.sourceOffset, duration: current.duration }),
        undo: () => updateClip(clip.id, { startTime: original.startTime, sourceOffset: original.sourceOffset, duration: original.duration }),
      });
      setActive(false);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, { once: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [active]);

  return onMouseDown;
}

export function ClipWaveform({ clip, pxPerSecond }: { clip: Clip; pxPerSecond: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const media = useProjectStore((s) => s.media.find((m) => m.id === clip.mediaId));
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const selectClip = useProjectStore((s) => s.selectClip);
  const updateClip = useProjectStore((s) => s.updateClip);
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [dragOriginal, setDragOriginal] = useState<{ startTime: number; trackId: string } | null>(null);

  useEffect(() => {
    if (!containerRef.current || !media) return;
    const ws = WaveSurfer.create({
      container: containerRef.current,
      height: 96,
      waveColor: "#4dd0e1",
      progressColor: "#f97316",
      cursorWidth: 0,
      interact: false,
      url: `/api/media/${media.id}`,
    });
    return () => ws.destroy();
  }, [media]);

  function handleMouseDown(e: ReactMouseEvent) {
    e.stopPropagation();
    setDragStartX(e.clientX);
    setDragOriginal({ startTime: clip.startTime, trackId: clip.trackId });
    selectClip(clip.id);
  }

  useEffect(() => {
    if (dragStartX === null || !dragOriginal) return;
    function onMove(e: globalThis.MouseEvent) {
      const deltaSeconds = pixelsToSeconds(e.clientX - dragStartX!, pxPerSecond);
      updateClip(clip.id, { startTime: Math.max(0, dragOriginal!.startTime + deltaSeconds) });
    }
    function onUp() {
      const finalClip = useProjectStore.getState().clips.find((c) => c.id === clip.id)!;
      const original = dragOriginal!;
      const originalSnapshot = { startTime: original.startTime, sourceOffset: clip.sourceOffset, duration: clip.duration };
      const currentSnapshot = { startTime: finalClip.startTime, sourceOffset: finalClip.sourceOffset, duration: finalClip.duration };
      const finalStartTime = finalClip.startTime;
      if (!hasClipChanged(originalSnapshot, currentSnapshot)) {
        setDragStartX(null);
        setDragOriginal(null);
        return;
      }
      updateClip(clip.id, { startTime: original.startTime }); // revert, puis rejouer via l'historique
      useHistoryStore.getState().push({
        do: () => updateClip(clip.id, { startTime: finalStartTime }),
        undo: () => updateClip(clip.id, { startTime: original.startTime }),
      });
      setDragStartX(null);
      setDragOriginal(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, { once: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragStartX, dragOriginal, clip.id, pxPerSecond, updateClip]);

  return (
    <div
      onMouseDown={handleMouseDown}
      onClick={(e) => { e.stopPropagation(); selectClip(clip.id); }}
      onDoubleClick={() => deleteClipWithHistory(clip)}
      style={{ left: secondsToPixels(clip.startTime, pxPerSecond), width: secondsToPixels(clip.duration, pxPerSecond) }}
      className={`absolute top-2 h-24 cursor-pointer overflow-hidden rounded-md border bg-console-inset ${
        selectedClipId === clip.id ? "border-primary shadow-[0_0_0_1px_rgba(249,115,22,0.4)]" : "border-studio-border"
      }`}
    >
      <span className="pointer-events-none absolute left-1.5 top-1 z-10 max-w-[calc(100%-0.75rem)] truncate rounded bg-studio-bg/70 px-1 font-mono text-[11px] text-muted-foreground">
        {clip.name}
      </span>
      <div ref={containerRef} />
      <div onMouseDown={useEdgeDrag(clip, pxPerSecond, "left", updateClip)} className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize bg-white/10 hover:bg-white/25" />
      <div onMouseDown={useEdgeDrag(clip, pxPerSecond, "right", updateClip)} className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize bg-white/10 hover:bg-white/25" />
    </div>
  );
}
