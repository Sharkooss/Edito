import type { AudioEngine } from "./engine";
import type { MediaLibrary } from "./mediaLibrary";
import type { Track, Clip } from "../api/client";
import { computeSchedule, projectDuration, audibleTracks, type ScheduleEntry } from "./scheduling";

type TimeListener = (t: number) => void;
type EndedListener = () => void;

const CLOCK_INTERVAL_MS = 30;

/**
 * Playback clock and scheduler.
 *
 * Two v1 behaviours are deliberately gone. Buffers are no longer fetched inside
 * play()/seek() — the library preloads them, so scheduling is synchronous and a
 * seek during playback cannot race a slower earlier seek. And the clock now
 * notices the end of the project and stops itself instead of running forever.
 */
export class Transport {
  private engine: AudioEngine;
  private library: MediaLibrary;
  private clips: Clip[] = [];
  private tracks: Track[] = [];

  private playing = false;
  /** Playhead value at the moment the current playback segment started. */
  private anchorTime = 0;
  /** ctx.currentTime at that same moment. */
  private anchorContextTime = 0;

  private sources: AudioBufferSourceNode[] = [];
  private timeListeners = new Set<TimeListener>();
  private endedListeners = new Set<EndedListener>();
  private clockId: ReturnType<typeof setInterval> | null = null;
  /** Whether reaching the end of the last clip should stop playback. */
  private stopAtEnd = true;
  /** Set false while recording, so the take can run past the existing material. */
  private autoStopAllowed = true;

  constructor(engine: AudioEngine, library: MediaLibrary) {
    this.engine = engine;
    this.library = library;
  }

  setProject(clips: Clip[], tracks: Track[]): void {
    this.clips = clips;
    this.tracks = tracks;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getCurrentTime(): number {
    if (!this.playing) return this.anchorTime;
    const ctx = this.engine.getContext();
    return this.anchorTime + (ctx.currentTime - this.anchorContextTime);
  }

  async play(): Promise<void> {
    if (this.playing) return;
    await this.engine.unlock();
    await this.library.preload(this.clips.map((c) => c.mediaId));
    this.schedule(this.anchorTime);
    this.startClock();
  }

  pause(): void {
    if (!this.playing) return;
    const at = this.getCurrentTime();
    this.stopSources();
    this.playing = false;
    this.anchorTime = at;
    this.stopClock();
    this.emitTime();
  }

  stop(): void {
    this.stopSources();
    this.playing = false;
    this.anchorTime = 0;
    this.stopClock();
    this.emitTime();
  }

  /** Synchronous, and safe to call mid-playback: buffers are already resident. */
  seek(seconds: number): void {
    const target = Math.max(0, seconds);
    if (this.playing) {
      this.stopSources();
      this.schedule(target);
    } else {
      this.anchorTime = target;
    }
    this.emitTime();
  }

  onTimeUpdate(cb: TimeListener): () => void {
    this.timeListeners.add(cb);
    return () => this.timeListeners.delete(cb);
  }

  onEnded(cb: EndedListener): () => void {
    this.endedListeners.add(cb);
    return () => this.endedListeners.delete(cb);
  }

  private schedule(from: number): void {
    const ctx = this.engine.getContext();
    const audible = audibleTracks(this.tracks);

    const sourceDurations = new Map<string, number>();
    for (const clip of this.clips) {
      const buffer = this.library.get(clip.mediaId);
      if (buffer) sourceDurations.set(clip.mediaId, buffer.duration);
    }

    const entries = computeSchedule(this.clips, from, sourceDurations).filter((e) =>
      audible.has(e.trackId),
    );

    this.sources = [];
    for (const entry of entries) {
      const buffer = this.library.get(entry.mediaId);
      if (!buffer) continue;
      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const startAt = ctx.currentTime + entry.when;
      const clipGain = ctx.createGain();
      applyEnvelope(clipGain, entry, startAt);

      source.connect(clipGain as unknown as AudioNode);
      clipGain.connect(this.engine.ensureTrackNodes(entry.trackId).gain as unknown as AudioNode);
      source.start(startAt, entry.offset, entry.duration);
      this.sources.push(source);
    }

    this.anchorTime = from;
    this.anchorContextTime = ctx.currentTime;
    this.playing = true;
    // Only arm the end-of-project stop when something is actually going to
    // play. Starting from beyond the last clip (parking the playhead there to
    // record a new take, say) must not immediately rewind to zero.
    this.stopAtEnd = this.sources.length > 0;
  }

  private stopSources(): void {
    for (const s of this.sources) {
      // Clear onended first: tearing a source down must not look like the clip
      // reaching its natural end.
      s.onended = null;
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources = [];
  }

  /**
   * Recording has to be able to roll past the end of the existing material —
   * that is the normal case for adding a take after what is already there.
   */
  setAutoStopAllowed(allowed: boolean): void {
    this.autoStopAllowed = allowed;
  }

  private startClock(): void {
    if (this.clockId !== null) return;
    this.clockId = setInterval(() => {
      this.emitTime();
      if (!this.stopAtEnd || !this.autoStopAllowed) return;
      const total = projectDuration(this.clips);
      if (total > 0 && this.getCurrentTime() >= total) {
        this.stop();
        for (const l of this.endedListeners) l();
      }
    }, CLOCK_INTERVAL_MS);
  }

  private stopClock(): void {
    if (this.clockId !== null) clearInterval(this.clockId);
    this.clockId = null;
  }

  private emitTime(): void {
    const t = this.getCurrentTime();
    for (const l of this.timeListeners) l(t);
  }
}

/** Clip gain plus its fade ramps, scheduled on the clip's own gain node. */
function applyEnvelope(node: GainNode, entry: ScheduleEntry, startAt: number): void {
  const g = node.gain;
  const fadeIn = Math.min(entry.fadeIn, entry.duration);
  g.setValueAtTime(fadeIn > 0 ? 0 : entry.gain, startAt);
  if (fadeIn > 0) g.linearRampToValueAtTime(entry.gain, startAt + fadeIn);
  if (entry.fadeOut > 0) {
    const fadeOut = Math.min(entry.fadeOut, entry.duration);
    g.setValueAtTime(entry.gain, startAt + Math.max(0, entry.duration - fadeOut));
    g.linearRampToValueAtTime(0, startAt + entry.duration);
  }
}
