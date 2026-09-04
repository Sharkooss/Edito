import { useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";
import { useProjectStore, type Clip } from "../store/projectStore";
import { secondsToPixels } from "../lib/time";

export function ClipWaveform({ clip, pxPerSecond }: { clip: Clip; pxPerSecond: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const media = useProjectStore((s) => s.media.find((m) => m.id === clip.mediaId));
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const selectClip = useProjectStore((s) => s.selectClip);

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

  return (
    <div
      onClick={() => selectClip(clip.id)}
      style={{ left: secondsToPixels(clip.startTime, pxPerSecond), width: secondsToPixels(clip.duration, pxPerSecond) }}
      className={`absolute top-1 h-16 cursor-pointer overflow-hidden rounded border ${
        selectedClipId === clip.id ? "border-orange-400" : "border-transparent"
      }`}
    >
      <div ref={containerRef} />
    </div>
  );
}
