import type { Clip } from "../api/client";

/**
 * Snap distance in pixels rather than seconds: a fixed time threshold would be
 * unusably coarse when zoomed in and useless when zoomed out.
 */
export const SNAP_THRESHOLD_PX = 8;

/** Coarsest "nice" interval whose on-screen width is at least 40 px. */
export function gridInterval(pxPerSecond: number): number {
  const steps = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  return steps.find((s) => s * pxPerSecond >= 40) ?? steps[steps.length - 1];
}

const GRID_LINES = 400;

export function snapCandidates(
  clips: Clip[],
  playhead: number,
  pxPerSecond: number,
  excludeIds: Set<string> = new Set(),
): number[] {
  const candidates = [0, playhead];
  for (const c of clips) {
    if (excludeIds.has(c.id)) continue;
    candidates.push(c.startTime, c.startTime + c.duration);
  }
  const step = gridInterval(pxPerSecond);
  for (let i = 1; i <= GRID_LINES; i++) candidates.push(i * step);
  return candidates;
}

/** `enabled` is false while Alt is held, which is the conventional snap override. */
export function snapTime(
  rawTime: number,
  candidates: number[],
  pxPerSecond: number,
  enabled: boolean,
): number {
  const time = Math.max(0, rawTime);
  if (!enabled) return time;
  const threshold = SNAP_THRESHOLD_PX / pxPerSecond;
  let best = time;
  let bestDistance = threshold;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - time);
    if (distance <= bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return Math.max(0, best);
}
