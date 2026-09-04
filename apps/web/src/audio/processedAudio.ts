import type { Clip } from "../api/client";
import type { MediaLibrary } from "./mediaLibrary";
import { stretchWindow } from "./timeStretch";
import {
  normalizeEffects,
  needsOfflineRender,
  sourceWindow,
  stretchRatio,
  playbackRate,
} from "./effects";

export interface ResolvedAudio {
  buffer: AudioBuffer;
  /** Where the clip's audio begins inside `buffer`. */
  baseOffset: number;
  /** Source seconds consumed per timeline second. */
  rate: number;
}

type MakeBuffer = (channels: number, length: number, sampleRate: number) => AudioBuffer;

/**
 * Resolves a clip to the buffer that should actually play.
 *
 * Clips needing no offline work pass straight through to the shared source
 * buffer, so the common case allocates nothing. Only pitch-preserving speed
 * changes and constant-duration transposition produce a derived buffer, cached
 * on the effect parameters that produced it.
 *
 * Callers read `baseOffset + elapsed * rate` for `duration * rate` seconds —
 * one formula covering both the pass-through and the rendered case.
 */
export class ProcessedAudio {
  private library: MediaLibrary;
  private makeBuffer: MakeBuffer;
  private rendered = new Map<string, ResolvedAudio>();
  private pending = new Map<string, Promise<ResolvedAudio | null>>();
  private listeners = new Set<() => void>();

  constructor(library: MediaLibrary, makeBuffer: MakeBuffer) {
    this.library = library;
    this.makeBuffer = makeBuffer;
  }

  /** Only the fields that change the rendered samples belong in the key. */
  key(clip: Clip): string {
    const fx = normalizeEffects(clip.effects);
    return [
      clip.mediaId,
      clip.sourceOffset.toFixed(4),
      clip.duration.toFixed(4),
      fx.speed,
      fx.pitch,
      fx.preservePitch,
    ].join("|");
  }

  get(clip: Clip): ResolvedAudio | null {
    const fx = normalizeEffects(clip.effects);
    if (!needsOfflineRender(fx)) {
      const buffer = this.library.get(clip.mediaId);
      if (!buffer) return null;
      return { buffer, baseOffset: clip.sourceOffset, rate: playbackRate(fx) };
    }
    return this.rendered.get(this.key(clip)) ?? null;
  }

  isRendering(clip: Clip): boolean {
    return this.pending.has(this.key(clip));
  }

  ensure(clip: Clip): Promise<ResolvedAudio | null> {
    const ready = this.get(clip);
    if (ready) return Promise.resolve(ready);

    const fx = normalizeEffects(clip.effects);
    if (!needsOfflineRender(fx)) {
      return this.library
        .load(clip.mediaId)
        .then((buffer) => ({ buffer, baseOffset: clip.sourceOffset, rate: playbackRate(fx) }))
        .catch(() => null);
    }

    const key = this.key(clip);
    let inFlight = this.pending.get(key);
    if (!inFlight) {
      inFlight = (async () => {
        try {
          const source = await this.library.load(clip.mediaId);
          const window = sourceWindow(clip.duration, fx);
          const derived = stretchWindow(
            source,
            clip.sourceOffset,
            clip.sourceOffset + window,
            stretchRatio(fx),
            this.makeBuffer,
          );
          const resolved: ResolvedAudio = {
            buffer: derived,
            baseOffset: 0,
            rate: playbackRate(fx),
          };
          this.rendered.set(key, resolved);
          return resolved;
        } catch {
          // A clip whose render fails stays silent rather than taking the
          // project down with it.
          return null;
        } finally {
          this.pending.delete(key);
          this.emit();
        }
      })();
      this.pending.set(key, inFlight);
    }
    return inFlight;
  }

  /** Never rejects: one unrenderable clip must not stop the rest from playing. */
  async preload(clips: Clip[]): Promise<void> {
    await Promise.all(clips.map((c) => this.ensure(c).catch(() => null)));
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
