import {picking} from '../page/react-grab/picking.js'
import {anyOpen} from './dialogs.js'

const suppressionActive = (): boolean => picking() || anyOpen()

export const suppressedAttr = (): '' | undefined => (suppressionActive() ? '' : undefined)

export const focusTrapDisabled = (panelOpen: boolean): boolean => !panelOpen || suppressionActive()
