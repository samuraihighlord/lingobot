// Telegram bot: pairing, forwarded messages/voice notes, inline mode, reply delivery,
// and watched chats (Telegram Business private chats + groups with /watch).
import { Bot, InlineKeyboard, InputFile, type Context } from 'grammy'
import type { Message } from 'grammy/types'
import { config } from './config.js'
import { handleIncoming, pushState, setTelegramPort, stateMsg } from './flow.js'
import { send } from './hub.js'
import type { ServerMsg } from './protocol.js'
import { isAllowed } from './limits.js'
import { contactByUsername, noteContact } from './contacts.js'
import { allKnownGroups, forgetGroup, knownGroup, migrateKnownGroup, noteGroup, noteMember, type KnownGroup } from './groups.js'
import { ensureCatalog, isDisplayable, langLabel, MENU_LANGUAGES, resolveLanguage, t, type Key, type Vars } from './i18n/index.js'
import {
  allSessionsWithNotesIn, findByCode, findByTelegramId, linkTelegram, migrateGroup, persist, sessionsWatching, unlinkTelegram,
  type GroupWatch, type NotesChat, type ReplyTarget, type Session, type WatchedPerson, type WatchMode,
} from './store.js'

const COPY_TEXT_MAX = 256 // Telegram limit for copy-to-clipboard buttons

