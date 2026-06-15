import {Crosshair} from 'lucide-solid'
import {getReactGrabAdapter} from './adapter.js'
import type {ComposerActionDef} from '../widget-shell.js'

// The first composer action: enter react-grab selection mode and route the grabbed element's
// context into the composer that started the pick (ctx.insert). The sink is bound per-activation,
// so with multiple composers mounted the reference lands in the right one.
export const elementPickerAction: ComposerActionDef = {
  id: 'pick-element',
  label: 'Select an element from the page',
  icon: Crosshair,
  onClick: async (ctx) => {
    ctx.setBusy(true)
    try {
      const adapter = await getReactGrabAdapter()
      adapter.activate(ctx.insert)
    } finally {
      ctx.setBusy(false)
    }
  },
}
