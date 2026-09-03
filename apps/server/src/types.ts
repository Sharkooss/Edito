export interface Project {
  id: number;
  name: string;
  sampleRate: number;
}

export interface Track {
  id: string;
  orderIndex: number;
  name: string;
  color: string;
  volume: number;
  pan: number;
  muted: boolean;
  soloed: boolean;
}

export interface Clip {
  id: string;
  trackId: string;
  mediaId: string;
  startTime: number;
  sourceOffset: number;
  duration: number;
  name: string;
}

export interface Media {
  id: string;
  originalFilename: string;
  storedFilename: string;
  duration: number;
  sampleRate: number;
}

export interface ProjectState {
  project: Project;
  tracks: Track[];
  clips: Clip[];
  media: Media[];
}
