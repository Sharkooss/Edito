import type { Clip } from "../api/client";

const EPSILON = 1e-6;

/** Clips that merely touch (one ends exactly where the next begins) do not overlap. */
export function overlaps(aStart: number, aDur: number, bStart: number, bDur: number): boolean {
  return aStart < bStart + bDur - EPSILON && bStart < aStart + aDur - EPSILON;
}

function occupied(clips: Clip[], trackId: string, excludeIds: Set<string>): Clip[] {
  return clips
    .filter((c) => c.trackId === trackId && !excludeIds.has(c.id))
    .sort((a, b) => a.startTime - b.startTime);
}

/**
 * The closest start time to `requestedStart` at which `duration` fits on
 * `trackId` without overlapping anything.
 *
 * Candidate positions are the request itself plus every clip edge, which is
 * sufficient: any legal placement can be slid toward the request until it butts
 * against an edge, so the optimum is always either the request or an edge.
 *
 * This is the single choke point for the "clips on a track never overlap"
 * invariant — import, drag, paste, duplicate and recording all route through it.
 */
export function resolvePlacement(
  clips: Clip[],
  trackId: string,
  requestedStart: number,
  duration: number,
  excludeIds: Set<string> = new Set(),
): number {
  const others = occupied(clips, trackId, excludeIds);
  const fits = (start: number) =>
    start >= -EPSILON && !others.some((c) => overlaps(start, duration, c.startTime, c.duration));

  const wanted = Math.max(0, requestedStart);
  if (fits(wanted)) return wanted;

  const candidates = [0];
  for (const c of others) {
    candidates.push(c.startTime + c.duration); // butt up after it
    candidates.push(c.startTime - duration); // butt up before it
  }

  let best: number | null = null;
  let bestDistance = Infinity;
  for (const raw of candidates) {
    const candidate = Math.max(0, raw);
    if (!fits(candidate)) continue;
    const distance = Math.abs(candidate - wanted);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best ?? firstFreeSlot(clips, trackId, duration);
}

/** Earliest position where `duration` fits, scanning gaps left to right. */
export function firstFreeSlot(clips: Clip[], trackId: string, duration: number): number {
  const others = occupied(clips, trackId, new Set());
  let cursor = 0;
  for (const c of others) {
    if (c.startTime - cursor >= duration - EPSILON) return cursor;
    cursor = Math.max(cursor, c.startTime + c.duration);
  }
  return cursor;
}
