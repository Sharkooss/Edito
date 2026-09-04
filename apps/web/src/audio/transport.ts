import type { AudioEngine } from "./engine";
import type { Track, Clip } from "../api/client";

type TimeListener = (t: number) => void;

// The test environment (vitest, default "node" env) has no requestAnimationFrame/
// cancelAnimationFrame globals (those are browser/jsdom APIs). Fall back to a
// timer-based approximation so the clock loop still works outside a real browser.
const raf: (cb: FrameRequestCallback) => number =
  typeof requestAnimationFrame === "function"
    ? requestAnimationFrame
    : (cb) => setTimeout(() => cb(Date.now()), 16) as unknown as number;

const caf: (handle: number) => void =
  typeof cancelAnimationFrame === "function"
    ? cancelAnimationFrame
    : (handle) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);

export class Transport {
  private engine: AudioEngine;
  private currentTime = 0;
  private playing = false;
  private startedAtContextTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private listeners = new Set<TimeListener>();
  private rafId: number | null = null;

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getCurrentTime(): number {
    if (!this.playing) return this.currentTime;
    const ctx = this.engine.getContext();
    return this.currentTime + (ctx.currentTime - this.startedAtContextTime);
  }

  seek(seconds: number): void {
    const wasPlaying = this.playing;
    if (wasPlaying) this.stopSources();
    this.currentTime = Math.max(0, seconds);
    if (wasPlaying) this.restartFrom(this.currentTime);
  }

  async play(clips: Clip[], tracks: Track[], getBufferUrl: (mediaId: string) => string): Promise<void> {
    this.lastClips = clips;
    this.lastTracks = tracks;
    this.lastGetBufferUrl = getBufferUrl;
    await this.restartFrom(this.currentTime);
  }

  pause(): void {
    if (!this.playing) return;
    this.currentTime = this.getCurrentTime();
    this.stopSources();
    this.playing = false;
    this.stopClock();
  }

  stop(): void {
    this.stopSources();
    this.playing = false;
    this.currentTime = 0;
    this.stopClock();
    this.emit();
  }

  onTimeUpdate(cb: TimeListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private lastClips: Clip[] = [];
  private lastTracks: Track[] = [];
  private lastGetBufferUrl: (mediaId: string) => string = () => "";

  private async restartFrom(from: number): Promise<void> {
    const ctx = this.engine.getContext();
    const buffers = await Promise.all(
      this.lastClips.map((c) => this.engine.loadBuffer(this.lastGetBufferUrl(c.mediaId)))
    );
    this.activeSources = [];
    this.lastClips.forEach((clip, i) => {
      const clipEnd = clip.startTime + clip.duration;
      if (clipEnd <= from) return;
      const track = this.lastTracks.find((t) => t.id === clip.trackId);
      if (!track) return;
      const nodes = this.engine.ensureTrackNodes(track.id);
      const source = ctx.createBufferSource();
      source.buffer = buffers[i];
      source.connect(nodes.gain as unknown as AudioNode);
      const offsetIntoClip = Math.max(0, from - clip.startTime);
      const when = ctx.currentTime + Math.max(0, clip.startTime - from);
      source.start(when, clip.sourceOffset + offsetIntoClip, clip.duration - offsetIntoClip);
      this.activeSources.push(source);
    });
    this.startedAtContextTime = ctx.currentTime;
    this.currentTime = from;
    this.playing = true;
    this.startClock();
  }

  private stopSources(): void {
    for (const s of this.activeSources) {
      try { s.stop(); } catch { /* already stopped */ }
    }
    this.activeSources = [];
  }

  private startClock(): void {
    const tick = () => {
      this.emit();
      if (this.playing) this.rafId = raf(tick);
    };
    this.rafId = raf(tick);
  }

  private stopClock(): void {
    if (this.rafId !== null) caf(this.rafId);
    this.rafId = null;
    this.emit();
  }

  private emit(): void {
    const t = this.getCurrentTime();
    for (const l of this.listeners) l(t);
  }
}
