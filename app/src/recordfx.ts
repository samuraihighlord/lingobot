// Recording animation for the G2: a live, symmetric waveform around a microphone,
// driven by the real mic level. Drawn on a canvas and sent as a small PNG.
// The glasses show images in 4-bit greyscale (white = brightest green), so older bars
// are drawn in dimmer greys and fade out towards the edges.

export const WAVE_W = 288 // SDK maximum image width
export const WAVE_H = 120 // SDK maximum is 144

const BAR_W = 5
const GAP = 4
const MIC_ZONE = 64 // space kept free in the middle for the mic
const BARS_PER_SIDE = Math.floor((WAVE_W / 2 - MIC_ZONE / 2) / (BAR_W + GAP))
const MIN_BAR = 4 // silence still shows a row of dots, so the screen looks alive

/** Rolling microphone level, fed with raw PCM (s16le mono) from the glasses. */
export class LevelMeter {
  private peak = 0
  private smooth = 0
  readonly history: number[] = [] // newest first, 0..1

  reset(): void {
    this.peak = 0
    this.smooth = 0
    this.history.length = 0
  }

  /** Adds a PCM chunk; keeps the loudest level until the next frame. */
  push(pcm: Uint8Array): void {
    const samples = Math.floor(pcm.length / 2)
    if (!samples) return
    let sum = 0
    for (let i = 0; i < samples; i++) {
      let v = pcm[i * 2] | (pcm[i * 2 + 1] << 8)
      if (v & 0x8000) v -= 0x10000 // sign
      sum += v * v
    }
    const rms = Math.sqrt(sum / samples) / 32768
    // -55 dBFS (room noise) .. -10 dBFS (loud speech) mapped to 0..1
    const db = 20 * Math.log10(rms + 1e-9)
    const level = Math.min(1, Math.max(0, (db + 55) / 45))
    this.peak = Math.max(this.peak, level)
  }

  /** Called once per frame: moves the waveform one step. Returns the current (smoothed) level. */
  tick(): number {
    // Fast attack, slower release: speech looks lively without flickering.
    this.smooth = this.peak > this.smooth ? this.peak : this.smooth * 0.55 + this.peak * 0.45
    this.peak = 0
    this.history.unshift(this.smooth)
    this.history.length = Math.min(this.history.length, BARS_PER_SIDE)
    return this.smooth
  }
}

let canvas: HTMLCanvasElement | null = null

/** One animation frame as PNG bytes. `blink` toggles the small dot under the mic. */
export async function waveFrame(history: number[], level: number, blink: boolean): Promise<number[]> {
  canvas ??= Object.assign(document.createElement('canvas'), { width: WAVE_W, height: WAVE_H })
  const ctx = canvas.getContext('2d')!
  const cx = WAVE_W / 2
  const cy = WAVE_H / 2
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, WAVE_W, WAVE_H)

  // Bars: newest next to the mic, moving outwards, mirrored left and right.
  const maxH = WAVE_H - 16
  for (let i = 0; i < BARS_PER_SIDE; i++) {
    const v = history[i] ?? 0
    const h = Math.max(MIN_BAR, Math.round(v * maxH))
    const fade = 1 - (i / BARS_PER_SIDE) * 0.75 // older = dimmer
    const grey = Math.round(255 * fade * (0.55 + 0.45 * v))
    ctx.fillStyle = `rgb(${grey},${grey},${grey})`
    const offset = MIC_ZONE / 2 + GAP + i * (BAR_W + GAP)
    pill(ctx, cx + offset, cy - h / 2, BAR_W, h)
    pill(ctx, cx - offset - BAR_W, cy - h / 2, BAR_W, h)
  }

  // Ring around the mic that swells with the voice.
  const ring = 20 + level * 9
  ctx.strokeStyle = `rgb(${Math.round(90 + 165 * level)},${Math.round(90 + 165 * level)},${Math.round(90 + 165 * level)})`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, ring, 0, Math.PI * 2)
  ctx.stroke()

  drawMic(ctx, cx, cy, 0.62)

  // Recording dot below the mic, blinking once per second.
  if (blink) {
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(cx, cy + ring + 8, 3, 0, Math.PI * 2)
    ctx.fill()
  }

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas!.toBlob(b => (b ? resolve(b) : reject(new Error('frame encode failed'))), 'image/png'),
  )
  return Array.from(new Uint8Array(await blob.arrayBuffer()))
}

/** Mic glyph (same shape as the app icon), centred on cx/cy, on a 64-unit grid scaled by `s`. */
function drawMic(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  const x = (u: number) => cx + (u - 32) * s
  const y = (u: number) => cy + (u - 31) * s
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  ctx.lineCap = 'round'
  ctx.lineWidth = Math.max(2, 4 * s)
  pill(ctx, x(24), y(8), 16 * s, 28 * s)
  ctx.beginPath()
  ctx.arc(x(32), y(28), 15 * s, 0, Math.PI)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x(32), y(43))
  ctx.lineTo(x(32), y(52))
  ctx.moveTo(x(22), y(54))
  ctx.lineTo(x(42), y(54))
  ctx.stroke()
}

/** Filled rectangle with fully rounded ends. */
function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const r = Math.min(w, h) / 2
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
  ctx.fill()
}