export async function startBot(): Promise<void> {
  const bot = new Bot(config.telegramToken, config.telegramApiRoot ? { client: { apiRoot: config.telegramApiRoot } } : undefined)
  const me = await bot.api.getMe()
  const username = me.username ?? 'LingoBot' // bots always have one; fallback satisfies the type
  if (!me.can_read_all_group_messages) {
    console.warn(
      `[bot] Group Privacy is ON for @${username}: in groups it only sees commands, so watched groups stay silent ` +
        'unless the bot is an admin there. Fix: BotFather > /mybots > Bot Settings > Group Privacy > Turn off, then re-add the bot to each group.',
    )
  }

  // Remember everyone who writes to the bot in private: they can receive voice notes (/notes → a person).
  bot.use((ctx, next) => {
    if (ctx.chat?.type === 'private' && ctx.from) noteContact(ctx.from)
    return next()
  })

  // Reply delivery used by flow.ts once the user confirms on the glasses.
  setTelegramPort({
    botUsername: username,
    async notify(chatId, text) {
      await bot.api.sendMessage(chatId, text).catch(err => console.error('[bot] notify failed:', err.message))
    },
    async saveNote(session, note) {
      const target = session.notesChat
      // A person sees who it is from; in your own group the transcript alone is enough.
      // (A note to another person stays in English: we do not know their language.)
      const from = target?.kind === 'person' ? t(undefined, 'b.voiceNoteFrom', { name: session.displayName ?? session.firstName ?? 'a LingoBot user' }) : '🎙'
      const caption = clipCaption(note.transcript ? `${from}${target?.kind === 'person' ? '\n' : ' '}${note.transcript}` : from)
      const file = () => new InputFile(note.mp3, `note-${new Date().toISOString().slice(0, 16).replace(':', '')}.mp3`)
      if (target) {
        try {
          await bot.api.sendVoice(target.chatId, file(), { duration: note.durationSec, caption })
          return target.title
        } catch (err) {
          console.error('[bot] could not post the voice note in the notes chat:', (err as Error).message)
          if (session.chatId) {
            const why = target.kind === 'person' ? ts(session, 'b.noteWhyPerson', { chat: target.title }) : ts(session, 'b.noteWhyGroup')
            await bot.api
              .sendMessage(session.chatId, ts(session, 'b.noteFailed', { chat: target.title, why }))
              .catch(() => {})
          }
        }
      }
      // No notes chat yet (or it failed): keep the note in the private chat with the bot.
      if (!session.chatId) throw new Error('Pair with Telegram first.')
      await bot.api.sendVoice(session.chatId, file(), { duration: note.durationSec, caption })
      return ts(session, 's.yourChat', { bot: username })
    },
    async deliverReply(session, item, translated, target) {
      // Watched chats: post the reply straight back under the original message.
      if (target) {
        try {
          const reply_parameters = { message_id: target.messageId, allow_sending_without_reply: true }
          if (target.kind === 'business') {
            // Sent as the user (Telegram Business, needs the "reply to messages" permission).
            await bot.api.sendMessage(target.chatId, translated, {
              business_connection_id: target.connectionId,
              reply_parameters,
            })
            return target.name
          }
          // Groups: bots cannot post as a user, so the bot posts it, signed.
          await bot.api.sendMessage(target.chatId, `${translated}\n\n— ${session.firstName ?? 'sent'} via LingoBot`, {
            reply_parameters,
          })
          return `${target.name} (${target.title})`
        } catch (err) {
          console.error('[bot] automatic reply failed:', (err as Error).message)
          if (session.chatId) {
            const why = ts(session, target.kind === 'business' ? 'b.whyBusiness' : 'b.whyGroup')
            await bot.api.sendMessage(session.chatId, ts(session, 'b.autoReplyFailed', { why })).catch(() => {})
          }
          // fall through to the manual copy/inline fallback below
        }
      }
      if (!session.chatId) return
      const keyboard = new InlineKeyboard()
      if (translated.length <= COPY_TEXT_MAX) keyboard.copyText(ts(session, 'b.copyReply'), translated)
      keyboard.switchInline(ts(session, 'b.replyInChat'), '')
      await bot.api.sendMessage(
        session.chatId,
        ts(session, 'b.replyTo', { name: item.from, lang: item.srcLangLabel ?? item.srcLang, text: translated, bot: username }),
        { reply_markup: keyboard },
      )
    },
  })

  // /start LB-XXXX pairs this Telegram account with the glasses showing that code.
  bot.command('start', async ctx => {
    const code = ctx.match.trim().toUpperCase()
    // No code, or a deep-link parameter such as "help" from the inline button: show help.
    if (!/^LB-[A-Z0-9]{4}$/.test(code)) return ctx.reply(helpText(ctx))
    if (!ctx.from || !ctx.chat) return
    if (!isAllowed(ctx.from.id)) return ctx.reply(tc(ctx, 's.private'))
    const session = findByCode(code)
    if (!session) return ctx.reply(tc(ctx, 'b.codeNotFound'))
    if (session.telegramId === ctx.from.id) {
      return ctx.reply(ts(session, 'b.alreadyPaired', { lang: myLang(session) }))
    }
    if (session.telegramId && session.chatId) {
      // Never take over glasses that belong to someone else. (A session with no chatId was only
      // marked as paired by the /dev/inject test endpoint, so a real account may pair over it.)
      return ctx.reply(tc(ctx, 'b.pairedOther'))
    }
    // Keep the language this account already chose (e.g. when pairing new glasses).
    const before = findByTelegramId(ctx.from.id)
    if (before && before !== session) session.userLang = before.userLang
    linkTelegram(session, ctx.from.id, ctx.chat.id)
    console.log(`[bot] glasses ${session.code} paired with Telegram user ${ctx.from.id}`)
    session.username = ctx.from.username?.toLowerCase()
    session.firstName = ctx.from.first_name
    session.displayName = fullName(ctx.from)
    session.handle = ctx.from.username
    persist()
    send(session, stateMsg(session))
    void setChatCommands(session)
    await ctx.reply(ts(session, 'b.paired', { lang: myLang(session) }))
  })

  bot.command('help', ctx => ctx.reply(helpText(ctx)))

  // /disconnect unpairs this Telegram account from its glasses, so they can be paired with another account.
  bot.command(['disconnect', 'unpair'], async ctx => {
    if (ctx.chat.type !== 'private') return
    const session = ctx.from && findByTelegramId(ctx.from.id)
    if (!session) return ctx.reply(tc(ctx, 'b.noGlasses'))
    const lang = session.userLang
    unlinkTelegram(session)
    send(session, { ...stateMsg(session), disconnected: true } as ServerMsg)
    await ctx.reply(t(lang, 'b.disconnected'))
  })

  // /lang shows buttons; /lang French sets it directly. The language is used everywhere:
  // translations, the glasses screens and this chat. Languages the G2 cannot display are marked.
  bot.command('lang', async ctx => {
    const session = ctx.from && findByTelegramId(ctx.from.id)
    if (!session) return ctx.reply(tc(ctx, 'b.pairFirstG2'))
    const wanted = ctx.match.trim()
    if (wanted) return setLanguage(ctx, session, wanted)
    await ctx.reply(ts(session, 'b.langPick', { lang: myLang(session) }), { reply_markup: langKeyboard(session) })
  })

  function langKeyboard(session: Session): InlineKeyboard {
    const kb = new InlineKeyboard()
    let n = 0
    for (const lang of MENU_LANGUAGES) {
      const label = langLabel(lang, session.userLang, true)
      if (isDisplayable(lang)) {
        kb.text(`${lang === session.userLang ? '✅ ' : ''}${label}`, `lang:${lang}`)
        if (++n % 3 === 0) kb.row()
      }
    }
    if (n % 3) kb.row()
    // Not displayable yet: one per row, so the note fits.
    for (const lang of MENU_LANGUAGES) {
      if (!isDisplayable(lang)) kb.text(`🚫 ${langLabel(lang, session.userLang, true)} · ${ts(session, 'b.langNotAvailable')}`, `langna:${lang}`).row()
    }
    return kb
  }

  bot.callbackQuery(/^lang:(.+)$/, async ctx => {
    const session = findByTelegramId(ctx.from.id)
    if (!session) return ctx.answerCallbackQuery({ text: tc(ctx, 'b.pairFirstShort') })
    await ctx.answerCallbackQuery()
    await setLanguage(ctx, session, ctx.match[1])
  })

  bot.callbackQuery(/^langna:(.+)$/, async ctx => {
    const session = findByTelegramId(ctx.from.id)
    await ctx.answerCallbackQuery({ text: tc(ctx, 'b.langNaToast', { lang: langLabel(ctx.match[1], session?.userLang, true) }), show_alert: true })
  })

  async function setLanguage(ctx: Context, session: Session, wanted: string): Promise<unknown> {
    const choice = await resolveLanguage(wanted)
    if (!choice.ok) {
      return ctx.reply(
        choice.reason === 'unknown'
          ? ts(session, 'b.langUnknown', { text: wanted.slice(0, 40) })
          : ts(session, 'b.langNaReply', { lang: langLabel(choice.name, session.userLang, true), current: myLang(session) }),
      )
    }
    if (choice.name !== session.userLang) {
      // First time anyone uses this language: its menus are translated now (a few seconds), then cached.
      const ready = ensureCatalog(choice.name)
      const slow = setTimeout(() => {
        void ctx.reply(ts(session, 'b.langSwitching', { lang: langLabel(choice.name, choice.name) })).catch(() => {})
        void ctx.replyWithChatAction('typing').catch(() => {})
      }, 600)
      const drawable = await ready.finally(() => clearTimeout(slow))
      if (!drawable) {
        return ctx.reply(ts(session, 'b.langNaReply', { lang: choice.name, current: myLang(session) }))
      }
      session.userLang = choice.name
      persist()
      pushState(session)
      void setChatCommands(session)
    }
    const lang = myLang(session)
    // Edit the language picker in place when it was tapped, so its buttons follow the new language too.
    if (ctx.callbackQuery) await ctx.editMessageText(ts(session, 'b.langPick', { lang }), { reply_markup: langKeyboard(session) }).catch(() => {})
    return ctx.reply(ts(session, 'b.langSet', { lang }))
  }

  /** The "/" menu in this user's private chat, in their language. */
  async function setChatCommands(session: Session): Promise<void> {
    if (!session.chatId) return
    await bot.api
      .setMyCommands(commandList(session.userLang), { scope: { type: 'chat', chat_id: session.chatId } })
      .catch(err => console.error('[bot] could not set the chat command menu:', err.message))
  }

  // Inline mode: typing "@LingoBot" in any chat offers the user's latest replies.
  bot.on('inline_query', async ctx => {
    const session = findByTelegramId(ctx.from.id)
    const replies = session?.lastReplies ?? []
    await ctx.answerInlineQuery(
      replies.map((text, i) => ({
        type: 'article' as const,
        id: `r${i}`,
        title: text.slice(0, 64),
        description: ts(session, i === 0 ? 'b.inlineLatest' : 'b.inlineEarlier'),
        input_message_content: { message_text: text },
      })),
      {
        cache_time: 0,
        is_personal: true,
        button: replies.length ? undefined : { text: tc(ctx, 'b.inlineNone'), start_parameter: 'help' },
      },
    )
  })

  // --- Watched chats ------------------------------------------------------

  // Groups: /watch opts the user in for this group, /unwatch stops it.
  //   /watch                 every message not in the user's language
  //   /watch mentions        only mentions of / replies to the user
  //   /watch @alice @bob     everything these people post (also: reply to someone's message with /watch)
  //   /unwatch @alice        stop following one person · /unwatch: stop watching the group
  // Confirmations go to the user's private chat, and the command is deleted when the bot may do so,
  // so the group does not see who is being followed.
  bot.command(['watch', 'unwatch'], async ctx => {
    const on = ctx.msg.text?.startsWith('/watch') ?? false
    const session = ctx.from && findByTelegramId(ctx.from.id)
    if (ctx.chat.type === 'private') {
      if (session && session.watchedGroups.size) return ctx.reply(watchList(session))
      return ctx.reply(tc(ctx, 'b.watchHowTo'))
    }
    if (!session) return ctx.reply(tc(ctx, 'b.pairFirstPrivate'))
    const chatId = ctx.chat.id
    const title = ctx.chat.title ?? ts(session, 'b.thisGroup')
    const lang = myLang(session)
    const people = peopleIn(ctx.msg, [me.id, session.telegramId], [username.toLowerCase(), session.username])
    let watch = session.watchedGroups.get(chatId)
    let summary: string

    if (on && people.length) {
      watch ??= { mode: 'people', title, people: [] }
      const added = people.filter(p => !watch!.people.some(w => samePerson(w, p)))
      watch.people.push(...added)
      watch.title = title
      session.watchedGroups.set(chatId, watch)
      summary = added.length
        ? ts(session, 'b.nowFollowing', { names: names(added), title, lang })
        : ts(session, 'b.alreadyFollowing', { names: names(people), title })
    } else if (on) {
      const mode: WatchMode = /mention|tag|reply/i.test(ctx.match) ? 'mentions' : 'all'
      watch = { mode, title, people: watch?.people ?? [] }
      session.watchedGroups.set(chatId, watch)
      summary = ts(session, mode === 'all' ? 'b.watchingAll' : 'b.watchingMentions', { title, lang })
    } else if (people.length && watch) {
      watch.people = watch.people.filter(w => !people.some(p => samePerson(w, p)))
      if (watch.mode === 'people' && !watch.people.length) session.watchedGroups.delete(chatId)
      summary = ts(session, 'b.stoppedFollowingIn', { names: names(people), title })
    } else {
      session.watchedGroups.delete(chatId)
      summary = ts(session, 'b.stoppedWatching', { title })
    }
    persist()
    console.log(`[bot] ${on ? 'watch' : 'unwatch'} in group ${chatId} for glasses ${session.code}: ${summary}`)

    // Keep it discreet: remove the command from the group when we are allowed to.
    const deleted = await ctx.deleteMessage().then(() => true, () => false)

    const lines = [summary]
    const current = session.watchedGroups.get(chatId)
    if (current) lines.push('', describeWatch(current, session))
    // Can the bot actually see other people's messages here? Needs Group Privacy off, or admin rights.
    if (on) {
      const canSeeAll = (await bot.api.getMe()).can_read_all_group_messages
      const member = await ctx.getChatMember(me.id).catch(() => undefined)
      const isAdmin = member?.status === 'administrator' || member?.status === 'creator'
      if (!canSeeAll && !isAdmin) {
        lines.push('', ts(session, 'b.cannotSee'))
      }
      if (watch?.people.some(p => !p.id)) lines.push('', ts(session, 'b.tipUsernames'))
    }
    if (!deleted) lines.push('', ts(session, 'b.tipAdmin'))
    lines.push('', ts(session, 'b.yourGroups'))

    if (session.chatId) {
      await bot.api.sendMessage(session.chatId, lines.join('\n')).catch(() => ctx.reply(summary))
    } else {
      await ctx.reply(summary)
    }
  })

  // /notes inside a group the user created: voice notes recorded on the glasses are saved there.
  //   /notes        use this chat · /notes off: stop (notes go to the private chat with the bot)
  bot.command('notes', async ctx => {
    const session = ctx.from && findByTelegramId(ctx.from.id)
    if (!session) return ctx.reply(tc(ctx, 'b.pairFirstPrivate'))
    const off = /^(off|stop|none)$/i.test(ctx.match.trim())
    if (ctx.chat.type === 'private') {
      session.awaitingNotesUsername = undefined
      if (off) {
        setNotesTarget(session, undefined)
        return ctx.reply(ts(session, 'b.notesHereAgain'))
      }
      const handle = /^@?([A-Za-z][A-Za-z0-9_]{4,31})$/.exec(ctx.match.trim())?.[1]
      if (handle) return chooseNotesPerson(ctx, session, handle) // /notes @alice
      if (ctx.match.trim()) return ctx.reply(ts(session, 'b.notUsername5'))
      const { text, kb } = await notesPicker(session)
      return ctx.reply(text, { reply_markup: kb })
    }
    if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return
    const title = ctx.chat.title ?? ts(session, 'b.thisGroup')
    if (off) {
      if (session.notesChat?.chatId === ctx.chat.id) setNotesTarget(session, undefined)
      return ctx.reply(ts(session, 'b.notesNoLonger'))
    }
    setNotesTarget(session, { chatId: ctx.chat.id, title, kind: 'group' })
    await ctx.reply(ts(session, 'b.notesHere'))
  })

  function setNotesTarget(session: Session, target: NotesChat | undefined): void {
    session.notesChat = target
    session.awaitingNotesUsername = undefined
    persist()
    pushState(session)
    console.log(`[bot] glasses ${session.code} voice notes -> ${target ? `${target.kind ?? 'group'} ${target.chatId}` : 'private chat'}`)
  }

  /** /notes in private: the user's groups (those with only them and me first), a person, or this chat. */
  async function notesPicker(session: Session): Promise<{ text: string; kb: InlineKeyboard }> {
    const groups = await Promise.all(
      (await groupsOf(session.telegramId!)).map(async g => ({ g, count: await bot.api.getChatMemberCount(g.id).catch(() => 0) })),
    )
    groups.sort((a, b) => Number(b.count === 2) - Number(a.count === 2) || a.g.title.localeCompare(b.g.title))
    const current = session.notesChat
    const tick = (on: boolean) => (on ? '✅ ' : '')
    const kb = new InlineKeyboard()
    for (const { g, count } of groups) {
      const who = count === 2 ? ts(session, 'b.onlyYou') : count > 2 ? ts(session, 'b.nPeople', { n: count - 1 }) : ts(session, 'b.group')
      kb.text(`${tick(current?.chatId === g.id)}${count === 2 ? '🔒' : '👥'} ${g.title} · ${who}`.slice(0, 60), `nt:g:${g.id}`).row()
    }
    const person = current?.kind === 'person' ? current : undefined
    kb.text(`${tick(Boolean(person))}👤 ${person ? ts(session, 'b.changePerson', { name: person.title }) : ts(session, 'b.aPerson')}`.slice(0, 60), 'nt:user').row()
    kb.text(`${tick(!current)}💬 ${ts(session, 'b.thisChat')}`, 'nt:self')

    const where = !current
      ? ts(session, 'b.notesWhereHere')
      : current.kind === 'person'
        ? ts(session, 'b.notesWhereTo', { name: current.title })
        : ts(session, 'b.notesWhereIn', { title: current.title })
    const lines = [ts(session, 'b.notesSavedWhere', { where }), '', ts(session, 'b.pickWhere')]
    if (!groups.some(x => x.count === 2)) lines.push('', ts(session, 'b.notesTip', { bot: username }))
    return { text: lines.join('\n'), kb }
  }

  /** Points voice notes at a person: they must have started the bot, which a greeting checks. */
  async function chooseNotesPerson(ctx: Context, session: Session, handle: string): Promise<unknown> {
    const h = handle.toLowerCase().replace(/^@/, '')
    if (h === session.username) {
      setNotesTarget(session, undefined)
      return ctx.reply(ts(session, 'b.thatIsYou'))
    }
    if (h === username.toLowerCase()) return ctx.reply(ts(session, 'b.thatIsMe'))
    const member = allKnownGroups().flatMap(g => g.members).find(m => m.username === h)
    const found = contactByUsername(h) ?? (member && { id: member.id, name: member.name })
    const cannot = ts(session, 'b.cannotMessage', { handle: h, bot: username })
    if (!found) return ctx.reply(cannot)
    const sender = session.displayName ?? session.firstName ?? 'Someone'
    const ok = await bot.api
      .sendMessage(found.id, `🎙 ${sender} will send you voice notes recorded on their Even G2 glasses, through LingoBot.`)
      .then(() => true, () => false)
    if (!ok) return ctx.reply(cannot)
    setNotesTarget(session, { chatId: found.id, title: `@${h}`, kind: 'person' })
    return ctx.reply(ts(session, 'b.notesNowPerson', { name: found.name, handle: h }))
  }

  bot.callbackQuery(/^nt:(g:(-?\d+)|user|self)$/, async ctx => {
    const session = findByTelegramId(ctx.from.id)
    if (!session) return ctx.answerCallbackQuery({ text: tc(ctx, 'b.pairFirstShort') })
    const choice = ctx.match[1]
    if (choice === 'user') {
      session.awaitingNotesUsername = true
      session.awaitingUsername = undefined
      await ctx.answerCallbackQuery()
      return ctx.reply(ts(session, 'b.sendNotesUsername'))
    }
    if (choice === 'self') {
      setNotesTarget(session, undefined)
    } else {
      const id = Number(ctx.match[2])
      const g = knownGroup(id)
      const m = g && (await bot.api.getChatMember(id, session.telegramId!).catch(() => undefined))
      if (!g || !m || m.status === 'left' || m.status === 'kicked' || (m.status === 'restricted' && !m.is_member)) {
        return ctx.answerCallbackQuery({ text: ts(session, g ? 'b.notMember' : 'b.botLeft') })
      }
      setNotesTarget(session, { chatId: id, title: g.title, kind: 'group' })
    }
    const { text, kb } = await notesPicker(session)
    await ctx.answerCallbackQuery({ text: ts(session, 'b.saved') })
    await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {})
  })

  // --- /follow: set up group watching privately, from the chat with the bot ----------------
  // Nothing is typed in the group: pick the group, then the person, from buttons.

  /** Groups the bot knows that this user is a member of. */
  async function groupsOf(userId: number): Promise<KnownGroup[]> {
    const checks = await Promise.all(
      allKnownGroups().map(async g => {
        const m = await bot.api.getChatMember(g.id, userId).catch(() => undefined)
        const inGroup = m && (m.status === 'member' || m.status === 'administrator' || m.status === 'creator' || (m.status === 'restricted' && m.is_member))
        return inGroup ? g : undefined
      }),
    )
    return checks.filter((g): g is KnownGroup => Boolean(g))
  }

  function groupPicker(session: Session, groups: KnownGroup[]): { text: string; kb: InlineKeyboard } {
    const kb = new InlineKeyboard()
    for (const g of groups) {
      const w = session.watchedGroups.get(g.id)
      const tag = w
        ? ` · ${w.people.length ? ts(session, 'b.tagFollowed', { n: w.people.length }) : ts(session, w.mode === 'all' ? 'b.tagAll' : 'b.tagMentions')}`
        : ''
      kb.text(`${g.title}${tag}`.slice(0, 60), `fg:${g.id}`).row()
    }
    return { text: ts(session, 'b.pickGroup'), kb }
  }

  function groupMenu(session: Session, g: KnownGroup): { text: string; kb: InlineKeyboard } {
    const watch = session.watchedGroups.get(g.id)
    const kb = new InlineKeyboard()
    const shown = new Set<number>()
    // Recently active members (not you, not bots), followed ones first.
    const members = g.members.filter(m => m.id !== session.telegramId)
    const followedFirst = [
      ...members.filter(m => watch && followedPerson(watch, { id: m.id, username: m.username } as Message['from'])),
      ...members,
    ]
    let n = 0
    for (const m of followedFirst) {
      if (shown.has(m.id) || n >= 16) continue
      shown.add(m.id)
      const on = Boolean(watch && followedPerson(watch, { id: m.id, username: m.username } as Message['from']))
      kb.text(`${on ? '✅ ' : ''}${m.name}${m.username ? ` (@${m.username})` : ''}`.slice(0, 60), `fp:${g.id}:${m.id}`)
      if (++n % 2 === 0) kb.row()
    }
    if (n % 2) kb.row()
    // People followed by @username who have not posted yet.
    for (const p of watch?.people ?? []) {
      if (p.id !== undefined && shown.has(p.id)) continue
      kb.text(`✅ ${p.name}`.slice(0, 60), `fr:${g.id}:${p.id ?? '@' + (p.username ?? '')}`).row()
    }
    kb.text(ts(session, 'b.typeUsername'), `fu:${g.id}`).row()
    kb.text(`${watch?.mode === 'all' ? '✅ ' : ''}${ts(session, 'b.everythingNotIn', { lang: myLang(session) })}`.slice(0, 60), `fm:${g.id}:all`).row()
    kb.text(`${watch?.mode === 'mentions' ? '✅ ' : ''}${ts(session, 'b.mentionsMe')}`.slice(0, 60), `fm:${g.id}:mentions`).row()
    if (watch) kb.text(ts(session, 'b.stopWatchingBtn'), `fx:${g.id}`).row()
    kb.text(ts(session, 'b.groupsBack'), 'fl')

    const lines = [watch ? describeWatch(watch, session) : ts(session, 'b.notWatchedYet', { title: g.title })]
    lines.push('', ts(session, 'b.tapPerson', { lang: myLang(session) }))
    if (!members.length) lines.push('', ts(session, 'b.noNames'))
    return { text: lines.join('\n'), kb }
  }

  async function showGroups(ctx: Context, session: Session, edit = false): Promise<unknown> {
    const groups = await groupsOf(session.telegramId!)
    if (!groups.length) {
      const text = ts(session, 'b.noGroups')
      return edit ? ctx.editMessageText(text) : ctx.reply(text)
    }
    const { text, kb } = groupPicker(session, groups)
    return edit ? ctx.editMessageText(text, { reply_markup: kb }) : ctx.reply(text, { reply_markup: kb })
  }

  /** Checks a button press: paired, and really a member of that group. */
  async function followCtx(ctx: Context, groupId: number): Promise<{ session: Session; g: KnownGroup } | undefined> {
    const session = ctx.from && findByTelegramId(ctx.from.id)
    const g = knownGroup(groupId)
    if (!session || !g) {
      await ctx.answerCallbackQuery({ text: session ? ts(session, 'b.botLeft') : tc(ctx, 'b.pairFirstShort') })
      return undefined
    }
    const m = await bot.api.getChatMember(groupId, session.telegramId!).catch(() => undefined)
    if (!m || m.status === 'left' || m.status === 'kicked' || (m.status === 'restricted' && !m.is_member)) {
      await ctx.answerCallbackQuery({ text: ts(session, 'b.notMember') })
      return undefined
    }
    return { session, g }
  }

  async function refreshMenu(ctx: Context, session: Session, g: KnownGroup, toast?: string): Promise<void> {
    const { text, kb } = groupMenu(session, g)
    await ctx.answerCallbackQuery(toast ? { text: toast } : undefined)
    await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {}) // "message is not modified" is fine
  }

  bot.command(['follow', 'unfollow'], async ctx => {
    if (ctx.chat.type !== 'private') {
      await ctx.deleteMessage().catch(() => {})
      const session = ctx.from && findByTelegramId(ctx.from.id)
      if (session?.chatId) await bot.api.sendMessage(session.chatId, ts(session, 'b.followHere')).catch(() => {})
      return
    }
    const session = ctx.from && findByTelegramId(ctx.from.id)
    if (!session) return ctx.reply(tc(ctx, 'b.pairFirstCode'))
    session.awaitingUsername = undefined
    await showGroups(ctx, session)
  })

  bot.callbackQuery('fl', async ctx => {
    const session = findByTelegramId(ctx.from.id)
    if (!session) return ctx.answerCallbackQuery({ text: tc(ctx, 'b.pairFirstShort') })
    await ctx.answerCallbackQuery()
    session.awaitingUsername = undefined
    await showGroups(ctx, session, true)
  })

  bot.callbackQuery(/^fg:(-?\d+)$/, async ctx => {
    const f = await followCtx(ctx, Number(ctx.match[1]))
    if (!f) return
    f.session.awaitingUsername = undefined
    await refreshMenu(ctx, f.session, f.g)
  })

  // Toggle following a member.
  bot.callbackQuery(/^fp:(-?\d+):(\d+)$/, async ctx => {
    const f = await followCtx(ctx, Number(ctx.match[1]))
    if (!f) return
    const { session, g } = f
    const m = g.members.find(x => x.id === Number(ctx.match[2]))
    if (!m) return ctx.answerCallbackQuery({ text: ts(session, 'b.personGone') })
    const person: WatchedPerson = { id: m.id, username: m.username, name: m.name }
    let watch = session.watchedGroups.get(g.id)
    const on = Boolean(watch && followedPerson(watch, { id: m.id, username: m.username } as Message['from']))
    if (on) {
      watch!.people = watch!.people.filter(p => !(p.id === m.id || (p.id === undefined && p.username && p.username === m.username)))
      if (watch!.mode === 'people' && !watch!.people.length) session.watchedGroups.delete(g.id)
    } else {
      watch ??= { mode: 'people', title: g.title, people: [] }
      watch.people.push(person)
      session.watchedGroups.set(g.id, watch)
    }
    persist()
    console.log(`[bot] /follow: glasses ${session.code} ${on ? 'unfollowed' : 'followed'} ${m.id} in ${g.id}`)
    await refreshMenu(ctx, session, g, ts(session, on ? 'b.stoppedFollowingName' : 'b.followingName', { name: m.name }))
  })

  // Remove someone followed by @username (or not in the recent list).
  bot.callbackQuery(/^fr:(-?\d+):(.+)$/, async ctx => {
    const f = await followCtx(ctx, Number(ctx.match[1]))
    if (!f) return
    const { session, g } = f
    const key = ctx.match[2]
    const watch = session.watchedGroups.get(g.id)
    if (watch) {
      watch.people = watch.people.filter(p => (key.startsWith('@') ? p.username !== key.slice(1) || p.id !== undefined : p.id !== Number(key)))
      if (watch.mode === 'people' && !watch.people.length) session.watchedGroups.delete(g.id)
      persist()
    }
    await refreshMenu(ctx, session, g, ts(session, 'b.stoppedFollowing'))
  })

  bot.callbackQuery(/^fm:(-?\d+):(all|mentions)$/, async ctx => {
    const f = await followCtx(ctx, Number(ctx.match[1]))
    if (!f) return
    const { session, g } = f
    const mode = ctx.match[2] as WatchMode
    const watch = session.watchedGroups.get(g.id)
    if (watch?.mode === mode) {
      // Tapping the active option turns it off (followed people stay).
      if (watch.people.length) watch.mode = 'people'
      else session.watchedGroups.delete(g.id)
    } else {
      session.watchedGroups.set(g.id, { mode, title: g.title, people: watch?.people ?? [] })
    }
    persist()
    await refreshMenu(ctx, session, g)
  })

  bot.callbackQuery(/^fx:(-?\d+)$/, async ctx => {
    const f = await followCtx(ctx, Number(ctx.match[1]))
    if (!f) return
    f.session.watchedGroups.delete(f.g.id)
    persist()
    await refreshMenu(ctx, f.session, f.g, ts(f.session, 'b.stoppedWatching', { title: f.g.title }))
  })

  bot.callbackQuery(/^fu:(-?\d+)$/, async ctx => {
    const f = await followCtx(ctx, Number(ctx.match[1]))
    if (!f) return
    f.session.awaitingUsername = f.g.id
    f.session.awaitingNotesUsername = undefined
    await ctx.answerCallbackQuery()
    await ctx.reply(ts(f.session, 'b.sendUsernameFollow', { title: f.g.title }))
  })

  /** Private chat: the @username(s) asked for by "Type an @username". Returns true when handled. */
  async function takeUsernames(ctx: Context, session: Session, text: string): Promise<boolean> {
    const groupId = session.awaitingUsername
    if (groupId === undefined) return false
    session.awaitingUsername = undefined
    const g = knownGroup(groupId)
    const handles = [...text.matchAll(/@?([A-Za-z][A-Za-z0-9_]{3,31})/g)].map(m => m[1].toLowerCase())
    if (!g || !handles.length) {
      await ctx.reply(ts(session, 'b.notUsername'))
      return true
    }
    const watch = session.watchedGroups.get(g.id) ?? { mode: 'people' as WatchMode, title: g.title, people: [] }
    for (const h of handles) {
      if (h === username.toLowerCase() || h === session.username) continue
      const member = g.members.find(m => m.username === h)
      const person: WatchedPerson = member ? { id: member.id, username: h, name: member.name } : { username: h, name: `@${h}` }
      if (!watch.people.some(p => samePerson(p, person))) watch.people.push(person)
    }
    if (watch.people.length || watch.mode !== 'people') session.watchedGroups.set(g.id, watch)
    persist()
    const { text: menu, kb } = groupMenu(session, g)
    await ctx.reply(menu, { reply_markup: kb })
    return true
  }

  // /watching: what is watched where.
  bot.command('watching', async ctx => {
    const session = ctx.from && findByTelegramId(ctx.from.id)
    if (!session) return ctx.reply(tc(ctx, 'b.pairFirstPrivate'))
    const text = session.watchedGroups.size ? watchList(session) : ts(session, 'b.notWatching')
    const kb = new InlineKeyboard()
    for (const [id, w] of session.watchedGroups) if (knownGroup(id)) kb.text(ts(session, 'b.manage', { title: w.title }).slice(0, 60), `fg:${id}`).row()
    if (ctx.chat.type === 'private' || !session.chatId) return ctx.reply(text, { reply_markup: kb })
    await ctx.deleteMessage().catch(() => {})
    await bot.api.sendMessage(session.chatId, text).catch(() => {})
  })

  // Telegram Business: the user connected LingoBot to (some of) their private chats.
  const connections = new Map<string, number>() // business connection id -> owner Telegram id
  async function ownerOf(connectionId: string): Promise<number | undefined> {
    const known = connections.get(connectionId)
    if (known) return known
    const c = await bot.api.getBusinessConnection(connectionId).catch(() => undefined) // e.g. after a restart
    if (!c?.is_enabled) return undefined
    connections.set(c.id, c.user.id)
    return c.user.id
  }

  bot.on('business_connection', async ctx => {
    const c = ctx.update.business_connection!
    if (!c.is_enabled) {
      connections.delete(c.id)
      return bot.api.sendMessage(c.user_chat_id, t(findByTelegramId(c.user.id)?.userLang, 'b.businessOff')).catch(() => {})
    }
    connections.set(c.id, c.user.id)
    const owner = findByTelegramId(c.user.id)
    const lang = owner?.userLang
    const lines = [t(lang, 'b.businessOn')]
    if (!c.rights?.can_reply) lines.push('', t(lang, 'b.businessReply'))
    if (!owner) lines.push('', t(lang, 'b.businessPair'))
    await bot.api.sendMessage(c.user_chat_id, lines.join('\n')).catch(() => {})
  })

  bot.on('business_message', async ctx => {
    const msg = ctx.update.business_message!
    const connectionId = msg.business_connection_id
    if (!connectionId) return
    const ownerId = await ownerOf(connectionId)
    if (!ownerId || msg.from?.id === ownerId) return // the user's own outgoing messages
    const session = findByTelegramId(ownerId)
    if (!session) return
    await pickUp(session, msg, {
      kind: 'business',
      connectionId,
      chatId: msg.chat.id,
      messageId: msg.message_id,
      name: fullName(msg.from) ?? 'Someone',
    })
  })

  /** A message in a watched chat: translate it and, if foreign, put it on the glasses. */
  async function pickUp(session: Session, msg: Message, target: ReplyTarget, onlyForeign = true): Promise<void> {
    try {
      const text = msg.text ?? msg.caption
      const audio = await audioOf(bot, msg)
      if (!audio && !text) {
        const voice = msg.voice ?? msg.audio
        if (voice && !onlyForeign && session.chatId) {
          await bot.api.sendMessage(session.chatId, ts(session, 'b.voiceTooLongNamed', { name: target.name, max: config.maxVoiceSeconds }))
        }
        return
      }
      const result = await handleIncoming(session, { from: target.name, text, audio, target, onlyForeign })
      console.log(
        `[bot] ${target.kind} message for glasses ${session.code}: ` +
          (result.ok ? `on glasses (${result.item.srcLang})` : result.sameLanguage ? 'same language, ignored' : `skipped (${result.reason})`),
      )
      if (!session.chatId) return
      if (!result.ok) {
        if (!result.sameLanguage) await bot.api.sendMessage(session.chatId, ts(session, 'b.skipped', { name: target.name, reason: result.reason }))
        return
      }
      if (!result.onGlasses) {
        const { item } = result
        await bot.api.sendMessage(
          session.chatId,
          ts(session, 'b.offlineFrom', { from: item.from, src: item.srcLangLabel ?? item.srcLang, dst: myLang(session), text: item.translation }),
        )
      }
    } catch (err) {
      console.error('[bot] watched message failed:', (err as Error).message)
    }
  }

  // Forwarded (or typed) messages and voice notes in the private chat; mentions/replies in groups.
  bot.on('message', async ctx => {
    if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
      const msg = ctx.message
      // Telegram upgraded the group to a supergroup: it now has a new chat id.
      if (msg.migrate_to_chat_id) {
        migrateKnownGroup(ctx.chat.id, msg.migrate_to_chat_id)
        return migrateGroup(ctx.chat.id, msg.migrate_to_chat_id)
      }
      // Remember the group and who is active in it, for /follow in the private chat.
      if (msg.from) noteMember(ctx.chat.id, ctx.chat.title, msg.from)
      for (const u of msg.new_chat_members ?? []) noteMember(ctx.chat.id, ctx.chat.title, u)
      if (msg.from?.id === me.id) return // our own posts (signed replies) are never picked up again
      if (msg.text?.startsWith('/')) return // commands
      for (const session of sessionsWatching(ctx.chat.id)) {
        if (!session.telegramId || msg.from?.id === session.telegramId) continue
        const watch = session.watchedGroups.get(ctx.chat.id)
        if (!watch) continue
        // A followed person: everything they post, in any language (voice notes are transcribed).
        const followed = followedPerson(watch, msg.from)
        const byMode = watch.mode === 'all' || (watch.mode === 'mentions' && isForUser(msg, session))
        if (!followed && !byMode) continue
        if (followed && !followed.id && msg.from) {
          followed.id = msg.from.id // matched by @username: remember the id, usernames can change
          persist()
        }
        await pickUp(
          session,
          msg,
          {
            kind: 'group',
            chatId: ctx.chat.id,
            messageId: msg.message_id,
            name: fullName(msg.from) ?? 'Someone',
            title: ctx.chat.title,
          },
          !followed,
        )
      }
      return
    }
    if (ctx.chat.type !== 'private') return
    const msg = ctx.message
    if (msg.text?.startsWith('/')) return
    const session = findByTelegramId(ctx.from.id)
    if (!session) return ctx.reply(tc(ctx, 'b.notPairedYet'))
    if (msg.text && !msg.forward_origin && session.awaitingNotesUsername) {
      session.awaitingNotesUsername = undefined
      const handle = /@?([A-Za-z][A-Za-z0-9_]{4,31})/.exec(msg.text)?.[1]
      if (!handle) return ctx.reply(ts(session, 'b.notUsernameNotes'))
      return chooseNotesPerson(ctx, session, handle)
    }
    if (msg.text && !msg.forward_origin && (await takeUsernames(ctx, session, msg.text))) return

    const voice = msg.voice ?? msg.audio
    const text = msg.text ?? msg.caption
    if (!voice && !text) return ctx.reply(ts(session, 'b.forwardSomething'))

    await ctx.replyWithChatAction('typing')
    if (voice && voice.duration > config.maxVoiceSeconds) {
      return ctx.reply(ts(session, 's.voiceTooLong', { max: config.maxVoiceSeconds }))
    }
    const audio = await audioOf(bot, msg)

    const result = await handleIncoming(session, { from: senderName(msg), text, audio })
    if (!result.ok) return ctx.reply(result.reason)
    const { item, onGlasses } = result
    // Short confirmation in chat; also a text fallback if the glasses are offline.
    await ctx.reply(
      `${ts(session, onGlasses ? 'b.onGlasses' : 'b.offline')}\n` +
        `${ts(session, 'b.route', { from: item.from, src: item.srcLangLabel ?? item.srcLang, dst: myLang(session) })}\n${item.translation}`,
      { reply_parameters: { message_id: msg.message_id } },
    )
  })

  // The bot was added to / removed from a group.
  bot.on('my_chat_member', ctx => {
    const chat = ctx.chat
    if (chat.type !== 'group' && chat.type !== 'supergroup') return
    const status = ctx.myChatMember.new_chat_member.status
    if (status === 'left' || status === 'kicked') {
      forgetGroup(chat.id)
      for (const s of allSessionsWithNotesIn(chat.id)) {
        s.notesChat = undefined
        pushState(s)
      }
      persist()
    } else noteGroup(chat.id, chat.title)
    console.log(`[bot] ${status === 'left' || status === 'kicked' ? 'removed from' : 'added to'} group ${chat.id} (${chat.title})`)
  })

  // The "/" command menu. Private chat only: nothing is suggested inside groups, so following stays private.
  await bot.api
    .setMyCommands(commandList(), { scope: { type: 'all_private_chats' } })
    .catch(err => console.error('[bot] could not set the command menu:', err.message))
  await bot.api.deleteMyCommands({ scope: { type: 'all_group_chats' } }).catch(() => {})

  bot.catch(err => console.error('[bot]', err.error))

  console.log(`Telegram bot @${username} running (long polling).`)
  void bot.start({
    allowed_updates: ['message', 'callback_query', 'inline_query', 'business_connection', 'business_message', 'my_chat_member'],
  })
}

