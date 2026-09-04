import { useProjectStore, type Track } from "../store/projectStore";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";

const TRACK_COLORS = ["track-1", "track-2", "track-3", "track-4", "track-5", "track-6"];

export function trackColorClass(index: number): string {
  return `bg-${TRACK_COLORS[index % TRACK_COLORS.length]}`;
}

export function TrackHeader({ track, index }: { track: Track; index: number }) {
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const reorderTrack = useProjectStore((s) => s.reorderTrack);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  return (
    <div className="flex h-24 w-48 shrink-0 flex-col gap-1 justify-between border-b border-studio-border bg-studio-panel p-2">
      <div className="flex items-center justify-between">
        <span className={`h-2 w-2 rounded-full ${trackColorClass(index)}`} />
        <span className="truncate text-sm font-medium">{track.name}</span>
        <Button size="icon" variant="ghost" onClick={() => reorderTrack(track.id, "up")}>
          ▲
        </Button>
        <Button size="icon" variant="ghost" onClick={() => reorderTrack(track.id, "down")}>
          ▼
        </Button>
        <Button size="icon" variant="ghost" onClick={() => removeTrack(track.id)}>
          ✕
        </Button>
      </div>
      <Slider
        min={0}
        max={1.5}
        step={0.01}
        value={[track.volume]}
        onValueChange={([v]) => updateTrack(track.id, { volume: v })}
      />
      <Slider
        min={-1}
        max={1}
        step={0.01}
        value={[track.pan]}
        onValueChange={([v]) => updateTrack(track.id, { pan: v })}
      />
      <div className="flex gap-1">
        <Button
          size="sm"
          variant={track.muted ? "default" : "outline"}
          onClick={() => updateTrack(track.id, { muted: !track.muted })}
        >
          M
        </Button>
        <Button
          size="sm"
          variant={track.soloed ? "default" : "outline"}
          onClick={() => updateTrack(track.id, { soloed: !track.soloed })}
        >
          S
        </Button>
      </div>
    </div>
  );
}
