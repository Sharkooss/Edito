export class MicRecorder {
  private stream: MediaStream;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private recording = false;

  constructor(stream: MediaStream) {
    this.stream = stream;
  }

  isRecording(): boolean {
    return this.recording;
  }

  async start(): Promise<void> {
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => this.chunks.push(e.data);
    this.recorder.start();
    this.recording = true;
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.recorder) return resolve(new Blob());
      this.recorder.onstop = () => {
        this.recording = false;
        const blob = new Blob(this.chunks, { type: "audio/webm" });
        this.stream.getTracks().forEach((track) => track.stop());
        resolve(blob);
      };
      this.recorder.stop();
    });
  }
}

export async function requestMicStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: true });
}
