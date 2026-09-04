import { useEffect, useState } from "react";
import type { Transport } from "../audio/transport";
import { formatTime } from "../lib/time";
import { Button } from "./ui/button";

export function TransportBar({
  transport,
  isPlaying,
  onTogglePlayPause,
  onStop,
}: {
  transport: Transport;
  isPlaying: boolean;
  onTogglePlayPause: () => void;
  onStop: () => void;
}) {
  const [time, setTime] = useState(0);

  useEffect(() => transport.onTimeUpdate(setTime), [transport]);

  return (
    <div className="flex items-center gap-2 border-b border-studio-border bg-studio-panel p-2">
      <Button onClick={onTogglePlayPause} aria-pressed={isPlaying}>{isPlaying ? "Pause" : "Play"}</Button>
      <Button variant="outline" onClick={onStop}>Stop</Button>
      <span className="font-mono text-sm tabular-nums">{formatTime(time)}</span>
    </div>
  );
}
