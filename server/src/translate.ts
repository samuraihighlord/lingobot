// Claude does three jobs: detect + translate incoming messages, draft replies,
// and translate the user's reply back into the sender's language.
import Anthropic from '@anthropic-ai/sdk'
import { config } from './config.js'

const client = config.anthropicKey ? new Anthropic({ apiKey: config.anthropicKey }) : null

export interface IncomingAnalysis {
  srcLang: string // English name of the detected language, e.g. "French"
  srcLangLabel: string // its name written in the user's language, e.g. "Französisch"
  translation: string // full translation in the user's language
  short: string // <= 140 chars, for the glasses
  drafts: string[] // 3 short replies in the user's language
}

const INCOMING_SYSTEM = `You translate chat messages for a person reading them on small smart-glasses.
Return ONLY a JSON object, no prose, with these keys:
"src_lang": English name of the message's language (e.g. "French"; "Nigerian Pidgin" is allowed),
"src_lang_label": the name of that language written in the TARGET language (e.g. "Französisch" when TARGET is German),
"translation": faithful translation into the TARGET language,
"short": the translation shortened to at most 140 characters, keeping names, numbers, dates and the question if any,
"drafts": array of exactly 3 short natural replies (max 45 characters each) written in the TARGET language: one positive, one alternative, one deferring.
If the message is already in the TARGET language, keep it as is and still give drafts.
Never add information that is not in the message.`

const REPLY_SYSTEM = `You translate a short chat reply.
Return ONLY a JSON object: {"translation": "..."}.
Keep the tone (casual or formal) natural for a chat message, keep names and numbers exact, add nothing.`

export async function analyzeIncoming(text: string, userLang: string): Promise<IncomingAnalysis> {
  if (config.mockAi) return mockIncoming(text, userLang)
  const json = await askJson(INCOMING_SYSTEM, `TARGET language: ${userLang}\n\nMessage:\n${text}`, 700)
  const drafts = Array.isArray(json.drafts) ? json.drafts.map(String).slice(0, 3) : []
  return {
    srcLang: String(json.src_lang || 'Unknown'),
    srcLangLabel: String(json.src_lang_label || json.src_lang || 'Unknown').slice(0, 40),
    translation: String(json.translation || text),
    short: String(json.short || json.translation || text).slice(0, 160),
    drafts: drafts.length ? drafts : ['OK', 'Not now', "I'll reply later"],
  }
}

export async function translateReply(reply: string, fromLang: string, toLang: string): Promise<string> {
  if (config.mockAi) return `[${toLang}] ${reply}`
  if (fromLang.toLowerCase() === toLang.toLowerCase()) return reply
  const json = await askJson(REPLY_SYSTEM, `From ${fromLang} to ${toLang}:\n${reply}`, 400)
  return String(json.translation || reply)
}

/** True when Claude can be called (a key is set and MOCK_AI is off). */
export function canAsk(): boolean {
  return Boolean(client) && !config.mockAi
}

// Sends one request to Claude and parses the JSON object in the answer.
export async function askJson(system: string, user: string, maxTokens: number): Promise<Record<string, any>> {
  if (!client) throw new Error('ANTHROPIC_API_KEY is not set')
  // Note: no temperature/top_p here; Haiku 5.5 rejects non-default sampling settings.
  const res = await client.messages.create({
    model: config.claudeModel,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  })
  const text = res.content
    .filter(block => block.type === 'text')
    .map(block => (block as { text: string }).text)
    .join('')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('Translation service returned an unexpected answer')
  return JSON.parse(text.slice(start, end + 1))
}

// MOCK_AI=1: canned answers so the glasses UI can be tested for free.
function mockIncoming(text: string, userLang: string): IncomingAnalysis {
  const translation = `(${userLang}) ${text}`
  return {
    srcLang: 'French',
    srcLangLabel: 'French',
    translation,
    short: translation.slice(0, 140),
    drafts: ['Yes, Thursday works', 'Can we do Friday?', "I'll call you later"],
  }
}
