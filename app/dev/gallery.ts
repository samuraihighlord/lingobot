// Dev-only: cycles through every LingoBot glasses screen with sample data, one per tap.
// Run: npx evenhub-simulator http://localhost:5173/dev/gallery.html   (not part of the packed app)
import { OsEventTypeList, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
import { showBusy, showConfirm, showIdle, showMessage, showPairing, showRecording, showSent, showStatus, updateRecording } from '../src/glasses'
import { waveFrame } from '../src/recordfx'

const bridge = await waitForEvenAppBridge()
let anim: number | undefined
const screens: (() => Promise<void>)[] = [
  () => showPairing(bridge, 'LB-7KQ2', 'thelingo_bot'),
  () => showIdle(bridge, 'thelingo_bot', 'English'),
  () => showMessage(bridge, {
    from: 'Yuki Tanaka', route: 'Japanese  ›  English', meta: '♪ 0:14  ·  +2 waiting', voice: true,
    body: 'The meeting tomorrow moved to 10am. Can you bring the signed contract and the samples?',
    options: ['●  Speak a reply  ·  sent in Japanese', '›  Sure, see you at 10.', '›  Can we make it 11?', '›  I will confirm tonight.', '◆  Show original', '○  Ignore'],
  }),
  async () => {
    await showRecording(bridge, 'REC   0:04 / 1:00', 'Speak in English  ›  sent in Japanese\nTap to stop. You can review it before it is sent.')
    const history: number[] = []
    let t = 0
    anim = window.setInterval(() => {
      const v = Math.max(0, Math.min(1, 0.45 + 0.4 * Math.sin(t / 2) + (Math.random() - 0.5) * 0.4))
      history.unshift(v); history.length = Math.min(history.length, 14); t++
      void updateRecording(bridge, `REC   0:0${4 + Math.floor(t / 3) % 6} / 1:00`, () => waveFrame([...history], v, t % 2 === 0))
    }, 330)
  },
  () => showBusy(bridge, 'Translating to Japanese...'),
  () => showConfirm(bridge, { to: 'Yuki Tanaka', mineLabel: 'You said  ·  English', mine: 'Sure, I will bring the contract and two samples.', lang: 'Japanese', translated: 'もちろん、契約書とサンプルを2つ持っていきます。' }),
  () => showSent(bridge, { title: 'Sent', detail: 'to Yuki Tanaka', text: 'もちろん、契約書とサンプルを2つ持っていきます。', footer: 'Tap for the next message  ·  +1 waiting' }),
  () => showStatus(bridge, 'sent', 'Sent', 'to Yuki Tanaka (Supplier group)', 'Tap for the next message  ·  +1 waiting'),
  () => showStatus(bridge, 'error', 'Not quite', "Didn't catch that. Try again.", 'Tap to go back'),
]
let i = 0
async function next() {
  window.clearInterval(anim)
  await screens[i % screens.length]()
  i++
}
bridge.onEvenHubEvent(e => {
  const click = (env?: { eventType?: OsEventTypeList }) => env && (env.eventType ?? OsEventTypeList.CLICK_EVENT) === OsEventTypeList.CLICK_EVENT
  if (click(e.textEvent) || click(e.listEvent) || click(e.sysEvent)) void next()
})
void next()
