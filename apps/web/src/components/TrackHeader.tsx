import { ChevronDown, ChevronUp, Circle, Headphones, Volume2, VolumeX, X } from "lucide-react";
import { useProjectStore, type Track } from "../store/projectStore";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import { LevelMeter } from "./LevelMeter";
import { cn } from "../lib/utils";
import { HEADER_WIDTH, LANE_HEIGHT } from "./useClipDrag";

const TRACK_COLORS = ["track-1", "track-2", "track-3", "track-4", "track-5", "track-6"];

export function trackColorClass(index: number): string {
  return `bg-${TRACK_COLORS[index % TRACK_COLORS.length]}`;
}

function panLabel(pan: number): string {
  if (pan < -0.05) return `${Math.round(-pan * 100)}G`;
  if (pan > 0.05) return `${Math.round(pan * 100)}D`;
  return "C";
}

/**
 * Fixed at LANE_HEIGHT. The header column and the lane column share one scroll
 * container, so any drift between these two heights immediately shows up as
 * headers sliding out of line with their clips.
 */
export function TrackHeader({
  track,
  index,
  armed,
  level,
  onToggleArm,
}: {
  track: Track;
  index: number;
  armed: boolean;
  level: number;
  onToggleArm: () => void;
}) {
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const reorderTrack = useProjectStore((s) => s.reorderTrack);
  const updateTrack = useProjectStore((s) => s.updateTrack);

  return (
    <div
      className="relative flex border-b border-r border-studio-border bg-studio-panel"
      style={{ height: LANE_HEIGHT, width: HEADER_WIDTH }}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1.5", trackColorClass(index))} />

      <div className="flex min-w-0 flex-1 flex-col gap-1 py-1.5 pl-3 pr-1.5">
        <div className="flex items-center gap-1">
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{track.name}</span>
          <Button
            size="icon"
            variant="ghost"
            className="size-5"
            title="Monter la piste"
            onClick={() => reorderTrack(track.id, "up")}
          >
            <ChevronUp className="size-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-5"
            title="Descendre la piste"
            onClick={() => reorderTrack(track.id, "down")}
          >
            <ChevronDown className="size-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-5 hover:bg-destructive hover:text-destructive-foreground"
            title="Supprimer la piste"
            onClick={() => removeTrack(track.id)}
          >
            <X className="size-3" />
          </Button>
        </div>

        <div className="flex items-center gap-1.5">
          <Volume2 className="size-3 shrink-0 text-muted-foreground" />
          <Slider
            min={0}
            max={1.5}
            step={0.01}
            value={[track.volume]}
            onValueChange={([v]) => updateTrack(track.id, { volume: v })}
          />
          <span className="w-8 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
            {Math.round(track.volume * 100)}%
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="w-3 shrink-0 text-center text-[10px] font-semibold text-muted-foreground">
            P
          </span>
          <Slider
            min={-1}
            max={1}
            step={0.01}
            value={[track.pan]}
            onValueChange={([v]) => updateTrack(track.id, { pan: v })}
          />
          <span className="w-8 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
            {panLabel(track.pan)}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1">
          <button
            type="button"
            aria-pressed={track.muted}
            onClick={() => updateTrack(track.id, { muted: !track.muted })}
            className={cn(
              "flex h-6 items-center justify-center gap-1 rounded border text-[10px] font-semibold transition-colors",
              track.muted
                ? "border-console-mute bg-console-mute text-console-mute-foreground"
                : "border-studio-border bg-console-inset text-muted-foreground hover:bg-studio-border/60",
            )}
          >
            <VolumeX className="size-3" />
            Muet
          </button>
          <button
            type="button"
            aria-pressed={track.soloed}
            onClick={() => updateTrack(track.id, { soloed: !track.soloed })}
            className={cn(
              "flex h-6 items-center justify-center gap-1 rounded border text-[10px] font-semibold transition-colors",
              track.soloed
                ? "border-primary bg-primary text-primary-foreground shadow-[0_0_8px_rgba(249,115,22,0.55)]"
                : "border-studio-border bg-console-inset text-muted-foreground hover:bg-studio-border/60",
            )}
          >
            <Headphones className="size-3" />
            Solo
          </button>
          <button
            type="button"
            aria-pressed={armed}
            onClick={onToggleArm}
            title={armed ? "Désarmer la piste" : "Armer la piste pour enregistrer"}
            className={cn(
              "flex h-6 items-center justify-center gap-1 rounded border text-[10px] font-semibold transition-colors",
              armed
                ? "border-destructive bg-destructive text-destructive-foreground shadow-[0_0_8px_rgba(239,68,68,0.55)]"
                : "border-studio-border bg-console-inset text-muted-foreground hover:bg-studio-border/60",
            )}
          >
            <Circle className={cn("size-2.5", armed && "fill-current")} />
            Rec
          </button>
        </div>
      </div>

      <div className="w-3 shrink-0 py-1.5 pr-1.5">
        <LevelMeter level={level} />
      </div>
    </div>
  );
}