/** People named in a /watch command: the author of the replied-to message, tap-mentions and @usernames. */
export function peopleIn(msg: Message, skipIds: (number | undefined)[], skipNames: (string | undefined)[]): WatchedPerson[] {
  const found: WatchedPerson[] = []
  const add = (p: WatchedPerson) => {
    if (p.id !== undefined && skipIds.includes(p.id)) return
    if (p.username && skipNames.includes(p.username)) return
    if (!found.some(f => samePerson(f, p))) found.push(p)
  }
  const replied = msg.reply_to_message?.from
  if (replied && !replied.is_bot) {
    add({ id: replied.id, username: replied.username?.toLowerCase(), name: fullName(replied) ?? 'Someone' })
  }
  const text = msg.text ?? ''
  for (const e of msg.entities ?? []) {
    if (e.type === 'text_mention') add({ id: e.user.id, username: e.user.username?.toLowerCase(), name: fullName(e.user) ?? 'Someone' })
    if (e.type === 'mention') {
      const handle = text.slice(e.offset + 1, e.offset + e.length)
      add({ username: handle.toLowerCase(), name: `@${handle}` })
    }
  }
  return found
}

function samePerson(a: WatchedPerson, b: WatchedPerson): boolean {
  if (a.id !== undefined && b.id !== undefined) return a.id === b.id
  return Boolean(a.username && a.username === b.username)
}

