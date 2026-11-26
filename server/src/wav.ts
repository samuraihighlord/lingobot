// Wraps raw PCM from the G2 mic (s16le, 16 kHz, mono) in a WAV header
// so speech-to-text APIs can read it.

export const PCM_SAMPLE_RATE = 16000
export const PCM_BYTES_PER_SECOND = PCM_SAMPLE_RATE * 2 // 16-bit mono

export function pcmToWav(pcm: Buffer, sampleRate = PCM_SAMPLE_RATE): Buffer {
  const header = Buffer.alloc(44)
  const byteRate = sampleRate * 2
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // fmt chunk size
  header.writeUInt16LE(1, 20) // PCM format
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(2, 32) // block align
  header.writeUInt16LE(16, 34) // bits per sample
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}
