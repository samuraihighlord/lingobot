// LingoBot glasses app: pairing, translated messages, reply drafts, voice reply, confirm.
import { OsEventTypeList, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
import { showBusy, showConfirm, showIdle, showMessage, showPairing, showRecording, showSent, showStatus, showText, updateRecording } from './glasses'
import { mountPhoneUi, onDisconnect, setCode, setHint, setNow, setOnline, setPairing } from './phone'
import type { Item, ServerMsg } from './protocol'
import { LevelMeter, waveFrame } from './recordfx'
import { connect, getPairingCode, type Connection } from './socket'
import { setStrings, t } from './strings'

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) || 'http://localhost:8787'
const MAX_RECORD_MS = 60_000 // auto-stop voice replies after 60 s
const MAX_NOTE_MS = 120_000 // voice notes may be longer (server limit: MAX_VOICE_SECONDS, 120 s by default)
const FRAME_MS = 330 // waveform frames on the glasses: ~3 per second (the SDK asks for infrequent image updates)

type Screen =
  | { kind: 'pairing' }
  | { kind: 'idle' }
  | { kind: 'item'; item: Item; showOriginal: boolean }
  | { kind: 'recording'; item?: Item } // item undefined = a voice note for the notes chat
  | { kind: 'busy'; text: string }
  | { kind: 'confirm'; item: Item; mine: string; spoken: boolean; translated: string; lang: string } // lang: named in the user's language
  | { kind: 'delivered'; sentTo?: string; text?: string } // text = the reply as sent, shown as an outgoing bubble
  | { kind: 'note_saved'; chat: string; durationSec: number; transcript?: string; lang?: string }
  | { kind: 'error'; text: string; back?: Item }

// Options in the item menu: voice reply first (one tap to record), then the AI drafts,
// "Show original" (only when the message was translated) and "Ignore". See itemOptions().
type ItemAction = { kind: 'speak' } | { kind: 'draft'; index: number } | { kind: 'original' } | { kind: 'skip' }

mountPhoneUi()
onDisconnect(() => conn?.send({ t: 'unpair' }))
const bridge = await waitForEvenAppBridge()

let screen: Screen = { kind: 'pairing' }
let queue: Item[] = [] // translated messages waiting, oldest first
let paired = false
let botUsername = 'LingoBot'
let userLang = 'English' // named in itself ("Français"), for display
let notesChat: string | undefined // where voice notes go (set with /notes in Telegram): a group title or @person
let notesToPerson = false
let notesLang: string | undefined // voice note transcripts are translated into this for the recipient
let code = ''
let lastConfirm: { itemId: string; translated: string } | null = null // what the next 'delivered' sent
let conn: Connection | null = null
let recordTimer: number | null = null
let frameTimer: number | null = null
let recordStartedAt = 0
const meter = new LevelMeter()

await draw()

try {
  code = await getPairingCode(BACKEND_URL)
  setCode(code)
  conn = connect(BACKEND_URL, code, onServerMessage, online => {
    setOnline(online)
    if (!online && screen.kind !== 'pairing') setHint('Reconnecting to LingoBot...')
  })
} catch (err) {
  setOnline(false, 'No backend')
  setHint(`Cannot reach ${BACKEND_URL}. Is the server running?`)
  await showText(bridge, `LingoBot\n\n${t('cannotReach')}\n${BACKEND_URL}`)
}

// ---------------------------------------------------------------------------
// Server -> glasses

