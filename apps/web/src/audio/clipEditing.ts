import type { Clip } from "../store/projectStore";
import { useProjectStore } from "../store/projectStore";
import { useHistoryStore } from "../store/historyStore";
import { randomUUID } from "../lib/uuid";

export function splitClip(clip: Clip, atTime: number): [Clip, Clip] {
  const leftDuration = atTime - clip.startTime;
  const left: Clip = { ...clip, duration: leftDuration };
  const right: Clip = {
    ...clip,
    id: randomUUID(),
    startTime: atTime,
    sourceOffset: clip.sourceOffset + leftDuration,
    duration: clip.duration - leftDuration,
  };
  return [left, right];
}

export function splitClipWithHistory(clip: Clip, atTime: number): void {
  if (atTime <= clip.startTime || atTime >= clip.startTime + clip.duration) return;
  const [left, right] = splitClip(clip, atTime);
  const store = useProjectStore.getState();
  useHistoryStore.getState().push({
    do: () => {
      store.updateClip(clip.id, { duration: left.duration });
      store.addClip(right);
    },
    undo: () => {
      store.updateClip(clip.id, { duration: clip.duration });
      store.removeClip(right.id);
    },
  });
}

export function deleteClipWithHistory(clip: Clip): void {
  const store = useProjectStore.getState();
  useHistoryStore.getState().push({
    do: () => store.removeClip(clip.id),
    undo: () => store.addClip(clip),
  });
}

// Comparaison finale-vs-originale utilisée par les drags de déplacement/trim de
// ClipWaveform : on ne pousse une commande d'historique que si la position/forme
// du clip a réellement changé entre le mousedown et le mouseup. Un aller-retour
// (valeur modifiée puis ramenée à l'identique avant le relâchement) ne compare que
// l'état final à l'état initial, donc il est traité comme "pas de changement" —
// c'est le comportement voulu, pas une lacune du garde-fou.
export function hasClipChanged(
  original: { startTime: number; sourceOffset: number; duration: number },
  current: { startTime: number; sourceOffset: number; duration: number }
): boolean {
  return (
    current.startTime !== original.startTime ||
    current.sourceOffset !== original.sourceOffset ||
    current.duration !== original.duration
  );
}
