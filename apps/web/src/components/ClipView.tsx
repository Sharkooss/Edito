import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AlertTriangle } from "lucide-react";
import type { Clip } from "../api/client";
import type { MediaLibrary } from "../audio/mediaLibrary";
import { paintWaveform, fadePolygon } from "./waveformPainter";
import { secondsToPixels } from "../lib/time";

export type ClipPart = "body" | "left" | "right" | "fadeIn" | "fadeOut";

const EDGE_HIT_PX = 6;
const FADE_HANDLE_PX = 12;
const WAVE_COLOR = "#4dd0e1";
const WAVE_COLOR_SELECTED = "#f8fafc";

export function ClipView({
  clip,
  pxPerSecond,
  library,
  laneHeight,
  selected,
  onPointerDown,
  onContextMenu,
}: {
  clip: Clip;
  pxPerSecond: number;
  library: MediaLibrary;
  laneHeight: number;
  selected: boolean;
  onPointerDown: (e: ReactPointerEvent, clip: Clip, part: ClipPart) => void;
  onContextMenu: (e: ReactPointerEvent | React.MouseEvent, clip: Clip) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, forceRepaint] = useState(0);

  const width = Math.max(1, secondsToPixels(clip.duration, pxPerSecond));
  const height = laneHeight - 24;
  const missing = library.failed(clip.mediaId);

  // A media finishing its load has to repaint every clip that references it.
  useEffect(() => library.onChange(() => forceRepaint((n) => n + 1)), [library]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // The window is the whole point: only this clip's slice of the source.
    const peaks = library.getPeaks(
      clip.mediaId,
      clip.sourceOffset,
      clip.sourceOffset + clip.duration,
      Math.max(1, Math.round(width)),
    );
    paintWaveform(canvas, peaks, {
      width,
      height,
      color: selected ? WAVE_COLOR_SELECTED : WAVE_COLOR,
      dpr: window.devicePixelRatio || 1,
    });
  }, [library, clip.mediaId, clip.sourceOffset, clip.duration, width, height, selected]);

  const fadePoints = fadePolygon(
    width,
    height,
    secondsToPixels(clip.fadeIn, pxPerSecond),
    secondsToPixels(clip.fadeOut, pxPerSecond),
  );

  return (
    <div
      onPointerDown={(e) => onPointerDown(e, clip, "body")}
      onContextMenu={(e) => onContextMenu(e, clip)}
      style={{ left: secondsToPixels(clip.startTime, pxPerSecond), width, top: 8, height }}
      className={`absolute overflow-hidden rounded-md border bg-console-inset ${
        selected
          ? "border-primary shadow-[0_0_0_1px_rgba(249,115,22,0.55)]"
          : "border-studio-border"
      }`}
    >
      <span className="pointer-events-none absolute left-1.5 top-1 z-10 max-w-[calc(100%-0.75rem)] truncate rounded bg-studio-bg/70 px-1 font-mono text-[11px] text-muted-foreground">
        {clip.name}
      </span>

      {missing ? (
        <div className="flex h-full items-center justify-center gap-1.5 text-destructive">
          <AlertTriangle className="size-4" />
          <span className="text-xs">Média manquant</span>
        </div>
      ) : (
        <canvas ref={canvasRef} style={{ width, height }} className="block" />
      )}

      {fadePoints.length > 0 && (
        <svg
          className="pointer-events-none absolute inset-0"
          width={width}
          height={height}
          aria-hidden
        >
          <polygon
            points={fadePoints.map(([x, y]) => `${x},${y}`).join(" ")}
            fill="rgba(17,18,21,0.6)"
          />
        </svg>
      )}

      {/* Trim edges */}
      <div
        onPointerDown={(e) => onPointerDown(e, clip, "left")}
        style={{ width: EDGE_HIT_PX }}
        className="absolute left-0 top-0 h-full cursor-ew-resize bg-white/10 hover:bg-white/30"
        title="Rogner le début"
      />
      <div
        onPointerDown={(e) => onPointerDown(e, clip, "right")}
        style={{ width: EDGE_HIT_PX }}
        className="absolute right-0 top-0 h-full cursor-ew-resize bg-white/10 hover:bg-white/30"
        title="Rogner la fin"
      />

      {/* Fade handles, inset so they do not fight the trim edges */}
      <div
        onPointerDown={(e) => onPointerDown(e, clip, "fadeIn")}
        style={{ left: EDGE_HIT_PX, width: FADE_HANDLE_PX, height: FADE_HANDLE_PX }}
        className="absolute top-0 cursor-nesw-resize rounded-br-md bg-primary/50 hover:bg-primary"
        title="Fondu d'entrée"
      />
      <div
        onPointerDown={(e) => onPointerDown(e, clip, "fadeOut")}
        style={{ right: EDGE_HIT_PX, width: FADE_HANDLE_PX, height: FADE_HANDLE_PX }}
        className="absolute top-0 cursor-nwse-resize rounded-bl-md bg-primary/50 hover:bg-primary"
        title="Fondu de sortie"
      />
    </div>
  );
}
