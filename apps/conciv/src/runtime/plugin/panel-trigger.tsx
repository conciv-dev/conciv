import {createMemo, untrack} from 'solid-js'
import type {JSX} from 'solid-js'
import type {MountedSession, PanelTab} from '@conciv/plugin/experimental'
import {Contribution} from './render'

export function PanelTrigger(props: {
  value: string
  plugin: string
  tab: PanelTab
  session: MountedSession
  active: boolean
  preview: boolean
}): JSX.Element {
  const state = {
    get active() {
      return props.active
    },
    get preview() {
      return props.preview
    },
    get session() {
      return props.session
    },
  }

  const label = createMemo(() => props.tab.label)

  const rendered = createMemo(() => {
    const render = label()

    if (!render) return

    return <Contribution plugin={props.plugin}>{() => untrack(() => render(state))}</Contribution>
  })

  const content = () => rendered() ?? props.tab.title

  return <>{content()}</>
}
