import {picking} from '../page/react-grab/picking.js'
import {anyHiding, anyOpen} from './dialogs.js'

export const suppressedAttr = (): '' | undefined => (picking() || anyHiding() ? '' : undefined)

export const focusTrapDisabled = (panelOpen: boolean): boolean => !panelOpen || picking() || anyOpen()
