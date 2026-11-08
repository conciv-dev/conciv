import {createRenderEffect, createSignal, onMount, Show, type Accessor, type JSX} from 'solid-js'
import {Portal} from 'solid-js/web'
import {makeEventListener} from '@solid-primitives/event-listener'
import type {z} from 'zod'
import {getExtensionApi} from '@conciv/extension'
import {EnvironmentProvider} from '@conciv/ui-kit-system'
import {designConfig} from '../shared/tolerances.js'
import type {createXrayData} from './data.js'

export function XrayOverlay(props: {
  on: Accessor<boolean>
  toggle: () => void
  data: ReturnType<typeof createXrayData>
  capture: () => Promise<boolean>
}): JSX.Element {
  const host = getExtensionApi(DESIGN_EXTENSION_NAME)
  const {YieldFocus} = host
  const scheme = host.useColorScheme()
  const styles = host.useStyles()
  const [element, setElement] = createSignal<HTMLDivElement>()
  const rootNode = (): ShadowRoot | Document => element()?.shadowRoot ?? document
  makeEventListener(document, 'keydown', (event) => {
    if (event.key !== ESCAPE || !props.on()) return
    event.preventDefault()
    props.toggle()
  })
  createRenderEffect(() => {
    const shown = element()
    if (shown === undefined) return
    prepareHost(shown)
    if (shown.shadowRoot !== null) shown.shadowRoot.adoptedStyleSheets = styles()
    shown.hidden = !props.on()
    shown.classList.toggle('dark', scheme() === 'dark')
    shown.classList.toggle('light', scheme() !== 'dark')
  })
  return (
    <>
      <Show when={props.data.hotkeys()}>{(keys) => <Hotkeys keys={keys()} toggle={props.toggle} />}</Show>
      <YieldFocus when={props.on()}>
        <Portal mount={document.body} useShadow ref={setElement}>
          <EnvironmentProvider value={rootNode}>
            <div class="chat-density text-chat-text font-chat antialiased">
              <section
                aria-label="Design x-ray"
                class="p-3 border-e border-chat-line bg-chat-glass pointer-events-auto shadow-chat-lg start-0 inset-y-0 fixed"
              >
                <p class="text-sm text-chat-text-2 m-0">No design registered</p>
              </section>
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

function Hotkeys(props: {keys: Keys; toggle: () => void}): JSX.Element {
  const hotkeys = getExtensionApi(DESIGN_EXTENSION_NAME).useHotkeys()
  onMount(() => {
    hotkeys.register({binding: props.keys.overlay, label: 'Design x-ray', handler: props.toggle})
  })
  return null
}
