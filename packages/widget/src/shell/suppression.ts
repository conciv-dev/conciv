import {picking} from '../page/react-grab/picking.js'
import {anyOpen} from './dialogs.js'

export const suppressedAttr = (): '' | undefined => (picking() || anyOpen() ? '' : undefined)
