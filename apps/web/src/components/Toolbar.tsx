import { useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Loader2,
  MousePointer2,
  Mic,
  Plus,
  Scissors,
  Split,
  Square,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "./ui/button";
import { Hint } from "./Hint";
import { useProjectStore } from "../store/projectStore";
import { cn } from "../lib/utils";

export function Toolbar({
  onImport,
  recordPhase,
  onToggleRecord,
  canRecord,
  onExport,
  onSplitAtPlayhead,
  onAddTrack,
  saveStatus,
  onRetrySave,
  onZoomIn,
  onZoomOut,
}: {
  onImport: (files: File[]) => void;
  recordPhase: "idle" | "armed" | "counting" | "recording";
  onToggleRecord: () => void;
  canRecord: boolean;
  onExport: () => Promise<void>;
  onSplitAtPlayhead: () => void;
  onAddTrack: () => void;
  saveStatus?: "idle" | "saving" | "saved" | "error";
  onRetrySave?: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const tool = useProjectStore((s) => s.tool);
  const setTool = useProjectStore((s) => s.setTool);

  const isCapturing = recordPhase === "recording" || recordPhase === "counting";
  const toolButton =
    "flex h-8 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors";

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-studio-border bg-studio-panel px-3 py-2">
      <div className="flex items-center gap-2" data-tour="import">
        <Hint label="Ajoute un ou plusieurs fichiers audio. Chacun arrive sur sa propre piste, à la tête de lecture.">
          <Button onClick={() => inputRef.current?.click()}>
            <Upload className="size-4" />
            Importer un son
          </Button>
        </Hint>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) onImport(files);
            e.target.value = "";
          }}
        />
        <Hint label="Ajoute une piste vide en bas du projet.">
          <Button variant="secondary" onClick={onAddTrack}>
            <Plus className="size-4" />
            Piste
          </Button>
        </Hint>
      </div>

      <div className="h-6 w-px bg-studio-border" />

      {/* Tools */}
      <div
        className="flex gap-0.5 rounded-md border border-studio-border bg-console-inset p-0.5"
        data-tour="tools"
      >
        <Hint label="Sélection (V) — déplacer les clips dans le temps et d'une piste à l'autre.">
          <button
            type="button"
            aria-pressed={tool === "select"}
            onClick={() => setTool("select")}
            className={cn(
              toolButton,
              tool === "select"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-studio-border/60",
            )}
          >
            <MousePointer2 className="size-3.5" />
            Sélection
          </button>
        </Hint>
        <Hint label="Lame (C) — cliquer sur un clip pour le couper à l'endroit exact du curseur.">
          <button
            type="button"
            aria-pressed={tool === "blade"}
            onClick={() => setTool("blade")}
            className={cn(
              toolButton,
              tool === "blade"
                ? "bg-destructive text-destructive-foreground"
                : "text-muted-foreground hover:bg-studio-border/60",
            )}
          >
            <Scissors className="size-3.5" />
            Lame
          </button>
        </Hint>
      </div>

      <Hint label="Coupe les clips sélectionnés à la tête de lecture (S).">
        <Button variant="secondary" onClick={onSplitAtPlayhead}>
          <Split className="size-4" />
          Couper ici
        </Button>
      </Hint>

      <div className="h-6 w-px bg-studio-border" />

      <div data-tour="record">
        <Hint
          label={
            canRecord || isCapturing
              ? "Démarrer ou arrêter l'enregistrement"
              : "Armez d'abord une piste avec le bouton Rec de son en-tête"
          }
        >
          <span>
            <Button
              variant={isCapturing ? "destructive" : "secondary"}
              onClick={onToggleRecord}
              disabled={!canRecord && !isCapturing}
              className={recordPhase === "recording" ? "animate-pulse" : ""}
            >
              {isCapturing ? (
                <>
                  <Square className="size-4 fill-current" />
                  Arrêter
                </>
              ) : (
                <>
                  <Mic className="size-4" />
                  Enregistrer
                </>
              )}
            </Button>
          </span>
        </Hint>
      </div>

      <div className="h-6 w-px bg-studio-border" />

      <div data-tour="export">
        <Hint label="Rend le projet en un fichier WAV, avec tous les traitements appliqués.">
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
        </Hint>
      </div>

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

        <div
          className="flex gap-1 rounded-md border border-studio-border bg-console-inset p-0.5"
          data-tour="zoom"
        >
          <Hint label="Éloigne la timeline pour voir l'ensemble du projet.">
            <Button size="icon" variant="ghost" onClick={onZoomOut}>
              <ZoomOut className="size-4" />
            </Button>
          </Hint>
          <Hint label="Rapproche la timeline pour travailler au détail.">
            <Button size="icon" variant="ghost" onClick={onZoomIn}>
              <ZoomIn className="size-4" />
            </Button>
          </Hint>
        </div>
      </div>
    </div>
  );
}
