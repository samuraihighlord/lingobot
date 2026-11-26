# LingoBot

**Telegram messages and voice notes in any language, translated on your Even G2. Reply by voice in your own language; it is sent in theirs.**

## The problem
You are in Telegram chats in a language you don't speak: a supplier who sends French voice notes, a Chinese crypto group, family abroad. Today you copy text into a translator, switch apps, translate your answer back and paste it. Voice notes are worse: you need headphones and still can't understand them.

## How it works
1. **Forward** any message or voice note to `@YourLingoBot`.
2. The bot **detects the language** and, for voice notes, **transcribes** it.
3. Your **G2 shows the translation** (sender, language, short text).
4. **Reply on the glasses:** pick one of 3 AI drafts with the ring/temple, or choose *Speak a reply* and talk in your own language.
5. **Confirm** the reply translated into the sender's language.
6. **Send it without leaving the chat:** in the original chat type `@YourLingoBot` and tap your reply (inline mode). Fallback: the bot also posts the reply with a **Copy reply** button.

```
Telegram ──forward──> Bot (Node.js) ──> Speech-to-text ──> Claude (detect, translate, drafts)
                           │                                        │
                           └──── WebSocket ────> G2 app (Even Hub SDK) <── tap / ring / mic
```

## Glasses controls
| Action | Input |
|---|---|
| Move between options | Swipe on the temple or R1 ring |
| Choose option / stop recording / next | Single tap |
| Exit the app | Double-tap |

Item screen options: Speak a reply · 3 AI drafts · Show original · Ignore.

## Project layout
```
server/   Telegram bot, Claude translation, speech-to-text, WebSocket hub, cost limits
app/      Even Hub glasses app (Vite + TypeScript + Even Hub SDK)
```

## Setup

### 1. Telegram bot
1. In Telegram, message **@BotFather** → `/newbot` → copy the token.
2. BotFather → `/mybots` → your bot → **Bot Settings → Inline Mode → Turn on**.

### 2. Server
```bash
cd server
cp .env.example .env        # then fill in TELEGRAM_BOT_TOKEN and ANTHROPIC_API_KEY
npm install
npm run dev                 # http://localhost:8787
```
Speech-to-text is optional at first: text messages work without it, and voice shows a clear message until you add a key. Set `DEEPGRAM_API_KEY` (used first, model `nova-3`, language detected automatically) or `OPENAI_API_KEY`.

### 3. Glasses app
```bash
cd app
cp .env.example .env.local  # VITE_BACKEND_URL=http://localhost:8787
npm install
npm run dev                 # http://localhost:5173
npm run simulate            # opens the Even Hub simulator (second terminal)
```
On the glasses (Developer Mode): `npx evenhub qr --url http://<your-laptop-ip>:5173`, then scan with **Scan QR** in the Even Realities app. Set `VITE_BACKEND_URL` to `http://<your-laptop-ip>:8787` and add that URL (http and ws) to the `whitelist` in `app/app.json`.

### 4. Pair
The glasses show a code like `LB-7KQ2`. Send `/start LB-7KQ2` to your bot, then `/lang` to choose your language. Forward a message: it appears on the glasses.

To pair the glasses with a different Telegram account, disconnect first: tap **Disconnect this account** on the LingoBot page on the phone (tap twice to confirm), or send `/disconnect` to the bot. Glasses that are already paired cannot be taken over by sending their code from another account.

## Automatic mode: watched chats (no forwarding)
LingoBot can pick up messages by itself and post your reply straight back.

**Private chats (Telegram Premium, via Telegram Business)**
1. BotFather → `/mybots` → your bot → **Bot Settings → Business Mode → Turn on** (once, by the bot owner).
2. In Telegram: **Settings → Telegram Business → Chatbots** → add `@YourLingoBot`, choose the chats it may access, and allow **Reply to messages**.
3. Any message in those chats that is *not* in your language appears on the glasses. After you confirm a reply, it is sent **as you**, threaded under the original message. Messages already in your language are ignored.

**Groups**
1. BotFather → **Bot Settings → Group Privacy → Turn off** (otherwise bots cannot see mentions of other people). Re-add the bot to groups after changing this.
2. Add the bot to the group and send `/watch` there (`/unwatch` to stop).
3. Every message that is not in your language (set with `/lang`) appears on the glasses, translated. To limit it to messages that @mention you or reply to you, send `/watch mentions` instead.

