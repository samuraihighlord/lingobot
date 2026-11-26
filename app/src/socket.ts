// WebSocket connection to the LingoBot backend, with automatic reconnect.
import type { ClientMsg, ServerMsg } from './protocol'

export interface Connection {
  send(msg: ClientMsg): void
  sendAudio(chunk: Uint8Array): void
}

export function connect(
  backendUrl: string,
  code: string,
  onMessage: (msg: ServerMsg) => void,
  onStatus: (online: boolean) => void,
): Connection {
  const wsUrl = backendUrl.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws'
  let ws: WebSocket | null = null
  let retryMs = 1000

  function open(): void {
    ws = new WebSocket(wsUrl)
    ws.binaryType = 'arraybuffer'
    ws.onopen = () => {
      retryMs = 1000
      onStatus(true)
      ws?.send(JSON.stringify({ t: 'hello', code } satisfies ClientMsg))
    }
    ws.onmessage = ev => {
      if (typeof ev.data !== 'string') return
      try {
        onMessage(JSON.parse(ev.data) as ServerMsg)
      } catch {
        /* ignore malformed frames */
      }
    }
    ws.onclose = () => {
      onStatus(false)
      setTimeout(open, retryMs) // reconnect with backoff (max 15 s)
      retryMs = Math.min(retryMs * 2, 15000)
    }
  }
  open()

  return {
    send(msg) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
    },
    sendAudio(chunk) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(chunk)
    },
  }
}

/** Gets a pairing code: reuse the saved one, or ask the backend for a new one. */
export async function getPairingCode(backendUrl: string): Promise<string> {
  const saved = readSaved()
  if (saved) return saved
  const res = await fetch(backendUrl.replace(/\/$/, '') + '/pair/new', { method: 'POST' })
  if (!res.ok) throw new Error(`Backend unreachable (${res.status})`)
  const { code } = (await res.json()) as { code: string }
  save(code)
  return code
}

// Browser storage can be unavailable in some WebViews, so failures are ignored.
function readSaved(): string | null {
  try {
    return localStorage.getItem('lingobot.code')
  } catch {
    return null
  }
}
function save(code: string): void {
  try {
    localStorage.setItem('lingobot.code', code)
  } catch {
    /* ignore */
  }
}
