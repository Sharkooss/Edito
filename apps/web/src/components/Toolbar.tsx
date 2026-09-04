import { useRef, useState, type DragEvent } from "react";
import { AlertTriangle, Check, Loader2, Mic, Square, Upload, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "./ui/button";

export function Toolbar({
  onImport,
  isRecording,
  onToggleRecord,
  onExport,
  saveStatus,
  onRetrySave,
  onZoomIn,
  onZoomOut,
}: {
  onImport: (file: File) => void;
  isRecording: boolean;
  onToggleRecord: () => void;
  onExport: () => Promise<void>;
  saveStatus?: "idle" | "saving" | "saved" | "error";
  onRetrySave?: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onImport(file);
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className="flex items-center gap-3 border-b border-studio-border bg-studio-panel px-3 py-2"
    >
      <div className="flex items-center gap-2">
        <Button onClick={() => inputRef.current?.click()}>
          <Upload className="size-4" />
          Importer un son
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImport(file);
            e.target.value = "";
          }}
        />
        <span className="hidden text-xs text-muted-foreground sm:inline">
          ou glisser-déposer un fichier ici
        </span>
      </div>

      <div className="h-6 w-px bg-studio-border" />

      <Button
        variant={isRecording ? "destructive" : "secondary"}
        onClick={onToggleRecord}
        className={isRecording ? "animate-pulse" : ""}
      >
        {isRecording ? (
          <>
            <Square className="size-4 fill-current" />
            Arrêter l'enregistrement
          </>
        ) : (
          <>
            <Mic className="size-4" />
            Enregistrer
          </>
        )}
      </Button>

      <div className="h-6 w-px bg-studio-border" />

      <Button
        variant="secondary"
        disabled={isExporting}
        onClick={async () => {
          setIsExporting(true);
          try {
            await onExport();
          } finally {
            setIsExporting(false);
          }
        }}
      >
        {isExporting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Export en cours…
          </>
        ) : (
          "Exporter le mixdown"
        )}
      </Button>

      <div className="ml-auto flex items-center gap-3">
        {saveStatus && saveStatus !== "idle" && (
          <div className="flex items-center gap-2 rounded-md border border-studio-border bg-console-inset px-2 py-1">
            {saveStatus === "error" ? (
              <>
                <AlertTriangle className="size-3.5 text-destructive" />
                <span className="text-xs text-destructive">Erreur de sauvegarde</span>
                <Button size="sm" variant="outline" onClick={onRetrySave}>
                  Réessayer
                </Button>
              </>
            ) : saveStatus === "saving" ? (
              <>
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Sauvegarde…</span>
              </>
            ) : (
              <>
                <Check className="size-3.5 text-console-meter" />
                <span className="text-xs text-muted-foreground">Sauvegardé</span>
              </>
            )}
          </div>
        )}

        <div className="flex gap-1 rounded-md border border-studio-border bg-console-inset p-0.5">
          <Button size="icon" variant="ghost" title="Zoom arrière" onClick={onZoomOut}>
            <ZoomOut className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" title="Zoom avant" onClick={onZoomIn}>
            <ZoomIn className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
