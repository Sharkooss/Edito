// WSOLA: overlap-add at a fixed synthesis hop, but each analysis frame is
// nudged within a search radius to the position whose waveform best continues
// the previous frame. That similarity search is what keeps the pitch intact —
// a plain overlap-add at the same hops would phase-cancel and sound hollow.
const FRAME = 1024;
const SYNTHESIS_HOP = FRAME >> 1; // 50 % overlap
const SEARCH_RADIUS = 256;

function hann(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  return w;
}

const WINDOW = hann(FRAME);

/**
 * Position near `ideal` whose samples best continue `target`, by normalised
 * cross-correlation.
 */
function bestOffset(input: Float32Array, ideal: number, target: Float32Array): number {
  const overlap = target.length;
  let bestPos = Math.max(0, ideal);
  let bestScore = -Infinity;
  const from = Math.max(0, ideal - SEARCH_RADIUS);
  const to = Math.min(input.length - overlap, ideal + SEARCH_RADIUS);
  for (let pos = from; pos <= to; pos++) {
    let dot = 0;
    let energy = 0;
    for (let i = 0; i < overlap; i++) {
      const v = input[pos + i];
      dot += v * target[i];
      energy += v * v;
    }
    const score = dot / Math.sqrt(energy + 1e-9);
    if (score > bestScore) {
      bestScore = score;
      bestPos = pos;
    }
  }
  return bestPos;
}

/** Linear resampling, used when there is too little material for a windowed pass. */
function resample(input: Float32Array, outLength: number, ratio: number): Float32Array {
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const src = i / ratio;
    const i0 = Math.floor(src);
    const frac = src - i0;
    const a = input[Math.min(i0, input.length - 1)];
    const b = input[Math.min(i0 + 1, input.length - 1)];
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/**
 * Stretch `input` to `ratio` times its length while preserving pitch.
 *
 * This is the single primitive behind both pitch-preserving speed changes and
 * constant-duration transposition.
 */
export function timeStretch(input: Float32Array, ratio: number): Float32Array {
  if (input.length === 0) return new Float32Array(0);
  if (!Number.isFinite(ratio) || ratio <= 0) return input.slice();
  if (Math.abs(ratio - 1) < 1e-9) return input.slice();

  const outLength = Math.max(1, Math.round(input.length * ratio));
  // Too short to window: a similarity search over less than one frame would be
  // meaningless, so fall back to resampling.
  if (input.length < FRAME) return resample(input, outLength, ratio);

  const out = new Float32Array(outLength);
  const norm = new Float32Array(outLength);
  const analysisHop = SYNTHESIS_HOP / ratio;
  const overlap = FRAME - SYNTHESIS_HOP;

  let target: Float32Array | null = null;
  let frame = 0;

  for (let synth = 0; synth < outLength; synth += SYNTHESIS_HOP, frame++) {
    const ideal = Math.min(input.length - FRAME, Math.round(frame * analysisHop));
    if (ideal < 0) break;
    const pos = target ? bestOffset(input, ideal, target) : Math.max(0, ideal);

    for (let i = 0; i < FRAME; i++) {
      const src = pos + i;
      const dst = synth + i;
      if (src >= input.length || dst >= outLength) break;
      out[dst] += input[src] * WINDOW[i];
      norm[dst] += WINDOW[i];
    }

    // What the input would naturally play next; the following frame is chosen
    // to match it as closely as possible.
    const tailStart = pos + SYNTHESIS_HOP;
    target =
      tailStart + overlap <= input.length ? input.subarray(tailStart, tailStart + overlap) : null;
  }

  for (let i = 0; i < outLength; i++) {
    if (norm[i] > 1e-6) out[i] /= norm[i];
  }
  return out;
}

/**
 * Stretch one window of an AudioBuffer.
 *
 * `makeBuffer` is injected rather than taken from an AudioContext so this stays
 * unit-testable without Web Audio.
 */
export function stretchWindow(
  buffer: AudioBuffer,
  startSec: number,
  endSec: number,
  ratio: number,
  makeBuffer: (channels: number, length: number, sampleRate: number) => AudioBuffer,
): AudioBuffer {
  const sampleRate = buffer.sampleRate;
  const first = Math.max(0, Math.floor(startSec * sampleRate));
  const last = Math.min(buffer.length, Math.ceil(endSec * sampleRate));
  const span = Math.max(0, last - first);

  const stretched: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    stretched.push(timeStretch(buffer.getChannelData(c).subarray(first, last), ratio));
  }

  const length = stretched[0]?.length ?? Math.max(1, Math.round(span * ratio));
  const out = makeBuffer(buffer.numberOfChannels, Math.max(1, length), sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) out.getChannelData(c).set(stretched[c]);
  return out;
}
