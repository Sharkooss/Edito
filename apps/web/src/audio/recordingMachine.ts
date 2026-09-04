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

/**
 * Arming and capturing are deliberately distinct phases: v1 started recording
 * on the very first click, which left no moment to check the microphone.
 *
 * Illegal transitions return the state unchanged (referentially equal), so a
 * stray event can never advance the machine.
 */
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
      // Back to armed, not idle, so a retake needs no re-arming.
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
