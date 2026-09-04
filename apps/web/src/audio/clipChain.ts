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
 * Used by both the transport and the offline export, so the mixdown cannot
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

    envelope.connect(dry);
    dry.connect(destination);
    envelope.connect(wet);
    wet.connect(convolver);
    convolver.connect(destination);
  } else {
    envelope.connect(destination);
  }

  source.start(startAt, audio.baseOffset + entry.elapsed * audio.rate, entry.duration * audio.rate);
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
