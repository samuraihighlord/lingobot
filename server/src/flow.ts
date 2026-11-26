// Core LingoBot flow: incoming message -> glasses -> reply -> back to Telegram.
import { config } from './config.js'
import { send, isOnline, setHubHandlers } from './hub.js'
import { takeQuota } from './limits.js'
import type { ClientMsg, Item, ServerMsg } from './protocol.js'
import { newId, unlinkTelegram, type ReplyTarget, type Session } from './store.js'
import { SttUnavailableError, transcribe } from './stt.js'
import { analyzeIncoming, translateReply } from './translate.js'
import { glassesStrings, langLabel, t, UiError, type Key, type Vars } from './i18n/index.js'
import { pcmToMp3 } from './mp3.js'
import { PCM_BYTES_PER_SECOND, pcmToWav } from './wav.js'

const MAX_ITEMS_PER_SESSION = 20

/** Telegram side, injected by bot.ts so this file has no Telegram dependency. */
export interface TelegramPort {
  botUsername: string
  /** Returns the recipient's name when the reply was posted in the original chat automatically. */
  deliverReply(session: Session, item: Item, translated: string, target?: ReplyTarget): Promise<string | undefined>
  /** Tells the Telegram user something in their private chat with the bot. */
  notify(chatId: number, text: string): Promise<void>
  /** Posts a voice note recorded on the glasses in the user's notes chat. Returns where it went. */
  saveNote(session: Session, note: { mp3: Buffer; durationSec: number; transcript?: string }): Promise<string>
}
let telegram: TelegramPort = {
  botUsername: 'LingoBot',
  deliverReply: async () => undefined,
  notify: async () => {},
  saveNote: async () => {
    throw new Error('Telegram is not connected.')
  },
}
export function setTelegramPort(port: TelegramPort): void {
  telegram = port
}

export interface IncomingInput {
  from: string
  text?: string // text message or caption
  audio?: { data: Buffer; filename: string; mimeType: string; durationSec: number }
  target?: ReplyTarget // set for watched chats: the reply goes straight back there
  onlyForeign?: boolean // watched chats: ignore messages already in the user's language
}

export type IncomingResult =
  | { ok: true; item: Item; onGlasses: boolean }
  | { ok: false; reason: string; sameLanguage?: boolean }

/** A forwarded message or voice note arrived from Telegram. */
export async function handleIncoming(session: Session, input: IncomingInput): Promise<IncomingResult> {
  const denied = quota(session)
  if (denied) return { ok: false, reason: denied }

  try {
    let original = input.text?.trim() ?? ''
    if (input.audio) {
      if (input.audio.durationSec > config.maxVoiceSeconds) {
        return { ok: false, reason: tr(session, 's.voiceTooLong', { max: config.maxVoiceSeconds }) }
      }
      original = await transcribe(input.audio)
    }
    if (!original) return { ok: false, reason: tr(session, 's.nothing') }

    const a = await analyzeIncoming(original, session.userLang)
    if (input.onlyForeign && sameLanguage(a.srcLang, session.userLang)) {
      return { ok: false, reason: tr(session, 's.alreadyYours'), sameLanguage: true }
    }
    const item: Item = {
      id: newId(),
      kind: input.audio ? 'voice' : 'text',
      from: input.from,
      group: input.target?.kind === 'group' ? input.target.title : undefined,
      srcLang: a.srcLang,
      userLang: session.userLang,
      srcLangLabel: knownLabel(a.srcLang, session.userLang) ?? a.srcLangLabel,
      userLangLabel: langLabel(session.userLang, session.userLang),
      translation: a.short,
      original,
      durationSec: input.audio?.durationSec,
      drafts: a.drafts,
    }
    session.items.set(item.id, item)
    if (input.target) session.targets.set(item.id, input.target)
    trimItems(session)
    send(session, { t: 'item', item })
    return { ok: true, item, onGlasses: isOnline(session) }
  } catch (err) {
    return { ok: false, reason: errorText(session, err) }
  }
}

