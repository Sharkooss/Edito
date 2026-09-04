export interface ClipEq {
  low: number;
  mid: number;
  high: number;
}

export interface ClipReverb {
  mix: number;
  size: number;
}

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
      /* fall through to neutral */
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
      size: num(
        reverb.size,
        DEFAULT_EFFECTS.reverb.size,
        REVERB_SIZE_RANGE.min,
        REVERB_SIZE_RANGE.max,
      ),
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

/**
 * Whether the clip's samples have to be rewritten offline. Tape mode never
 * needs it — varispeed is a native playback rate.
 */
export function needsOfflineRender(fx: ClipEffects): boolean {
  return fx.preservePitch && (fx.speed !== 1 || fx.pitch !== 0);
}

/** Seconds of source audio a clip consumes for `timelineDuration` on screen. */
export function sourceWindow(timelineDuration: number, fx: ClipEffects): number {
  return timelineDuration * fx.speed;
}

const semitoneRatio = (semitones: number) => Math.pow(2, semitones / 12);

/**
 * How much the source window must be stretched before playback.
 *
 * Pre-stretching by the pitch ratio cancels the duration change that
 * resampling would otherwise cause, which is what lets pitch and speed move
 * independently. Invariant: sourceWindow x stretchRatio / playbackRate equals
 * the timeline duration, always.
 */
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
