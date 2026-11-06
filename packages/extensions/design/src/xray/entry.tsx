import '@unocss/reset/tailwind.css'
import '@conciv/ui-kit-system/tokens.css'
import 'virtual:uno.css'
import './xray.css'
import {render} from 'solid-js/web'
import {Rounds} from './rounds.js'

const mount = document.querySelector('[data-design-xray]')
const page = new URL(window.location.href)
const at = page.pathname.indexOf('/api/ext/')
const apiBase = at === -1 ? page.origin : `${page.origin}${page.pathname.slice(0, at)}`

if (mount !== null) render(() => <Rounds apiBase={apiBase} session={page.searchParams.get('session')} />, mount)
