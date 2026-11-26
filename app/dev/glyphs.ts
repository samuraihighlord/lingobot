// Dev-only: shows sample text in many languages, so we can see which scripts the G2 firmware font draws.
// Run: npx evenhub-simulator http://localhost:5173/dev/glyphs.html?i=0 --automation-port 9898
// ?i=N picks the sample; a single tap shows the next one.
import { OsEventTypeList, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
import { showMessage } from '../src/glasses'

export const SAMPLES: [string, string][] = [
  ['English', 'Hello, how are you? See you tomorrow.'],
  ['French', 'Où êtes-vous ? À bientôt, ça va. Œuvre naïve, déjà, très, Ç É È Ê'],
  ['Spanish', '¿Dónde estás? ¡Mañana! añadir, pingüino, acción Ñ Á Í Ó Ú'],
  ['Portuguese', 'Você está bem? Não, coração, ações, avó Ã Õ Â Ê Ô'],
  ['German', 'Grüße, Straße, Größe, Äpfel, Öl, Übung ß Ä Ö Ü'],
  ['Italian', 'Città, perché, così, più, caffè'],
  ['Turkish', 'Teşekkürler, görüşürüz ğ ı İ ş ç ö ü Ş Ğ'],
  ['Swahili', 'Habari yako? Asante sana, tutaonana kesho.'],
  ['Hausa', 'Ina kwana? Na gode. ɓ ɗ ƙ ƴ Ɓ Ɗ Ƙ'],
  ['Yoruba', 'Ẹ káàárọ̀, ọjọ́ ṣé dáadáa ni? Ọ Ẹ Ṣ'],
  ['Igbo', 'Kedu? Ị dị mma? ọ ụ ṅ Ị Ọ Ụ'],
  ['Polish', 'Dzień dobry, dziękuję ą ć ę ł ń ó ś ź ż Ł'],
  ['Romanian', 'Mulțumesc, ce faci? ș ț ă â î Ș Ț'],
  ['Czech', 'Děkuji, příliš žluťoučký kůň ř ě ů'],
  ['Vietnamese', 'Xin chào, cảm ơn bạn. Tiếng Việt ở đây ư ơ đ'],
  ['Russian', 'Привет, как дела? До завтра.'],
  ['Ukrainian', 'Привіт, як справи? Дякую, ї є ґ'],
  ['Greek', 'Γεια σου, τι κάνεις; Ευχαριστώ.'],
  ['Arabic', 'مرحبا، كيف حالك؟ أراك غدا.'],
  ['Hebrew', 'שלום, מה שלומך?'],
  ['Persian', 'سلام، حال شما چطور است؟'],
  ['Chinese', '你好，你好吗？明天见。'],
  ['Japanese', 'こんにちは、お元気ですか？カタカナ'],
  ['Korean', '안녕하세요, 잘 지내세요?'],
  ['Hindi', 'नमस्ते, आप कैसे हैं? कल मिलते हैं।'],
  ['Bengali', 'নমস্কার, আপনি কেমন আছেন?'],
  ['Thai', 'สวัสดี คุณสบายดีไหม'],
  ['Amharic', 'ሰላም፣ እንዴት ነህ?'],
  ['Tamil', 'வணக்கம், எப்படி இருக்கிறீர்கள்?'],
  ['Georgian', 'გამარჯობა, როგორ ხარ?'],
  ['Armenian', 'Բարեւ, ինչպես ես?'],
  ['Mongolian', 'Сайн байна уу? Өө Үү'],
  ['Kazakh', 'Сәлеметсіз бе? ә ғ қ ң ө ұ ү һ і'],
]

const bridge = await waitForEvenAppBridge()
let i = Number(new URLSearchParams(location.search).get('i') ?? 0) % SAMPLES.length

async function draw(): Promise<void> {
  const [name, text] = SAMPLES[i]
  await showMessage(bridge, {
    from: `${i} ${name}`,
    route: 'glyph test',
    voice: false,
    body: text,
    options: [text.slice(0, 40), 'next'],
  })
}

bridge.onEvenHubEvent(e => {
  const t = e.listEvent?.eventType ?? (e.listEvent ? OsEventTypeList.CLICK_EVENT : null)
  if (t === OsEventTypeList.CLICK_EVENT) {
    i = (i + 1) % SAMPLES.length
    void draw()
  }
})
;(window as unknown as { show: (n: number) => Promise<void> }).show = n => ((i = n), draw())
await draw()
// ?auto=MS advances by itself (for automated screenshots).
const auto = Number(new URLSearchParams(location.search).get('auto') ?? 0)
if (auto > 0) window.setInterval(() => { i = (i + 1) % SAMPLES.length; void draw() }, auto)
