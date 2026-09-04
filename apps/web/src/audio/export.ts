import type { Track, Clip } from "../api/client";

export async function renderMixdown(
  clips: Clip[],
  tracks: Track[],
  getBufferUrl: (mediaId: string) => string,
  sampleRate: number
): Promise<AudioBuffer> {
  const totalDuration = clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0) || 1;
  const offlineCtx = new OfflineAudioContext(2, Math.ceil(totalDuration * sampleRate), sampleRate);
  const bufferCache = new Map<string, AudioBuffer>();

  for (const clip of clips) {
    const track = tracks.find((t) => t.id === clip.trackId);
    if (!track) continue;
    const url = getBufferUrl(clip.mediaId);
    let buffer = bufferCache.get(url);
    if (!buffer) {
      const arrayBuffer = await fetch(url).then((r) => r.arrayBuffer());
      buffer = await offlineCtx.decodeAudioData(arrayBuffer);
      bufferCache.set(url, buffer);
    }
    const gain = offlineCtx.createGain();
    gain.gain.value = track.muted ? 0 : track.volume;
    const panner = offlineCtx.createStereoPanner();
    panner.pan.value = track.pan;
    gain.connect(panner);
    panner.connect(offlineCtx.destination);

    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.start(clip.startTime, clip.sourceOffset, clip.duration);
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
