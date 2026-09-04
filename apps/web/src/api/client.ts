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

export interface MediaDTO {
  id: string;
  originalFilename: string;
  duration: number;
  sampleRate: number;
}

export interface ProjectState {
  project: { id: number; name: string; sampleRate: number };
  tracks: Track[];
  clips: Clip[];
  media: MediaDTO[];
}

export interface ProjectPatch {
  project?: { name?: string };
  tracks?: Track[];
  clips?: Clip[];
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<T>;
}

export function fetchProject(): Promise<ProjectState> {
  return fetch("/api/project").then(handle<ProjectState>);
}

export function saveProject(patch: ProjectPatch): Promise<void> {
  return fetch("/api/project", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).then((res) => handle<{ ok: boolean }>(res)).then(() => undefined);
}

export function uploadMedia(file: File, meta: { duration: number; sampleRate: number }): Promise<MediaDTO> {
  const form = new FormData();
  form.append("file", file);
  form.append("duration", String(meta.duration));
  form.append("sampleRate", String(meta.sampleRate));
  return fetch("/api/media", { method: "POST", body: form }).then(handle<MediaDTO>);
}

export function deleteMedia(id: string): Promise<void> {
  return fetch(`/api/media/${id}`, { method: "DELETE" }).then((res) => {
    if (!res.ok && res.status !== 204) throw new Error(`API error ${res.status}`);
  });
}
