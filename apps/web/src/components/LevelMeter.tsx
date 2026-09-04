const SEGMENTS = 12;

/**
 * Segmented level bar. `level` is 0..1 RMS.
 *
 * Lit from the bottom up so it reads like console hardware; the top two
 * segments turn amber/red to flag material approaching clipping.
 */
export function LevelMeter({ level, className = "" }: { level: number; className?: string }) {
  const lit = Math.round(Math.max(0, Math.min(1, level)) * SEGMENTS);

  return (
    <div
      className={`flex h-full w-2 flex-col-reverse gap-px rounded-sm bg-console-inset p-px ${className}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={Number(level.toFixed(2))}
      aria-label="Niveau"
    >
      {Array.from({ length: SEGMENTS }, (_, i) => {
        const on = i < lit;
        const color =
          i >= SEGMENTS - 1
            ? on
              ? "bg-destructive"
              : "bg-destructive/15"
            : i >= SEGMENTS - 3
              ? on
                ? "bg-console-mute"
                : "bg-console-mute/15"
              : on
                ? "bg-console-meter"
                : "bg-console-meter-dim/40";
        return <div key={i} className={`flex-1 rounded-[1px] ${color}`} />;
      })}
    </div>
  );
}
