// Artwork for the G2 screens, drawn on a canvas and sent as small PNGs.
// The glasses show images in 4-bit greyscale: white = brightest green, grey = dimmer green, black = off.
// Images can be at most 288 x 144 (SDK limit), so each piece is small and cached.
import { logoSvg } from './brand'

const cache = new Map<string, number[]>()

async function draw(key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void | Promise<void>): Promise<number[]> {
  const hit = cache.get(key)
  if (hit) return hit
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h })
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  await paint(ctx)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('image encode failed'))), 'image/png'),
  )
  const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()))
  cache.set(key, bytes)
  return bytes
}

const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

/** The LingoBot mark (no wordmark), white on black, fitted to the box. */
export function logoArt(w: number, h: number): Promise<number[]> {
  return draw(`logo:${w}x${h}`, w, h, async ctx => {
    const markH = Math.min(h, Math.round((w * 35) / 60))
    const markW = Math.round((markH * 60) / 35)
    ctx.drawImage(await loadSvg(logoSvg(markH, '#ffffff', '#000000')), (w - markW) / 2, (h - markH) / 2, markW, markH)
  })
}

/** The pairing code, large, inside a rounded frame. */
export function codeArt(code: string, w = 288, h = 96): Promise<number[]> {
  return draw(`code:${code}:${w}x${h}`, w, h, ctx => {
    ctx.strokeStyle = '#9a9a9a'
    ctx.lineWidth = 2
    roundRect(ctx, 2, 2, w - 4, h - 4, 16)
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let size = 56
    ctx.font = `700 ${size}px ${MONO}`
    while (ctx.measureText(code).width > w - 32 && size > 20) ctx.font = `700 ${--size}px ${MONO}`
    ctx.fillText(code, w / 2, h / 2 + 2)
  })
}

/** Round avatar with the sender's initial; a small wave badge marks voice notes. */
export function avatarArt(name: string, voice: boolean, size = 48): Promise<number[]> {
  const initial = (name.trim().match(/\p{L}|\p{N}/u)?.[0] ?? '?').toUpperCase()
  return draw(`avatar:${initial}:${voice}:${size}`, size, size, ctx => {
    const r = size / 2
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(r, r, r - 1, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#000'
    ctx.font = `800 ${Math.round(size * 0.48)}px ${SANS}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initial, r, r + 1)
    if (voice) {
      // Badge bottom-right: three small bars.
      const b = size * 0.38
      ctx.fillStyle = '#000'
      ctx.beginPath()
      ctx.arc(size - b / 2, size - b / 2, b / 2 + 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(size - b / 2, size - b / 2, b / 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#000'
      const bw = b / 7
      const heights = [0.35, 0.7, 0.5]
      heights.forEach((k, i) => {
        const bh = b * k
        ctx.fillRect(size - b / 2 - bw * 2.5 + i * bw * 2, size - b / 2 - bh / 2, bw, bh)
      })
    }
  })
}

/** Speech-bubble tail that hangs under a bordered text card: pointing down-left (incoming)
 *  or down-right (outgoing). The top rows are black so they cut the card's border where the tail joins. */
export function tailArt(side: 'left' | 'right', w: number, h: number, level: number, line = 2): Promise<number[]> {
  return draw(`tail:${side}:${w}x${h}:${level}:${line}`, w, h, ctx => {
    const g = Math.round((level / 15) * 255)
    ctx.strokeStyle = `rgb(${g},${g},${g})`
    ctx.lineWidth = line
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const top = line / 2
    const inset = line / 2 + 1
    // Mirror for the outgoing side.
    if (side === 'right') {
      ctx.translate(w, 0)
      ctx.scale(-1, 1)
    }
    ctx.beginPath()
    ctx.moveTo(w - inset, top) // inner edge, where the border resumes
    ctx.quadraticCurveTo(w * 0.45, h * 0.55, inset, h - inset) // tip
    ctx.quadraticCurveTo(w * 0.3, h * 0.35, w * 0.28, top) // outer edge back up to the border
    ctx.stroke()
  })
}

export type StatusIcon = 'sent' | 'error' | 'busy'

/** Large status icon: check in a ring (sent), exclamation in a ring (error), the logo (busy). */
export function statusArt(kind: StatusIcon, size = 112): Promise<number[]> {
  if (kind === 'busy') return logoArt(size, Math.round((size * 35) / 60))
  return draw(`status:${kind}:${size}`, size, size, ctx => {
    const c = size / 2
    // Soft outer halo + ring, so it reads as a glowing badge on the green display.
    ctx.strokeStyle = '#3a3a3a'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(c, c, c - 4, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(c, c, c - 12, 0, Math.PI * 2)
    ctx.stroke()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = Math.max(5, size * 0.07)
    if (kind === 'sent') {
      ctx.beginPath()
      ctx.moveTo(c - size * 0.2, c + size * 0.01)
      ctx.lineTo(c - size * 0.05, c + size * 0.15)
      ctx.lineTo(c + size * 0.22, c - size * 0.14)
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.moveTo(c, c - size * 0.2)
      ctx.lineTo(c, c + size * 0.06)
      ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(c, c + size * 0.18, ctx.lineWidth * 0.6, 0, Math.PI * 2)
      ctx.fill()
    }
  })
}

function loadSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('logo failed to load'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
