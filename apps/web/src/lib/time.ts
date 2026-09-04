export function secondsToPixels(seconds: number, pxPerSecond: number): number {
  return seconds * pxPerSecond;
}

export function pixelsToSeconds(px: number, pxPerSecond: number): number {
  return px / pxPerSecond;
}

export function formatTime(seconds: number): string {
  const totalCentiseconds = Math.round(seconds * 100);
  const cc = totalCentiseconds % 100;
  const totalSeconds = Math.floor(totalCentiseconds / 100);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cc).padStart(2, "0")}`;
}
