// Companion page on the phone (inside the Even Realities app) and in the browser during development.
// The glasses show the real UI; this page helps you pair, mirrors what the glasses show,
// and explains setup. It never holds API keys.
import { BRAND_CSS, lockupHtml } from './brand'
import { haptic, mountFx, pulse } from './fx'

export interface NowView {
  from: string
  group?: string // group title, shown after the sender
  route: string // e.g. "French → English"
  text: string
  said?: { label: string; text: string } // the user's own words (voice transcript) shown above the translation
  options?: string[] // reply drafts
  state?: string // "Listening…", "Translating…", "Send in French?" …
}

const el = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!

let code = ''
let bot = 'thelingo_bot'
let paired = false
let disconnectHandler: (() => void) | null = null
let confirmTimer: number | undefined

/** Called when the user confirms "Disconnect" on the page. */
export function onDisconnect(handler: () => void): void {
  disconnectHandler = handler
}

export function mountPhoneUi(): void {
  document.head.insertAdjacentHTML('beforeend', `<style>${CSS}${BRAND_CSS}</style>`)
  el('#app').innerHTML = `
    <div class="ambient" aria-hidden="true"><div class="glyphs">${glyphField()}</div><i class="orb o1"></i><i class="orb o2"></i><i class="orb o3"></i><i class="grain"></i></div>
    <div class="cursor-halo" aria-hidden="true"></div>
    <main class="page">
      <header class="top">
        <div class="brand">
          <h1 class="sr-only">LingoBot</h1>
          ${lockupHtml(30)}
          <p class="tagline">Telegram, translated on your G2</p>
        </div>
        <span id="status" class="chip"><i class="led"></i><span id="status-text">Connecting…</span></span>
      </header>

      <section id="pair" class="card pair">
        <div class="eyebrow">Pair with Telegram</div>
        <div class="code-row">
          <div id="code" class="code" aria-live="polite">LB-····</div>
          <button id="copy" class="ghost" type="button">Copy</button>
        </div>
        <a id="open-bot" class="primary" href="#" target="_blank" rel="noopener">Open Telegram to pair</a>
        <p id="hint" class="hint">Getting a code…</p>
      </section>

      <section id="paired" class="card paired" hidden>
        <div class="account">
          <span id="avatar" class="avatar" aria-hidden="true">?</span>
          <div class="account-text">
            <div class="eyebrow tight">Paired Telegram account</div>
            <div id="user-name" class="user-name">Telegram user</div>
            <div id="user-handle" class="user-handle"></div>
          </div>
          <span class="dot on" title="Paired" aria-hidden="true"></span>
        </div>
        <div class="hint account-meta">Via <span id="bot-name">@thelingo_bot</span> · Language: <strong id="lang">English</strong> · <code>/lang</code> changes it on the glasses, in the bot and for translations</div>
        <button id="disconnect" class="danger" type="button">Disconnect this account</button>
      </section>

      <section class="card hero">
        <div class="eyebrow">What LingoBot does</div>
        <h2 class="hero-title">Read any language.<br /><span>Reply in yours.</span></h2>
        <p class="hero-sub">Telegram messages and voice notes, in any language, translated on your G2 lenses.
          Answer by voice in your own language and it is sent in theirs. You never have to take out your phone.</p>
        <p class="sr-only">Example: a French voice note from a supplier is transcribed and shown in English on the glasses.
          You say “Yes, Thursday works” and LingoBot sends it in French.</p>
        <div class="story" aria-hidden="true">
          <ol class="rail">
            <li><i></i>Forward</li><li><i></i>Detect</li><li><i></i>Glance</li><li><i></i>Reply</li>
          </ol>
          <div class="beat s-in">
            <div class="bubble">
              <div class="bubble-head"><b class="s-from"></b><span class="s-who"></span></div>
              <div class="s-body"></div>
            </div>
            <span class="tag s-tag"></span>
          </div>
          <div class="beam s-beam1"><i></i></div>
          <div class="lens mini s-lens">
            <div class="lens-head"><span>On your G2</span><span class="route s-route"></span></div>
            <p class="lens-text s-trans"></p>
          </div>
          <div class="beam s-beam2"><i></i></div>
          <div class="beat s-out">
            <div class="bubble mine">
              <div class="bubble-head"><span class="s-how"></span><span class="sent">Sent ✓</span></div>
              <p class="s-reply"></p>
            </div>
          </div>
        </div>
      </section>


      <section class="card now">
        <div class="eyebrow">On your glasses now</div>
        <div id="now" class="lens"><div class="lens-empty">Waiting for a message…</div></div>
      </section>

      <section class="card">
        <div class="eyebrow">Everything it does for you</div>
        <ul class="feats">${FEATURES.map(
          f => `<li><span class="ico">${f.icon}</span><div><b>${f.title}</b><p>${f.text}</p></div></li>`,
        ).join('')}</ul>
      </section>

      <section class="card">
        <div class="eyebrow">Get messages on your glasses</div>
        <ol class="steps">
          <li><strong>Forward</strong> any message or voice note to <span class="bot-ref">@thelingo_bot</span>. Voice notes are transcribed first.
            Reply on the glasses, then type <span class="bot-ref">@thelingo_bot</span> in the original chat and tap your reply to send it.</li>
          <li><strong>Private chats, automatically</strong> (Telegram Premium): Settings → Telegram Business → Chatbots → add
            <span class="bot-ref">@thelingo_bot</span>, choose chats, allow <em>Reply to messages</em>. Messages not in your language
            reach the glasses by themselves, and replies are sent as you.</li>
          <li><strong>Follow people in a group, privately</strong>: add the bot to the group, then tap <code>/follow</code> in your
            private chat with <span class="bot-ref">@thelingo_bot</span> and pick the group and the people. As long as you follow
            someone, every message they post, text or voice, comes to the glasses, in any language, including your own: then
            it is shown exactly as written, with no translation needed. Nothing is posted in the group.</li>
          <li><strong>Watch a whole group</strong>: in <code>/follow</code> choose <em>Everything not in my language</em> or
            <em>Mentions of me &amp; replies to me</em> (or send <code>/watch</code> / <code>/watch mentions</code> in the group).
            Your replies are posted under the original message. <code>/watching</code> lists what you watch.</li>
          <li><strong>Glasses off?</strong> Nothing is lost: the translation is sent to your chat with
            <span class="bot-ref">@thelingo_bot</span> instead.</li>
        </ol>
        <p class="hint">Talking with someone who speaks another language? Make a Telegram group with them and
          <span class="bot-ref">@thelingo_bot</span>, <code>/follow</code> them so their messages reach your glasses translated, and
          set your voice notes to their language (below).</p>
      </section>

      <section class="card">
        <div class="eyebrow">Send voice notes from your glasses</div>
        <ol class="steps">
          <li><strong>Choose where they go</strong>: <code>/notes</code> in your chat with <span class="bot-ref">@thelingo_bot</span>.
            Pick one of your groups (a group with only you and the bot makes a private notebook), a person, or the chat with the bot.</li>
          <li><strong>In their language</strong>: in <code>/notes</code> tap 🌐 and pick the language they read, or send
            <code>/notes lang Spanish</code>. You speak in yours. They get your voice with the transcript translated
            into theirs, and your own words underneath. Any language works here, because they read it on their phone.</li>
          <li><strong>Record</strong>: on the Ready screen choose <em>Record a voice note</em>, speak, and tap to stop (2 minutes max).</li>
        </ol>
      </section>

      <section class="card">
        <div class="eyebrow">Controls</div>
        <dl class="controls">
          <dt>Swipe</dt><dd>Move between options</dd>
          <dt>Tap</dt><dd>Choose · start / stop recording</dd>
          <dt>Double-tap</dt><dd>Exit LingoBot</dd>
        </dl>
      </section>

      <footer class="foot">Translations are AI-generated. “Show original” is always one tap away.</footer>
    </main>`

  el('#copy').addEventListener('click', async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(`/start ${code}`)
      haptic([6, 30, 6])
      flash(el('#copy'), 'Copied')
    } catch {
      flash(el('#copy'), 'Copy failed')
    }
  })
  const disconnect = el<HTMLButtonElement>('#disconnect')
  disconnect.addEventListener('click', () => {
    // Two taps: the first arms the button, the second disconnects (WebView confirm() dialogs are unreliable).
    if (!disconnect.classList.contains('armed')) {
      disconnect.classList.add('armed')
      disconnect.textContent = 'Tap again to disconnect'
      confirmTimer = window.setTimeout(resetDisconnect, 4000)
      return
    }
    window.clearTimeout(confirmTimer)
    disconnect.disabled = true
    disconnect.textContent = 'Disconnecting…'
    confirmTimer = window.setTimeout(resetDisconnect, 8000) // no answer (offline): let the user retry
    disconnectHandler?.()
  })
  refreshLinks()
  mountFx()
  startStory()
}

