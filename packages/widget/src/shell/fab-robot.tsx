import {onMount, onCleanup, createEffect} from 'solid-js'
import {createFabRobotRig, type FabRobotRig} from '@conciv/mascot'

export function FabRobot(props: {open: () => boolean; working: () => boolean}) {
  let headEl: HTMLSpanElement | undefined
  let eyesEl: HTMLSpanElement | undefined
  let antEl: HTMLSpanElement | undefined
  let rig: FabRobotRig | undefined

  onMount(() => {
    if (!headEl || !eyesEl || !antEl) return
    rig = createFabRobotRig({head: headEl, eyes: eyesEl, antenna: antEl})
    createEffect(() => {
      rig?.apply(props.working() ? 'work' : props.open() ? 'open' : 'closed')
    })
  })
  onCleanup(() => rig?.destroy())

  return (
    <span class="pw-fab-rig" data-working={props.working()} aria-hidden="true">
      <span class="pw-rig-layer pw-rig-head" ref={(el) => (headEl = el)} />
      <span class="pw-rig-layer pw-rig-antenna" ref={(el) => (antEl = el)} />
      <span class="pw-rig-layer pw-rig-eyes" ref={(el) => (eyesEl = el)} />
    </span>
  )
}
