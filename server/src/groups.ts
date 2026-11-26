// Groups the bot is in, and who posted there recently, so /follow in the private chat can offer
// them as buttons (nothing has to be typed in the group). Saved next to the settings so a restart
// keeps them. Only names, @usernames and Telegram ids are stored, never message content.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface Member {
  id: number
  name: string
  username?: string // lowercase, no @
  lastSeen: number // ms
}

export interface KnownGroup {
  id: number
  title: string
  members: Member[] // most recent first
}

const MAX_MEMBERS = 40 // per group; the least recently active drop off
const groups = new Map<number, KnownGroup>()
const DATA_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'groups.json')

export function noteGroup(id: number, title: string | undefined): KnownGroup {
  let g = groups.get(id)
  if (!g) {
    g = { id, title: title ?? 'Group', members: [] }
    groups.set(id, g)
    save()
  } else if (title && title !== g.title) {
    g.title = title
    save()
  }
  return g
}

/** Records that someone was active in a group (posted, joined). */
export function noteMember(groupId: number, title: string | undefined, user: { id: number; first_name: string; last_name?: string; username?: string; is_bot: boolean }): void {
  if (user.is_bot) return
  const g = noteGroup(groupId, title)
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ')
  const i = g.members.findIndex(m => m.id === user.id)
  const known = i >= 0 ? g.members.splice(i, 1)[0] : undefined
  g.members.unshift({ id: user.id, name, username: user.username?.toLowerCase(), lastSeen: Date.now() })
  g.members.length = Math.min(g.members.length, MAX_MEMBERS)
  // Save on new people or changed names, not on every message.
  if (!known || known.name !== name || known.username !== user.username?.toLowerCase()) save()
  else saveSoon()
}

export function forgetGroup(id: number): void {
  if (groups.delete(id)) save()
}

export function migrateKnownGroup(oldId: number, newId: number): void {
  const g = groups.get(oldId)
  if (!g) return
  groups.delete(oldId)
  groups.set(newId, { ...g, id: newId })
  save()
}

export function knownGroup(id: number): KnownGroup | undefined {
  return groups.get(id)
}

export function allKnownGroups(): KnownGroup[] {
  return [...groups.values()]
}

// --- persistence -------------------------------------------------------------

let timer: NodeJS.Timeout | undefined
function saveSoon(): void {
  if (!timer) timer = setTimeout(save, 30_000)
}

function save(): void {
  clearTimeout(timer)
  timer = undefined
  try {
    mkdirSync(dirname(DATA_FILE), { recursive: true })
    writeFileSync(DATA_FILE + '.tmp', JSON.stringify([...groups.values()], null, 2))
    renameSync(DATA_FILE + '.tmp', DATA_FILE)
  } catch (err) {
    console.error('[groups] could not save:', (err as Error).message)
  }
}

function load(): void {
  try {
    for (const g of JSON.parse(readFileSync(DATA_FILE, 'utf8')) as KnownGroup[]) groups.set(g.id, g)
  } catch {
    /* first run */
  }
}

load()