function onServerMessage(msg: ServerMsg): void {
  switch (msg.t) {
    case 'state':
      paired = msg.paired
      botUsername = msg.botUsername
      if (msg.userLang) userLang = msg.userLangLabel ?? msg.userLang
      setStrings(msg.ui) // every glasses text in the user's language
      notesChat = msg.notesChat
      notesToPerson = Boolean(msg.notesToPerson)
      notesLang = msg.notesLang
      setPairing(paired, botUsername, msg.userLang, msg.user)
      setHint(paired ? `Paired with @${botUsername}. Language: ${msg.userLang}` : `Send /start ${code} to @${botUsername}`)
      // The server re-sends every open item right after 'state', so start from an empty list.
      // Items we still had locally may be gone (e.g. the server restarted and forgot them).
      queue = []
      if (screen.kind !== 'recording') go(nextScreen())
      break
    case 'item': {
      const i = queue.findIndex(q => q.id === msg.item.id)
      if (i >= 0) queue[i] = msg.item
      else {
        queue.push(msg.item)
      }
      // Show it now if nothing else is in progress, or if it is the current item coming back.
      // An error screen stays up until the user taps (tapping returns to this item).
      const current = currentItem()
      if (
        screen.kind === 'idle' ||
        screen.kind === 'pairing' ||
        (current?.id === msg.item.id && screen.kind !== 'item' && screen.kind !== 'error')
      ) {
        go({ kind: 'item', item: msg.item, showOriginal: false })
      } else if (screen.kind === 'item') {
        void draw() // refresh the "+N waiting" counter
      }
      break
    }
    case 'busy':
      go({ kind: 'busy', text: msg.text })
      break
    case 'confirm': {
      const item = queue.find(q => q.id === msg.itemId)
      lastConfirm = { itemId: msg.itemId, translated: msg.translated }
      if (item) go({ kind: 'confirm', item, mine: msg.mine, spoken: Boolean(msg.spoken), translated: msg.translated, lang: msg.langLabel ?? msg.lang })
      break
    }
    case 'delivered':
      queue = queue.filter(q => q.id !== msg.itemId)
      botUsername = msg.botUsername
      go({ kind: 'delivered', sentTo: msg.sentTo, text: lastConfirm?.itemId === msg.itemId ? lastConfirm.translated : undefined })
      lastConfirm = null
      break
    case 'note_saved':
      go({ kind: 'note_saved', chat: msg.chat, durationSec: msg.durationSec, transcript: msg.transcript, lang: msg.lang })
      break
    case 'error':
      if (screen.kind === 'recording') {
        // The server refused the recording: turn the mic off.
        if (recordTimer !== null) window.clearTimeout(recordTimer)
        recordTimer = null
        void bridge.audioControl(false)
      }
      go({ kind: 'error', text: msg.text, back: currentItem() })
      break
  }
}

// ---------------------------------------------------------------------------
// Glasses input

function eventTypeOf(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
  if (!envelope) return null
  // A single tap is CLICK_EVENT (0), which arrives with no eventType field at all.
  return envelope.eventType ?? OsEventTypeList.CLICK_EVENT
}

const unsubscribe = bridge.onEvenHubEvent(event => {
  // Mic audio while recording a voice reply.
  const pcm = event.audioEvent?.audioPcm
  if (pcm && screen.kind === 'recording') {
    conn?.sendAudio(pcm)
    meter.push(toBytes(pcm))
  }

  const sysType = eventTypeOf(event.sysEvent)
  const textType = eventTypeOf(event.textEvent)
  const listType = eventTypeOf(event.listEvent)

  // Double-tap always exits, from any screen.
  if ([sysType, textType, listType].includes(OsEventTypeList.DOUBLE_CLICK_EVENT)) {
    void bridge.shutDownPageContainer(1)
    return
  }

  if (listType === OsEventTypeList.CLICK_EVENT) {
    // Index 0 is also omitted on the wire, so a missing index means the first option.
    onListSelect(event.listEvent?.currentSelectItemIndex ?? 0)
    return
  }

  if (sysType === OsEventTypeList.CLICK_EVENT || textType === OsEventTypeList.CLICK_EVENT) {
    onTap()
    return
  }

  if (sysType === OsEventTypeList.SYSTEM_EXIT_EVENT || sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
    cleanup()
  }
})

function onListSelect(index: number): void {
  if (screen.kind === 'idle') {
    if (index === 0) startRecording()
  } else if (screen.kind === 'item') {
    const { item } = screen
    const action = itemOptions(item, screen.showOriginal)[index]?.action
    if (action?.kind === 'speak') {
      startRecording(item)
    } else if (action?.kind === 'draft') {
      conn?.send({ t: 'pick', itemId: item.id, draft: action.index })
    } else if (action?.kind === 'original') {
      go({ ...screen, showOriginal: !screen.showOriginal })
    } else if (action?.kind === 'skip') {
      conn?.send({ t: 'skip', itemId: item.id })
      queue = queue.filter(q => q.id !== item.id)
      go(nextScreen())
    }
  } else if (screen.kind === 'confirm') {
    const { item } = screen
    if (index === 0) conn?.send({ t: 'confirm', itemId: item.id })
    else conn?.send({ t: 'cancel', itemId: item.id })
  }
}

function onTap(): void {
  switch (screen.kind) {
    case 'recording':
      stopRecording()
      break
    case 'delivered':
    case 'note_saved':
      go(nextScreen())
      break
    case 'error': {
      // Return to the message we were answering, if it is still open.
      const back = screen.back
      go(back && queue.some(q => q.id === back.id) ? { kind: 'item', item: back, showOriginal: false } : nextScreen())
      break
    }
  }
}

// ---------------------------------------------------------------------------
// Voice reply

