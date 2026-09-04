import { create } from "zustand";
import type { Track, Clip, MediaDTO } from "../api/client";

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
}));
