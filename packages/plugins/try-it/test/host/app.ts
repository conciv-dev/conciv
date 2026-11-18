import {createConciv, type PluginEntry} from '@conciv/embed'
import {compose} from '@conciv/plugin/experimental/host'
import type {Plugin} from '@conciv/plugin/experimental'
import tryIt from '../../src/index.js'

const search = new URLSearchParams(window.location.search)
const token = search.get('token') ?? ''

const holdMs = Number(search.get('holdMs') ?? '300')
const setup: Plugin.Setup<typeof tryIt> = (ctx) => tryIt.setup?.(ctx)
const plugins = compose({'try-it': {windowEntry: async () => ({default: setup})}}).map((entry): PluginEntry => [
  entry,
  {token, probeMs: 100, holdMs},
])

const handle = createConciv({plugins, settings: {defaultOpen: true}})
const widget = document.createElement('div')
document.body.appendChild(widget)

const unmount = document.createElement('button')
unmount.type = 'button'
unmount.textContent = 'Unmount widget'
unmount.addEventListener('click', () => handle.unmount())
document.body.appendChild(unmount)

void handle.mount(widget)
