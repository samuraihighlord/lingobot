// LingoBot screens on the G2 (576 x 288, monochrome green).
//
// Design system
// - One firmware font (about 26 px per line, ~55 characters across), so hierarchy comes from
//   position, rounded bordered "cards" and small greyscale images, not from font sizes.
// - Only glyphs the firmware draws: › → ← • · ● ○ ◆ ▶ ★ … ♪ (checked in the simulator; ✓ ⚠ ⏎ are blank),
//   so the check / warning marks are drawn as images (glassart.ts).
// - Every screen has exactly one container that captures input: the list on menu screens,
//   otherwise a text container (single tap / double-tap).
// - Images go out one at a time through a queue and are cached, as the SDK asks.
import {
  CreateStartUpPageContainer,
  ImageContainerProperty,
  ImageRawDataUpdate,
  ListContainerProperty,
  ListItemContainerProperty,
  RebuildPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import { avatarArt, codeArt, logoArt, statusArt, tailArt, type StatusIcon } from './glassart'
import { WAVE_H, WAVE_W, waveFrame } from './recordfx'
import { t } from './strings'

const W = 576
const H = 288
const MAX_TEXT_CHARS = 240
const MAX_ITEM_BYTES = 63 // simulator/firmware limit per list item
const REC_TIMER_H = 44
const LOGO_W = 60 // small mark in the top-left corner; text gets the rest of the screen
const LOGO_H = 35
const BESIDE_LOGO = LOGO_W + 22 // x where text next to the logo starts

// Border brightness (0-15): quiet cards vs. the card that matters most on the screen.
const DIM = 6
const BRIGHT = 13

// Chat bubbles: incoming messages sit on the left with a tail bottom-left, outgoing replies on the
// right with a tail bottom-right (like the two bubbles in the logo). The empty gap on the other
// side is what tells them apart at a glance.
const BUBBLE_GAP = 64 // free space on the side the bubble does not belong to
const TAIL_W = 22
const TAIL_H = 14

type Layout = 'text' | 'pairing' | 'idle' | 'message' | 'confirm' | 'busy' | 'status' | 'sent' | 'record'

let started = false
let layout: Layout | null = null
let lastText = ''
let lastTimer = ''
let frameBusy = false // a waveform frame is on its way to the glasses
let busyTimer: number | undefined

export function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= max ? clean : clean.slice(0, max - 1).trimEnd() + '…'
}

/** Clips to the list-item byte limit (UTF-8), keeping whole characters. */
function clipBytes(text: string, maxBytes = MAX_ITEM_BYTES): string {
  const enc = new TextEncoder()
  let out = clip(text, 60)
  while (enc.encode(out).length > maxBytes) out = clip(out, [...out].length - 2)
  return out
}

// ---------------------------------------------------------------------------
// Screens

/** Plain full-screen text (fallback, e.g. "cannot reach the server"). Taps arrive as textEvent. */
export async function showText(bridge: EvenAppBridge, text: string): Promise<void> {
  const content = text.slice(0, MAX_TEXT_CHARS)
  if (layout === 'text') {
    if (content === lastText) return
    lastText = content
    await enqueue(() => bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: 1, containerName: 'main', content })))
    return
  }
  enter('text')
  lastText = content
  await page(bridge, { texts: [text_(1, 'main', 0, 0, W, H, content, { capture: true, pad: 10 })] })
}

/** Pairing: logo, the code in large type, and where to send it. */
export async function showPairing(bridge: EvenAppBridge, code: string, bot: string): Promise<void> {
  enter('pairing')
  if (!code) {
    await page(bridge, {
      texts: [text_(1, 'hint', BESIDE_LOGO, 4, W - BESIDE_LOGO, H - 4, t('connecting'), { capture: true })],
      images: [image_(10, 'logo', 10, 8, LOGO_W, LOGO_H, logoArt(LOGO_W, LOGO_H))],
    })
    return
  }
  await page(bridge, {
    texts: [
      text_(1, 'title', BESIDE_LOGO, 0, W - BESIDE_LOGO, 60, t('pairTitle', { bot }), { pad: 2 }),
      text_(2, 'hint', 0, 172, W, H - 172, t('pairHint', { code, bot }), { capture: true, pad: 6 }),
    ],
    images: [
      image_(10, 'logo', 10, 8, LOGO_W, LOGO_H, logoArt(LOGO_W, LOGO_H)),
      image_(11, 'code', (W - 288) / 2, 68, 288, 96, codeArt(code)),
    ],
  })
}

