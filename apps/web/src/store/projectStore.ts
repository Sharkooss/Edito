import { create } from "zustand";
import type { Track, Clip, MediaDTO } from "../api/client";
import { randomUUID } from "../lib/uuid";

export type { Track, Clip, MediaDTO };

export type Tool = "select" | "blade";

interface ProjectStoreState {
  tracks: Track[];
  clips: Clip[];
  media: MediaDTO[];
  selectedClipIds: string[];
  tool: Tool;
  hydrated: boolean;
  loadState: (s: { tracks: Track[]; clips: Clip[]; media: MediaDTO[] }) => void;
  addTrack: (track: Track) => void;
  removeTrack: (id: string) => void;
  addClip: (clip: Clip) => void;
  updateClip: (id: string, patch: Partial<Clip>) => void;
  removeClip: (id: string) => void;
  addMedia: (media: MediaDTO) => void;
  setTool: (tool: Tool) => void;
  selectClips: (ids: string[]) => void;
  toggleClipSelection: (id: string) => void;
  clearSelection: () => void;
  reorderTrack: (id: string, direction: "up" | "down") => void;
  updateTrack: (id: string, patch: Partial<Track>) => void;
  appendTrack: () => Track;
  ensureTrackForImport: () => Track;
}

function makeTrack(orderIndex: number): Track {
  return {
    id: randomUUID(),
    orderIndex,
    name: `Piste ${orderIndex + 1}`,
    color: "",
    volume: 1,
    pan: 0,
    muted: false,
    soloed: false,
  };
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  tracks: [],
  clips: [],
  media: [],
  selectedClipIds: [],
  tool: "select",
  hydrated: false,
  loadState: (s) => set({ tracks: s.tracks, clips: s.clips, media: s.media, hydrated: true }),
  addTrack: (track) => set((s) => ({ tracks: [...s.tracks, track] })),
  removeTrack: (id) =>
    set((s) => {
      const doomed = new Set(s.clips.filter((c) => c.trackId === id).map((c) => c.id));
      return {
        tracks: s.tracks.filter((t) => t.id !== id),
        clips: s.clips.filter((c) => c.trackId !== id),
        // Leaving deleted clips selected would let a later Delete or Move act
        // on ids that no longer exist.
        selectedClipIds: s.selectedClipIds.filter((cid) => !doomed.has(cid)),
      };
    }),
  addClip: (clip) => set((s) => ({ clips: [...s.clips, clip] })),
  updateClip: (id, patch) =>
    set((s) => ({ clips: s.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
  removeClip: (id) =>
    set((s) => ({
      clips: s.clips.filter((c) => c.id !== id),
      selectedClipIds: s.selectedClipIds.filter((cid) => cid !== id),
    })),
  addMedia: (media) => set((s) => ({ media: [...s.media, media] })),
  setTool: (tool) => set({ tool }),
  selectClips: (ids) => set({ selectedClipIds: ids }),
  toggleClipSelection: (id) =>
    set((s) => ({
      selectedClipIds: s.selectedClipIds.includes(id)
        ? s.selectedClipIds.filter((c) => c !== id)
        : [...s.selectedClipIds, id],
    })),
  clearSelection: () => set({ selectedClipIds: [] }),
  reorderTrack: (id, direction) =>
    set((s) => {
      const sorted = [...s.tracks].sort((a, b) => a.orderIndex - b.orderIndex);
      const idx = sorted.findIndex((t) => t.id === id);
      const swapWith = direction === "up" ? idx - 1 : idx + 1;
      if (idx < 0 || swapWith < 0 || swapWith >= sorted.length) return s;
      const a = sorted[idx];
      const b = sorted[swapWith];
      return {
        tracks: s.tracks.map((t) => {
          if (t.id === a.id) return { ...t, orderIndex: b.orderIndex };
          if (t.id === b.id) return { ...t, orderIndex: a.orderIndex };
          return t;
        }),
      };
    }),
  updateTrack: (id, patch) =>
    set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
  appendTrack: () => {
    const track = makeTrack(get().tracks.length);
    set((s) => ({ tracks: [...s.tracks, track] }));
    return track;
  },
  /**
   * The track an import should land on: the first empty one, else a fresh one.
   * v1 always used tracks[0] at startTime 0, so every import stacked on top of
   * the previous one.
   */
  ensureTrackForImport: () => {
    const { tracks, clips } = get();
    const occupied = new Set(clips.map((c) => c.trackId));
    const empty = [...tracks]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .find((t) => !occupied.has(t.id));
    if (empty) return empty;
    return get().appendTrack();
  },
}));
