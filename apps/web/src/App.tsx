import { useEffect, useRef, useState } from "react";
import { Info, UploadCloud } from "lucide-react";
import { Toolbar } from "./components/Toolbar";
import { TrackList } from "./components/TrackList";
import { TimelineCanvas } from "./components/TimelineCanvas";
import { TransportBar } from "./components/TransportBar";
import { GuidedTour } from "./components/GuidedTour";
import { Button } from "./components/ui/button";
import { Toaster } from "./components/ui/toaster";
import { toast } from "./hooks/use-toast";
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
  const { addTrack, addMedia, addClip, loadState } = useProjectStore();
  useEngineSync(audioEngine);
  const [currentTime, setCurrentTime] = useState(0);
  const [micRecorder, setMicRecorder] = useState<MicRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pxPerSecond, setPxPerSecond] = useState(100);
  const [tourOpen, setTourOpen] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounterRef = useRef(0);
  const { status: saveStatus, saveNow } = useAutosave(2000);

  useEffect(() => transport.onTimeUpdate(setCurrentTime), []);

  useEffect(() => {
    function hasFiles(e: DragEvent) {
      return !!e.dataTransfer?.types.includes("Files");
    }
    function onDragEnter(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounterRef.current += 1;
      setIsDraggingFile(true);
    }
    function onDragOver(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
    }
    function onDragLeave(e: DragEvent) {
      if (!hasFiles(e)) return;
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      if (dragCounterRef.current === 0) setIsDraggingFile(false);
    }
    function onDrop(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDraggingFile(false);
      const file = e.dataTransfer?.files[0];
      if (file) handleImport(file);
    }
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

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
    fetchProject()
      .then((state) => {
        loadState({ tracks: state.tracks, clips: state.clips, media: state.media });
      })
      .catch((err) => {
        console.error("Failed to load project:", err);
        toast({
          variant: "destructive",
          title: "Projet indisponible",
          description: "Impossible de charger le projet depuis le serveur.",
        });
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
    try {
      const buffer = await decodeAudioFile(file, audioCtx);
      const media = await uploadMedia(file, { duration: buffer.duration, sampleRate: buffer.sampleRate });
      addMedia(media);
      let trackId = useProjectStore.getState().tracks[0]?.id;
      if (!trackId) {
        trackId = randomUUID();
        addTrack({ id: trackId, orderIndex: 0, name: "Piste 1", color: "", volume: 1, pan: 0, muted: false, soloed: false });
      }
      addClip({ id: randomUUID(), trackId, mediaId: media.id, startTime: 0, sourceOffset: 0, duration: media.duration, name: media.originalFilename });
    } catch (err) {
      console.error("Audio import failed:", err);
      toast({
        variant: "destructive",
        title: "Échec de l'import",
        description: err instanceof Error ? err.message : "Le fichier n'a pas pu être importé.",
      });
    }
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
        toast({
          variant: "destructive",
          title: "Micro indisponible",
          description: "Vérifie que le navigateur a l'autorisation d'accéder au micro.",
        });
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
      toast({
        variant: "destructive",
        title: "Échec de l'export",
        description: err instanceof Error ? err.message : "Le mixdown n'a pas pu être généré.",
      });
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
      {isDraggingFile && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-studio-bg/60">
          <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-primary bg-studio-panel/90 px-10 py-8">
            <UploadCloud className="size-8 text-primary" />
            <p className="text-sm font-medium">Déposer pour importer</p>
          </div>
        </div>
      )}
      <Toaster />
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