/** The 'state' message: pairing, bot, language and the paired Telegram account. */
export function stateMsg(session: Session): ServerMsg {
  const paired = Boolean(session.telegramId)
  return {
    t: 'state',
    paired,
    botUsername: telegram.botUsername,
    userLang: session.userLang,
    userLangLabel: langLabel(session.userLang, session.userLang),
    ui: glassesStrings(session.userLang),
    user: paired && session.displayName ? { name: session.displayName, username: session.handle } : undefined,
    notesChat: paired ? session.notesChat?.title : undefined,
    notesToPerson: paired && session.notesChat?.kind === 'person' ? true : undefined,
  }
}

/** Sends 'state' and then every open item again (the glasses rebuild their list from 'state'). */
export function pushState(session: Session): void {
  send(session, stateMsg(session))
  for (const item of session.items.values()) {
    // After a language change, open messages name the languages in the new one too
    // (their translation stays as it was: re-translating would cost credits).
    if (item.userLang !== session.userLang) {
      item.srcLangLabel = knownLabel(item.srcLang, session.userLang) ?? item.srcLangLabel
      item.userLangLabel = langLabel(item.userLang, session.userLang)
    }
    send(session, { t: 'item', item })
  }
}

// --- Glasses events -------------------------------------------------------

setHubHandlers({
  onHello(session) {
    pushState(session) // also re-sends items still open (e.g. after the app reconnects)
  },

  onMessage(session, msg) {
    void onClientMessage(session, msg).catch(err => send(session, { t: 'error', text: errorText(session, err) }))
  },

  onAudio(session, chunk) {
    const rec = session.audio
    if (!rec) return
    const maxBytes = config.maxVoiceSeconds * PCM_BYTES_PER_SECOND
    if (rec.bytes + chunk.length > maxBytes) return // ignore audio past the limit
    rec.chunks.push(chunk)
    rec.bytes += chunk.length
  },
})

async function onClientMessage(session: Session, msg: ClientMsg): Promise<void> {
  switch (msg.t) {
    case 'pick': {
      const item = session.items.get(msg.itemId)
      const draft = item?.drafts[msg.draft]
      if (!item) return send(session, { t: 'error', text: tr(session, 's.gone') })
      if (!draft) return
      await prepareReply(session, item, draft)
      return
    }
    case 'rec_start': {
      if (!session.items.has(msg.itemId)) {
        return send(session, { t: 'error', text: tr(session, 's.gone') })
      }
      session.audio = { itemId: msg.itemId, chunks: [], bytes: 0 }
      return
    }
    case 'rec_stop': {
      const rec = session.audio
      if (!rec?.itemId) return
      session.audio = undefined
      const item = session.items.get(rec.itemId)
      if (!item) return
      if (rec.bytes < PCM_BYTES_PER_SECOND / 2) {
        send(session, { t: 'error', text: tr(session, 's.tooShort') })
        send(session, { t: 'item', item })
        return
      }
      const denied = quota(session)
      if (denied) return send(session, { t: 'error', text: denied })
      send(session, { t: 'busy', text: tr(session, 's.transcribing') })
      try {
        const wav = pcmToWav(Buffer.concat(rec.chunks))
        const said = await transcribe({ data: wav, filename: 'reply.wav', mimeType: 'audio/wav' })
        if (!said) throw new UiError('s.notCaught')
        await prepareReply(session, item, said, true)
      } catch (err) {
        send(session, { t: 'error', text: errorText(session, err) })
        send(session, { t: 'item', item })
      }
      return
    }
    case 'note_start': {
      if (!session.telegramId) return send(session, { t: 'error', text: tr(session, 's.pairFirst') })
      session.audio = { chunks: [], bytes: 0 }
      return
    }
    case 'note_stop': {
      const rec = session.audio
      if (!rec || rec.itemId) return
      session.audio = undefined
      await saveVoiceNote(session, Buffer.concat(rec.chunks))
      return
    }
    case 'confirm': {
      const pending = session.pending
      const item = pending && session.items.get(pending.itemId)
      if (!pending || !item || pending.itemId !== msg.itemId) return
      send(session, { t: 'busy', text: tr(session, 's.sending') })
      const sentTo = await telegram.deliverReply(session, item, pending.translated, session.targets.get(item.id))
      session.lastReplies = [pending.translated, ...session.lastReplies].slice(0, 5)
      session.pending = undefined
      removeItem(session, item.id)
      send(session, { t: 'delivered', itemId: item.id, botUsername: telegram.botUsername, sentTo })
      return
    }
    case 'cancel': {
      session.pending = undefined
      const item = session.items.get(msg.itemId)
      if (item) send(session, { t: 'item', item })
      return
    }
    case 'unpair': {
      const chatId = session.chatId
      if (!session.telegramId) return send(session, stateMsg(session))
      unlinkTelegram(session)
      console.log(`[flow] glasses ${session.code} disconnected from Telegram`)
      send(session, { ...stateMsg(session), disconnected: true } as ServerMsg)
      if (chatId) await telegram.notify(chatId, tr(session, 's.glassesDisconnected'))
      return
    }
    case 'skip': {
      removeItem(session, msg.itemId)
      if (session.pending?.itemId === msg.itemId) session.pending = undefined
      return
    }
  }
}

