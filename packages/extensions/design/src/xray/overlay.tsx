import {createRenderEffect, createSignal, onMount, Show, type JSX} from 'solid-js'
import {Portal} from 'solid-js/web'
import {makeEventListener} from '@solid-primitives/event-listener'
import type {z} from 'zod'
import {getExtensionApi} from '@conciv/extension'
import {EnvironmentProvider} from '@conciv/ui-kit-system'
import {designConfig} from '../shared/tolerances.js'
import type {createXrayData} from './data.js'
import type {createXrayView} from './view.js'
import type {createXrayState} from './state.js'
import {Rail} from './rail.js'
import {Column} from './column.js'

export function XrayOverlay(props: {
  xray: ReturnType<typeof createXrayState>
  data: ReturnType<typeof createXrayData>
  view: ReturnType<typeof createXrayView>
  capture: () => Promise<boolean>
}): JSX.Element {
  const host = getExtensionApi(DESIGN_EXTENSION_NAME)
  const {YieldFocus} = host
  const scheme = host.useColorScheme()
  const styles = host.useStyles()
  const [element, setElement] = createSignal<HTMLDivElement>()
  const rootNode = (): ShadowRoot | Document => element()?.shadowRoot ?? document
  makeEventListener(document, 'keydown', (event) => {
    if (event.key === ESCAPE && props.xray.escape()) event.preventDefault()
  })
  createRenderEffect(() => {
    const shown = element()
    if (shown === undefined) return
    prepareHost(shown)
    if (shown.shadowRoot !== null) shown.shadowRoot.adoptedStyleSheets = styles()
    shown.hidden = !props.xray.state.on
    shown.style.setProperty('display', props.xray.state.on ? 'block' : 'none')
    shown.classList.toggle('dark', scheme() === 'dark')
    shown.classList.toggle('light', scheme() !== 'dark')
  })
  return (
    <>
      <Show when={props.data.hotkeys()}>{(keys) => <Hotkeys keys={keys()} xray={props.xray} />}</Show>
      <YieldFocus when={props.xray.state.on}>
        <Portal mount={document.body} useShadow ref={setElement}>
          <EnvironmentProvider value={rootNode}>
            <div class="chat-density text-chat-text font-chat antialiased">
              <nav
                aria-label="Design x-ray"
                class="border-e border-chat-line bg-chat-glass flex pointer-events-auto shadow-chat-lg start-0 inset-y-0 fixed"
              >
                <Rail xray={props.xray} keys={props.data.hotkeys()} />
                <Show when={props.xray.state.column}>
                  <Column xray={props.xray} data={props.data} view={props.view} capture={props.capture} />
                </Show>
              </nav>
            </div>
          </EnvironmentProvider>
        </Portal>
      </YieldFocus>
    </>
  )
}

const DESIGN_EXTENSION_NAME = 'design'

type Keys = z.output<typeof designConfig>['hotkeys']

const ESCAPE = 'Escape'

const OVERLAY_LAYER = '2147482999'

const HUES = {
  much: 'var(--chat-danger)',
  noticeably: 'var(--chat-warn)',
  slightly: 'color-mix(in oklch, var(--chat-warn) 45%, var(--chat-dim))',
  reflow: 'var(--chat-agent)',
  paint: 'color-mix(in oklch, var(--chat-danger) 50%, var(--chat-accent))',
  matched: 'var(--chat-success)',
}

function prepareHost(host: HTMLDivElement): void {
  host.setAttribute(designConfig.attributes.overlay, '')
  host.style.setProperty('position', 'absolute')
  host.style.setProperty('inset', '0')
  host.style.setProperty('pointer-events', 'none')
  host.style.setProperty('z-index', OVERLAY_LAYER)
  Object.entries(HUES).forEach(([name, value]) => host.style.setProperty(`--xray-${name}`, value))
}

function Hotkeys(props: {keys: Keys; xray: ReturnType<typeof createXrayState>}): JSX.Element {
  const hotkeys = getExtensionApi(DESIGN_EXTENSION_NAME).useHotkeys()
  onMount(() => {
    hotkeys.register({binding: props.keys.overlay, label: 'Design x-ray', handler: props.xray.toggleOn})
    hotkeys.register({binding: props.keys.pick, label: 'Design x-ray pick', handler: props.xray.togglePick})
  })
  return null
}
