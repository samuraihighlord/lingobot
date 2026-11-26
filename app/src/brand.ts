// LingoBot brand: logo mark (two speech bubbles forming a pair of glasses, "A" -> "文")
// and the wordmark. Pure SVG/HTML strings so they work offline inside the Even app WebView.

export const GREEN = '#3cfa44'
export const INK = '#061006'

// The drawing sits on a 64 x 64 grid; the mark is cropped to its content (60 x 35) so it fills its box.
const VIEW = { x: 2, y: 12, w: 60, h: 35 }

/** The logo mark. `height` in px (width follows the 60:35 shape); G2 green on transparent by default. */
export function logoSvg(height = 32, color = GREEN, ink = INK): string {
  const width = Math.round((height * VIEW.w) / VIEW.h)
  return `<svg class="lb-mark" width="${width}" height="${height}" viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}" role="img" aria-label="LingoBot logo"
    xmlns="http://www.w3.org/2000/svg" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <!-- left lens: incoming message (outlined bubble, tail bottom-left) -->
  <path d="M14 16H20A9 9 0 0 1 29 25V29A9 9 0 0 1 20 38H16L9.5 44.5L10.5 36.8A9 9 0 0 1 5 29V25A9 9 0 0 1 14 16Z"
    stroke="${color}" stroke-width="3"/>
  <path d="M12.6 33.2L17 21.6L21.4 33.2M14.3 29H19.7" stroke="${color}" stroke-width="2.6"/>
  <!-- bridge -->
  <path d="M29 23.5Q32 19.5 35 23.5" stroke="${color}" stroke-width="3"/>
  <!-- right lens: translated reply (filled bubble, tail bottom-right) -->
  <path d="M50 16H44A9 9 0 0 0 35 25V29A9 9 0 0 0 44 38H48L54.5 44.5L53.5 36.8A9 9 0 0 0 59 29V25A9 9 0 0 0 50 16Z"
    fill="${color}" stroke="${color}" stroke-width="3"/>
  <path d="M47 19.6V21.4M41.4 23.4H52.6M43.8 23.8Q46.2 31 52.6 34.2M50.2 23.8Q47.8 31 41.4 34.2"
    stroke="${ink}" stroke-width="2.4"/>
</svg>`
}

/** Square app icon (dark tile) for favicons / store listings. */
export function appIconSvg(px = 512): string {
  const inner = logoSvg(32).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="#121412"/><g transform="translate(6 6) scale(.8125)" fill="none" stroke-linecap="round" stroke-linejoin="round">${inner}</g></svg>`
}

/** Logo + "LingoBot" wordmark. */
export function lockupHtml(height = 30): string {
  return `<span class="lb-lockup">${logoSvg(height)}<span class="lb-word"><span>Lingo</span><b>Bot</b></span></span>`
}

export const BRAND_CSS = `
.lb-lockup { display: inline-flex; align-items: center; gap: 10px; }
.lb-mark { flex: none; display: block; }
.lb-word { font: 800 22px/1 -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif;
  letter-spacing: -0.035em; color: var(--text, #e8ece8); white-space: nowrap; }
.lb-word b { font-weight: 800; color: ${GREEN}; }
`
