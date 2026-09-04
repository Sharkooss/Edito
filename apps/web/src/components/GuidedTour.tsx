import { useLayoutEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "./ui/button";

interface TourStep {
  target: string;
  title: string;
  body: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    target: "import",
    title: "Importer un son",
    body: "Clique ici ou glisse-dépose un ou plusieurs fichiers. Chaque fichier arrive sur sa propre piste, à la tête de lecture — rien ne se superpose.",
  },
  {
    target: "tools",
    title: "Sélection et Lame",
    body: "En mode Sélection (V), tu déplaces les clips, y compris d'une piste à l'autre. En mode Lame (C), un trait suit ton curseur et le clic coupe le clip exactement là.",
  },
  {
    target: "transport",
    title: "Lecture",
    body: "Joue, mets en pause ou stoppe. La lecture s'arrête d'elle-même à la fin du projet. Barre d'espace pour jouer ou mettre en pause.",
  },
  {
    target: "timeline",
    title: "Montage",
    body: "Tire les bords d'un clip pour le rogner, les coins orange pour ses fondus. Clic droit ouvre le menu : couper, dupliquer, fondus, supprimer. Ctrl+Z annule.",
  },
  {
    target: "record",
    title: "Enregistrer",
    body: "Arme d'abord une piste avec son bouton Rec : son vumètre devient live, tu vérifies ton micro avant de lancer. Ensuite ce bouton déclenche un décompte 3-2-1 puis capture depuis la tête de lecture.",
  },
  {
    target: "zoom",
    title: "Zoom",
    body: "Rapproche ou éloigne la timeline. L'aimantation reste au même écart à l'écran quel que soit le zoom ; maintiens Alt pour la désactiver.",
  },
  {
    target: "export",
    title: "Exporter le mixdown",
    body: "Exporte le mixage final en WAV, avec les gains, les fondus, les volumes, panoramiques et le solo/muet appliqués.",
  },
];

type Rect = { top: number; left: number; width: number; height: number };

function useTargetRect(target: string, active: boolean): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!active) return;

    function measure() {
      const el = document.querySelector(`[data-tour="${target}"]`);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [target, active]);

  return rect;
}

export function GuidedTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = TOUR_STEPS[stepIndex];
  const rect = useTargetRect(step?.target ?? "", open);

  useLayoutEffect(() => {
    if (!open) setStepIndex(0);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !step) return null;

  const isLast = stepIndex >= TOUR_STEPS.length - 1;
  const cardWidth = 288;
  const spacing = 12;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  let cardTop: number;
  let cardLeft: number;
  if (rect) {
    const spaceBelow = viewportH - rect.top - rect.height;
    cardTop = spaceBelow > 180 ? rect.top + rect.height + spacing : Math.max(spacing, rect.top - 160 - spacing);
    cardLeft = Math.min(Math.max(rect.left, spacing), viewportW - cardWidth - spacing);
  } else {
    cardTop = viewportH / 2 - 80;
    cardLeft = viewportW / 2 - cardWidth / 2;
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Visite guidée">
      <div className="absolute inset-0 bg-studio-bg/0" onClick={onClose} />
      {rect && (
        <div
          className="pointer-events-none absolute rounded-md ring-2 ring-primary transition-all duration-200"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            boxShadow: "0 0 0 9999px rgba(8,9,11,0.75)",
          }}
        />
      )}
      <div
        className="absolute w-72 rounded-lg border border-studio-border bg-studio-panel p-4 shadow-xl transition-all duration-200"
        style={{ top: cardTop, left: cardLeft }}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold">{step.title}</h2>
          <Button size="icon" variant="ghost" className="-mr-1 -mt-1 size-6" onClick={onClose} title="Fermer la visite">
            <X className="size-3.5" />
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{step.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {stepIndex + 1} / {TOUR_STEPS.length}
          </span>
          <div className="flex gap-1.5">
            {stepIndex > 0 && (
              <Button size="sm" variant="outline" onClick={() => setStepIndex((i) => Math.max(0, i - 1))}>
                Précédent
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                if (stepIndex >= TOUR_STEPS.length - 1) onClose();
                else setStepIndex((i) => Math.min(i + 1, TOUR_STEPS.length - 1));
              }}
            >
              {isLast ? "Terminer" : "Suivant"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
