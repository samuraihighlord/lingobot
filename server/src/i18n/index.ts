// Languages: which ones the G2 can display, the UI text in each, and language names.
//
// The user's language (session.userLang, an English name such as "French") is used for everything:
// translations, the glasses screens and the bot's chat. Default: English.
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'
import { askJson, canAsk } from '../translate.js'
import { EN, type Key } from './en.js'

export { EN, type Key }
export const DEFAULT_LANG = 'English'

// --- Which languages the G2 can display ---------------------------------------
// Checked in the Even Hub simulator (app/dev/glyphs.html) on 2026-11-26: the firmware font draws Latin
// (incl. Vietnamese, Turkish, Polish, Czech, Romanian), Greek, basic Cyrillic (Russian, Ukrainian, Serbian,
// Bulgarian), Chinese, Japanese and Korean. Blank or broken: Arabic, Hebrew, Persian, Devanagari, Bengali,
// Tamil, Thai, Ethiopic, Georgian, Armenian, extended Cyrillic (Kazakh, Mongolian), the hooked letters of
// Hausa (ɓ ɗ ƙ ƴ) and Yoruba's ṣ and tone marks.

/** Characters the glasses cannot draw (they come out blank or misplaced). */
const UNDRAWABLE =
  /[ƀ-ȗȜ-ʯ̀-ͯѠ-ҏҒ-ԯ԰-ࣿऀ-࿿က-ჿሀ-᎟ក-᢯Ḁ-ẟיִ-﷿ﹰ-﻿]/u

export function undrawable(text: string): string[] {
  return [...new Set([...text.normalize('NFC')].filter(c => UNDRAWABLE.test(c)))]
}

interface Lang {
  name: string // English name, as stored in session.userLang
  code: string // ISO 639 code (for language names via Intl)
  ok: boolean // the G2 can display it
  aliases: string[] // lowercase: other English names, the language's own name ("français", "中文")
}

// [English name, code, displayable, aliases]
const LANGS: Lang[] = (
  [
    ['English', 'en', true], ['French', 'fr', true], ['Spanish', 'es', true], ['Portuguese', 'pt', true],
    ['German', 'de', true], ['Italian', 'it', true], ['Dutch', 'nl', true], ['Turkish', 'tr', true],
    ['Swahili', 'sw', true], ['Igbo', 'ig', true], ['Polish', 'pl', true], ['Romanian', 'ro', true],
    ['Czech', 'cs', true], ['Slovak', 'sk', true], ['Vietnamese', 'vi', true], ['Russian', 'ru', true],
    ['Ukrainian', 'uk', true], ['Belarusian', 'be', true], ['Bulgarian', 'bg', true], ['Serbian', 'sr', true],
    ['Macedonian', 'mk', true], ['Greek', 'el', true], ['Chinese', 'zh', true, ['mandarin', 'cantonese']],
    ['Japanese', 'ja', true], ['Korean', 'ko', true], ['Indonesian', 'id', true], ['Malay', 'ms', true],
    ['Filipino', 'fil', true, ['tagalog']], ['Swedish', 'sv', true], ['Norwegian', 'no', true], ['Danish', 'da', true],
    ['Finnish', 'fi', true], ['Icelandic', 'is', true], ['Hungarian', 'hu', true], ['Croatian', 'hr', true],
    ['Bosnian', 'bs', true], ['Slovenian', 'sl', true], ['Albanian', 'sq', true], ['Estonian', 'et', true],
    ['Latvian', 'lv', true], ['Lithuanian', 'lt', true], ['Catalan', 'ca', true], ['Galician', 'gl', true],
    ['Basque', 'eu', true], ['Welsh', 'cy', true], ['Irish', 'ga', true], ['Afrikaans', 'af', true],
    ['Zulu', 'zu', true], ['Xhosa', 'xh', true], ['Somali', 'so', true], ['Kinyarwanda', 'rw', true],
    ['Shona', 'sn', true], ['Nigerian Pidgin', 'pcm', true, ['pidgin', 'naija']],
    // The G2 cannot display these yet.
    ['Arabic', 'ar', false], ['Hebrew', 'he', false], ['Yiddish', 'yi', false], ['Persian', 'fa', false, ['farsi']],
    ['Urdu', 'ur', false], ['Pashto', 'ps', false], ['Sindhi', 'sd', false], ['Uyghur', 'ug', false],
    ['Hindi', 'hi', false], ['Marathi', 'mr', false], ['Nepali', 'ne', false], ['Sanskrit', 'sa', false],
    ['Bengali', 'bn', false, ['bangla']], ['Assamese', 'as', false], ['Punjabi', 'pa', false], ['Gujarati', 'gu', false],
    ['Odia', 'or', false, ['oriya']], ['Tamil', 'ta', false], ['Telugu', 'te', false], ['Kannada', 'kn', false],
    ['Malayalam', 'ml', false], ['Sinhala', 'si', false], ['Thai', 'th', false], ['Lao', 'lo', false],
    ['Khmer', 'km', false], ['Burmese', 'my', false], ['Tibetan', 'bo', false], ['Dhivehi', 'dv', false],
    ['Amharic', 'am', false], ['Tigrinya', 'ti', false], ['Georgian', 'ka', false], ['Armenian', 'hy', false],
    ['Kazakh', 'kk', false], ['Mongolian', 'mn', false], ['Kyrgyz', 'ky', false], ['Tajik', 'tg', false],
    ['Tatar', 'tt', false], ['Bashkir', 'ba', false], ['Azerbaijani', 'az', false], ['Yoruba', 'yo', false],
    ['Hausa', 'ha', false],
  ] as [string, string, boolean, string[]?][]
).map(([name, code, ok, aliases = []]) => ({
  name,
  code,
  ok,
  aliases: [...aliases, displayName(code, code).toLowerCase(), displayName(code, 'en').toLowerCase()].filter(Boolean),
}))

