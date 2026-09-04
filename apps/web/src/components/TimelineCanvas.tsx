import { useProjectStore } from "../store/projectStore";
import { ClipWaveform } from "./ClipWaveform";
import { secondsToPixels, pixelsToSeconds } from "../lib/time";

export function TimelineCanvas({
  pxPerSecond, currentTime, onSeek,
}: { pxPerSecond: number; currentTime: number; onSeek: (t: number) => void }) {
  const tracks = useProjectStore((s) => s.tracks);
  const clips = useProjectStore((s) => s.clips);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(pixelsToSeconds(e.clientX - rect.left, pxPerSecond));
  }

  return (
    <div className="relative flex-1 overflow-x-auto" onClick={handleClick}>
      <div
        className="pointer-events-none absolute top-0 z-10 h-full w-px bg-orange-400"
        style={{ left: secondsToPixels(currentTime, pxPerSecond) }}
      />
      {[...tracks]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((track) => (
          <div key={track.id} className="timeline-track relative h-24 border-b border-studio-border">
            {clips.filter((c) => c.trackId === track.id).map((c) => (
              <ClipWaveform key={c.id} clip={c} pxPerSecond={pxPerSecond} />
            ))}
          </div>
        ))}
    </div>
  );
}
