// Speech-to-text. Uses Deepgram when DEEPGRAM_API_KEY is set, otherwise OpenAI when OPENAI_API_KEY is set.
// To add another provider, write a function with the same signature and switch in transcribe().
import { config } from './config.js'

export class SttUnavailableError extends Error {
  constructor() {
    super('Voice is not set up yet (no speech-to-text key). Text messages still work.')
  }
}

export interface AudioInput {
  data: Buffer
  filename: string // extension tells the provider the format, e.g. "voice.ogg", "reply.wav"
  mimeType: string
  /** ISO 639-1 codes the speech is most likely in (the user speaking on the glasses: their language and English).
   *  Detection is limited to these, which is far more reliable on short clips; empty = any language. */
  likely?: string[]
}

/** Returns the transcript in the language that was spoken. */
export async function transcribe(audio: AudioInput): Promise<string> {
  if (config.mockAi) return mockTranscript(audio)
  if (config.deepgramKey) return transcribeDeepgram(audio)
  if (config.openaiKey) return transcribeOpenAI(audio)
  throw new SttUnavailableError()
}

/** Deepgram pre-recorded API: raw audio in the body, language detected (among `likely` when given;
 *  if Deepgram does not support one of those, among all languages). */
async function transcribeDeepgram(audio: AudioInput): Promise<string> {
  const likely = [...new Set(audio.likely ?? [])]
  if (likely.length) {
    try {
      return await deepgramRequest(audio, likely)
    } catch (err) {
      console.warn(`[stt] Deepgram limited to ${likely.join('/')} failed, detecting any language:`, (err as Error).message.slice(0, 120))
    }
  }
  return deepgramRequest(audio, []) // incoming voice notes can be in any language
}

async function deepgramRequest(audio: AudioInput, likely: string[]): Promise<string> {
  const params = new URLSearchParams({ model: config.deepgramModel, smart_format: 'true' }) // smart_format: punctuation, numbers, dates
  if (likely.length) for (const code of likely) params.append('detect_language', code)
  else params.append('detect_language', 'true')
  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: 'POST',
    headers: { Authorization: `Token ${config.deepgramKey}`, 'Content-Type': audio.mimeType },
    body: new Uint8Array(audio.data),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Speech-to-text failed (${res.status}): ${detail.slice(0, 200)}`)
  }
  const body = (await res.json()) as {
    results?: { channels?: { alternatives?: { transcript?: string }[] }[] }
  }
  return (body.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '').trim()
}

async function transcribeOpenAI(audio: AudioInput): Promise<string> {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(audio.data)], { type: audio.mimeType }), audio.filename)
  form.append('model', config.sttModel)
  form.append('response_format', 'json')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.openaiKey}` },
    body: form,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Speech-to-text failed (${res.status}): ${detail.slice(0, 200)}`)
  }
  const body = (await res.json()) as { text?: string }
  return (body.text ?? '').trim()
}

// MOCK_AI=1: lets you test the full voice flow without any API key.
function mockTranscript(audio: AudioInput): string {
  return audio.filename.endsWith('.wav')
    ? 'Yes, Thursday works for me.'
    : 'Bonjour, la livraison part jeudi. Vous pouvez confirmer ?'
}
