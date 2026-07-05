import {Crosshair} from 'lucide-solid'
import {getReactGrabAdapter} from './adapter.js'
import type {ComposerActionDef} from '../../shell/shell-contract.js'

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
