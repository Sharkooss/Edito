import { computePeaks, type PeakData } from "./peaks";

/**
 * The single owner of decoded audio in the app.
 *
 * v1 had two independent caches — one inside the audio engine for playback and
 * one WaveSurfer instance per clip for drawing — so a file split into eight
 * pieces was fetched and decoded nine times. Playback, waveform painting and
 * the mixdown export all read from here instead: one fetch, one decode, per
 * media, regardless of how many clips reference it.
 */
export class MediaLibrary {
  private ctx: BaseAudioContext;
  private getUrl: (mediaId: string) => string;
  private buffers = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<AudioBuffer>>();
  private failures = new Set<string>();
  private peakCache = new Map<string, PeakData>();
  private listeners = new Set<() => void>();

  constructor(ctx: BaseAudioContext, getUrl: (mediaId: string) => string) {
    this.ctx = ctx;
    this.getUrl = getUrl;
  }

  load(mediaId: string): Promise<AudioBuffer> {
    const ready = this.buffers.get(mediaId);
    if (ready) return Promise.resolve(ready);
    let inFlight = this.pending.get(mediaId);
    if (!inFlight) {
      inFlight = (async () => {
        try {
          const res = await fetch(this.getUrl(mediaId));
          if (!res.ok) throw new Error(`Média ${mediaId} introuvable (${res.status})`);
          const buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
          this.buffers.set(mediaId, buffer);
          this.failures.delete(mediaId);
          return buffer;
        } catch (err) {
          this.failures.add(mediaId);
          throw err;
        } finally {
          // Inside the async body, so bookkeeping and notification both complete
          // before load()'s promise resolves. Chaining .finally() onto the
          // promise instead would let an awaiting caller observe a loaded buffer
          // one microtask before subscribers hear about it.
          this.pending.delete(mediaId);
          this.emit();
        }
      })();
      this.pending.set(mediaId, inFlight);
    }
    return inFlight;
  }

  get(mediaId: string): AudioBuffer | null {
    return this.buffers.get(mediaId) ?? null;
  }

  has(mediaId: string): boolean {
    return this.buffers.has(mediaId);
  }

  failed(mediaId: string): boolean {
    return this.failures.has(mediaId);
  }

  /** Never rejects: a missing media must not stop the rest of the project loading. */
  async preload(mediaIds: string[]): Promise<void> {
    await Promise.all([...new Set(mediaIds)].map((id) => this.load(id).catch(() => undefined)));
  }

  getPeaks(mediaId: string, startSec: number, endSec: number, bins: number): PeakData | null {
    const buffer = this.buffers.get(mediaId);
    if (!buffer) return null;
    const key = `${mediaId}|${startSec.toFixed(4)}|${endSec.toFixed(4)}|${bins}`;
    let peaks = this.peakCache.get(key);
    if (!peaks) {
      peaks = computePeaks(buffer.getChannelData(0), buffer.sampleRate, startSec, endSec, bins);
      // Bounded: zooming churns keys quickly and recomputing is cheap.
      if (this.peakCache.size > 800) this.peakCache.clear();
      this.peakCache.set(key, peaks);
    }
    return peaks;
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