/** Buttons in /lang, in this order. */
export const MENU_LANGUAGES = [
  'English', 'French', 'Spanish', 'Portuguese', 'German', 'Arabic',
  'Chinese', 'Hindi', 'Russian', 'Yoruba', 'Hausa', 'Igbo', 'Swahili', 'Turkish',
]

function find(raw: string): Lang | undefined {
  const q = raw.trim().toLowerCase()
  if (!q) return undefined
  return LANGS.find(l => l.name.toLowerCase() === q || l.code === q || l.aliases.includes(q))
}

export function isDisplayable(lang: string): boolean {
  return find(lang)?.ok ?? true
}

// --- Language names ----------------------------------------------------------

/** Language name as used inside a sentence ("français" in French, "Deutsch" in German). */
function displayName(code: string, inCode: string): string {
  try {
    const n = new Intl.DisplayNames([inCode], { type: 'language' }).of(code)
    return n && n !== code ? n : ''
  } catch {
    return ''
  }
}

/** Name of `lang` written in `uiLang` ("German" in French -> "allemand"), as used inside a sentence.
 *  `capital` for buttons and labels ("Allemand"). Falls back to the English name. */
export function langLabel(lang: string, uiLang: string = DEFAULT_LANG, capital = false): string {
  const l = find(lang)
  const ui = find(uiLang)
  let name = lang
  if (l && ui) name = displayName(l.code, ui.code) || l.name
  else if (lang === uiLang) name = catalogs.get(key(lang))?.name || lang
  return capital ? name.charAt(0).toLocaleUpperCase(ui?.code) + name.slice(1) : name
}

// --- Picking a language ------------------------------------------------------

export type Resolved =
  | { ok: true; name: string }
  | { ok: false; name: string; reason: 'unavailable' }
  | { ok: false; name: string; reason: 'unknown' }

/** "french", "Français", "fr" -> French. Free text ("Brazilian Portuguese") is identified by Claude. */
export async function resolveLanguage(raw: string): Promise<Resolved> {
  const text = raw.trim().slice(0, 40)
  const known = find(text)
  if (known) return known.ok ? { ok: true, name: known.name } : { ok: false, name: known.name, reason: 'unavailable' }
  if (!canAsk()) return { ok: true, name: text.replace(/^./, c => c.toUpperCase()) }
  const json = await askJson(
    'Identify the human language the user names (in any language or spelling). Return ONLY JSON: ' +
      '{"is_language": true|false, "english_name": "English name, e.g. Brazilian Portuguese", "code": "ISO 639 code or empty"}',
    text,
    200,
  ).catch(() => ({}) as Record<string, unknown>)
  if (!json.is_language || !json.english_name) return { ok: false, name: text, reason: 'unknown' }
  const name = String(json.english_name).slice(0, 40)
  const match = find(name) ?? (json.code ? find(String(json.code)) : undefined)
  if (match && !match.ok) return { ok: false, name: match.name, reason: 'unavailable' }
  // Regional variants keep their own name ("Brazilian Portuguese"), known languages use the canonical one.
  return { ok: true, name: match && match.name.toLowerCase() === name.toLowerCase() ? match.name : name }
}

// --- UI text in each language --------------------------------------------------

interface Catalog {
  lang: string
  name: string // the language's name for itself
  strings: Partial<Record<Key, string>>
  source: Partial<Record<Key, string>> // the English each string was translated from
  shortened?: Key[] // menu items already asked to be made shorter (asked once)
}

