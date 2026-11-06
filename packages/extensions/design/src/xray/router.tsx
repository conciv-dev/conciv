import {createSignal, type JSX} from 'solid-js'
import {Portal} from 'solid-js/web'
import {EnvironmentProvider, TooltipIconButton} from '@conciv/ui-kit-system'
import {designConfig} from '../shared/tolerances.js'
import {Rounds} from './rounds.js'

export function XrayPane(props: PaneProps): JSX.Element {
  const held: {host?: HTMLDivElement} = {}
  const [styled, setStyled] = createSignal(false)
  return (
    <Portal
      useShadow
      ref={(element: HTMLDivElement) => {
        held.host = element
        element.setAttribute(designConfig.attributes.pane, '')
        element.style.setProperty('position', 'relative')
        element.style.setProperty('z-index', PANE_LAYER)
      }}
    >
      <link
        rel="stylesheet"
        href={`${props.apiBase}/api/ext/${DESIGN_EXTENSION_NAME}/xray/${STYLESHEET}`}
        onLoad={() => setStyled(true)}
        onError={() => setStyled(true)}
      />
      <EnvironmentProvider value={() => held.host?.shadowRoot ?? document}>
        <div
          class={`color-base font-sans antialiased ${props.dark ? 'dark' : ''}`}
          style={{visibility: styled() && !props.hidden ? 'visible' : 'hidden'}}
        >
          <aside
            aria-label="Design x-ray"
            class="overscroll-contain border-s border-base bg-base flex flex-col w-[min(40rem,100vw)] shadow-xl end-0 inset-y-0 fixed overflow-y-auto"
          >
            <header class="px-4 pt-3 flex gap-2 items-center justify-between">
              <h2 class="text-sm font-medium m-0">Design x-ray</h2>
              <TooltipIconButton tooltip="Close" class="btn-icon-compact" onClick={() => props.onClose()}>
                <span class="i-ph-x" aria-hidden="true" />
              </TooltipIconButton>
            </header>
            <Rounds apiBase={props.apiBase} session={props.session} />
          </aside>
        </div>
      </EnvironmentProvider>
    </Portal>
  )
}

type PaneProps = {
  apiBase: string
  session: string | null
  dark: boolean
  hidden: boolean
  onClose: () => void
}

const DESIGN_EXTENSION_NAME = 'design'

const STYLESHEET = 'assets/index.css'

const PANE_LAYER = '2147482999'
