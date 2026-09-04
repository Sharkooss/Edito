# Clip Effects Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every clip a small retouching workshop — speed, pitch, gain, normalise, three-band EQ and reverb — audible while adjusting and faithfully reproduced in the mixdown, with real tooltips on every tool.

**Architecture:** Effects split by *when* they apply. Gain, EQ, reverb and varispeed are Web Audio nodes built per clip and created only when non-neutral. Pitch-preserving stretch and constant-duration transposition change the samples themselves, so they are rendered once into a cached derived buffer. Both time-stretch and pitch-shift derive from one WSOLA primitive. A single `buildClipChain` serves playback and export so the two cannot drift.

**Tech Stack:** React 19, Zustand 5, Vite 8, Vitest 3, Tailwind 3, Radix Tooltip, Web Audio API (`BiquadFilterNode`, `ConvolverNode`, `OfflineAudioContext`), Fastify 4 + better-sqlite3.

**Spec:** `docs/superpowers/specs/2026-09-04-edito-clip-effects-design.md`

## Global Constraints

- UI copy is French. Existing tone: `Importer un son`, `Couper ici`, `Piste 1`.
- Clip invariant, enforced at every write point: **clips on the same track never overlap.** Route every placement through `resolvePlacement` from `apps/web/src/audio/overlap.ts`.
- `clip.duration` is the **timeline** duration. The source window consumed is `duration × speed`.
- No new runtime dependencies. `@radix-ui/react-tooltip` is already installed.
- Ranges, exact: speed `0.25..4`, pitch `-24..24` semitones, EQ bands `-24..24` dB, reverb mix `0..1`, reverb size `0.1..5` seconds.
- Effects are persisted as JSON in a single `clip.effects` TEXT column. A missing, empty or corrupt value must normalise to neutral effects, never throw.
- Tests: `npm test -w apps/web` and `npm test -w apps/server` from the repo root.
- Never mark a task done with a failing or skipped test.

## File Structure

**New — pure logic (`apps/web/src/audio/`)**
| File | Responsibility |
|---|---|
| `effects.ts` | `ClipEffects` type, defaults, normalisation, and the derived maths (source window, stretch ratio, playback rate). Pure. |
| `timeStretch.ts` | WSOLA time-stretch over a `Float32Array`, plus an `AudioBuffer` wrapper. Pure. |
| `impulseResponse.ts` | Procedural reverb impulse generation and a per-size cache. |
| `processedAudio.ts` | Derived-buffer cache: resolves a clip to `(buffer, baseOffset, rate)`. |
| `clipChain.ts` | Builds the per-clip node chain. Shared by transport and export. |
| `normalize.ts` | Peak analysis of a clip window → the gain that brings it to 0 dBFS. Pure. |

**New — components (`apps/web/src/components/`)**
`Hint.tsx` (tooltip wrapper), `ClipInspector.tsx` (side panel), `inspector/EffectSlider.tsx` (one labelled control row).

**Modified**
`audio/scheduling.ts` (effects-aware windows), `audio/transport.ts` and `audio/export.ts` (use `clipChain`), `audio/clipEditing.ts` (effect mutators), `api/client.ts`, `store/projectStore.ts`, `components/Timeline.tsx` (effect marker), `components/Toolbar.tsx`, `components/TrackHeader.tsx`, `components/ClipView.tsx`, `App.tsx`, `main.tsx`, and server-side `db/schema.sql`, `db.ts`, `types.ts`, `routes/project.ts`.

---

## Task 1: Persist clip effects

**Files:**
- Modify: `apps/server/src/db/schema.sql`
- Modify: `apps/server/src/db.ts`
- Modify: `apps/server/src/types.ts`
- Modify: `apps/server/src/routes/project.ts`
- Modify: `apps/web/src/api/client.ts`
- Test: `apps/server/test/project.test.ts`

**Interfaces:**
- Produces: `Clip` DTO gains `effects: string` — a JSON string, defaulting to `"{}"`. The server stores and returns it verbatim; interpretation is entirely client-side (Task 2), which keeps the server free of audio semantics.

- [ ] **Step 1: Write the failing test**

Add to `apps/server/test/project.test.ts`. The file already defines `TRACK` and a `seedMedia()` helper — reuse them.

```ts
it("round-trips the clip effects payload verbatim", async () => {
  const app = buildApp();
  seedMedia();
  const effects = JSON.stringify({ speed: 0.5, pitch: -3, preservePitch: true });
  await app.inject({
    method: "PATCH",
    url: "/api/project",
    payload: {
      tracks: [TRACK],
      clips: [{
        id: "c1", trackId: "t1", mediaId: "m1", startTime: 0, sourceOffset: 0,
        duration: 2, name: "a", gain: 1, fadeIn: 0, fadeOut: 0, effects,
      }],
    },
  });
  const clip = (await app.inject({ method: "GET", url: "/api/project" })).json().clips[0];
  expect(clip.effects).toBe(effects);
});

it("defaults effects to an empty object when omitted", async () => {
  const app = buildApp();
  seedMedia();
  await app.inject({
    method: "PATCH",
    url: "/api/project",
    payload: {
      tracks: [TRACK],
      clips: [{
        id: "c1", trackId: "t1", mediaId: "m1", startTime: 0, sourceOffset: 0,
        duration: 2, name: "a",
      }],
    },
  });
  const clip = (await app.inject({ method: "GET", url: "/api/project" })).json().clips[0];
  expect(clip.effects).toBe("{}");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w apps/server`
Expected: FAIL — `clip.effects` is `undefined`.

- [ ] **Step 3: Implement**

In `schema.sql`, add to the `CREATE TABLE clip` body, after `fade_out`:

```sql
  effects TEXT NOT NULL DEFAULT '{}'
```

`db.ts` already has a `CLIP_COLUMNS_ADDED_AFTER_V1` list driving an idempotent `ALTER TABLE`. Append one entry so deployed databases pick the column up:

```ts
["effects", "TEXT NOT NULL DEFAULT '{}'"],
```

Add `effects: string` to the `Clip` interface in `apps/server/src/types.ts` and in `apps/web/src/api/client.ts`. In `routes/project.ts`, add `effects: { type: "string" }` to `clipSchema.properties`, map `effects: r.effects` in `rowToClip`, and add the column to the INSERT with `effects: c.effects ?? "{}"` alongside the existing `gain ?? 1` defaults.

- [ ] **Step 4: Run tests**

Run: `npm test -w apps/server`
Expected: PASS, including the pre-existing tests.

- [ ] **Step 5: Commit**

```bash
git add apps/server apps/web/src/api/client.ts
git commit -m "feat(server): persist per-clip effects payload"
```

---

## Task 2: Effects model and derived maths

The arithmetic every later task depends on. Getting the two speed modes right here is what keeps the timeline honest.

**Files:**
- Create: `apps/web/src/audio/effects.ts`
- Test: `apps/web/src/audio/effects.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ClipEq { low: number; mid: number; high: number }      // dB
  export interface ClipReverb { mix: number; size: number }               // 0..1, seconds
  export interface ClipEffects {
    speed: number; pitch: number; preservePitch: boolean;
    eq: ClipEq; reverb: ClipReverb;
  }
  export const DEFAULT_EFFECTS: ClipEffects;
  export const SPEED_RANGE: { min: 0.25; max: 4 };
  export const PITCH_RANGE: { min: -24; max: 24 };
  export const EQ_RANGE: { min: -24; max: 24 };
  export const REVERB_SIZE_RANGE: { min: 0.1; max: 5 };
  export function normalizeEffects(raw: unknown): ClipEffects;   // accepts a JSON string or object
  export function serializeEffects(fx: ClipEffects): string;
  export function isNeutral(fx: ClipEffects): boolean;
  export function needsOfflineRender(fx: ClipEffects): boolean;
  export function sourceWindow(timelineDuration: number, fx: ClipEffects): number;
  export function stretchRatio(fx: ClipEffects): number;
  export function playbackRate(fx: ClipEffects): number;
  export function durationForSpeed(duration: number, fromSpeed: number, toSpeed: number): number;
  export function semitonesFromSpeed(speed: number): number;
  export function hasEq(fx: ClipEffects): boolean;
  export function hasReverb(fx: ClipEffects): boolean;
  ```

The two modes, stated once so later tasks do not re-derive them:

| | tape (`preservePitch: false`) | preserved (`preservePitch: true`) |
|---|---|---|
| `needsOfflineRender` | `false` | `speed !== 1 \|\| pitch !== 0` |
| `sourceWindow` | `duration × speed` | `duration × speed` |
| `stretchRatio` | `1` (unused) | `2^(pitch/12) / speed` |
| `playbackRate` | `speed` | `2^(pitch/12)` |

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_EFFECTS, normalizeEffects, serializeEffects, isNeutral, needsOfflineRender,
  sourceWindow, stretchRatio, playbackRate, durationForSpeed, semitonesFromSpeed,
  hasEq, hasReverb,
} from "./effects";

const fx = (over = {}) => ({ ...DEFAULT_EFFECTS, ...over });

describe("normalizeEffects", () => {
  it("turns nothing into neutral effects", () => {
    for (const input of [undefined, null, "", "{}", {}, "not json", 42, []]) {
      expect(normalizeEffects(input)).toEqual(DEFAULT_EFFECTS);
    }
  });

  it("accepts a JSON string as well as an object", () => {
    expect(normalizeEffects('{"speed":2}').speed).toBe(2);
    expect(normalizeEffects({ speed: 2 }).speed).toBe(2);
  });

  it("fills missing fields from the defaults", () => {
    const n = normalizeEffects({ pitch: 5 });
    expect(n.pitch).toBe(5);
    expect(n.speed).toBe(1);
    expect(n.eq).toEqual({ low: 0, mid: 0, high: 0 });
    expect(n.reverb).toEqual({ mix: 0, size: 1.5 });
  });

  it("clamps out-of-range values instead of trusting them", () => {
    const n = normalizeEffects({
      speed: 99, pitch: -999, eq: { low: 500, mid: -500, high: 0 }, reverb: { mix: 4, size: 0 },
    });
    expect(n.speed).toBe(4);
    expect(n.pitch).toBe(-24);
    expect(n.eq.low).toBe(24);
    expect(n.eq.mid).toBe(-24);
    expect(n.reverb.mix).toBe(1);
    expect(n.reverb.size).toBe(0.1);
  });

  it("rejects non-finite numbers", () => {
    const n = normalizeEffects({ speed: NaN, pitch: Infinity });
    expect(n.speed).toBe(1);
    expect(n.pitch).toBe(0);
  });

  it("round-trips through serializeEffects", () => {
    const original = fx({ speed: 0.5, pitch: -3, reverb: { mix: 0.4, size: 2 } });
    expect(normalizeEffects(serializeEffects(original))).toEqual(original);
  });
});

