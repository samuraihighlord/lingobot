// WebSocket hub: one live connection per glasses session.
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, WebSocket } from 'ws'
import type { ClientMsg, ServerMsg } from './protocol.js'
import { sessionForCode, type Session } from './store.js'

/** Handlers implemented in flow.ts, injected to avoid circular imports. */
export interface HubHandlers {
  onHello(session: Session): void
  onMessage(session: Session, msg: ClientMsg): void
  onAudio(session: Session, chunk: Buffer): void
}

const sockets = new Map<string, WebSocket>() // session code -> socket
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 })
let handlers: HubHandlers | null = null

export function setHubHandlers(h: HubHandlers): void {
  handlers = h
}

export function isOnline(session: Session): boolean {
  return sockets.get(session.code)?.readyState === WebSocket.OPEN
}

export function send(session: Session, msg: ServerMsg): void {
  const ws = sockets.get(session.code)
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

/** Called by the HTTP server for upgrade requests on /ws. */
export function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
  wss.handleUpgrade(req, socket, head, ws => attach(ws))
}

function attach(ws: WebSocket): void {
  let session: Session | null = null

  ws.on('message', (data, isBinary) => {
    if (!handlers) return
    if (isBinary) {
      // Binary frames = PCM audio from the glasses mic during a voice reply.
      if (session) handlers.onAudio(session, Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer))
      return
    }
    let msg: ClientMsg
    try {
      msg = JSON.parse(data.toString())
    } catch {
      return
    }
    if (msg.t === 'hello') {
      const code = String(msg.code || '').toUpperCase().slice(0, 12)
      if (!/^LB-[A-Z0-9]{4}$/.test(code)) return
      session = sessionForCode(code)
      sockets.get(code)?.close() // keep a single connection per session
      sockets.set(code, ws)
      console.log(`[hub] glasses connected: ${code}`)
      handlers.onHello(session)
      return
    }
    if (session) handlers.onMessage(session, msg)
  })

  ws.on('close', () => {
    if (session && sockets.get(session.code) === ws) sockets.delete(session.code)
  })
}
