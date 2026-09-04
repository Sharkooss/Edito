import type { Track, Clip } from "../api/client";
import type { MediaLibrary } from "./mediaLibrary";
import type { ProcessedAudio } from "./processedAudio";
import { computeSchedule, projectDuration, audibleTracks } from "./scheduling";
import { buildClipChain } from "./clipChain";
import { ImpulseCache } from "./impulseResponse";

/**
 * Offline mixdown.
 *
 * Builds each clip through the very same `buildClipChain` the transport uses,
 * so gain, fades, EQ, reverb and speed cannot drift between what was heard and
 * what is exported.
 */
export async function renderMixdown(
  clips: Clip[],
  tracks: Track[],
  library: Pick<MediaLibrary, "get" | "preload">,
  processed: Pick<ProcessedAudio, "get" | "preload">,
  sampleRate: number,
): Promise<AudioBuffer> {
  const totalDuration = projectDuration(clips);
  const frames = Math.ceil(totalDuration * sampleRate);
  const offlineCtx = new OfflineAudioContext(2, Math.max(1, frames), sampleRate);
  if (frames <= 0) return offlineCtx.startRendering();

  await library.preload(clips.map((c) => c.mediaId));
  await processed.preload(clips);

  const audible = audibleTracks(tracks);
  const sourceDurations = new Map<string, number>();
  for (const clip of clips) {
    const buffer = library.get(clip.mediaId);
    if (buffer) sourceDurations.set(clip.mediaId, buffer.duration);
  }

  // Playhead 0: `when` is then the clip's own start time on the timeline.
  const entries = computeSchedule(clips, 0, sourceDurations).filter((e) => audible.has(e.trackId));
  const clipsById = new Map(clips.map((c) => [c.id, c]));

  // Impulses belong to the context that will play them, so the offline render
  // gets its own cache rather than borrowing the live one.
  const impulses = new ImpulseCache(
    (channels, length, rate) => offlineCtx.createBuffer(channels, length, rate),
    sampleRate,
  );

  const trackChains = new Map<string, GainNode>();
  for (const entry of entries) {
    const clip = clipsById.get(entry.clipId);
    const track = tracks.find((t) => t.id === entry.trackId);
    if (!clip || !track) continue;
    const audio = processed.get(clip);
    if (!audio) continue;

    let trackGain = trackChains.get(track.id);
    if (!trackGain) {
      trackGain = offlineCtx.createGain();
      trackGain.gain.value = track.volume;
      const panner = offlineCtx.createStereoPanner();
      panner.pan.value = track.pan;
      trackGain.connect(panner);
      panner.connect(offlineCtx.destination);
      trackChains.set(track.id, trackGain);
    }

    buildClipChain({ ctx: offlineCtx, impulses }, entry, audio, trackGain, entry.when);
  }

  return offlineCtx.startRendering();
}

export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const channelData: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channelData.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channelData[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}
