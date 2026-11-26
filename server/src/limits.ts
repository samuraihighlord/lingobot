// Cost protection: allowlist + per-user and global daily caps.
// Every call that spends AI credits must pass through takeQuota() first.
import { config } from './config.js'
import { t } from './i18n/index.js'

let day = today()
let globalCount = 0
const perUser = new Map<number, number>()

function today(): string {
  return new Date().toISOString().slice(0, 10) // UTC date
}

function rollover(): void {
  const d = today()
  if (d !== day) {
    day = d
    globalCount = 0
    perUser.clear()
  }
}

export function isAllowed(telegramId: number): boolean {
  return config.allowedIds.size === 0 || config.allowedIds.has(telegramId)
}

/** Returns null if the request may proceed, otherwise a user-facing reason (in `lang`). */
export function takeQuota(telegramId: number, lang?: string): string | null {
  rollover()
  if (!isAllowed(telegramId)) return t(lang, 's.private')
  if (globalCount >= config.maxGlobalPerDay) return t(lang, 's.globalLimit')
  const used = perUser.get(telegramId) ?? 0
  if (used >= config.maxPerUserPerDay) return t(lang, 's.userLimit', { max: config.maxPerUserPerDay })
  perUser.set(telegramId, used + 1)
  globalCount += 1
  return null
}
