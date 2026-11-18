import {createConciv, type PluginEntry} from '@conciv/embed'
import {compose} from '@conciv/plugin/experimental/host'
import tryIt from '../../src/index.js'

const search = new URLSearchParams(window.location.search)
const token = search.get('token') ?? ''

const plugins = compose({'try-it': {windowEntry: async () => ({default: (ctx: never) => tryIt.setup?.(ctx)})}}).map(
  (entry): PluginEntry => [entry, {token, probeMs: 100, holdMs: 2_000}],
)

const handle = createConciv({plugins, settings: {defaultOpen: true}})
const widget = document.createElement('div')
document.body.appendChild(widget)

const unmount = document.createElement('button')
unmount.type = 'button'
unmount.textContent = 'Unmount widget'
unmount.addEventListener('click', () => handle.unmount())
document.body.appendChild(unmount)

void handle.mount(widget)