**Follow specific people in a group, privately (recommended)**
- In your private chat with the bot, tap **/follow** in the command menu, pick the group, then tap the people to follow (✅ = followed, tap again to stop). People who have not posted since the bot joined can be added with *Type an @username*.
- The same screen turns on *Everything not in my language* or *Mentions of me*. Nothing is typed in the group, so members never see it. `/watching` lists everything with *Manage* buttons.
- The bot remembers which groups it is in and who posted recently (names, @usernames and ids only, in `server/data/groups.json`) to offer them as buttons.

**Or, from inside the group**
- In the group, send `/watch @alice @bob`, or **reply to one of their messages with `/watch`** (most reliable: it works for people without a public @username).
- Everything they post, text or voice note, in any language, appears on the glasses already transcribed and translated into your language. Choose **Speak a reply** (record a voice note), one of the **3 AI replies**, or **Ignore**.
- `/unwatch @alice` stops following one person, `/unwatch` stops watching the group, `/watching` lists everything you watch.
- Following people can be combined with `/watch` or `/watch mentions` in the same group.
- Confirmations arrive in your private chat with the bot. If the bot is an admin with *Delete messages*, it also removes your `/watch` commands so the group does not see who you follow. Telegram does not let bots post as a user in groups, so the reply is posted **by the bot**, threaded under the original and signed "— Your name via LingoBot".

Each picked-up message uses one request from your daily quota (language detection included), so busy chats count against `MAX_REQUESTS_PER_USER_PER_DAY`.

## Your language
`/lang` sets one language for everything: messages are translated into it, the glasses screens use it, and the bot chats in it. The default is English. You can type any language too (`/lang Italian`, `/lang 日本語`).

The G2 firmware font cannot draw every script, so those languages show **🚫 … · not available yet** in `/lang` and cannot be picked. We tested this in the simulator (`app/dev/glyphs.html`):

| Works on the G2 | Not available yet |
|---|---|
| Latin (incl. Vietnamese, Turkish, Polish, Czech, Romanian), Greek, Russian/Ukrainian Cyrillic, Chinese, Japanese, Korean | Arabic, Hebrew, Persian, Urdu, Hindi and other Indic scripts, Thai, Amharic, Georgian, Armenian, Kazakh/Mongolian Cyrillic, Hausa (ɓ ɗ ƙ), Yoruba (ṣ, tone marks) |

UI text lives in `server/src/i18n/en.ts`. Claude translates it into each language the first time someone picks that language, and the result is cached in `server/locales/`. When an English string changes, only that string is translated again. `npm run locales` (in `server/`) pre-translates the `/lang` menu languages.

## Testing without spending credits
Set `MOCK_AI=1` and `DEV_ENDPOINTS=1` in `server/.env` (and `DISABLE_BOT=1` to skip Telegram). Then push a fake message to the glasses:
```bash
curl -X POST http://localhost:8787/dev/inject -H "Content-Type: application/json" \
  -d '{"code":"LB-XXXX","from":"Amadou","text":"Bonjour, la livraison part jeudi. Vous pouvez confirmer ?"}'
```

## Protecting your API credits
All keys stay on the server; the glasses app never sees them.
- `ALLOWED_TELEGRAM_IDS`: only these Telegram accounts can use the bot (get your ID from @userinfobot).
- `MAX_REQUESTS_PER_USER_PER_DAY` and `MAX_REQUESTS_GLOBAL_PER_DAY`: hard daily caps; the bot pauses when reached.
- `MAX_VOICE_SECONDS`: longest voice note accepted.
- Only paired users are served: a pairing code from the glasses app is required.

## Privacy
- Only messages you forward or chats you watch are processed. Messages, audio and replies live in memory only and are gone on restart.
- Account settings (pairing, language, watched groups) are saved to `server/data/sessions.json` so a restart does not unpair you. Delete that file to reset.
- Every translation is AI-generated; *Show original* is one tap away.

## What existed before Nov 23, 2026
- Official Even Hub templates (`even-realities/evenhub-templates`, `asr` template used as the starting point for `app/`).
- Open-source libraries: grammY, Anthropic SDK, ws, dotenv, Vite.
- Everything else in this repository was written during the hackathon.

## Feature requests for API teams
1. **Telegram Bot API:** let a user authorize a bot to send one message on their behalf in a chosen chat (removes the inline step).
2. **Telegram Bot API:** voice-note transcripts available to bots (Telegram already transcribes for Premium users).
3. **Even Hub SDK:** a long-press event (would allow hold-to-talk).
4. **Even Hub SDK:** background notifications while another G2 app is open.
5. **Anthropic API:** native audio input, so transcription and translation happen in one call.

## License
MIT