/** Ready and waiting: logo, what to do, a status line, and the voice note option (the list captures input). */
export async function showIdle(bridge: EvenAppBridge, bot: string, lang: string, notesChat?: string, toPerson = false): Promise<void> {
  enter('idle')
  const notesTo = notesChat ? clip(notesChat, 24) : `@${bot}`
  await page(bridge, {
    texts: [
      text_(
        1,
        'body',
        BESIDE_LOGO,
        0,
        W - BESIDE_LOGO,
        190,
        `${t('ready')}\n\n${t('idleBody', { bot, lang })}`,
        { pad: 2 },
      ),
      text_(2, 'bar', 8, 192, W - 16, 34, `${t('pairedBar', { lang })}          ${t('doubleTapExit')}`, { pad: 4 }),
    ],
    lists: [list_(3, 'idle-actions', 0, 232, W, H - 232, [t(toPerson ? 'recordNoteTo' : 'recordNoteSavedTo', { chat: notesTo })])],
    images: [image_(10, 'logo', 10, 8, LOGO_W, LOGO_H, logoArt(LOGO_W, LOGO_H))],
  })
}

export interface MessageView {
  from: string
  group?: string // group title, shown after the sender
  route: string // "French › English" or "Original · French"
  meta?: string // "♪ 0:12 · +2 waiting"
  voice: boolean
  body: string
  options: string[]
}

/** An incoming message: avatar + sender, the text in a left-hand bubble, and the reply options. */
export async function showMessage(bridge: EvenAppBridge, v: MessageView): Promise<void> {
  enter('message')
  const who = v.group ? `${clip(v.from, 16)}  ·  ${clip(v.group, 22)}` : clip(v.from, 30)
  const header = `${who}\n${v.route}${v.meta ? `  ·  ${v.meta}` : ''}`
  const bubble = { x: 0, y: 60, w: W - BUBBLE_GAP, h: 92 }
  await page(bridge, {
    texts: [
      text_(1, 'from', 60, 0, W - 60, 58, header, { pad: 1 }),
      text_(2, 'body', bubble.x, bubble.y, bubble.w, bubble.h, clip(v.body, 130), { border: 1, color: BRIGHT, radius: 16, pad: 6 }),
    ],
    lists: [list_(3, 'options', 0, 168, W, H - 168, v.options)],
    images: [
      image_(10, 'avatar', 6, 6, 44, 44, avatarArt(v.from, v.voice, 44)),
      tail_(11, 'left', bubble, BRIGHT, 1),
    ],
  })
}

export interface ConfirmView {
  to: string
  mineLabel: string // "You said · English"
  mine: string
  lang: string // the sender's language, named in the user's language
  translated: string
}

/** Review before sending: your words in a small dim bubble, then what will actually be sent
 *  in the main right-hand (outgoing) bubble. */
export async function showConfirm(bridge: EvenAppBridge, v: ConfirmView): Promise<void> {
  enter('confirm')
  const bubble = { x: BUBBLE_GAP - 24, y: 102, w: W - BUBBLE_GAP + 24, h: 86 }
  await page(bridge, {
    texts: [
      text_(1, 'to', 0, 0, W, 32, `→  ${t('replyTo', { name: clip(v.to, 40) })}`, { pad: 2 }),
      text_(2, 'mine', BUBBLE_GAP + 16, 30, W - BUBBLE_GAP - 16, 68, `${v.mineLabel}\n${clip(v.mine, 40)}`, { border: 1, color: DIM, radius: 16, pad: 3 }),
      text_(3, 'sent', bubble.x, bubble.y, bubble.w, bubble.h, `${t('sendsIn', { lang: v.lang })}\n${clip(v.translated, 100)}`, { border: 2, color: BRIGHT, radius: 16, pad: 5 }),
    ],
    lists: [list_(4, 'actions', 0, 204, W, H - 204, [t('sendIn', { lang: v.lang }), t('back')])],
    images: [tail_(10, 'right', bubble, BRIGHT, 2)],
  })
}