describe("isNeutral / hasEq / hasReverb", () => {
  it("recognises untouched effects", () => {
    expect(isNeutral(DEFAULT_EFFECTS)).toBe(true);
    expect(hasEq(DEFAULT_EFFECTS)).toBe(false);
    expect(hasReverb(DEFAULT_EFFECTS)).toBe(false);
  });
  it("recognises each individual departure from neutral", () => {
    expect(isNeutral(fx({ speed: 1.5 }))).toBe(false);
    expect(isNeutral(fx({ pitch: 1 }))).toBe(false);
    expect(isNeutral(fx({ eq: { low: 3, mid: 0, high: 0 } }))).toBe(false);
    expect(isNeutral(fx({ reverb: { mix: 0.2, size: 1.5 } }))).toBe(false);
  });
  it("ignores reverb size while the mix is zero", () => {
    expect(isNeutral(fx({ reverb: { mix: 0, size: 4 } }))).toBe(true);
    expect(hasReverb(fx({ reverb: { mix: 0, size: 4 } }))).toBe(false);
  });
  it("flags a non-flat EQ", () => {
    expect(hasEq(fx({ eq: { low: 0, mid: -2, high: 0 } }))).toBe(true);
  });
});

describe("needsOfflineRender", () => {
  it("is never needed in tape mode", () => {
    expect(needsOfflineRender(fx({ preservePitch: false, speed: 0.5 }))).toBe(false);
    expect(needsOfflineRender(fx({ preservePitch: false, speed: 3 }))).toBe(false);
  });
  it("is needed for a speed or pitch change with pitch preserved", () => {
    expect(needsOfflineRender(fx({ preservePitch: true, speed: 0.5 }))).toBe(true);
    expect(needsOfflineRender(fx({ preservePitch: true, pitch: 2 }))).toBe(true);
  });
  it("is not needed when nothing is asked of it", () => {
    expect(needsOfflineRender(fx({ preservePitch: true }))).toBe(false);
  });
  it("ignores EQ and reverb, which are realtime", () => {
    expect(needsOfflineRender(fx({ eq: { low: 6, mid: 0, high: 0 }, reverb: { mix: 1, size: 2 } }))).toBe(false);
  });
});

