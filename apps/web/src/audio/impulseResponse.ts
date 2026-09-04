const DECAY_EXPONENT = 3;
/** Sizes are bucketed to this resolution so a slider drag reuses one impulse. */
const SIZE_BUCKET = 0.1;

type MakeBuffer = (channels: number, length: number, sampleRate: number) => AudioBuffer;

/**
 * Exponentially decaying noise. Cheap, needs no asset files, and sounds like a
 * plausible room — which is all a per-clip reverb needs.
 */
export function generateImpulseResponse(
  seconds: number,
  sampleRate: number,
  makeBuffer: MakeBuffer,
): AudioBuffer {
  const length = Math.max(1, Math.floor(Math.max(0.01, seconds) * sampleRate));
  const buffer = makeBuffer(2, length, sampleRate);
  // Channels are generated independently so the tail reads as stereo.
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      const decay = Math.pow(1 - i / length, DECAY_EXPONENT);
      data[i] = (Math.random() * 2 - 1) * decay;
    }
  }
  return buffer;
}

/**
 * Impulses are shared across clips: generating one is expensive, and a
 * convolver only needs the buffer, not ownership of it.
 */
export class ImpulseCache {
  private makeBuffer: MakeBuffer;
  private sampleRate: number;
  private cache = new Map<number, AudioBuffer>();
  private generated = 0;

  constructor(makeBuffer: MakeBuffer, sampleRate: number) {
    this.makeBuffer = makeBuffer;
    this.sampleRate = sampleRate;
  }

  get(seconds: number): AudioBuffer {
    const bucket = Math.round(seconds / SIZE_BUCKET);
    let ir = this.cache.get(bucket);
    if (!ir) {
      ir = generateImpulseResponse(bucket * SIZE_BUCKET, this.sampleRate, this.makeBuffer);
      this.cache.set(bucket, ir);
      this.generated++;
    }
    return ir;
  }

  generatedCount(): number {
    return this.generated;
  }
}