export interface SentView {
  title: string // "Sent"
  detail: string // "to Yuki Tanaka"
  text: string // what was sent
  footer: string // what tapping does
}

/** After sending: the reply as an outgoing bubble, with a check and who it went to underneath. */
export async function showSent(bridge: EvenAppBridge, v: SentView): Promise<void> {
  enter('sent')
  const bubble = { x: BUBBLE_GAP - 24, y: 8, w: W - BUBBLE_GAP + 24, h: 100 }
  await page(bridge, {
    texts: [
      text_(1, 'sent', bubble.x, bubble.y, bubble.w, bubble.h, clip(v.text, 140), { border: 2, color: BRIGHT, radius: 16, pad: 6 }),
      text_(2, 'status', 84, 142, W - 84, H - 142, `${v.title}  ·  ${clip(v.detail, 40)}\n\n${v.footer}`, { capture: true, pad: 2 }),
    ],
    images: [tail_(10, 'right', bubble, BRIGHT, 2), image_(11, 'icon', 12, 136, 60, 60, statusArt('sent', 60))],
  })
}

/** Working: the logo and an animated "…" while translating / transcribing / sending. */
export async function showBusy(bridge: EvenAppBridge, text: string): Promise<void> {
  const base = text.replace(/\.+$|…$/, '')
  enter('busy')
  await page(bridge, {
    texts: [text_(1, 'busy', BESIDE_LOGO, 4, W - BESIDE_LOGO, H - 4, `${base}…`, { capture: true, pad: 2 })],
    images: [image_(10, 'mark', 10, 8, LOGO_W, LOGO_H, statusArt('busy', LOGO_W))],
  })
  let dots = 0
  busyTimer = window.setInterval(() => {
    if (layout !== 'busy') return window.clearInterval(busyTimer)
    dots = (dots + 1) % 4
    const content = `${base}${'.'.repeat(dots)}`
    void enqueue(() => bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: 1, containerName: 'busy', content })))
  }, 500)
}

/** Result screens: sent (check) or error (exclamation), with a title, detail and what tapping does. */
export async function showStatus(bridge: EvenAppBridge, kind: Exclude<StatusIcon, 'busy'>, title: string, detail: string, footer: string): Promise<void> {
  enter('status')
  await page(bridge, {
    texts: [text_(1, 'status', 94, 4, W - 94, H - 4, `${title}\n\n${clip(detail, 200)}\n\n${footer}`, { capture: true, pad: 2 })],
    images: [image_(10, 'icon', 10, 8, 64, 64, statusArt(kind, 64))],
  })
}

/** Recording: "REC" timer on top, live waveform in the middle, instructions below. */
export async function showRecording(bridge: EvenAppBridge, timer: string, hint: string): Promise<void> {
  enter('record')
  lastTimer = timer
  frameBusy = false
  await page(bridge, {
    texts: [
      text_(1, 'rec-time', 0, 0, W, REC_TIMER_H, timer, { pad: 6 }),
      text_(2, 'rec-hint', 0, REC_TIMER_H + WAVE_H + 8, W, H - (REC_TIMER_H + WAVE_H + 8), hint.slice(0, MAX_TEXT_CHARS), { capture: true, pad: 6 }),
    ],
    images: [image_(3, 'rec-wave', (W - WAVE_W) / 2, REC_TIMER_H + 4, WAVE_W, WAVE_H, waveFrame([], 0, true))],
  })
}

/** Live update while recording: the timer (only when it changes) and one waveform frame.
 *  A frame is dropped if the previous one is still being sent, so the glasses never queue up images. */
export async function updateRecording(bridge: EvenAppBridge, timer: string, frame: () => Promise<number[]>): Promise<void> {
  if (layout !== 'record') return
  const current = pageNumber
  if (timer !== lastTimer) {
    lastTimer = timer
    void enqueue(async () => {
      if (current !== pageNumber) return
      await bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: 1, containerName: 'rec-time', content: timer }))
    })
  }
  if (frameBusy) return
  frameBusy = true
  try {
    await sendImage(bridge, current, 3, 'rec-wave', await frame())
  } finally {
    frameBusy = false
  }
}

// ---------------------------------------------------------------------------
// Building blocks

interface TextOpts {
  capture?: boolean
  border?: number
  color?: number
  radius?: number
  pad?: number
}

