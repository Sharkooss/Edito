/** Ceiling on automatic boost: without it, a near-silent take amplifies its own noise floor. */
export const MAX_NORMALIZE_GAIN = 4;

const SILENCE_THRESHOLD = 1e-5;

export function windowPeak(buffer: AudioBuffer, startSec: number, endSec: number): number {
  const first = Math.max(0, Math.floor(startSec * buffer.sampleRate));
  const last = Math.min(buffer.length, Math.ceil(endSec * buffer.sampleRate));
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = first; i < last; i++) {
      const v = Math.abs(data[i]);
      if (v > peak) peak = v;
    }
  }
  return peak;
}

/** Gain that brings `peak` to full scale, or null when there is nothing to lift. */
export function normalizeGain(peak: number): number | null {
  if (!Number.isFinite(peak) || peak <= SILENCE_THRESHOLD) return null;
  return Math.min(MAX_NORMALIZE_GAIN, 1 / peak);
}