/** The followed person who sent this message, if any. */
export function followedPerson(watch: GroupWatch, from?: Message['from']): WatchedPerson | undefined {
  if (!from) return undefined
  const username = from.username?.toLowerCase()
  return watch.people.find(p => (p.id !== undefined ? p.id === from.id : Boolean(username && p.username === username)))
}

function names(people: WatchedPerson[]): string {
  return people.map(p => p.name).join(', ')
}

function describeWatch(watch: GroupWatch, session: Session): string {
  const lang = myLang(session)
  const base = ts(session, watch.mode === 'all' ? 'b.descAll' : watch.mode === 'mentions' ? 'b.descMentions' : 'b.descPeople', { lang })
  const people = watch.people.length ? `\n${ts(session, 'b.descFollowing', { names: names(watch.people) })}` : ''
  return `${watch.title}: ${base}.${people}`
}

function watchList(session: Session): string {
  const lines = [ts(session, 'b.watchedGroups')]
  for (const watch of session.watchedGroups.values()) lines.push('', `• ${describeWatch(watch, session)}`)
  lines.push('', ts(session, 'b.changePrivately'))
  return lines.join('\n')
}

/** UI text in this user's language. */
function ts(session: Session | undefined, key: Key, vars?: Vars): string {
  return t(session?.userLang, key, vars)
}

