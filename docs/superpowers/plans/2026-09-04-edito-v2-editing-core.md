# Edito v2 Editing Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Edito from a demo skeleton into a usable multi-track audio montage editor: audible playback on first click, non-overlapping clips, visible blade cuts with correctly windowed waveforms, cross-track drag, armed recording with live metering, and a faithful WAV mixdown.

**Architecture:** A single `MediaLibrary` owns every decoded `AudioBuffer` and its precomputed peak pyramid, keyed by `mediaId`; playback, waveform drawing and export all read from it. Pure modules (`peaks`, `scheduling`, `overlap`, `snapping`) hold the logic worth testing, so the React layer stays thin. Clip waveforms render to `<canvas>` from the peak cache over the window `[sourceOffset, sourceOffset + duration]`, which is what makes a cut visually correct.

**Tech Stack:** React 19, Zustand 5, Vite 8, Vitest 3, Tailwind 3, Web Audio API, Fastify 4 + better-sqlite3 (server). `wavesurfer.js` is removed.

**Spec:** `docs/superpowers/specs/2026-09-04-edito-v2-editing-core-design.md`

## Global Constraints

- UI copy is French. Existing tone: `Importer un son`, `Ajouter une piste`, `Piste 1`.
- Clip invariant, enforced at every write point: **clips on the same track never overlap.**
- No new runtime dependencies. `wavesurfer.js` is removed from `apps/web/package.json`.
- Times are seconds (float). Gains are linear (1 = unity). Pan is −1..1.
- Dynamic Tailwind class names must stay in the `safelist` in `apps/web/tailwind.config.ts`.
- Tests: `npm test -w apps/web` and `npm test -w apps/server` from the repo root.
- Never mark a task done with a failing or skipped test.

## File Structure

**New — pure logic (`apps/web/src/audio/`)**
| File | Responsibility |
|---|---|
| `peaks.ts` | Min/max peak extraction over a sample window. Pure. |
| `mediaLibrary.ts` | Shared decoded-buffer + peak cache keyed by `mediaId`. |
| `scheduling.ts` | Playhead + clips → `(when, offset, duration)` schedule entries; project duration. Pure. |
| `overlap.ts` | Non-overlap invariant: resolve a requested placement to a legal one. Pure. |
| `snapping.ts` | Snap candidates and pixel-threshold snapping. Pure. |
| `recordingMachine.ts` | `idle → armed → counting → recording → idle` transitions. Pure. |

**Rewritten**
| File | Change |
|---|---|
| `audio/engine.ts` | Track chain `gain → panner → analyser → master`; `unlock()`; master analyser. |
| `audio/transport.ts` | Schedules from `scheduling.ts` + preloaded buffers; auto-stop at end; race-free seek. |
| `audio/record.ts` | Mic stream + level metering + live capture buffer. |
| `components/TimelineCanvas.tsx` → `components/Timeline.tsx` | Shared vertical scroll, sticky headers, ruler, lanes, playhead, rubber band. |
| `components/ClipWaveform.tsx` → `components/ClipView.tsx` | Canvas waveform windowed to the clip; fades; selection. |

**New — components**
`TimeRuler.tsx`, `LevelMeter.tsx`, `ClipContextMenu.tsx`, `RecordCountdown.tsx`.

**Modified**
`audio/clipEditing.ts`, `audio/export.ts`, `store/projectStore.ts`, `components/TrackHeader.tsx`, `components/Toolbar.tsx`, `components/TransportBar.tsx`, `lib/keyboard.ts`, `App.tsx`, `api/client.ts`, and server-side `db/schema.sql`, `db.ts`, `routes/project.ts`, `types.ts`.

---

## Task 1: Persist clip gain and fades

Adds `gain`, `fade_in`, `fade_out` to the `clip` table and threads them through the server DTO. Everything downstream assumes these fields exist.

**Files:**
- Modify: `apps/server/src/db/schema.sql`
- Modify: `apps/server/src/db.ts`
- Modify: `apps/server/src/types.ts`
- Modify: `apps/server/src/routes/project.ts`
- Modify: `apps/web/src/api/client.ts`
- Test: `apps/server/test/project.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Clip` DTO gains `gain: number` (default 1), `fadeIn: number` (default 0), `fadeOut: number` (default 0). Every later task uses these names.

- [ ] **Step 1: Write the failing test**

Add to `apps/server/test/project.test.ts`, following the existing test's setup style:

```ts
it("round-trips clip gain and fades", async () => {
  const app = await buildApp();
  await app.inject({
    method: "PUT",
    url: "/api/project",
    payload: {
      tracks: [{ id: "t1", name: "Piste 1", orderIndex: 0, color: "", volume: 1, pan: 0, muted: false, soloed: false }],
      clips: [{ id: "c1", trackId: "t1", mediaId: "m1", startTime: 0, sourceOffset: 0, duration: 2, name: "a", gain: 0.5, fadeIn: 0.25, fadeOut: 0.75 }],
    },
  });
  const res = await app.inject({ method: "GET", url: "/api/project" });
  const clip = res.json().clips[0];
  expect(clip.gain).toBe(0.5);
  expect(clip.fadeIn).toBe(0.25);
  expect(clip.fadeOut).toBe(0.75);
});

it("defaults gain to 1 and fades to 0 when omitted", async () => {
  const app = await buildApp();
  await app.inject({
    method: "PUT",
    url: "/api/project",
    payload: {
      tracks: [{ id: "t1", name: "Piste 1", orderIndex: 0, color: "", volume: 1, pan: 0, muted: false, soloed: false }],
      clips: [{ id: "c1", trackId: "t1", mediaId: "m1", startTime: 0, sourceOffset: 0, duration: 2, name: "a" }],
    },
  });
  const clip = (await app.inject({ method: "GET", url: "/api/project" })).json().clips[0];
  expect(clip.gain).toBe(1);
  expect(clip.fadeIn).toBe(0);
  expect(clip.fadeOut).toBe(0);
});
```

The existing test file inserts a media row before referencing `mediaId` (foreign keys are enforced). Reuse that same helper/pattern — read the top of the file first and mirror it.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w apps/server`
Expected: FAIL — `clip.gain` is `undefined`.

- [ ] **Step 3: Implement**

In `schema.sql`, add to the `CREATE TABLE clip` body:

```sql
  gain REAL NOT NULL DEFAULT 1,
  fade_in REAL NOT NULL DEFAULT 0,
  fade_out REAL NOT NULL DEFAULT 0,
```

Existing deployed databases already have a `clip` table, so `CREATE TABLE IF NOT EXISTS` will not add the columns. In `db.ts`, after the schema is executed, run an idempotent migration:

```ts
const clipColumns = new Set(
  db.prepare("PRAGMA table_info(clip)").all().map((c: { name: string }) => c.name)
);
for (const [column, def] of [
  ["gain", "REAL NOT NULL DEFAULT 1"],
  ["fade_in", "REAL NOT NULL DEFAULT 0"],
  ["fade_out", "REAL NOT NULL DEFAULT 0"],
] as const) {
  if (!clipColumns.has(column)) db.exec(`ALTER TABLE clip ADD COLUMN ${column} ${def}`);
}
```

Add `gain`, `fadeIn`, `fadeOut` to the `Clip` type in `apps/server/src/types.ts` and in `apps/web/src/api/client.ts`. In `routes/project.ts`, include the three columns in the INSERT and in the row→DTO mapping, coercing missing input with `?? 1` / `?? 0` so older clients keep working.

- [ ] **Step 4: Run tests**

Run: `npm test -w apps/server`
Expected: PASS, including the pre-existing tests.

- [ ] **Step 5: Commit**

```bash
git add apps/server apps/web/src/api/client.ts
git commit -m "feat(server): persist clip gain and fade envelopes"
```

---

## Task 2: Peak extraction

The pure function behind every waveform drawn in the app. Windowed, so a split clip shows only its own audio.

**Files:**
- Create: `apps/web/src/audio/peaks.ts`
- Test: `apps/web/src/audio/peaks.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface PeakData { min: Float32Array; max: Float32Array; }
  export function computePeaks(
    channel: Float32Array, sampleRate: number,
    startSec: number, endSec: number, bins: number,
  ): PeakData;
  ```
  `min`/`max` both have length `bins`. The window is clamped to `[0, channel.length / sampleRate]`. If the clamped window is empty or `bins < 1`, both arrays are all zeros.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { computePeaks } from "./peaks";

describe("computePeaks", () => {
  it("returns one min/max pair per bin", () => {
    const ch = new Float32Array(1000);
    const p = computePeaks(ch, 1000, 0, 1, 10);
    expect(p.min.length).toBe(10);
    expect(p.max.length).toBe(10);
  });

  it("reports the extremes inside each bin", () => {
    // 100 samples at 100 Hz = 1 s. Bin 0 = samples 0-49, bin 1 = samples 50-99.
    const ch = new Float32Array(100);
    ch[10] = 0.8;   // bin 0 max
    ch[20] = -0.4;  // bin 0 min
    ch[60] = 0.2;   // bin 1 max
    ch[70] = -0.9;  // bin 1 min
    const p = computePeaks(ch, 100, 0, 1, 2);
    expect(p.max[0]).toBeCloseTo(0.8);
    expect(p.min[0]).toBeCloseTo(-0.4);
    expect(p.max[1]).toBeCloseTo(0.2);
    expect(p.min[1]).toBeCloseTo(-0.9);
  });

  it("reads only the requested window", () => {
    // The whole point: a clip trimmed to the second half must not show the first.
    const ch = new Float32Array(100);
    ch[10] = 1.0;  // first half only
    const p = computePeaks(ch, 100, 0.5, 1, 1);
    expect(p.max[0]).toBe(0);
    expect(p.min[0]).toBe(0);
  });

  it("clamps a window that runs past the end of the buffer", () => {
    const ch = new Float32Array(100);
    ch[99] = 0.5;
    const p = computePeaks(ch, 100, 0.5, 99, 1);
    expect(p.max[0]).toBeCloseTo(0.5);
  });

  it("returns zeros for an empty window", () => {
    const p = computePeaks(new Float32Array(100), 100, 0.5, 0.5, 4);
    expect(Array.from(p.max)).toEqual([0, 0, 0, 0]);
    expect(Array.from(p.min)).toEqual([0, 0, 0, 0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w apps/web -- peaks`
Expected: FAIL — cannot resolve `./peaks`.

- [ ] **Step 3: Implement**

```ts
export interface PeakData {
  min: Float32Array;
  max: Float32Array;
}

/**
 * Min/max envelope of `channel` over [startSec, endSec], bucketed into `bins`.
 * The window is clamped to the buffer, so callers may pass a clip window that
 * runs past the end of its source without special-casing it.
 */
export function computePeaks(
  channel: Float32Array,
  sampleRate: number,
  startSec: number,
  endSec: number,
  bins: number,
): PeakData {
  const safeBins = Math.max(0, Math.floor(bins));
  const min = new Float32Array(safeBins);
  const max = new Float32Array(safeBins);
  if (safeBins === 0) return { min, max };

  const first = Math.max(0, Math.floor(startSec * sampleRate));
  const last = Math.min(channel.length, Math.ceil(endSec * sampleRate));
  const span = last - first;
  if (span <= 0) return { min, max };

  for (let bin = 0; bin < safeBins; bin++) {
    const from = first + Math.floor((bin * span) / safeBins);
    const to = Math.min(last, first + Math.ceil(((bin + 1) * span) / safeBins));
    let lo = 0;
    let hi = 0;
    for (let i = from; i < to; i++) {
      const v = channel[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min[bin] = lo;
    max[bin] = hi;
  }
  return { min, max };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -w apps/web -- peaks`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/audio/peaks.ts apps/web/src/audio/peaks.test.ts
