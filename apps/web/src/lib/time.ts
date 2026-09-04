export function secondsToPixels(seconds: number, pxPerSecond: number): number {
  return seconds * pxPerSecond;
}

export function pixelsToSeconds(px: number, pxPerSecond: number): number {
  return px / pxPerSecond;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const cc = Math.round((seconds - Math.floor(seconds)) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cc).padStart(2, "0")}`;
}
