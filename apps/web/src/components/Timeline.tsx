import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useProjectStore, type Clip } from "../store/projectStore";
import type { MediaLibrary } from "../audio/mediaLibrary";
import { ClipView, type ClipPart } from "./ClipView";
import { TrackHeader } from "./TrackHeader";
import { TimeRuler, RULER_HEIGHT } from "./TimeRuler";
import { ClipContextMenu } from "./ClipContextMenu";
import { LANE_HEIGHT, HEADER_WIDTH, dragDestination } from "./useClipDrag";
import { snapTime, snapCandidates } from "../audio/snapping";
import { projectDuration } from "../audio/scheduling";
import { moveClips, trimClip, setClipFade, splitClipsAt } from "../audio/clipEditing";
import { secondsToPixels, pixelsToSeconds } from "../lib/time";

const MIN_VISIBLE_SECONDS = 30;
const TRAILING_SECONDS = 10;
/** Below this travel a pointer gesture is a click, not a drag. */
const DRAG_THRESHOLD_PX = 3;

interface DragState {
  part: ClipPart;
  clipId: string;
  originX: number;
  originY: number;
  originStart: number;
  originLaneIndex: number;
  movedIds: string[];
  offsets: Map<string, { deltaTime: number; deltaLane: number }>;
  moved: boolean;
}

