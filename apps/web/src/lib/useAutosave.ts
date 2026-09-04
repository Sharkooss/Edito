import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "../store/projectStore";
import { saveProject } from "../api/client";

type Status = "idle" | "saving" | "saved" | "error";

export function useAutosave(delayMs: number) {
  const tracks = useProjectStore((s) => s.tracks);
  const clips = useProjectStore((s) => s.clips);
  const [status, setStatus] = useState<Status>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function saveNow() {
    setStatus("saving");
    try {
      await saveProject({ tracks: useProjectStore.getState().tracks, clips: useProjectStore.getState().clips });
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(saveNow, delayMs);
    return () => clearTimeout(timeoutRef.current);
  }, [tracks, clips, delayMs]);

  return { status, saveNow };
}
