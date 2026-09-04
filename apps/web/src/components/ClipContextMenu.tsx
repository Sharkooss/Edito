import { useEffect, useRef } from "react";
import { useProjectStore } from "../store/projectStore";
import {
  splitClipsAt,
  deleteClips,
  duplicateClips,
  setClipFade,
} from "../audio/clipEditing";

const DEFAULT_FADE_SECONDS = 0.5;

export function ClipContextMenu({
  x,
  y,
  clipIds,
  playhead,
  onClose,
}: {
  x: number;
  y: number;
  clipIds: string[];
  playhead: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const clips = useProjectStore((s) => s.clips);

  useEffect(() => {
    function onPointerDown(e: globalThis.PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const selected = clips.filter((c) => clipIds.includes(c.id));
  const canSplit = selected.some(
    (c) => playhead > c.startTime && playhead < c.startTime + c.duration,
  );

  function run(action: () => void) {
    action();
    onClose();
  }

  const item =
    "flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left text-xs transition-colors hover:bg-studio-border/60 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div
      ref={ref}
      style={{ left: x, top: y }}
      className="fixed z-50 min-w-52 overflow-hidden rounded-md border border-studio-border bg-studio-panel py-1 shadow-lg"
    >
      <button
        type="button"
        className={item}
        disabled={!canSplit}
        onClick={() => run(() => splitClipsAt(clipIds, playhead))}
      >
        Couper à la tête de lecture
        <kbd className="font-mono text-[10px] text-muted-foreground">S</kbd>
      </button>
      <button type="button" className={item} onClick={() => run(() => duplicateClips(clipIds))}>
        Dupliquer
        <kbd className="font-mono text-[10px] text-muted-foreground">Ctrl+D</kbd>
      </button>
      <div className="my-1 h-px bg-studio-border" />
      <button
        type="button"
        className={item}
        onClick={() => run(() => clipIds.forEach((id) => setClipFade(id, "in", DEFAULT_FADE_SECONDS)))}
      >
        Fondu d'entrée 0,5 s
      </button>
      <button
        type="button"
        className={item}
        onClick={() =>
          run(() => clipIds.forEach((id) => setClipFade(id, "out", DEFAULT_FADE_SECONDS)))
        }
      >
        Fondu de sortie 0,5 s
      </button>
      <button
        type="button"
        className={item}
        onClick={() =>
          run(() =>
            clipIds.forEach((id) => {
              setClipFade(id, "in", 0);
              setClipFade(id, "out", 0);
            }),
          )
        }
      >
        Retirer les fondus
      </button>
      <div className="my-1 h-px bg-studio-border" />
      <button
        type="button"
        className={`${item} text-destructive`}
        onClick={() => run(() => deleteClips(clipIds))}
      >
        Supprimer
        <kbd className="font-mono text-[10px] opacity-70">Suppr</kbd>
      </button>
    </div>
  );
}
