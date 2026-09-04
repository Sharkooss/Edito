/** Height of one timeline lane, and therefore of one track header. */
export const LANE_HEIGHT = 112;

/** Width of the sticky track-header column. */
export const HEADER_WIDTH = 240;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function laneIndexAt(y: number, laneHeight: number, laneCount: number): number {
  if (laneCount <= 0) return 0;
  return clamp(Math.floor(y / laneHeight), 0, laneCount - 1);
}

/**
 * Where a dragged clip should land, from pointer travel since the drag started.
 *
 * Vertical travel changes lane, which is what v1 could not do at all: its drag
 * only ever wrote startTime, so a clip was stuck on its original track.
 */
export function dragDestination(args: {
  pointerX: number;
  pointerY: number;
  originX: number;
  originY: number;
  originStart: number;
  originLaneIndex: number;
  pxPerSecond: number;
  laneHeight: number;
  laneCount: number;
}): { laneIndex: number; startTime: number } {
  const {
    pointerX,
    pointerY,
    originX,
    originY,
    originStart,
    originLaneIndex,
    pxPerSecond,
    laneHeight,
    laneCount,
  } = args;

  const startTime = Math.max(0, originStart + (pointerX - originX) / pxPerSecond);
  const laneDelta = Math.round((pointerY - originY) / laneHeight);
  const laneIndex = clamp(originLaneIndex + laneDelta, 0, Math.max(0, laneCount - 1));
  return { laneIndex, startTime };
}