// ---------------------------------------------------------------------------
// "What LingoBot does": a looping demo of one message going through the bot.

interface Story {
  from: string
  who: string
  lang: string
  voice?: string // voice-note length; absent = text message
  original: string
  translation: string
  how: string // how the user answered
  reply: string // in the user's language
  sent: string // in the sender's language
}

const STORIES: Story[] = [
  {
    from: 'Amadou', who: 'Supplier', lang: 'French', voice: '0:12',
    original: 'Bonjour, la livraison part jeudi. Vous pouvez confirmer ?',
    translation: 'Hi, the delivery leaves on Thursday. Can you confirm?',
    how: 'You said', reply: 'Yes, Thursday works. Thanks!', sent: 'Oui, jeudi me convient. Merci !',
  },
  {
    from: 'Lin', who: 'Crypto group', lang: 'Chinese',
    original: '明晚八点开会，记得带上报告。',
    translation: 'Meeting tomorrow at 8 pm, remember to bring the report.',
    how: 'AI draft 2 of 3', reply: 'Got it, I’ll be there with the report.', sent: '收到，我会带着报告准时到。',
  },
  {
    from: 'Mamá', who: 'Family', lang: 'Spanish', voice: '0:08',
    original: '¿Vienes a cenar el domingo? Hago paella.',
    translation: 'Are you coming to dinner on Sunday? I’m making paella.',
    how: 'You said', reply: 'Of course! I’ll bring dessert.', sent: '¡Claro! Yo llevo el postre.',
  },
  {
    from: 'Kenji', who: 'Client', lang: 'Japanese',
    original: '資料ありがとうございます。明日ご連絡します。',
    translation: 'Thank you for the documents. I’ll get back to you tomorrow.',
    how: 'AI draft 1 of 3', reply: 'You’re welcome, talk tomorrow!', sent: 'どういたしまして。また明日！',
  },
]

