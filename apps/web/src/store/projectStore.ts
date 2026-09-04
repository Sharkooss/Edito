import { create } from "zustand";
import type { Track, Clip, MediaDTO } from "../api/client";

export type { Track, Clip, MediaDTO };

interface ProjectStoreState {
  tracks: Track[];
  clips: Clip[];
  media: MediaDTO[];
  selectedClipId: string | null;
  loadState: (s: { tracks: Track[]; clips: Clip[]; media: MediaDTO[] }) => void;
  addTrack: (track: Track) => void;
  removeTrack: (id: string) => void;
  addClip: (clip: Clip) => void;
  updateClip: (id: string, patch: Partial<Clip>) => void;
  removeClip: (id: string) => void;
  addMedia: (media: MediaDTO) => void;
  selectClip: (id: string | null) => void;
  reorderTrack: (id: string, direction: "up" | "down") => void;
}

export const useProjectStore = create<ProjectStoreState>((set) => ({
  tracks: [],
  clips: [],
  media: [],
  selectedClipId: null,
  loadState: (s) => set({ tracks: s.tracks, clips: s.clips, media: s.media }),
  addTrack: (track) => set((s) => ({ tracks: [...s.tracks, track] })),
  removeTrack: (id) =>
    set((s) => ({ tracks: s.tracks.filter((t) => t.id !== id), clips: s.clips.filter((c) => c.trackId !== id) })),
  addClip: (clip) => set((s) => ({ clips: [...s.clips, clip] })),
  updateClip: (id, patch) =>
    set((s) => ({ clips: s.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
  removeClip: (id) => set((s) => ({ clips: s.clips.filter((c) => c.id !== id) })),
  addMedia: (media) => set((s) => ({ media: [...s.media, media] })),
  selectClip: (id) => set({ selectedClipId: id }),
  reorderTrack: (id, direction) =>
    set((s) => {
      const sorted = [...s.tracks].sort((a, b) => a.orderIndex - b.orderIndex);
      const idx = sorted.findIndex((t) => t.id === id);
      const swapWith = direction === "up" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= sorted.length) return s;
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
}));
