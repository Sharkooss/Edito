import type { PeakData } from "../audio/peaks";

/**
 * Draw a min/max envelope onto a canvas.
 *
 * Peaks arrive already windowed to the clip's source range, so a split or
 * trimmed clip paints only its own audio — v1 handed the whole file to a
 * WaveSurfer instance per clip and every piece showed the entire waveform.
 */
export function paintWaveform(
  canvas: HTMLCanvasElement,
  peaks: PeakData | null,
  opts: { width: number; height: number; color: string; dpr: number },
): void {
  const { width, height, color, dpr } = opts;
  if (!peaks || width < 1 || height < 1) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = color;

  const mid = height / 2;
  const bins = Math.min(peaks.min.length, peaks.max.length);
  for (let i = 0; i < bins; i++) {
    const top = mid - peaks.max[i] * mid;
    // Always at least a hairline, so silence still reads as a centre line.
    const barHeight = Math.max(1, (peaks.max[i] - peaks.min[i]) * mid);
    ctx.fillRect(i, top, 1, barHeight);
  }
}

/**
 * Points of the shaded triangle(s) showing a clip's fades, in canvas space.
 * Empty when the clip has no fades.
 */
export function fadePolygon(
  width: number,
  height: number,
  fadeInPx: number,
  fadeOutPx: number,
): Array<[number, number]> {
  if (fadeInPx <= 0 && fadeOutPx <= 0) return [];

  // Overlapping fades would otherwise cross over and render inside out.
  const total = fadeInPx + fadeOutPx;
  const scale = total > width && total > 0 ? width / total : 1;
  const inPx = Math.max(0, Math.min(width, fadeInPx * scale));
  const outPx = Math.max(0, Math.min(width, fadeOutPx * scale));

  const points: Array<[number, number]> = [];
  if (inPx > 0) {
    points.push([0, height], [inPx, 0]);
  } else {
    points.push([0, 0]);
  }
  if (outPx > 0) {
    points.push([width - outPx, 0], [width, height]);
  } else {
    points.push([width, 0]);
  }
  return points;
}
