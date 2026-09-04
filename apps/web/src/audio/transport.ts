import type { AudioEngine } from "./engine";
import type { MediaLibrary } from "./mediaLibrary";
import type { ProcessedAudio } from "./processedAudio";
import type { Track, Clip } from "../api/client";
import { computeSchedule, projectDuration, audibleTracks } from "./scheduling";
import { buildClipChain } from "./clipChain";
import { ImpulseCache } from "./impulseResponse";

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
  private processed: ProcessedAudio;
  private impulses: ImpulseCache;
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

  constructor(engine: AudioEngine, library: MediaLibrary, processed: ProcessedAudio) {
    this.engine = engine;
    this.library = library;
    this.processed = processed;
    const ctx = engine.getContext();
    this.impulses = new ImpulseCache(
      (channels, length, sampleRate) => ctx.createBuffer(channels, length, sampleRate),
      ctx.sampleRate,
    );
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
    // Renders any stretched clip before playback, so a treated clip does not
    // silently drop out of the first pass.
    await this.processed.preload(this.clips);
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

    const clipsById = new Map(this.clips.map((c) => [c.id, c]));

    this.sources = [];
    for (const entry of entries) {
      const clip = clipsById.get(entry.clipId);
      if (!clip) continue;
      // Null while a stretched clip is still rendering; it joins on the next
      // schedule rather than blocking playback of everything else.
      const audio = this.processed.get(clip);
      if (!audio) continue;
      this.sources.push(
        buildClipChain(
          { ctx, impulses: this.impulses },
          entry,
          audio,
          this.engine.ensureTrackNodes(entry.trackId).gain as unknown as AudioNode,
          ctx.currentTime + entry.when,
        ),
      );
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
