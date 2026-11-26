// Loads and validates settings from environment variables (.env).
import 'dotenv/config'

function num(name: string, fallback: number): number {
  const raw = process.env[name]
  const value = raw ? Number(raw) : fallback
  return Number.isFinite(value) ? value : fallback
}

function flag(name: string): boolean {
  return process.env[name] === '1' || process.env[name] === 'true'
}

export const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  telegramApiRoot: process.env.TELEGRAM_API_ROOT || undefined, // testing only: point the bot at a fake Telegram server
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
  openaiKey: process.env.OPENAI_API_KEY ?? '',
  sttModel: process.env.STT_MODEL || 'gpt-transcribe', // OpenAI model
  deepgramKey: process.env.DEEPGRAM_API_KEY ?? '',
  deepgramModel: process.env.DEEPGRAM_MODEL || 'nova-3',
  claudeModel: process.env.CLAUDE_MODEL || 'claude-haiku-5-5',
  port: num('PORT', 8787),

  // Cost protection
  allowedIds: new Set(
    (process.env.ALLOWED_TELEGRAM_IDS ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(Number),
  ),
  maxPerUserPerDay: num('MAX_REQUESTS_PER_USER_PER_DAY', 60),
  maxGlobalPerDay: num('MAX_REQUESTS_GLOBAL_PER_DAY', 400),
  maxVoiceSeconds: num('MAX_VOICE_SECONDS', 120),

  // Development switches
  mockAi: flag('MOCK_AI'),
  devEndpoints: flag('DEV_ENDPOINTS'),
  disableBot: flag('DISABLE_BOT'),
}

/** Fails fast with a readable message when a required key is missing. */
export function validateConfig(): void {
  const missing: string[] = []
  if (!config.disableBot && !config.telegramToken) missing.push('TELEGRAM_BOT_TOKEN')
  if (!config.mockAi && !config.anthropicKey) missing.push('ANTHROPIC_API_KEY (or set MOCK_AI=1)')
  if (missing.length) {
    console.error(`Missing settings in .env: ${missing.join(', ')}`)
    process.exit(1)
  }
  if (config.mockAi) {
    console.warn('MOCK_AI=1: no real translation. Every message is reported as French and left untranslated. Set MOCK_AI=0 in .env for real use.')
  }
  if (!config.mockAi) {
    if (config.deepgramKey) console.log(`Speech-to-text: Deepgram (${config.deepgramModel}).`)
    else if (config.openaiKey) console.log(`Speech-to-text: OpenAI (${config.sttModel}).`)
    else console.warn('No DEEPGRAM_API_KEY or OPENAI_API_KEY: voice notes and voice replies are disabled until you add one.')
  }
}