/** Voice reply to an item, or (no item) a voice note saved to the notes chat. */
function startRecording(item?: Item): void {
  conn?.send(item ? { t: 'rec_start', itemId: item.id } : { t: 'note_start' })
  void bridge.audioControl(true)
  meter.reset()
  recordStartedAt = Date.now()
  go({ kind: 'recording', item })
  recordTimer = window.setTimeout(stopRecording, recordLimitMs())
  frameTimer = window.setInterval(animateRecording, FRAME_MS)
}

/** One animation step: advance the waveform with the latest mic level and refresh the timer. */
function animateRecording(): void {
  if (screen.kind !== 'recording') {
    if (frameTimer !== null) window.clearInterval(frameTimer)
    frameTimer = null
    return
  }
  const level = meter.tick()
  const history = [...meter.history]
  const blink = Math.floor((Date.now() - recordStartedAt) / 500) % 2 === 0
  void updateRecording(bridge, recordTimerText(), () => waveFrame(history, level, blink))
}

function recordLimitMs(): number {
  return screen.kind === 'recording' && !screen.item ? MAX_NOTE_MS : MAX_RECORD_MS
}

/** "REC  0:07 / 1:00", with a warning in the last 10 seconds. */
function recordTimerText(): string {
  const max = recordLimitMs()
  const elapsed = Math.min(max, Date.now() - recordStartedAt)
  const fmt = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
  const left = max - elapsed
  return `REC   ${fmt(elapsed)} / ${fmt(max)}${left <= 10_000 ? `   ${t('stopsIn', { n: Math.ceil(left / 1000) })}` : ''}`
}

/** Mic audio can arrive as Uint8Array, number[] or base64 depending on the host. */
function toBytes(pcm: unknown): Uint8Array {
  if (pcm instanceof Uint8Array) return pcm
  if (Array.isArray(pcm)) return Uint8Array.from(pcm)
  if (typeof pcm === 'string') return Uint8Array.from(atob(pcm), c => c.charCodeAt(0))
  return new Uint8Array(0)
}

function stopRecording(): void {
  if (screen.kind !== 'recording') return
  if (recordTimer !== null) window.clearTimeout(recordTimer)
  recordTimer = null
  if (frameTimer !== null) window.clearInterval(frameTimer)
  frameTimer = null
  void bridge.audioControl(false)
  const note = !screen.item
  conn?.send(note ? { t: 'note_stop' } : { t: 'rec_stop' })
  go({ kind: 'busy', text: t(note ? 'savingNote' : 'transcribing') })
}

// ---------------------------------------------------------------------------
// Rendering

function currentItem(): Item | undefined {
  if (screen.kind === 'recording' && !screen.item) return undefined // voice note: not about any message
  return 'item' in screen ? screen.item : queue[0]
}

function nextScreen(): Screen {
  if (!paired) return { kind: 'pairing' }
  return queue.length ? { kind: 'item', item: queue[0], showOriginal: false } : { kind: 'idle' }
}

function go(next: Screen): void {
  screen = next
  void draw()
}

async function draw(): Promise<void> {
  const s = screen
  mirror(s)
  const waiting = queue.length > 1 ? t('waiting', { n: queue.length - 1 }) : ''
  switch (s.kind) {
    case 'pairing':
      return showPairing(bridge, code, botUsername)
    case 'idle':
      return showIdle(bridge, botUsername, userLang, notesChat, notesToPerson)
    case 'item': {
      const { item } = s
      const voice = item.kind === 'voice'
      const meta = [voice ? `♪ ${formatSec(item.durationSec ?? 0)}` : '', waiting].filter(Boolean).join('  ·  ')
      const src = srcName(item)
      return showMessage(bridge, {
        from: item.from,
        group: item.group,
        // Same language: just the language, the message as written (there is no translation).
        route: item.sameLang ? src : s.showOriginal ? t('original', { lang: src }) : `${src}  ›  ${myName(item)}`,
        meta,
        voice,
        body: s.showOriginal ? item.original : item.translation,
        options: itemOptions(item, s.showOriginal).map(o => o.label),
      })
    }
    case 'recording':
      if (!s.item) {
        const chat = notesChat ?? `@${botUsername}`
        return showRecording(bridge, recordTimerText(), notesLang ? t('noteRecLang', { chat, lang: notesLang }) : t(notesToPerson ? 'noteRecTo' : 'noteRecSavedTo', { chat }))
      }
      return showRecording(bridge, recordTimerText(), t('replyRec', { mine: myName(s.item), theirs: srcName(s.item) }))
    case 'busy':
      return showBusy(bridge, s.text)
    case 'confirm':
      // Your own words first (what was heard, for voice replies), then what will be sent.
      return showConfirm(bridge, {
        to: s.item.from,
        mineLabel: `${t(s.spoken ? 'youSaid' : 'yourReply')}  ·  ${myName(s.item)}`,
        mine: s.mine,
        lang: s.lang,
        translated: s.translated,
      })
    case 'delivered': {
      const next = waiting ? t('tapNext', { waiting }) : t('tapContinue')
      if (s.sentTo && s.text) return showSent(bridge, { title: t('sent'), detail: t('sentTo', { name: s.sentTo }), text: s.text, footer: next })
      if (s.sentTo) return showStatus(bridge, 'sent', t('sent'), t('sentTo', { name: s.sentTo }), next)
      return showStatus(bridge, 'sent', t('replyReady'), t('replyReadyHint', { bot: botUsername }), next)
    }
    case 'note_saved': {
      const next = queue.length ? t('tapMessages', { n: queue.length }) : t('tapContinue')
      const where = t(notesToPerson ? 'noteTo' : 'noteIn', { dur: formatSec(s.durationSec), chat: s.chat })
      // The transcript shown is in the user's own words; the recipient got it translated (s.lang).
      // (The status screen joins lines, so the parts are separated with " · ".)
      const detail = [where, s.lang && t('noteLang', { lang: s.lang }), s.transcript && `“${s.transcript}”`].filter(Boolean).join('  ·  ')
      return showStatus(bridge, 'sent', t(notesToPerson ? 'noteSent' : 'noteSaved'), detail, next)
    }
    case 'error':
      return showStatus(bridge, 'error', t('notQuite'), s.text, t('tapBack'))
  }
}

