import { gridInterval } from "../audio/snapping";
import { formatTime } from "./time";

export interface Tick {
  time: number;
  label: string | null;
  major: boolean;
}

const MAX_TICKS = 300;
const MAJOR_EVERY = 4;

/**
 * Ruler ticks covering `widthPx` of timeline at `pxPerSecond`.
 *
 * Spacing comes from the same gridInterval() the snapping uses, so a tick the
 * user sees is a position they can actually snap to.
 */
export function computeTicks(pxPerSecond: number, widthPx: number): Tick[] {
  const origin: Tick = { time: 0, label: formatTime(0), major: true };
  if (widthPx <= 0 || pxPerSecond <= 0) return [origin];

  const step = gridInterval(pxPerSecond);
  const visibleSeconds = widthPx / pxPerSecond;
  const count = Math.min(MAX_TICKS, Math.floor(visibleSeconds / step));

  const ticks: Tick[] = [origin];
  for (let i = 1; i <= count; i++) {
    const time = i * step;
    const major = i % MAJOR_EVERY === 0;
    ticks.push({ time, label: major ? formatTime(time) : null, major });
  }
  return ticks;
}