// Glasses menu items hold at most 63 bytes of UTF-8 (firmware limit), and a language name or chat
// title still has to fit, so the fixed part of these strings must stay within MENU_BUDGET bytes.
// (Cyrillic and Greek letters take 2 bytes, Chinese/Japanese/Korean 3.)
const MENU_KEYS: Key[] = ['g.recordNoteTo', 'g.recordNoteSavedTo', 'g.speakReply', 'g.showOriginal', 'g.showTranslation', 'g.ignore', 'g.sendIn', 'g.back']
const MENU_BUDGET = 40

function fixedBytes(s: string): number {
  return Buffer.byteLength(s.replace(/\{\w+\}/g, ''), 'utf8')
}

/** Menu items in this catalog too long for the glasses (and not yet asked to be shortened). */
function tooLong(c: Catalog | undefined): Key[] {
  if (!c) return []
  return MENU_KEYS.filter(k => c.strings[k] && fixedBytes(c.strings[k]!) > MENU_BUDGET && !c.shortened?.includes(k))
}

const LOCALES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'locales')
const catalogs = new Map<string, Catalog>() // key(lang) -> catalog
const pending = new Map<string, Promise<boolean>>()

function key(lang: string): string {
  return lang.trim().toLowerCase()
}

function fileOf(lang: string): string {
  return join(LOCALES_DIR, `${key(lang).replace(/[^a-z0-9]+/g, '-')}.json`)
}

function loadAll(): void {
  let files: string[] = []
  try {
    files = readdirSync(LOCALES_DIR).filter(f => f.endsWith('.json'))
  } catch {
    return
  }
  for (const f of files) {
    try {
      const c = JSON.parse(readFileSync(join(LOCALES_DIR, f), 'utf8')) as Catalog
      if (c.lang && c.strings) catalogs.set(key(c.lang), c)
    } catch (err) {
      console.error(`[i18n] could not read ${f}:`, (err as Error).message)
    }
  }
}
loadAll()

/** Keys with no translation yet, or whose English changed since they were translated. */
function staleKeys(lang: string): Key[] {
  const c = catalogs.get(key(lang))
  return (Object.keys(EN) as Key[]).filter(k => !c?.strings[k] || c.source[k] !== EN[k])
}

/**
 * Makes sure the UI text exists in `lang` (translating what is missing). Returns false when the
 * translation uses characters the glasses cannot draw: the language is then not available.
 */
export function ensureCatalog(lang: string): Promise<boolean> {
  if (key(lang) === key(DEFAULT_LANG) || !canAsk()) return Promise.resolve(true)
  if (!staleKeys(lang).length && !tooLong(catalogs.get(key(lang))).length) return Promise.resolve(true)
  const k = key(lang)
  let job = pending.get(k)
  if (!job) {
    job = translateCatalog(lang).finally(() => pending.delete(k))
    pending.set(k, job)
  }
  return job
}

const CATALOG_SYSTEM = (lang: string) => `You translate the interface of LingoBot (a Telegram bot paired with Even G2 smart glasses) from English into ${lang}.
Return ONLY a JSON object with exactly the same keys, values translated.
Rules:
- Keep every {placeholder} exactly as written, untranslated.
- Keep /commands, @usernames, LB-XXXX, t.me links, emoji and symbols (● ◆ ○ ▶ ← › · … • → ✍️ ⛔ 🌐 💬 🔒 🎙 ⚠️) unchanged, in the same place.
- Keep line breaks (\\n) and list structure.
- Telegram menu paths (Settings > Telegram Business > Chatbots, BotFather, Group Privacy): use the names Telegram shows in ${lang} when you know them.
- Keys starting with "g." are shown on a tiny display: as short as the English or shorter, plain words.
- Friendly, simple, natural ${lang}. Use the script ${lang} is normally written in.
- Address the user informally and consistently in every string (e.g. French "tu", German "du", Spanish "tú", Russian "ты").
- {lang}, {mine}, {theirs}, {src}, {dst} and {current} are language names in ${lang} (e.g. "français"); {name}, {from}, {names} are people; {title} is a group; {chat} is a group or @person.
- Key "_name": the name of ${lang} written in ${lang} (e.g. "Français").`