/** UI text in the language of whoever sent this update (English when not paired). */
function tc(ctx: Context, key: Key, vars?: Vars): string {
  return t(ctx.from ? findByTelegramId(ctx.from.id)?.userLang : undefined, key, vars)
}

/** The user's language, named in itself ("Français"). */
function myLang(session: Session): string {
  return langLabel(session.userLang, session.userLang)
}

function commandList(lang?: string) {
  return [
    { command: 'follow', description: t(lang, 'b.cmdFollow') },
    { command: 'watching', description: t(lang, 'b.cmdWatching') },
    { command: 'notes', description: t(lang, 'b.cmdNotes') },
    { command: 'lang', description: t(lang, 'b.cmdLang') },
    { command: 'help', description: t(lang, 'b.cmdHelp') },
    { command: 'disconnect', description: t(lang, 'b.cmdDisconnect') },
  ]
}

/** True if a group message mentions the user or replies to one of their messages. */
function isForUser(msg: Message, session: Session): boolean {
  if (msg.reply_to_message?.from?.id === session.telegramId) return true
  const text = msg.text ?? msg.caption ?? ''
  const entities = msg.entities ?? msg.caption_entities ?? []
  return entities.some(e => {
    if (e.type === 'text_mention') return e.user.id === session.telegramId
    if (e.type === 'mention' && session.username) {
      return text.slice(e.offset + 1, e.offset + e.length).toLowerCase() === session.username
    }
    return false
  })
}

