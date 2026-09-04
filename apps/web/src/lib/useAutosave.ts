import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "../store/projectStore";
import { saveProject } from "../api/client";

type Status = "idle" | "saving" | "saved" | "error";

export function useAutosave(delayMs: number) {
  const tracks = useProjectStore((s) => s.tracks);
  const clips = useProjectStore((s) => s.clips);
  const hydrated = useProjectStore((s) => s.hydrated);
  const [status, setStatus] = useState<Status>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function saveNow() {
    // Guard against saving before the initial fetchProject() load has hydrated
    // the store — otherwise a stray/manual call could overwrite the persisted
    // project with the empty initial state (tracks: [], clips: []).
    if (!useProjectStore.getState().hydrated) return;
    setStatus("saving");
    try {
      await saveProject({ tracks: useProjectStore.getState().tracks, clips: useProjectStore.getState().clips });
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    // Never arm the debounce timer before the store has been hydrated from the
    // server: otherwise a slow/failed fetchProject() lets this timer fire first
    // with the initial empty state and wipe the persisted project.
    if (!hydrated) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(saveNow, delayMs);
    return () => clearTimeout(timeoutRef.current);
  }, [tracks, clips, delayMs, hydrated]);

  return { status, saveNow };
}
