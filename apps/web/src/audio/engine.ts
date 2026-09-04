interface TrackNodes {
  gain: GainNode;
  pan: StereoPannerNode;
  analyser: AnalyserNode;
  lastVolume: number;
  muted: boolean;
}

function rms(analyser: AnalyserNode): number {
  const data = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.min(1, Math.sqrt(sum / data.length));
}

export class AudioEngine {
  private ctx: AudioContext;
  private tracks = new Map<string, TrackNodes>();
  private master: GainNode;
  private masterAnalyser: AnalyserNode;
  private unlocking: Promise<void> | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.masterAnalyser = ctx.createAnalyser();
    this.masterAnalyser.fftSize = 2048;
    this.master.connect(this.masterAnalyser as unknown as AudioNode);
    this.masterAnalyser.connect(ctx.destination);
  }

  getContext(): AudioContext {
    return this.ctx;
  }

  isUnlocked(): boolean {
    return this.ctx.state === "running";
  }

  /**
   * Browsers create an AudioContext in the "suspended" state and only allow it
   * to start from a user gesture. v1 never called resume(), so the transport
   * ran and the playhead moved while nothing was ever audible.
   */
  unlock(): Promise<void> {
    if (this.ctx.state === "running") return Promise.resolve();
    if (!this.unlocking) {
      this.unlocking = this.ctx.resume().catch(() => {
        // Let a later gesture try again rather than latching a failed attempt.
        this.unlocking = null;
      });
    }
    return this.unlocking;
  }

  ensureTrackNodes(trackId: string): TrackNodes {
    let nodes = this.tracks.get(trackId);
    if (!nodes) {
      const gain = this.ctx.createGain();
      const pan = this.ctx.createStereoPanner();
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 2048;
      gain.connect(pan as unknown as AudioNode);
      pan.connect(analyser as unknown as AudioNode);
      analyser.connect(this.master as unknown as AudioNode);
      nodes = { gain, pan, analyser, lastVolume: 1, muted: false };
      this.tracks.set(trackId, nodes);
    }
    return nodes;
  }

  setTrackVolume(trackId: string, value: number): void {
    const nodes = this.ensureTrackNodes(trackId);
    nodes.lastVolume = value;
    // Only touch the live gain when audible: v1 wrote through unconditionally,
    // so moving the fader on a muted track made it audible again.
    if (!nodes.muted) nodes.gain.gain.value = value;
  }

  setTrackPan(trackId: string, value: number): void {
    this.ensureTrackNodes(trackId).pan.pan.value = value;
  }

  setTrackMuted(trackId: string, muted: boolean): void {
    const nodes = this.ensureTrackNodes(trackId);
    nodes.muted = muted;
    nodes.gain.gain.value = muted ? 0 : nodes.lastVolume;
  }

  removeTrack(trackId: string): void {
    const nodes = this.tracks.get(trackId);
    if (!nodes) return;
    nodes.gain.disconnect();
    nodes.pan.disconnect();
    nodes.analyser.disconnect();
    this.tracks.delete(trackId);
  }

  trackLevel(trackId: string): number {
    const nodes = this.tracks.get(trackId);
    return nodes ? rms(nodes.analyser) : 0;
  }

  masterLevel(): number {
    return rms(this.masterAnalyser);
  }
}
