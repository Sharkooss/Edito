import { computeTicks } from "../lib/ticks";
import { pixelsToSeconds } from "../lib/time";

export const RULER_HEIGHT = 28;

export function TimeRuler({
  pxPerSecond,
  widthPx,
  onSeek,
}: {
  pxPerSecond: number;
  widthPx: number;
  onSeek: (t: number) => void;
}) {
  const ticks = computeTicks(pxPerSecond, widthPx);

  return (
    <div
      className="relative shrink-0 cursor-pointer select-none border-b border-studio-border bg-studio-panel"
      style={{ height: RULER_HEIGHT, width: widthPx }}
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek(pixelsToSeconds(e.clientX - rect.left, pxPerSecond));
      }}
      data-tour="ruler"
    >
      {ticks.map((tick) => (
        <div
          key={tick.time}
          className="pointer-events-none absolute bottom-0"
          style={{ left: tick.time * pxPerSecond }}
        >
          <div
            className={tick.major ? "w-px bg-neutral-500" : "w-px bg-neutral-700"}
            style={{ height: tick.major ? 10 : 5 }}
          />
          {tick.label && (
            <span className="absolute bottom-3 left-1 font-mono text-[10px] tabular-nums text-muted-foreground">
              {tick.label}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