function fullName(user?: { first_name: string; last_name?: string }): string | undefined {
  return user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : undefined
}

/** Downloads a voice note / audio file if the message has one (within the length limit). */
async function audioOf(bot: Bot, msg: Message) {
  const voice = msg.voice ?? msg.audio
  if (!voice || voice.duration > config.maxVoiceSeconds) return undefined
  return {
    data: await downloadFile(bot, voice.file_id),
    filename: msg.voice ? 'voice.ogg' : 'audio.mp3',
    mimeType: voice.mime_type ?? 'audio/ogg',
    durationSec: voice.duration,
  }
}

/** Name of the original sender of a forwarded message. */
function senderName(msg: Message): string {
  const origin = msg.forward_origin
  if (!origin) return msg.from?.first_name ?? 'You'
  switch (origin.type) {
    case 'user':
      return [origin.sender_user.first_name, origin.sender_user.last_name].filter(Boolean).join(' ')
    case 'hidden_user':
      return origin.sender_user_name
    case 'chat':
      return origin.sender_chat.title ?? 'Group'
    case 'channel':
      return origin.chat.title ?? 'Channel'
  }
}

async function downloadFile(bot: Bot, fileId: string): Promise<Buffer> {
  const file = await bot.api.getFile(fileId)
  if (!file.file_path) throw new Error('Telegram did not return the file.')
  const url = `https://api.telegram.org/file/bot${config.telegramToken}/${file.file_path}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not download the voice note (${res.status}).`)
  return Buffer.from(await res.arrayBuffer())
}

/** Telegram captions are limited to 1024 characters. */
function clipCaption(text: string): string {
  return text.length <= 1024 ? text : text.slice(0, 1023) + '…'
}

function helpText(ctx: Context): string {
  return tc(ctx, 'b.help', { bot: ctx.me.username })
}
