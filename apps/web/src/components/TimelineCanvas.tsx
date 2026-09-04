import { useProjectStore } from "../store/projectStore";
import { ClipWaveform } from "./ClipWaveform";

export function TimelineCanvas({ pxPerSecond }: { pxPerSecond: number }) {
  const tracks = useProjectStore((s) => s.tracks);
  const clips = useProjectStore((s) => s.clips);

  return (
    <div className="relative flex-1 overflow-x-auto">
      {tracks.map((track) => (
        <div key={track.id} className="timeline-track relative h-24 border-b border-studio-border">
          {clips.filter((c) => c.trackId === track.id).map((c) => (
            <ClipWaveform key={c.id} clip={c} pxPerSecond={pxPerSecond} />
          ))}
        </div>
      ))}
    </div>
  );
}
