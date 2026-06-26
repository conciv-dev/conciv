import {Crosshair} from 'lucide-solid'
import {getReactGrabAdapter} from './adapter.js'
import type {ComposerActionDef} from '../../shell/widget-shell.js'

// The first composer action: enter react-grab selection mode and route the grabbed element into the
// composer that started the pick. stageGrab inserts the text context and shows the preview chip as
// one unit (so removing the chip strips exactly that text). The sink is bound per-activation, so
// with multiple composers mounted the reference lands in the right one.
export const elementPickerAction: ComposerActionDef = {
  id: 'pick-element',
  label: 'Select an element from the page',
  icon: Crosshair,
  onClick: async (ctx) => {
    ctx.setBusy(true)
    try {
      const adapter = await getReactGrabAdapter()
      adapter.activate((grab) => ctx.stageGrab(grab))
    } finally {
      ctx.setBusy(false)
    }
  },
}