git commit -m "feat(web): add windowed peak extraction"
```

---

## Task 3: Shared media library

One fetch and one decode per media, shared by playback, drawing and export. Replaces both the engine's private cache and WaveSurfer's per-clip loading.

**Files:**
- Create: `apps/web/src/audio/mediaLibrary.ts`
- Test: `apps/web/src/audio/mediaLibrary.test.ts`

**Interfaces:**
- Consumes: `computePeaks`, `PeakData` from Task 2.
- Produces:
  ```ts
  export class MediaLibrary {
    constructor(ctx: BaseAudioContext, getUrl: (mediaId: string) => string);
    load(mediaId: string): Promise<AudioBuffer>;     // deduplicated
    get(mediaId: string): AudioBuffer | null;        // sync, null if not loaded
    has(mediaId: string): boolean;
    failed(mediaId: string): boolean;                // load rejected
    preload(mediaIds: string[]): Promise<void>;      // never rejects
    getPeaks(mediaId: string, startSec: number, endSec: number, bins: number): PeakData | null;
    onChange(cb: () => void): () => void;            // fires when a load settles
  }
  ```
  `getPeaks` returns `null` when the media is not yet loaded, and memoises per `(mediaId, startSec, endSec, bins)`.

- [ ] **Step 1: Write the failing test**

`decodeAudioData` does not exist in jsdom, so the test drives a fake context.

```ts
import { describe, it, expect, vi } from "vitest";
import { MediaLibrary } from "./mediaLibrary";

function fakeBuffer(samples: Float32Array, sampleRate = 100): AudioBuffer {
  return {
    duration: samples.length / sampleRate,
    sampleRate,
    length: samples.length,
    numberOfChannels: 1,
    getChannelData: () => samples,
  } as unknown as AudioBuffer;
}

function harness(samples = new Float32Array(100)) {
  const buffer = fakeBuffer(samples);
  const decode = vi.fn().mockResolvedValue(buffer);
  const ctx = { decodeAudioData: decode } as unknown as BaseAudioContext;
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
  vi.stubGlobal("fetch", fetchMock);
  return { lib: new MediaLibrary(ctx, (id) => `/api/media/${id}`), decode, fetchMock, buffer };
}