/** The item menu: what each option says and does (same order on the glasses and in onListSelect). */
function itemOptions(item: Item, showOriginal: boolean): { label: string; action: ItemAction }[] {
  const options: { label: string; action: ItemAction }[] = [
    { label: t('speakReply', { lang: srcName(item) }), action: { kind: 'speak' } },
    ...item.drafts.slice(0, 3).map((d, index) => ({ label: `›  ${d}`, action: { kind: 'draft', index } as ItemAction })),
  ]
  if (!item.sameLang) options.push({ label: t(showOriginal ? 'showTranslation' : 'showOriginal'), action: { kind: 'original' } })
  options.push({ label: t('ignore'), action: { kind: 'skip' } })
  return options
}

/** The sender's language, named in the user's language. */
function srcName(item: Item): string {
  return item.srcLangLabel ?? item.srcLang
}

/** The user's language, named in itself. */
function myName(item: Item): string {
  return item.userLangLabel ?? item.userLang
}

function formatSec(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, '0')}`
}

/** Shows the same thing as the glasses on the phone page. */
function mirror(s: Screen): void {
  const route = (item: Item) => (item.sameLang ? srcName(item) : `${srcName(item)} → ${myName(item)}`)
  switch (s.kind) {
    case 'item':
      return setNow({
        from: s.item.from,
        group: s.item.group,
        route: route(s.item),
        text: s.showOriginal ? s.item.original : s.item.translation,
        options: [t('speakReplyPlain', { lang: srcName(s.item) }), ...s.item.drafts.slice(0, 3)],
      })
    case 'recording':
      if (!s.item) return setNow({ from: t('voiceNote'), route: `→ ${notesChat ?? `@${botUsername}`}`, text: '', state: t('recordingNote') })
      return setNow({ from: s.item.from, group: s.item.group, route: route(s.item), text: s.item.translation, state: t('listening', { lang: myName(s.item) }) })
    case 'confirm':
      return setNow({
        from: s.item.from,
        group: s.item.group,
        route: `→ ${s.lang}`,
        said: { label: t(s.spoken ? 'youSaid' : 'you'), text: s.mine },
        text: s.translated,
        state: t('sendInQ', { lang: s.lang }),
        options: [t('send'), t('backPlain')],
      })
    case 'busy':
      return setNow({ from: 'LingoBot', route: '', text: s.text })
    case 'error':
      return setNow({ from: 'LingoBot', route: '', text: s.text, state: t('tapBack') })
    case 'delivered':
      return setNow({ from: 'LingoBot', route: '', text: t('replySent'), state: t('tapForNext') })
    case 'note_saved':
      return setNow({ from: t('noteSaved'), route: `→ ${s.chat}`, text: s.transcript ?? t('voiceNoteDur', { dur: formatSec(s.durationSec) }), state: t('tapContinue') })
    default:
      return setNow(null)
  }
}

function cleanup(): void {
  void bridge.audioControl(false)
  unsubscribe()
}
window.addEventListener('beforeunload', cleanup)
