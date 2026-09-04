import type { Clip } from "../api/client";
import { useProjectStore } from "../store/projectStore";
import { useHistoryStore } from "../store/historyStore";
import { randomUUID } from "../lib/uuid";
import { resolvePlacement } from "./overlap";

/** Below this, a clip is a click rather than audio. */
export const MIN_CLIP_DURATION = 0.05;

/**
 * Every mutation swaps whole clip-array snapshots.
 *
 * useHistoryStore.push() runs do() immediately, so a command has to be safe to
 * replay verbatim on redo. Snapshot swapping is; v1's "apply, revert, then push
 * a command that re-applies" dance was not, and it lost edits whenever the
 * revert and the replay disagreed.
 */
function commit(mutate: () => void): void {
  const before = useProjectStore.getState().clips;
  mutate();
  const after = useProjectStore.getState().clips;
  if (before === after) return;
  useHistoryStore.getState().push({
    do: () => useProjectStore.setState({ clips: after }),
    undo: () => useProjectStore.setState({ clips: before }),
  });
}

/**
 * Split at an absolute timeline position. Returns null when the cut would leave
 * either half shorter than MIN_CLIP_DURATION.
 *
 * The right half's sourceOffset advances by exactly the left half's duration,
 * so the seam never drifts no matter how many times a clip is cut.
 */
export function splitClip(clip: Clip, atTime: number): [Clip, Clip] | null {
  const leftDuration = atTime - clip.startTime;
  const rightDuration = clip.duration - leftDuration;
  if (leftDuration < MIN_CLIP_DURATION || rightDuration < MIN_CLIP_DURATION) return null;

  const left: Clip = {
    ...clip,
    duration: leftDuration,
    fadeIn: Math.min(clip.fadeIn, leftDuration),
    fadeOut: 0,
  };
  const right: Clip = {
    ...clip,
    id: randomUUID(),
    startTime: atTime,
    sourceOffset: clip.sourceOffset + leftDuration,
    duration: rightDuration,
    fadeIn: 0,
    fadeOut: Math.min(clip.fadeOut, rightDuration),
  };
  return [left, right];
}

export function splitClipsAt(clipIds: string[], atTime: number): void {
  commit(() => {
    const { clips } = useProjectStore.getState();
    const targets = new Set(clipIds);
    const next: Clip[] = [];
    let changed = false;
    for (const clip of clips) {
      const halves = targets.has(clip.id) ? splitClip(clip, atTime) : null;
      if (halves) {
        next.push(halves[0], halves[1]);
        changed = true;
      } else {
        next.push(clip);
      }
    }
    if (changed) useProjectStore.setState({ clips: next });
  });
}

export function deleteClips(clipIds: string[]): void {
  const doomed = new Set(clipIds);
  commit(() => {
    const { clips, selectedClipIds } = useProjectStore.getState();
    if (!clips.some((c) => doomed.has(c.id))) return;
    useProjectStore.setState({
      clips: clips.filter((c) => !doomed.has(c.id)),
      selectedClipIds: selectedClipIds.filter((id) => !doomed.has(id)),
    });
  });
}

export function duplicateClips(clipIds: string[]): void {
  commit(() => {
    const { clips } = useProjectStore.getState();
    const originals = clips.filter((c) => clipIds.includes(c.id));
    if (originals.length === 0) return;
    let working = clips;
    for (const original of originals) {
      const startTime = resolvePlacement(
        working,
        original.trackId,
        original.startTime + original.duration,
        original.duration,
      );
      working = [...working, { ...original, id: randomUUID(), startTime }];
    }
    useProjectStore.setState({ clips: working });
  });
}

/**
 * Move clips in time and/or across tracks. Destinations that would overlap are
 * nudged to the nearest free slot rather than allowed to stack.
 */
export function moveClips(
  moves: Array<{ id: string; trackId: string; startTime: number }>,
): void {
  commit(() => {
    const { clips } = useProjectStore.getState();
    const moving = new Set(moves.map((m) => m.id));
    const byId = new Map(clips.map((c) => [c.id, c]));
    // Settled moves join the collision set so a group drag does not self-overlap.
    let settled = clips.filter((c) => !moving.has(c.id));
    const placed = new Map<string, Clip>();

    for (const move of moves) {
      const clip = byId.get(move.id);
      if (!clip) continue;
      const startTime = resolvePlacement(settled, move.trackId, move.startTime, clip.duration);
      const next = { ...clip, trackId: move.trackId, startTime };
      placed.set(clip.id, next);
      settled = [...settled, next];
    }
    if (placed.size === 0) return;
    useProjectStore.setState({ clips: clips.map((c) => placed.get(c.id) ?? c) });
  });
}

/** `newTime` is the absolute timeline position the dragged edge landed on. */
export function trimClip(id: string, edge: "left" | "right", newTime: number): void {
  commit(() => {
    const { clips, media } = useProjectStore.getState();
    const clip = clips.find((c) => c.id === id);
    if (!clip) return;
    const sourceDuration = media.find((m) => m.id === clip.mediaId)?.duration ?? Infinity;

    let patch: Partial<Clip>;
    if (edge === "left") {
      const latest = clip.startTime + clip.duration - MIN_CLIP_DURATION;
      // Cannot pull earlier than the source's own beginning.
      const earliest = clip.startTime - clip.sourceOffset;
      const start = Math.min(latest, Math.max(earliest, newTime));
      const delta = start - clip.startTime;
      patch = {
        startTime: start,
        sourceOffset: Math.max(0, clip.sourceOffset + delta),
        duration: clip.duration - delta,
      };
    } else {
      const maxDuration = sourceDuration - clip.sourceOffset;
      const duration = Math.min(maxDuration, Math.max(MIN_CLIP_DURATION, newTime - clip.startTime));
      patch = { duration };
    }

    const next = { ...clip, ...patch };
    next.fadeIn = Math.min(next.fadeIn, next.duration);
    next.fadeOut = Math.min(next.fadeOut, next.duration);
    useProjectStore.setState({ clips: clips.map((c) => (c.id === id ? next : c)) });
  });
}

export function setClipFade(id: string, edge: "in" | "out", seconds: number): void {
  commit(() => {
    const { clips } = useProjectStore.getState();
    const clip = clips.find((c) => c.id === id);
    if (!clip) return;
    const value = Math.max(0, Math.min(seconds, clip.duration));
    const next = edge === "in" ? { ...clip, fadeIn: value } : { ...clip, fadeOut: value };
    useProjectStore.setState({ clips: clips.map((c) => (c.id === id ? next : c)) });
  });
}

export function setClipGain(id: string, gain: number): void {
  commit(() => {
    const { clips } = useProjectStore.getState();
    const clip = clips.find((c) => c.id === id);
    if (!clip) return;
    const value = Math.max(0, Math.min(4, gain));
    useProjectStore.setState({
      clips: clips.map((c) => (c.id === id ? { ...c, gain: value } : c)),
    });
  });
}