async function translateCatalog(lang: string): Promise<boolean> {
  const keys = staleKeys(lang)
  const started = Date.now()
  // Several small requests in parallel: faster, and a bad answer only costs one chunk.
  const chunks: Key[][] = []
  for (let i = 0; i < keys.length; i += 30) chunks.push(keys.slice(i, i + 30))
  const results = await Promise.all(
    chunks.map((chunk, i) => {
      const src: Record<string, string> = Object.fromEntries(chunk.map(k => [k, EN[k]]))
      if (i === 0) src._name = 'English'
      return askJson(CATALOG_SYSTEM(lang), JSON.stringify(src, null, 1), 8000).catch(err => {
        console.error(`[i18n] ${lang}: a chunk failed:`, (err as Error).message)
        return {} as Record<string, unknown>
      })
    }),
  )
  const prev = catalogs.get(key(lang))
  const next: Catalog = { lang, name: prev?.name ?? lang, strings: { ...prev?.strings }, source: { ...prev?.source } }
  let translated = 0
  for (const json of results) {
    if (typeof json._name === 'string' && json._name.trim()) next.name = json._name.trim().slice(0, 40)
    for (const k of keys) {
      const v = json[k]
      if (typeof v !== 'string' || !v.trim() || !samePlaceholders(EN[k], v)) continue
      next.strings[k] = v
      next.source[k] = EN[k]
      translated++
    }
  }
  await shorten(lang, next)
  // Only what the glasses draw must be drawable; the bot's chat can use any script.
  const drawn = (Object.keys(next.strings) as Key[]).filter(k => k.startsWith('g.') || k.startsWith('s.')).map(k => next.strings[k]).join(' ')
  const bad = undrawable(drawn + ' ' + next.name)
  if (bad.length > 3) {
    console.warn(`[i18n] ${lang} cannot be shown on the G2 (${bad.slice(0, 8).join(' ')}): not available.`)
    return false
  }
  catalogs.set(key(lang), next)
  try {
    mkdirSync(LOCALES_DIR, { recursive: true })
    const file = fileOf(lang)
    writeFileSync(file + '.tmp', JSON.stringify(next, null, 1))
    renameSync(file + '.tmp', file)
  } catch (err) {
    console.error('[i18n] could not save', lang, (err as Error).message)
  }
  console.log(`[i18n] ${lang}: ${translated}/${keys.length} strings translated in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  return true
}

/** Asks once for shorter versions of menu items that do not fit on the glasses. */
async function shorten(lang: string, c: Catalog): Promise<void> {
  const keys = tooLong(c)
  if (!keys.length) return
  const src = Object.fromEntries(keys.map(k => [k, { english: EN[k], current: c.strings[k] }]))
  const json = await askJson(
    CATALOG_SYSTEM(lang) +
      `\n\nThese ${lang} menu items are too long for the glasses display. For each key return a shorter ${lang} version ` +
      `(same meaning, keep the leading symbol and every {placeholder}) whose text, without the placeholders, is at most ` +
      `${MENU_BUDGET} bytes in UTF-8 (Cyrillic/Greek letters count 2 bytes, Chinese/Japanese/Korean 3). Drop words, keep it clear. ` +
      'Return ONLY a JSON object mapping each key to the new string, e.g. {"g.ignore": "○  ..."}.',
    JSON.stringify(src, null, 1),
    1500,
  ).catch(() => ({}) as Record<string, unknown>)
  for (const k of keys) {
    const v = json[k]
    if (typeof v === 'string' && v.trim() && samePlaceholders(EN[k], v) && fixedBytes(v) < fixedBytes(c.strings[k]!)) c.strings[k] = v
  }
  c.shortened = [...new Set([...(c.shortened ?? []), ...keys])]
}

function placeholders(s: string): string {
  return [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',')
}

function samePlaceholders(en: string, tr: string): boolean {
  return placeholders(en) === placeholders(tr)
}

// --- Using the text ------------------------------------------------------------

export type Vars = Record<string, string | number | undefined>

/** UI text in `lang` (English when there is no translation yet), with {placeholders} filled in. */
export function t(lang: string | undefined, k: Key, vars: Vars = {}): string {
  const c = lang ? catalogs.get(key(lang)) : undefined
  const s = c?.strings[k] ?? EN[k]
  return s.replace(/\{(\w+)\}/g, (m, name: string) => (vars[name] === undefined ? m : String(vars[name])))
}

/** The glasses' own texts ("g." keys, without the prefix) in `lang`, sent in the 'state' message. */
export function glassesStrings(lang: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of Object.keys(EN) as Key[]) if (k.startsWith('g.')) out[k.slice(2)] = t(lang, k)
  return out
}

/** A server-made error whose text is a UI key (translated when shown). */
export class UiError extends Error {
  constructor(public readonly key: Key, public readonly vars: Vars = {}) {
    super(EN[key])
  }
}

/** Startup: refresh the UI text of languages in use whose English changed (in the background). */
export function refreshInUse(langs: string[]): void {
  if (config.mockAi) return
  for (const lang of new Set(langs)) {
    if (key(lang) !== key(DEFAULT_LANG) && staleKeys(lang).length) void ensureCatalog(lang)
  }
}
