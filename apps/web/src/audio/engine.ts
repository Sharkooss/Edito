interface TrackNodes {
  gain: GainNode;
  pan: StereoPannerNode;
  lastVolume: number;
}

export class AudioEngine {
  private ctx: AudioContext;
  private tracks = new Map<string, TrackNodes>();
  private bufferCache = new Map<string, Promise<AudioBuffer>>();

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  getContext(): AudioContext {
    return this.ctx;
  }

  ensureTrackNodes(trackId: string): TrackNodes {
    let nodes = this.tracks.get(trackId);
    if (!nodes) {
      const gain = this.ctx.createGain();
      const pan = this.ctx.createStereoPanner();
      gain.connect(pan as unknown as AudioNode);
      pan.connect(this.ctx.destination);
      nodes = { gain, pan, lastVolume: 1 };
      this.tracks.set(trackId, nodes);
    }
    return nodes;
  }

  setTrackVolume(trackId: string, value: number): void {
    const nodes = this.ensureTrackNodes(trackId);
    nodes.lastVolume = value;
    nodes.gain.gain.value = value;
  }

  setTrackPan(trackId: string, value: number): void {
    this.ensureTrackNodes(trackId).pan.pan.value = value;
  }

  setTrackMuted(trackId: string, muted: boolean): void {
    const nodes = this.ensureTrackNodes(trackId);
    nodes.gain.gain.value = muted ? 0 : nodes.lastVolume;
  }

  removeTrack(trackId: string): void {
    const nodes = this.tracks.get(trackId);
    if (!nodes) return;
    nodes.gain.disconnect();
    nodes.pan.disconnect();
    this.tracks.delete(trackId);
  }

  loadBuffer(url: string): Promise<AudioBuffer> {
    let cached = this.bufferCache.get(url);
    if (!cached) {
      cached = fetch(url)
        .then((res) => res.arrayBuffer())
        .then((buf) => this.ctx.decodeAudioData(buf));
      this.bufferCache.set(url, cached);
    }
    return cached;
  }
}
