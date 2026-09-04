import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import WaveSurfer from "wavesurfer.js";
import { useProjectStore, type Clip } from "../store/projectStore";
import { useHistoryStore } from "../store/historyStore";
import { secondsToPixels, pixelsToSeconds } from "../lib/time";
import { deleteClipWithHistory } from "../audio/clipEditing";

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
      height: 64,
      waveColor: "#a78bfa",
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
      const finalStartTime = useProjectStore.getState().clips.find((c) => c.id === clip.id)!.startTime;
      const original = dragOriginal!;
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
      onClick={() => selectClip(clip.id)}
      onDoubleClick={() => deleteClipWithHistory(clip)}
      style={{ left: secondsToPixels(clip.startTime, pxPerSecond), width: secondsToPixels(clip.duration, pxPerSecond) }}
      className={`absolute top-1 h-16 cursor-pointer overflow-hidden rounded border ${
        selectedClipId === clip.id ? "border-orange-400" : "border-transparent"
      }`}
    >
      <div ref={containerRef} />
    </div>
  );
}
