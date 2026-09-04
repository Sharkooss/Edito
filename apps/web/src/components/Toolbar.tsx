import { useRef, type DragEvent } from "react";
import { Button } from "./ui/button";

export function Toolbar({
  onImport,
  isRecording,
  onToggleRecord,
}: {
  onImport: (file: File) => void;
  isRecording: boolean;
  onToggleRecord: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

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
    </div>
  );
}
