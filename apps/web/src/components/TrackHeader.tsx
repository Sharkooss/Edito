import { ChevronDown, ChevronUp, Headphones, Volume2, VolumeX, X } from "lucide-react";
import { useProjectStore, type Track } from "../store/projectStore";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import { cn } from "../lib/utils";

const TRACK_COLORS = ["track-1", "track-2", "track-3", "track-4", "track-5", "track-6"];

export function trackColorClass(index: number): string {
  return `bg-${TRACK_COLORS[index % TRACK_COLORS.length]}`;
}

function panLabel(pan: number): string {
  if (pan < -0.05) return `${Math.round(-pan * 100)}G`;
  if (pan > 0.05) return `${Math.round(pan * 100)}D`;
  return "C";
}

export function TrackHeader({ track, index }: { track: Track; index: number }) {
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const reorderTrack = useProjectStore((s) => s.reorderTrack);
  const updateTrack = useProjectStore((s) => s.updateTrack);

  return (
    <div className="relative h-40 w-60 shrink-0 border-b border-studio-border bg-studio-panel">
      <span className={cn("absolute inset-y-0 left-0 w-1.5", trackColorClass(index))} />

      <div className="flex h-full flex-col gap-2 py-2 pl-4 pr-2">
        <div className="flex items-center justify-between gap-1">
          <span className="truncate text-sm font-medium">{track.name}</span>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              title="Monter la piste"
              onClick={() => reorderTrack(track.id, "up")}
            >
              <ChevronUp className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              title="Descendre la piste"
              onClick={() => reorderTrack(track.id, "down")}
            >
              <ChevronDown className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-6 hover:bg-destructive hover:text-destructive-foreground"
              title="Supprimer la piste"
              onClick={() => removeTrack(track.id)}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Volume2 className="size-3.5 shrink-0 text-muted-foreground" />
          <Slider
            min={0}
            max={1.5}
            step={0.01}
            value={[track.volume]}
            onValueChange={([v]) => updateTrack(track.id, { volume: v })}
          />
          <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
            {Math.round(track.volume * 100)}%
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-3.5 shrink-0 text-center text-[11px] font-semibold text-muted-foreground">P</span>
          <Slider
            min={-1}
            max={1}
            step={0.01}
            value={[track.pan]}
            onValueChange={([v]) => updateTrack(track.id, { pan: v })}
          />
          <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
            {panLabel(track.pan)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            aria-pressed={track.muted}
            onClick={() => updateTrack(track.id, { muted: !track.muted })}
            className={cn(
              "flex h-8 items-center justify-center gap-1.5 rounded-md border text-xs font-semibold transition-colors",
              track.muted
                ? "border-console-mute bg-console-mute text-console-mute-foreground"
                : "border-studio-border bg-console-inset text-muted-foreground hover:bg-studio-border/60"
            )}
          >
            <VolumeX className="size-3.5" />
            Muet
          </button>
          <button
            type="button"
            aria-pressed={track.soloed}
            onClick={() => updateTrack(track.id, { soloed: !track.soloed })}
            className={cn(
              "flex h-8 items-center justify-center gap-1.5 rounded-md border text-xs font-semibold transition-colors",
              track.soloed
                ? "border-primary bg-primary text-primary-foreground shadow-[0_0_8px_rgba(249,115,22,0.55)]"
                : "border-studio-border bg-console-inset text-muted-foreground hover:bg-studio-border/60"
            )}
          >
            <Headphones className="size-3.5" />
            Solo
          </button>
        </div>
      </div>
    </div>
  );
}
