import { randomUUID } from "../lib/uuid";
import { useProjectStore } from "../store/projectStore";
import { TrackHeader } from "./TrackHeader";
import { Button } from "./ui/button";

export function TrackList() {
  const tracks = useProjectStore((s) => s.tracks);
  const addTrack = useProjectStore((s) => s.addTrack);

  function handleAdd() {
    addTrack({
      id: randomUUID(),
      orderIndex: tracks.length,
      name: `Piste ${tracks.length + 1}`,
      color: "",
      volume: 1,
      pan: 0,
      muted: false,
      soloed: false,
    });
  }

  return (
    <div className="flex flex-col">
      {tracks.map((t, i) => (
        <TrackHeader key={t.id} track={t} index={i} />
      ))}
      <Button variant="secondary" className="m-2" onClick={handleAdd}>
        + Ajouter une piste
      </Button>
    </div>
  );
}
