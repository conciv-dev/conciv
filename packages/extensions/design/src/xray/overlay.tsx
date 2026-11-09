import {createRenderEffect, createSignal, onMount, Show, type Accessor, type JSX} from 'solid-js'
import {Portal} from 'solid-js/web'
import Box from 'lucide-solid/icons/box'
import MousePointerClick from 'lucide-solid/icons/mouse-pointer-click'
import PanelLeft from 'lucide-solid/icons/panel-left'
import Power from 'lucide-solid/icons/power'
import type {LucideProps} from 'lucide-solid'
import type {Component} from 'solid-js'
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
            <div class="chat-density text-chat-text font-chat antialiased" data-conciv-key="HxvEWg">
              <nav
                aria-label="Design x-ray rail"
                class="px-1 py-3 border border-chat-line bg-chat-glass flex flex-col gap-2 w-14 pointer-events-auto items-center start-0 inset-y-0 fixed"
                data-conciv-key="g9eiGQ"
              >
                <RailButton label="X-ray" active icon={Power} />
                <RailButton label="Pick" icon={MousePointerClick} />
                <RailButton label="Stack" icon={Box} />
                <div class="grow w-8" data-conciv-key="Ia9KqA" />
                <RailButton label="Panel" icon={PanelLeft} />
              </nav>
              <Show when={props.data.shownRound() === null}>
                <section
                  aria-label="Design x-ray"
                  class="px-3.5 py-3 border border-chat-line rounded-chat-surface-md bg-chat-glass flex flex-col gap-1 w-75 pointer-events-auto start-17 top-3 fixed"
                  data-conciv-key="Hq4lFA"
                >
                  <p class="text-sm text-chat-text-hi font-semibold m-0" data-conciv-key="6fEONQ">
                    No design registered
                  </p>
                  <p class="text-[length:var(--chat-text-md)] text-chat-text-2 m-0" data-conciv-key="Y3iA1g">
                    Ask the agent to call design_get with the Figma link. The rail stays until a round exists.
                  </p>
                </section>
              </Show>
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

function RailButton(props: {label: string; icon: Component<LucideProps>; active?: boolean}): JSX.Element {
  return (
    <button
      type="button"
      class={`px-1 pb-1 pt-1.5 border-0 rounded-chat-surface-sm flex flex-col gap-0.5 w-12 cursor-pointer items-center ${props.active ? 'bg-chat-fill-strong text-chat-accent' : 'bg-transparent text-chat-text-3'}`}
      data-conciv-key="_04rZQ"
    >
      <span class="size-5 block" data-conciv-key="Mj0Whg">
        <props.icon class="size-full block" aria-hidden="true" />
      </span>
      <span
        class={`text-[length:var(--chat-text-xs)] leading-none ${props.active ? 'font-semibold' : 'font-normal'}`}
        data-conciv-key="P-ZisQ"
      >
        {props.label}
      </span>
    </button>
  )
}
