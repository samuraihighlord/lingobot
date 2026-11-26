// Encodes raw PCM from the G2 mic (s16le, 16 kHz, mono) as MP3, which Telegram accepts for
// voice messages (sendVoice). Pure JavaScript, so no ffmpeg is needed on the server.
import { Mp3Encoder } from '@breezystack/lamejs'
import { PCM_SAMPLE_RATE } from './wav.js'

const KBPS = 48 // plenty for speech at 16 kHz
const BLOCK = 1152 * 16 // samples per encoder call

export function pcmToMp3(pcm: Buffer, sampleRate = PCM_SAMPLE_RATE): Buffer {
  // Copy into an aligned Int16Array (a Buffer's byte offset may be odd), dropping a stray last byte.
  const samples = new Int16Array(Math.floor(pcm.length / 2))
  for (let i = 0; i < samples.length; i++) samples[i] = pcm.readInt16LE(i * 2)

  const encoder = new Mp3Encoder(1, sampleRate, KBPS)
  const parts: Buffer[] = []
  for (let i = 0; i < samples.length; i += BLOCK) {
    const out = encoder.encodeBuffer(samples.subarray(i, i + BLOCK))
    if (out.length) parts.push(Buffer.from(out.buffer, out.byteOffset, out.length))
  }
  const tail = encoder.flush()
  if (tail.length) parts.push(Buffer.from(tail.buffer, tail.byteOffset, tail.length))
  return Buffer.concat(parts)
}