describe("MediaLibrary", () => {
  it("fetches and decodes a media once even for concurrent callers", async () => {
    const { lib, decode, fetchMock } = harness();
    await Promise.all([lib.load("m1"), lib.load("m1"), lib.load("m1")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it("exposes the buffer synchronously once loaded", async () => {
    const { lib, buffer } = harness();
    expect(lib.get("m1")).toBeNull();
    await lib.load("m1");
    expect(lib.get("m1")).toBe(buffer);
    expect(lib.has("m1")).toBe(true);
  });

  it("marks a media as failed instead of throwing from preload", async () => {
    const { lib } = harness();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(lib.preload(["missing"])).resolves.toBeUndefined();
    expect(lib.failed("missing")).toBe(true);
    expect(lib.get("missing")).toBeNull();
  });

  it("returns null peaks before load and windowed peaks after", async () => {
    const samples = new Float32Array(100);
    samples[75] = 0.6;
    const { lib } = harness(samples);
    expect(lib.getPeaks("m1", 0, 1, 4)).toBeNull();
    await lib.load("m1");
    const peaks = lib.getPeaks("m1", 0.5, 1, 1)!;
    expect(peaks.max[0]).toBeCloseTo(0.6);
    // Same window again must hit the memo, not recompute.
    expect(lib.getPeaks("m1", 0.5, 1, 1)).toBe(peaks);
  });

  it("notifies subscribers when a load settles", async () => {
    const { lib } = harness();
    const cb = vi.fn();
    lib.onChange(cb);
    await lib.load("m1");
    expect(cb).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w apps/web -- mediaLibrary`
Expected: FAIL — cannot resolve `./mediaLibrary`.

- [ ] **Step 3: Implement**

```ts
import { computePeaks, type PeakData } from "./peaks";

export class MediaLibrary {
  private ctx: BaseAudioContext;
  private getUrl: (mediaId: string) => string;
  private buffers = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<AudioBuffer>>();
  private failures = new Set<string>();
  private peakCache = new Map<string, PeakData>();
  private listeners = new Set<() => void>();

  constructor(ctx: BaseAudioContext, getUrl: (mediaId: string) => string) {
    this.ctx = ctx;
    this.getUrl = getUrl;
  }

  load(mediaId: string): Promise<AudioBuffer> {
    const ready = this.buffers.get(mediaId);
    if (ready) return Promise.resolve(ready);
    let inFlight = this.pending.get(mediaId);
    if (!inFlight) {
      inFlight = (async () => {
        const res = await fetch(this.getUrl(mediaId));
        if (!res.ok) throw new Error(`Média ${mediaId} introuvable (${res.status})`);
        const buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(mediaId, buffer);
        this.failures.delete(mediaId);
        return buffer;
      })();
      inFlight
        .catch(() => this.failures.add(mediaId))
        .finally(() => {
          this.pending.delete(mediaId);
          this.emit();
        });
      this.pending.set(mediaId, inFlight);
    }
    return inFlight;
  }

  get(mediaId: string): AudioBuffer | null {
    return this.buffers.get(mediaId) ?? null;
  }

  has(mediaId: string): boolean {
    return this.buffers.has(mediaId);
  }

  failed(mediaId: string): boolean {
    return this.failures.has(mediaId);
  }

  async preload(mediaIds: string[]): Promise<void> {
    await Promise.all([...new Set(mediaIds)].map((id) => this.load(id).catch(() => undefined)));
  }

  getPeaks(mediaId: string, startSec: number, endSec: number, bins: number): PeakData | null {
    const buffer = this.buffers.get(mediaId);
    if (!buffer) return null;
    const key = `${mediaId}|${startSec.toFixed(4)}|${endSec.toFixed(4)}|${bins}`;
    let peaks = this.peakCache.get(key);
    if (!peaks) {
      peaks = computePeaks(buffer.getChannelData(0), buffer.sampleRate, startSec, endSec, bins);
      if (this.peakCache.size > 800) this.peakCache.clear(); // bounded; zoom churn is cheap to redo
      this.peakCache.set(key, peaks);
    }
    return peaks;
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -w apps/web -- mediaLibrary`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/audio/mediaLibrary.ts apps/web/src/audio/mediaLibrary.test.ts
git commit -m "feat(web): add shared media buffer and peak library"
```

---

## Task 4: Playback scheduling maths

Pure. Turns a playhead position into the exact `(when, offset, duration)` triples the transport hands to `AudioBufferSourceNode.start`. Isolating this is what makes the transport testable without Web Audio.

**Files:**
- Create: `apps/web/src/audio/scheduling.ts`
- Test: `apps/web/src/audio/scheduling.test.ts`

**Interfaces:**
- Consumes: `Clip`, `Track` from `../api/client`.
- Produces:
  ```ts
  export interface ScheduleEntry {
    clipId: string; trackId: string; mediaId: string;
    when: number;      // seconds from now
    offset: number;    // seconds into the source buffer
    duration: number;  // seconds to play
    gain: number; fadeIn: number; fadeOut: number;
  }
  export function computeSchedule(
    clips: Clip[], playhead: number, sourceDurations: Map<string, number>,
  ): ScheduleEntry[];
  export function projectDuration(clips: Clip[]): number;
  export function audibleTracks(tracks: Track[]): Set<string>;
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { computeSchedule, projectDuration, audibleTracks } from "./scheduling";
import type { Clip, Track } from "../api/client";

const clip = (over: Partial<Clip>): Clip => ({
  id: "c", trackId: "t", mediaId: "m", startTime: 0, sourceOffset: 0,
  duration: 4, name: "clip", gain: 1, fadeIn: 0, fadeOut: 0, ...over,
});
const track = (over: Partial<Track>): Track => ({
  id: "t", name: "T", orderIndex: 0, color: "", volume: 1, pan: 0,
  muted: false, soloed: false, ...over,
});
const durations = new Map([["m", 10]]);

describe("computeSchedule", () => {
  it("delays a clip that starts after the playhead", () => {
    const [e] = computeSchedule([clip({ startTime: 3 })], 1, durations);
    expect(e.when).toBeCloseTo(2);
    expect(e.offset).toBeCloseTo(0);
    expect(e.duration).toBeCloseTo(4);
  });

  it("starts a clip already under the playhead immediately, mid-source", () => {
    const [e] = computeSchedule([clip({ startTime: 2, sourceOffset: 1, duration: 6 })], 5, durations);
    expect(e.when).toBeCloseTo(0);
    expect(e.offset).toBeCloseTo(4); // sourceOffset 1 + 3 s already elapsed
    expect(e.duration).toBeCloseTo(3);
  });

  it("skips clips that finished before the playhead", () => {
    expect(computeSchedule([clip({ startTime: 0, duration: 2 })], 5, durations)).toEqual([]);
  });

  it("clamps a clip window that runs past the end of its source", () => {
    // Source is 10 s; asking for 8 s from offset 6 must yield 4 s, not 8.
    const [e] = computeSchedule([clip({ sourceOffset: 6, duration: 8 })], 0, durations);
    expect(e.duration).toBeCloseTo(4);
  });

  it("skips clips whose media length is unknown", () => {
    expect(computeSchedule([clip({ mediaId: "ghost" })], 0, durations)).toEqual([]);
  });

  it("carries gain and fades through", () => {
    const [e] = computeSchedule([clip({ gain: 0.4, fadeIn: 0.5, fadeOut: 1 })], 0, durations);
    expect(e.gain).toBe(0.4);
    expect(e.fadeIn).toBe(0.5);
    expect(e.fadeOut).toBe(1);
  });
});

describe("projectDuration", () => {
  it("is the end of the last clip", () => {
    expect(projectDuration([clip({ startTime: 0, duration: 3 }), clip({ startTime: 10, duration: 2 })])).toBeCloseTo(12);
  });
  it("is zero with no clips", () => {
    expect(projectDuration([])).toBe(0);
  });
});

describe("audibleTracks", () => {
  it("returns unmuted tracks when nothing is soloed", () => {
    const s = audibleTracks([track({ id: "a" }), track({ id: "b", muted: true })]);
    expect(s.has("a")).toBe(true);
    expect(s.has("b")).toBe(false);
  });
  it("returns only soloed tracks when any is soloed", () => {
    const s = audibleTracks([track({ id: "a" }), track({ id: "b", soloed: true }), track({ id: "c", soloed: true, muted: true })]);
    expect(s.has("a")).toBe(false);
    expect(s.has("b")).toBe(true);
    // Solo wins over mute — matches the v1 engine sync behaviour.
    expect(s.has("c")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w apps/web -- scheduling`
Expected: FAIL — cannot resolve `./scheduling`.

- [ ] **Step 3: Implement**

```ts
import type { Clip, Track } from "../api/client";

export interface ScheduleEntry {
  clipId: string;
  trackId: string;
  mediaId: string;
  when: number;
  offset: number;
  duration: number;
  gain: number;
  fadeIn: number;
  fadeOut: number;
}

/**
 * Schedule entries for every clip still audible at or after `playhead`.
 * `when` is relative to "now"; the caller adds ctx.currentTime.
 * Windows are clamped to the real source length, which prevents the silent
 * out-of-range start() calls that plagued v1.
 */
export function computeSchedule(
  clips: Clip[],
  playhead: number,
  sourceDurations: Map<string, number>,
): ScheduleEntry[] {
  const entries: ScheduleEntry[] = [];
  for (const clip of clips) {
    const sourceDuration = sourceDurations.get(clip.mediaId);
    if (sourceDuration === undefined) continue;

    const elapsed = Math.max(0, playhead - clip.startTime);
    const remaining = clip.duration - elapsed;
    if (remaining <= 0) continue;

    const offset = clip.sourceOffset + elapsed;
    const playable = Math.min(remaining, sourceDuration - offset);
    if (playable <= 0) continue;

    entries.push({
      clipId: clip.id,
      trackId: clip.trackId,
      mediaId: clip.mediaId,
      when: Math.max(0, clip.startTime - playhead),
      offset,
      duration: playable,
      gain: clip.gain,
      fadeIn: clip.fadeIn,
      fadeOut: clip.fadeOut,
    });
  }
  return entries;
}

export function projectDuration(clips: Clip[]): number {
  return clips.reduce((end, c) => Math.max(end, c.startTime + c.duration), 0);
}

export function audibleTracks(tracks: Track[]): Set<string> {
  const anySoloed = tracks.some((t) => t.soloed);
  return new Set(tracks.filter((t) => (anySoloed ? t.soloed : !t.muted)).map((t) => t.id));
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -w apps/web -- scheduling`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/audio/scheduling.ts apps/web/src/audio/scheduling.test.ts
git commit -m "feat(web): add pure playback scheduling maths"
```

---

## Task 5: Non-overlap invariant

Pure. Every write path (import, drag drop, recording, paste, duplicate) routes a requested placement through this before committing it.

**Files:**
- Create: `apps/web/src/audio/overlap.ts`
- Test: `apps/web/src/audio/overlap.test.ts`

**Interfaces:**
- Consumes: `Clip` from `../api/client`.
- Produces:
  ```ts
  export function overlaps(aStart: number, aDur: number, bStart: number, bDur: number): boolean;
  export function resolvePlacement(
    clips: Clip[], trackId: string, requestedStart: number,
    duration: number, excludeIds?: Set<string>,
  ): number;
  export function firstFreeSlot(clips: Clip[], trackId: string, duration: number): number;
  ```
  `resolvePlacement` returns a start time `>= 0` at which `duration` fits on `trackId` without touching any clip except those in `excludeIds`. It prefers the requested position, then the closest legal position on either side.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { overlaps, resolvePlacement, firstFreeSlot } from "./overlap";
import type { Clip } from "../api/client";

const clip = (id: string, startTime: number, duration: number, trackId = "t"): Clip => ({
  id, trackId, mediaId: "m", startTime, sourceOffset: 0, duration,
  name: id, gain: 1, fadeIn: 0, fadeOut: 0,
});

describe("overlaps", () => {
  it("is false for clips that merely touch", () => {
    expect(overlaps(0, 2, 2, 2)).toBe(false);
  });
  it("is true for a genuine intersection", () => {
    expect(overlaps(0, 2, 1, 2)).toBe(true);
  });
  it("is true when one contains the other", () => {
    expect(overlaps(0, 10, 2, 1)).toBe(true);
  });
});

describe("resolvePlacement", () => {
  const existing = [clip("a", 0, 4), clip("b", 10, 4)];

  it("keeps a requested position that is already free", () => {
    expect(resolvePlacement(existing, "t", 5, 2)).toBeCloseTo(5);
  });

  it("pushes a colliding placement to the nearest free edge", () => {
    // Requested 3..5 collides with a (0..4). Nearest legal edge is 4.
    expect(resolvePlacement(existing, "t", 3, 2)).toBeCloseTo(4);
  });

  it("prefers the left edge when it is closer", () => {
    // Requested 9.5..13.5 collides with b (10..14). Left edge puts it at 6.
    expect(resolvePlacement(existing, "t", 9.5, 4)).toBeCloseTo(6);
  });

  it("ignores clips being moved", () => {
    expect(resolvePlacement(existing, "t", 0, 4, new Set(["a"]))).toBeCloseTo(0);
  });

  it("never returns a negative start", () => {
    expect(resolvePlacement([clip("a", 0, 4)], "t", 0.5, 2)).toBeGreaterThanOrEqual(0);
  });

  it("only considers clips on the target track", () => {
    expect(resolvePlacement([clip("x", 0, 100, "other")], "t", 5, 2)).toBeCloseTo(5);
  });

  it("produces a placement that is genuinely free", () => {
    const dense = [clip("a", 0, 3), clip("b", 3, 3), clip("c", 6, 3)];
    const at = resolvePlacement(dense, "t", 4, 2);
    expect(dense.some((c) => overlaps(at, 2, c.startTime, c.duration))).toBe(false);
  });
});

describe("firstFreeSlot", () => {
  it("is 0 on an empty track", () => {
    expect(firstFreeSlot([], "t", 5)).toBe(0);
  });
  it("is the end of the last clip when the track is packed", () => {
    expect(firstFreeSlot([clip("a", 0, 4)], "t", 5)).toBeCloseTo(4);
  });
  it("uses an interior gap that is big enough", () => {
    expect(firstFreeSlot([clip("a", 0, 2), clip("b", 8, 2)], "t", 3)).toBeCloseTo(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w apps/web -- overlap`
Expected: FAIL — cannot resolve `./overlap`.

- [ ] **Step 3: Implement**

```ts
import type { Clip } from "../api/client";

const EPSILON = 1e-6;

export function overlaps(aStart: number, aDur: number, bStart: number, bDur: number): boolean {
  return aStart < bStart + bDur - EPSILON && bStart < aStart + aDur - EPSILON;
}

function occupied(clips: Clip[], trackId: string, excludeIds: Set<string>): Clip[] {
  return clips
    .filter((c) => c.trackId === trackId && !excludeIds.has(c.id))
    .sort((a, b) => a.startTime - b.startTime);
}

/**
 * The closest start time to `requestedStart` at which `duration` fits on
 * `trackId` without overlapping anything. Candidate positions are the request
 * itself plus every clip edge, which is enough: any legal placement can be slid
 * toward the request until it butts against an edge.
 */
export function resolvePlacement(
  clips: Clip[],
  trackId: string,
  requestedStart: number,
  duration: number,
  excludeIds: Set<string> = new Set(),
): number {
  const others = occupied(clips, trackId, excludeIds);
  const fits = (start: number) =>
    start >= -EPSILON && !others.some((c) => overlaps(start, duration, c.startTime, c.duration));

  const wanted = Math.max(0, requestedStart);
  if (fits(wanted)) return wanted;

  const candidates = [0];
  for (const c of others) {
    candidates.push(c.startTime + c.duration);      // butt up after it
    candidates.push(c.startTime - duration);        // butt up before it
  }

  let best: number | null = null;
  let bestDistance = Infinity;
  for (const raw of candidates) {
    const candidate = Math.max(0, raw);
    if (!fits(candidate)) continue;
    const distance = Math.abs(candidate - wanted);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best ?? firstFreeSlot(clips, trackId, duration);
}

/** Earliest position where `duration` fits, scanning gaps left to right. */
export function firstFreeSlot(clips: Clip[], trackId: string, duration: number): number {
  const others = occupied(clips, trackId, new Set());
  let cursor = 0;
  for (const c of others) {
    if (c.startTime - cursor >= duration - EPSILON) return cursor;
    cursor = Math.max(cursor, c.startTime + c.duration);
  }
  return cursor;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -w apps/web -- overlap`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/audio/overlap.ts apps/web/src/audio/overlap.test.ts
git commit -m "feat(web): enforce non-overlapping clip placement"
```

---

## Task 6: Snapping

Pure. The snap threshold is expressed in pixels so it feels identical at every zoom level — a fixed 0.1 s threshold would be unusably coarse when zoomed in and useless when zoomed out.

**Files:**
- Create: `apps/web/src/audio/snapping.ts`
- Test: `apps/web/src/audio/snapping.test.ts`

**Interfaces:**
- Consumes: `Clip` from `../api/client`.
- Produces:
  ```ts
  export const SNAP_THRESHOLD_PX = 8;
  export function gridInterval(pxPerSecond: number): number;
  export function snapCandidates(
    clips: Clip[], playhead: number, pxPerSecond: number, excludeIds?: Set<string>,
  ): number[];
  export function snapTime(
    rawTime: number, candidates: number[], pxPerSecond: number, enabled: boolean,
  ): number;
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { snapTime, snapCandidates, gridInterval, SNAP_THRESHOLD_PX } from "./snapping";
import type { Clip } from "../api/client";

const clip = (id: string, startTime: number, duration: number): Clip => ({
  id, trackId: "t", mediaId: "m", startTime, sourceOffset: 0, duration,
  name: id, gain: 1, fadeIn: 0, fadeOut: 0,
});

describe("gridInterval", () => {
  it("shrinks as the zoom grows", () => {
    expect(gridInterval(400)).toBeLessThan(gridInterval(20));
  });
  it("always returns a positive interval", () => {
    for (const z of [20, 50, 100, 200, 400]) expect(gridInterval(z)).toBeGreaterThan(0);
  });
});

describe("snapTime", () => {
  it("snaps to a candidate inside the pixel threshold", () => {
    // 100 px/s → the 8 px threshold is 0.08 s. 2.05 is within it.
    expect(snapTime(2.05, [2], 100, true)).toBeCloseTo(2);
  });

  it("leaves a value outside the threshold alone", () => {
    expect(snapTime(2.5, [2], 100, true)).toBeCloseTo(2.5);
  });

  it("keeps the threshold constant in pixels across zoom levels", () => {
    // 0.3 s away: snaps when 8 px covers it (pxPerSecond 40 → 0.2 s) ... it does not.
    expect(snapTime(2.3, [2], 40, true)).toBeCloseTo(2.3);
    // At 20 px/s the threshold is 0.4 s, so the same offset now snaps.
    expect(snapTime(2.3, [2], 20, true)).toBeCloseTo(2);
  });

  it("returns the raw time when snapping is disabled (Alt held)", () => {
    expect(snapTime(2.05, [2], 100, false)).toBeCloseTo(2.05);
  });

  it("picks the nearest candidate when several are in range", () => {
    expect(snapTime(2.04, [2, 2.05], 100, true)).toBeCloseTo(2.05);
  });

  it("never returns a negative time", () => {
    expect(snapTime(-1, [], 100, true)).toBe(0);
  });
});

describe("snapCandidates", () => {
  it("includes the playhead, zero, and both edges of every clip", () => {
    const c = snapCandidates([clip("a", 2, 3)], 7, 100);
    expect(c).toContain(0);
    expect(c).toContain(7);
    expect(c).toContain(2);
    expect(c).toContain(5);
  });

  it("omits edges of excluded clips", () => {
    const c = snapCandidates([clip("a", 2, 3)], 7, 100, new Set(["a"]));
    expect(c).not.toContain(2);
    expect(c).not.toContain(5);
  });

  it("includes grid lines", () => {
    const step = gridInterval(100);
    expect(snapCandidates([], 0, 100)).toContain(step);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w apps/web -- snapping`
Expected: FAIL — cannot resolve `./snapping`.

- [ ] **Step 3: Implement**

```ts
import type { Clip } from "../api/client";

export const SNAP_THRESHOLD_PX = 8;

/** Coarsest "nice" interval whose on-screen width is at least 40 px. */
export function gridInterval(pxPerSecond: number): number {
  const steps = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  return steps.find((s) => s * pxPerSecond >= 40) ?? steps[steps.length - 1];
}

const GRID_LINES = 400;

export function snapCandidates(
  clips: Clip[],
  playhead: number,
  pxPerSecond: number,
  excludeIds: Set<string> = new Set(),
): number[] {
  const candidates = [0, playhead];
  for (const c of clips) {
    if (excludeIds.has(c.id)) continue;
    candidates.push(c.startTime, c.startTime + c.duration);
  }
  const step = gridInterval(pxPerSecond);
  for (let i = 1; i <= GRID_LINES; i++) candidates.push(i * step);
  return candidates;
}

export function snapTime(
  rawTime: number,
  candidates: number[],
  pxPerSecond: number,
  enabled: boolean,
): number {
  const time = Math.max(0, rawTime);
  if (!enabled) return time;
  const threshold = SNAP_THRESHOLD_PX / pxPerSecond;
  let best = time;
  let bestDistance = threshold;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - time);
    if (distance <= bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return Math.max(0, best);
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -w apps/web -- snapping`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/audio/snapping.ts apps/web/src/audio/snapping.test.ts
git commit -m "feat(web): add zoom-stable snapping"
```

---

## Task 7: Recording state machine

Pure. Keeping the transitions out of React is what stops the "recording starts the instant I click" problem — arming and capturing become distinct states with distinct UI.

**Files:**
- Create: `apps/web/src/audio/recordingMachine.ts`
- Test: `apps/web/src/audio/recordingMachine.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type RecordingState =
    | { phase: "idle" }
    | { phase: "armed"; trackId: string }
    | { phase: "counting"; trackId: string; remaining: number }
    | { phase: "recording"; trackId: string; startedAt: number };
  export type RecordingEvent =
    | { type: "ARM"; trackId: string } | { type: "DISARM" }
    | { type: "START_COUNT" } | { type: "TICK" } | { type: "CANCEL" }
    | { type: "BEGIN"; startedAt: number } | { type: "STOP" };
  export const COUNT_IN_BEATS = 3;
  export function recordingReducer(state: RecordingState, event: RecordingEvent): RecordingState;
  export function armedTrackId(state: RecordingState): string | null;
  export function isCapturing(state: RecordingState): boolean;
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { recordingReducer, armedTrackId, isCapturing, COUNT_IN_BEATS, type RecordingState } from "./recordingMachine";

const idle: RecordingState = { phase: "idle" };

describe("recordingReducer", () => {
  it("arms a track from idle", () => {
    expect(recordingReducer(idle, { type: "ARM", trackId: "t1" })).toEqual({ phase: "armed", trackId: "t1" });
  });

  it("re-arming swaps the track — only one track may be armed", () => {
    const armed = recordingReducer(idle, { type: "ARM", trackId: "t1" });
    expect(recordingReducer(armed, { type: "ARM", trackId: "t2" })).toEqual({ phase: "armed", trackId: "t2" });
  });

  it("ignores START_COUNT when nothing is armed", () => {
    expect(recordingReducer(idle, { type: "START_COUNT" })).toBe(idle);
  });

  it("counts in from COUNT_IN_BEATS and reaches zero", () => {
    let s = recordingReducer({ phase: "armed", trackId: "t1" }, { type: "START_COUNT" });
    expect(s).toEqual({ phase: "counting", trackId: "t1", remaining: COUNT_IN_BEATS });
    for (let i = 0; i < COUNT_IN_BEATS; i++) s = recordingReducer(s, { type: "TICK" });
    expect(s).toEqual({ phase: "counting", trackId: "t1", remaining: 0 });
  });

  it("CANCEL during the count returns to armed and produces no clip", () => {
    const counting = recordingReducer({ phase: "armed", trackId: "t1" }, { type: "START_COUNT" });
    expect(recordingReducer(counting, { type: "CANCEL" })).toEqual({ phase: "armed", trackId: "t1" });
  });

  it("BEGIN moves from counting to recording and records the playhead", () => {
    const counting: RecordingState = { phase: "counting", trackId: "t1", remaining: 0 };
    expect(recordingReducer(counting, { type: "BEGIN", startedAt: 4.5 }))
      .toEqual({ phase: "recording", trackId: "t1", startedAt: 4.5 });
  });

  it("refuses BEGIN from armed — the count-in cannot be skipped", () => {
    const armed: RecordingState = { phase: "armed", trackId: "t1" };
    expect(recordingReducer(armed, { type: "BEGIN", startedAt: 0 })).toBe(armed);
  });

  it("STOP returns to armed so a retake needs no re-arming", () => {
    const rec: RecordingState = { phase: "recording", trackId: "t1", startedAt: 2 };
    expect(recordingReducer(rec, { type: "STOP" })).toEqual({ phase: "armed", trackId: "t1" });
  });

  it("DISARM from any phase returns to idle", () => {
    const rec: RecordingState = { phase: "recording", trackId: "t1", startedAt: 2 };
    expect(recordingReducer(rec, { type: "DISARM" })).toEqual(idle);
  });
});

describe("helpers", () => {
  it("armedTrackId reports the track in every non-idle phase", () => {
    expect(armedTrackId(idle)).toBeNull();
    expect(armedTrackId({ phase: "armed", trackId: "t1" })).toBe("t1");
    expect(armedTrackId({ phase: "counting", trackId: "t1", remaining: 2 })).toBe("t1");
    expect(armedTrackId({ phase: "recording", trackId: "t1", startedAt: 0 })).toBe("t1");
  });

  it("isCapturing is true only while recording", () => {
    expect(isCapturing({ phase: "counting", trackId: "t1", remaining: 0 })).toBe(false);
    expect(isCapturing({ phase: "recording", trackId: "t1", startedAt: 0 })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w apps/web -- recordingMachine`
Expected: FAIL — cannot resolve `./recordingMachine`.

- [ ] **Step 3: Implement**

```ts
export type RecordingState =
  | { phase: "idle" }
  | { phase: "armed"; trackId: string }
  | { phase: "counting"; trackId: string; remaining: number }
  | { phase: "recording"; trackId: string; startedAt: number };

export type RecordingEvent =
  | { type: "ARM"; trackId: string }
  | { type: "DISARM" }
  | { type: "START_COUNT" }
  | { type: "TICK" }
  | { type: "CANCEL" }
  | { type: "BEGIN"; startedAt: number }
  | { type: "STOP" };

export const COUNT_IN_BEATS = 3;

/** Illegal transitions return the state unchanged (referentially equal). */
export function recordingReducer(state: RecordingState, event: RecordingEvent): RecordingState {
  switch (event.type) {
    case "ARM":
      return { phase: "armed", trackId: event.trackId };
    case "DISARM":
      return { phase: "idle" };
    case "START_COUNT":
      return state.phase === "armed"
        ? { phase: "counting", trackId: state.trackId, remaining: COUNT_IN_BEATS }
        : state;
    case "TICK":
      return state.phase === "counting"
        ? { ...state, remaining: Math.max(0, state.remaining - 1) }
        : state;
    case "CANCEL":
      return state.phase === "counting" ? { phase: "armed", trackId: state.trackId } : state;
    case "BEGIN":
      return state.phase === "counting"
        ? { phase: "recording", trackId: state.trackId, startedAt: event.startedAt }
        : state;
    case "STOP":
      return state.phase === "recording" ? { phase: "armed", trackId: state.trackId } : state;
    default:
      return state;
  }
}

export function armedTrackId(state: RecordingState): string | null {
  return state.phase === "idle" ? null : state.trackId;
}

export function isCapturing(state: RecordingState): boolean {
  return state.phase === "recording";
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -w apps/web -- recordingMachine`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/audio/recordingMachine.ts apps/web/src/audio/recordingMachine.test.ts
git commit -m "feat(web): add recording state machine"
```

---

## Task 8: Rewrite the audio engine

Fixes defect #1 — the reason no sound ever comes out on the first click.

**Files:**
- Modify: `apps/web/src/audio/engine.ts`
- Modify: `apps/web/src/audio/engine.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export class AudioEngine {
    constructor(ctx: AudioContext);
    getContext(): AudioContext;
    unlock(): Promise<void>;                 // resumes a suspended context; idempotent
    isUnlocked(): boolean;
    ensureTrackNodes(trackId: string): { gain: GainNode; pan: StereoPannerNode; analyser: AnalyserNode };
    setTrackVolume(trackId: string, value: number): void;
    setTrackPan(trackId: string, value: number): void;
    setTrackMuted(trackId: string, muted: boolean): void;
    removeTrack(trackId: string): void;
    trackLevel(trackId: string): number;     // 0..1 RMS, 0 when unknown
    masterLevel(): number;
  }
  ```
  The old `loadBuffer` is gone — `MediaLibrary` owns that now. Delete its test.

- [ ] **Step 1: Write the failing test**

Replace `engine.test.ts`. The existing file already builds a mock context; extend that pattern with `resume`, `createAnalyser`, and a `state` field.

```ts
import { describe, it, expect, vi } from "vitest";
import { AudioEngine } from "./engine";

function mockCtx(state: AudioContextState = "suspended") {
  const analyser = () => ({
    fftSize: 2048, connect: vi.fn(), disconnect: vi.fn(),
    getFloatTimeDomainData: (a: Float32Array) => a.fill(0.5),
  });
  const ctx = {
    state,
    resume: vi.fn().mockImplementation(async () => { ctx.state = "running"; }),
    destination: { name: "dest" },
    createGain: () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }),
    createStereoPanner: () => ({ pan: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }),
    createAnalyser: analyser,
  };
  return ctx as unknown as AudioContext & { resume: ReturnType<typeof vi.fn> };
}

describe("AudioEngine.unlock", () => {
  it("resumes a suspended context", async () => {
    const ctx = mockCtx("suspended");
    const engine = new AudioEngine(ctx);
    expect(engine.isUnlocked()).toBe(false);
    await engine.unlock();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(engine.isUnlocked()).toBe(true);
  });

  it("only resumes once across repeated calls", async () => {
    const ctx = mockCtx("suspended");
    const engine = new AudioEngine(ctx);
    await Promise.all([engine.unlock(), engine.unlock(), engine.unlock()]);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it("does not call resume on an already-running context", async () => {
    const ctx = mockCtx("running");
    await new AudioEngine(ctx).unlock();
    expect(ctx.resume).not.toHaveBeenCalled();
  });
});

describe("AudioEngine track nodes", () => {
  it("reuses the same nodes for a track", () => {
    const engine = new AudioEngine(mockCtx());
    expect(engine.ensureTrackNodes("t1")).toBe(engine.ensureTrackNodes("t1"));
  });

  it("applies volume and pan", () => {
    const engine = new AudioEngine(mockCtx());
    engine.setTrackVolume("t1", 0.3);
    engine.setTrackPan("t1", -0.5);
    const n = engine.ensureTrackNodes("t1");
    expect(n.gain.gain.value).toBeCloseTo(0.3);
    expect(n.pan.pan.value).toBeCloseTo(-0.5);
  });

  it("restores the pre-mute volume on unmute", () => {
    const engine = new AudioEngine(mockCtx());
    engine.setTrackVolume("t1", 0.7);
    engine.setTrackMuted("t1", true);
    expect(engine.ensureTrackNodes("t1").gain.gain.value).toBe(0);
    engine.setTrackMuted("t1", false);
    expect(engine.ensureTrackNodes("t1").gain.gain.value).toBeCloseTo(0.7);
  });

  it("keeps a volume change made while muted", () => {
    const engine = new AudioEngine(mockCtx());
    engine.setTrackMuted("t1", true);
    engine.setTrackVolume("t1", 0.4);
    expect(engine.ensureTrackNodes("t1").gain.gain.value).toBe(0);
    engine.setTrackMuted("t1", false);
    expect(engine.ensureTrackNodes("t1").gain.gain.value).toBeCloseTo(0.4);
  });

  it("reports an RMS level for a known track and 0 for an unknown one", () => {
    const engine = new AudioEngine(mockCtx());
    engine.ensureTrackNodes("t1");
    expect(engine.trackLevel("t1")).toBeCloseTo(0.5, 1);
    expect(engine.trackLevel("ghost")).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w apps/web -- engine`
Expected: FAIL — `unlock` is not a function.

- [ ] **Step 3: Implement**

Key points: `setTrackVolume` must write to `lastVolume` and only touch `gain.value` when unmuted (the v1 version clobbered a muted track back to audible). Every track chain ends at a shared master gain, and the master feeds an analyser plus `destination`.

```ts
interface TrackNodes {
  gain: GainNode;
  pan: StereoPannerNode;
  analyser: AnalyserNode;
  lastVolume: number;
  muted: boolean;
}

function rms(analyser: AnalyserNode): number {
  const data = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.min(1, Math.sqrt(sum / data.length));
}

export class AudioEngine {
  private ctx: AudioContext;
  private tracks = new Map<string, TrackNodes>();
  private master: GainNode;
  private masterAnalyser: AnalyserNode;
  private unlocking: Promise<void> | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.masterAnalyser = ctx.createAnalyser();
    this.masterAnalyser.fftSize = 2048;
    this.master.connect(this.masterAnalyser as unknown as AudioNode);
    this.masterAnalyser.connect(ctx.destination);
  }

  getContext(): AudioContext { return this.ctx; }

  isUnlocked(): boolean { return this.ctx.state === "running"; }

  /** Browsers start an AudioContext suspended until a user gesture. */
  unlock(): Promise<void> {
    if (this.ctx.state === "running") return Promise.resolve();
    if (!this.unlocking) {
      this.unlocking = this.ctx.resume().catch(() => { this.unlocking = null; });
    }
    return this.unlocking;
  }

  ensureTrackNodes(trackId: string): TrackNodes {
    let nodes = this.tracks.get(trackId);
    if (!nodes) {
      const gain = this.ctx.createGain();
      const pan = this.ctx.createStereoPanner();
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 2048;
      gain.connect(pan as unknown as AudioNode);
      pan.connect(analyser as unknown as AudioNode);
      analyser.connect(this.master as unknown as AudioNode);
      nodes = { gain, pan, analyser, lastVolume: 1, muted: false };
      this.tracks.set(trackId, nodes);
    }
    return nodes;
  }

  setTrackVolume(trackId: string, value: number): void {
    const nodes = this.ensureTrackNodes(trackId);
    nodes.lastVolume = value;
    if (!nodes.muted) nodes.gain.gain.value = value;
  }

  setTrackPan(trackId: string, value: number): void {
    this.ensureTrackNodes(trackId).pan.pan.value = value;
  }

  setTrackMuted(trackId: string, muted: boolean): void {
    const nodes = this.ensureTrackNodes(trackId);
    nodes.muted = muted;
    nodes.gain.gain.value = muted ? 0 : nodes.lastVolume;
  }

  removeTrack(trackId: string): void {
    const nodes = this.tracks.get(trackId);
    if (!nodes) return;
    nodes.gain.disconnect();
    nodes.pan.disconnect();
    nodes.analyser.disconnect();
    this.tracks.delete(trackId);
  }

  trackLevel(trackId: string): number {
    const nodes = this.tracks.get(trackId);
    return nodes ? rms(nodes.analyser) : 0;
  }

  masterLevel(): number { return rms(this.masterAnalyser); }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -w apps/web -- engine`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/audio/engine.ts apps/web/src/audio/engine.test.ts
git commit -m "feat(web): rewrite audio engine with context unlock and metering"
```

---

## Task 9: Rewrite the transport

Fixes defects #8 and #9: playback that never ends, and a re-decode plus a race on every play/seek.

**Files:**
- Modify: `apps/web/src/audio/transport.ts`
- Modify: `apps/web/src/audio/transport.test.ts`

**Interfaces:**
- Consumes: `AudioEngine` (Task 8), `MediaLibrary` (Task 3), `computeSchedule`/`projectDuration`/`audibleTracks` (Task 4).
- Produces:
  ```ts
  export class Transport {
    constructor(engine: AudioEngine, library: MediaLibrary);
    setProject(clips: Clip[], tracks: Track[]): void;  // called on every store change
    isPlaying(): boolean;
    getCurrentTime(): number;
    play(): Promise<void>;
    pause(): void;
    stop(): void;
    seek(seconds: number): void;                        // sync; safe during playback
    onTimeUpdate(cb: (t: number) => void): () => void;
    onEnded(cb: () => void): () => void;
  }
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { Transport } from "./transport";
import type { Clip, Track } from "../api/client";

const clip = (over: Partial<Clip> = {}): Clip => ({
  id: "c1", trackId: "t1", mediaId: "m1", startTime: 0, sourceOffset: 0,
  duration: 4, name: "c", gain: 1, fadeIn: 0, fadeOut: 0, ...over,
});
const track: Track = { id: "t1", name: "T", orderIndex: 0, color: "", volume: 1, pan: 0, muted: false, soloed: false };

function harness() {
  let now = 0;
  const started: Array<{ when: number; offset: number; duration: number }> = [];
  const ctx = {
    get currentTime() { return now; },
    createGain: () => ({
      gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      connect: vi.fn(), disconnect: vi.fn(),
    }),
    createBufferSource: () => ({
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      start: (when: number, offset: number, duration: number) => started.push({ when, offset, duration }),
      stop: vi.fn(),
      onended: null,
    }),
  };
  const engine = {
    getContext: () => ctx as unknown as AudioContext,
    unlock: vi.fn().mockResolvedValue(undefined),
    ensureTrackNodes: () => ({ gain: { connect: vi.fn() } }),
  };
  const buffer = { duration: 10, sampleRate: 44100, numberOfChannels: 1 } as AudioBuffer;
  const library = {
    preload: vi.fn().mockResolvedValue(undefined),
    get: (id: string) => (id === "m1" ? buffer : null),
    has: (id: string) => id === "m1",
  };
  return {
    started,
    advance: (dt: number) => { now += dt; },
    transport: new Transport(engine as never, library as never),
    engine,
  };
}

describe("Transport", () => {
  it("unlocks the context before playing — the v1 silence bug", async () => {
    const { transport, engine } = harness();
    transport.setProject([clip()], [track]);
    await transport.play();
    expect(engine.unlock).toHaveBeenCalled();
  });

  it("schedules each clip once with the right window", async () => {
    const { transport, started } = harness();
    transport.setProject([clip({ startTime: 2, sourceOffset: 1, duration: 3 })], [track]);
    await transport.play();
    expect(started).toHaveLength(1);
    expect(started[0].offset).toBeCloseTo(1);
    expect(started[0].duration).toBeCloseTo(3);
  });

  it("tracks time from the audio clock, not a frame counter", async () => {
    const { transport, advance } = harness();
    transport.setProject([clip({ duration: 10 })], [track]);
    await transport.play();
    advance(2.5);
    expect(transport.getCurrentTime()).toBeCloseTo(2.5);
  });

  it("pause freezes the clock and resume continues from there", async () => {
    const { transport, advance } = harness();
    transport.setProject([clip({ duration: 10 })], [track]);
    await transport.play();
    advance(3);
    transport.pause();
    expect(transport.isPlaying()).toBe(false);
    advance(5); // wall clock moves while paused
    expect(transport.getCurrentTime()).toBeCloseTo(3);
    await transport.play();
    advance(1);
    expect(transport.getCurrentTime()).toBeCloseTo(4);
  });

  it("stop rewinds to zero", async () => {
    const { transport, advance } = harness();
    transport.setProject([clip({ duration: 10 })], [track]);
    await transport.play();
    advance(3);
    transport.stop();
    expect(transport.getCurrentTime()).toBe(0);
    expect(transport.isPlaying()).toBe(false);
  });

  it("seek while playing reschedules without leaving stale sources", async () => {
    const { transport, started } = harness();
    transport.setProject([clip({ duration: 10 })], [track]);
    await transport.play();
    started.length = 0;
    transport.seek(5);
    expect(transport.getCurrentTime()).toBeCloseTo(5);
    expect(started).toHaveLength(1);
    expect(started[0].offset).toBeCloseTo(5);
  });

  it("seek while paused moves the playhead without scheduling", () => {
    const { transport, started } = harness();
    transport.setProject([clip()], [track]);
    transport.seek(2);
    expect(transport.getCurrentTime()).toBeCloseTo(2);
    expect(started).toHaveLength(0);
  });

  it("clamps a negative seek to zero", () => {
    const { transport } = harness();
    transport.setProject([clip()], [track]);
    transport.seek(-5);
    expect(transport.getCurrentTime()).toBe(0);
  });

  it("stops itself and fires onEnded past the last clip", async () => {
    const { transport, advance } = harness();
    const ended = vi.fn();
    transport.onEnded(ended);
    transport.setProject([clip({ startTime: 0, duration: 2 })], [track]);
    await transport.play();
    advance(2.2);
    // The clock loop polls; give it one manual pump.
    await new Promise((r) => setTimeout(r, 30));
    expect(ended).toHaveBeenCalled();
    expect(transport.isPlaying()).toBe(false);
  });

  it("does not schedule clips on inaudible tracks", async () => {
    const { transport, started } = harness();
    transport.setProject([clip()], [{ ...track, muted: true }]);
    await transport.play();
    expect(started).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w apps/web -- transport`
Expected: FAIL — the constructor takes one argument, `setProject` does not exist.

- [ ] **Step 3: Implement**

Structure to follow:

- Hold `clips`/`tracks` from `setProject`. Playback reads them at schedule time.
- `play()`: `await engine.unlock()`, `await library.preload(mediaIds)`, then `schedule(currentTime)`.
- `schedule(from)`: build `sourceDurations` from `library.get(id)!.duration` for loaded media; call `computeSchedule`; filter by `audibleTracks`; for each entry create a source plus a per-clip gain node carrying `entry.gain` and the fade ramps, connect to `engine.ensureTrackNodes(trackId).gain`, then `source.start(ctx.currentTime + entry.when, entry.offset, entry.duration)`.
- Fades, applied on the per-clip gain node with `startAt = ctx.currentTime + entry.when`:

```ts
const g = clipGain.gain;
g.setValueAtTime(entry.fadeIn > 0 ? 0 : entry.gain, startAt);
if (entry.fadeIn > 0) g.linearRampToValueAtTime(entry.gain, startAt + Math.min(entry.fadeIn, entry.duration));
if (entry.fadeOut > 0) {
  const fadeStart = startAt + Math.max(0, entry.duration - entry.fadeOut);
  g.setValueAtTime(entry.gain, fadeStart);
  g.linearRampToValueAtTime(0, startAt + entry.duration);
}
```

- Clock: `getCurrentTime()` returns `playing ? anchorTime + (ctx.currentTime - anchorContextTime) : anchorTime`. A `setInterval` at ~30 ms emits time updates and, once `getCurrentTime() >= projectDuration(clips)` and there is at least one clip, calls `stop()` and fires `onEnded`. Use an interval rather than `requestAnimationFrame` so the existing node-env tests work without the RAF shim v1 needed.
- `seek(seconds)` is synchronous: clamp to `>= 0`, `stopSources()`, set the anchor, and if playing call `schedule(newTime)` directly (buffers are already loaded, so no await is needed — this is what removes the v1 race).
- `stopSources()` must clear `source.onended` before calling `stop()` so a teardown does not trigger the end-of-project path.

- [ ] **Step 4: Run tests**

Run: `npm test -w apps/web -- transport`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/audio/transport.ts apps/web/src/audio/transport.test.ts
git commit -m "feat(web): rewrite transport with cached buffers and end detection"
```

---

## Task 10: Clip editing operations

Split correctness, plus the multi-clip operations the UI needs. Every mutation is a single undoable command.

**Files:**
- Modify: `apps/web/src/audio/clipEditing.ts`
- Modify: `apps/web/src/audio/clipEditing.test.ts`
- Delete: `apps/web/src/audio/clipDragGuard.test.ts` (tests `hasClipChanged`, which this task removes)

**Interfaces:**
- Consumes: `resolvePlacement` (Task 5), `useProjectStore`, `useHistoryStore`.
- Produces:
  ```ts
  export function splitClip(clip: Clip, atTime: number): [Clip, Clip] | null;
  export function splitClipsAt(clipIds: string[], atTime: number): void;
  export function deleteClips(clipIds: string[]): void;
  export function duplicateClips(clipIds: string[]): void;
  export function moveClips(moves: Array<{ id: string; trackId: string; startTime: number }>): void;
  export function trimClip(id: string, edge: "left" | "right", newTime: number): void;
  export function setClipFade(id: string, edge: "in" | "out", seconds: number): void;
  export function setClipGain(id: string, gain: number): void;
  ```
  `MIN_CLIP_DURATION = 0.05`. All of these push exactly one history command.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { splitClip, splitClipsAt, deleteClips, duplicateClips, moveClips, trimClip, setClipFade } from "./clipEditing";
import { useProjectStore } from "../store/projectStore";
import { useHistoryStore } from "../store/historyStore";
import type { Clip } from "../api/client";

const clip = (over: Partial<Clip> = {}): Clip => ({
  id: "c1", trackId: "t1", mediaId: "m1", startTime: 0, sourceOffset: 0,
  duration: 10, name: "c", gain: 1, fadeIn: 0, fadeOut: 0, ...over,
});

beforeEach(() => {
  useProjectStore.setState({
    tracks: [
      { id: "t1", name: "A", orderIndex: 0, color: "", volume: 1, pan: 0, muted: false, soloed: false },
      { id: "t2", name: "B", orderIndex: 1, color: "", volume: 1, pan: 0, muted: false, soloed: false },
    ],
    clips: [], media: [], selectedClipIds: [], hydrated: true,
  });
  useHistoryStore.setState({ undoStack: [], redoStack: [], canUndo: false, canRedo: false });
});

describe("splitClip", () => {
  it("produces halves that exactly tile the original", () => {
    const [left, right] = splitClip(clip({ startTime: 5, sourceOffset: 2, duration: 10 }), 8)!;
    expect(left.startTime).toBeCloseTo(5);
    expect(left.duration).toBeCloseTo(3);
    expect(left.sourceOffset).toBeCloseTo(2);
    expect(right.startTime).toBeCloseTo(8);
    expect(right.duration).toBeCloseTo(7);
    expect(right.sourceOffset).toBeCloseTo(5); // 2 + 3 — the seam does not drift
    expect(left.duration + right.duration).toBeCloseTo(10);
    expect(right.id).not.toBe(left.id);
  });

  it("moves a fade-out onto the right half and a fade-in onto the left", () => {
    const [left, right] = splitClip(clip({ duration: 10, fadeIn: 1, fadeOut: 2 }), 5)!;
    expect(left.fadeIn).toBeCloseTo(1);
    expect(left.fadeOut).toBe(0);
    expect(right.fadeIn).toBe(0);
    expect(right.fadeOut).toBeCloseTo(2);
  });

  it("refuses a cut outside the clip or too close to an edge", () => {
    expect(splitClip(clip({ startTime: 0, duration: 10 }), 0)).toBeNull();
    expect(splitClip(clip({ startTime: 0, duration: 10 }), 10)).toBeNull();
    expect(splitClip(clip({ startTime: 0, duration: 10 }), 15)).toBeNull();
    expect(splitClip(clip({ startTime: 0, duration: 10 }), 0.001)).toBeNull();
  });
});

describe("splitClipsAt", () => {
  it("replaces one clip with two in the store", () => {
    useProjectStore.setState({ clips: [clip()] });
    splitClipsAt(["c1"], 4);
    const clips = useProjectStore.getState().clips;
    expect(clips).toHaveLength(2);
    expect(clips.map((c) => c.duration).sort()).toEqual([4, 6]);
  });

  it("is undone in a single step", () => {
    useProjectStore.setState({ clips: [clip()] });
    splitClipsAt(["c1"], 4);
    useHistoryStore.getState().undo();
    expect(useProjectStore.getState().clips).toHaveLength(1);
    expect(useProjectStore.getState().clips[0].duration).toBeCloseTo(10);
  });

  it("cuts several selected clips at once", () => {
    useProjectStore.setState({ clips: [clip({ id: "a" }), clip({ id: "b", trackId: "t2" })] });
    splitClipsAt(["a", "b"], 4);
    expect(useProjectStore.getState().clips).toHaveLength(4);
  });

  it("leaves clips that do not span the cut point untouched", () => {
    useProjectStore.setState({ clips: [clip({ id: "a", startTime: 0, duration: 2 })] });
    splitClipsAt(["a"], 5);
    expect(useProjectStore.getState().clips).toHaveLength(1);
  });
});

describe("deleteClips", () => {
  it("removes every listed clip and restores them all on undo", () => {
    useProjectStore.setState({ clips: [clip({ id: "a" }), clip({ id: "b", startTime: 20 })] });
    deleteClips(["a", "b"]);
    expect(useProjectStore.getState().clips).toHaveLength(0);
    useHistoryStore.getState().undo();
    expect(useProjectStore.getState().clips).toHaveLength(2);
  });
});

describe("duplicateClips", () => {
  it("places the copy after the original without overlapping it", () => {
    useProjectStore.setState({ clips: [clip({ id: "a", startTime: 0, duration: 4 })] });
    duplicateClips(["a"]);
    const clips = useProjectStore.getState().clips;
    expect(clips).toHaveLength(2);
    const copy = clips.find((c) => c.id !== "a")!;
    expect(copy.startTime).toBeGreaterThanOrEqual(4);
  });
});

describe("moveClips", () => {
  it("moves a clip to another track", () => {
    useProjectStore.setState({ clips: [clip({ id: "a" })] });
    moveClips([{ id: "a", trackId: "t2", startTime: 3 }]);
    const moved = useProjectStore.getState().clips[0];
    expect(moved.trackId).toBe("t2");
    expect(moved.startTime).toBeCloseTo(3);
  });

  it("refuses to create an overlap, nudging to a free slot instead", () => {
    useProjectStore.setState({ clips: [clip({ id: "a", startTime: 0, duration: 4 }), clip({ id: "b", startTime: 20, duration: 4 })] });
    moveClips([{ id: "b", trackId: "t1", startTime: 2 }]);
    const b = useProjectStore.getState().clips.find((c) => c.id === "b")!;
    expect(b.startTime).toBeGreaterThanOrEqual(4);
  });

  it("restores both track and position on undo", () => {
    useProjectStore.setState({ clips: [clip({ id: "a", startTime: 1 })] });
    moveClips([{ id: "a", trackId: "t2", startTime: 7 }]);
    useHistoryStore.getState().undo();
    const a = useProjectStore.getState().clips[0];
    expect(a.trackId).toBe("t1");
    expect(a.startTime).toBeCloseTo(1);
  });
});

describe("trimClip", () => {
  it("trimming the left edge advances sourceOffset by the same amount", () => {
    useProjectStore.setState({ clips: [clip({ startTime: 0, sourceOffset: 1, duration: 10 })] });
    trimClip("c1", "left", 3);
    const c = useProjectStore.getState().clips[0];
    expect(c.startTime).toBeCloseTo(3);
    expect(c.sourceOffset).toBeCloseTo(4);
    expect(c.duration).toBeCloseTo(7);
  });

  it("trimming the right edge only shortens the duration", () => {
    useProjectStore.setState({ clips: [clip({ startTime: 0, sourceOffset: 1, duration: 10 })] });
    trimClip("c1", "right", 6);
    const c = useProjectStore.getState().clips[0];
    expect(c.sourceOffset).toBeCloseTo(1);
    expect(c.duration).toBeCloseTo(6);
  });

  it("never trims below the minimum duration", () => {
    useProjectStore.setState({ clips: [clip({ startTime: 0, duration: 10 })] });
    trimClip("c1", "right", 0);
    expect(useProjectStore.getState().clips[0].duration).toBeGreaterThan(0);
  });

  it("never pulls sourceOffset below zero", () => {
    useProjectStore.setState({ clips: [clip({ startTime: 5, sourceOffset: 0, duration: 5 })] });
    trimClip("c1", "left", 0);
    expect(useProjectStore.getState().clips[0].sourceOffset).toBeGreaterThanOrEqual(0);
  });
});

describe("setClipFade", () => {
  it("clamps a fade to the clip duration", () => {
    useProjectStore.setState({ clips: [clip({ duration: 4 })] });
    setClipFade("c1", "in", 99);
    expect(useProjectStore.getState().clips[0].fadeIn).toBeLessThanOrEqual(4);
  });

  it("clamps a negative fade to zero", () => {
    useProjectStore.setState({ clips: [clip({ duration: 4 })] });
    setClipFade("c1", "out", -3);
    expect(useProjectStore.getState().clips[0].fadeOut).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w apps/web -- clipEditing`
Expected: FAIL — `splitClipsAt` is not exported.

- [ ] **Step 3: Implement**

Replace the file. Notes that matter:

- `splitClip` returns `null` unless `atTime` leaves at least `MIN_CLIP_DURATION` on both sides. The right half's `sourceOffset` is `clip.sourceOffset + leftDuration` — that is the seam-drift guard the test pins.
- Fades: the left half keeps `fadeIn` and drops `fadeOut`; the right half keeps `fadeOut` and drops `fadeIn`. Both are then clamped to their new durations.
- Every exported mutator captures a **snapshot of the whole clip array** before and after, and pushes one command that swaps between them:

```ts
function commit(mutate: () => void): void {
  const before = useProjectStore.getState().clips;
  mutate();
  const after = useProjectStore.getState().clips;
  if (before === after) return;
  useHistoryStore.getState().push({
    do: () => useProjectStore.setState({ clips: after }),
    undo: () => useProjectStore.setState({ clips: before }),
  });
}
```

Because `useHistoryStore.push` calls `do()` immediately, `mutate()` must be idempotent when re-applied — snapshot swapping is, which is why this shape replaces v1's fragile revert-then-replay dance. Drop `hasClipChanged` and delete `clipDragGuard.test.ts`.

- `moveClips` routes every destination through `resolvePlacement`, excluding the ids being moved so a group drag does not fight itself.
- `duplicateClips` places each copy via `resolvePlacement(clips, trackId, original.startTime + original.duration, duration)`.
- `trimClip` clamps: left edge cannot push `sourceOffset` below 0 nor leave less than `MIN_CLIP_DURATION`; right edge cannot exceed the source length (the caller passes the source duration limit via the store's media entry, falling back to no limit when the media is unknown).

- [ ] **Step 4: Run tests**

Run: `npm test -w apps/web -- clipEditing`
Expected: PASS (18 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/audio
git rm apps/web/src/audio/clipDragGuard.test.ts
git commit -m "feat(web): add snapshot-based clip editing operations"
```

---

## Task 11: Project store for multi-selection and tools

**Files:**
- Modify: `apps/web/src/store/projectStore.ts`
- Modify: `apps/web/src/store/projectStore.test.ts`

**Interfaces:**
- Produces, added to `ProjectStoreState`:
  ```ts
  selectedClipIds: string[];          // replaces selectedClipId
  tool: "select" | "blade";
  setTool(tool: "select" | "blade"): void;
  selectClips(ids: string[]): void;
  toggleClipSelection(id: string): void;
  clearSelection(): void;
  addTrackAt(orderIndex: number): Track;   // returns the created track
  ensureTrackForImport(): Track;           // first track with no clips, else a new one
  ```
  `removeTrack` must also drop the removed track's clips from the selection.

- [ ] **Step 1: Write the failing test**

Extend the existing file:

```ts
it("replaces the selection with selectClips", () => {
  useProjectStore.getState().selectClips(["a", "b"]);
  expect(useProjectStore.getState().selectedClipIds).toEqual(["a", "b"]);
});

it("toggles a clip in and out of the selection", () => {
  useProjectStore.getState().selectClips(["a"]);
  useProjectStore.getState().toggleClipSelection("b");
  expect(useProjectStore.getState().selectedClipIds).toEqual(["a", "b"]);
  useProjectStore.getState().toggleClipSelection("a");
  expect(useProjectStore.getState().selectedClipIds).toEqual(["b"]);
});

it("drops deleted clips from the selection when a track is removed", () => {
  useProjectStore.setState({
    tracks: [{ id: "t1", name: "A", orderIndex: 0, color: "", volume: 1, pan: 0, muted: false, soloed: false }],
    clips: [{ id: "c1", trackId: "t1", mediaId: "m", startTime: 0, sourceOffset: 0, duration: 1, name: "c", gain: 1, fadeIn: 0, fadeOut: 0 }],
    selectedClipIds: ["c1"],
  });
  useProjectStore.getState().removeTrack("t1");
  expect(useProjectStore.getState().selectedClipIds).toEqual([]);
});

it("ensureTrackForImport reuses an empty track before creating one", () => {
  useProjectStore.setState({
    tracks: [{ id: "t1", name: "Piste 1", orderIndex: 0, color: "", volume: 1, pan: 0, muted: false, soloed: false }],
    clips: [], selectedClipIds: [],
  });
  expect(useProjectStore.getState().ensureTrackForImport().id).toBe("t1");
});

it("ensureTrackForImport creates a new track when every track is occupied", () => {
  useProjectStore.setState({
    tracks: [{ id: "t1", name: "Piste 1", orderIndex: 0, color: "", volume: 1, pan: 0, muted: false, soloed: false }],
    clips: [{ id: "c1", trackId: "t1", mediaId: "m", startTime: 0, sourceOffset: 0, duration: 1, name: "c", gain: 1, fadeIn: 0, fadeOut: 0 }],
    selectedClipIds: [],
  });
  const track = useProjectStore.getState().ensureTrackForImport();
  expect(track.id).not.toBe("t1");
  expect(useProjectStore.getState().tracks).toHaveLength(2);
});

it("defaults the tool to select and switches to blade", () => {
  expect(useProjectStore.getState().tool).toBe("select");
  useProjectStore.getState().setTool("blade");
  expect(useProjectStore.getState().tool).toBe("blade");
});
```

Update the existing tests in the file that reference `selectedClipId` to use `selectedClipIds`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w apps/web -- projectStore`
Expected: FAIL — `selectClips` is not a function.

- [ ] **Step 3: Implement**

Rename `selectedClipId: string | null` to `selectedClipIds: string[]` and add the actions above. `ensureTrackForImport` finds the lowest-`orderIndex` track carrying no clips; if there is none it appends `Piste ${tracks.length + 1}` with `orderIndex: tracks.length` and returns it. This is what stops every import landing on track 1 (defect #2).

- [ ] **Step 4: Run tests**

Run: `npm test -w apps/web -- projectStore`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/store
git commit -m "feat(web): add multi-selection, tool mode and import track allocation"
```

---

## Task 12: Time ruler

**Files:**
- Create: `apps/web/src/components/TimeRuler.tsx`
- Create: `apps/web/src/lib/ticks.ts`
- Test: `apps/web/src/lib/ticks.test.ts`

**Interfaces:**
- Consumes: `gridInterval` (Task 6), `formatTime` from `../lib/time`.
- Produces:
  ```ts
  export interface Tick { time: number; label: string | null; major: boolean }
  export function computeTicks(pxPerSecond: number, widthPx: number): Tick[];
  // TimeRuler props: { pxPerSecond: number; widthPx: number; currentTime: number; onSeek: (t: number) => void }
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { computeTicks } from "./ticks";

describe("computeTicks", () => {
  it("covers the visible width and no more", () => {
    const ticks = computeTicks(100, 1000); // 10 s visible
    expect(ticks[0].time).toBe(0);
    expect(ticks[ticks.length - 1].time).toBeLessThanOrEqual(10.001);
  });

  it("keeps tick spacing readable at every zoom level", () => {
    for (const zoom of [20, 50, 100, 200, 400]) {
      const ticks = computeTicks(zoom, 1200);
      for (let i = 1; i < ticks.length; i++) {
        const gapPx = (ticks[i].time - ticks[i - 1].time) * zoom;
        expect(gapPx).toBeGreaterThanOrEqual(15);
      }
      expect(ticks.length).toBeLessThan(300);
    }
  });

  it("labels only major ticks", () => {
    const ticks = computeTicks(100, 1000);
    expect(ticks.some((t) => t.major && t.label !== null)).toBe(true);
    expect(ticks.every((t) => (t.label === null) === !t.major)).toBe(true);
  });

  it("returns just the origin for a zero width", () => {
    expect(computeTicks(100, 0)).toEqual([{ time: 0, label: "0:00.0", major: true }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w apps/web -- ticks`
Expected: FAIL — cannot resolve `./ticks`.

- [ ] **Step 3: Implement**

`computeTicks` walks from 0 to `widthPx / pxPerSecond` in `gridInterval(pxPerSecond)` steps, marking every 4th step major and labelling majors with `formatTime`. Guard the loop with a hard cap of 300 ticks. `TimeRuler` renders them as absolutely positioned `<div>`s in a `h-7` strip, plus the playhead handle, and calls `onSeek` on click using the same `pixelsToSeconds` helper the lanes use so the ruler and lanes never disagree.

- [ ] **Step 4: Run tests**

Run: `npm test -w apps/web -- ticks`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/ticks.ts apps/web/src/lib/ticks.test.ts apps/web/src/components/TimeRuler.tsx
git commit -m "feat(web): add time ruler"
```

---

## Task 13: Canvas clip rendering

Fixes defect #3 — the reason a cut clip still shows the whole file.

**Files:**
- Create: `apps/web/src/components/ClipView.tsx`
- Create: `apps/web/src/components/waveformPainter.ts`
- Test: `apps/web/src/components/waveformPainter.test.ts`
- Delete: `apps/web/src/components/ClipWaveform.tsx`

**Interfaces:**
- Consumes: `MediaLibrary.getPeaks` (Task 3).
- Produces:
  ```ts
  export function paintWaveform(
    canvas: HTMLCanvasElement, peaks: PeakData | null,
    opts: { width: number; height: number; color: string; dpr: number },
  ): void;
  export function fadePolygon(
    width: number, height: number, fadeInPx: number, fadeOutPx: number,
  ): Array<[number, number]>;
  ```
  `ClipView` props: `{ clip: Clip; pxPerSecond: number; library: MediaLibrary; laneHeight: number; selected: boolean; onPointerDown: (e, part: "body" | "left" | "right" | "fadeIn" | "fadeOut") => void; onContextMenu: (e) => void }`.

- [ ] **Step 1: Write the failing test**

`paintWaveform` needs a real 2D context, which jsdom lacks; test the pure geometry helper and the guard clauses instead.

```ts
import { describe, it, expect, vi } from "vitest";
import { paintWaveform, fadePolygon } from "./waveformPainter";

function fakeCanvas(width: number, height: number) {
  const calls: string[] = [];
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, prop) => {
      if (prop === "canvas") return canvas;
      return (...args: unknown[]) => { calls.push(`${String(prop)}(${args.join(",")})`); };
    },
    set: () => true,
  });
  const canvas = { width, height, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, calls };
}

describe("paintWaveform", () => {
  it("does nothing when peaks are not loaded yet", () => {
    const { canvas, calls } = fakeCanvas(100, 50);
    paintWaveform(canvas, null, { width: 100, height: 50, color: "#fff", dpr: 1 });
    expect(calls.some((c) => c.startsWith("fillRect"))).toBe(false);
  });

  it("sizes the backing store for the device pixel ratio", () => {
    const { canvas } = fakeCanvas(0, 0);
    const peaks = { min: new Float32Array([-1]), max: new Float32Array([1]) };
    paintWaveform(canvas, peaks, { width: 100, height: 50, color: "#fff", dpr: 2 });
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(100);
  });

  it("draws one column per peak bin", () => {
    const { canvas, calls } = fakeCanvas(0, 0);
    const peaks = { min: new Float32Array([-1, -0.5, 0]), max: new Float32Array([1, 0.5, 0]) };
    paintWaveform(canvas, peaks, { width: 3, height: 50, color: "#fff", dpr: 1 });
    expect(calls.filter((c) => c.startsWith("fillRect"))).toHaveLength(3);
  });
});

describe("fadePolygon", () => {
  it("is empty when there are no fades", () => {
    expect(fadePolygon(100, 50, 0, 0)).toEqual([]);
  });

  it("starts at the top-left when there is a fade-in", () => {
    const poly = fadePolygon(100, 50, 20, 0);
    expect(poly[0]).toEqual([0, 50]);
    expect(poly).toContainEqual([20, 0]);
  });

  it("clamps overlapping fades to the clip width", () => {
    const poly = fadePolygon(100, 50, 80, 80);
    for (const [x] of poly) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w apps/web -- waveformPainter`
Expected: FAIL — cannot resolve `./waveformPainter`.

- [ ] **Step 3: Implement**

`paintWaveform`: return early on `!peaks` or `width < 1`; set `canvas.width = width * dpr`; `ctx.scale(dpr, dpr)`; clear; then for each bin `i` draw `fillRect(i, mid - max[i] * mid, 1, (max[i] - min[i]) * mid || 1)`.

`fadePolygon` returns the points of the darkened triangle overlay, clamping `fadeInPx + fadeOutPx` to `width`.

`ClipView` renders an absolutely positioned div at `left: clip.startTime * pxPerSecond`, `width: clip.duration * pxPerSecond`, containing:
- a `<canvas>` painted in a `useEffect` keyed on `[clip.mediaId, clip.sourceOffset, clip.duration, pxPerSecond, laneHeight, selected]`, reading `library.getPeaks(clip.mediaId, clip.sourceOffset, clip.sourceOffset + clip.duration, Math.max(1, Math.round(width)))` — **this window is the fix for defect #3**;
- a `library.onChange` subscription so the canvas repaints when the buffer finishes loading;
- a "média manquant" placeholder when `library.failed(clip.mediaId)`;
- the clip name label;
- 6 px hit zones on the left and right edges (`part: "left" | "right"`) and 10 px corner handles at the top (`"fadeIn" | "fadeOut"`), each stopping propagation and calling `onPointerDown` with its part.

No `onDoubleClick` delete — that is defect #5, removed deliberately.

- [ ] **Step 4: Run tests**

Run: `npm test -w apps/web -- waveformPainter`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ClipView.tsx apps/web/src/components/waveformPainter.ts apps/web/src/components/waveformPainter.test.ts
git rm apps/web/src/components/ClipWaveform.tsx
git commit -m "feat(web): render clip waveforms on canvas windowed to the clip"
```

---

## Task 14: Timeline with shared scrolling and the blade tool

Fixes defects #4, #6 and #10 in one surface.

**Files:**
- Create: `apps/web/src/components/Timeline.tsx`
- Create: `apps/web/src/components/useClipDrag.ts`
- Test: `apps/web/src/components/useClipDrag.test.ts`
- Delete: `apps/web/src/components/TimelineCanvas.tsx`

**Interfaces:**
- Consumes: `snapTime`/`snapCandidates` (Task 6), `resolvePlacement` (Task 5), `moveClips`/`trimClip`/`splitClipsAt`/`setClipFade` (Task 10), `ClipView` (Task 13), `TimeRuler` (Task 12).
- Produces:
  ```ts
  export const LANE_HEIGHT = 112;
  export function laneIndexAt(y: number, laneHeight: number, laneCount: number): number;
  export function dragDestination(args: {
    pointerX: number; pointerY: number; originX: number; originY: number;
    originStart: number; originLaneIndex: number; pxPerSecond: number;
    laneHeight: number; laneCount: number;
  }): { laneIndex: number; startTime: number };
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { laneIndexAt, dragDestination, LANE_HEIGHT } from "./useClipDrag";

describe("laneIndexAt", () => {
  it("maps a y offset to its lane", () => {
    expect(laneIndexAt(0, 100, 3)).toBe(0);
    expect(laneIndexAt(150, 100, 3)).toBe(1);
    expect(laneIndexAt(250, 100, 3)).toBe(2);
  });
  it("clamps above the first and below the last lane", () => {
    expect(laneIndexAt(-500, 100, 3)).toBe(0);
    expect(laneIndexAt(9999, 100, 3)).toBe(2);
  });
});

describe("dragDestination", () => {
  const base = {
    originX: 100, originY: 50, originStart: 2, originLaneIndex: 0,
    pxPerSecond: 100, laneHeight: LANE_HEIGHT, laneCount: 3,
  };

  it("converts horizontal travel into a time delta", () => {
    const d = dragDestination({ ...base, pointerX: 350, pointerY: 50 });
    expect(d.startTime).toBeCloseTo(4.5); // 2 s + 250 px / 100
    expect(d.laneIndex).toBe(0);
  });

  it("changes lane on vertical travel — the v1 blocker", () => {
    const d = dragDestination({ ...base, pointerX: 100, pointerY: 50 + LANE_HEIGHT });
    expect(d.laneIndex).toBe(1);
    expect(d.startTime).toBeCloseTo(2);
  });

  it("never yields a negative start time", () => {
    expect(dragDestination({ ...base, pointerX: -9999, pointerY: 50 }).startTime).toBe(0);
  });

  it("clamps the lane to the available tracks", () => {
    expect(dragDestination({ ...base, pointerX: 100, pointerY: 50 + LANE_HEIGHT * 10 }).laneIndex).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w apps/web -- useClipDrag`
Expected: FAIL — cannot resolve `./useClipDrag`.

- [ ] **Step 3: Implement**

`dragDestination` computes `startTime = max(0, originStart + (pointerX - originX) / pxPerSecond)` and `laneIndex = clamp(originLaneIndex + round((pointerY - originY) / laneHeight), 0, laneCount - 1)`. Callers pass the result through `snapTime` (unless `Alt` is held) and then `moveClips`, which applies `resolvePlacement`.

`Timeline.tsx` owns the layout that ends the desync:

```tsx
<div className="flex-1 overflow-auto" ref={scrollRef}>
  <div style={{ width: contentWidth + HEADER_W }} className="relative">
    <div className="sticky top-0 z-20 flex">
      <div style={{ width: HEADER_W }} className="sticky left-0 z-30 bg-studio-panel" />
      <TimeRuler ... />
    </div>
    {sortedTracks.map((track, i) => (
      <div key={track.id} className="flex" style={{ height: LANE_HEIGHT }}>
        <div className="sticky left-0 z-10" style={{ width: HEADER_W }}><TrackHeader track={track} index={i} /></div>
        <div className="relative flex-1" data-lane={i}> {clips of this track → <ClipView/>} </div>
      </div>
    ))}
    <div className="pointer-events-none absolute inset-y-0 z-20 w-px bg-orange-400"
         style={{ left: HEADER_W + currentTime * pxPerSecond }} />
  </div>
</div>
```

Headers and lanes now live in one scroll container, so they cannot drift apart.

Pointer handling on the lane area:
- `tool === "blade"`: render a vertical blade line following the pointer; on click call `splitClipsAt([clipIdUnderPointer], timeAtPointer)`.
- `tool === "select"`: `pointerdown` on a clip selects it (`Shift` toggles) and starts a drag via `dragDestination`; `pointerdown` on empty lane background starts a rubber-band rectangle that selects every intersecting clip on release, and a plain click with no drag seeks.
- Parts `"left"`/`"right"` call `trimClip`; `"fadeIn"`/`"fadeOut"` call `setClipFade`.
- Use pointer events with `setPointerCapture`, and `window.addEventListener("pointerup", …, { once: true })` for teardown.

- [ ] **Step 4: Run tests**

Run: `npm test -w apps/web -- useClipDrag`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/Timeline.tsx apps/web/src/components/useClipDrag.ts apps/web/src/components/useClipDrag.test.ts
git rm apps/web/src/components/TimelineCanvas.tsx
git commit -m "feat(web): rebuild timeline with shared scroll, blade tool and cross-track drag"
```

---

## Task 15: Clip context menu

**Files:**
- Create: `apps/web/src/components/ClipContextMenu.tsx`
- Modify: `apps/web/src/components/Timeline.tsx`

**Interfaces:**
- Consumes: `splitClipsAt`, `deleteClips`, `duplicateClips`, `setClipFade`, `setClipGain` (Task 10).
- Produces: `<ClipContextMenu x={number} y={number} clipIds={string[]} playhead={number} onClose={() => void} />`.

- [ ] **Step 1: Build the menu**

A fixed-position panel at `(x, y)`, closed on outside click or `Escape`. Entries, in French:
`Couper à la tête de lecture` (disabled when the playhead is outside every selected clip) · `Dupliquer` · `Supprimer` · `Fondu d'entrée 0,5 s` · `Fondu de sortie 0,5 s` · `Retirer les fondus`.

Wire `onContextMenu` on `ClipView` to `e.preventDefault()`, select the clip if it is not already selected, and open the menu at the cursor.

- [ ] **Step 2: Verify manually**

Run `npm run dev:web`, right-click a clip, confirm every entry acts on the whole selection and that a single `Ctrl+Z` reverses it.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components
git commit -m "feat(web): add clip context menu"
```

---

## Task 16: Track header with arm and level meter

**Files:**
- Create: `apps/web/src/components/LevelMeter.tsx`
- Modify: `apps/web/src/components/TrackHeader.tsx`
- Modify: `apps/web/src/components/TrackList.tsx` (fold into `Timeline`; keep only the "Ajouter une piste" button, moved to the toolbar)

**Interfaces:**
- Consumes: `AudioEngine.trackLevel` (Task 8), `recordingMachine` state (Task 7).
- Produces: `<LevelMeter level={number} />` (0..1, segmented bar), and `TrackHeader` gains props `{ armed: boolean; onToggleArm: () => void; level: number }`.

- [ ] **Step 1: Implement**

Add a REC button to the header, styled like the existing Mute/Solo buttons (`aria-pressed`, red when armed). Add a thin vertical `LevelMeter` beside the volume slider. Drive the level from a single `requestAnimationFrame` loop in `App.tsx` that samples `engine.trackLevel(id)` for every track and writes to a `useState` map — one loop for the whole app, not one per header.

The header must fit `LANE_HEIGHT` (112 px) exactly, or lanes and headers will disagree again. Compress the v1 layout: name + buttons on one row, volume with meter on the second, pan on the third, Mute/Solo/REC on the fourth.

- [ ] **Step 2: Verify manually**

Headers align with their lanes at every scroll position and zoom level.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components
git commit -m "feat(web): add track arming and level metering"
```

---

## Task 17: Armed recording with count-in and live waveform

Fixes defect #7.

**Files:**
- Modify: `apps/web/src/audio/record.ts`
- Modify: `apps/web/src/audio/record.test.ts`
- Create: `apps/web/src/components/RecordCountdown.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `recordingMachine` (Task 7), `resolvePlacement` (Task 5).
- Produces:
  ```ts
  export class MicRecorder {
    static open(ctx: AudioContext): Promise<MicRecorder>;  // getUserMedia + analyser
    level(): number;                 // live, valid from open() onward
    start(): void;
    stop(): Promise<Blob>;
    close(): void;                   // releases the stream
    isRecording(): boolean;
  }
  export function pickMimeType(): string;   // negotiated MediaRecorder type
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { pickMimeType } from "./record";

describe("pickMimeType", () => {
  it("prefers opus when supported", () => {
    vi.stubGlobal("MediaRecorder", { isTypeSupported: (t: string) => t === "audio/webm;codecs=opus" });
    expect(pickMimeType()).toBe("audio/webm;codecs=opus");
  });

  it("falls back to plain webm", () => {
    vi.stubGlobal("MediaRecorder", { isTypeSupported: (t: string) => t === "audio/webm" });
    expect(pickMimeType()).toBe("audio/webm");
  });

  it("returns an empty string when nothing is supported, letting the browser choose", () => {
    vi.stubGlobal("MediaRecorder", { isTypeSupported: () => false });
    expect(pickMimeType()).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w apps/web -- record`
Expected: FAIL — `pickMimeType` is not exported.

- [ ] **Step 3: Implement**

`MicRecorder.open` calls `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })`, builds a `MediaStreamAudioSourceNode` into an `AnalyserNode` (never connected to `destination` — that is the feedback guard), and keeps a `MediaRecorder` ready. `level()` returns the analyser RMS, so the meter is live from arming onward, before any recording starts.

In `App.tsx`, drive the machine:
- REC on a header → `ARM` → `MicRecorder.open` → header meter goes live.
- Toolbar Record → `START_COUNT`; a 1 s interval dispatches `TICK`; `RecordCountdown` renders the full-screen 3/2/1 with a Cancel button wired to `CANCEL`.
- At `remaining === 0` → `recorder.start()`, `transport.play()`, `BEGIN` with `startedAt: transport.getCurrentTime()`.
- While recording, a RAF loop appends `recorder.level()` samples to a `Float32Array` ring rendered as the live waveform in the armed lane, plus an elapsed timer.
- Stop → `recorder.stop()` → `File` → upload → decode → `addClip` at `resolvePlacement(clips, armedTrackId, startedAt, duration)` → `STOP` (stays armed for a retake).
- Every failure path shows a toast and dispatches `DISARM`.

- [ ] **Step 4: Run tests**

Run: `npm test -w apps/web -- record`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/audio/record.ts apps/web/src/audio/record.test.ts apps/web/src/components/RecordCountdown.tsx apps/web/src/App.tsx
git commit -m "feat(web): add armed recording with count-in and live metering"
```

---

## Task 18: Import onto its own track, and export with gain and fades

Fixes defect #2 and completes the mixdown.

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/audio/export.ts`
- Modify: `apps/web/src/audio/export.test.ts`

**Interfaces:**
- Consumes: `ensureTrackForImport` (Task 11), `resolvePlacement` (Task 5), `MediaLibrary` (Task 3), `computeSchedule`/`audibleTracks` (Task 4).
- Produces: `renderMixdown(clips, tracks, library, sampleRate): Promise<AudioBuffer>` — note the signature changes from a URL resolver to the library.

- [ ] **Step 1: Write the failing test**

```ts
it("places each imported file on its own track at the playhead", () => {
  // Pure part of the import flow, extracted so it is testable without a File.
  useProjectStore.setState({ tracks: [], clips: [], media: [], selectedClipIds: [], hydrated: true });
  const a = useProjectStore.getState().ensureTrackForImport();
  useProjectStore.getState().addClip({
    id: "c1", trackId: a.id, mediaId: "m1", startTime: 0, sourceOffset: 0,
    duration: 3, name: "a", gain: 1, fadeIn: 0, fadeOut: 0,
  });
  const b = useProjectStore.getState().ensureTrackForImport();
  expect(b.id).not.toBe(a.id);
});
```

Plus, in `export.test.ts`, keep the existing WAV-header assertions and add:

```ts
it("encodes silence for an empty project without throwing", async () => {
  const buffer = await renderMixdown([], [], { get: () => null, preload: async () => {} } as never, 44100);
  expect(buffer.duration).toBe(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w apps/web -- export projectStore`
Expected: FAIL — `renderMixdown` still expects a URL resolver.

- [ ] **Step 3: Implement**

`handleImport` becomes: decode → upload → `addMedia` → `track = ensureTrackForImport()` → `startTime = resolvePlacement(clips, track.id, transport.getCurrentTime(), buffer.duration)` → `addClip`. Multiple files dropped at once are imported sequentially so each gets its own track.

`renderMixdown` builds an `OfflineAudioContext` of length `projectDuration(clips)`, then for each clip on an audible track: source → clip gain (with the same fade ramps as the transport) → track gain → panner → destination. Returns a zero-length buffer for an empty project rather than throwing.

- [ ] **Step 4: Run tests**

Run: `npm test -w apps/web`
Expected: PASS across the suite.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): import onto a free track and render mixdown with gain and fades"
```

---

## Task 19: Wire the app together

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/Toolbar.tsx`
- Modify: `apps/web/src/components/TransportBar.tsx`
- Modify: `apps/web/src/lib/keyboard.ts`
- Modify: `apps/web/src/lib/keyboard.test.ts`
- Modify: `apps/web/src/audio/useEngineSync.ts`
- Modify: `apps/web/package.json` (drop `wavesurfer.js`)
- Modify: `apps/web/src/components/GuidedTour.tsx` (retarget `data-tour` anchors)

- [ ] **Step 1: Extend the keyboard test**

```ts
it("maps V to the select tool and C to the blade", () => { /* assert onSelectTool / onBladeTool fire */ });
it("ignores shortcuts while a text input has focus", () => { /* existing behaviour, keep */ });
it("maps Ctrl+D to duplicate and Ctrl+A to select all", () => { /* assert handlers fire */ });
```

- [ ] **Step 2: Implement**

- `App.tsx`: create `audioCtx`, `engine`, `library`, `transport` once at module scope; add a one-shot `pointerdown`/`keydown` listener calling `engine.unlock()`; subscribe `useProjectStore` so every change calls `transport.setProject(clips, tracks)` and `library.preload(mediaIds)`; wire `transport.onEnded` to clear `isPlaying`; run the single metering RAF loop.
- `Toolbar`: add the Select/Blade tool toggle, "Couper à la tête de lecture", "Ajouter une piste", and keep import/record/export/zoom/save-status.
- `keyboard.ts`: add `onSelectTool`, `onBladeTool`, `onDuplicate`, `onSelectAll`; keep Space/Delete/S/Ctrl+Z/Ctrl+Shift+Z.
- `useEngineSync`: unchanged behaviour, but read `audibleTracks` so mute/solo logic lives in one place.
- Remove `wavesurfer.js` from `package.json` and run `npm install` to update the lockfile.

- [ ] **Step 3: Run the full suite and a production build**

```bash
npm test
npm run build
```
Expected: all tests pass; `tsc -b` reports no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(web): wire v2 editing surface and drop wavesurfer"
```

---

## Task 20: Manual verification

No step here is complete on the strength of a passing unit test. Each one must be **observed**.

- [ ] **Step 1: Start the app**

```bash
npm run dev:server   # :3000
npm run dev:web      # :5173
```

- [ ] **Step 2: Walk the spec's acceptance path**

1. Import two audio files → they land on two different tracks, neither overlapping.
2. Press Play → sound comes out **on the first click**, and the playhead tracks it.
3. Let it run past the last clip → playback stops on its own.
4. Switch to the blade (`C`), cut a clip → two halves, each showing **its own** portion of the waveform.
5. Drag one half onto another track → it changes track, snaps, never overlaps; `Ctrl+Z` restores it in one step.
6. Trim an edge, add a fade → the fade is visible and audible.
7. Arm a track → the meter moves when you speak, **before** recording.
8. Record → 3-2-1 count-in, live waveform, elapsed timer; stop → the clip lands at the playhead on the armed track.
9. Export → the downloaded WAV plays back with the same mix.
10. Reload the page → the project comes back exactly as left.

- [ ] **Step 3: Fix whatever fails, then repeat step 2 from the top**

- [ ] **Step 4: Commit any fixes**

---

## Task 21: Ship

- [ ] **Step 1: Merge to main**

```bash
git checkout main && git merge --no-ff feat/v2-editing-core
```

- [ ] **Step 2: Push and watch the deploy**

```bash
git push origin main
gh run watch
```

- [ ] **Step 3: Verify production**

Load the deployed domain, confirm the app boots, import a file, press play, hear sound. Report the result honestly — including anything still rough.

---

## Self-Review

**Spec coverage.** Media library → T3. Engine + unlock → T8. Transport → T4/T9. Clip model → T1. Ruler → T12. Shared scroll → T14. Canvas waveforms → T13. Blade + select tools → T14. Snapping → T6. Cross-track drag → T14. Multi-select → T11/T14. Context menu → T15. No-overlap invariant → T5, enforced in T10/T17/T18. Recording → T7/T16/T17. Export → T18. Error handling → T3 (`failed`), T17 (toasts), T18. Tests → each task. Deployment → T21.

**Placeholders.** None: every code step carries real code or a precise algorithm, and every test step carries executable assertions.

**Type consistency.** `Clip` carries `gain`/`fadeIn`/`fadeOut` from T1 onward and every later fixture includes them. `selectedClipIds` (T11) is used consistently in T10/T14/T15. `MediaLibrary` is passed as an object into `renderMixdown` (T18) matching the class from T3. `LANE_HEIGHT` is defined in T14 and consumed by T16.
