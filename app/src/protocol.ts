// Messages exchanged between the backend and the glasses app over WebSocket.
// Keep in sync with server/src/protocol.ts.

/** One translated message waiting on the glasses. */
export interface Item {
  id: string
  kind: 'text' | 'voice'
  from: string // sender name shown on the glasses
  group?: string // group title, when the message came from a watched group
  srcLang: string // e.g. "French"
  userLang: string // e.g. "English"
  srcLangLabel?: string // srcLang named in the user's language ("Französisch"), for display
  userLangLabel?: string // userLang named in itself ("Deutsch"), for display
  translation: string // in userLang, shortened for the display
  sameLang?: boolean // already in userLang (e.g. a followed person writing in it): translation = original, nothing translated
  original: string // original text (or transcript of the voice note)
  durationSec?: number // voice notes only
  drafts: string[] // 3 short reply suggestions, in userLang
}

// Backend -> glasses
export type ServerMsg =
  // user = the Telegram account paired with these glasses
  // notesChat = where voice notes recorded on the glasses go: a group title, or a person (notesToPerson)
  // ui = the glasses' own texts in the user's language (keys of app/src/strings.ts); userLangLabel = the language named in itself
  | { t: 'state'; paired: boolean; botUsername: string; userLang?: string; userLangLabel?: string; ui?: Record<string, string>; user?: { name: string; username?: string }; disconnected?: boolean; notesChat?: string; notesToPerson?: boolean; notesLang?: string }
  | { t: 'item'; item: Item }
  | { t: 'busy'; text: string }
  // mine = the user's words in their own language (the transcript when spoken = true)
  // lang = the sender's language (English name); langLabel = the same, named in the user's language
  | { t: 'confirm'; itemId: string; mine: string; translated: string; lang: string; langLabel?: string; spoken?: boolean }
  // sentTo set = the reply was posted in the original chat automatically (watched chats)
  | { t: 'delivered'; itemId: string; botUsername: string; sentTo?: string }
  // A voice note recorded on the glasses was posted in the notes chat (transcript when speech-to-text worked).
  // lang = the language its transcript was translated into for the recipient (named in the user's language).
  // notesLang (in 'state') = the same, set with /notes → 🌐
  | { t: 'note_saved'; chat: string; durationSec: number; transcript?: string; lang?: string }
  | { t: 'error'; text: string }

// Glasses -> backend (audio is sent as binary frames between rec_start and rec_stop)
export type ClientMsg =
  | { t: 'hello'; code: string }
  | { t: 'pick'; itemId: string; draft: number }
  | { t: 'rec_start'; itemId: string }
  | { t: 'rec_stop' }
  // Voice note: record on the glasses, saved straight to the notes chat (audio frames in between)
  | { t: 'note_start' }
  | { t: 'note_stop' }
  | { t: 'confirm'; itemId: string }
  | { t: 'cancel'; itemId: string }
  | { t: 'skip'; itemId: string }
  | { t: 'unpair' } // disconnect the paired Telegram account
