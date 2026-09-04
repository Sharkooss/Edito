import type { Clip, Track } from "../api/client";
import { normalizeEffects, type ClipEffects } from "./effects";

export interface ScheduleEntry {
  clipId: string;
  trackId: string;
  mediaId: string;
  /** Seconds from "now"; the caller adds ctx.currentTime. */
  when: number;
  /** Timeline seconds already consumed inside the clip. */
  elapsed: number;
  /** Timeline seconds still to play. */
  duration: number;
  gain: number;
  fadeIn: number;
  fadeOut: number;
  effects: ClipEffects;
}

/**
 * Schedule entries for every clip still audible at or after `playhead`.
 *
 * Everything here is in the timeline domain. Converting to a position inside a
 * buffer is left to the chain builder, because only it knows whether the buffer
 * is the original source or a stretched derivative.
 *
 * Windows are clamped to the real source length. v1 skipped this, so a clip
 * whose trim ran past the end of its file produced an out-of-range start() that
 * silently played nothing.
 */
export function computeSchedule(
  clips: Clip[],
  playhead: number,
  sourceDurations: Map<string, number>,
): ScheduleEntry[] {
  const entries: ScheduleEntry[] = [];
  for (const clip of clips) {
    const sourceDuration = sourceDurations.get(clip.mediaId);
    if (sourceDuration === undefined) continue;

    const effects = normalizeEffects(clip.effects);
    const elapsed = Math.max(0, playhead - clip.startTime);
    const remaining = clip.duration - elapsed;
    if (remaining <= 0) continue;

    // Source left after the part already consumed, converted back into timeline
    // seconds so it can be compared with `remaining`.
    const sourceConsumed = clip.sourceOffset + elapsed * effects.speed;
    const sourceLeft = sourceDuration - sourceConsumed;
    const playable = Math.min(remaining, sourceLeft / effects.speed);
    if (playable <= 0) continue;

    entries.push({
      clipId: clip.id,
      trackId: clip.trackId,
      mediaId: clip.mediaId,
      when: Math.max(0, clip.startTime - playhead),
      elapsed,
      duration: playable,
      gain: clip.gain,
      fadeIn: clip.fadeIn,
      fadeOut: clip.fadeOut,
      effects,
    });
  }
  return entries;
}

export function projectDuration(clips: Clip[]): number {
  return clips.reduce((end, c) => Math.max(end, c.startTime + c.duration), 0);
}

/** Solo wins over mute, matching how every DAW behaves. */
export function audibleTracks(tracks: Track[]): Set<string> {
  const anySoloed = tracks.some((t) => t.soloed);
  return new Set(tracks.filter((t) => (anySoloed ? t.soloed : !t.muted)).map((t) => t.id));
}
