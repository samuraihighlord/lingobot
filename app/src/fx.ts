// Liquid-glass interaction layer for the companion page: cursor halo, glass spotlight,
// gentle card tilt, magnetic buttons, press ripples and real vibration where supported.
// Pure DOM + CSS variables; everything is skipped when the user prefers reduced motion.

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches

const PRESSABLE = 'button, .primary, .chip, .lens-opts li'
const MAGNETIC = 'button, .primary'
const TILT = '.card'

/** A short physical tick on phones (Android/Chrome); silently ignored elsewhere (iOS has no web vibration API). */
export function haptic(pattern: number | number[] = 8): void {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* not supported */
  }
}

export function mountFx(): void {
  const root = document.documentElement
  const halo = document.querySelector<HTMLElement>('.cursor-halo')

  // --- Pointer tracking (one rAF per frame) ------------------------------------
  let px = innerWidth / 2
  let py = innerHeight / 3
  let frame = 0
  let hovered: HTMLElement | null = null
  let magnet: HTMLElement | null = null

  const paint = () => {
    frame = 0
    root.style.setProperty('--mx', `${px}px`)
    root.style.setProperty('--my', `${py}px`)
    if (halo) halo.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%)`

    // Glass spotlight + tilt on the card under the pointer.
    const card = (document.elementFromPoint(px, py) as HTMLElement | null)?.closest<HTMLElement>(TILT) ?? null
    if (hovered && hovered !== card) resetCard(hovered)
    hovered = card
    if (card) {
      const r = card.getBoundingClientRect()
      const x = px - r.left
      const y = py - r.top
      card.style.setProperty('--x', `${x}px`)
      card.style.setProperty('--y', `${y}px`)
      card.classList.add('lit')
      if (finePointer && !reduceMotion) {
        const rx = ((y / r.height) - 0.5) * -3.2 // degrees; subtle on purpose
        const ry = ((x / r.width) - 0.5) * 3.2
        card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(0)`
      }
    }

    // Magnetic pull on the button under the pointer.
    if (finePointer && !reduceMotion) {
      const btn = (document.elementFromPoint(px, py) as HTMLElement | null)?.closest<HTMLElement>(MAGNETIC) ?? null
      if (magnet && magnet !== btn) magnet.style.translate = ''
      magnet = btn
      if (btn && !btn.classList.contains('disabled') && !(btn as HTMLButtonElement).disabled) {
        const r = btn.getBoundingClientRect()
        const dx = (px - (r.left + r.width / 2)) / r.width
        const dy = (py - (r.top + r.height / 2)) / r.height
        btn.style.translate = `${dx * 6}px ${dy * 5}px`
        btn.style.setProperty('--bx', `${px - r.left}px`)
        btn.style.setProperty('--by', `${py - r.top}px`)
      }
    }
  }

  const resetCard = (card: HTMLElement) => {
    card.classList.remove('lit')
    card.style.transform = ''
  }

  addEventListener(
    'pointermove',
    e => {
      px = e.clientX
      py = e.clientY
      root.classList.add('pointer-active')
      if (!frame) frame = requestAnimationFrame(paint)
    },
    { passive: true },
  )
  document.addEventListener('pointerleave', () => {
    root.classList.remove('pointer-active')
    if (hovered) resetCard(hovered)
    if (magnet) magnet.style.translate = ''
    hovered = magnet = null
  })

  // --- Press: squish, light ripple, haptic tick ---------------------------------
  document.addEventListener(
    'pointerdown',
    e => {
      const target = (e.target as HTMLElement).closest<HTMLElement>(PRESSABLE)
      if (!target || (target as HTMLButtonElement).disabled || target.classList.contains('disabled')) return
      haptic(target.classList.contains('danger') ? [6, 40, 10] : 8)
      target.classList.add('pressed')
      if (!reduceMotion) ripple(target, e.clientX, e.clientY)
      const release = () => {
        target.classList.remove('pressed')
        removeEventListener('pointerup', release)
        removeEventListener('pointercancel', release)
      }
      addEventListener('pointerup', release)
      addEventListener('pointercancel', release)
    },
    { passive: true },
  )

  // --- Cards float in on load -----------------------------------------------------
  document.querySelectorAll<HTMLElement>('.card, .top').forEach((node, i) => {
    node.style.setProperty('--i', String(i))
    node.classList.add('rise')
    // Drop the class once done, so the animation never pins `transform` and the tilt can take over.
    node.addEventListener('animationend', () => node.classList.remove('rise'), { once: true })
  })
}

function ripple(host: HTMLElement, x: number, y: number): void {
  const r = host.getBoundingClientRect()
  const size = Math.max(r.width, r.height) * 2.2
  const dot = document.createElement('span')
  dot.className = 'ripple'
  dot.style.width = dot.style.height = `${size}px`
  dot.style.left = `${x - r.left - size / 2}px`
  dot.style.top = `${y - r.top - size / 2}px`
  host.appendChild(dot)
  dot.addEventListener('animationend', () => dot.remove(), { once: true })
}

/** A soft glow pulse on an element (e.g. when a new message arrives on the glasses). */
export function pulse(node: Element | null): void {
  if (!node || reduceMotion) return
  node.classList.remove('pulse')
  void (node as HTMLElement).offsetWidth // restart the animation
  node.classList.add('pulse')
}
