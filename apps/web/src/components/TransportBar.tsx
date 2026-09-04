import { useEffect, useState } from "react";
import type { Transport } from "../audio/transport";
import { formatTime } from "../lib/time";
import { Button } from "./ui/button";
import { useProjectStore } from "../store/projectStore";

export function TransportBar({ transport, getBufferUrl }: { transport: Transport; getBufferUrl: (mediaId: string) => string }) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const clips = useProjectStore((s) => s.clips);
  const tracks = useProjectStore((s) => s.tracks);

  useEffect(() => transport.onTimeUpdate(setTime), [transport]);

  return (
    <div className="flex items-center gap-2 border-b border-studio-border bg-studio-panel p-2">
      <Button
        onClick={async () => {
          if (playing) { transport.pause(); setPlaying(false); }
          else { await transport.play(clips, tracks, getBufferUrl); setPlaying(true); }
        }}
      >{playing ? "Pause" : "Play"}</Button>
      <Button variant="outline" onClick={() => { transport.stop(); setPlaying(false); }}>Stop</Button>
      <span className="font-mono text-sm tabular-nums">{formatTime(time)}</span>
    </div>
  );
}
