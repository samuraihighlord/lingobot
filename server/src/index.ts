// Entry point: HTTP (pairing + health), WebSocket (/ws) and the Telegram bot.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { config, validateConfig } from './config.js'
import { handleIncoming, pushState } from './flow.js'
import { handleUpgrade } from './hub.js'
import { findByCode, languagesInUse, newCode, sessionForCode } from './store.js'
import { ensureCatalog, refreshInUse, resolveLanguage } from './i18n/index.js'
import { startBot } from './bot.js'

validateConfig()
refreshInUse(languagesInUse()) // translate UI text that changed since last time, for languages in use

const server = createServer(async (req, res) => {
  // The glasses app runs in a WebView on another origin, so allow CORS.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return end(res, 204)

  const url = new URL(req.url ?? '/', 'http://localhost')

  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { ok: true, mockAi: config.mockAi })
  }

  // The glasses app asks for a pairing code on first launch.
  if (req.method === 'POST' && url.pathname === '/pair/new') {
    const session = sessionForCode(newCode())
    return json(res, 200, { code: session.code })
  }

  // Development only: push a fake incoming message to a session (no Telegram needed).
  if (config.devEndpoints && req.method === 'POST' && url.pathname === '/dev/inject') {
    const body = await readJson(req)
    const session = findByCode(String(body.code ?? ''))
    if (!session) return json(res, 404, { error: 'unknown code' })
    session.telegramId ??= 1 // pretend it is paired so quota checks pass
    const result = await handleIncoming(session, {
      from: String(body.from ?? 'Amadou'),
      text: String(body.text ?? 'Bonjour, la livraison part jeudi. Vous pouvez confirmer ?'),
    })
    return json(res, result.ok ? 200 : 400, result)
  }

  // Development only: switch a session's language (what /lang does in Telegram).
  if (config.devEndpoints && req.method === 'POST' && url.pathname === '/dev/lang') {
    const body = await readJson(req)
    const session = findByCode(String(body.code ?? ''))
    if (!session) return json(res, 404, { error: 'unknown code' })
    const choice = await resolveLanguage(String(body.lang ?? ''))
    if (!choice.ok) return json(res, 400, choice)
    if (!(await ensureCatalog(choice.name))) return json(res, 400, { ok: false, name: choice.name, reason: 'unavailable' })
    session.userLang = choice.name
    pushState(session)
    return json(res, 200, choice)
  }

  json(res, 404, { error: 'not found' })
})

server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url ?? '/', 'http://localhost').pathname === '/ws') handleUpgrade(req, socket, head)
  else socket.destroy()
})

server.listen(config.port, () => {
  console.log(`LingoBot server on http://localhost:${config.port}  (WebSocket: /ws)`)
  if (config.mockAi) console.log('MOCK_AI=1: using fake translations, no API credits used.')
})

if (!config.disableBot) {
  startBot().catch(err => {
    console.error('Could not start the Telegram bot:', err?.message ?? err)
    process.exit(1)
  })
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function end(res: ServerResponse, status: number): void {
  res.writeHead(status)
  res.end()
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 10_000) break
  }
  try {
    return JSON.parse(raw || '{}')
  } catch {
    return {}
  }
}
