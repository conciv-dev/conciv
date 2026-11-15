import {Splitter as Ark} from '@ark-ui/solid/splitter'
import {nativeFocusPart} from './native-focus.js'

export const Splitter = Object.assign({}, Ark, {ResizeTrigger: nativeFocusPart(Ark.ResizeTrigger, 'button')})
