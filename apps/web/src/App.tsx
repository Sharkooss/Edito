import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Info, UploadCloud } from "lucide-react";
import { Toolbar } from "./components/Toolbar";
import { Timeline } from "./components/Timeline";
import { TransportBar } from "./components/TransportBar";
import { GuidedTour } from "./components/GuidedTour";
import { RecordCountdown } from "./components/RecordCountdown";
import { Button } from "./components/ui/button";
import { Toaster } from "./components/ui/toaster";
import { toast } from "./hooks/use-toast";
import { useProjectStore } from "./store/projectStore";
import { useHistoryStore } from "./store/historyStore";
import { decodeAudioFile } from "./audio/import";
import { AudioEngine } from "./audio/engine";
import { MediaLibrary } from "./audio/mediaLibrary";
import { ProcessedAudio } from "./audio/processedAudio";
import { useEngineSync } from "./audio/useEngineSync";
import { Transport } from "./audio/transport";
import { uploadMedia, fetchProject } from "./api/client";
import { randomUUID } from "./lib/uuid";
import { MicRecorder } from "./audio/record";
import { recordingReducer, armedTrackId } from "./audio/recordingMachine";
import { useAutosave } from "./lib/useAutosave";
import { renderMixdown, audioBufferToWav } from "./audio/export";
import { splitClipsAt, deleteClips, duplicateClips } from "./audio/clipEditing";
import { resolvePlacement } from "./audio/overlap";
import { useKeyboardShortcuts } from "./lib/keyboard";

const audioCtx = new AudioContext();
const audioEngine = new AudioEngine(audioCtx);
const mediaLibrary = new MediaLibrary(audioCtx, (mediaId) => `/api/media/${mediaId}`);
const processedAudio = new ProcessedAudio(mediaLibrary, (channels, length, sampleRate) =>
  audioCtx.createBuffer(channels, length, sampleRate),
);
const transport = new Transport(audioEngine, mediaLibrary, processedAudio);

