// Texts the glasses app draws. English defaults; the server sends the user's language in the
// 'state' message (msg.ui), so everything on the glasses follows the language picked with /lang.
// Keep in sync with the "g." keys in server/src/i18n/en.ts.
const EN = {
  'connecting': 'Connecting to LingoBot…',
  'cannotReach': 'Cannot reach the server.',
  'pairTitle': 'Pair with Telegram\nSend this code to @{bot}',
  'pairHint': 'Send  /start {code}  to @{bot}\nor tap Open Telegram on the LingoBot page on your phone.',
  'ready': 'Ready',
  'idleBody': 'Forward a message or voice note to @{bot}, or follow people in a group with /follow.\nNew messages appear here, translated into {lang}.',
  'pairedBar': 'Paired · {lang}',
  'doubleTapExit': 'Double-tap to exit',
  'recordNoteTo': '●  Record a voice note  ·  to {chat}',
  'recordNoteSavedTo': '●  Record a voice note  ·  saved to {chat}',
  'original': 'Original  ·  {lang}',
  'waiting': '+{n} waiting',
  'speakReply': '●  Speak a reply  ·  sent in {lang}',
  'showOriginal': '◆  Show original',
  'showTranslation': '◆  Show translation',
  'ignore': '○  Ignore',
  'noteRecTo': 'Voice note  ›  sent to {chat}\nTap to stop and send.',
  'noteRecSavedTo': 'Voice note  ›  saved to {chat}\nTap to stop and save.',
  'noteRecLang': 'Voice note  ›  {chat}  ·  translated to {lang}\nTap to stop and send.',
  'noteLang': 'Translated to {lang}',
  'replyRec': 'Speak in {mine}  ›  sent in {theirs}\nTap to stop. You can review it before it is sent.',
  'stopsIn': 'stops in {n}s',
  'replyTo': 'Reply to {name}',
  'youSaid': 'You said',
  'yourReply': 'Your reply',
  'sendsIn': 'Sends in {lang}',
  'sendIn': '▶  Send in {lang}',
  'back': '←  Back',
  'tapNext': 'Tap for the next message  ·  {waiting}',
  'tapContinue': 'Tap to continue',
  'sent': 'Sent',
  'sentTo': 'to {name}',
  'replyReady': 'Reply ready',
  'replyReadyHint': 'In the chat, type @{bot} and tap your reply to send it.',
  'tapMessages': 'Tap for messages  ·  {n} waiting',
  'noteSent': 'Voice note sent',
  'noteSaved': 'Voice note saved',
  'noteTo': '{dur} to {chat}',
  'noteIn': '{dur} in {chat}',
  'notQuite': 'Not quite',
  'tapBack': 'Tap to go back',
  'transcribing': 'Transcribing...',
  'savingNote': 'Saving voice note...',
  // Phone page mirror of the glasses
  'speakReplyPlain': 'Speak a reply (sent in {lang})',
  'voiceNote': 'Voice note',
  'recordingNote': 'Recording… tap to stop and save',
  'listening': 'Listening… speak in {lang}',
  'you': 'You',
  'sendInQ': 'Send in {lang}?',
  'send': 'Send',
  'backPlain': 'Back',
  'replySent': 'Reply sent.',
  'tapForNext': 'Tap for next',
  'voiceNoteDur': '{dur} voice note',
} as const

export type StringKey = keyof typeof EN

let current: Partial<Record<string, string>> = {}

/** Replaces the texts with the ones in the user's language (unknown keys keep English). */
export function setStrings(ui: Record<string, string> | undefined): void {
  current = ui ?? {}
}

/** Text in the user's language with {placeholders} filled in. */
export function t(key: StringKey, vars: Record<string, string | number> = {}): string {
  const s = current[key] ?? EN[key]
  return s.replace(/\{(\w+)\}/g, (m, name: string) => (vars[name] === undefined ? m : String(vars[name])))
}
