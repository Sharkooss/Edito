export async function decodeAudioFile(file: File, ctx: AudioContext): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer);
}