/** Saves a voice note from the glasses in the notes chat, with a transcript when speech-to-text works. */
async function saveVoiceNote(session: Session, pcm: Buffer): Promise<void> {
  if (pcm.length < PCM_BYTES_PER_SECOND / 2) return send(session, { t: 'error', text: tr(session, 's.noteTooShort') })
  const durationSec = Math.round(pcm.length / PCM_BYTES_PER_SECOND)
  send(session, { t: 'busy', text: tr(session, 's.savingNote') })
  const mp3 = pcmToMp3(pcm)
  // The transcript is a bonus (searchable notes): the note is saved even when it fails or the quota is used up.
  let transcript: string | undefined
  if (session.telegramId && !takeQuota(session.telegramId, session.userLang)) {
    transcript = await transcribe({ data: pcmToWav(pcm), filename: 'note.wav', mimeType: 'audio/wav' }).catch(err => {
      if (!(err instanceof SttUnavailableError)) console.error('[flow] note transcript failed:', (err as Error).message)
      return undefined
    })
  }
  const chat = await telegram.saveNote(session, { mp3, durationSec, transcript: transcript || undefined })
  console.log(`[flow] glasses ${session.code} saved a ${durationSec}s voice note to ${chat}`)
  send(session, { t: 'note_saved', chat, durationSec, transcript: transcript || undefined })
}

/** Translates the user's reply into the sender's language and asks the glasses to confirm. */
async function prepareReply(session: Session, item: Item, mine: string, spoken = false): Promise<void> {
  const countQuota = !spoken // a voice reply already used its quota for the transcription
  if (countQuota) {
    const denied = quota(session)
    if (denied) return send(session, { t: 'error', text: denied })
  }
  const langLabel = item.srcLangLabel ?? item.srcLang
  send(session, { t: 'busy', text: tr(session, 's.translatingTo', { lang: langLabel }) })
  const translated = await translateReply(mine, session.userLang, item.srcLang)
  session.pending = { itemId: item.id, mine, translated }
  send(session, { t: 'confirm', itemId: item.id, mine, translated, lang: item.srcLang, langLabel, spoken })
}

function trimItems(session: Session): void {
  while (session.items.size > MAX_ITEMS_PER_SESSION) {
    const oldest = session.items.keys().next().value
    if (oldest === undefined) break
    removeItem(session, oldest)
  }
}

function removeItem(session: Session, id: string): void {
  session.items.delete(id)
  session.targets.delete(id)
}

/** "French" vs "french", "Chinese (Simplified)" vs "Chinese", etc. */
function sameLanguage(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\(.*\)/g, '').trim()
  return norm(a) === norm(b)
}

/** UI text in the user's language. */
function tr(session: Session, key: Key, vars?: Vars): string {
  return t(session.userLang, key, vars)
}

/** null when the user may spend AI credits now, otherwise why not (in their language). */
function quota(session: Session): string | null {
  return session.telegramId ? takeQuota(session.telegramId, session.userLang) : tr(session, 's.notPaired')
}

/** The name of a known language in the user's language, or undefined (then Claude's label is used). */
function knownLabel(lang: string, userLang: string): string | undefined {
  const label = langLabel(lang, userLang)
  return label === lang && lang !== userLang ? undefined : label
}

function errorText(session: Session, err: unknown): string {
  if (err instanceof SttUnavailableError) return tr(session, 's.noStt')
  if (err instanceof UiError) return tr(session, err.key, err.vars)
  const message = err instanceof Error ? err.message : String(err)
  console.error('[flow]', message)
  return message.length > 120 ? tr(session, 's.wrong') : message
}