function text_(id: number, name: string, x: number, y: number, w: number, h: number, content: string, o: TextOpts = {}) {
  return new TextContainerProperty({
    xPosition: x,
    yPosition: y,
    width: w,
    height: h,
    borderWidth: o.border ?? 0,
    borderColor: o.color ?? 0,
    borderRadius: o.radius ?? 0,
    paddingLength: o.pad ?? 6,
    containerID: id,
    containerName: name,
    content: content.slice(0, MAX_TEXT_CHARS),
    isEventCapture: o.capture ? 1 : 0,
  })
}

function list_(id: number, name: string, x: number, y: number, w: number, h: number, items: string[]) {
  return new ListContainerProperty({
    xPosition: x,
    yPosition: y,
    width: w,
    height: h,
    borderWidth: 0,
    borderColor: 0,
    paddingLength: 2,
    containerID: id,
    containerName: name,
    isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: items.length,
      itemWidth: w - 8,
      isItemSelectBorderEn: 1,
      itemName: items.map(i => clipBytes(i)),
    }),
  })
}

interface ImageSpec {
  prop: ImageContainerProperty
  id: number
  name: string
  data: Promise<number[]>
}

function image_(id: number, name: string, x: number, y: number, w: number, h: number, data: Promise<number[]>): ImageSpec {
  return { prop: new ImageContainerProperty({ xPosition: x, yPosition: y, width: w, height: h, containerID: id, containerName: name }), id, name, data }
}

/** A bubble tail under a card: bottom-left (incoming) or bottom-right (outgoing).
 *  It overlaps the card's bottom border so the black top rows open a gap where the tail joins. */
function tail_(id: number, side: 'left' | 'right', card: { x: number; y: number; w: number; h: number }, color: number, line: number): ImageSpec {
  const x = side === 'left' ? card.x + 14 : card.x + card.w - 14 - TAIL_W
  const y = card.y + card.h - line
  return image_(id, `tail-${side}`, x, y, TAIL_W, TAIL_H, tailArt(side, TAIL_W, TAIL_H, color, line))
}

/** Builds a page and then fills its images, one at a time. */
async function page(
  bridge: EvenAppBridge,
  p: { texts?: TextContainerProperty[]; lists?: ListContainerProperty[]; images?: ImageSpec[] },
): Promise<void> {
  const images = p.images ?? []
  const n = await render(bridge, {
    containerTotalNum: (p.texts?.length ?? 0) + (p.lists?.length ?? 0) + images.length,
    textObject: p.texts?.length ? p.texts : undefined,
    listObject: p.lists?.length ? p.lists : undefined,
    imageObject: images.length ? images.map(i => i.prop) : undefined,
  })
  for (const img of images) await sendImage(bridge, n, img.id, img.name, await img.data)
}

function enter(next: Layout): void {
  if (busyTimer !== undefined) window.clearInterval(busyTimer)
  busyTimer = undefined
  layout = next
  lastText = ''
}

// Page rebuilds and image transfers go through one queue: images must not be sent concurrently
// (SDK rule), and an image sent while its page is being replaced fails ("container not found").
let queue: Promise<unknown> = Promise.resolve()
let pageNumber = 0 // increments on every rebuild

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job)
  queue = run.catch(err => console.warn('[glasses]', err))
  return run
}

function sendImage(bridge: EvenAppBridge, onPage: number, id: number, name: string, imageData: number[]): Promise<void> {
  return enqueue(async () => {
    if (onPage !== pageNumber) return // that screen is already gone
    const result = await bridge.updateImageRawData(new ImageRawDataUpdate({ containerID: id, containerName: name, imageData }))
    if (String(result) !== 'success') console.warn(`[glasses] image ${name} not shown:`, result)
  })
}

async function render(
  bridge: EvenAppBridge,
  p: {
    containerTotalNum: number
    textObject?: TextContainerProperty[]
    listObject?: ListContainerProperty[]
    imageObject?: ImageContainerProperty[]
  },
): Promise<number> {
  return enqueue(async () => {
    if (!started) {
      // The first page must be created with createStartUpPageContainer; later ones are rebuilt.
      started = true
      await bridge.createStartUpPageContainer(new CreateStartUpPageContainer(p))
    } else {
      await bridge.rebuildPageContainer(new RebuildPageContainer(p))
    }
    return ++pageNumber
  })
}