export function Timeline({
  pxPerSecond,
  currentTime,
  library,
  levels,
  armedTrackId,
  onSeek,
  onToggleArm,
}: {
  pxPerSecond: number;
  currentTime: number;
  library: MediaLibrary;
  levels: Record<string, number>;
  armedTrackId: string | null;
  onSeek: (t: number) => void;
  onToggleArm: (trackId: string) => void;
}) {
  const tracks = useProjectStore((s) => s.tracks);
  const clips = useProjectStore((s) => s.clips);
  const tool = useProjectStore((s) => s.tool);
  const selectedClipIds = useProjectStore((s) => s.selectedClipIds);
  const selectClips = useProjectStore((s) => s.selectClips);
  const toggleClipSelection = useProjectStore((s) => s.toggleClipSelection);
  const clearSelection = useProjectStore((s) => s.clearSelection);

  const lanesRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [bladeX, setBladeX] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; clipIds: string[] } | null>(null);

  const sortedTracks = useMemo(
    () => [...tracks].sort((a, b) => a.orderIndex - b.orderIndex),
    [tracks],
  );
  const laneIndexById = useMemo(
    () => new Map(sortedTracks.map((t, i) => [t.id, i])),
    [sortedTracks],
  );

  const contentSeconds = Math.max(
    MIN_VISIBLE_SECONDS,
    projectDuration(clips) + TRAILING_SECONDS,
    currentTime + TRAILING_SECONDS,
  );
  const contentWidth = secondsToPixels(contentSeconds, pxPerSecond);

  const timeAt = useCallback(
    (clientX: number): number => {
      const rect = lanesRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      return Math.max(0, pixelsToSeconds(clientX - rect.left, pxPerSecond));
    },
    [pxPerSecond],
  );

  // ---- Pointer gestures on clips -----------------------------------------

  function handleClipPointerDown(e: ReactPointerEvent, clip: Clip, part: ClipPart) {
    if (e.button !== 0) return;
    e.stopPropagation();

    if (tool === "blade") {
      splitClipsAt([clip.id], timeAt(e.clientX));
      return;
    }

    const alreadySelected = selectedClipIds.includes(clip.id);
    if (e.shiftKey) {
      toggleClipSelection(clip.id);
    } else if (!alreadySelected) {
      selectClips([clip.id]);
    }

    // A group drag moves every selected clip, preserving relative placement.
    const group =
      part === "body" && (alreadySelected || e.shiftKey) && selectedClipIds.length > 0
        ? Array.from(new Set([...selectedClipIds, clip.id]))
        : [clip.id];

    const originLaneIndex = laneIndexById.get(clip.trackId) ?? 0;
    const offsets = new Map<string, { deltaTime: number; deltaLane: number }>();
    for (const id of group) {
      const other = clips.find((c) => c.id === id);
      if (!other) continue;
      offsets.set(id, {
        deltaTime: other.startTime - clip.startTime,
        deltaLane: (laneIndexById.get(other.trackId) ?? 0) - originLaneIndex,
      });
    }

    dragRef.current = {
      part,
      clipId: clip.id,
      originX: e.clientX,
      originY: e.clientY,
      originStart: clip.startTime,
      originLaneIndex,
      movedIds: group,
      offsets,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  useEffect(() => {
    function onMove(e: globalThis.PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const travel = Math.hypot(e.clientX - drag.originX, e.clientY - drag.originY);
      if (!drag.moved && travel < DRAG_THRESHOLD_PX) return;
      drag.moved = true;

      const clip = useProjectStore.getState().clips.find((c) => c.id === drag.clipId);
      if (!clip) return;
      const snapOn = !e.altKey;

      if (drag.part === "left" || drag.part === "right") {
        const candidates = snapCandidates(
          useProjectStore.getState().clips,
          currentTime,
          pxPerSecond,
          new Set([clip.id]),
        );
        trimClip(clip.id, drag.part, snapTime(timeAt(e.clientX), candidates, pxPerSecond, snapOn));
        return;
      }

      if (drag.part === "fadeIn") {
        setClipFade(clip.id, "in", Math.max(0, timeAt(e.clientX) - clip.startTime));
        return;
      }
      if (drag.part === "fadeOut") {
        setClipFade(clip.id, "out", Math.max(0, clip.startTime + clip.duration - timeAt(e.clientX)));
        return;
      }

      const dest = dragDestination({
        pointerX: e.clientX,
        pointerY: e.clientY,
        originX: drag.originX,
        originY: drag.originY,
        originStart: drag.originStart,
        originLaneIndex: drag.originLaneIndex,
        pxPerSecond,
        laneHeight: LANE_HEIGHT,
        laneCount: sortedTracks.length,
      });

      const candidates = snapCandidates(
        useProjectStore.getState().clips,
        currentTime,
        pxPerSecond,
        new Set(drag.movedIds),
      );
      const anchorStart = snapTime(dest.startTime, candidates, pxPerSecond, snapOn);

      const moves = drag.movedIds.flatMap((id) => {
        const offset = drag.offsets.get(id);
        if (!offset) return [];
        const laneIndex = Math.max(
          0,
          Math.min(sortedTracks.length - 1, dest.laneIndex + offset.deltaLane),
        );
        const target = sortedTracks[laneIndex];
        if (!target) return [];
        return [
          { id, trackId: target.id, startTime: Math.max(0, anchorStart + offset.deltaTime) },
        ];
      });
      if (moves.length > 0) moveClips(moves);
    }

    function onUp(e: globalThis.PointerEvent) {
      const drag = dragRef.current;
      dragRef.current = null;
      // A press that never travelled is a seek, not an edit.
      if (drag && !drag.moved && drag.part === "body" && !e.shiftKey) {
        onSeek(timeAt(e.clientX));
      }
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [pxPerSecond, currentTime, sortedTracks, timeAt, onSeek]);

  // ---- Lane background ----------------------------------------------------

  function handleLanePointerDown(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    const t = timeAt(e.clientX);
    if (tool === "blade") {
      const ids = useProjectStore
        .getState()
        .clips.filter((c) => t > c.startTime && t < c.startTime + c.duration)
        .map((c) => c.id);
      if (ids.length > 0) splitClipsAt(ids, t);
      return;
    }
    clearSelection();
    onSeek(t);
  }

  function handleContextMenu(e: ReactPointerEvent | React.MouseEvent, clip: Clip) {
    e.preventDefault();
    e.stopPropagation();
    const ids = selectedClipIds.includes(clip.id) ? selectedClipIds : [clip.id];
    if (!selectedClipIds.includes(clip.id)) selectClips([clip.id]);
    setMenu({ x: e.clientX, y: e.clientY, clipIds: ids });
  }

  const playheadLeft = HEADER_WIDTH + secondsToPixels(currentTime, pxPerSecond);

  return (
    <div className="relative flex-1 overflow-auto" data-tour="timeline">
      <div style={{ width: HEADER_WIDTH + contentWidth }} className="relative min-h-full">
        {/* Ruler row: the corner cell stays pinned over the header column. */}
        <div className="sticky top-0 z-30 flex">
          <div
            className="sticky left-0 z-40 shrink-0 border-b border-r border-studio-border bg-studio-panel"
            style={{ width: HEADER_WIDTH, height: RULER_HEIGHT }}
          />
          <TimeRuler pxPerSecond={pxPerSecond} widthPx={contentWidth} onSeek={onSeek} />
        </div>

        {sortedTracks.map((track, index) => (
          <div key={track.id} className="flex" style={{ height: LANE_HEIGHT }}>
            <div className="sticky left-0 z-20 shrink-0" style={{ width: HEADER_WIDTH }}>
              <TrackHeader
                track={track}
                index={index}
                armed={armedTrackId === track.id}
                level={levels[track.id] ?? 0}
                onToggleArm={() => onToggleArm(track.id)}
              />
            </div>
            <div
              ref={index === 0 ? lanesRef : undefined}
              onPointerDown={handleLanePointerDown}
              onPointerMove={(e) => {
                if (tool !== "blade") return;
                const rect = e.currentTarget.getBoundingClientRect();
                setBladeX(e.clientX - rect.left);
              }}
              onPointerLeave={() => setBladeX(null)}
              className={`relative shrink-0 border-b border-studio-border ${
                tool === "blade" ? "cursor-col-resize" : "cursor-text"
              }`}
              style={{
                width: contentWidth,
                backgroundImage: "linear-gradient(to right, var(--border) 1px, transparent 1px)",
                backgroundSize: `${pxPerSecond}px 100%`,
              }}
            >
              {clips
                .filter((c) => c.trackId === track.id)
                .map((clip) => (
                  <ClipView
                    key={clip.id}
                    clip={clip}
                    pxPerSecond={pxPerSecond}
                    library={library}
                    laneHeight={LANE_HEIGHT}
                    selected={selectedClipIds.includes(clip.id)}
                    onPointerDown={handleClipPointerDown}
                    onContextMenu={handleContextMenu}
                  />
                ))}
            </div>
          </div>
        ))}

        {sortedTracks.length === 0 && (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Importez un son ou ajoutez une piste pour commencer.
          </div>
        )}

        {/* Blade guide */}
        {tool === "blade" && bladeX !== null && sortedTracks.length > 0 && (
          <div
            className="pointer-events-none absolute z-20 w-px bg-destructive"
            style={{ left: HEADER_WIDTH + bladeX, top: RULER_HEIGHT, bottom: 0 }}
          />
        )}

        {/* Playhead */}
        <div
          className="pointer-events-none absolute z-20 w-px bg-orange-400"
          style={{ left: playheadLeft, top: 0, bottom: 0 }}
        >
          <div className="absolute -left-1.5 top-0 size-0 border-x-[6px] border-t-[7px] border-x-transparent border-t-orange-400" />
        </div>
      </div>

      {menu && (
        <ClipContextMenu
          x={menu.x}
          y={menu.y}
          clipIds={menu.clipIds}
          playhead={currentTime}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