export default function App() {
  const { addMedia, addClip, loadState } = useProjectStore();
  useEngineSync(audioEngine);

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pxPerSecond, setPxPerSecond] = useState(100);
  const [tourOpen, setTourOpen] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [recording, dispatchRecording] = useReducer(recordingReducer, { phase: "idle" });
  const [elapsed, setElapsed] = useState(0);

  const dragCounterRef = useRef(0);
  const recorderRef = useRef<MicRecorder | null>(null);
  const recordingRef = useRef(recording);
  recordingRef.current = recording;

  const { status: saveStatus, saveNow } = useAutosave(2000);
  const armedId = armedTrackId(recording);

  // ---- Audio context unlock ------------------------------------------------
  // Browsers keep a context suspended until a user gesture. Without this the
  // transport runs and the playhead moves while nothing is ever audible.
  useEffect(() => {
    const unlock = () => {
      audioEngine.unlock();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // ---- Transport wiring ----------------------------------------------------
  useEffect(() => transport.onTimeUpdate(setCurrentTime), []);
  useEffect(() => transport.onEnded(() => setIsPlaying(false)), []);

  useEffect(() => {
    const sync = (state: ReturnType<typeof useProjectStore.getState>) => {
      transport.setProject(state.clips, state.tracks);
      void mediaLibrary.preload(state.clips.map((c) => c.mediaId));
    };
    sync(useProjectStore.getState());
    return useProjectStore.subscribe(sync);
  }, []);

  // ---- Metering ------------------------------------------------------------
  // One loop for the whole app rather than one per track header.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const { tracks } = useProjectStore.getState();
      const next: Record<string, number> = {};
      for (const t of tracks) next[t.id] = audioEngine.trackLevel(t.id);
      const armed = armedTrackId(recordingRef.current);
      if (armed && recorderRef.current) next[armed] = recorderRef.current.level();
      setLevels(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- Project load --------------------------------------------------------
  useEffect(() => {
    fetchProject()
      .then((state) => {
        loadState({ tracks: state.tracks, clips: state.clips, media: state.media });
        return mediaLibrary.preload(state.clips.map((c) => c.mediaId));
      })
      .catch((err) => {
        console.error("Failed to load project:", err);
        toast({
          variant: "destructive",
          title: "Projet indisponible",
          description: "Impossible de charger le projet depuis le serveur.",
        });
      });
  }, [loadState]);

  // ---- Import --------------------------------------------------------------
  const handleImport = useCallback(async (files: File[]) => {
    for (const file of files) {
      try {
        const buffer = await decodeAudioFile(file, audioCtx);
        const media = await uploadMedia(file, {
          duration: buffer.duration,
          sampleRate: buffer.sampleRate,
        });
        addMedia(media);

        // Its own track, at the playhead, never stacked on what is already there.
        const track = useProjectStore.getState().ensureTrackForImport();
        const startTime = resolvePlacement(
          useProjectStore.getState().clips,
          track.id,
          transport.getCurrentTime(),
          media.duration,
        );
        addClip({
          id: randomUUID(),
          trackId: track.id,
          mediaId: media.id,
          startTime,
          sourceOffset: 0,
          duration: media.duration,
          name: media.originalFilename,
          gain: 1,
          fadeIn: 0,
          fadeOut: 0,
        });
        await mediaLibrary.load(media.id);
      } catch (err) {
        console.error("Audio import failed:", err);
        toast({
          variant: "destructive",
          title: "Échec de l'import",
          description: `${file.name} n'a pas pu être importé.`,
        });
      }
    }
  }, [addMedia, addClip]);

  // ---- Drag and drop -------------------------------------------------------
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    function onDragEnter(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounterRef.current += 1;
      setIsDraggingFile(true);
    }
    function onDragOver(e: DragEvent) {
      if (hasFiles(e)) e.preventDefault();
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
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) void handleImport(files);
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
  }, [handleImport]);

  // ---- Transport controls --------------------------------------------------
  async function togglePlayPause() {
    if (isPlaying) {
      transport.pause();
      setIsPlaying(false);
    } else {
      await transport.play();
      setIsPlaying(true);
    }
  }

  function stopPlayback() {
    transport.stop();
    setIsPlaying(false);
  }

  // ---- Recording -----------------------------------------------------------
  async function handleToggleArm(trackId: string) {
    if (armedId === trackId) {
      recorderRef.current?.close();
      recorderRef.current = null;
      dispatchRecording({ type: "DISARM" });
      return;
    }
    try {
      await audioEngine.unlock();
      recorderRef.current?.close();
      recorderRef.current = await MicRecorder.open(audioCtx);
      dispatchRecording({ type: "ARM", trackId });
    } catch (err) {
      console.error("Microphone unavailable:", err);
      dispatchRecording({ type: "DISARM" });
      toast({
        variant: "destructive",
        title: "Micro indisponible",
        description: "Vérifie que le navigateur a l'autorisation d'accéder au micro.",
      });
    }
  }

  // Count-in ticks, then capture starts.
  useEffect(() => {
    if (recording.phase !== "counting") return;
    if (recording.remaining === 0) {
      const recorder = recorderRef.current;
      if (!recorder) {
        dispatchRecording({ type: "CANCEL" });
        return;
      }
      const startedAt = transport.getCurrentTime();
      recorder.start();
      // A take routinely extends past the existing material; the transport must
      // keep rolling instead of stopping at the old project end.
      transport.setAutoStopAllowed(false);
      void transport.play().then(() => setIsPlaying(true));
      dispatchRecording({ type: "BEGIN", startedAt });
      return;
    }
    const id = setTimeout(() => dispatchRecording({ type: "TICK" }), 1000);
    return () => clearTimeout(id);
  }, [recording]);

  // Elapsed-time readout while capturing.
  useEffect(() => {
    if (recording.phase !== "recording") {
      setElapsed(0);
      return;
    }
    const startedAt = recording.startedAt;
    const id = setInterval(() => setElapsed(transport.getCurrentTime() - startedAt), 100);
    return () => clearInterval(id);
  }, [recording]);

  async function finishRecording(trackId: string, startedAt: number) {
    const recorder = recorderRef.current;
    if (!recorder) return;
    const blob = await recorder.stop();
    transport.pause();
    transport.setAutoStopAllowed(true);
    setIsPlaying(false);
    dispatchRecording({ type: "STOP" });

    if (blob.size === 0) {
      toast({
        variant: "destructive",
        title: "Enregistrement vide",
        description: "Aucun son n'a été capturé.",
      });
      return;
    }

    const stamp = new Date().toLocaleTimeString("fr-FR").replace(/:/g, "-");
    const file = new File([blob], `Enregistrement ${stamp}.${recorder.fileExtension()}`, {
      type: blob.type,
    });
    try {
      const buffer = await decodeAudioFile(file, audioCtx);
      const media = await uploadMedia(file, {
        duration: buffer.duration,
        sampleRate: buffer.sampleRate,
      });
      addMedia(media);
      const startTime = resolvePlacement(
        useProjectStore.getState().clips,
        trackId,
        startedAt,
        media.duration,
      );
      addClip({
        id: randomUUID(),
        trackId,
        mediaId: media.id,
        startTime,
        sourceOffset: 0,
        duration: media.duration,
        name: file.name,
        gain: 1,
        fadeIn: 0,
        fadeOut: 0,
      });
      await mediaLibrary.load(media.id);
    } catch (err) {
      console.error("Recording could not be saved:", err);
      toast({
        variant: "destructive",
        title: "Enregistrement perdu",
        description: "Le son capturé n'a pas pu être enregistré.",
      });
    }
  }

  function handleToggleRecord() {
    if (recording.phase === "armed") {
      dispatchRecording({ type: "START_COUNT" });
    } else if (recording.phase === "counting") {
      dispatchRecording({ type: "CANCEL" });
    } else if (recording.phase === "recording") {
      void finishRecording(recording.trackId, recording.startedAt);
    }
  }

  // ---- Export --------------------------------------------------------------
  async function handleExport() {
    try {
      const { clips, tracks } = useProjectStore.getState();
      if (clips.length === 0) {
        toast({ title: "Rien à exporter", description: "Le projet ne contient aucun clip." });
        return;
      }
      const buffer = await renderMixdown(clips, tracks, mediaLibrary, processedAudio, 44100);
      const url = URL.createObjectURL(audioBufferToWav(buffer));
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

  // ---- Selection-scoped actions -------------------------------------------
  const targetClipIds = useCallback((): string[] => {
    const { clips, selectedClipIds } = useProjectStore.getState();
    if (selectedClipIds.length > 0) return selectedClipIds;
    const t = transport.getCurrentTime();
    return clips.filter((c) => t > c.startTime && t < c.startTime + c.duration).map((c) => c.id);
  }, []);

  const splitAtPlayhead = useCallback(() => {
    splitClipsAt(targetClipIds(), transport.getCurrentTime());
  }, [targetClipIds]);

  useKeyboardShortcuts({
    onPlayPause: () => void togglePlayPause(),
    onDelete: () => deleteClips(useProjectStore.getState().selectedClipIds),
    onUndo: () => useHistoryStore.getState().undo(),
    onRedo: () => useHistoryStore.getState().redo(),
    onSplit: splitAtPlayhead,
    onSelectTool: () => useProjectStore.getState().setTool("select"),
    onBladeTool: () => useProjectStore.getState().setTool("blade"),
    onDuplicate: () => duplicateClips(useProjectStore.getState().selectedClipIds),
    onSelectAll: () =>
      useProjectStore.getState().selectClips(useProjectStore.getState().clips.map((c) => c.id)),
  });

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-studio-bg text-neutral-100">
      <header className="flex shrink-0 items-center gap-2 border-b border-studio-border bg-studio-bg px-3 py-1.5">
        <span className="font-mono text-xs font-semibold tracking-[0.2em] text-primary">EDITO</span>
        <span className="text-xs text-muted-foreground">Studio de montage audio</span>
        {recording.phase === "recording" && (
          <span className="ml-3 flex items-center gap-1.5 rounded bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground">
            <span className="size-2 animate-pulse rounded-full bg-current" />
            REC {elapsed.toFixed(1)}s
          </span>
        )}
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
      <Toaster />

      {isDraggingFile && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-studio-bg/60">
          <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-primary bg-studio-panel/90 px-10 py-8">
            <UploadCloud className="size-8 text-primary" />
            <p className="text-sm font-medium">Déposer pour importer</p>
          </div>
        </div>
      )}

      {recording.phase === "counting" && (
        <RecordCountdown
          remaining={recording.remaining}
          onCancel={() => dispatchRecording({ type: "CANCEL" })}
        />
      )}

      <Toolbar
        onImport={(files) => void handleImport(files)}
        recordPhase={recording.phase}
        onToggleRecord={handleToggleRecord}
        canRecord={armedId !== null}
        onExport={handleExport}
        onSplitAtPlayhead={splitAtPlayhead}
        onAddTrack={() => useProjectStore.getState().appendTrack()}
        saveStatus={saveStatus}
        onRetrySave={saveNow}
        onZoomIn={() => setPxPerSecond((v) => Math.min(400, v * 1.25))}
        onZoomOut={() => setPxPerSecond((v) => Math.max(20, v / 1.25))}
      />

      <TransportBar
        transport={transport}
        isPlaying={isPlaying}
        onTogglePlayPause={() => void togglePlayPause()}
        onStop={stopPlayback}
      />

      <Timeline
        pxPerSecond={pxPerSecond}
        currentTime={currentTime}
        library={mediaLibrary}
        levels={levels}
        armedTrackId={armedId}
        onSeek={(t) => transport.seek(t)}
        onToggleArm={(trackId) => void handleToggleArm(trackId)}
      />
    </div>
  );
}
