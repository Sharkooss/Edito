import { RotateCcw, Wand2 } from "lucide-react";
import { useProjectStore } from "../store/projectStore";
import type { Clip } from "../api/client";
import type { ProcessedAudio } from "../audio/processedAudio";
import type { MediaLibrary } from "../audio/mediaLibrary";
import {
  normalizeEffects,
  semitonesFromSpeed,
  sourceWindow,
  SPEED_RANGE,
  PITCH_RANGE,
  EQ_RANGE,
  REVERB_SIZE_RANGE,
  type ClipEffects,
} from "../audio/effects";
import { windowPeak, normalizeGain } from "../audio/normalize";
import {
  setClipEffects,
  setClipSpeed,
  setClipsGain,
  resetClipEffects,
  normalizeClips,
} from "../audio/clipEditing";
import { EffectSlider } from "./inspector/EffectSlider";
import { Button } from "./ui/button";
import { Hint } from "./Hint";
import { toast } from "../hooks/use-toast";

/** A value shared by every selected clip, or null when they disagree. */
function shared<T>(values: T[]): T | null {
  if (values.length === 0) return null;
  const [first] = values;
  return values.every((v) => v === first) ? first : null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-studio-border px-3 py-2.5 last:border-b-0">
      <h3 className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

export function ClipInspector({
  library,
  processed,
}: {
  library: MediaLibrary;
  processed: ProcessedAudio;
}) {
  const clips = useProjectStore((s) => s.clips);
  const selectedClipIds = useProjectStore((s) => s.selectedClipIds);
  const selected = clips.filter((c) => selectedClipIds.includes(c.id));

  if (selected.length === 0) {
    return (
      <aside className="flex w-72 shrink-0 items-center justify-center border-l border-studio-border bg-studio-panel px-6">
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          Sélectionnez un clip pour régler ses effets.
        </p>
      </aside>
    );
  }

  const ids = selected.map((c) => c.id);
  const fxs = selected.map((c) => normalizeEffects(c.effects));
  const patch = (p: Partial<ClipEffects>) => setClipEffects(ids, p);

  const gain = shared(selected.map((c) => c.gain));
  const speed = shared(fxs.map((f) => f.speed));
  const pitch = shared(fxs.map((f) => f.pitch));
  const preservePitch = shared(fxs.map((f) => f.preservePitch)) ?? true;
  const eqLow = shared(fxs.map((f) => f.eq.low));
  const eqMid = shared(fxs.map((f) => f.eq.mid));
  const eqHigh = shared(fxs.map((f) => f.eq.high));
  const reverbMix = shared(fxs.map((f) => f.reverb.mix));
  const reverbSize = shared(fxs.map((f) => f.reverb.size));

  // Non-zero on at least one clip: the size control stays usable while a mixed
  // selection is being dialled in.
  const anyReverb = fxs.some((f) => f.reverb.mix > 0);

  /** Peak of the clip's own window, measured on the source it actually plays. */
  function peakOf(clip: Clip): number | null {
    const buffer = library.get(clip.mediaId);
    if (!buffer) return null;
    const fx = normalizeEffects(clip.effects);
    return windowPeak(buffer, clip.sourceOffset, clip.sourceOffset + sourceWindow(clip.duration, fx));
  }

  function handleNormalize() {
    const measurable = selected.filter((c) => {
      const peak = peakOf(c);
      return peak !== null && normalizeGain(peak) !== null;
    });
    if (measurable.length === 0) {
      toast({
        title: "Rien à normaliser",
        description:
          selected.length === 1
            ? "Ce clip est silencieux."
            : "Les clips sélectionnés sont silencieux.",
      });
      return;
    }
    normalizeClips(ids, peakOf);
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-studio-border bg-studio-panel">
      <header className="border-b border-studio-border px-3 py-2">
        <h2 className="truncate text-sm font-medium">
          {selected.length === 1 ? selected[0].name : `${selected.length} clips sélectionnés`}
        </h2>
      </header>

      <Section title="Niveau">
        <EffectSlider
          label="Gain"
          hint="Volume du clip. 100 % laisse le son tel quel."
          value={gain}
          min={0}
          max={4}
          step={0.01}
          unit="%"
          neutral={1}
          format={(v) => String(Math.round(v * 100))}
          onChange={(v) => setClipsGain(ids, v)}
        />
        <Hint label="Règle le gain pour que le passage le plus fort atteigne le maximum sans saturer.">
          <Button variant="secondary" size="sm" className="mt-1 w-full" onClick={handleNormalize}>
            <Wand2 className="size-3.5" />
            Normaliser
          </Button>
        </Hint>
      </Section>

      <Section title="Vitesse et hauteur">
        <label className="mb-1.5 flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={preservePitch}
            onChange={(e) => patch({ preservePitch: e.target.checked })}
            className="size-3.5 accent-[var(--primary)]"
          />
          Préserver la hauteur
        </label>

        <EffectSlider
          label="Vitesse"
          hint="Ralentit ou accélère le clip. Sa longueur sur la timeline change en conséquence."
          value={speed}
          min={SPEED_RANGE.min}
          max={SPEED_RANGE.max}
          step={0.01}
          unit="×"
          neutral={1}
          format={(v) => v.toFixed(2)}
          onChange={(v) => setClipSpeed(ids, v)}
        />

        <EffectSlider
          label="Hauteur"
          hint={
            preservePitch
              ? "Transpose le clip sans changer sa durée."
              : "Désactivé en mode bande : la vitesse transpose déjà le son."
          }
          value={preservePitch ? pitch : (speed === null ? null : semitonesFromSpeed(speed))}
          min={PITCH_RANGE.min}
          max={PITCH_RANGE.max}
          step={1}
          unit="dt"
          neutral={0}
          disabled={!preservePitch}
          format={(v) => (preservePitch ? String(Math.round(v)) : v.toFixed(1))}
          onChange={(v) => patch({ pitch: v })}
        />

        {!preservePitch && (
          <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
            Mode bande : la vitesse transpose aussi le son, comme un magnétophone.
          </p>
        )}
      </Section>

      <Section title="Égaliseur">
        <EffectSlider
          label="Grave"
          hint="Renforce ou atténue les basses fréquences, sous 250 Hz."
          value={eqLow}
          min={EQ_RANGE.min}
          max={EQ_RANGE.max}
          step={0.5}
          unit="dB"
          neutral={0}
          format={(v) => v.toFixed(1)}
          onChange={(v) => patch({ eq: { low: v, mid: eqMid ?? 0, high: eqHigh ?? 0 } })}
        />
        <EffectSlider
          label="Médium"
          hint="Agit autour de 1 kHz, là où se situe la présence de la voix."
          value={eqMid}
          min={EQ_RANGE.min}
          max={EQ_RANGE.max}
          step={0.5}
          unit="dB"
          neutral={0}
          format={(v) => v.toFixed(1)}
          onChange={(v) => patch({ eq: { low: eqLow ?? 0, mid: v, high: eqHigh ?? 0 } })}
        />
        <EffectSlider
          label="Aigu"
          hint="Renforce ou atténue les hautes fréquences, au-dessus de 4 kHz."
          value={eqHigh}
          min={EQ_RANGE.min}
          max={EQ_RANGE.max}
          step={0.5}
          unit="dB"
          neutral={0}
          format={(v) => v.toFixed(1)}
          onChange={(v) => patch({ eq: { low: eqLow ?? 0, mid: eqMid ?? 0, high: v } })}
        />
      </Section>

      <Section title="Réverbération">
        <EffectSlider
          label="Quantité"
          hint="Dose de réverbération mélangée au son d'origine. À 0 %, aucun traitement."
          value={reverbMix}
          min={0}
          max={1}
          step={0.01}
          unit="%"
          neutral={0}
          format={(v) => String(Math.round(v * 100))}
          onChange={(v) => patch({ reverb: { mix: v, size: reverbSize ?? 1.5 } })}
        />
        <EffectSlider
          label="Pièce"
          hint="Taille de la pièce simulée : plus elle est grande, plus la traîne est longue."
          value={reverbSize}
          min={REVERB_SIZE_RANGE.min}
          max={REVERB_SIZE_RANGE.max}
          step={0.1}
          unit="s"
          neutral={1.5}
          disabled={!anyReverb}
          format={(v) => v.toFixed(1)}
          onChange={(v) => patch({ reverb: { mix: reverbMix ?? 0, size: v } })}
        />
      </Section>

      <div className="p-3">
        <Hint label="Remet vitesse, hauteur, égaliseur et réverbération à zéro. Le clip retrouve sa longueur d'origine.">
          <Button variant="outline" size="sm" className="w-full" onClick={() => resetClipEffects(ids)}>
            <RotateCcw className="size-3.5" />
            Réinitialiser les effets
          </Button>
        </Hint>
      </div>

      {selected.some((c) => processed.isRendering(c)) && (
        <p className="px-3 pb-3 text-[10px] text-muted-foreground">Traitement du son en cours…</p>
      )}
    </aside>
  );
}
