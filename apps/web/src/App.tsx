import { useEffect, useState } from "react";
import { Toolbar } from "./components/Toolbar";
import { TrackList } from "./components/TrackList";
import { TimelineCanvas } from "./components/TimelineCanvas";
import { TransportBar } from "./components/TransportBar";
import { useProjectStore } from "./store/projectStore";
import { decodeAudioFile } from "./audio/import";
import { AudioEngine } from "./audio/engine";
import { useEngineSync } from "./audio/useEngineSync";
import { Transport } from "./audio/transport";
import { uploadMedia } from "./api/client";
import { randomUUID } from "./lib/uuid";

const audioCtx = new AudioContext();
const audioEngine = new AudioEngine(audioCtx);
const transport = new Transport(audioEngine);
const getBufferUrl = (mediaId: string) => `/api/media/${mediaId}`;

export default function App() {
  const { tracks, addTrack, addMedia, addClip } = useProjectStore();
  useEngineSync(audioEngine);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => transport.onTimeUpdate(setCurrentTime), []);

  async function handleImport(file: File) {
    const buffer = await decodeAudioFile(file, audioCtx);
    const media = await uploadMedia(file, { duration: buffer.duration, sampleRate: buffer.sampleRate });
    addMedia(media);
    let trackId = tracks[0]?.id;
    if (!trackId) {
      trackId = randomUUID();
      addTrack({ id: trackId, orderIndex: 0, name: "Piste 1", color: "", volume: 1, pan: 0, muted: false, soloed: false });
    }
    addClip({ id: randomUUID(), trackId, mediaId: media.id, startTime: 0, sourceOffset: 0, duration: media.duration, name: media.originalFilename });
  }

  return (
    <div className="flex min-h-screen flex-col bg-studio-bg text-neutral-100">
      <Toolbar onImport={handleImport} />
      <TransportBar transport={transport} getBufferUrl={getBufferUrl} />
      <div className="flex flex-1">
        <TrackList />
        <TimelineCanvas pxPerSecond={100} currentTime={currentTime} onSeek={(t) => transport.seek(t)} />
      </div>
    </div>
  );
}