const stroke = (d: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`

const FEATURES = [
  { title: 'Any language in', text: 'Detects the language by itself, text or voice. No setup per chat.',
    icon: stroke('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>') },
  { title: 'Voice notes, read', text: 'Transcribed and translated onto the lens. No headphones needed.',
    icon: stroke('<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>') },
  { title: '3 smart replies', text: 'AI drafts that fit the conversation. Pick one with a swipe and a tap.',
    icon: stroke('<path d="M4 6h16M4 12h10M4 18h13"/>') },
  { title: 'Speak, sent in theirs', text: 'Talk in your own language and check the translation before it goes out.',
    icon: stroke('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>') },
  { title: 'Watches chats for you', text: 'Private chats through Telegram Business, whole groups, or just the people you follow.',
    icon: stroke('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>') },
  { title: 'Your language, everywhere', text: '/lang sets one language for the translations, the glasses screens and the bot. Scripts the G2 cannot display yet (Arabic, Hindi, Thai…) are marked “not available yet”.',
    icon: stroke('<path d="M4 5h9M8.5 3v2M6 5c.6 3 2.6 5.6 5 7M11 5c-.8 3.4-3.2 6.4-6 8"/><path d="M12 21l4.5-10L21 21M13.5 18h6"/>') },
  { title: 'Voice notes, translated', text: 'Record on the glasses and send to a group or a person, with the transcript in their language.',
    icon: stroke('<path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z"/><path d="M5 11a7 7 0 0 0 10.5 6M19 11a7 7 0 0 1-.6 2.8M12 18v3"/>') },
  { title: 'Private by design', text: 'Messages live only in memory and API keys stay on the server. “Show original” is always one tap away.',
    icon: stroke('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>') },
]

const SCRAMBLE = 'AΩЖبשअকกあア文語ÑßԱაψЯçق#%&'

function scramble(node: HTMLElement, text: string, ms = 900): Promise<void> {
  return new Promise(done => {
    const chars = [...text]
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms)
      const n = Math.floor(p * chars.length)
      let tail = ''
      for (let k = n; k < Math.min(chars.length, n + 10); k++)
        tail += chars[k] === ' ' ? ' ' : SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0]
      node.innerHTML = `${esc(chars.slice(0, n).join(''))}<i class="scr">${esc(tail)}</i>`
      if (p < 1) requestAnimationFrame(tick)
      else done()
    }
    requestAnimationFrame(tick)
  })
}

function startStory(): void {
  const root = el('.story')
  const q = (sel: string) => root.querySelector<HTMLElement>(sel)!
  const rail = [...root.querySelectorAll<HTMLElement>('.rail li')]
  const parts = ['.s-in', '.s-tag', '.s-beam1', '.s-lens', '.s-beam2', '.s-out', '.sent']
  const on = (sel: string, v = true) => q(sel).classList.toggle('on', v)
  const step = (n: number) => rail.forEach((li, k) => {
    li.classList.toggle('done', k < n)
    li.classList.toggle('now', k === n)
  })
  const wait = async (ms: number) => {
    await new Promise(r => setTimeout(r, ms))
    while (document.hidden) await new Promise(r => setTimeout(r, 400)) // pause while the page is not visible
  }
  const voiceHtml = (s: Story) =>
    `<span class="voice"><i class="play"></i><span class="wave">${Array.from({ length: 22 }, (_, k) =>
      `<i style="--h:${(30 + Math.abs(Math.sin(k * 1.7 + s.original.length)) * 70).toFixed(0)}%;--d:${k * 45}ms"></i>`).join('')}</span><span>${s.voice}</span></span>`

  const fill = (s: Story) => {
    q('.s-from').textContent = s.from
    q('.s-who').textContent = s.who
    q('.s-body').innerHTML = s.voice ? voiceHtml(s) : `<p class="orig">${esc(s.original)}</p>`
    q('.s-route').textContent = `${s.lang} → English`
    q('.s-trans').textContent = ''
    q('.s-how').textContent = s.how
    q('.s-reply').textContent = ''
  }

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const s = STORIES[0]
    fill(s)
    q('.s-body').insertAdjacentHTML('beforeend', `<p class="orig">${esc(s.original)}</p>`)
    q('.s-tag').textContent = `Detected · ${s.lang}`
    q('.s-trans').textContent = s.translation
    q('.s-how').textContent = `Sent in ${s.lang}`
    q('.s-reply').textContent = s.sent
    parts.forEach(p => on(p))
    step(4)
    return
  }

  void (async () => {
    for (let i = 0; ; i++) {
      const s = STORIES[i % STORIES.length]
      parts.forEach(p => on(p, false))
      root.classList.remove('fade')
      fill(s)
      await wait(350)

      step(0)
      on('.s-in')
      await wait(1100)

      step(1)
      q('.s-tag').textContent = s.voice ? `Transcribing · ${s.lang}` : `Detected · ${s.lang}`
      on('.s-tag')
      if (s.voice) {
        q('.s-body').classList.add('playing')
        await wait(1000)
        q('.s-body').classList.remove('playing')
        q('.s-body').insertAdjacentHTML('beforeend', '<p class="orig"></p>')
        await scramble(q('.s-body .orig'), s.original, 700)
        q('.s-tag').textContent = `Detected · ${s.lang}`
      }
      await wait(600)

      step(2)
      on('.s-beam1')
      on('.s-lens')
      await scramble(q('.s-trans'), s.translation, 1000)
      await wait(1700)

      step(3)
      on('.s-beam2')
      on('.s-out')
      await scramble(q('.s-reply'), s.reply, 600)
      await wait(1100)
      q('.s-how').textContent = `Sent in ${s.lang}`
      await scramble(q('.s-reply'), s.sent, 800)
      on('.sent')
      step(4)
      await wait(2600)

      root.classList.add('fade')
      await wait(500)
    }
  })()
}

function resetDisconnect(): void {
  const b = el<HTMLButtonElement>('#disconnect')
  window.clearTimeout(confirmTimer)
  b.classList.remove('armed')
  b.disabled = false
  b.textContent = 'Disconnect this account'
}

export function setCode(next: string): void {
  code = next
  el('#code').textContent = next
  refreshLinks()
}

export function setHint(text: string): void {
  el('#hint').textContent = text
}

export function setOnline(online: boolean, text?: string): void {
  const chip = el('#status')
  chip.className = `chip ${online ? 'on' : 'off'}`
  el('#status-text').textContent = text ?? (online ? 'Connected' : 'Offline')
}

/** Called on every 'state' message from the server. */
export function setPairing(
  isPaired: boolean,
  botUsername: string,
  userLang?: string,
  user?: { name: string; username?: string },
): void {
  paired = isPaired
  bot = botUsername
  el('#pair').hidden = paired
  el('#paired').hidden = !paired
  resetDisconnect()
  el('#bot-name').textContent = `@${bot}`
  if (userLang) el('#lang').textContent = userLang
  el('#user-name').textContent = user?.name ?? 'Telegram user'
  el('#user-handle').textContent = user?.username ? `@${user.username}` : 'No public username'
  el('#avatar').textContent = (user?.name.trim()[0] ?? '?').toUpperCase()
  refreshLinks()
}

/** Mirrors the glasses screen; null = nothing waiting. */
export function setNow(view: NowView | null): void {
  const box = el('#now')
  if (!view) {
    box.innerHTML = `<div class="lens-empty">${paired ? 'Waiting for a message…' : 'Pair to start receiving messages.'}</div>`
    return
  }
  box.innerHTML = `
    <div class="lens-head"><span>${esc(view.group ? `${view.from} · ${view.group}` : view.from)}</span><span class="route">${esc(view.route)}</span></div>
    ${view.said ? `<div class="lens-said"><span>${esc(view.said.label)}</span><p>${esc(view.said.text)}</p></div>` : ''}
    <p class="lens-text">${esc(view.text)}</p>
    ${view.state ? `<div class="lens-state">${esc(view.state)}</div>` : ''}
    ${view.options?.length ? `<ul class="lens-opts">${view.options.map(o => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}`
  pulse(box.closest('.card'))
}

// ---------------------------------------------------------------------------

function refreshLinks(): void {
  const link = el<HTMLAnchorElement>('#open-bot')
  // Telegram deep link: opens the bot and sends "/start <code>" when the user taps Start.
  link.href = code ? `https://t.me/${bot}?start=${encodeURIComponent(code)}` : `https://t.me/${bot}`
  link.classList.toggle('disabled', !code)
  document.querySelectorAll('.bot-ref').forEach(n => (n.textContent = `@${bot}`))
}

function flash(button: HTMLElement, text: string): void {
  const before = button.dataset.label ?? button.textContent ?? ''
  button.dataset.label = before
  button.textContent = text
  setTimeout(() => (button.textContent = before), 1400)
}

// Letters from many writing systems drifting behind the page (decorative, blurred, never read).
const GLYPHS = [
  'A', 'Ω', 'Ж', 'ب', 'ש', 'अ', 'অ', 'க', 'ก', '한', 'あ', 'ア', '文', '語', 'Ẹ', 'ƙ', 'ị', 'Ñ', 'ß', 'Ա', 'ა', 'ع', 'ه', 'ψ', 'Я', 'ñ', 'ç', 'ق',
]

function glyphField(count = 26): string {
  const rand = (min: number, max: number) => min + Math.random() * (max - min)
  const pick = [...GLYPHS].sort(() => Math.random() - 0.5)
  let html = ''
  for (let i = 0; i < count; i++) {
    const depth = Math.random() // 0 = near (smaller blur), 1 = far (big, very soft)
    const size = Math.round(rand(28, 64) + depth * 90)
    const style = [
      `left:${rand(-4, 96).toFixed(1)}%`,
      `top:${rand(-4, 96).toFixed(1)}%`,
      `font-size:${size}px`,
      `--blur:${(3 + depth * 7).toFixed(1)}px`,
      `--alpha:${(0.16 - depth * 0.08).toFixed(3)}`,
      `--dx:${rand(-40, 40).toFixed(0)}px`,
      `--dy:${rand(-70, -20).toFixed(0)}px`,
      `--rot:${rand(-18, 18).toFixed(0)}deg`,
      `animation-duration:${rand(22, 48).toFixed(1)}s`,
      `animation-delay:${(-rand(0, 40)).toFixed(1)}s`,
    ].join(';')
    html += `<span style="${style}">${pick[i % pick.length]}</span>`
  }
  return html
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

// Liquid-glass theme. Glass = translucent fill + backdrop blur + rim light + a spotlight that
// follows the cursor (--x/--y set by fx.ts). Ambient orbs give the blur something to refract.
const CSS = `
:root {
  color-scheme: dark;
  --bg: #050806;
  --text: #f1f6f1; --muted: rgba(229, 240, 229, .62); --faint: rgba(229, 240, 229, .38);
  --green: #3cfa44; --green-soft: rgba(60, 250, 68, .16); --green-glow: rgba(60, 250, 68, .55);
  --red: #ff5a4f; --red-glow: rgba(255, 90, 79, .5);
  --glass: rgba(255, 255, 255, .055); --glass-strong: rgba(255, 255, 255, .09);
  --rim: rgba(255, 255, 255, .16); --rim-bright: rgba(255, 255, 255, .42);
  --radius: 26px;
  --spring: cubic-bezier(.34, 1.56, .64, 1);
  --ease: cubic-bezier(.22, 1, .36, 1);
  --mx: 50vw; --my: 30vh;
}
html, body { margin: 0; min-height: 100%; background: var(--bg); color: var(--text);
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased; }
body { overflow-x: hidden; }
* { box-sizing: border-box; }
::selection { background: rgba(60, 250, 68, .3); }

/* ---------- Ambient light ---------- */
.ambient { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden;
  background:
    radial-gradient(1200px 700px at 50% -10%, rgba(60, 250, 68, .10), transparent 60%),
    radial-gradient(900px 600px at 100% 110%, rgba(40, 200, 255, .07), transparent 60%),
    var(--bg); }
.orb { position: absolute; border-radius: 50%; filter: blur(70px); opacity: .55; will-change: transform; mix-blend-mode: screen; }
.o1 { width: 46vmax; height: 46vmax; left: -14vmax; top: -12vmax;
  background: radial-gradient(circle at 35% 35%, rgba(60, 250, 68, .55), rgba(60, 250, 68, 0) 65%);
  animation: drift1 26s ease-in-out infinite alternate; }
.o2 { width: 40vmax; height: 40vmax; right: -16vmax; top: 22vh;
  background: radial-gradient(circle at 60% 40%, rgba(32, 210, 190, .42), rgba(32, 210, 190, 0) 65%);
  animation: drift2 32s ease-in-out infinite alternate; }
.o3 { width: 34vmax; height: 34vmax; left: 10vw; bottom: -18vmax;
  background: radial-gradient(circle at 50% 50%, rgba(150, 255, 120, .35), rgba(150, 255, 120, 0) 65%);
  animation: drift3 38s ease-in-out infinite alternate; }
/* Floating alphabets: behind the orbs and glass, blurred and faint so text stays crisp. */
.glyphs { position: absolute; inset: -6%; z-index: 0;
  transform: translate3d(calc((var(--mx) - 50vw) * -0.015), calc((var(--my) - 50vh) * -0.015), 0);
  transition: transform 1.2s var(--ease); }
.glyphs span { position: absolute; line-height: 1; font-weight: 600; user-select: none; will-change: transform;
  color: rgba(190, 255, 194, var(--alpha)); filter: blur(var(--blur));
  text-shadow: 0 0 24px rgba(60, 250, 68, var(--alpha));
  font-family: -apple-system, BlinkMacSystemFont, "Noto Sans", "Segoe UI", system-ui, sans-serif;
  animation: glyph-float 30s ease-in-out infinite alternate; }
@keyframes glyph-float {
  from { transform: translate3d(0, 0, 0) rotate(0deg); }
  to { transform: translate3d(var(--dx), var(--dy), 0) rotate(var(--rot)); }
}
.grain { position: absolute; inset: -50%; opacity: .05;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
@keyframes drift1 { to { transform: translate3d(12vw, 10vh, 0) scale(1.15); } }
@keyframes drift2 { to { transform: translate3d(-14vw, -8vh, 0) scale(.9); } }
@keyframes drift3 { to { transform: translate3d(18vw, -12vh, 0) scale(1.2); } }

/* Cursor halo: a soft light that trails the pointer (fine pointers only). */
.cursor-halo { position: fixed; left: 0; top: 0; z-index: 1; width: 420px; height: 420px; border-radius: 50%;
  pointer-events: none; opacity: 0; transition: opacity .5s var(--ease);
  background: radial-gradient(circle, rgba(60, 250, 68, .16), rgba(60, 250, 68, .05) 35%, transparent 65%);
  mix-blend-mode: screen; will-change: transform; }
@media (hover: hover) and (pointer: fine) { .pointer-active .cursor-halo { opacity: 1; } }

/* ---------- Layout ---------- */
.page { position: relative; z-index: 2; max-width: 540px; margin: 0 auto; padding: 22px 16px 40px;
  display: flex; flex-direction: column; gap: 14px; }
.top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 4px 10px; }
.brand { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.brand .lb-mark { filter: drop-shadow(0 0 10px var(--green-glow)) drop-shadow(0 0 24px rgba(60, 250, 68, .25)); }
.brand .lb-word b { text-shadow: 0 0 18px var(--green-glow); }
.tagline { margin: 0 0 0 61px; color: var(--muted); font-size: 13px; letter-spacing: -.005em; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* ---------- Liquid glass ---------- */
.card, .chip, .ghost, .danger, .lens-opts li {
  -webkit-backdrop-filter: blur(28px) saturate(180%); backdrop-filter: blur(28px) saturate(180%); }
.card { position: relative; isolation: isolate; overflow: hidden; border-radius: var(--radius); padding: 18px;
  background: linear-gradient(160deg, var(--glass-strong), var(--glass) 45%, rgba(255, 255, 255, .025));
  border: 1px solid var(--rim);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, .22),
    inset 0 -1px 0 rgba(255, 255, 255, .04),
    inset 0 0 0 .5px rgba(255, 255, 255, .05),
    0 20px 50px -20px rgba(0, 0, 0, .7),
    0 2px 8px rgba(0, 0, 0, .25);
  transition: transform .6s var(--ease), box-shadow .5s var(--ease), border-color .4s var(--ease);
  transform-style: preserve-3d; will-change: transform; }
/* Rim light: brighter edge near the cursor */
.card::before { content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1px; pointer-events: none; z-index: 1;
  background: radial-gradient(260px circle at var(--x, 50%) var(--y, 0%), var(--rim-bright), transparent 70%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  opacity: 0; transition: opacity .45s var(--ease); }
/* Specular spotlight inside the glass */
.card::after { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: -1;
  background:
    radial-gradient(340px circle at var(--x, 50%) var(--y, 0%), rgba(255, 255, 255, .09), transparent 60%),
    radial-gradient(220px circle at var(--x, 50%) var(--y, 0%), rgba(60, 250, 68, .10), transparent 70%);
  opacity: 0; transition: opacity .45s var(--ease); }
.card.lit::before, .card.lit::after { opacity: 1; }
.card.lit { border-color: rgba(255, 255, 255, .22);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .3), inset 0 -1px 0 rgba(255, 255, 255, .05),
    0 30px 70px -24px rgba(0, 0, 0, .8), 0 0 40px -12px rgba(60, 250, 68, .22); }
/* Top sheen, like light falling on curved glass */
.card > :first-child::before { content: ""; position: absolute; left: 10%; right: 10%; top: 0; height: 1px; pointer-events: none;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, .55), transparent); opacity: .5; }

.eyebrow { font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); margin-bottom: 12px; }
.eyebrow.tight { margin-bottom: 2px; }
.hint { color: var(--muted); font-size: 13.5px; margin: 0; }
.muted { color: var(--faint); }
code { font: 12.5px ui-monospace, SFMono-Regular, Menlo, monospace; padding: 2px 7px; border-radius: 8px; color: var(--text);
  background: rgba(255, 255, 255, .08); border: 1px solid rgba(255, 255, 255, .1); }

/* Status chip */
.chip { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; padding: 6px 12px 6px 10px;
  border-radius: 999px; color: var(--muted); white-space: nowrap; position: relative; overflow: hidden;
  background: rgba(255, 255, 255, .07); border: 1px solid var(--rim); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .2); }
.led { width: 7px; height: 7px; border-radius: 50%; background: var(--faint); flex: none; }
.chip.on { color: #d9ffdb; border-color: rgba(60, 250, 68, .4); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .2), 0 0 24px -6px var(--green-glow); }
.chip.on .led { background: var(--green); box-shadow: 0 0 8px 2px var(--green-glow); animation: breathe 2.4s ease-in-out infinite; }
.chip.off { color: #ffd6d3; border-color: rgba(255, 90, 79, .45); }
.chip.off .led { background: var(--red); box-shadow: 0 0 8px 2px var(--red-glow); }
@keyframes breathe { 50% { box-shadow: 0 0 14px 4px var(--green-glow); transform: scale(1.15); } }

/* Pairing card */
.pair { border-color: rgba(60, 250, 68, .3);
  background:
    radial-gradient(120% 90% at 0% 0%, rgba(60, 250, 68, .16), transparent 55%),
    linear-gradient(160deg, var(--glass-strong), var(--glass) 50%); }
.code-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.code { font: 700 clamp(30px, 9vw, 42px)/1.1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .06em; color: var(--green);
  text-shadow: 0 0 12px rgba(60, 250, 68, .6), 0 0 36px rgba(60, 250, 68, .35); }

/* ---------- Buttons ---------- */
button, .primary { position: relative; overflow: hidden; isolation: isolate; font: inherit; cursor: pointer; border-radius: 999px;
  text-decoration: none; text-align: center; -webkit-tap-highlight-color: transparent;
  transition: translate .5s var(--spring), transform .45s var(--spring), box-shadow .4s var(--ease), background .3s, filter .3s; }
button::after, .primary::after { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: -1; opacity: 0;
  background: radial-gradient(120px circle at var(--bx, 50%) var(--by, 50%), rgba(255, 255, 255, .28), transparent 70%);
  transition: opacity .3s var(--ease); }
button:hover::after, .primary:hover::after { opacity: 1; }
.pressed { transform: scale(.955) !important; transition-duration: .12s !important; }
:focus-visible { outline: 2px solid var(--green); outline-offset: 3px; }

.ghost { color: var(--text); padding: 8px 16px; font-size: 13px; font-weight: 600;
  background: rgba(255, 255, 255, .08); border: 1px solid var(--rim); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .22); }
.ghost:hover { background: rgba(255, 255, 255, .13); }

.primary { display: block; margin: 16px 0 12px; padding: 14px 18px; font-weight: 700; letter-spacing: -.01em; color: #031203; border: 0;
  background: linear-gradient(180deg, #8dff92 0%, #3cfa44 45%, #24d82d 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, .75),
    inset 0 -2px 6px rgba(0, 80, 0, .35),
    0 10px 30px -8px var(--green-glow),
    0 0 0 1px rgba(60, 250, 68, .5); }
.primary::before { content: ""; position: absolute; left: 8%; right: 8%; top: 2px; height: 45%; border-radius: 999px; pointer-events: none;
  background: linear-gradient(180deg, rgba(255, 255, 255, .55), rgba(255, 255, 255, 0)); }
.primary:hover { box-shadow: inset 0 1px 0 rgba(255, 255, 255, .8), inset 0 -2px 6px rgba(0, 80, 0, .35),
  0 14px 44px -6px var(--green-glow), 0 0 0 1px rgba(60, 250, 68, .7); filter: saturate(1.1) brightness(1.04); }
.primary.disabled { opacity: .35; pointer-events: none; filter: grayscale(.4); }

.danger { display: block; width: 100%; margin-top: 14px; padding: 12px 16px; font-size: 14px; font-weight: 650;
  color: #ff8a82; background: rgba(255, 90, 79, .08); border: 1px solid rgba(255, 90, 79, .38);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .12); }
.danger:hover { background: rgba(255, 90, 79, .14); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .15), 0 0 28px -8px var(--red-glow); }
.danger.armed { color: #fff; border-color: transparent;
  background: linear-gradient(180deg, #ff8077, #ff4a3e); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .5), 0 10px 30px -8px var(--red-glow);
  animation: wobble .5s var(--spring); }
.danger:disabled { opacity: .6; cursor: default; }
@keyframes wobble { 30% { transform: scale(1.03, .96); } 60% { transform: scale(.98, 1.02); } }

/* Light ripple on press */
.ripple { position: absolute; border-radius: 50%; pointer-events: none; z-index: 0;
  background: radial-gradient(circle, rgba(255, 255, 255, .45), rgba(255, 255, 255, .12) 40%, transparent 70%);
  transform: scale(0); animation: ripple .7s var(--ease) forwards; }
@keyframes ripple { to { transform: scale(1); opacity: 0; } }

/* ---------- Paired account ---------- */
.account { display: flex; align-items: center; gap: 14px; }
.avatar { width: 48px; height: 48px; border-radius: 50%; flex: none; display: grid; place-items: center; position: relative;
  font-weight: 800; font-size: 19px; color: #031203;
  background: radial-gradient(circle at 30% 25%, #b8ffbb, #3cfa44 55%, #1db826);
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, .7), 0 0 0 3px rgba(60, 250, 68, .14), 0 0 26px -2px var(--green-glow); }
.account-text { flex: 1; min-width: 0; }
.user-name { font-weight: 700; font-size: 17px; letter-spacing: -.015em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.user-handle { color: var(--green); font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-shadow: 0 0 12px rgba(60, 250, 68, .4); }
.account-meta { margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, .09); }
.account-meta strong { color: var(--text); }
.dot { width: 10px; height: 10px; border-radius: 50%; flex: none; background: var(--faint); }
.dot.on { background: var(--green); box-shadow: 0 0 0 4px var(--green-soft), 0 0 16px 2px var(--green-glow); animation: breathe 2.4s ease-in-out infinite; }

/* ---------- Glasses mirror: a dark lens with G2 green light ---------- */
.lens { position: relative; overflow: hidden; border-radius: 18px; padding: 16px; min-height: 104px; color: var(--green);
  font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  background:
    radial-gradient(140% 90% at 50% -20%, rgba(60, 250, 68, .10), transparent 60%),
    linear-gradient(180deg, rgba(0, 0, 0, .78), rgba(0, 6, 0, .9));
  border: 1px solid rgba(60, 250, 68, .2);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .1), inset 0 0 30px rgba(60, 250, 68, .07), 0 0 0 4px rgba(0, 0, 0, .25);
  text-shadow: 0 0 6px rgba(60, 250, 68, .55), 0 0 16px rgba(60, 250, 68, .25); }
/* Curved-glass reflection across the lens */
.lens::before { content: ""; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(115deg, rgba(255, 255, 255, .08) 0%, rgba(255, 255, 255, 0) 28%, rgba(255, 255, 255, 0) 70%, rgba(255, 255, 255, .03) 100%); }
/* Faint scanlines like a micro-display */
.lens::after { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .35;
  background: repeating-linear-gradient(180deg, rgba(0, 0, 0, .0) 0 2px, rgba(0, 0, 0, .35) 2px 3px); }
.lens-empty { color: rgba(60, 250, 68, .55); display: grid; place-items: center; min-height: 72px; text-align: center; animation: idle 3.2s ease-in-out infinite; }
@keyframes idle { 50% { opacity: .55; } }
.lens-head { display: flex; justify-content: space-between; gap: 8px; font-size: 12.5px; opacity: .85; }
.route { white-space: nowrap; }
.lens-text { margin: 8px 0 0; overflow-wrap: anywhere; }
.lens-state { margin-top: 10px; font-weight: 700; }
.lens-said { margin-top: 10px; padding: 8px 10px; border-radius: 10px; border-left: 2px solid var(--green); background: rgba(60, 250, 68, .07); }
.lens-said span { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; opacity: .7; }
.lens-said p { margin: 2px 0 0; color: #d9ffdb; overflow-wrap: anywhere; }
.lens-opts { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 6px; }
.lens-opts li { position: relative; overflow: hidden; border-radius: 10px; padding: 6px 10px; font-size: 13px;
  background: rgba(60, 250, 68, .05); border: 1px solid rgba(60, 250, 68, .25); transition: background .3s, border-color .3s, transform .4s var(--spring); }
.lens-opts li:first-child { border-color: var(--green); background: rgba(60, 250, 68, .12); box-shadow: 0 0 18px -6px var(--green-glow); }
.lens-opts li:hover { background: rgba(60, 250, 68, .14); transform: translateX(3px); }

/* ---------- Lists ---------- */

.steps { margin: 0; padding-left: 22px; display: grid; gap: 12px; color: var(--text); font-size: 14px; }
.steps li::marker { color: var(--green); font-weight: 800; }
.steps .bot-ref { color: var(--green); }
.steps + .hint { margin-top: 14px; }
.controls { display: grid; grid-template-columns: auto 1fr; gap: 10px 18px; margin: 0; font-size: 14px; align-items: center; }
.controls dt { justify-self: start; color: var(--green); font-weight: 650; font-size: 12.5px; padding: 3px 10px; border-radius: 999px;
  background: rgba(60, 250, 68, .08); border: 1px solid rgba(60, 250, 68, .25); }
.controls dd { margin: 0; color: var(--muted); }

.foot { color: var(--faint); font-size: 12.5px; text-align: center; padding: 10px 12px 0; }

/* ---------- Hero: what LingoBot does ---------- */
.hero { padding: 22px 18px 18px; border-color: rgba(60, 250, 68, .22);
  background:
    radial-gradient(110% 70% at 100% 0%, rgba(32, 210, 190, .12), transparent 60%),
    radial-gradient(90% 60% at 0% 100%, rgba(60, 250, 68, .10), transparent 60%),
    linear-gradient(160deg, var(--glass-strong), var(--glass) 50%); }
.hero-title { margin: 0; font-size: clamp(26px, 7.4vw, 34px); line-height: 1.08; letter-spacing: -.03em; font-weight: 800; }
.hero-title span { background: linear-gradient(90deg, #8dff92, #3cfa44 40%, #2fe0c8); -webkit-background-clip: text; background-clip: text;
  color: transparent; filter: drop-shadow(0 0 14px rgba(60, 250, 68, .35)); }
.hero-sub { margin: 12px 0 18px; color: var(--muted); font-size: 14.5px; }

.story { position: relative; display: flex; flex-direction: column; transition: opacity .5s var(--ease), filter .5s var(--ease); }
.story.fade { opacity: 0; filter: blur(6px); }
.rail { list-style: none; margin: 0 0 14px; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; counter-reset: s; }
.rail li { position: relative; display: flex; flex-direction: column; gap: 6px; font-size: 11px; font-weight: 650; letter-spacing: .04em;
  text-transform: uppercase; color: var(--faint); transition: color .4s var(--ease); }
.rail li i { height: 3px; border-radius: 3px; background: rgba(255, 255, 255, .1); overflow: hidden; position: relative; }
.rail li i::after { content: ""; position: absolute; inset: 0; transform-origin: left; transform: scaleX(0);
  background: linear-gradient(90deg, #8dff92, var(--green)); box-shadow: 0 0 10px var(--green-glow); transition: transform .5s var(--ease); }
.rail li.done, .rail li.now { color: var(--text); }
.rail li.now { color: var(--green); text-shadow: 0 0 10px var(--green-glow); }
.rail li.done i::after { transform: scaleX(1); }
.rail li.now i::after { transform: scaleX(1); transition-duration: 1.1s; }

.beat, .s-lens, .beam, .s-tag, .sent { opacity: 0; transform: translateY(8px) scale(.98); filter: blur(4px);
  transition: opacity .5s var(--ease), transform .6s var(--spring), filter .5s var(--ease); }
.story .on { opacity: 1 !important; transform: none !important; filter: none !important; }
.beat { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
.beat.s-out { align-items: flex-end; }
.bubble { max-width: 88%; min-height: 56px; padding: 10px 13px; border-radius: 18px 18px 18px 6px; font-size: 14px;
  background: rgba(255, 255, 255, .08); border: 1px solid var(--rim); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .18);
  -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px); }
.bubble.mine { border-radius: 18px 18px 6px 18px; color: #031203; border: 0;
  background: linear-gradient(180deg, #a6ffaa, #3cfa44 70%, #2ee037);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .7), 0 10px 28px -10px var(--green-glow); }
.bubble-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; font-size: 12px; margin-bottom: 3px; }
.bubble-head b { color: #7fd4ff; font-size: 13px; }
.bubble-head span { color: var(--faint); }
.bubble.mine .bubble-head span { color: rgba(3, 18, 3, .6); font-weight: 650; }
.bubble.mine .sent { color: #031203; }
.bubble p { margin: 0; overflow-wrap: anywhere; }
.orig { margin-top: 4px !important; color: var(--text); }
.voice { display: flex; align-items: center; gap: 9px; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.play { width: 26px; height: 26px; border-radius: 50%; flex: none; position: relative; background: rgba(127, 212, 255, .9); }
.play::after { content: ""; position: absolute; left: 10px; top: 8px; border: 5px solid transparent; border-left: 8px solid #06141c; }
.wave { display: flex; align-items: center; gap: 2px; height: 22px; }
.wave i { width: 3px; height: var(--h); border-radius: 2px; background: rgba(127, 212, 255, .7); }
.playing .wave i { animation: bar .5s ease-in-out infinite alternate; animation-delay: var(--d); background: #7fd4ff; }
@keyframes bar { from { transform: scaleY(.35); } }
.tag { font-size: 11px; font-weight: 650; color: var(--green); padding: 3px 10px; border-radius: 999px;
  background: rgba(60, 250, 68, .08); border: 1px solid rgba(60, 250, 68, .28); margin-left: 4px; }
.scr { font-style: normal; opacity: .45; }

.beam { position: relative; width: 2px; height: 22px; margin: 6px auto; border-radius: 2px; overflow: hidden;
  background: linear-gradient(180deg, transparent, rgba(60, 250, 68, .35), transparent); }
.beam i { position: absolute; left: 0; width: 2px; height: 10px; top: -10px; border-radius: 2px;
  background: #b8ffbb; box-shadow: 0 0 8px 2px var(--green-glow); }
.beam.on i { animation: travel 1.1s var(--ease) infinite; }
@keyframes travel { to { top: 100%; } }
.lens.mini { min-height: 86px; font-size: 13.5px; padding: 13px 14px; }

/* ---------- Feature tiles ---------- */
.feats { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.feats li { position: relative; display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 18px;
  background: rgba(255, 255, 255, .035); border: 1px solid rgba(255, 255, 255, .08);
  transition: background .35s var(--ease), border-color .35s var(--ease), transform .5s var(--spring); }
.feats li:hover { background: rgba(60, 250, 68, .07); border-color: rgba(60, 250, 68, .3); transform: translateY(-2px); }
.feats .ico { width: 36px; height: 36px; border-radius: 12px; display: grid; place-items: center; color: var(--green);
  background: radial-gradient(circle at 30% 25%, rgba(60, 250, 68, .25), rgba(60, 250, 68, .06));
  border: 1px solid rgba(60, 250, 68, .3); box-shadow: 0 0 18px -6px var(--green-glow); }
.feats .ico svg { width: 19px; height: 19px; filter: drop-shadow(0 0 4px var(--green-glow)); }
.feats b { display: block; font-size: 14px; letter-spacing: -.01em; }
.feats p { margin: 3px 0 0; color: var(--muted); font-size: 12.5px; line-height: 1.45; }
@media (max-width: 360px) { .feats { grid-template-columns: 1fr; } }

/* ---------- Laptop: wider cards, still centred with room on both sides ---------- */
@media (min-width: 900px) {
  .page { max-width: 760px; padding: 36px 24px 56px; gap: 18px; }
  .card { padding: 22px 24px; }
  .hero { padding: 28px 28px 24px; }
  .feats { grid-template-columns: repeat(3, 1fr); }
  .bubble { max-width: 72%; }
}

/* ---------- Motion ---------- */
.rise { animation: rise .9s var(--ease) both; animation-delay: calc(var(--i, 0) * 70ms); }
@keyframes rise { from { opacity: 0; transform: translateY(14px) scale(.985); filter: blur(6px); } }
.card.pulse { animation: glow 1.4s var(--ease); }
@keyframes glow {
  0% { box-shadow: inset 0 1px 0 rgba(255, 255, 255, .3), 0 0 0 0 rgba(60, 250, 68, .0); border-color: var(--rim); }
  25% { box-shadow: inset 0 1px 0 rgba(255, 255, 255, .35), 0 0 60px -6px rgba(60, 250, 68, .55); border-color: rgba(60, 250, 68, .6); }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition-duration: .01ms !important; }
  .cursor-halo { display: none; }
}
/* Fallback for WebViews without backdrop-filter: more opaque glass so text stays readable. */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .card { background: rgba(22, 28, 23, .92); }
}
`
