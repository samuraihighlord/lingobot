// People who opened a private chat with the bot. Telegram only lets a bot message someone who has
// started it, and bots cannot look up a user by @username, so this is how "send my voice notes to
// @alice" finds Alice. Only ids, names and @usernames are stored, never message content.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface Contact {
  id: number // also the private chat id
  name: string
  username?: string // lowercase, no @
}

const contacts = new Map<number, Contact>()
const DATA_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'contacts.json')

/** Records someone writing to the bot in private. */
export function noteContact(user: { id: number; first_name: string; last_name?: string; username?: string; is_bot: boolean }): void {
  if (user.is_bot) return
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ')
  const username = user.username?.toLowerCase()
  const known = contacts.get(user.id)
  if (known && known.name === name && known.username === username) return
  contacts.set(user.id, { id: user.id, name, username })
  save()
}

export function contactByUsername(username: string): Contact | undefined {
  const u = username.toLowerCase().replace(/^@/, '')
  for (const c of contacts.values()) if (c.username === u) return c
  return undefined
}

function save(): void {
  try {
    mkdirSync(dirname(DATA_FILE), { recursive: true })
    writeFileSync(DATA_FILE + '.tmp', JSON.stringify([...contacts.values()], null, 2))
    renameSync(DATA_FILE + '.tmp', DATA_FILE)
  } catch (err) {
    console.error('[contacts] could not save:', (err as Error).message)
  }
}

function load(): void {
  try {
    for (const c of JSON.parse(readFileSync(DATA_FILE, 'utf8')) as Contact[]) contacts.set(c.id, c)
  } catch {
    /* first run */
  }
}

load()
