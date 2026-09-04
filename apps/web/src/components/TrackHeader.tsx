import { useProjectStore, type Track } from "../store/projectStore";
import { Button } from "./ui/button";

const TRACK_COLORS = ["track-1", "track-2", "track-3", "track-4", "track-5", "track-6"];

export function trackColorClass(index: number): string {
  return `bg-${TRACK_COLORS[index % TRACK_COLORS.length]}`;
}

export function TrackHeader({ track, index }: { track: Track; index: number }) {
  const removeTrack = useProjectStore((s) => s.removeTrack);
  return (
    <div className="flex h-24 w-48 shrink-0 flex-col justify-between border-b border-studio-border bg-studio-panel p-2">
      <div className="flex items-center justify-between">
        <span className={`h-2 w-2 rounded-full ${trackColorClass(index)}`} />
        <span className="truncate text-sm font-medium">{track.name}</span>
        <Button size="icon" variant="ghost" onClick={() => removeTrack(track.id)}>
          ✕
        </Button>
      </div>
    </div>
  );
}
