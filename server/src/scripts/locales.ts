// Translates the UI text (src/i18n/en.ts) into the /lang menu languages, or the ones given, and saves
// them in locales/. Only strings whose English changed are translated again. The server does the same
// on demand for any other language, so running this is optional; it just makes the first switch instant.
//   npm run locales            menu languages the G2 can display
//   npm run locales -- Italian Japanese
import { DEFAULT_LANG, ensureCatalog, isDisplayable, MENU_LANGUAGES } from '../i18n/index.js'

const wanted = process.argv.slice(2)
const langs = (wanted.length ? wanted : MENU_LANGUAGES).filter(l => l !== DEFAULT_LANG && isDisplayable(l))
const results = await Promise.all(langs.map(async l => [l, await ensureCatalog(l)] as const))
for (const [lang, ok] of results) console.log(`${ok ? 'ok  ' : 'FAIL'} ${lang}${ok ? '' : ' (uses characters the G2 cannot draw)'}`)
