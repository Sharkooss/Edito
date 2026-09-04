import { Button } from "./ui/button";

/**
 * Full-screen count-in. Its real job is to make recording feel deliberate:
 * v1 started capturing on the click itself, with no chance to get ready and no
 * way back out.
 */
export function RecordCountdown({ remaining, onCancel }: { remaining: number; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-studio-bg/85 backdrop-blur-sm">
      <span className="font-mono text-[8rem] leading-none font-bold text-primary tabular-nums">
        {remaining > 0 ? remaining : "GO"}
      </span>
      <p className="text-sm text-muted-foreground">L'enregistrement démarre…</p>
      <Button variant="secondary" onClick={onCancel}>
        Annuler
      </Button>
    </div>
  );
}
