const PREFERRED_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

/** Empty string means "let the browser pick its own default". */
export function pickMimeType(): string {
  const Recorder = (globalThis as { MediaRecorder?: { isTypeSupported(t: string): boolean } })
    .MediaRecorder;
  if (!Recorder?.isTypeSupported) return "";
  return PREFERRED_MIME_TYPES.find((t) => Recorder.isTypeSupported(t)) ?? "";
}

export async function requestMicStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  });
}

/**
 * Microphone capture with live metering.
 *
 * open() is deliberately separate from start(): arming a track opens the stream
 * and starts the meter so the user can confirm the mic is picking them up
 * before anything is recorded. The analyser is never connected to the context
 * destination — routing the mic to the speakers would feed back.
 */
export class MicRecorder {
  private stream: MediaStream;
  private source: MediaStreamAudioSourceNode;
  private analyser: AnalyserNode;
  private recorder: MediaRecorder;
  private chunks: Blob[] = [];
  private recording = false;
  private mimeType: string;
  private frame: Float32Array<ArrayBuffer>;

  private constructor(stream: MediaStream, ctx: AudioContext) {
    this.stream = stream;
    this.source = ctx.createMediaStreamSource(stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.source.connect(this.analyser as unknown as AudioNode);
    this.frame = new Float32Array(this.analyser.fftSize);

    this.mimeType = pickMimeType();
    this.recorder = this.mimeType
      ? new MediaRecorder(stream, { mimeType: this.mimeType })
      : new MediaRecorder(stream);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
  }

  static async open(ctx: AudioContext): Promise<MicRecorder> {
    return new MicRecorder(await requestMicStream(), ctx);
  }

  /** RMS of the live input, 0..1. Valid from open() onward. */
  level(): number {
    this.analyser.getFloatTimeDomainData(this.frame);
    let sum = 0;
    for (let i = 0; i < this.frame.length; i++) sum += this.frame[i] * this.frame[i];
    return Math.min(1, Math.sqrt(sum / this.frame.length));
  }

  isRecording(): boolean {
    return this.recording;
  }

  start(): void {
    if (this.recording) return;
    this.chunks = [];
    this.recorder.start();
    this.recording = true;
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.recording) return resolve(new Blob());
      this.recorder.onstop = () => {
        this.recording = false;
        resolve(new Blob(this.chunks, { type: this.mimeType || "audio/webm" }));
      };
      this.recorder.stop();
    });
  }

  /** Releases the microphone. The browser's recording indicator goes out here. */
  close(): void {
    try {
      if (this.recording) this.recorder.stop();
    } catch {
      /* already stopped */
    }
    this.recording = false;
    this.source.disconnect();
    this.analyser.disconnect();
    this.stream.getTracks().forEach((t) => t.stop());
  }

  fileExtension(): string {
    return this.mimeType.includes("ogg") ? "ogg" : "webm";
  }
}
