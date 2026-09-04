export interface PeakData {
  min: Float32Array;
  max: Float32Array;
}

/**
 * Min/max envelope of `channel` over [startSec, endSec], bucketed into `bins`.
 *
 * The window is clamped to the buffer, so callers may pass a clip window that
 * runs past the end of its source without special-casing it. Windowing is the
 * whole point: a clip trimmed or split to a portion of its source must only
 * ever show that portion.
 */
export function computePeaks(
  channel: Float32Array,
  sampleRate: number,
  startSec: number,
  endSec: number,
  bins: number,
): PeakData {
  const safeBins = Math.max(0, Math.floor(bins));
  const min = new Float32Array(safeBins);
  const max = new Float32Array(safeBins);
  if (safeBins === 0) return { min, max };

  const first = Math.max(0, Math.floor(startSec * sampleRate));
  const last = Math.min(channel.length, Math.ceil(endSec * sampleRate));
  const span = last - first;
  if (span <= 0) return { min, max };

  for (let bin = 0; bin < safeBins; bin++) {
    const from = first + Math.floor((bin * span) / safeBins);
    const to = Math.min(last, first + Math.ceil(((bin + 1) * span) / safeBins));
    let lo = 0;
    let hi = 0;
    for (let i = from; i < to; i++) {
      const v = channel[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min[bin] = lo;
    max[bin] = hi;
  }
  return { min, max };
}
