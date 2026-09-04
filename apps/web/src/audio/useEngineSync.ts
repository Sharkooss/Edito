import { useEffect } from "react";
import { useProjectStore } from "../store/projectStore";
import type { AudioEngine } from "./engine";

export function useEngineSync(engine: AudioEngine): void {
  const tracks = useProjectStore((s) => s.tracks);

  useEffect(() => {
    const anySoloed = tracks.some((t) => t.soloed);
    for (const t of tracks) {
      engine.setTrackVolume(t.id, t.volume);
      engine.setTrackPan(t.id, t.pan);
      const effectiveMuted = anySoloed ? !t.soloed : t.muted;
      engine.setTrackMuted(t.id, effectiveMuted);
    }
  }, [engine, tracks]);
}
