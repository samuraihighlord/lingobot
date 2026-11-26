// Every user-facing text, in English: the source for all other languages.
// Other languages are translated from this by Claude and cached in server/locales/<language>.json
// (only keys whose English changed are translated again).
//
// - "g." keys are drawn by the glasses app (sent in the 'state' message). Keep in sync with app/src/strings.ts.
// - "s." keys are produced by the server and shown on the glasses (busy / error screens) or in the bot.
// - "b." keys are the Telegram bot's chat messages and buttons.
// {name} placeholders are filled in at runtime and are never translated.
export const EN = {
  // --- Glasses --------------------------------------------------------------
  'g.connecting': 'Connecting to LingoBot…',
  'g.cannotReach': 'Cannot reach the server.',
  'g.pairTitle': 'Pair with Telegram\nSend this code to @{bot}',
  'g.pairHint': 'Send  /start {code}  to @{bot}\nor tap Open Telegram on the LingoBot page on your phone.',
  'g.ready': 'Ready',
  'g.idleBody': 'Forward a message or voice note to @{bot}, or follow people in a group with /follow.\nNew messages appear here, translated into {lang}.',
  'g.pairedBar': 'Paired · {lang}',
  'g.doubleTapExit': 'Double-tap to exit',
  'g.recordNoteTo': '●  Record a voice note  ·  to {chat}',
  'g.recordNoteSavedTo': '●  Record a voice note  ·  saved to {chat}',
  'g.original': 'Original  ·  {lang}',
  'g.waiting': '+{n} waiting',
  'g.speakReply': '●  Speak a reply  ·  sent in {lang}',
  'g.showOriginal': '◆  Show original',
  'g.showTranslation': '◆  Show translation',
  'g.ignore': '○  Ignore',
  'g.noteRecTo': 'Voice note  ›  sent to {chat}\nTap to stop and send.',
  'g.noteRecSavedTo': 'Voice note  ›  saved to {chat}\nTap to stop and save.',
  'g.noteRecLang': 'Voice note  ›  {chat}  ·  translated to {lang}\nTap to stop and send.',
  'g.noteLang': 'Translated to {lang}',
  'g.replyRec': 'Speak in {mine}  ›  sent in {theirs}\nTap to stop. You can review it before it is sent.',
  'g.stopsIn': 'stops in {n}s',
  'g.replyTo': 'Reply to {name}',
  'g.youSaid': 'You said',
  'g.yourReply': 'Your reply',
  'g.sendsIn': 'Sends in {lang}',
  'g.sendIn': '▶  Send in {lang}',
  'g.back': '←  Back',
  'g.tapNext': 'Tap for the next message  ·  {waiting}',
  'g.tapContinue': 'Tap to continue',
  'g.sent': 'Sent',
  'g.sentTo': 'to {name}',
  'g.replyReady': 'Reply ready',
  'g.replyReadyHint': 'In the chat, type @{bot} and tap your reply to send it.',
  'g.tapMessages': 'Tap for messages  ·  {n} waiting',
  'g.noteSent': 'Voice note sent',
  'g.noteSaved': 'Voice note saved',
  'g.noteTo': '{dur} to {chat}',
  'g.noteIn': '{dur} in {chat}',
  'g.notQuite': 'Not quite',
  'g.tapBack': 'Tap to go back',
  'g.transcribing': 'Transcribing...',
  'g.savingNote': 'Saving voice note...',
  // Phone page mirror of the glasses
  'g.speakReplyPlain': 'Speak a reply (sent in {lang})',
  'g.voiceNote': 'Voice note',
  'g.recordingNote': 'Recording… tap to stop and save',
  'g.listening': 'Listening… speak in {lang}',
  'g.you': 'You',
  'g.sendInQ': 'Send in {lang}?',
  'g.send': 'Send',
  'g.backPlain': 'Back',
  'g.replySent': 'Reply sent.',
  'g.tapForNext': 'Tap for next',
  'g.voiceNoteDur': '{dur} voice note',

  // --- Server messages (glasses screens and bot) -----------------------------
  's.translatingTo': 'Translating to {lang}...',
  's.transcribing': 'Transcribing...',
  's.sending': 'Sending...',
  's.savingNote': 'Saving voice note...',
  's.gone': 'This message is no longer available.',
  's.tooShort': 'Too short. Try again.',
  's.notCaught': "Didn't catch that. Try again.",
  's.pairFirst': 'Pair with Telegram first.',
  's.noteTooShort': 'Too short. Nothing was saved.',
  's.notPaired': 'Not paired.',
  's.voiceTooLong': 'Voice note too long (max {max}s).',
  's.nothing': 'Nothing to translate in that message.',
  's.alreadyYours': 'Already in your language.',
  's.wrong': 'Something went wrong. Try again.',
  's.private': 'This LingoBot is private. Ask the owner to add your Telegram ID.',
  's.globalLimit': 'LingoBot reached its daily limit. Try again tomorrow.',
  's.userLimit': 'You reached your daily limit ({max}). Try again tomorrow.',
  's.noStt': 'Voice is not set up yet (no speech-to-text key). Text messages still work.',
  's.glassesDisconnected': 'Your glasses were disconnected from this Telegram account.',
  's.yourChat': 'your chat with @{bot}',

  // --- Telegram bot ----------------------------------------------------------
  'b.help':
    'LingoBot translates Telegram messages and voice notes on your Even G2.\n\n' +
    '1. Open LingoBot on your glasses and send me the code it shows: /start LB-XXXX\n' +
    '2. Set your language: /lang. Your glasses and this chat switch to it, and everything in another language is translated into it.\n' +
    '3. Forward any message or voice note here.\n' +
    '4. Pick or speak a reply on the glasses.\n' +
    '5. In the original chat, type @{bot} and tap your reply to send it.\n' +
    '6. To pair the glasses with another account: /disconnect\n\n' +
    'Automatic mode (no forwarding):\n' +
    '• Private chats (Telegram Premium): Settings > Telegram Business > Chatbots > add @{bot}, pick the chats, allow "Reply to messages". ' +
    'Foreign-language messages appear on your glasses and your reply is sent as you.\n' +
    '• Groups: add me to the group and send /watch there. Every message not in your language appears on your glasses ' +
    '(/watch mentions: only mentions of you and replies to you). I post your reply in the group. /unwatch to stop.\n' +
    '• Follow people in a group, privately: /follow here, pick the group, then the person. (In the group itself: /watch @name, ' +
    'or reply to their message with /watch.) Everything they post (text or voice) reaches your glasses in your language; ' +
    'reply by voice, pick an AI reply, or ignore it. /unwatch @name to stop, /watching to see everything you watch.\n\n' +
    'Voice notes from the glasses:\n' +
    '• /notes: pick where they go: one of your groups (create a group with only me in it for private notes), ' +
    'a person (/notes @name; they must have opened a chat with me), or this chat. ' +
    'On the glasses, choose "Record a voice note" on the Ready screen and tap to stop: it is sent as a voice message, with a transcript.\n' +
    '• Talking with someone who speaks another language? /notes → 🌐 picks the language they read (or /notes lang Spanish): ' +
    'you speak in yours, and the transcript under each voice note is translated into theirs.',
  'b.alreadyPaired': 'These glasses are already paired with your account. Language: {lang}.',
  'b.codeNotFound': 'Code not found. Open LingoBot on your G2 to get a fresh code.',
  'b.pairedOther':
    'These glasses are paired with another Telegram account. Disconnect it first ' +
    '(on the LingoBot page on the phone, or /disconnect from that account), then send the code again.',
  'b.paired': 'Paired with your glasses.\nYour language: {lang} (change with /lang).\n\nNow forward any message or voice note here.',
  'b.noGlasses': 'No glasses are paired with this account.',
  'b.disconnected': 'Disconnected. Your glasses are ready to pair with any Telegram account: open LingoBot on the G2 for the code.',
  'b.pairFirstG2': 'Pair your glasses first: open LingoBot on your G2.',
  'b.pairFirstPrivate': 'Pair your glasses first: open LingoBot on your G2 and message me privately.',
  'b.pairFirstCode': 'Pair your glasses first: open LingoBot on your G2 and send me the code shown there.',
  'b.pairFirstShort': 'Pair your glasses first.',
  'b.notPairedYet': 'Not paired yet. Open LingoBot on your G2 and send me the code shown there.',

  'b.langPick': 'Your language is {lang}. Your glasses and this chat use it.\nPick a new one (or type /lang <language>):',
  'b.langNotAvailable': 'not available yet',
  'b.langNaToast': '{lang} is not available yet: the G2 display cannot show its script.',
  'b.langNaReply': '{lang} is not available yet: the G2 display cannot show its script. Your language stays {current}.',
  'b.langUnknown': 'I do not recognise "{text}" as a language. Send /lang to pick from the list.',
  'b.langSwitching': 'Switching to {lang}…',
  'b.langSet':
    'Language set to {lang}. Your glasses and this chat now use {lang}. ' +
    "Messages in any other language are translated into {lang}, and your replies are translated back into the sender's language.",

  'b.copyReply': 'Copy reply',
  'b.replyInChat': 'Reply in a chat',
  'b.replyTo': "Reply to {name} ({lang}):\n\n{text}\n\nSend it: in {name}'s chat type @{bot} and tap the reply.",
  'b.voiceNoteFrom': '🎙 Voice note from {name}',
  'b.noteFailed': 'Could not send your voice note to {chat} ({why}). It is saved here instead. Pick another place with /notes.',
  'b.noteWhyPerson': '{chat} may have blocked me',
  'b.noteWhyGroup': 'was I removed?',
  'b.autoReplyFailed': 'Could not post your reply automatically. {why}',
  'b.whyBusiness': 'Check that LingoBot may reply to messages (Settings > Telegram Business > Chatbots).',
  'b.whyGroup': 'Check that LingoBot can still post in that group.',
  'b.inlineLatest': 'Latest reply · tap to send',
  'b.inlineEarlier': 'Earlier reply',
  'b.inlineNone': 'No reply ready. Open LingoBot',

  'b.watchHowTo':
    'Send /watch inside a group (after adding me to it):\n' +
    '• /watch: every message not in your language\n' +
    '• /watch @name: everything a specific person posts (or reply to their message with /watch)\n' +
    '• /watch mentions: only mentions of you and replies to you\n\n' +
    'For private chats, connect me in Settings > Telegram Business > Chatbots (Telegram Premium).',
  'b.thisGroup': 'this group',
  'b.nowFollowing': 'Now following {names} in {title}. Everything they post (text or voice) goes to your glasses in {lang}.',
  'b.alreadyFollowing': 'Already following {names} in {title}.',
  'b.watchingAll': 'Watching {title}: every message not in {lang} goes to your glasses, translated.',
  'b.watchingMentions': 'Watching {title}: mentions of you and replies to you that are not in {lang} go to your glasses.',
  'b.stoppedFollowingIn': 'Stopped following {names} in {title}.',
  'b.stoppedWatching': 'Stopped watching {title}.',
  'b.cannotSee':
    '⚠️ I cannot see messages in this group yet. Telegram only shows me commands while my Group Privacy is on. Fix one of these:\n' +
    '• BotFather → /mybots → this bot → Bot Settings → Group Privacy → Turn off, then remove me from the group, add me again and repeat the command; or\n' +
    '• make me an admin of this group.',
  'b.tipUsernames': 'Tip: people added by @username are matched by that username. Replying to one of their messages with /watch is the most reliable way.',
  'b.tipAdmin': 'Tip: make me an admin with "Delete messages" so your /watch commands disappear from the group.',
  'b.yourGroups': 'Your groups: /watching',
  'b.descAll': 'All messages not in {lang}',
  'b.descMentions': 'Mentions of you and replies to you (not in {lang})',
  'b.descPeople': 'Only the people you follow',
  'b.descFollowing': 'Following (everything they post): {names}',
  'b.watchedGroups': 'Watched groups:',
  'b.changePrivately': 'Change it privately: /follow (or tap Manage below).',
  'b.notWatching': 'Not watching any group yet. Tap /follow to start.',
  'b.manage': 'Manage {title}',

  'b.notesHereAgain': 'Voice notes from your glasses are saved here again. /notes to pick a group or a person.',
  'b.notUsername5': 'That does not look like a @username (5+ letters). Send /notes to pick from a list.',
  'b.notesNoLonger': 'Voice notes from your glasses will no longer be saved here.',
  'b.notesHere':
    'Voice notes you record on your glasses will be saved here, with a transcript when available.\n' +
    'On the G2: Ready screen → "Record a voice note". /notes off to stop.',
  'b.onlyYou': 'only you',
  'b.nPeople': '{n} people',
  'b.group': 'group',
  'b.aPerson': 'A person (@username)',
  'b.changePerson': '{name} · change person',
  'b.thisChat': 'This chat with me',
  'b.notesWhereHere': 'here, in this chat',
  'b.notesWhereTo': 'to {name}',
  'b.notesWhereIn': 'in "{title}"',
  'b.notesSavedWhere': 'Voice notes from your glasses are saved {where}.',
  'b.pickWhere': 'Pick where they go:',
  'b.notesTip': 'Tip: for a private notes chat, create a new group in Telegram, add only me (@{bot}), then send /notes here again. It shows up with 🔒 "only you".',
  'b.thatIsYou': 'That is you: voice notes are saved here, in this chat.',
  'b.thatIsMe': 'That is me. Send the @username of a person, or pick a group with /notes.',
  'b.cannotMessage':
    'I cannot message @{handle} yet: Telegram only lets me write to people who have opened a chat with me. ' +
    'Ask them to open t.me/{bot} and tap Start, then send /notes @{handle} again.',
  'b.notesNowPerson': 'Voice notes from your glasses now go to {name} (@{handle}). /notes to change.',
  'b.sendNotesUsername': 'Send the @username of the person who should get your voice notes.',
  'b.notUsernameNotes': 'That does not look like a @username. Open /notes to try again.',
  'b.saved': 'Saved',
  'b.notesLangBtn': '🌐 Translate my voice notes: {lang}',
  'b.notesLangOff': 'off',
  'b.notesLangLine': 'Each note is transcribed and translated into {lang} for them; your voice stays as it is.',
  'b.notesLangNone': 'Not translated. Tap 🌐 if they read another language.',
  'b.notesLangPick':
    'Which language does {chat} read? You keep speaking your language: the transcript under each voice note is translated into theirs.\n' +
    'Any language works here (type /notes lang <language> for one not listed).',
  'b.notesLangOffBtn': '✖️ No translation',
  'b.notesLangSet': 'Your voice notes to {chat} are now translated into {lang}.',
  'b.notesLangCleared': 'Your voice notes to {chat} are no longer translated.',
  'b.notesLangNeedTarget': 'First pick where your voice notes go (/notes), then their language.',
  'b.back': '‹ Back',

  'b.notMember': 'You are not a member of that group.',
  'b.botLeft': 'I am no longer in that group.',
  'b.pickGroup': 'Pick a group:',
  'b.tagFollowed': '{n} followed',
  'b.tagAll': 'all',
  'b.tagMentions': 'mentions',
  'b.typeUsername': '✍️ Type an @username',
  'b.everythingNotIn': '🌐 Everything not in {lang}',
  'b.mentionsMe': '💬 Mentions of me & replies to me',
  'b.stopWatchingBtn': '⛔ Stop watching this group',
  'b.groupsBack': '‹ Groups',
  'b.notWatchedYet': '{title}: not watched yet.',
  'b.tapPerson': 'Tap a person to follow them: everything they post (text or voice, any language) reaches your glasses in {lang}. Tap again to stop.',
  'b.noNames': 'No one has posted since I joined, so I have no names to show yet. Type their @username instead.',
  'b.noGroups':
    'I am not in any of your groups yet (or I joined before I could see messages).\n\n' +
    'Add me to the group (or remove me and add me again), then send /follow here.',
  'b.followHere': 'Use /follow here, in our private chat, so the group does not see it.',
  'b.personGone': 'That person is no longer listed.',
  'b.followingName': 'Following {name}',
  'b.stoppedFollowingName': 'Stopped following {name}',
  'b.stoppedFollowing': 'Stopped following',
  'b.sendUsernameFollow': 'Send the @username of the person to follow in {title} (several are fine, separated by spaces).',
  'b.notUsername': 'That does not look like a @username. Open /follow to try again.',

  'b.businessOff': 'LingoBot is no longer connected to your chats.',
  'b.businessOn': 'LingoBot is now watching the chats you selected.',
  'b.businessReply': 'To send replies automatically, turn on "Reply to messages" for LingoBot in Settings > Telegram Business > Chatbots.',
  'b.businessPair': 'Pair your glasses to receive messages: /start LB-XXXX',
  'b.voiceTooLongNamed': '{name} sent a voice note longer than {max}s; it was not transcribed.',
  'b.skipped': 'Message from {name} skipped: {reason}',
  'b.offlineFrom': 'Glasses offline. {from} · {src} to {dst}:\n{text}',
  'b.forwardSomething': 'Forward a text message or a voice note.',
  'b.onGlasses': 'On your glasses.',
  'b.offline': 'Glasses offline. Translation:',
  'b.route': '{from} · {src} to {dst}',

  'b.cmdFollow': 'Follow people in a group (private)',
  'b.cmdWatching': 'What you follow and watch',
  'b.cmdNotes': 'Pick the group or person for your voice notes',
  'b.cmdLang': 'Your language',
  'b.cmdHelp': 'How LingoBot works',
  'b.cmdDisconnect': 'Unpair your glasses',
} as const

export type Key = keyof typeof EN
