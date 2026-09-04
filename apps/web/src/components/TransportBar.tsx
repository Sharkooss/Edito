import { useEffect, useState } from "react";
import { Pause, Play, Square } from "lucide-react";
import type { Transport } from "../audio/transport";
import { formatTime } from "../lib/time";
import { Button } from "./ui/button";
import { Hint } from "./Hint";

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
    <div className="flex items-center gap-3 border-b border-studio-border bg-studio-panel px-3 py-2">
      <div className="flex gap-1" data-tour="transport">
        <Hint label={isPlaying ? "Met la lecture en pause (Espace)." : "Lance la lecture (Espace)."}>
          <Button
            size="icon"
            onClick={onTogglePlayPause}
            aria-pressed={isPlaying}
            className={isPlaying ? "shadow-[0_0_10px_rgba(249,115,22,0.55)]" : ""}
          >
            {isPlaying ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
          </Button>
        </Hint>
        <Hint label="Arrête la lecture et revient au début.">
          <Button size="icon" variant="secondary" onClick={onStop}>
            <Square className="size-4 fill-current" />
          </Button>
        </Hint>
      </div>

      <div className="rounded-md border border-studio-border bg-console-inset px-3 py-1">
        <span className="font-mono text-sm tabular-nums tracking-wider text-console-meter">
          {formatTime(time)}
        </span>
      </div>
    </div>
  );
}
