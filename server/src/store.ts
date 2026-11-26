// In-memory state. Nothing is written to disk: messages, audio and replies
// disappear when the server restarts (privacy by design for the hackathon).
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Item } from './protocol.js'
import { DEFAULT_LANG, isDisplayable } from './i18n/index.js'

/** 'all' = every message not in the user's language; 'mentions' = only mentions of / replies to the user;
 *  'people' = only the people on the list. */
export type WatchMode = 'all' | 'mentions' | 'people'

/** Someone the user follows in a group. Matched by Telegram id, or by @username when the id is not known yet. */
export interface WatchedPerson {
  id?: number
  username?: string // lowercase, no @
  name: string
}

export interface GroupWatch {
  mode: WatchMode
  title: string
  /** Everything these people post goes to the glasses (in any language), on top of `mode`. */
  people: WatchedPerson[]
}

export interface PendingReply {
  itemId: string
  mine: string // what the user chose/said, in their language
  translated: string // in the sender's language
}

/** Where an automatically picked-up message came from, so the reply can go straight back. */
export type ReplyTarget =
  // Private chat watched through Telegram Business: the reply is sent as the user.
  | { kind: 'business'; connectionId: string; chatId: number; messageId: number; name: string }
  // Group where the user sent /watch: the reply is posted by the bot, threaded and signed.
  | { kind: 'group'; chatId: number; messageId: number; name: string; title: string }

export interface NotesChat {
  chatId: number
  title: string // group title, or "@alice" / the person's name
  kind?: 'group' | 'person' // missing = group (older saves)
  /** Language the recipient reads (English name): transcripts of voice notes are translated into it. */
  lang?: string
}

export interface Session {
  code: string // pairing code shown on the glasses, e.g. "LB-4821"
  telegramId?: number // set once the user sends /start <code> to the bot
  chatId?: number // private chat between user and bot
  username?: string // Telegram @username (lowercase, no @), to detect mentions in groups
  firstName?: string // shown when the bot posts a reply in a group
  displayName?: string // full name, shown on the companion page
  handle?: string // @username with its original capitalisation, for display
  watchedGroups: Map<number, GroupWatch> // groups where the user sent /watch
  targets: Map<string, ReplyTarget> // item id -> where to send the reply automatically
  userLang: string // language the user reads/speaks
  items: Map<string, Item>
  pending?: PendingReply // reply waiting for confirmation on the glasses
  lastReplies: string[] // recent confirmed replies, offered in inline mode
  /** Mic audio being received: a voice reply to an item, or a voice note (itemId undefined). */
  audio?: { itemId?: string; chunks: Buffer[]; bytes: number }
  /** Telegram chat (a group the user created) where voice notes from the glasses are saved; set with /notes there. */
  notesChat?: NotesChat
  awaitingUsername?: number // /follow: group id we are waiting for an @username for (private chat)
  awaitingNotesUsername?: boolean // /notes: waiting for the @username of the person who gets the voice notes
}

const byCode = new Map<string, Session>()
const byTelegramId = new Map<number, Session>()

/** Short human-friendly code without look-alike characters. */
export function newCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(4)
  let code = 'LB-'
  for (const b of bytes) code += alphabet[b % alphabet.length]
  return byCode.has(code) ? newCode() : code
}

/** Gets the session for a code, creating it (e.g. after a server restart). */
export function sessionForCode(code: string): Session {
  let s = byCode.get(code)
  if (!s) {
    s = { code, userLang: DEFAULT_LANG, items: new Map(), lastReplies: [], watchedGroups: new Map(), targets: new Map() }
    byCode.set(code, s)
  }
  return s
}

export function findByCode(code: string): Session | undefined {
  return byCode.get(code.toUpperCase())
}

/** Languages of the paired accounts (to refresh their UI text at startup). */
export function languagesInUse(): string[] {
  return [...byTelegramId.values()].map(s => s.userLang)
}

export function findByTelegramId(id: number): Session | undefined {
  return byTelegramId.get(id)
}

/** Links a Telegram account to a glasses session (one active session per account). */
export function linkTelegram(s: Session, telegramId: number, chatId: number): void {
  const previous = byTelegramId.get(telegramId)
  if (previous && previous !== s) {
    previous.telegramId = undefined
    for (const [g, watch] of previous.watchedGroups) s.watchedGroups.set(g, watch) // keep watched groups across re-pairing
    s.notesChat ??= previous.notesChat
  }
  s.telegramId = telegramId
  s.chatId = chatId
  byTelegramId.set(telegramId, s)
  persist()
}