describe("derived maths", () => {
  it("is the identity when nothing is set", () => {
    expect(sourceWindow(4, DEFAULT_EFFECTS)).toBeCloseTo(4);
    expect(stretchRatio(DEFAULT_EFFECTS)).toBeCloseTo(1);
    expect(playbackRate(DEFAULT_EFFECTS)).toBeCloseTo(1);
  });

  it("consumes more source when sped up, in both modes", () => {
    expect(sourceWindow(4, fx({ speed: 2 }))).toBeCloseTo(8);
    expect(sourceWindow(4, fx({ speed: 2, preservePitch: false }))).toBeCloseTo(8);
  });

  it("plays back at the speed in tape mode", () => {
    expect(playbackRate(fx({ preservePitch: false, speed: 2 }))).toBeCloseTo(2);
    expect(stretchRatio(fx({ preservePitch: false, speed: 2 }))).toBeCloseTo(1);
  });

  it("stretches instead of resampling when the pitch is preserved", () => {
    // Half speed: consume 2 s of source, stretch it x2, play at 1x -> 4 s timeline.
    const slow = fx({ preservePitch: true, speed: 0.5 });
    expect(stretchRatio(slow)).toBeCloseTo(2);
    expect(playbackRate(slow)).toBeCloseTo(1);
  });

  it("resamples by the pitch ratio and pre-stretches to cancel the duration change", () => {
    const up = fx({ preservePitch: true, pitch: 12 });
    expect(playbackRate(up)).toBeCloseTo(2);
    expect(stretchRatio(up)).toBeCloseTo(2);
  });

  it("keeps the timeline duration exact when speed and pitch combine", () => {
    // The invariant that makes the whole scheme work:
    //   sourceWindow x stretchRatio / playbackRate === timeline duration
    for (const speed of [0.25, 0.5, 1, 1.7, 4]) {
      for (const pitch of [-24, -7, 0, 5, 24]) {
        const e = fx({ preservePitch: true, speed, pitch });
        const timeline = (sourceWindow(4, e) * stretchRatio(e)) / playbackRate(e);
        expect(timeline).toBeCloseTo(4, 6);
      }
    }
  });

  it("keeps the source window constant when the speed changes", () => {
    // 4 s of timeline at 1x consumes 4 s of source; at 2x the same source is 2 s of timeline.
    expect(durationForSpeed(4, 1, 2)).toBeCloseTo(2);
    expect(durationForSpeed(2, 2, 0.5)).toBeCloseTo(8);
    expect(durationForSpeed(4, 1, 1)).toBeCloseTo(4);
  });

  it("reports the pitch that tape mode imposes", () => {
    expect(semitonesFromSpeed(1)).toBeCloseTo(0);
    expect(semitonesFromSpeed(2)).toBeCloseTo(12);
    expect(semitonesFromSpeed(0.5)).toBeCloseTo(-12);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w apps/web -- effects`
Expected: FAIL — cannot resolve `./effects`.

- [ ] **Step 3: Implement**

```ts
export interface ClipEq { low: number; mid: number; high: number }
export interface ClipReverb { mix: number; size: number }
export interface ClipEffects {
  speed: number;
  pitch: number;
  preservePitch: boolean;
  eq: ClipEq;
  reverb: ClipReverb;
}

export const SPEED_RANGE = { min: 0.25, max: 4 } as const;
export const PITCH_RANGE = { min: -24, max: 24 } as const;
export const EQ_RANGE = { min: -24, max: 24 } as const;
export const REVERB_SIZE_RANGE = { min: 0.1, max: 5 } as const;

export const DEFAULT_EFFECTS: ClipEffects = {
  speed: 1,
  pitch: 0,
  preservePitch: true,
  eq: { low: 0, mid: 0, high: 0 },
  reverb: { mix: 0, size: 1.5 },
};

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Accepts anything — a JSON string from the database, a partial object, or
 * garbage — and always yields valid effects. A corrupt payload must degrade to
 * a neutral clip, never lose the clip.
 */
export function normalizeEffects(raw: unknown): ClipEffects {
  let source: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        source = parsed as Record<string, unknown>;
      }
    } catch {
      /* neutral */
    }
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    source = raw as Record<string, unknown>;
  }

  const eq = (source.eq ?? {}) as Record<string, unknown>;
  const reverb = (source.reverb ?? {}) as Record<string, unknown>;

  return {
    speed: num(source.speed, DEFAULT_EFFECTS.speed, SPEED_RANGE.min, SPEED_RANGE.max),
    pitch: num(source.pitch, DEFAULT_EFFECTS.pitch, PITCH_RANGE.min, PITCH_RANGE.max),
    preservePitch:
      typeof source.preservePitch === "boolean"
        ? source.preservePitch
        : DEFAULT_EFFECTS.preservePitch,
    eq: {
      low: num(eq.low, 0, EQ_RANGE.min, EQ_RANGE.max),
      mid: num(eq.mid, 0, EQ_RANGE.min, EQ_RANGE.max),
      high: num(eq.high, 0, EQ_RANGE.min, EQ_RANGE.max),
    },
    reverb: {
      mix: num(reverb.mix, 0, 0, 1),
      size: num(reverb.size, DEFAULT_EFFECTS.reverb.size, REVERB_SIZE_RANGE.min, REVERB_SIZE_RANGE.max),
    },
  };
}

export function serializeEffects(fx: ClipEffects): string {
  return JSON.stringify(fx);
}

export function hasEq(fx: ClipEffects): boolean {
  return fx.eq.low !== 0 || fx.eq.mid !== 0 || fx.eq.high !== 0;
}

/** Reverb size alone is inaudible while the mix is closed. */
export function hasReverb(fx: ClipEffects): boolean {
  return fx.reverb.mix > 0;
}

export function isNeutral(fx: ClipEffects): boolean {
  return fx.speed === 1 && fx.pitch === 0 && !hasEq(fx) && !hasReverb(fx);
}

export function needsOfflineRender(fx: ClipEffects): boolean {
  return fx.preservePitch && (fx.speed !== 1 || fx.pitch !== 0);
}

/** Seconds of source audio a clip consumes for `timelineDuration` on screen. */
export function sourceWindow(timelineDuration: number, fx: ClipEffects): number {
  return timelineDuration * fx.speed;
}

const semitoneRatio = (semitones: number) => Math.pow(2, semitones / 12);

export function stretchRatio(fx: ClipEffects): number {
  if (!fx.preservePitch) return 1;
  return semitoneRatio(fx.pitch) / fx.speed;
}

export function playbackRate(fx: ClipEffects): number {
  return fx.preservePitch ? semitoneRatio(fx.pitch) : fx.speed;
}

/** New timeline duration that keeps the same source window after a speed change. */
export function durationForSpeed(duration: number, fromSpeed: number, toSpeed: number): number {
  if (toSpeed <= 0) return duration;
  return (duration * fromSpeed) / toSpeed;
}

/** How far tape mode transposes, for display next to the disabled pitch control. */
export function semitonesFromSpeed(speed: number): number {
  return 12 * Math.log2(speed);
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -w apps/web -- effects`
Expected: PASS (21 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/audio/effects.ts apps/web/src/audio/effects.test.ts
git commit -m "feat(web): add clip effects model and derived maths"
```

---

## Task 3: WSOLA time-stretch

The one DSP primitive. Both pitch-preserving speed change and constant-duration transposition are built from it.

**Files:**
- Create: `apps/web/src/audio/timeStretch.ts`
- Test: `apps/web/src/audio/timeStretch.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function timeStretch(input: Float32Array, ratio: number): Float32Array;
  export function stretchWindow(
    buffer: AudioBuffer, startSec: number, endSec: number, ratio: number,
    makeBuffer: (channels: number, length: number, sampleRate: number) => AudioBuffer,
  ): AudioBuffer;
  ```
  `timeStretch` returns a buffer of length `round(input.length × ratio)`. `ratio === 1` returns a copy. `stretchWindow` takes a buffer factory so it can be unit-tested without a real `AudioContext`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { timeStretch, stretchWindow } from "./timeStretch";

const SR = 8000;

function sine(seconds: number, freq: number, sampleRate = SR): Float32Array {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < out.length; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return out;
}

function rms(a: Float32Array, from = 0, to = a.length): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += a[i] * a[i];
  return Math.sqrt(sum / Math.max(1, to - from));
}

/** Zero crossings per second — a robust frequency estimate for a pure tone. */
function crossingRate(a: Float32Array, sampleRate = SR): number {
  let crossings = 0;
  // Skip the edges: overlap-add tapers there and would bias the count.
  const from = Math.floor(a.length * 0.2);
  const to = Math.floor(a.length * 0.8);
  for (let i = from + 1; i < to; i++) if (a[i - 1] < 0 !== a[i] < 0) crossings++;
  return (crossings * sampleRate) / (2 * (to - from));
}

describe("timeStretch", () => {
  it("returns a copy for a ratio of 1 without aliasing the input", () => {
    const input = sine(0.5, 440);
    const out = timeStretch(input, 1);
    expect(out).not.toBe(input);
    expect(out.length).toBe(input.length);
    expect(Array.from(out.slice(0, 50))).toEqual(Array.from(input.slice(0, 50)));
  });

  it("produces the requested length in both directions", () => {
    const input = sine(1, 440);
    expect(timeStretch(input, 2).length).toBe(input.length * 2);
    expect(timeStretch(input, 0.5).length).toBe(input.length / 2);
    // Extremes of the supported range: 2^(24/12)/0.25 = 16, and 2^(-24/12)/4 = 1/16.
    expect(timeStretch(input, 16).length).toBe(input.length * 16);
    expect(timeStretch(input, 1 / 16).length).toBe(Math.round(input.length / 16));
  });

  it("preserves pitch when stretching — the entire point", () => {
    const input = sine(1, 300);
    for (const ratio of [0.5, 2]) {
      const out = timeStretch(input, ratio);
      // Within 5%: WSOLA is not sample-exact but must not transpose.
      expect(crossingRate(out)).toBeGreaterThan(300 * 0.95);
      expect(crossingRate(out)).toBeLessThan(300 * 1.05);
    }
  });

  it("roughly preserves loudness", () => {
    const input = sine(1, 300);
    for (const ratio of [0.5, 1.5, 2]) {
      const out = timeStretch(input, ratio);
      const ref = rms(input);
      const got = rms(out, Math.floor(out.length * 0.2), Math.floor(out.length * 0.8));
      expect(got).toBeGreaterThan(ref * 0.7);
      expect(got).toBeLessThan(ref * 1.3);
    }
  });

  it("does not emit NaN or values outside the input range", () => {
    const out = timeStretch(sine(0.5, 300), 1.7);
    for (let i = 0; i < out.length; i++) {
      expect(Number.isFinite(out[i])).toBe(true);
      expect(Math.abs(out[i])).toBeLessThan(1.5);
    }
  });

  it("survives degenerate input", () => {
    expect(timeStretch(new Float32Array(0), 2).length).toBe(0);
    expect(timeStretch(sine(0.1, 300), 0).length).toBe(Math.round(0.1 * SR));
    expect(timeStretch(sine(0.1, 300), -1).length).toBe(Math.round(0.1 * SR));
    expect(timeStretch(sine(0.1, 300), NaN).length).toBe(Math.round(0.1 * SR));
    // Shorter than one analysis frame.
    expect(timeStretch(new Float32Array(64), 2).length).toBe(128);
  });
});

describe("stretchWindow", () => {
  function fakeBuffer(channels: Float32Array[], sampleRate = SR): AudioBuffer {
    return {
      numberOfChannels: channels.length,
      length: channels[0].length,
      sampleRate,
      duration: channels[0].length / sampleRate,
      getChannelData: (i: number) => channels[i],
    } as unknown as AudioBuffer;
  }
  const make = (channels: number, length: number, sampleRate: number) => {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: (i: number) => data[i],
    } as unknown as AudioBuffer;
  };

  it("reads only the requested window and scales its length by the ratio", () => {
    const buffer = fakeBuffer([sine(2, 300)]);
    const out = stretchWindow(buffer, 0.5, 1.5, 2, make);   // 1 s window, doubled
    expect(out.duration).toBeCloseTo(2, 1);
    expect(out.sampleRate).toBe(SR);
  });

  it("keeps every channel", () => {
    const buffer = fakeBuffer([sine(1, 300), sine(1, 300)]);
    expect(stretchWindow(buffer, 0, 1, 1.5, make).numberOfChannels).toBe(2);
  });

  it("clamps a window that runs past the end of the buffer", () => {
    const buffer = fakeBuffer([sine(1, 300)]);
    const out = stretchWindow(buffer, 0.5, 99, 1, make);
    expect(out.duration).toBeCloseTo(0.5, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w apps/web -- timeStretch`
Expected: FAIL — cannot resolve `./timeStretch`.

- [ ] **Step 3: Implement**

```ts
// WSOLA: overlap-add at a fixed synthesis hop, but each analysis frame is
// nudged within a search radius to the position whose waveform best continues
// the previous frame. That similarity search is what keeps the pitch intact —
// a plain overlap-add at the same hops would phase-cancel and sound hollow.
const FRAME = 1024;
const SYNTHESIS_HOP = FRAME >> 1; // 50 % overlap
const SEARCH_RADIUS = 256;

function hann(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  return w;
}

const WINDOW = hann(FRAME);

/**
 * Position near `ideal` whose samples best continue `target`, by normalised
 * cross-correlation.
 */
function bestOffset(input: Float32Array, ideal: number, target: Float32Array): number {
  const overlap = target.length;
  let bestPos = ideal;
  let bestScore = -Infinity;
  const from = Math.max(0, ideal - SEARCH_RADIUS);
  const to = Math.min(input.length - overlap, ideal + SEARCH_RADIUS);
  for (let pos = from; pos <= to; pos++) {
    let dot = 0;
    let energy = 0;
    for (let i = 0; i < overlap; i++) {
      const v = input[pos + i];
      dot += v * target[i];
      energy += v * v;
    }
    const score = dot / Math.sqrt(energy + 1e-9);
    if (score > bestScore) {
      bestScore = score;
      bestPos = pos;
    }
  }
  return bestPos;
}

export function timeStretch(input: Float32Array, ratio: number): Float32Array {
  if (input.length === 0) return new Float32Array(0);
  if (!Number.isFinite(ratio) || ratio <= 0) return input.slice();
  if (Math.abs(ratio - 1) < 1e-9) return input.slice();

  const outLength = Math.max(1, Math.round(input.length * ratio));
  // Too short to window: fall back to linear resampling, which is correct here
  // because there is not enough material for a similarity search to mean anything.
  if (input.length < FRAME) {
    const out = new Float32Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const src = i / ratio;
      const i0 = Math.floor(src);
      const frac = src - i0;
      const a = input[Math.min(i0, input.length - 1)];
      const b = input[Math.min(i0 + 1, input.length - 1)];
      out[i] = a + (b - a) * frac;
    }
    return out;
  }

  const out = new Float32Array(outLength);
  const norm = new Float32Array(outLength);
  const analysisHop = SYNTHESIS_HOP / ratio;
  const overlap = FRAME - SYNTHESIS_HOP;

  let target: Float32Array | null = null;
  let frame = 0;

  for (let synth = 0; synth < outLength; synth += SYNTHESIS_HOP, frame++) {
    const ideal = Math.min(input.length - FRAME, Math.round(frame * analysisHop));
    if (ideal < 0) break;
    const pos = target ? bestOffset(input, ideal, target) : Math.max(0, ideal);

    for (let i = 0; i < FRAME; i++) {
      const src = pos + i;
      const dst = synth + i;
      if (src >= input.length || dst >= outLength) break;
      out[dst] += input[src] * WINDOW[i];
      norm[dst] += WINDOW[i];
    }

    // What the input would naturally play next; the following frame is chosen
    // to match it as closely as possible.
    const tailStart = pos + SYNTHESIS_HOP;
    target =
      tailStart + overlap <= input.length ? input.subarray(tailStart, tailStart + overlap) : null;
  }

  for (let i = 0; i < outLength; i++) {
    if (norm[i] > 1e-6) out[i] /= norm[i];
  }
  return out;
}

export function stretchWindow(
  buffer: AudioBuffer,
  startSec: number,
  endSec: number,
  ratio: number,
  makeBuffer: (channels: number, length: number, sampleRate: number) => AudioBuffer,
): AudioBuffer {
  const sampleRate = buffer.sampleRate;
  const first = Math.max(0, Math.floor(startSec * sampleRate));
  const last = Math.min(buffer.length, Math.ceil(endSec * sampleRate));
  const span = Math.max(0, last - first);

  const stretched: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    stretched.push(timeStretch(buffer.getChannelData(c).subarray(first, last), ratio));
  }

  const length = stretched[0]?.length ?? Math.max(1, Math.round(span * ratio));
  const out = makeBuffer(buffer.numberOfChannels, Math.max(1, length), sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) out.getChannelData(c).set(stretched[c]);
  return out;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -w apps/web -- timeStretch`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/audio/timeStretch.ts apps/web/src/audio/timeStretch.test.ts
git commit -m "feat(web): add WSOLA time-stretch"
```

---

## Task 4: Reverb impulse responses

**Files:**
- Create: `apps/web/src/audio/impulseResponse.ts`
- Test: `apps/web/src/audio/impulseResponse.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function generateImpulseResponse(
    seconds: number, sampleRate: number,
    makeBuffer: (channels: number, length: number, sampleRate: number) => AudioBuffer,
  ): AudioBuffer;
  export class ImpulseCache {
    constructor(makeBuffer: (channels: number, length: number, sampleRate: number) => AudioBuffer, sampleRate: number);
    get(seconds: number): AudioBuffer;   // buckets to 0.1 s
    generatedCount(): number;            // for tests
  }
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { generateImpulseResponse, ImpulseCache } from "./impulseResponse";

const SR = 8000;
function makeBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  return {
    numberOfChannels: channels, length, sampleRate,
    duration: length / sampleRate,
    getChannelData: (i: number) => data[i],
  } as unknown as AudioBuffer;
}

describe("generateImpulseResponse", () => {
  it("is stereo and as long as requested", () => {
    const ir = generateImpulseResponse(2, SR, makeBuffer);
    expect(ir.numberOfChannels).toBe(2);
    expect(ir.duration).toBeCloseTo(2, 5);
  });

  it("decays — the tail is far quieter than the head", () => {
    const ir = generateImpulseResponse(1, SR, makeBuffer);
    const ch = ir.getChannelData(0);
    const head = ch.slice(0, 200).reduce((s, v) => s + Math.abs(v), 0) / 200;
    const tail = ch.slice(-200).reduce((s, v) => s + Math.abs(v), 0) / 200;
    expect(head).toBeGreaterThan(tail * 10);
  });

  it("keeps every sample finite and in range", () => {
    const ch = generateImpulseResponse(1, SR, makeBuffer).getChannelData(0);
    for (let i = 0; i < ch.length; i++) {
      expect(Number.isFinite(ch[i])).toBe(true);
      expect(Math.abs(ch[i])).toBeLessThanOrEqual(1);
    }
  });

  it("decorrelates the two channels so the reverb reads as stereo", () => {
    const ir = generateImpulseResponse(1, SR, makeBuffer);
    const [l, r] = [ir.getChannelData(0), ir.getChannelData(1)];
    let identical = true;
    for (let i = 0; i < 500; i++) if (l[i] !== r[i]) { identical = false; break; }
    expect(identical).toBe(false);
  });

  it("never produces an empty buffer", () => {
    expect(generateImpulseResponse(0, SR, makeBuffer).length).toBeGreaterThan(0);
  });
});

describe("ImpulseCache", () => {
  it("generates once per size and reuses afterwards", () => {
    const cache = new ImpulseCache(makeBuffer, SR);
    const a = cache.get(1.5);
    const b = cache.get(1.5);
    expect(b).toBe(a);
    expect(cache.generatedCount()).toBe(1);
  });

  it("buckets nearby sizes together — convolvers are expensive to build", () => {
    const cache = new ImpulseCache(makeBuffer, SR);
    cache.get(1.51);
    cache.get(1.54);
    expect(cache.generatedCount()).toBe(1);
  });

  it("generates separately for genuinely different sizes", () => {
    const cache = new ImpulseCache(makeBuffer, SR);
    cache.get(0.5);
    cache.get(3);
    expect(cache.generatedCount()).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w apps/web -- impulseResponse`
Expected: FAIL — cannot resolve `./impulseResponse`.

- [ ] **Step 3: Implement**

```ts
const DECAY_EXPONENT = 3;
/** Sizes are bucketed to this resolution so a slider drag reuses one impulse. */
const SIZE_BUCKET = 0.1;

/**
 * Exponentially decaying noise. Cheap, needs no asset files, and sounds like a
 * plausible room — which is all a per-clip reverb needs.
 */
export function generateImpulseResponse(
  seconds: number,
  sampleRate: number,
  makeBuffer: (channels: number, length: number, sampleRate: number) => AudioBuffer,
): AudioBuffer {
  const length = Math.max(1, Math.floor(Math.max(0.01, seconds) * sampleRate));
  const buffer = makeBuffer(2, length, sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      const decay = Math.pow(1 - i / length, DECAY_EXPONENT);
      data[i] = (Math.random() * 2 - 1) * decay;
    }
  }
  return buffer;
}

export class ImpulseCache {
  private makeBuffer: (channels: number, length: number, sampleRate: number) => AudioBuffer;
  private sampleRate: number;
  private cache = new Map<number, AudioBuffer>();
  private generated = 0;

  constructor(
    makeBuffer: (channels: number, length: number, sampleRate: number) => AudioBuffer,
    sampleRate: number,
  ) {
    this.makeBuffer = makeBuffer;
    this.sampleRate = sampleRate;
  }

  get(seconds: number): AudioBuffer {
    const bucket = Math.round(seconds / SIZE_BUCKET);
    let ir = this.cache.get(bucket);
    if (!ir) {
      ir = generateImpulseResponse(bucket * SIZE_BUCKET, this.sampleRate, this.makeBuffer);
      this.cache.set(bucket, ir);
      this.generated++;
    }
    return ir;
  }

  generatedCount(): number {
    return this.generated;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -w apps/web -- impulseResponse`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/audio/impulseResponse.ts apps/web/src/audio/impulseResponse.test.ts
git commit -m "feat(web): add procedural reverb impulse responses"
```

---

## Task 5: Gain normalisation

**Files:**
- Create: `apps/web/src/audio/normalize.ts`
- Test: `apps/web/src/audio/normalize.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const MAX_NORMALIZE_GAIN = 4;
  export function windowPeak(buffer: AudioBuffer, startSec: number, endSec: number): number;
  export function normalizeGain(peak: number): number | null;   // null when there is nothing to normalise
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { windowPeak, normalizeGain, MAX_NORMALIZE_GAIN } from "./normalize";

function buffer(samples: Float32Array, sampleRate = 100): AudioBuffer {
  return {
    numberOfChannels: 1, length: samples.length, sampleRate,
    duration: samples.length / sampleRate,
    getChannelData: () => samples,
  } as unknown as AudioBuffer;
}

describe("windowPeak", () => {
  it("finds the loudest absolute sample in the window", () => {
    const s = new Float32Array(100);
    s[10] = 0.4;
    s[80] = -0.9;
    expect(windowPeak(buffer(s), 0, 1)).toBeCloseTo(0.9);
  });

  it("ignores samples outside the window", () => {
    const s = new Float32Array(100);
    s[10] = 0.9;   // first half only
    s[60] = 0.2;
    expect(windowPeak(buffer(s), 0.5, 1)).toBeCloseTo(0.2);
  });

  it("is zero for silence", () => {
    expect(windowPeak(buffer(new Float32Array(100)), 0, 1)).toBe(0);
  });

  it("clamps a window running past the buffer", () => {
    const s = new Float32Array(100);
    s[99] = 0.5;
    expect(windowPeak(buffer(s), 0, 99)).toBeCloseTo(0.5);
  });
});

describe("normalizeGain", () => {
  it("brings a -6 dB peak up to full scale", () => {
    // -6 dB is a peak of about 0.5, so it needs roughly 2x.
    expect(normalizeGain(0.5)).toBeCloseTo(2);
  });

  it("leaves an already-peaking clip alone", () => {
    expect(normalizeGain(1)).toBeCloseTo(1);
  });

  it("attenuates a clip that exceeds full scale", () => {
    expect(normalizeGain(2)).toBeCloseTo(0.5);
  });

  it("refuses to normalise silence rather than applying infinite gain", () => {
    expect(normalizeGain(0)).toBeNull();
  });

  it("caps the boost so a near-silent passage does not amplify its own hiss", () => {
    expect(normalizeGain(0.0001)).toBe(MAX_NORMALIZE_GAIN);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w apps/web -- normalize`
Expected: FAIL — cannot resolve `./normalize`.

- [ ] **Step 3: Implement**

```ts
/** Ceiling on automatic boost: without it, a near-silent take amplifies its own noise floor. */
export const MAX_NORMALIZE_GAIN = 4;
const SILENCE_THRESHOLD = 1e-5;

export function windowPeak(buffer: AudioBuffer, startSec: number, endSec: number): number {
  const first = Math.max(0, Math.floor(startSec * buffer.sampleRate));
  const last = Math.min(buffer.length, Math.ceil(endSec * buffer.sampleRate));
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = first; i < last; i++) {
      const v = Math.abs(data[i]);
      if (v > peak) peak = v;
    }
  }
  return peak;
}

/** Gain that brings `peak` to full scale, or null when there is nothing to lift. */
export function normalizeGain(peak: number): number | null {
  if (!Number.isFinite(peak) || peak <= SILENCE_THRESHOLD) return null;
  return Math.min(MAX_NORMALIZE_GAIN, 1 / peak);
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -w apps/web -- normalize`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/audio/normalize.ts apps/web/src/audio/normalize.test.ts
git commit -m "feat(web): add clip peak normalisation"
```

---

## Task 6: Effects-aware scheduling

`computeSchedule` currently assumes one source second equals one timeline second. With speed that stops being true, so the schedule must work in the timeline domain and hand the source conversion downstream.

**Files:**
- Modify: `apps/web/src/audio/scheduling.ts`
- Modify: `apps/web/src/audio/scheduling.test.ts`

**Interfaces:**
- Consumes: `normalizeEffects`, `sourceWindow`, `playbackRate` (Task 2).
- Produces:
  ```ts
  export interface ScheduleEntry {
    clipId: string; trackId: string; mediaId: string;
    when: number;      // seconds from now
    elapsed: number;   // timeline seconds already consumed inside the clip
    duration: number;  // timeline seconds still to play
    gain: number; fadeIn: number; fadeOut: number;
    effects: ClipEffects;
  }
  ```
  The `offset` field is **removed**. Source position is now `baseOffset + elapsed × rate`, computed by `clipChain` (Task 8), because only it knows whether the buffer is the original or a derived one.

- [ ] **Step 1: Write the failing test**

Replace the `computeSchedule` block in `scheduling.test.ts`. Keep the existing `projectDuration` and `audibleTracks` blocks untouched, and add `effects: "{}"` to the `clip` factory.

```ts
describe("computeSchedule", () => {
  it("delays a clip that starts after the playhead", () => {
    const [e] = computeSchedule([clip({ startTime: 3 })], 1, durations);
    expect(e.when).toBeCloseTo(2);
    expect(e.elapsed).toBeCloseTo(0);
    expect(e.duration).toBeCloseTo(4);
  });

  it("reports how far into a clip the playhead already is", () => {
    const [e] = computeSchedule([clip({ startTime: 2, sourceOffset: 1, duration: 6 })], 5, durations);
    expect(e.when).toBeCloseTo(0);
    expect(e.elapsed).toBeCloseTo(3);
    expect(e.duration).toBeCloseTo(3);
  });

  it("skips clips that finished before the playhead", () => {
    expect(computeSchedule([clip({ startTime: 0, duration: 2 })], 5, durations)).toEqual([]);
  });

  it("clamps a clip window that runs past the end of its source", () => {
    // Source is 10 s; from offset 6 only 4 s remain at 1x.
    const [e] = computeSchedule([clip({ sourceOffset: 6, duration: 8 })], 0, durations);
    expect(e.duration).toBeCloseTo(4);
  });

  it("clamps in timeline seconds, accounting for speed", () => {
    // Source 10 s, offset 6 -> 4 s of source left. At 2x that is only 2 s of timeline.
    const fast = clip({ sourceOffset: 6, duration: 8, effects: JSON.stringify({ speed: 2 }) });
    expect(computeSchedule([fast], 0, durations)[0].duration).toBeCloseTo(2);
    // At 0.5x the same 4 s of source stretches to 8 s of timeline, so nothing is clipped.
    const slow = clip({ sourceOffset: 6, duration: 8, effects: JSON.stringify({ speed: 0.5 }) });
    expect(computeSchedule([slow], 0, durations)[0].duration).toBeCloseTo(8);
  });

  it("skips clips whose media length is unknown", () => {
    expect(computeSchedule([clip({ mediaId: "ghost" })], 0, durations)).toEqual([]);
  });

  it("carries gain, fades and normalised effects through", () => {
    const [e] = computeSchedule(
      [clip({ gain: 0.4, fadeIn: 0.5, fadeOut: 1, effects: '{"pitch":7}' })],
      0, durations,
    );
    expect(e.gain).toBe(0.4);
    expect(e.fadeIn).toBe(0.5);
    expect(e.fadeOut).toBe(1);
    expect(e.effects.pitch).toBe(7);
    expect(e.effects.speed).toBe(1);   // filled from the defaults
  });

  it("normalises a corrupt effects payload instead of failing", () => {
    const [e] = computeSchedule([clip({ effects: "not json" })], 0, durations);
    expect(e.effects.speed).toBe(1);
  });
});
```

Also update `projectDuration`'s block to keep passing — it reads `startTime + duration`, both timeline values, so it needs no change.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w apps/web -- scheduling`
Expected: FAIL — `e.elapsed` is `undefined`.

- [ ] **Step 3: Implement**

Replace `computeSchedule`. The clamp is the subtle part: the remaining source is measured in source seconds, so it must be divided by `speed` before being compared with a timeline duration.

```ts
import type { Clip, Track } from "../api/client";
import { normalizeEffects, type ClipEffects } from "./effects";

export interface ScheduleEntry {
  clipId: string;
  trackId: string;
  mediaId: string;
  when: number;
  elapsed: number;
  duration: number;
  gain: number;
  fadeIn: number;
  fadeOut: number;
  effects: ClipEffects;
}

export function computeSchedule(
  clips: Clip[],
  playhead: number,
  sourceDurations: Map<string, number>,
): ScheduleEntry[] {
  const entries: ScheduleEntry[] = [];
  for (const clip of clips) {
    const sourceDuration = sourceDurations.get(clip.mediaId);
    if (sourceDuration === undefined) continue;

    const effects = normalizeEffects(clip.effects);
    const elapsed = Math.max(0, playhead - clip.startTime);
    const remaining = clip.duration - elapsed;
    if (remaining <= 0) continue;

    // Source left after the part already consumed, expressed back in timeline
    // seconds so it can be compared with `remaining`.
    const sourceConsumed = clip.sourceOffset + elapsed * effects.speed;
    const sourceLeft = sourceDuration - sourceConsumed;
    const playable = Math.min(remaining, sourceLeft / effects.speed);
    if (playable <= 0) continue;

    entries.push({
      clipId: clip.id,
      trackId: clip.trackId,
      mediaId: clip.mediaId,
      when: Math.max(0, clip.startTime - playhead),
      elapsed,
      duration: playable,
      gain: clip.gain,
      fadeIn: clip.fadeIn,
      fadeOut: clip.fadeOut,
      effects,
    });
  }
  return entries;
}
```

`projectDuration` and `audibleTracks` stay exactly as they are.

- [ ] **Step 4: Run tests**

Run: `npm test -w apps/web -- scheduling`
Expected: PASS (12 tests). `transport` and `export` will now fail to typecheck — Task 8 fixes them.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/audio/scheduling.ts apps/web/src/audio/scheduling.test.ts
git commit -m "feat(web): make scheduling effects-aware in the timeline domain"
```

---

## Task 7: Derived audio cache

Resolves a clip to the buffer that should actually be played, rendering a stretched version when the effects demand one.

**Files:**
- Create: `apps/web/src/audio/processedAudio.ts`
- Test: `apps/web/src/audio/processedAudio.test.ts`

**Interfaces:**
- Consumes: `MediaLibrary` (existing), `needsOfflineRender`/`sourceWindow`/`stretchRatio`/`playbackRate`/`normalizeEffects` (Task 2), `stretchWindow` (Task 3).
- Produces:
  ```ts
  export interface ResolvedAudio {
    buffer: AudioBuffer;
    /** Where the clip's audio begins inside `buffer`. */
    baseOffset: number;
    /** Rate to play it at; source seconds consumed per timeline second. */
    rate: number;
  }
  export class ProcessedAudio {
    constructor(library: MediaLibrary, makeBuffer: (channels: number, length: number, sampleRate: number) => AudioBuffer);
    key(clip: Clip): string;
    get(clip: Clip): ResolvedAudio | null;       // sync; null when not ready
    ensure(clip: Clip): Promise<ResolvedAudio | null>;
    preload(clips: Clip[]): Promise<void>;       // never rejects
    isRendering(clip: Clip): boolean;
    onChange(cb: () => void): () => void;
  }
  ```
  For a clip needing no render, `get` returns the source buffer with `baseOffset = clip.sourceOffset`. For a rendered clip it returns the derived buffer with `baseOffset = 0`. Either way the caller reads `baseOffset + elapsed × rate` for `duration × rate` seconds — one formula for both cases.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { ProcessedAudio } from "./processedAudio";
import type { Clip } from "../api/client";

const SR = 8000;
function makeBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  return {
    numberOfChannels: channels, length, sampleRate, duration: length / sampleRate,
    getChannelData: (i: number) => data[i],
  } as unknown as AudioBuffer;
}
function sourceBuffer(seconds: number): AudioBuffer {
  const b = makeBuffer(1, Math.round(seconds * SR), SR);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.sin((2 * Math.PI * 300 * i) / SR);
  return b;
}
const clip = (over: Partial<Clip> = {}): Clip => ({
  id: "c1", trackId: "t1", mediaId: "m1", startTime: 0, sourceOffset: 0, duration: 4,
  name: "c", gain: 1, fadeIn: 0, fadeOut: 0, effects: "{}", ...over,
});
function harness(seconds = 10) {
  const buffer = sourceBuffer(seconds);
  const library = {
    get: (id: string) => (id === "m1" ? buffer : null),
    load: vi.fn().mockResolvedValue(buffer),
    has: (id: string) => id === "m1",
  };
  return { buffer, processed: new ProcessedAudio(library as never, makeBuffer) };
}

describe("ProcessedAudio without a render", () => {
  it("hands back the source buffer untouched for a neutral clip", () => {
    const { processed, buffer } = harness();
    const r = processed.get(clip({ sourceOffset: 2 }))!;
    expect(r.buffer).toBe(buffer);
    expect(r.baseOffset).toBeCloseTo(2);
    expect(r.rate).toBeCloseTo(1);
  });

  it("uses varispeed for tape mode rather than rendering", () => {
    const { processed, buffer } = harness();
    const r = processed.get(clip({ effects: JSON.stringify({ preservePitch: false, speed: 2 }) }))!;
    expect(r.buffer).toBe(buffer);
    expect(r.rate).toBeCloseTo(2);
  });

  it("is null when the media has not loaded yet", () => {
    const { processed } = harness();
    expect(processed.get(clip({ mediaId: "ghost" }))).toBeNull();
  });
});

describe("ProcessedAudio with a render", () => {
  const slow = clip({ duration: 4, effects: JSON.stringify({ preservePitch: true, speed: 0.5 }) });

  it("is null until the render completes, then returns the derived buffer", async () => {
    const { processed, buffer } = harness();
    expect(processed.get(slow)).toBeNull();
    const r = (await processed.ensure(slow))!;
    expect(r.buffer).not.toBe(buffer);
    expect(r.baseOffset).toBe(0);
    expect(r.rate).toBeCloseTo(1);
    expect(processed.get(slow)).toBe(r);
  });

  it("produces a derived buffer whose length matches the timeline duration", async () => {
    const { processed } = harness();
    // 4 s timeline at 0.5x consumes 2 s of source, stretched x2 back to 4 s.
    const r = (await processed.ensure(slow))!;
    expect(r.buffer.duration).toBeCloseTo(4, 1);
  });

  it("renders once and reuses the result", async () => {
    const { processed } = harness();
    const a = await processed.ensure(slow);
    const b = await processed.ensure(slow);
    expect(b).toBe(a);
  });

  it("re-renders when the effects change but not when unrelated fields do", async () => {
    const { processed } = harness();
    const a = await processed.ensure(slow);
    const moved = { ...slow, startTime: 99, name: "renamed" };
    expect(await processed.ensure(moved)).toBe(a);
    const faster = { ...slow, effects: JSON.stringify({ preservePitch: true, speed: 0.75 }) };
    expect(await processed.ensure(faster)).not.toBe(a);
  });

  it("reports that a render is in flight", async () => {
    const { processed } = harness();
    const pending = processed.ensure(slow);
    expect(processed.isRendering(slow)).toBe(true);
    await pending;
    expect(processed.isRendering(slow)).toBe(false);
  });

  it("notifies subscribers when a render settles", async () => {
    const { processed } = harness();
    const cb = vi.fn();
    processed.onChange(cb);
    await processed.ensure(slow);
    expect(cb).toHaveBeenCalled();
  });

  it("preload never rejects on a missing media", async () => {
    const { processed } = harness();
    await expect(processed.preload([clip({ mediaId: "ghost" })])).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w apps/web -- processedAudio`
Expected: FAIL — cannot resolve `./processedAudio`.

- [ ] **Step 3: Implement**

```ts
import type { Clip } from "../api/client";
import type { MediaLibrary } from "./mediaLibrary";
import { stretchWindow } from "./timeStretch";
import {
  normalizeEffects, needsOfflineRender, sourceWindow, stretchRatio, playbackRate,
} from "./effects";

export interface ResolvedAudio {
  buffer: AudioBuffer;
  baseOffset: number;
  rate: number;
}

type MakeBuffer = (channels: number, length: number, sampleRate: number) => AudioBuffer;

/**
 * Resolves a clip to the buffer that should actually play.
 *
 * Clips needing no offline work pass straight through to the shared source
 * buffer, so the common case allocates nothing. Only pitch-preserving speed
 * changes and constant-duration transposition produce a derived buffer, cached
 * on the effect parameters that produced it.
 */
export class ProcessedAudio {
  private library: MediaLibrary;
  private makeBuffer: MakeBuffer;
  private rendered = new Map<string, ResolvedAudio>();
  private pending = new Map<string, Promise<ResolvedAudio | null>>();
  private listeners = new Set<() => void>();

  constructor(library: MediaLibrary, makeBuffer: MakeBuffer) {
    this.library = library;
    this.makeBuffer = makeBuffer;
  }

  /** Only the fields that change the rendered samples belong in the key. */
  key(clip: Clip): string {
    const fx = normalizeEffects(clip.effects);
    return [
      clip.mediaId,
      clip.sourceOffset.toFixed(4),
      clip.duration.toFixed(4),
      fx.speed,
      fx.pitch,
      fx.preservePitch,
    ].join("|");
  }

  get(clip: Clip): ResolvedAudio | null {
    const fx = normalizeEffects(clip.effects);
    if (!needsOfflineRender(fx)) {
      const buffer = this.library.get(clip.mediaId);
      if (!buffer) return null;
      return { buffer, baseOffset: clip.sourceOffset, rate: playbackRate(fx) };
    }
    return this.rendered.get(this.key(clip)) ?? null;
  }

  isRendering(clip: Clip): boolean {
    return this.pending.has(this.key(clip));
  }

  ensure(clip: Clip): Promise<ResolvedAudio | null> {
    const ready = this.get(clip);
    if (ready) return Promise.resolve(ready);

    const fx = normalizeEffects(clip.effects);
    if (!needsOfflineRender(fx)) {
      return this.library
        .load(clip.mediaId)
        .then((buffer) => ({ buffer, baseOffset: clip.sourceOffset, rate: playbackRate(fx) }))
        .catch(() => null);
    }

    const key = this.key(clip);
    let inFlight = this.pending.get(key);
    if (!inFlight) {
      inFlight = (async () => {
        try {
          const source = await this.library.load(clip.mediaId);
          const window = sourceWindow(clip.duration, fx);
          const derived = stretchWindow(
            source,
            clip.sourceOffset,
            clip.sourceOffset + window,
            stretchRatio(fx),
            this.makeBuffer,
          );
          const resolved: ResolvedAudio = {
            buffer: derived,
            baseOffset: 0,
            rate: playbackRate(fx),
          };
          this.rendered.set(key, resolved);
          return resolved;
        } catch {
          return null;
        } finally {
          this.pending.delete(key);
          this.emit();
        }
      })();
      this.pending.set(key, inFlight);
    }
    return inFlight;
  }

  async preload(clips: Clip[]): Promise<void> {
    await Promise.all(clips.map((c) => this.ensure(c).catch(() => null)));
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

Run: `npm test -w apps/web -- processedAudio`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/audio/processedAudio.ts apps/web/src/audio/processedAudio.test.ts
git commit -m "feat(web): add derived audio cache for stretched clips"
```

---

## Task 8: One clip chain for playback and export

Transport and export already duplicate the envelope logic. Four more effects would guarantee they drift, so this task extracts the chain and rewires both onto it.

**Files:**
- Create: `apps/web/src/audio/clipChain.ts`
- Test: `apps/web/src/audio/clipChain.test.ts`
- Modify: `apps/web/src/audio/transport.ts`
- Modify: `apps/web/src/audio/transport.test.ts`
- Modify: `apps/web/src/audio/export.ts`

**Interfaces:**
- Consumes: `ScheduleEntry` (Task 6), `ResolvedAudio` (Task 7), `ImpulseCache` (Task 4), `hasEq`/`hasReverb` (Task 2).
- Produces:
  ```ts
  export interface ChainContext {
    ctx: BaseAudioContext;
    impulses: ImpulseCache;
  }
  export function buildClipChain(
    chain: ChainContext, entry: ScheduleEntry, audio: ResolvedAudio,
    destination: AudioNode, startAt: number,
  ): AudioBufferSourceNode;
  ```
  Connects `source → [EQ] → clipGain → [dry/wet] → destination`, schedules the envelope, calls `source.start(startAt, audio.baseOffset + entry.elapsed × audio.rate, entry.duration × audio.rate)`, and returns the source so the caller can stop it.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { buildClipChain } from "./clipChain";
import { DEFAULT_EFFECTS } from "./effects";
import { ImpulseCache } from "./impulseResponse";
import type { ScheduleEntry } from "./scheduling";

function harness() {
  const created = { gain: 0, filter: 0, convolver: 0 };
  const started: Array<{ when: number; offset: number; duration: number }> = [];
  const param = () => ({ value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() });
  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    createGain: () => { created.gain++; return { gain: param(), connect: vi.fn(), disconnect: vi.fn() }; },
    createBiquadFilter: () => {
      created.filter++;
      return { type: "", frequency: param(), gain: param(), Q: param(), connect: vi.fn(), disconnect: vi.fn() };
    },
    createConvolver: () => { created.convolver++; return { buffer: null, connect: vi.fn(), disconnect: vi.fn() }; },
    createBufferSource: () => ({
      buffer: null, playbackRate: param(), connect: vi.fn(), stop: vi.fn(), onended: null,
      start: (when: number, offset: number, duration: number) => started.push({ when, offset, duration }),
    }),
  } as unknown as BaseAudioContext;
  const makeBuffer = (channels: number, length: number, sampleRate: number) =>
    ({ numberOfChannels: channels, length, sampleRate, duration: length / sampleRate,
       getChannelData: () => new Float32Array(length) }) as unknown as AudioBuffer;
  return {
    created, started,
    chain: { ctx, impulses: new ImpulseCache(makeBuffer, 44100) },
    destination: { name: "dest" } as unknown as AudioNode,
  };
}

const entry = (over: Partial<ScheduleEntry> = {}): ScheduleEntry => ({
  clipId: "c1", trackId: "t1", mediaId: "m1", when: 0, elapsed: 0, duration: 4,
  gain: 1, fadeIn: 0, fadeOut: 0, effects: DEFAULT_EFFECTS, ...over,
});
const audio = (over = {}) => ({
  buffer: { duration: 10 } as AudioBuffer, baseOffset: 0, rate: 1, ...over,
});

describe("buildClipChain source window", () => {
  it("plays from the base offset for the whole duration", () => {
    const h = harness();
    buildClipChain(h.chain, entry(), audio(), h.destination, 0);
    expect(h.started).toEqual([{ when: 0, offset: 0, duration: 4 }]);
  });

  it("advances into the source by elapsed x rate", () => {
    const h = harness();
    buildClipChain(h.chain, entry({ elapsed: 1, duration: 3 }), audio({ baseOffset: 2, rate: 2 }), h.destination, 0);
    // baseOffset 2 + 1 s elapsed x 2 = 4, reading 3 s of timeline x 2 = 6 s of source.
    expect(h.started).toEqual([{ when: 0, offset: 4, duration: 6 }]);
  });
});

describe("buildClipChain node economy", () => {
  it("creates no filters and no convolver for a neutral clip", () => {
    const h = harness();
    buildClipChain(h.chain, entry(), audio(), h.destination, 0);
    expect(h.created.filter).toBe(0);
    expect(h.created.convolver).toBe(0);
    expect(h.created.gain).toBe(1); // the envelope gain only
  });

  it("creates three filters when the EQ is not flat", () => {
    const h = harness();
    const fx = { ...DEFAULT_EFFECTS, eq: { low: 3, mid: 0, high: 0 } };
    buildClipChain(h.chain, entry({ effects: fx }), audio(), h.destination, 0);
    expect(h.created.filter).toBe(3);
  });

  it("creates no convolver while the reverb mix is closed", () => {
    const h = harness();
    const fx = { ...DEFAULT_EFFECTS, reverb: { mix: 0, size: 3 } };
    buildClipChain(h.chain, entry({ effects: fx }), audio(), h.destination, 0);
    expect(h.created.convolver).toBe(0);
  });

  it("creates a convolver and dry/wet gains when the reverb is open", () => {
    const h = harness();
    const fx = { ...DEFAULT_EFFECTS, reverb: { mix: 0.5, size: 2 } };
    buildClipChain(h.chain, entry({ effects: fx }), audio(), h.destination, 0);
    expect(h.created.convolver).toBe(1);
    expect(h.created.gain).toBe(3); // envelope + dry + wet
  });
});

describe("buildClipChain playback rate", () => {
  it("applies the resolved rate to the source", () => {
    const h = harness();
    const source = buildClipChain(h.chain, entry(), audio({ rate: 1.5 }), h.destination, 0);
    expect(source.playbackRate.value).toBeCloseTo(1.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w apps/web -- clipChain`
Expected: FAIL — cannot resolve `./clipChain`.

- [ ] **Step 3: Implement `clipChain.ts`**

```ts
import type { ScheduleEntry } from "./scheduling";
import type { ResolvedAudio } from "./processedAudio";
import type { ImpulseCache } from "./impulseResponse";
import { hasEq, hasReverb } from "./effects";

export interface ChainContext {
  ctx: BaseAudioContext;
  impulses: ImpulseCache;
}

const EQ_LOW_HZ = 250;
const EQ_MID_HZ = 1000;
const EQ_MID_Q = 1;
const EQ_HIGH_HZ = 4000;

/**
 * source -> [EQ] -> envelope gain -> [dry/wet] -> destination
 *
 * Effect nodes are created only when they would change the sound: a project
 * nobody has touched costs exactly what it cost before the effects kit existed,
 * which is what makes a per-clip convolver affordable at all.
 *
 * Used by both the transport and the offline export so the mixdown cannot
 * drift from what was heard.
 */
export function buildClipChain(
  chain: ChainContext,
  entry: ScheduleEntry,
  audio: ResolvedAudio,
  destination: AudioNode,
  startAt: number,
): AudioBufferSourceNode {
  const { ctx } = chain;
  const fx = entry.effects;

  const source = ctx.createBufferSource();
  source.buffer = audio.buffer;
  source.playbackRate.value = audio.rate;

  const envelope = ctx.createGain();
  applyEnvelope(envelope, entry, startAt);

  let head: AudioNode = envelope;
  if (hasEq(fx)) {
    const low = ctx.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = EQ_LOW_HZ;
    low.gain.value = fx.eq.low;

    const mid = ctx.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = EQ_MID_HZ;
    mid.Q.value = EQ_MID_Q;
    mid.gain.value = fx.eq.mid;

    const high = ctx.createBiquadFilter();
    high.type = "highshelf";
    high.frequency.value = EQ_HIGH_HZ;
    high.gain.value = fx.eq.high;

    source.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(envelope);
    head = envelope;
  } else {
    source.connect(envelope);
  }

  if (hasReverb(fx)) {
    const dry = ctx.createGain();
    dry.gain.value = 1 - fx.reverb.mix;
    const wet = ctx.createGain();
    wet.gain.value = fx.reverb.mix;
    const convolver = ctx.createConvolver();
    convolver.buffer = chain.impulses.get(fx.reverb.size);

    head.connect(dry);
    dry.connect(destination);
    head.connect(wet);
    wet.connect(convolver);
    convolver.connect(destination);
  } else {
    head.connect(destination);
  }

  source.start(
    startAt,
    audio.baseOffset + entry.elapsed * audio.rate,
    entry.duration * audio.rate,
  );
  return source;
}

/** Clip gain plus its fade ramps, in timeline seconds. */
function applyEnvelope(node: GainNode, entry: ScheduleEntry, startAt: number): void {
  const g = node.gain;
  const fadeIn = Math.min(entry.fadeIn, entry.duration);
  g.setValueAtTime(fadeIn > 0 ? 0 : entry.gain, startAt);
  if (fadeIn > 0) g.linearRampToValueAtTime(entry.gain, startAt + fadeIn);
  if (entry.fadeOut > 0) {
    const fadeOut = Math.min(entry.fadeOut, entry.duration);
    g.setValueAtTime(entry.gain, startAt + Math.max(0, entry.duration - fadeOut));
    g.linearRampToValueAtTime(0, startAt + entry.duration);
  }
}
```

- [ ] **Step 4: Rewire the transport**

In `transport.ts`: the constructor gains a third parameter `processed: ProcessedAudio` and builds an `ImpulseCache` from `engine.getContext()`. Delete the local `applyEnvelope` — `clipChain` owns it now. In `schedule()`, replace the per-entry node construction with:

```ts
for (const entry of entries) {
  const audio = this.processed.get({ ...clipsById.get(entry.clipId)! });
  if (!audio) continue;
  const source = buildClipChain(
    { ctx, impulses: this.impulses },
    entry,
    audio,
    this.engine.ensureTrackNodes(entry.trackId).gain as unknown as AudioNode,
    ctx.currentTime + entry.when,
  );
  this.sources.push(source);
}
```

`play()` awaits `this.processed.preload(this.clips)` in place of `this.library.preload(...)`, so a stretched clip is rendered before playback rather than dropping out.

In `transport.test.ts`, extend the fake context with `createBiquadFilter`, `createConvolver` and `sampleRate`, add a fake `ProcessedAudio` returning `{ buffer, baseOffset: 0, rate: 1 }`, pass it as the third constructor argument, and change the two window assertions from `offset` to the values the new formula yields — the existing expectations already match, since a neutral clip gives `baseOffset + elapsed × 1`.

- [ ] **Step 5: Rewire the export**

`renderMixdown` gains a `processed: ProcessedAudio` parameter and replaces its inline node building with `buildClipChain`, passing the track's gain node as the destination and `entry.when` as `startAt`. Because `OfflineAudioContext` cannot share buffers created by another context, construct a local `ImpulseCache` bound to the offline context.

- [ ] **Step 6: Run the full suite**

Run: `npm test -w apps/web`
Expected: PASS across every file.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/audio
git commit -m "feat(web): share one effect chain between playback and export"
```

---

## Task 9: Effect mutators

**Files:**
- Modify: `apps/web/src/audio/clipEditing.ts`
- Modify: `apps/web/src/audio/clipEditing.test.ts`

**Interfaces:**
- Consumes: `normalizeEffects`/`serializeEffects`/`durationForSpeed`/`DEFAULT_EFFECTS` (Task 2), `resolvePlacement` (existing), `windowPeak`/`normalizeGain` (Task 5).
- Produces:
  ```ts
  export function setClipEffects(ids: string[], patch: Partial<ClipEffects>): void;
  export function setClipSpeed(ids: string[], speed: number): void;   // re-places if the new length collides
  export function resetClipEffects(ids: string[]): void;
  export function normalizeClips(ids: string[], peakOf: (clip: Clip) => number | null): void;
  ```
  All push exactly one history command, via the existing `commit()` snapshot helper.

- [ ] **Step 1: Write the failing test**

```ts
import { setClipEffects, setClipSpeed, resetClipEffects, normalizeClips } from "./clipEditing";
import { normalizeEffects } from "./effects";

const effectsOf = (id: string) =>
  normalizeEffects(useProjectStore.getState().clips.find((c) => c.id === id)!.effects);

describe("setClipEffects", () => {
  it("merges a patch into existing effects", () => {
    useProjectStore.setState({ clips: [clip({ effects: '{"pitch":5}' })] });
    setClipEffects(["c1"], { reverb: { mix: 0.3, size: 2 } });
    expect(effectsOf("c1").pitch).toBe(5);
    expect(effectsOf("c1").reverb.mix).toBeCloseTo(0.3);
  });

  it("applies to every listed clip in one undo step", () => {
    useProjectStore.setState({ clips: [clip({ id: "a" }), clip({ id: "b", startTime: 20 })] });
    setClipEffects(["a", "b"], { pitch: -4 });
    expect(effectsOf("a").pitch).toBe(-4);
    expect(effectsOf("b").pitch).toBe(-4);
    useHistoryStore.getState().undo();
    expect(effectsOf("a").pitch).toBe(0);
    expect(effectsOf("b").pitch).toBe(0);
  });

  it("clamps an out-of-range patch", () => {
    useProjectStore.setState({ clips: [clip()] });
    setClipEffects(["c1"], { pitch: 999 });
    expect(effectsOf("c1").pitch).toBe(24);
  });
});

describe("setClipSpeed", () => {
  it("keeps the source window by rescaling the timeline duration", () => {
    useProjectStore.setState({ clips: [clip({ duration: 4 })] });
    setClipSpeed(["c1"], 2);
    expect(useProjectStore.getState().clips[0].duration).toBeCloseTo(2);
    expect(effectsOf("c1").speed).toBe(2);
  });

  it("lengthens the clip when slowing down", () => {
    useProjectStore.setState({ clips: [clip({ duration: 4 })] });
    setClipSpeed(["c1"], 0.5);
    expect(useProjectStore.getState().clips[0].duration).toBeCloseTo(8);
  });

  it("re-places a slowed clip that would now overlap its neighbour", () => {
    useProjectStore.setState({
      clips: [clip({ id: "a", startTime: 0, duration: 4 }), clip({ id: "b", startTime: 5, duration: 2 })],
    });
    setClipSpeed(["a"], 0.5);   // a becomes 8 s and would run into b
    const clips = useProjectStore.getState().clips;
    const a = clips.find((c) => c.id === "a")!;
    const b = clips.find((c) => c.id === "b")!;
    const overlap = a.startTime < b.startTime + b.duration && b.startTime < a.startTime + a.duration;
    expect(overlap).toBe(false);
  });

  it("undoes duration, effects and position together", () => {
    useProjectStore.setState({ clips: [clip({ duration: 4 })] });
    setClipSpeed(["c1"], 0.5);
    useHistoryStore.getState().undo();
    expect(useProjectStore.getState().clips[0].duration).toBeCloseTo(4);
    expect(effectsOf("c1").speed).toBe(1);
  });

  it("ignores a non-positive speed", () => {
    useProjectStore.setState({ clips: [clip({ duration: 4 })] });
    setClipSpeed(["c1"], 0);
    expect(useProjectStore.getState().clips[0].duration).toBeCloseTo(4);
  });
});

describe("resetClipEffects", () => {
  it("returns the clip to neutral and restores its unscaled duration", () => {
    useProjectStore.setState({ clips: [clip({ duration: 4 })] });
    setClipSpeed(["c1"], 0.5);
    expect(useProjectStore.getState().clips[0].duration).toBeCloseTo(8);
    resetClipEffects(["c1"]);
    expect(effectsOf("c1").speed).toBe(1);
    expect(useProjectStore.getState().clips[0].duration).toBeCloseTo(4);
  });
});

describe("normalizeClips", () => {
  it("sets the gain that lifts the measured peak to full scale", () => {
    useProjectStore.setState({ clips: [clip()] });
    normalizeClips(["c1"], () => 0.5);
    expect(useProjectStore.getState().clips[0].gain).toBeCloseTo(2);
  });

  it("leaves a silent clip untouched", () => {
    useProjectStore.setState({ clips: [clip({ gain: 0.8 })] });
    normalizeClips(["c1"], () => null);
    expect(useProjectStore.getState().clips[0].gain).toBeCloseTo(0.8);
  });
});
```

Add `effects: "{}"` to the `clip` factory at the top of the existing file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w apps/web -- clipEditing`
Expected: FAIL — `setClipEffects` is not exported.

- [ ] **Step 3: Implement**

Append to `clipEditing.ts`, reusing the existing `commit()` helper so each call is one undoable snapshot swap:

```ts
export function setClipEffects(ids: string[], patch: Partial<ClipEffects>): void {
  const targets = new Set(ids);
  commit(() => {
    const { clips } = useProjectStore.getState();
    if (!clips.some((c) => targets.has(c.id))) return;
    useProjectStore.setState({
      clips: clips.map((c) =>
        targets.has(c.id)
          ? { ...c, effects: serializeEffects(normalizeEffects({ ...normalizeEffects(c.effects), ...patch })) }
          : c,
      ),
    });
  });
}

/**
 * Speed changes the clip's length on the timeline, so this cannot be a plain
 * effects patch: the new length may collide with a neighbour, and the clip is
 * then re-placed on the nearest free slot — the same rule drag already follows.
 */
export function setClipSpeed(ids: string[], speed: number): void {
  if (!Number.isFinite(speed) || speed <= 0) return;
  const targets = new Set(ids);
  commit(() => {
    let working = useProjectStore.getState().clips;
    if (!working.some((c) => targets.has(c.id))) return;
    for (const id of ids) {
      const clip = working.find((c) => c.id === id);
      if (!clip) continue;
      const current = normalizeEffects(clip.effects);
      const next = normalizeEffects({ ...current, speed });
      const duration = durationForSpeed(clip.duration, current.speed, next.speed);
      const startTime = resolvePlacement(
        working, clip.trackId, clip.startTime, duration, new Set([clip.id]),
      );
      const updated = { ...clip, duration, startTime, effects: serializeEffects(next) };
      working = working.map((c) => (c.id === id ? updated : c));
    }
    useProjectStore.setState({ clips: working });
  });
}

export function resetClipEffects(ids: string[]): void {
  const targets = new Set(ids);
  commit(() => {
    let working = useProjectStore.getState().clips;
    if (!working.some((c) => targets.has(c.id))) return;
    for (const id of ids) {
      const clip = working.find((c) => c.id === id);
      if (!clip) continue;
      const current = normalizeEffects(clip.effects);
      const duration = durationForSpeed(clip.duration, current.speed, 1);
      const startTime = resolvePlacement(
        working, clip.trackId, clip.startTime, duration, new Set([clip.id]),
      );
      const updated = {
        ...clip, duration, startTime, effects: serializeEffects(DEFAULT_EFFECTS),
      };
      working = working.map((c) => (c.id === id ? updated : c));
    }
    useProjectStore.setState({ clips: working });
  });
}

/** `peakOf` returns the clip's measured peak, or null when it cannot be measured. */
export function normalizeClips(ids: string[], peakOf: (clip: Clip) => number | null): void {
  const targets = new Set(ids);
  commit(() => {
    const { clips } = useProjectStore.getState();
    let changed = false;
    const next = clips.map((c) => {
      if (!targets.has(c.id)) return c;
      const peak = peakOf(c);
      const gain = peak === null ? null : normalizeGain(peak);
      if (gain === null) return c;
      changed = true;
      return { ...c, gain };
    });
    if (changed) useProjectStore.setState({ clips: next });
  });
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -w apps/web -- clipEditing`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/audio/clipEditing.ts apps/web/src/audio/clipEditing.test.ts
git commit -m "feat(web): add clip effect mutators with speed re-placement"
```

---

## Task 10: Real tooltips

**Files:**
- Create: `apps/web/src/components/Hint.tsx`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/components/Toolbar.tsx`, `TrackHeader.tsx`, `ClipView.tsx`, `TransportBar.tsx`

**Interfaces:**
- Produces: `<Hint label="…" side?="top"|"bottom"|"left"|"right"><button/></Hint>`.

- [ ] **Step 1: Implement `Hint.tsx`**

```tsx
import type { ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

/**
 * Wraps one interactive element with an explanatory tooltip.
 *
 * Replaces the native `title=` attribute, which takes about a second to appear,
 * cannot be styled, and never shows for keyboard users.
 */
export function Hint({
  label,
  side = "bottom",
  children,
}: {
  label: string;
  side?: "top" | "bottom" | "left" | "right";
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="max-w-64 text-pretty">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
```

- [ ] **Step 2: Mount the provider**

In `main.tsx`, wrap `<App />` in `<TooltipProvider delayDuration={400} skipDelayDuration={200}>`. Without this every `Tooltip` throws at render — the provider has never been mounted in this project.

- [ ] **Step 3: Convert the 15 native tooltips**

Replace each `title="…"` with a `Hint`, expanding the text to say what the tool does and give its shortcut. Exact copy:

| Element | Label |
|---|---|
| Importer un son | `Ajoute un ou plusieurs fichiers audio. Chacun arrive sur sa propre piste, à la tête de lecture.` |
| Piste (ajouter) | `Ajoute une piste vide en bas du projet.` |
| Outil Sélection | `Sélection (V) — déplacer les clips dans le temps et d'une piste à l'autre.` |
| Outil Lame | `Lame (C) — cliquer sur un clip pour le couper à l'endroit exact du curseur.` |
| Couper ici | `Coupe les clips sélectionnés à la tête de lecture (S).` |
| Enregistrer | `Décompte 3-2-1 puis enregistrement depuis la tête de lecture. Armez d'abord une piste avec son bouton Rec.` |
| Exporter le mixdown | `Rend le projet en un fichier WAV, avec tous les traitements appliqués.` |
| Zoom avant / arrière | `Rapproche la timeline pour travailler au détail.` / `Éloigne la timeline pour voir l'ensemble.` |
| Lecture / Pause | `Lance la lecture (Espace).` / `Met la lecture en pause (Espace).` |
| Stop | `Arrête la lecture et revient au début.` |
| Monter / Descendre la piste | `Remonte la piste d'un rang.` / `Descend la piste d'un rang.` |
| Supprimer la piste | `Supprime la piste et tous ses clips.` |
| Rec (en-tête de piste) | `Arme la piste pour l'enregistrement. Son vumètre devient actif : vous pouvez vérifier votre micro avant de lancer.` |
| Muet | `Coupe le son de cette piste.` |
| Solo | `N'écoute que les pistes en solo.` |
| Rogner le début / la fin | `Fait glisser le début du clip sans déplacer le reste.` / `Fait glisser la fin du clip.` |
| Fondu d'entrée / de sortie | `Fait monter le son progressivement au début du clip.` / `Fait descendre le son progressivement à la fin.` |

- [ ] **Step 4: Verify manually**

Run `npm run dev:web`, hover each control, confirm the tooltip appears quickly and reads correctly, and that no `title=` remains: `grep -rn 'title="' apps/web/src/components` returns nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): replace native title tooltips with real hints"
```

---

## Task 11: Clip inspector panel

**Files:**
- Create: `apps/web/src/components/ClipInspector.tsx`
- Create: `apps/web/src/components/inspector/EffectSlider.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/Timeline.tsx`
- Modify: `apps/web/src/components/ClipView.tsx`

**Interfaces:**
- Consumes: every mutator from Task 9, `ProcessedAudio` (Task 7), `windowPeak` (Task 5), `Hint` (Task 10), effect ranges (Task 2).
- Produces: `<ClipInspector library={MediaLibrary} processed={ProcessedAudio} />`, and `EffectSlider` with props `{ label, hint, value, min, max, step, unit, neutral, disabled?, onChange }` where double-clicking the row resets to `neutral`.

- [ ] **Step 1: Build `EffectSlider`**

A labelled row: name on the left with a `Hint`, the existing `Slider` from `./ui/slider` in the middle, the value with its unit right-aligned in `font-mono tabular-nums`. `onDoubleClick` calls `onChange(neutral)`. When `disabled`, the row dims and the slider is inert.

- [ ] **Step 2: Build `ClipInspector`**

A `w-72 shrink-0 border-l border-studio-border` column. Reads `selectedClipIds` from the store.

- No selection: a centred muted line, `Sélectionnez un clip pour régler ses effets.`
- Selection: sections in this order, each heading in `text-[11px] uppercase tracking-wider text-muted-foreground`.

**Niveau** — `Gain` slider (0 to 4, neutral 1, shown as a percentage) and a `Normaliser` button calling `normalizeClips(ids, peakOf)` where `peakOf` resolves the clip through `processed.get()` and measures with `windowPeak`. When `normalizeGain` returns null the button shows a toast: title `Rien à normaliser`, description `Ce clip est silencieux.`

**Vitesse et hauteur** — a `Préserver la hauteur` checkbox, a `Vitesse` slider (0.25 to 4, step 0.01, neutral 1, unit `×`) calling `setClipSpeed`, and a `Hauteur` slider (−24 to 24, step 1, neutral 0, unit `demi-tons`). The pitch slider is `disabled` when `preservePitch` is false, and the row then displays `semitonesFromSpeed(speed).toFixed(1)` with the note `La vitesse transpose aussi le son en mode bande.`

**Égaliseur** — three sliders `Grave` / `Médium` / `Aigu`, −24 to 24 dB, step 0.5, neutral 0.

**Réverbération** — `Quantité` (0 to 100 %, neutral 0) and `Taille de la pièce` (0.1 to 5 s, step 0.1, neutral 1.5). The size slider is disabled while the amount is zero.

Finally a `Réinitialiser les effets` button calling `resetClipEffects(ids)`.

Multi-selection: a value shared by every selected clip is displayed; otherwise the row shows `—` and moving it applies the new value to all. Show the count in the header, e.g. `3 clips sélectionnés`.

All effect sliders write through `setClipEffects(ids, patch)` except speed, which must go through `setClipSpeed` for the re-placement.

- [ ] **Step 3: Mount it and mark treated clips**

In `App.tsx`, create the `ProcessedAudio` instance next to `mediaLibrary`, using `audioCtx.createBuffer.bind(audioCtx)` as its buffer factory, pass it to the `Transport` constructor and to `renderMixdown`, and render `<ClipInspector>` as a sibling of `<Timeline>` inside the existing flex row.

In `ClipView.tsx`, when `!isNeutral(normalizeEffects(clip.effects))`, show a small `Sparkles` badge from lucide-react in the clip's top-right corner, wrapped in a `Hint` reading `Ce clip a des effets. Sélectionnez-le pour les régler.` When `processed.isRendering(clip)` is true, show `traitement…` instead — a stretched clip stays playable with its untreated audio while it renders.

- [ ] **Step 4: Verify manually**

Run both dev servers. Select a clip, move each slider, confirm the value updates and the sound follows. Confirm a speed change resizes the clip on the timeline. Confirm `Ctrl+Z` reverses each adjustment in one step.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): add clip inspector panel"
```

---

## Task 12: Manual verification

No step here is complete on the strength of a passing unit test. Each must be **observed**.

- [ ] **Step 1: Start the app**

```bash
npm run dev:server   # :3000
npm run dev:web      # :5173
```

- [ ] **Step 2: Walk the acceptance path**

1. Import a voice or tone file. Select it — the inspector fills with its values.
2. Set speed to 0.5 with `Préserver la hauteur` **off** → the clip doubles in length and the pitch drops an octave. The pitch row reads about −12 demi-tons.
3. Turn `Préserver la hauteur` **on** at the same speed → same length, pitch back to normal. This is the difference the whole task exists for; confirm it by ear.
4. Set pitch to +7 with speed 1 → the clip keeps its length on the timeline and sounds a fifth higher.
5. Push reverb to 60 % and vary the room size → audible tail, changing with size.
6. Pull the EQ bands → audible tonal change.
7. Halve the gain, then press `Normaliser` → the gain jumps back up and the clip peaks.
8. Slow a clip that is hard against its neighbour → it re-places without overlapping; `Ctrl+Z` restores it in one step.
9. Export → the WAV contains the treated audio, not the original.
10. Reload → every effect survives.
11. Hover every tool → each tooltip appears quickly and explains itself.

- [ ] **Step 3: Fix whatever fails, then repeat step 2 from the top**

- [ ] **Step 4: Commit any fixes**

---

## Task 13: Ship

- [ ] **Step 1: Full suite and build**

```bash
npm test
npm run build
```

- [ ] **Step 2: Update the README**

Add the effects kit to the usage section: what each control does, and that speed changes a clip's length on the timeline.

- [ ] **Step 3: Merge, push, watch**

```bash
git checkout main && git merge --no-ff feat/clip-effects
git push origin main
gh run watch
```

- [ ] **Step 4: Verify production and report honestly**

---

## Self-Review

**Spec coverage.** Effects model and both speed modes → T2. WSOLA and the single primitive → T3. Reverb impulses and sharing → T4. Normalise → T5/T9/T11. Timeline-domain scheduling → T6. Derived buffer cache and the "traitement…" state → T7/T11. Node economy and the unified playback/export chain → T8. Speed re-placement under the non-overlap invariant → T9. Corrupt-JSON tolerance → T2 (`normalizeEffects`), exercised in T6. Storage → T1. Inspector, multi-selection, reset, effect marker → T11. Tooltips → T10. Error paths → T7 (render failure returns null), T11 (silent-clip toast). Deployment → T13.

**Placeholders.** None: every code step carries real code or an exact specification, every test step carries executable assertions, and the tooltip copy is written out in full rather than described.

**Type consistency.** `ClipEffects` and its helpers (T2) are used unchanged in T6–T9 and T11. `ScheduleEntry` drops `offset` and gains `elapsed`/`effects` in T6; T8 is the only consumer and reads exactly those. `ResolvedAudio` (`buffer`/`baseOffset`/`rate`) is produced in T7 and consumed in T8 under the same names. `ImpulseCache.get(seconds)` (T4) is called in T8. `normalizeGain` returning `number | null` (T5) matches the `peakOf` contract in T9 and the toast path in T11. `clip.effects` is a JSON string everywhere, normalised only at the boundary.

