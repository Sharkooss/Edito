import { useRef, useState, type DragEvent } from "react";
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
      className="flex items-center gap-2 border-b border-studio-border bg-studio-panel p-2"
    >
      <Button onClick={() => inputRef.current?.click()}>Importer un son</Button>
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
      <span className="text-xs text-neutral-400">ou glisser-déposer un fichier ici</span>
      <Button variant={isRecording ? "destructive" : "outline"} onClick={onToggleRecord}>
        {isRecording ? "■ Arrêter l'enregistrement" : "● Enregistrer"}
      </Button>
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
        {isExporting ? "Export en cours..." : "Exporter le mixdown"}
      </Button>
      <div className="ml-auto flex gap-1">
        <Button size="icon" variant="outline" onClick={onZoomOut}>
          −
        </Button>
        <Button size="icon" variant="outline" onClick={onZoomIn}>
          +
        </Button>
      </div>
      {saveStatus && (
        <div className="flex items-center gap-2">
          {saveStatus === "error" ? (
            <>
              <span className="text-xs text-red-500">Erreur de sauvegarde</span>
              <Button variant="outline" onClick={onRetrySave}>
                Réessayer
              </Button>
            </>
          ) : (
            <span className="text-xs text-neutral-400">
              {saveStatus === "saving" ? "Sauvegarde..." : saveStatus === "saved" ? "Sauvegardé" : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