/** Disconnects the Telegram account from these glasses and forgets everything tied to it. */
export function unlinkTelegram(s: Session): void {
  if (s.telegramId !== undefined && byTelegramId.get(s.telegramId) === s) byTelegramId.delete(s.telegramId)
  s.telegramId = undefined
  s.chatId = undefined
  s.username = s.firstName = s.displayName = s.handle = undefined
  s.watchedGroups.clear()
  s.items.clear()
  s.targets.clear()
  s.pending = undefined
  s.audio = undefined
  s.notesChat = undefined
  s.lastReplies = []
  persist()
}

/** Sessions that watch a group (for mention/reply detection). */
export function sessionsWatching(chatId: number): Session[] {
  return [...byTelegramId.values()].filter(s => s.watchedGroups.has(chatId))
}

/** Moves group watches when Telegram upgrades a group to a supergroup (its chat id changes). */
export function migrateGroup(oldId: number, newId: number): void {
  for (const s of byTelegramId.values()) {
    const watch = s.watchedGroups.get(oldId)
    if (!watch) continue
    s.watchedGroups.delete(oldId)
    s.watchedGroups.set(newId, watch)
  }
  for (const s of byTelegramId.values()) if (s.notesChat?.chatId === oldId) s.notesChat.chatId = newId
  persist()
}

/** Sessions whose voice notes go to this chat. */
export function allSessionsWithNotesIn(chatId: number): Session[] {
  return [...byTelegramId.values()].filter(s => s.notesChat?.chatId === chatId)
}

export function newId(): string {
  return randomBytes(6).toString('hex')
}

// --- Settings persistence ----------------------------------------------------
// Only account settings are saved (pairing, language, watched groups), so a server
// restart does not unpair everyone. Messages, audio and replies are never written.

const DATA_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'sessions.json')

interface SavedSession {
  code: string
  telegramId: number
  chatId: number
  username?: string
  firstName?: string
  displayName?: string
  handle?: string
  userLang: string
  watchedGroups: [number, GroupWatch | WatchMode][] // plain mode = older save format
  notesChat?: NotesChat
}

let saveTimer: NodeJS.Timeout | undefined

/** Saves settings shortly after a change (several changes in a row are written once). */
export function persist(): void {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveNow, 200)
}

function saveNow(): void {
  const saved: SavedSession[] = []
  for (const s of byCode.values()) {
    if (s.telegramId === undefined || s.chatId === undefined) continue // unpaired (or /dev/inject test sessions)
    saved.push({
      code: s.code,
      telegramId: s.telegramId,
      chatId: s.chatId,
      username: s.username,
      firstName: s.firstName,
      displayName: s.displayName,
      handle: s.handle,
      userLang: s.userLang,
      watchedGroups: [...s.watchedGroups],
      notesChat: s.notesChat,
    })
  }
  try {
    mkdirSync(dirname(DATA_FILE), { recursive: true })
    writeFileSync(DATA_FILE + '.tmp', JSON.stringify(saved, null, 2))
    renameSync(DATA_FILE + '.tmp', DATA_FILE)
  } catch (err) {
    console.error('[store] could not save settings:', (err as Error).message)
  }
}

function load(): void {
  let saved: SavedSession[]
  try {
    saved = JSON.parse(readFileSync(DATA_FILE, 'utf8'))
  } catch {
    return // first run, nothing saved yet
  }
  for (const d of saved) {
    const s = sessionForCode(d.code)
    Object.assign(s, {
      telegramId: d.telegramId,
      chatId: d.chatId,
      username: d.username,
      firstName: d.firstName,
      displayName: d.displayName,
      handle: d.handle,
      // Default English; also for a language saved before it was found not to display on the G2.
      userLang: d.userLang && isDisplayable(d.userLang) ? d.userLang : DEFAULT_LANG,
      notesChat: d.notesChat,
      watchedGroups: new Map(
        (d.watchedGroups ?? []).map(([id, w]) => [id, typeof w === 'string' ? { mode: w, title: 'group', people: [] } : w]),
      ),
    })
    byTelegramId.set(d.telegramId, s)
  }
  console.log(`[store] restored ${saved.length} paired account(s).`)
}

load()
