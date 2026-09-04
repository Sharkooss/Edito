import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { Toolbar } from "./components/Toolbar";
import { TrackList } from "./components/TrackList";
import { TimelineCanvas } from "./components/TimelineCanvas";
import { TransportBar } from "./components/TransportBar";
import { GuidedTour } from "./components/GuidedTour";
import { Button } from "./components/ui/button";
import { useProjectStore } from "./store/projectStore";
import { useHistoryStore } from "./store/historyStore";
import { decodeAudioFile } from "./audio/import";
import { AudioEngine } from "./audio/engine";
import { useEngineSync } from "./audio/useEngineSync";
import { Transport } from "./audio/transport";
import { uploadMedia, fetchProject } from "./api/client";
import { randomUUID } from "./lib/uuid";
import { MicRecorder, requestMicStream } from "./audio/record";
import { useAutosave } from "./lib/useAutosave";
import { renderMixdown, audioBufferToWav } from "./audio/export";
import { deleteClipWithHistory, splitClipWithHistory } from "./audio/clipEditing";
import { useKeyboardShortcuts } from "./lib/keyboard";

const audioCtx = new AudioContext();
const audioEngine = new AudioEngine(audioCtx);
const transport = new Transport(audioEngine);
const getBufferUrl = (mediaId: string) => `/api/media/${mediaId}`;

export default function App() {
  const { tracks, addTrack, addMedia, addClip, loadState } = useProjectStore();
  useEngineSync(audioEngine);
  const [currentTime, setCurrentTime] = useState(0);
  const [micRecorder, setMicRecorder] = useState<MicRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pxPerSecond, setPxPerSecond] = useState(100);
  const [tourOpen, setTourOpen] = useState(false);
  const { status: saveStatus, saveNow } = useAutosave(2000);

  useEffect(() => transport.onTimeUpdate(setCurrentTime), []);

  const zoomIn = () => setPxPerSecond((v) => Math.min(400, v * 1.25));
  const zoomOut = () => setPxPerSecond((v) => Math.max(20, v / 1.25));

  async function togglePlayPause() {
    if (isPlaying) {
      transport.pause();
      setIsPlaying(false);
    } else {
      await transport.play(useProjectStore.getState().clips, useProjectStore.getState().tracks, getBufferUrl);
      setIsPlaying(true);
    }
  }

  function stopPlayback() {
    transport.stop();
    setIsPlaying(false);
  }

  useEffect(() => {
    fetchProject().then((state) => {
      loadState({ tracks: state.tracks, clips: state.clips, media: state.media });
    });
  }, []);

  useKeyboardShortcuts({
    onPlayPause: () => {
      togglePlayPause();
    },
    onDelete: () => {
      const { clips, selectedClipId } = useProjectStore.getState();
      const clip = clips.find((c) => c.id === selectedClipId);
      if (clip) deleteClipWithHistory(clip);
    },
    onUndo: () => useHistoryStore.getState().undo(),
    onRedo: () => useHistoryStore.getState().redo(),
    onSplit: () => {
      const { clips, selectedClipId } = useProjectStore.getState();
      const clip = clips.find((c) => c.id === selectedClipId);
      if (clip) splitClipWithHistory(clip, currentTime);
    },
  });

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

  async function handleToggleRecord() {
    if (!isRecording) {
      try {
        const stream = await requestMicStream();
        const rec = new MicRecorder(stream);
        await rec.start();
        setMicRecorder(rec);
        setIsRecording(true);
      } catch (err) {
        console.error("Microphone access denied or unavailable:", err);
      }
    } else {
      const blob = await micRecorder!.stop();
      setIsRecording(false);
      const file = new File([blob], `Enregistrement ${new Date().toISOString()}.webm`, { type: "audio/webm" });
      await handleImport(file); // réutilise le flux d'import de Task 4.3
    }
  }

  async function handleExport() {
    try {
      const buffer = await renderMixdown(
        useProjectStore.getState().clips,
        useProjectStore.getState().tracks,
        (mediaId) => `/api/media/${mediaId}`,
        44100
      );
      const blob = audioBufferToWav(buffer);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "edito-mixdown.wav";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Mixdown export failed:", err);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-studio-bg text-neutral-100">
      <header className="flex items-center gap-2 border-b border-studio-border bg-studio-bg px-3 py-1.5">
        <span className="font-mono text-xs font-semibold tracking-[0.2em] text-primary">EDITO</span>
        <span className="text-xs text-muted-foreground">Studio de montage audio</span>
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto size-6"
          title="Visite guidée de l'interface"
          onClick={() => setTourOpen(true)}
        >
          <Info className="size-4" />
        </Button>
      </header>
      <GuidedTour open={tourOpen} onClose={() => setTourOpen(false)} />
      <Toolbar
        onImport={handleImport}
        isRecording={isRecording}
        onToggleRecord={handleToggleRecord}
        onExport={handleExport}
        saveStatus={saveStatus}
        onRetrySave={saveNow}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
      />
      <TransportBar transport={transport} isPlaying={isPlaying} onTogglePlayPause={togglePlayPause} onStop={stopPlayback} />
      <div className="flex flex-1">
        <TrackList />
        <TimelineCanvas pxPerSecond={pxPerSecond} currentTime={currentTime} onSeek={(t) => transport.seek(t)} />
      </div>
    </div>
  );
}
